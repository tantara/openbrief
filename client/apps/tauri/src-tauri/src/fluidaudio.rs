use crate::helper::{self, HelperRunResult};
use crate::helper_sidecar;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::Instant,
};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_shell::process::{CommandEvent, Output};
use tauri_plugin_shell::ShellExt;

pub const FLUIDAUDIO_EXTERNAL_BIN_PATH: &str = "openbrief-fluidaudio";
pub const PARAKEET_V3_MODEL_ID: &str = "parakeet-tdt-0.6b-v3";
pub const PARAKEET_V3_MODEL_DIR: &str = "fluidaudio/parakeet-tdt-0.6b-v3";
pub const PARAKEET_V3_ENGINE: &str = "fluidaudio";
pub const PARAKEET_V3_SIZE_MB: u64 = 2_100;

const SUPPORTED_LANGUAGE_CODES: [&str; 25] = [
    "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt", "mt",
    "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk",
];

pub fn can_use_fluidaudio_sidecar() -> bool {
    can_use_fluidaudio_sidecar_for_target(
        std::env::consts::OS,
        std::env::consts::ARCH,
        macos_major_version(),
    )
}

pub fn can_use_fluidaudio_sidecar_for_target(
    target_os: &str,
    target_arch: &str,
    macos_major_version: Option<u64>,
) -> bool {
    target_os == "macos"
        && target_arch == "aarch64"
        && macos_major_version.is_some_and(|major| major >= 14)
}

pub fn normalize_supported_language(language: Option<&str>) -> Option<String> {
    let language = language?.trim().to_lowercase();
    if language.is_empty() || language == "auto" {
        return None;
    }

    let code = language
        .split(['-', '_'])
        .next()
        .filter(|value| !value.is_empty())?;

    SUPPORTED_LANGUAGE_CODES
        .contains(&code)
        .then(|| code.to_string())
}

pub fn parakeet_model_dir(models_root: &Path) -> PathBuf {
    models_root.join(PARAKEET_V3_MODEL_DIR)
}

pub fn parakeet_model_downloaded(models_root: &Path) -> bool {
    let repo_dir = parakeet_model_dir(models_root);
    [
        "Preprocessor.mlmodelc",
        "Encoder.mlmodelc",
        "Decoder.mlmodelc",
        "JointDecisionv3.mlmodelc",
        "parakeet_vocab.json",
    ]
    .iter()
    .all(|file_name| repo_dir.join(file_name).exists())
}

pub fn should_route_transcribe_to_fluidaudio(payload: &Value) -> Result<Option<String>, String> {
    let preference = payload
        .get("enginePreference")
        .and_then(Value::as_str)
        .unwrap_or("auto");
    if preference == "whisper" {
        return Ok(None);
    }

    let requested_model = payload.get("modelId").and_then(Value::as_str);
    let explicitly_fluidaudio =
        preference == "fluidaudio" || requested_model == Some(PARAKEET_V3_MODEL_ID);

    if !can_use_fluidaudio_sidecar() {
        return if explicitly_fluidaudio {
            Err("fluidaudio_requires_macos_apple_silicon_macos14".to_string())
        } else {
            Ok(None)
        };
    }

    let normalized_language =
        normalize_supported_language(payload.get("language").and_then(Value::as_str));
    if normalized_language.is_none() && payload.get("language").and_then(Value::as_str).is_some() {
        return if explicitly_fluidaudio {
            Err("fluidaudio_language_not_supported".to_string())
        } else {
            Ok(None)
        };
    }

    if preference == "auto" || explicitly_fluidaudio {
        return Ok(Some(
            normalized_language.unwrap_or_else(|| "en".to_string()),
        ));
    }

    Ok(None)
}

pub async fn run_transcribe_audio<R: Runtime>(
    app: &AppHandle<R>,
    request: &helper_sidecar::HelperRequest,
    mut command: Value,
    library_root: &Path,
    models_root: &Path,
    normalized_language: String,
) -> Result<HelperRunResult, String> {
    let object = command
        .as_object_mut()
        .ok_or_else(|| "fluidaudio_command_must_be_object".to_string())?;
    object.insert(
        "engine".to_string(),
        Value::String(PARAKEET_V3_ENGINE.to_string()),
    );
    object.insert(
        "modelId".to_string(),
        Value::String(PARAKEET_V3_MODEL_ID.to_string()),
    );
    object.insert(
        "modelDirectory".to_string(),
        Value::String(path_to_string(parakeet_model_dir(models_root))),
    );
    object.insert("language".to_string(), Value::String(normalized_language));

    run_fluidaudio_sidecar(app, request, command, library_root).await
}

