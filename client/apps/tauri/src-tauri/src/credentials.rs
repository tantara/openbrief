use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    Openai,
    Anthropic,
    Gemini,
    Openrouter,
    Deepseek,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStorageContract {
    owner: &'static str,
    preferred_store: &'static str,
    fallback_store: &'static str,
    renderer_receives_secret_values: bool,
    helper_receives_secret_values: bool,
    supported_providers: Vec<ProviderKind>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCredentialHandle {
    provider: ProviderKind,
    credential_ref: String,
    storage_owner: &'static str,
    renderer_receives_secret_value: bool,
    helper_receives_secret_value: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderApiKeyStatus {
    provider: ProviderKind,
    configured: bool,
    credential_ref: String,
}

#[tauri::command]
pub fn credential_storage_contract() -> CredentialStorageContract {
    CredentialStorageContract {
        owner: "tauri-rust",
        preferred_store: "os-keychain",
        fallback_store: "app-private-0600-file",
        renderer_receives_secret_values: false,
        helper_receives_secret_values: false,
        supported_providers: vec![
            ProviderKind::Openai,
            ProviderKind::Anthropic,
            ProviderKind::Gemini,
            ProviderKind::Openrouter,
            ProviderKind::Deepseek,
        ],
    }
}

#[tauri::command]
pub fn provider_credential_handle(provider: ProviderKind) -> ProviderCredentialHandle {
    ProviderCredentialHandle {
        provider,
        credential_ref: format!("provider:{}:api-key", provider.as_ref()),
        storage_owner: "tauri-rust",
        renderer_receives_secret_value: false,
        helper_receives_secret_value: false,
    }
}

#[tauri::command]
pub fn provider_api_key_statuses<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ProviderApiKeyStatus>, String> {
    let credentials_dir = credentials_dir_for_app(&app)?;
    Ok(provider_api_key_statuses_for_dir(&credentials_dir))
}

#[tauri::command]
pub fn save_provider_api_key<R: Runtime>(
    app: AppHandle<R>,
    provider: ProviderKind,
    api_key: String,
) -> Result<ProviderApiKeyStatus, String> {
    let credentials_dir = credentials_dir_for_app(&app)?;
    save_provider_api_key_to_dir(&credentials_dir, provider, &api_key)
}

#[tauri::command]
pub fn redact_secret_fields(value: Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.into_iter().map(redact_secret_fields).collect()),
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(key, nested)| {
                    if is_secret_key(&key) {
                        (key, Value::String("[REDACTED]".to_string()))
                    } else {
                        (key, redact_secret_fields(nested))
                    }
                })
                .collect(),
        ),
        other => other,
    }
}

#[cfg(test)]
pub fn value_contains_unredacted_secret_field(value: &Value) -> bool {
    match value {
        Value::Array(items) => items.iter().any(value_contains_unredacted_secret_field),
        Value::Object(map) => map.iter().any(|(key, nested)| {
            if is_secret_key(key) {
                !matches!(nested, Value::String(value) if value == "[REDACTED]")
            } else {
                value_contains_unredacted_secret_field(nested)
            }
        }),
        _ => false,
    }
}

fn is_secret_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase().replace(['-', ' '], "_");

    [
        "apikey",
        "api_key",
        "authorization",
        "credential",
        "oauth",
        "refresh_token",
        "secret",
        "token",
        "x_api_key",
    ]
    .iter()
    .any(|fragment| normalized.contains(fragment))
}

impl ProviderKind {
    pub(crate) fn as_ref(self) -> &'static str {
        match self {
            ProviderKind::Openai => "openai",
            ProviderKind::Anthropic => "anthropic",
            ProviderKind::Gemini => "gemini",
            ProviderKind::Openrouter => "openrouter",
            ProviderKind::Deepseek => "deepseek",
        }
    }
}

pub(crate) fn read_provider_api_key_for_app<R: Runtime>(
    app: &AppHandle<R>,
    provider: ProviderKind,
) -> Result<Option<String>, String> {
    let credentials_dir = credentials_dir_for_app(app)?;
    read_provider_api_key_from_dir(&credentials_dir, provider)
}

fn provider_api_key_statuses_for_dir(credentials_dir: &Path) -> Vec<ProviderApiKeyStatus> {
    [
        ProviderKind::Openai,
        ProviderKind::Anthropic,
        ProviderKind::Gemini,
        ProviderKind::Openrouter,
        ProviderKind::Deepseek,
    ]
    .iter()
    .copied()
    .map(|provider| provider_api_key_status_for_dir(credentials_dir, provider))
    .collect()
}

fn provider_api_key_status_for_dir(
    credentials_dir: &Path,
    provider: ProviderKind,
) -> ProviderApiKeyStatus {
    let key_path = provider_api_key_path(credentials_dir, provider);
    let configured = key_path
        .metadata()
        .map(|metadata| metadata.is_file() && metadata.len() > 0)
        .unwrap_or(false);

    ProviderApiKeyStatus {
        provider,
        configured,
        credential_ref: format!("provider:{}:api-key", provider.as_ref()),
    }
}

fn read_provider_api_key_from_dir(
    credentials_dir: &Path,
    provider: ProviderKind,
) -> Result<Option<String>, String> {
    let key_path = provider_api_key_path(credentials_dir, provider);
    let api_key = match fs::read_to_string(&key_path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("provider_api_key_read_failed:{error}")),
    };
    let trimmed_api_key = api_key.trim().to_string();

    if trimmed_api_key.is_empty() {
        return Ok(None);
    }

    Ok(Some(trimmed_api_key))
}

