use crate::helper::{self, HelperRunResult};
use crate::helper_sidecar;
use serde_json::{json, Value};
use std::{fs, path::Path, time::Instant};
use tauri::{AppHandle, Runtime};
use tauri_plugin_shell::ShellExt;

pub const QWEN_ASR_ENGINE: &str = "qwen3-asr";
pub const QWEN_ASR_06B_MODEL_ID: &str = "qwen3-asr-0.6B";
pub const QWEN_ASR_17B_MODEL_ID: &str = "qwen3-asr-1.7B";
pub const QWEN_ASR_06B_MODEL_DIR: &str = "localai/qwen3-asr-0.6B";
pub const QWEN_ASR_17B_MODEL_DIR: &str = "localai/qwen3-asr-1.7B";
pub const QWEN_ASR_06B_SIZE_MB: u64 = 2_400;
pub const QWEN_ASR_17B_SIZE_MB: u64 = 5_800;

const LOCALAI_EXTERNAL_BIN_PATH: &str = "openbrief-localai";
const QWEN_ASR_06B_MLX_REPO: &str = "mlx-community/Qwen3-ASR-0.6B-8bit";
const QWEN_ASR_06B_PYTORCH_REPO: &str = "Qwen/Qwen3-ASR-0.6B";
const QWEN_ASR_17B_MLX_REPO: &str = "mlx-community/Qwen3-ASR-1.7B-8bit";
const QWEN_ASR_17B_PYTORCH_REPO: &str = "Qwen/Qwen3-ASR-1.7B";
const QWEN_ALIGNER_MLX_REPO: &str = "mlx-community/Qwen3-ForcedAligner-0.6B-8bit";
const QWEN_ALIGNER_PYTORCH_REPO: &str = "Qwen/Qwen3-ForcedAligner-0.6B";

pub fn is_qwen_asr_model_id(model_id: Option<&str>) -> bool {
    matches!(
        model_id,
        Some(QWEN_ASR_06B_MODEL_ID) | Some(QWEN_ASR_17B_MODEL_ID)
    )
}

pub fn should_route_transcribe_to_qwen(payload: &Value) -> Result<Option<String>, String> {
    let preference = payload
        .get("enginePreference")
        .and_then(Value::as_str)
        .unwrap_or("auto");
    let model_id = payload.get("modelId").and_then(Value::as_str);
    let explicitly_qwen = preference == QWEN_ASR_ENGINE || is_qwen_asr_model_id(model_id);

    if !explicitly_qwen {
        return Ok(None);
    }

    let model_id = model_id.unwrap_or(QWEN_ASR_06B_MODEL_ID);
    if !is_qwen_asr_model_id(Some(model_id)) {
        return Err("qwen_asr_model_unknown".to_string());
    }

    Ok(Some(model_id.to_string()))
}

pub fn qwen_asr_model_downloaded(models_root: &Path, model_id: &str) -> bool {
    let (mlx_repo, pytorch_repo) = match model_id {
        QWEN_ASR_17B_MODEL_ID => (QWEN_ASR_17B_MLX_REPO, QWEN_ASR_17B_PYTORCH_REPO),
        QWEN_ASR_06B_MODEL_ID => (QWEN_ASR_06B_MLX_REPO, QWEN_ASR_06B_PYTORCH_REPO),
        _ => return false,
    };

    (hf_repo_cache_exists(models_root, mlx_repo) || hf_repo_cache_exists(models_root, pytorch_repo))
        && (hf_repo_cache_exists(models_root, QWEN_ALIGNER_MLX_REPO)
            || hf_repo_cache_exists(models_root, QWEN_ALIGNER_PYTORCH_REPO))
}

pub fn qwen_asr_model_dir(model_id: &str) -> &'static str {
    match model_id {
        QWEN_ASR_17B_MODEL_ID => QWEN_ASR_17B_MODEL_DIR,
        _ => QWEN_ASR_06B_MODEL_DIR,
    }
}

pub async fn mark_qwen_asr_model_ready(
    models_root: &Path,
    model_id: &str,
) -> Result<(String, u64), String> {
    if !is_qwen_asr_model_id(Some(model_id)) {
        return Err("qwen_asr_model_unknown".to_string());
    }

    fs::create_dir_all(models_root.join(qwen_asr_model_dir(model_id)))
        .map_err(|error| format!("qwen_asr_model_dir_create_failed:{error}"))?;
    fs::create_dir_all(models_root.join("localai").join("cache"))
        .map_err(|error| format!("qwen_asr_cache_dir_create_failed:{error}"))?;

    Ok(("sidecar-downloads-on-demand".to_string(), 0))
}

fn hf_repo_cache_exists(models_root: &Path, repo_id: &str) -> bool {
    let repo_cache_name = format!("models--{}", repo_id.replace('/', "--"));
    [
        models_root
            .join("localai")
            .join("cache")
            .join("hub")
            .join(&repo_cache_name),
        models_root
            .join("localai")
            .join("hf")
            .join("hub")
            .join(&repo_cache_name),
    ]
    .into_iter()
    .any(|repo_cache| non_empty_dir(&repo_cache.join("snapshots")) || non_empty_dir(&repo_cache))
}

fn non_empty_dir(path: &Path) -> bool {
    fs::read_dir(path)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false)
}