pub async fn download_parakeet_model<R: Runtime>(
    app: &AppHandle<R>,
    models_root: &Path,
) -> Result<(String, u64), String> {
    fs::create_dir_all(parakeet_model_dir(models_root))
        .map_err(|error| format!("fluidaudio_model_dir_create_failed:{error}"))?;

    let command = json!({
        "protocolVersion": helper::HELPER_PROTOCOL_VERSION,
        "command": "download_model",
        "jobId": "stt-model-parakeet-v3",
        "modelId": PARAKEET_V3_MODEL_ID,
        "modelDirectory": path_to_string(parakeet_model_dir(models_root)),
    });
    let request = serde_json::from_value::<helper_sidecar::HelperRequest>(json!({
        "protocolVersion": helper::HELPER_PROTOCOL_VERSION,
        "command": "transcribe_audio",
        "jobId": "stt-model-parakeet-v3"
    }))
    .map_err(|error| format!("fluidaudio_download_request_parse_failed:{error}"))?;

    emit_fluidaudio_download_progress(app, 0.05, Some("preparing FluidAudio model"));

    let output = run_raw_fluidaudio_sidecar_with_download_progress(app, &request, command).await?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed = helper::parse_helper_output(&stdout, Path::new(""))
        .map_err(|error| format!("fluidaudio_download_output_parse_failed:{error}"))?;

    if output.exit_code != Some(0) {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = parsed
            .failed_message
            .filter(|message| !message.trim().is_empty())
            .unwrap_or_else(|| stderr.trim().to_string());
        return Err(format!(
            "fluidaudio_sidecar_failed:{}:{}",
            output.exit_code.unwrap_or(-1),
            detail
        ));
    }

    let result = parsed
        .completed_result
        .ok_or_else(|| "fluidaudio_download_result_missing".to_string())?;
    let sha1 = result
        .get("sha1")
        .and_then(Value::as_str)
        .unwrap_or("directory-managed-by-fluidaudio")
        .to_string();
    let size_bytes = result
        .get("sizeBytes")
        .and_then(Value::as_u64)
        .unwrap_or_else(|| directory_size(&parakeet_model_dir(models_root)));

    Ok((sha1, size_bytes))
}