fn save_provider_api_key_to_dir(
    credentials_dir: &Path,
    provider: ProviderKind,
    api_key: &str,
) -> Result<ProviderApiKeyStatus, String> {
    let trimmed_api_key = api_key.trim();
    if trimmed_api_key.is_empty() {
        return Err("provider_api_key_empty".to_string());
    }

    fs::create_dir_all(credentials_dir)
        .map_err(|error| format!("provider_credentials_dir_create_failed:{error}"))?;
    secure_directory_permissions(credentials_dir)?;

    let key_path = provider_api_key_path(credentials_dir, provider);
    let partial_path = key_path.with_extension("partial");
    let mut file = fs::File::create(&partial_path)
        .map_err(|error| format!("provider_api_key_create_failed:{error}"))?;
    secure_file_permissions(&partial_path)?;
    file.write_all(trimmed_api_key.as_bytes())
        .map_err(|error| format!("provider_api_key_write_failed:{error}"))?;
    file.flush()
        .map_err(|error| format!("provider_api_key_flush_failed:{error}"))?;
    drop(file);

    fs::rename(&partial_path, &key_path)
        .map_err(|error| format!("provider_api_key_rename_failed:{error}"))?;
    secure_file_permissions(&key_path)?;

    Ok(provider_api_key_status_for_dir(credentials_dir, provider))
}

fn credentials_dir_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let credentials_dir = crate::workspace::credentials_dir_for_app(app)?;
    secure_directory_permissions(&credentials_dir)?;
    Ok(credentials_dir)
}

fn provider_api_key_path(credentials_dir: &Path, provider: ProviderKind) -> PathBuf {
    credentials_dir.join(format!("provider-{}.api-key", provider.as_ref()))
}

#[cfg(unix)]
fn secure_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("provider_credentials_dir_permissions_failed:{error}"))
}

#[cfg(not(unix))]
fn secure_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn secure_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("provider_api_key_permissions_failed:{error}"))
}

#[cfg(not(unix))]
fn secure_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMP_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn contract_keeps_secrets_in_tauri_boundary() {
        let contract = credential_storage_contract();

        assert_eq!(contract.owner, "tauri-rust");
        assert_eq!(contract.preferred_store, "os-keychain");
        assert!(!contract.renderer_receives_secret_values);
        assert!(!contract.helper_receives_secret_values);
        assert_eq!(contract.supported_providers.len(), 5);
    }

    #[test]
    fn credential_handles_are_secret_free_refs() {
        let handle = provider_credential_handle(ProviderKind::Openai);
        let serialized = serde_json::to_string(&handle).unwrap();

        assert_eq!(handle.credential_ref, "provider:openai:api-key");
        assert!(!serialized.contains("sk-"));
        assert!(!handle.renderer_receives_secret_value);
        assert!(!handle.helper_receives_secret_value);
    }

    #[test]
    fn redacts_nested_provider_secret_diagnostics() {
        let diagnostic = json!({
            "message": "failed",
            "authorization": "Bearer sk-test",
            "nested": {
                "access_token": "access",
                "refresh-token": "refresh",
                "x-api-key": "secret"
            }
        });

        let redacted = redact_secret_fields(diagnostic);

        assert!(!value_contains_unredacted_secret_field(&redacted));
        assert_eq!(redacted["authorization"], "[REDACTED]");
        assert_eq!(redacted["nested"]["access_token"], "[REDACTED]");
        assert_eq!(redacted["nested"]["refresh-token"], "[REDACTED]");
        assert_eq!(redacted["nested"]["x-api-key"], "[REDACTED]");
    }

    #[test]
    fn provider_api_key_statuses_do_not_return_secret_values() {
        let root = temp_credentials_dir();

        let saved =
            save_provider_api_key_to_dir(&root, ProviderKind::Openai, "sk-test-secret").unwrap();
        let statuses = provider_api_key_statuses_for_dir(&root);
        let serialized = serde_json::to_string(&statuses).unwrap();

        assert!(saved.configured);
        assert_eq!(saved.credential_ref, "provider:openai:api-key");
        assert!(statuses
            .iter()
            .any(|status| status.provider == ProviderKind::Openai && status.configured));
        assert!(!serialized.contains("sk-test-secret"));
    }

    #[test]
    fn provider_api_key_save_rejects_blank_values() {
        let root = temp_credentials_dir();

        assert_eq!(
            save_provider_api_key_to_dir(&root, ProviderKind::Gemini, "   ").unwrap_err(),
            "provider_api_key_empty"
        );
    }

    #[test]
    fn provider_api_key_read_returns_secret_only_inside_rust_boundary() {
        let root = temp_credentials_dir();

        save_provider_api_key_to_dir(&root, ProviderKind::Anthropic, "  anthropic-secret  ")
            .unwrap();

        assert_eq!(
            read_provider_api_key_from_dir(&root, ProviderKind::Anthropic).unwrap(),
            Some("anthropic-secret".to_string())
        );
        assert_eq!(
            read_provider_api_key_from_dir(&root, ProviderKind::Openai).unwrap(),
            None
        );
    }

    fn temp_credentials_dir() -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "openbrief-provider-credentials-{}-{}-{}",
            std::process::id(),
            TEMP_DIR_COUNTER.fetch_add(1, Ordering::Relaxed),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
