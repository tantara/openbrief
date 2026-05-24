use crate::credentials::{read_provider_api_key_for_app, ProviderKind};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Runtime};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRequestPlan {
    provider: ProviderKind,
    endpoint: String,
    method: String,
    body: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHttpResponse {
    status: u16,
    body: Value,
}

#[tauri::command]
pub async fn complete_provider_request<R: Runtime>(
    app: AppHandle<R>,
    request_plan: ProviderRequestPlan,
) -> Result<ProviderHttpResponse, String> {
    validate_provider_request_plan(&request_plan)?;
    let api_key = read_provider_api_key_for_app(&app, request_plan.provider)?
        .ok_or_else(|| "provider_api_key_missing".to_string())?;

    let client = reqwest::Client::new();
    let response = client
        .post(&request_plan.endpoint)
        .headers(provider_headers(request_plan.provider, &api_key)?)
        .json(&request_plan.body)
        .send()
        .await
        .map_err(|error| format!("provider_request_failed:{error}"))?;
    let status = response.status().as_u16();
    let body_text = response
        .text()
        .await
        .map_err(|error| format!("provider_response_read_failed:{error}"))?;
    let body = parse_provider_body(&body_text);

    Ok(ProviderHttpResponse { status, body })
}

fn validate_provider_request_plan(request_plan: &ProviderRequestPlan) -> Result<(), String> {
    if request_plan.method != "POST" {
        return Err("provider_method_not_allowed".to_string());
    }

    if !is_allowed_provider_endpoint(request_plan.provider, &request_plan.endpoint) {
        return Err("provider_endpoint_not_allowed".to_string());
    }

    Ok(())
}

fn is_allowed_provider_endpoint(provider: ProviderKind, endpoint: &str) -> bool {
    match provider {
        ProviderKind::Openai => endpoint == "https://api.openai.com/v1/chat/completions",
        ProviderKind::Anthropic => endpoint == "https://api.anthropic.com/v1/messages",
        ProviderKind::Openrouter => endpoint == "https://openrouter.ai/api/v1/chat/completions",
        ProviderKind::Gemini => {
            endpoint.starts_with("https://generativelanguage.googleapis.com/v1beta/models/")
                && endpoint.ends_with(":generateContent")
                && !endpoint.contains([' ', '\n', '\r', '\t'])
        }
    }
}

fn provider_headers(provider: ProviderKind, api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    match provider {
        ProviderKind::Openai => {
            headers.insert(
                "authorization",
                bearer_header_value(api_key, "provider_authorization_header_invalid")?,
            );
        }
        ProviderKind::Openrouter => {
            headers.insert(
                "authorization",
                bearer_header_value(api_key, "provider_authorization_header_invalid")?,
            );
            headers.insert(
                "http-referer",
                HeaderValue::from_static("https://openbrief.app"),
            );
            headers.insert("x-title", HeaderValue::from_static("OpenBrief"));
        }
        ProviderKind::Anthropic => {
            headers.insert(
                "x-api-key",
                HeaderValue::from_str(api_key)
                    .map_err(|_| "provider_api_key_header_invalid".to_string())?,
            );
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
        }
        ProviderKind::Gemini => {
            headers.insert(
                "x-goog-api-key",
                HeaderValue::from_str(api_key)
                    .map_err(|_| "provider_api_key_header_invalid".to_string())?,
            );
        }
    }

    Ok(headers)
}

fn bearer_header_value(api_key: &str, error_code: &str) -> Result<HeaderValue, String> {
    HeaderValue::from_str(&format!("Bearer {api_key}")).map_err(|_| error_code.to_string())
}

fn parse_provider_body(body_text: &str) -> Value {
    if body_text.trim().is_empty() {
        return Value::Null;
    }

    serde_json::from_str(body_text).unwrap_or_else(|_| Value::String(body_text.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_only_known_provider_completion_endpoints() {
        assert!(is_allowed_provider_endpoint(
            ProviderKind::Openai,
            "https://api.openai.com/v1/chat/completions"
        ));
        assert!(is_allowed_provider_endpoint(
            ProviderKind::Anthropic,
            "https://api.anthropic.com/v1/messages"
        ));
        assert!(is_allowed_provider_endpoint(
            ProviderKind::Openrouter,
            "https://openrouter.ai/api/v1/chat/completions"
        ));
        assert!(is_allowed_provider_endpoint(
            ProviderKind::Gemini,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent"
        ));
        assert!(!is_allowed_provider_endpoint(
            ProviderKind::Openai,
            "https://example.com/v1/chat/completions"
        ));
        assert!(!is_allowed_provider_endpoint(
            ProviderKind::Gemini,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent"
        ));
    }

    #[test]
    fn validates_post_only_request_plans() {
        let mut request_plan = ProviderRequestPlan {
            provider: ProviderKind::Openai,
            endpoint: "https://api.openai.com/v1/chat/completions".to_string(),
            method: "POST".to_string(),
            body: serde_json::json!({ "model": "gpt-5.4-mini" }),
        };

        assert!(validate_provider_request_plan(&request_plan).is_ok());
        request_plan.method = "GET".to_string();
        assert_eq!(
            validate_provider_request_plan(&request_plan).unwrap_err(),
            "provider_method_not_allowed"
        );
    }

    #[test]
    fn provider_headers_do_not_include_placeholder_tokens() {
        let headers = provider_headers(ProviderKind::Openrouter, "sk-test").unwrap();

        assert_eq!(headers.get("authorization").unwrap(), "Bearer sk-test");
        assert_eq!(headers.get("x-title").unwrap(), "OpenBrief");
    }
}