async fn run_fluidaudio_sidecar<R: Runtime>(
    app: &AppHandle<R>,
    request: &helper_sidecar::HelperRequest,
    command: Value,
    library_root: &Path,
) -> Result<HelperRunResult, String> {
    let should_log_stt = request.command == helper_sidecar::HelperCommandName::TranscribeAudio;
    if should_log_stt {
        log::info!(
            target: "openbrief::stt",
            "before running stt; job_id={}; command=transcribe_audio; engine=fluidaudio; model_id={}",
            request.job_id.as_deref().unwrap_or("unknown"),
            PARAKEET_V3_MODEL_ID,
        );
    }

    let started_at = Instant::now();
    let output = run_raw_fluidaudio_sidecar(app, request, command)
        .await
        .map_err(|error| {
            if should_log_stt {
                log::error!(
                    target: "openbrief::stt",
                    "after running stt; job_id={}; status=start_failed; engine=fluidaudio; elapsed_ms={}; error={}",
                    request.job_id.as_deref().unwrap_or("unknown"),
                    started_at.elapsed().as_millis(),
                    error,
                );
            }
            error
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = helper::parse_helper_output(&stdout, library_root)?;

    if output.status.success() {
        if should_log_stt {
            log::info!(
                target: "openbrief::stt",
                "after running stt; job_id={}; status=success; engine=fluidaudio; elapsed_ms={}",
                request.job_id.as_deref().unwrap_or("unknown"),
                started_at.elapsed().as_millis(),
            );
        }
        let result = parsed
            .completed_result
            .ok_or_else(|| "fluidaudio_result_missing".to_string())?;
        Ok(HelperRunResult {
            events: parsed.events,
            result,
        })
    } else {
        let detail = parsed
            .failed_message
            .filter(|message| !message.trim().is_empty())
            .unwrap_or_else(|| stderr.trim().to_string());
        if should_log_stt {
            log::error!(
                target: "openbrief::stt",
                "after running stt; job_id={}; status=failed; engine=fluidaudio; elapsed_ms={}; exit_code={}; error={}",
                request.job_id.as_deref().unwrap_or("unknown"),
                started_at.elapsed().as_millis(),
                output.status.code().unwrap_or(-1),
                detail,
            );
        }
        Err(format!(
            "fluidaudio_sidecar_failed:{}:{}",
            output.status.code().unwrap_or(-1),
            detail
        ))
    }
}

async fn run_raw_fluidaudio_sidecar<R: Runtime>(
    app: &AppHandle<R>,
    request: &helper_sidecar::HelperRequest,
    command: Value,
) -> Result<Output, String> {
    if !can_use_fluidaudio_sidecar() {
        return Err("fluidaudio_requires_macos_apple_silicon_macos14".to_string());
    }

    let command_json = serde_json::to_string(&command)
        .map_err(|error| format!("fluidaudio_command_serialize_failed:{error}"))?;
    app.shell()
        .sidecar(FLUIDAUDIO_EXTERNAL_BIN_PATH)
        .map_err(|error| format!("fluidaudio_sidecar_unavailable:{error}"))?
        .args(["--json".to_string(), command_json])
        .output()
        .await
        .map_err(|error| {
            format!(
                "fluidaudio_sidecar_failed_to_start:{}:{}",
                request.job_id.as_deref().unwrap_or("unknown"),
                error
            )
        })
}

struct StreamedFluidAudioOutput {
    exit_code: Option<i32>,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

async fn run_raw_fluidaudio_sidecar_with_download_progress<R: Runtime>(
    app: &AppHandle<R>,
    request: &helper_sidecar::HelperRequest,
    command: Value,
) -> Result<StreamedFluidAudioOutput, String> {
    if !can_use_fluidaudio_sidecar() {
        return Err("fluidaudio_requires_macos_apple_silicon_macos14".to_string());
    }

    let command_json = serde_json::to_string(&command)
        .map_err(|error| format!("fluidaudio_command_serialize_failed:{error}"))?;
    let (mut rx, _child) = app
        .shell()
        .sidecar(FLUIDAUDIO_EXTERNAL_BIN_PATH)
        .map_err(|error| format!("fluidaudio_sidecar_unavailable:{error}"))?
        .args(["--json".to_string(), command_json])
        .spawn()
        .map_err(|error| {
            format!(
                "fluidaudio_sidecar_failed_to_start:{}:{}",
                request.job_id.as_deref().unwrap_or("unknown"),
                error
            )
        })?;

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit_code = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                stdout.extend_from_slice(&bytes);
                stdout.push(b'\n');
                emit_fluidaudio_stdout_download_progress(app, &bytes);
            }
            CommandEvent::Stderr(bytes) => {
                stderr.extend_from_slice(&bytes);
                stderr.push(b'\n');
            }
            CommandEvent::Error(error) => {
                return Err(format!(
                    "fluidaudio_sidecar_stream_failed:{}:{}",
                    request.job_id.as_deref().unwrap_or("unknown"),
                    error
                ));
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
            }
            _ => {}
        }
    }

    Ok(StreamedFluidAudioOutput {
        exit_code,
        stdout,
        stderr,
    })
}

fn emit_fluidaudio_stdout_download_progress<R: Runtime>(app: &AppHandle<R>, bytes: &[u8]) {
    let line = String::from_utf8_lossy(bytes);
    for candidate in line.lines() {
        let Ok(event) = serde_json::from_str::<Value>(candidate) else {
            continue;
        };
        if event.get("event").and_then(Value::as_str) != Some("job_progress") {
            continue;
        }
        let Some(progress) = event.get("progress").and_then(Value::as_f64) else {
            continue;
        };
        let message = event.get("message").and_then(Value::as_str);
        emit_fluidaudio_download_progress(app, progress, message);
    }
}

fn emit_fluidaudio_download_progress<R: Runtime>(
    app: &AppHandle<R>,
    progress: f64,
    message: Option<&str>,
) {
    let _ = app.emit(
        "openbrief://stt-model-download-progress",
        fluidaudio_download_progress_payload(progress, message),
    );
}

fn fluidaudio_download_progress_payload(progress: f64, message: Option<&str>) -> Value {
    let progress = progress.clamp(0.0, 1.0);
    let total_bytes = PARAKEET_V3_SIZE_MB
        .saturating_mul(1024)
        .saturating_mul(1024);
    let downloaded_bytes = (total_bytes as f64 * progress).round() as u64;
    let mut payload = json!({
        "modelId": PARAKEET_V3_MODEL_ID,
        "fileName": PARAKEET_V3_MODEL_DIR,
        "downloadedBytes": downloaded_bytes,
        "totalBytes": total_bytes,
        "progress": progress,
    });
    if let Some(message) = message {
        payload["message"] = Value::String(message.to_string());
    }
    payload
}

