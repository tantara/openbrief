use crate::credentials::{read_provider_api_key_for_app, ProviderKind};
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime};

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

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProviderStreamEvent {
    request_id: String,
    text: String,
}

#[derive(Debug, Default)]
struct ProviderStreamParseResult {
    text_delta: String,
    finish_reason: Option<String>,
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

#[tauri::command]
pub async fn complete_provider_stream_request<R: Runtime>(
    app: AppHandle<R>,
    request_plan: ProviderRequestPlan,
    request_id: String,
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

    if !response.status().is_success() {
        let body_text = response
            .text()
            .await
            .map_err(|error| format!("provider_response_read_failed:{error}"))?;
        return Ok(ProviderHttpResponse {
            status,
            body: parse_provider_body(&body_text),
        });
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut text = String::new();
    let mut finish_reason: Option<String> = None;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("provider_response_read_failed:{error}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        let parsed = consume_sse_buffer(&mut buffer, request_plan.provider, false);
        if !parsed.text_delta.is_empty() {
            text.push_str(&parsed.text_delta);
            app.emit(
                "openbrief://provider-stream",
                ProviderStreamEvent {
                    request_id: request_id.clone(),
                    text: text.clone(),
                },
            )
            .map_err(|error| format!("provider_stream_emit_failed:{error}"))?;
        }
        if parsed.finish_reason.is_some() {
            finish_reason = parsed.finish_reason;
        }
    }

    let parsed = consume_sse_buffer(&mut buffer, request_plan.provider, true);
    if !parsed.text_delta.is_empty() {
        text.push_str(&parsed.text_delta);
        app.emit(
            "openbrief://provider-stream",
            ProviderStreamEvent {
                request_id,
                text: text.clone(),
            },
        )
        .map_err(|error| format!("provider_stream_emit_failed:{error}"))?;
    }
    if parsed.finish_reason.is_some() {
        finish_reason = parsed.finish_reason;
    }

    Ok(ProviderHttpResponse {
        status,
        body: serde_json::json!({
            "openbriefText": text,
            "openbriefFinishReason": finish_reason.unwrap_or_else(|| "unknown".to_string()),
        }),
    })
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
        ProviderKind::Deepseek => endpoint == "https://api.deepseek.com/v1/chat/completions",
        ProviderKind::Anthropic => endpoint == "https://api.anthropic.com/v1/messages",
        ProviderKind::Openrouter => endpoint == "https://openrouter.ai/api/v1/chat/completions",
        ProviderKind::Gemini => {
            endpoint.starts_with("https://generativelanguage.googleapis.com/v1beta/models/")
                && (endpoint.ends_with(":generateContent")
                    || endpoint.ends_with(":streamGenerateContent"))
                && !endpoint.contains([' ', '\n', '\r', '\t'])
        }
        ProviderKind::OpenaiCompatible => {
            let is_local = endpoint.starts_with("http://localhost:")
                || endpoint.starts_with("http://127.0.0.1:");
            let is_tls = endpoint.starts_with("https://");
            (is_local || is_tls)
                && endpoint.ends_with("/v1/chat/completions")
                && !endpoint.contains([' ', '\n', '\r', '\t'])
        }
    }
}

fn provider_headers(provider: ProviderKind, api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    match provider {
        ProviderKind::Openai | ProviderKind::Deepseek | ProviderKind::OpenaiCompatible => {
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

fn consume_sse_buffer(
    buffer: &mut String,
    provider: ProviderKind,
    flush: bool,
) -> ProviderStreamParseResult {
    let mut result = ProviderStreamParseResult::default();

    while let Some((separator_index, separator_len)) = find_sse_separator(buffer) {
        let frame = buffer[..separator_index].to_string();
        buffer.drain(..separator_index + separator_len);
        merge_stream_parse_result(&mut result, parse_sse_frame(&frame, provider));
    }

    if flush && !buffer.trim().is_empty() {
        let frame = std::mem::take(buffer);
        merge_stream_parse_result(&mut result, parse_sse_frame(&frame, provider));
    }

    result
}

fn find_sse_separator(buffer: &str) -> Option<(usize, usize)> {
    let lf = buffer.find("\n\n").map(|index| (index, 2));
    let crlf = buffer.find("\r\n\r\n").map(|index| (index, 4));

    match (lf, crlf) {
        (Some(left), Some(right)) => Some(if left.0 <= right.0 { left } else { right }),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

fn parse_sse_frame(frame: &str, provider: ProviderKind) -> ProviderStreamParseResult {
    let mut result = ProviderStreamParseResult::default();

    for data in frame.lines().filter_map(|line| line.strip_prefix("data:")) {
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }

        let Ok(value) = serde_json::from_str::<Value>(data) else {
            continue;
        };
        result
            .text_delta
            .push_str(&extract_provider_stream_text_delta(provider, &value));
        if let Some(finish_reason) = extract_provider_finish_reason(provider, &value) {
            result.finish_reason = Some(finish_reason);
        }
    }

    result
}

fn merge_stream_parse_result(
    target: &mut ProviderStreamParseResult,
    next: ProviderStreamParseResult,
) {
    target.text_delta.push_str(&next.text_delta);
    if next.finish_reason.is_some() {
        target.finish_reason = next.finish_reason;
    }
}

fn extract_provider_stream_text_delta(provider: ProviderKind, value: &Value) -> String {
    match provider {
        ProviderKind::Openai | ProviderKind::Openrouter | ProviderKind::Deepseek
        | ProviderKind::OpenaiCompatible => value
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        ProviderKind::Anthropic => value
            .pointer("/delta/text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        ProviderKind::Gemini => extract_gemini_candidate_text(value),
    }
}

fn extract_provider_finish_reason(provider: ProviderKind, value: &Value) -> Option<String> {
    let reason = match provider {
        ProviderKind::Openai | ProviderKind::Openrouter | ProviderKind::Deepseek
        | ProviderKind::OpenaiCompatible => {
            value.pointer("/choices/0/finish_reason")
        }
        ProviderKind::Anthropic => value
            .pointer("/delta/stop_reason")
            .or_else(|| value.pointer("/stop_reason")),
        ProviderKind::Gemini => value.pointer("/candidates/0/finishReason"),
    };

    reason.and_then(Value::as_str).map(str::to_string)
}

fn extract_gemini_candidate_text(value: &Value) -> String {
    value
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default()
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
        assert!(is_allowed_provider_endpoint(
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