pub async fn run_transcribe_audio<R: Runtime>(
    app: &AppHandle<R>,
    request: &helper_sidecar::HelperRequest,
    command: Value,
    library_root: &Path,
    models_root: &Path,
    model_id: String,
) -> Result<HelperRunResult, String> {
    let audio_path = command
        .get("audioPath")
        .and_then(Value::as_str)
        .ok_or_else(|| "qwen_asr_missing_audio_path".to_string())?;
    let output_path = command
        .get("outputPath")
        .and_then(Value::as_str)
        .ok_or_else(|| "qwen_asr_missing_output_path".to_string())?;
    let language = command
        .get("language")
        .and_then(Value::as_str)
        .unwrap_or("auto");

    fs::create_dir_all(models_root.join("localai").join("cache"))
        .map_err(|error| format!("qwen_asr_cache_dir_create_failed:{error}"))?;

    let cache_dir = helper::path_to_string(models_root.join("localai").join("cache"));
    let args = vec![
        "transcribe".to_string(),
        "--model".to_string(),
        model_id.clone(),
        "--aligner".to_string(),
        "qwen3-forced-aligner-0.6B".to_string(),
        "--audio".to_string(),
        audio_path.to_string(),
        "--output".to_string(),
        output_path.to_string(),
        "--language".to_string(),
        language.to_string(),
        "--cache-dir".to_string(),
        cache_dir,
    ];

    log::info!(
        target: "openbrief::stt",
        "before running stt; job_id={}; command=transcribe_audio; engine=qwen3-asr; model_id={}",
        request.job_id.as_deref().unwrap_or("unknown"),
        model_id,
    );

    let started_at = Instant::now();
    let output = app
        .shell()
        .sidecar(LOCALAI_EXTERNAL_BIN_PATH)
        .map_err(|error| format!("qwen_asr_sidecar_unavailable:{error}"))?
        .args(args)
        .output()
        .await
        .map_err(|error| {
            log::error!(
                target: "openbrief::stt",
                "after running stt; job_id={}; status=start_failed; engine=qwen3-asr; elapsed_ms={}; error={}",
                request.job_id.as_deref().unwrap_or("unknown"),
                started_at.elapsed().as_millis(),
                error,
            );
            format!("qwen_asr_sidecar_start_failed:{error}")
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        let detail = stderr.trim();
        log::error!(
            target: "openbrief::stt",
            "after running stt; job_id={}; status=failed; engine=qwen3-asr; elapsed_ms={}; exit_code={}; error={}",
            request.job_id.as_deref().unwrap_or("unknown"),
            started_at.elapsed().as_millis(),
            output.status.code().unwrap_or(-1),
            detail,
        );
        return Err(format!(
            "qwen_asr_sidecar_failed:{}:{}",
            output.status.code().unwrap_or(-1),
            detail
        ));
    }

    let raw_result = stdout
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| "qwen_asr_result_missing".to_string())?;
    let mut result = serde_json::from_str::<Value>(raw_result)
        .map_err(|error| format!("qwen_asr_result_parse_failed:{error}"))?;
    if result.get("command").and_then(Value::as_str) != Some("transcribe_audio") {
        result["command"] = Value::String("transcribe_audio".to_string());
    }
    result = helper::relativize_helper_paths(result, library_root)?;

    let job_id = request.job_id.as_deref().unwrap_or("unknown");
    let events = vec![
        json!({
            "protocolVersion": helper::HELPER_PROTOCOL_VERSION,
            "event": "job_started",
            "jobId": job_id,
            "command": "transcribe_audio",
        }),
        json!({
            "protocolVersion": helper::HELPER_PROTOCOL_VERSION,
            "event": "job_completed",
            "jobId": job_id,
            "command": "transcribe_audio",
            "progress": 1.0,
            "result": result.clone(),
        }),
    ];

    log::info!(
        target: "openbrief::stt",
        "after running stt; job_id={}; status=success; engine=qwen3-asr; elapsed_ms={}",
        request.job_id.as_deref().unwrap_or("unknown"),
        started_at.elapsed().as_millis(),
    );

    Ok(HelperRunResult { events, result })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn qwen_asr_is_not_downloaded_without_cached_weights() {
        let root = temp_models_dir();

        assert!(!qwen_asr_model_downloaded(&root, QWEN_ASR_06B_MODEL_ID));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn qwen_asr_requires_asr_and_aligner_cache() {
        let root = temp_models_dir();

        write_hf_snapshot(&root, QWEN_ASR_06B_PYTORCH_REPO);
        assert!(!qwen_asr_model_downloaded(&root, QWEN_ASR_06B_MODEL_ID));

        write_hf_snapshot(&root, QWEN_ALIGNER_PYTORCH_REPO);
        assert!(qwen_asr_model_downloaded(&root, QWEN_ASR_06B_MODEL_ID));
        assert!(!qwen_asr_model_downloaded(&root, QWEN_ASR_17B_MODEL_ID));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn qwen_asr_detects_mlx_cache() {
        let root = temp_models_dir();

        write_hf_snapshot(&root, QWEN_ASR_17B_MLX_REPO);
        write_hf_snapshot(&root, QWEN_ALIGNER_MLX_REPO);

        assert!(qwen_asr_model_downloaded(&root, QWEN_ASR_17B_MODEL_ID));

        fs::remove_dir_all(root).unwrap();
    }

    fn write_hf_snapshot(models_root: &Path, repo_id: &str) {
        let repo_cache_name = format!("models--{}", repo_id.replace('/', "--"));
        let snapshot = models_root
            .join("localai")
            .join("cache")
            .join("hub")
            .join(repo_cache_name)
            .join("snapshots")
            .join("revision");
        fs::create_dir_all(&snapshot).unwrap();
        fs::write(snapshot.join("config.json"), b"{}").unwrap();
    }

    fn temp_models_dir() -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "openbrief-qwen-asr-models-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