fn directory_size(path: &Path) -> u64 {
    let mut total = 0_u64;
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        if metadata.is_dir() {
            total = total.saturating_add(directory_size(&path));
        } else {
            total = total.saturating_add(metadata.len());
        }
    }
    total
}

fn macos_major_version() -> Option<u64> {
    if !cfg!(target_os = "macos") {
        return None;
    }

    let output = Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let version = String::from_utf8(output.stdout).ok()?;
    macos_major_version_from_product_version(version.trim())
}

fn macos_major_version_from_product_version(version: &str) -> Option<u64> {
    version.split('.').next()?.parse().ok()
}

fn path_to_string(path: PathBuf) -> String {
    if cfg!(windows) {
        path.to_string_lossy().replace('\\', "/")
    } else {
        path.to_string_lossy().into_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_supported_parakeet_languages() {
        assert_eq!(
            normalize_supported_language(Some("en-US")).as_deref(),
            Some("en")
        );
        assert_eq!(
            normalize_supported_language(Some("pt_BR")).as_deref(),
            Some("pt")
        );
        assert_eq!(
            normalize_supported_language(Some("uk")).as_deref(),
            Some("uk")
        );
        assert_eq!(normalize_supported_language(Some("ja")), None);
        assert_eq!(normalize_supported_language(Some("auto")), None);
    }

    #[test]
    fn parses_macos_major_versions_for_fluidaudio_gate() {
        assert_eq!(macos_major_version_from_product_version("14.6.1"), Some(14));
        assert_eq!(macos_major_version_from_product_version("15.0"), Some(15));
        assert_eq!(macos_major_version_from_product_version(""), None);
    }

    #[test]
    fn gates_fluidaudio_to_macos_apple_silicon_macos14_or_newer() {
        assert!(can_use_fluidaudio_sidecar_for_target(
            "macos",
            "aarch64",
            Some(14)
        ));
        assert!(can_use_fluidaudio_sidecar_for_target(
            "macos",
            "aarch64",
            Some(15)
        ));

        assert!(!can_use_fluidaudio_sidecar_for_target(
            "macos",
            "aarch64",
            Some(13)
        ));
        assert!(!can_use_fluidaudio_sidecar_for_target(
            "macos",
            "x86_64",
            Some(15)
        ));
        assert!(!can_use_fluidaudio_sidecar_for_target(
            "windows", "x86_64", None
        ));
        assert!(!can_use_fluidaudio_sidecar_for_target(
            "linux", "x86_64", None
        ));
        assert!(!can_use_fluidaudio_sidecar_for_target(
            "linux", "aarch64", None
        ));
    }

    #[test]
    fn detects_parakeet_model_directory() {
        let root = temp_models_dir();
        let model_dir = parakeet_model_dir(&root);
        fs::create_dir_all(&model_dir).unwrap();
        for file_name in [
            "Preprocessor.mlmodelc",
            "Encoder.mlmodelc",
            "Decoder.mlmodelc",
            "JointDecisionv3.mlmodelc",
            "parakeet_vocab.json",
        ] {
            fs::write(model_dir.join(file_name), b"placeholder").unwrap();
        }

        assert!(parakeet_model_downloaded(&root));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn builds_stt_download_progress_payload_for_fluidaudio_events() {
        let payload = fluidaudio_download_progress_payload(0.5, Some("preparing Parakeet v3"));

        assert_eq!(
            payload.get("modelId").and_then(Value::as_str),
            Some(PARAKEET_V3_MODEL_ID)
        );
        assert_eq!(
            payload.get("fileName").and_then(Value::as_str),
            Some(PARAKEET_V3_MODEL_DIR)
        );
        assert_eq!(payload.get("progress").and_then(Value::as_f64), Some(0.5));
        assert_eq!(
            payload.get("totalBytes").and_then(Value::as_u64),
            Some(PARAKEET_V3_SIZE_MB * 1024 * 1024)
        );
        assert_eq!(
            payload.get("downloadedBytes").and_then(Value::as_u64),
            Some((PARAKEET_V3_SIZE_MB * 1024 * 1024) / 2)
        );
        assert_eq!(
            payload.get("message").and_then(Value::as_str),
            Some("preparing Parakeet v3")
        );
    }

    fn temp_models_dir() -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "openbrief-fluidaudio-models-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
