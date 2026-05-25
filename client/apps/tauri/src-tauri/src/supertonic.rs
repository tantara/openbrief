use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

const RUNNER_SCRIPT: &str = include_str!("../sidecars/supertonic-python/openbrief_supertonic.py");
const SUPERTONIC_PACKAGE: &str = "supertonic>=1.3.1";
const SUPERTONIC_EXTERNAL_BIN_PATH: &str = "openbrief-supertonic";
const LOCALAI_EXTERNAL_BIN_PATH: &str = "openbrief-localai";
const MODEL_REPO_ID: &str = "Supertone/supertonic-3";
const QWEN_TTS_06B_MODEL_ID: &str = "qwen-tts-0.6B";
const QWEN_TTS_17B_MODEL_ID: &str = "qwen-tts-1.7B";
const DEFAULT_VOICE_STYLE_ID: &str = "M1";
const DEFAULT_LANGUAGE: &str = "en";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicChatTtsRequest {
    asset_library_path: String,
    chat_message_id: String,
    text: String,
    chat_session_id: Option<String>,
    model_id: Option<String>,
    voice_style_id: Option<String>,
    qwen_preset_voice_id: Option<String>,
    language: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicChatTtsResult {
    audio_path: String,
    generation_id: String,
    model_id: String,
    voice_style_id: String,
    size_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicChatTtsLookupRequest {
    asset_library_path: String,
    chat_message_id: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicChatTtsArtifact {
    audio_path: String,
    generation_id: String,
    size_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicPodcastTtsRequest {
    asset_library_path: String,
    podcast_id: String,
    turns: Vec<SupertonicPodcastTurn>,
    speakers: Vec<SupertonicPodcastSpeaker>,
    model_id: Option<String>,
    language: Option<String>,
    script_markdown: Option<String>,
    manifest_json: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicPodcastTurn {
    id: String,
    speaker_id: String,
    text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicPodcastSpeaker {
    id: String,
    voice_style_id: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicPodcastTtsResult {
    podcast_id: String,
    audio_path: String,
    script_path: String,
    manifest_path: String,
    turn_audio_paths: Vec<String>,
    turn_timings: Vec<SupertonicPodcastTurnTiming>,
    model_id: String,
    duration_seconds: f64,
    size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicPodcastTurnTiming {
    turn_id: String,
    audio_path: String,
    start_seconds: f64,
    end_seconds: f64,
    duration_seconds: f64,
}

struct StitchedPodcastAudio {
    duration_seconds: f64,
    turn_timings: Vec<SupertonicPodcastTurnTiming>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TtsVoiceCatalogModel {
    id: String,
    name: String,
    engine: String,
    downloaded: bool,
    voices: Vec<TtsVoiceCatalogVoice>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TtsVoiceCatalogVoice {
    id: String,
    label: String,
    downloaded: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsPreviewRequest {
    text: String,
    model_id: Option<String>,
    voice_style_id: Option<String>,
    qwen_preset_voice_id: Option<String>,
    language: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TtsPreviewResult {
    model_id: String,
    voice_id: String,
    language: String,
    size_bytes: u64,
    audio_bytes: Vec<u8>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicPodcastTtsDeleteRequest {
    asset_library_path: String,
    podcast_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupertonicPodcastTtsLookupRequest {
    asset_library_path: String,
}

#[tauri::command]
pub async fn generate_supertonic_chat_tts(
    app: AppHandle,
    request: SupertonicChatTtsRequest,
) -> Result<SupertonicChatTtsResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        generate_supertonic_chat_tts_blocking(app, request)
    })
    .await
    .map_err(|error| format!("supertonic_task_join_failed:{error}"))?
}

#[tauri::command]
pub async fn generate_supertonic_podcast_tts(
    app: AppHandle,
    request: SupertonicPodcastTtsRequest,
) -> Result<SupertonicPodcastTtsResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        generate_supertonic_podcast_tts_blocking(app, request)
    })
    .await
    .map_err(|error| format!("supertonic_podcast_task_join_failed:{error}"))?
}

#[tauri::command]
pub fn tts_voice_catalog(app: AppHandle) -> Result<Vec<TtsVoiceCatalogModel>, String> {
    let app_data = crate::workspace::workspace_root_for_app(&app)?;

    Ok(tts_voice_catalog_from_app_data(&app_data))
}

#[tauri::command]
pub async fn generate_tts_preview(
    app: AppHandle,
    request: TtsPreviewRequest,
) -> Result<TtsPreviewResult, String> {
    tauri::async_runtime::spawn_blocking(move || generate_tts_preview_blocking(app, request))
        .await
        .map_err(|error| format!("tts_preview_task_join_failed:{error}"))?
}

#[tauri::command]
pub fn delete_supertonic_podcast_tts(
    app: AppHandle,
    request: SupertonicPodcastTtsDeleteRequest,
) -> Result<(), String> {
    let library_root = app_library_root(&app)?;
    let podcast_relative_path =
        podcast_root_relative_path(&request.asset_library_path, &request.podcast_id)?;
    let podcast_dir = validated_library_output_path(&library_root, &podcast_relative_path)?;
    reject_existing_relative_symlinks(&library_root, Path::new(&podcast_relative_path))?;

    if !podcast_dir.exists() {
        return Ok(());
    }
    if path_is_symlink(&podcast_dir)? {
        return Err("supertonic_podcast_dir_must_not_be_symlink".to_string());
    }

    fs::remove_dir_all(&podcast_dir)
        .map_err(|error| format!("supertonic_podcast_delete_failed:{error}"))
}

#[tauri::command]
pub fn latest_supertonic_podcast_tts(
    app: AppHandle,
    request: SupertonicPodcastTtsLookupRequest,
) -> Result<Option<SupertonicPodcastTtsResult>, String> {
    let library_root = app_library_root(&app)?;
    latest_supertonic_podcast_tts_from_root(&library_root, &request.asset_library_path)
}

#[tauri::command]
pub fn latest_supertonic_chat_tts(
    app: AppHandle,
    request: SupertonicChatTtsLookupRequest,
) -> Result<Option<SupertonicChatTtsArtifact>, String> {
    let library_root = app_library_root(&app)?;
    latest_supertonic_chat_tts_from_root(
        &library_root,
        &request.asset_library_path,
        &request.chat_message_id,
    )
}

fn generate_supertonic_chat_tts_blocking(
    app: AppHandle,
    request: SupertonicChatTtsRequest,
) -> Result<SupertonicChatTtsResult, String> {
    let _chat_session_id = request.chat_session_id.as_deref();
    let text = request.text.trim();
    if text.is_empty() {
        return Err("supertonic_text_empty".to_string());
    }

    let library_root = app_library_root(&app)?;
    let app_data = crate::workspace::workspace_root_for_app(&app)?;
    let generation_id = create_generation_id(&request.chat_message_id, text);
    let output_relative_path = chat_tts_audio_relative_path(
        &request.asset_library_path,
        &request.chat_message_id,
        &generation_id,
    )?;
    let output_path = validated_library_output_path(&library_root, &output_relative_path)?;
    let output_parent = output_path
        .parent()
        .ok_or_else(|| "supertonic_output_parent_missing".to_string())?;
    fs::create_dir_all(output_parent)
        .map_err(|error| format!("supertonic_output_dir_create_failed:{error}"))?;

    let model_id = sanitize_tts_model_id(request.model_id.as_deref().unwrap_or(MODEL_REPO_ID))?;
    let language = if is_qwen_tts_model(&model_id) {
        sanitize_qwen_tts_language(request.language.as_deref().unwrap_or(DEFAULT_LANGUAGE))?
    } else {
        sanitize_language(request.language.as_deref().unwrap_or(DEFAULT_LANGUAGE))?
    };

    let (voice_style_id, output) = if is_qwen_tts_model(&model_id) {
        ensure_qwen_tts_supported_on_current_platform()?;
        let preset_voice = sanitize_qwen_preset_voice_id(
            request.qwen_preset_voice_id.as_deref().unwrap_or("default"),
        )?;
        let models_root = app_data.join("models").join("localai");
        fs::create_dir_all(models_root.join("hf"))
            .map_err(|error| format!("localai_model_dir_create_failed:{error}"))?;
        let args = qwen_tts_read_args(
            text,
            &output_path,
            &model_id,
            &preset_voice,
            &language,
            &models_root,
        );
        (preset_voice, run_localai_sidecar(&app, args, &models_root)?)
    } else {
        let voice_style_id = sanitize_voice_style_id(
            request
                .voice_style_id
                .as_deref()
                .unwrap_or(DEFAULT_VOICE_STYLE_ID),
        )?;
        let supertonic_root = app_data.join("supertonic");
        let models_root = app_data.join("models").join("supertonic");
        fs::create_dir_all(models_root.join("hf"))
            .map_err(|error| format!("supertonic_model_dir_create_failed:{error}"))?;
        let args =
            supertonic_read_args(text, &output_path, &voice_style_id, &language, &models_root);
        let output = match run_supertonic_sidecar(&app, args.clone(), &models_root) {
            Ok(output) if output.success => output,
            Ok(output) if cfg!(debug_assertions) && is_dev_placeholder_output(&output) => {
                run_supertonic_python_fallback(&supertonic_root, args, &models_root)?
            }
            Ok(output) => output,
            Err(error) if cfg!(debug_assertions) => {
                log::warn!(
                    target: "openbrief::supertonic",
                    "Supertonic sidecar unavailable in debug build; falling back to app-data Python venv: {}",
                    error,
                );
                run_supertonic_python_fallback(&supertonic_root, args, &models_root)?
            }
            Err(error) => return Err(error),
        };
        (voice_style_id, output)
    };

    if !output.success {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "tts_generate_failed:{}",
            stderr.trim().lines().last().unwrap_or("unknown")
        ));
    }

    let metadata =
        fs::metadata(&output_path).map_err(|error| format!("supertonic_output_missing:{error}"))?;
    if !metadata.is_file() {
        return Err("supertonic_output_not_file".to_string());
    }

    Ok(SupertonicChatTtsResult {
        audio_path: output_relative_path,
        generation_id,
        model_id,
        voice_style_id,
        size_bytes: metadata.len(),
    })
}

fn generate_tts_preview_blocking(
    app: AppHandle,
    request: TtsPreviewRequest,
) -> Result<TtsPreviewResult, String> {
    let text = request.text.trim();
    if text.is_empty() {
        return Err("tts_preview_text_empty".to_string());
    }

    let app_data = crate::workspace::workspace_root_for_app(&app)?;
    let preview_dir = app_data.join("tts-previews");
    fs::create_dir_all(&preview_dir)
        .map_err(|error| format!("tts_preview_dir_create_failed:{error}"))?;
    let preview_id = create_generation_id("tts-preview", text);
    let output_path = preview_dir.join(voice_message_file_name(&preview_id));

    let model_id = sanitize_tts_model_id(request.model_id.as_deref().unwrap_or(MODEL_REPO_ID))?;
    let language = if is_qwen_tts_model(&model_id) {
        sanitize_qwen_tts_language(request.language.as_deref().unwrap_or(DEFAULT_LANGUAGE))?
    } else {
        sanitize_language(request.language.as_deref().unwrap_or(DEFAULT_LANGUAGE))?
    };

    let voice_id = if is_qwen_tts_model(&model_id) {
        ensure_qwen_tts_supported_on_current_platform()?;
        let preset_voice = sanitize_qwen_preset_voice_id(
            request.qwen_preset_voice_id.as_deref().unwrap_or("default"),
        )?;
        let models_root = app_data.join("models").join("localai");
        fs::create_dir_all(models_root.join("hf"))
            .map_err(|error| format!("localai_model_dir_create_failed:{error}"))?;
        let args = qwen_tts_read_args(
            text,
            &output_path,
            &model_id,
            &preset_voice,
            &language,
            &models_root,
        );
        let output = run_localai_sidecar(&app, args, &models_root)?;
        ensure_tts_process_success("tts_preview_generate_failed", output)?;
        preset_voice
    } else {
        let voice_style_id = sanitize_voice_style_id(
            request
                .voice_style_id
                .as_deref()
                .unwrap_or(DEFAULT_VOICE_STYLE_ID),
        )?;
        let supertonic_root = app_data.join("supertonic");
        let models_root = app_data.join("models").join("supertonic");
        fs::create_dir_all(models_root.join("hf"))
            .map_err(|error| format!("supertonic_model_dir_create_failed:{error}"))?;
        let args =
            supertonic_read_args(text, &output_path, &voice_style_id, &language, &models_root);
        let output = match run_supertonic_sidecar(&app, args.clone(), &models_root) {
            Ok(output) if output.success => output,
            Ok(output) if cfg!(debug_assertions) && is_dev_placeholder_output(&output) => {
                run_supertonic_python_fallback(&supertonic_root, args, &models_root)?
            }
            Ok(output) => output,
            Err(error) if cfg!(debug_assertions) => {
                log::warn!(
                    target: "openbrief::supertonic",
                    "Supertonic preview sidecar unavailable in debug build; falling back to app-data Python venv: {}",
                    error,
                );
                run_supertonic_python_fallback(&supertonic_root, args, &models_root)?
            }
            Err(error) => return Err(error),
        };
        ensure_tts_process_success("tts_preview_generate_failed", output)?;
        voice_style_id
    };

    let metadata = fs::metadata(&output_path)
        .map_err(|error| format!("tts_preview_output_missing:{error}"))?;
    if !metadata.is_file() {
        return Err("tts_preview_output_not_file".to_string());
    }
    let audio_bytes = fs::read(&output_path)
        .map_err(|error| format!("tts_preview_output_read_failed:{error}"))?;
    let _ = fs::remove_file(&output_path);

    Ok(TtsPreviewResult {
        model_id,
        voice_id,
        language,
        size_bytes: metadata.len(),
        audio_bytes,
    })
}

fn generate_supertonic_podcast_tts_blocking(
    app: AppHandle,
    request: SupertonicPodcastTtsRequest,
) -> Result<SupertonicPodcastTtsResult, String> {
    if request.turns.is_empty() {
        return Err("supertonic_podcast_turns_empty".to_string());
    }

    let library_root = app_library_root(&app)?;
    let app_data = crate::workspace::workspace_root_for_app(&app)?;
    let model_id = sanitize_tts_model_id(request.model_id.as_deref().unwrap_or(MODEL_REPO_ID))?;
    if is_qwen_tts_model(&model_id) {
        return Err("supertonic_podcast_qwen_tts_unsupported".to_string());
    }
    let language = sanitize_language(request.language.as_deref().unwrap_or(DEFAULT_LANGUAGE))?;
    let podcast_id = sanitize_path_segment(&request.podcast_id);
    let paths = podcast_relative_paths(&request.asset_library_path, &podcast_id)?;
    let podcast_audio_path = validated_library_output_path(&library_root, &paths.audio_path)?;
    let turns_dir = validated_library_output_path(&library_root, &paths.turn_audio_directory)?;
    fs::create_dir_all(&turns_dir)
        .map_err(|error| format!("supertonic_podcast_turns_dir_create_failed:{error}"))?;
    if let Some(parent) = podcast_audio_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("supertonic_podcast_audio_dir_create_failed:{error}"))?;
    }

    let script_path = validated_library_output_path(&library_root, &paths.script_path)?;
    let manifest_path = validated_library_output_path(&library_root, &paths.manifest_path)?;
    if let Some(script_markdown) = request.script_markdown.as_deref() {
        fs::write(&script_path, script_markdown)
            .map_err(|error| format!("supertonic_podcast_script_write_failed:{error}"))?;
    }
    let models_root = app_data.join("models").join("supertonic");
    let supertonic_root = app_data.join("supertonic");
    fs::create_dir_all(models_root.join("hf"))
        .map_err(|error| format!("supertonic_model_dir_create_failed:{error}"))?;

    let mut turn_audio_paths = Vec::with_capacity(request.turns.len());
    for (index, turn) in request.turns.iter().enumerate() {
        let text = turn.text.trim();
        if text.is_empty() {
            return Err("supertonic_podcast_turn_text_empty".to_string());
        }
        let speaker_id = sanitize_podcast_speaker_id(&turn.speaker_id)?;
        let voice_style_id = request
            .speakers
            .iter()
            .find(|speaker| {
                sanitize_podcast_speaker_id(&speaker.id).ok().as_deref()
                    == Some(speaker_id.as_str())
            })
            .map(|speaker| sanitize_voice_style_id(&speaker.voice_style_id))
            .transpose()?
            .unwrap_or_else(|| DEFAULT_VOICE_STYLE_ID.to_string());
        let turn_file_name = podcast_turn_audio_file_name(index, &speaker_id);
        let turn_relative_path = format!("{}/{}", paths.turn_audio_directory, turn_file_name);
        let turn_output_path = validated_library_output_path(&library_root, &turn_relative_path)?;
        let args = supertonic_read_args(
            text,
            &turn_output_path,
            &voice_style_id,
            &language,
            &models_root,
        );
        let output = match run_supertonic_sidecar(&app, args.clone(), &models_root) {
            Ok(output) if output.success => output,
            Ok(output) if cfg!(debug_assertions) && is_dev_placeholder_output(&output) => {
                run_supertonic_python_fallback(&supertonic_root, args, &models_root)?
            }
            Ok(output) => output,
            Err(error) if cfg!(debug_assertions) => {
                log::warn!(
                    target: "openbrief::supertonic",
                    "Supertonic sidecar unavailable in debug build; falling back to app-data Python venv: {}",
                    error,
                );
                run_supertonic_python_fallback(&supertonic_root, args, &models_root)?
            }
            Err(error) => return Err(error),
        };
        if !output.success {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "podcast_tts_generate_failed:{}",
                stderr.trim().lines().last().unwrap_or("unknown")
            ));
        }
        let metadata = fs::metadata(&turn_output_path)
            .map_err(|error| format!("supertonic_podcast_turn_missing:{error}"))?;
        if !metadata.is_file() {
            return Err("supertonic_podcast_turn_not_file".to_string());
        }
        turn_audio_paths.push(turn_relative_path);
    }

    let turn_ids: Vec<String> = request.turns.iter().map(|turn| turn.id.clone()).collect();
    let stitched_audio = stitch_wav_files(
        &turn_audio_paths,
        &turn_ids,
        &library_root,
        &podcast_audio_path,
    )?;
    let metadata = fs::metadata(&podcast_audio_path)
        .map_err(|error| format!("supertonic_podcast_output_missing:{error}"))?;
    if !metadata.is_file() {
        return Err("supertonic_podcast_output_not_file".to_string());
    }

    let result = SupertonicPodcastTtsResult {
        podcast_id,
        audio_path: paths.audio_path,
        script_path: paths.script_path,
        manifest_path: paths.manifest_path,
        turn_audio_paths,
        turn_timings: stitched_audio.turn_timings,
        model_id,
        duration_seconds: stitched_audio.duration_seconds,
        size_bytes: metadata.len(),
    };

    if let Some(manifest_json) = request.manifest_json.as_deref() {
        let manifest_json = podcast_manifest_with_tts_metadata(manifest_json, &result)?;
        fs::write(&manifest_path, manifest_json)
            .map_err(|error| format!("supertonic_podcast_manifest_write_failed:{error}"))?;
    }

    Ok(result)
}

struct SupertonicProcessOutput {
    success: bool,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

fn ensure_tts_process_success(
    error_prefix: &str,
    output: SupertonicProcessOutput,
) -> Result<(), String> {
    if output.success {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "{error_prefix}:{}",
        stderr.trim().lines().last().unwrap_or("unknown")
    ))
}

fn supertonic_read_args(
    text: &str,
    output_path: &Path,
    voice_style_id: &str,
    language: &str,
    models_root: &Path,
) -> Vec<String> {
    vec![
        "read".to_string(),
        "--model".to_string(),
        MODEL_REPO_ID.to_string(),
        "--text".to_string(),
        text.to_string(),
        "--output".to_string(),
        output_path.to_string_lossy().to_string(),
        "--voice-style".to_string(),
        voice_style_id.to_string(),
        "--language".to_string(),
        language.to_string(),
        "--total-steps".to_string(),
        "8".to_string(),
        "--speed".to_string(),
        "1.05".to_string(),
        "--cache-dir".to_string(),
        models_root.join("cache").to_string_lossy().to_string(),
    ]
}

fn qwen_tts_read_args(
    text: &str,
    output_path: &Path,
    model_id: &str,
    preset_voice_id: &str,
    language: &str,
    models_root: &Path,
) -> Vec<String> {
    vec![
        "read".to_string(),
        "--model".to_string(),
        model_id.to_string(),
        "--text".to_string(),
        text.to_string(),
        "--output".to_string(),
        output_path.to_string_lossy().to_string(),
        "--preset-voice".to_string(),
        preset_voice_id.to_string(),
        "--language".to_string(),
        language.to_string(),
        "--cache-dir".to_string(),
        models_root.join("cache").to_string_lossy().to_string(),
    ]
}

fn run_supertonic_sidecar(
    app: &AppHandle,
    args: Vec<String>,
    models_root: &Path,
) -> Result<SupertonicProcessOutput, String> {
    tauri::async_runtime::block_on(async {
        let output = app
            .shell()
            .sidecar(SUPERTONIC_EXTERNAL_BIN_PATH)
            .map_err(|error| format!("supertonic_sidecar_unavailable:{error}"))?
            .args(args)
            .env("HF_HOME", models_root.join("hf"))
            .env("HF_HUB_CACHE", models_root.join("hf").join("hub"))
            .env("SUPERTONIC_MODEL_REPO_ID", MODEL_REPO_ID)
            .output()
            .await
            .map_err(|error| format!("supertonic_sidecar_start_failed:{error}"))?;
        Ok(SupertonicProcessOutput {
            success: output.status.success(),
            stdout: output.stdout,
            stderr: output.stderr,
        })
    })
}

fn run_localai_sidecar(
    app: &AppHandle,
    args: Vec<String>,
    models_root: &Path,
) -> Result<SupertonicProcessOutput, String> {
    tauri::async_runtime::block_on(async {
        let output = app
            .shell()
            .sidecar(LOCALAI_EXTERNAL_BIN_PATH)
            .map_err(|error| format!("localai_sidecar_unavailable:{error}"))?
            .args(args)
            .env("HF_HOME", models_root.join("hf"))
            .env("HF_HUB_CACHE", models_root.join("hf").join("hub"))
            .output()
            .await
            .map_err(|error| format!("localai_sidecar_start_failed:{error}"))?;
        Ok(SupertonicProcessOutput {
            success: output.status.success(),
            stdout: output.stdout,
            stderr: output.stderr,
        })
    })
}

fn run_supertonic_python_fallback(
    supertonic_root: &Path,
    args: Vec<String>,
    models_root: &Path,
) -> Result<SupertonicProcessOutput, String> {
    let runtime = ensure_python_runtime(supertonic_root)?;
    let runner_script = write_runner_script(supertonic_root)?;
    ensure_supertonic_package(&runtime)?;

    let mut command = Command::new(&runtime.python);
    command
        .arg(&runner_script)
        .args(args)
        .env("HF_HOME", models_root.join("hf"))
        .env("HF_HUB_CACHE", models_root.join("hf").join("hub"))
        .env("SUPERTONIC_MODEL_REPO_ID", MODEL_REPO_ID);

    let output = command
        .output()
        .map_err(|error| format!("supertonic_generate_start_failed:{error}"))?;
    Ok(SupertonicProcessOutput {
        success: output.status.success(),
        stdout: output.stdout,
        stderr: output.stderr,
    })
}

fn is_dev_placeholder_output(output: &SupertonicProcessOutput) -> bool {
    String::from_utf8_lossy(&output.stdout).contains("OpenBrief dev")
        || String::from_utf8_lossy(&output.stderr).contains("OpenBrief dev")
}

struct PythonRuntime {
    python: PathBuf,
}

struct PythonBootstrap {
    program: &'static str,
    args: &'static [&'static str],
}

fn ensure_python_runtime(supertonic_root: &Path) -> Result<PythonRuntime, String> {
    let venv_dir = supertonic_root.join("python");
    let python = venv_python(&venv_dir);
    if python.is_file() {
        return Ok(PythonRuntime { python });
    }

    fs::create_dir_all(supertonic_root)
        .map_err(|error| format!("supertonic_runtime_dir_create_failed:{error}"))?;
    let bootstrap = find_system_python()?;
    let output = Command::new(bootstrap.program)
        .args(bootstrap.args)
        .arg("-m")
        .arg("venv")
        .arg(&venv_dir)
        .output()
        .map_err(|error| format!("supertonic_venv_create_start_failed:{error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "supertonic_venv_create_failed:{}",
            stderr.trim().lines().last().unwrap_or("unknown")
        ));
    }

    Ok(PythonRuntime { python })
}

fn ensure_supertonic_package(runtime: &PythonRuntime) -> Result<(), String> {
    if Command::new(&runtime.python)
        .arg("-c")
        .arg("import supertonic")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
    {
        return Ok(());
    }

    let pip_install = Command::new(&runtime.python)
        .arg("-m")
        .arg("pip")
        .arg("install")
        .arg("--upgrade")
        .arg("pip")
        .arg(SUPERTONIC_PACKAGE)
        .output()
        .map_err(|error| format!("supertonic_pip_install_start_failed:{error}"))?;

    if !pip_install.status.success() {
        let stderr = String::from_utf8_lossy(&pip_install.stderr);
        return Err(format!(
            "supertonic_pip_install_failed:{}",
            stderr.trim().lines().last().unwrap_or("unknown")
        ));
    }

    if !Command::new(&runtime.python)
        .arg("-c")
        .arg("import supertonic")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
    {
        return Err("supertonic_import_failed_after_install".to_string());
    }

    Ok(())
}

fn write_runner_script(supertonic_root: &Path) -> Result<PathBuf, String> {
    let runner_dir = supertonic_root.join("runner");
    fs::create_dir_all(&runner_dir)
        .map_err(|error| format!("supertonic_runner_dir_create_failed:{error}"))?;
    let runner_script = runner_dir.join("openbrief_supertonic.py");
    fs::write(&runner_script, RUNNER_SCRIPT)
        .map_err(|error| format!("supertonic_runner_write_failed:{error}"))?;
    Ok(runner_script)
}

fn find_system_python() -> Result<PythonBootstrap, String> {
    let candidates: &[PythonBootstrap] = if cfg!(windows) {
        &[
            PythonBootstrap {
                program: "py",
                args: &["-3"],
            },
            PythonBootstrap {
                program: "python",
                args: &[],
            },
            PythonBootstrap {
                program: "python3",
                args: &[],
            },
        ]
    } else {
        &[
            PythonBootstrap {
                program: "python3",
                args: &[],
            },
            PythonBootstrap {
                program: "python",
                args: &[],
            },
        ]
    };

    for candidate in candidates {
        if Command::new(candidate.program)
            .args(candidate.args)
            .arg("--version")
            .status()
            .is_ok_and(|status| status.success())
        {
            return Ok(PythonBootstrap {
                program: candidate.program,
                args: candidate.args,
            });
        }
    }

    Err("supertonic_python_unavailable".to_string())
}

fn venv_python(venv_dir: &Path) -> PathBuf {
    if cfg!(windows) {
        venv_dir.join("Scripts").join("python.exe")
    } else {
        venv_dir.join("bin").join("python")
    }
}

fn app_library_root(app: &AppHandle) -> Result<PathBuf, String> {
    crate::workspace::library_root_for_app(app)
}

fn chat_tts_audio_relative_path(
    asset_library_path: &str,
    chat_message_id: &str,
    generation_id: &str,
) -> Result<String, String> {
    let asset_dir = asset_directory_from_library_path(asset_library_path)?;
    let file_name = voice_message_file_name(generation_id);
    Ok(format!(
        "{asset_dir}/chat/tts/{}/{generation_id}/{file_name}",
        sanitize_path_segment(chat_message_id),
    ))
}

fn chat_tts_message_relative_path(
    asset_library_path: &str,
    chat_message_id: &str,
) -> Result<String, String> {
    let asset_dir = asset_directory_from_library_path(asset_library_path)?;
    Ok(format!(
        "{asset_dir}/chat/tts/{}",
        sanitize_path_segment(chat_message_id)
    ))
}

struct PodcastRelativePaths {
    audio_path: String,
    script_path: String,
    manifest_path: String,
    turn_audio_directory: String,
}

fn podcast_relative_paths(
    asset_library_path: &str,
    podcast_id: &str,
) -> Result<PodcastRelativePaths, String> {
    let root = podcast_root_relative_path(asset_library_path, podcast_id)?;
    Ok(PodcastRelativePaths {
        audio_path: format!("{root}/audio/podcast.wav"),
        script_path: format!("{root}/script.md"),
        manifest_path: format!("{root}/podcast.json"),
        turn_audio_directory: format!("{root}/audio/turns"),
    })
}

fn podcast_root_relative_path(
    asset_library_path: &str,
    podcast_id: &str,
) -> Result<String, String> {
    let asset_dir = asset_directory_from_library_path(asset_library_path)?;
    Ok(format!(
        "{asset_dir}/podcast/{}",
        sanitize_path_segment(podcast_id)
    ))
}

fn podcast_turn_audio_file_name(index: usize, speaker_id: &str) -> String {
    format!(
        "{:04}-speaker-{}.wav",
        index + 1,
        sanitize_path_segment(speaker_id)
    )
}

fn stitch_wav_files(
    turn_audio_paths: &[String],
    turn_ids: &[String],
    library_root: &Path,
    output_path: &Path,
) -> Result<StitchedPodcastAudio, String> {
    if turn_audio_paths.is_empty() {
        return Err("supertonic_podcast_stitch_inputs_empty".to_string());
    }
    if turn_audio_paths.len() != turn_ids.len() {
        return Err("supertonic_podcast_turn_timing_mismatch".to_string());
    }

    let first_path = validated_library_output_path(library_root, &turn_audio_paths[0])?;
    let first_reader = hound::WavReader::open(&first_path)
        .map_err(|error| format!("supertonic_podcast_wav_read_failed:{error}"))?;
    let spec = first_reader.spec();
    drop(first_reader);

    let mut writer = hound::WavWriter::create(output_path, spec)
        .map_err(|error| format!("supertonic_podcast_wav_create_failed:{error}"))?;
    let mut total_samples: u64 = 0;
    let mut turn_timings = Vec::with_capacity(turn_audio_paths.len());
    let silence_samples = (spec.sample_rate as f32 * 0.25) as u32 * spec.channels as u32;

    for (index, relative_path) in turn_audio_paths.iter().enumerate() {
        let input_path = validated_library_output_path(library_root, relative_path)?;
        let mut reader = hound::WavReader::open(&input_path)
            .map_err(|error| format!("supertonic_podcast_wav_read_failed:{error}"))?;
        if reader.spec() != spec {
            return Err("supertonic_podcast_wav_specs_mismatch".to_string());
        }

        let turn_start_samples = total_samples;
        match spec.sample_format {
            hound::SampleFormat::Float => {
                for sample in reader.samples::<f32>() {
                    writer
                        .write_sample(sample.map_err(|error| {
                            format!("supertonic_podcast_wav_sample_failed:{error}")
                        })?)
                        .map_err(|error| format!("supertonic_podcast_wav_write_failed:{error}"))?;
                    total_samples += 1;
                }
            }
            hound::SampleFormat::Int => {
                for sample in reader.samples::<i32>() {
                    writer
                        .write_sample(sample.map_err(|error| {
                            format!("supertonic_podcast_wav_sample_failed:{error}")
                        })?)
                        .map_err(|error| format!("supertonic_podcast_wav_write_failed:{error}"))?;
                    total_samples += 1;
                }
            }
        }
        let turn_end_samples = total_samples;
        let start_seconds = wav_samples_to_seconds(turn_start_samples, spec);
        let end_seconds = wav_samples_to_seconds(turn_end_samples, spec);
        turn_timings.push(SupertonicPodcastTurnTiming {
            turn_id: turn_ids[index].clone(),
            audio_path: relative_path.clone(),
            start_seconds,
            end_seconds,
            duration_seconds: end_seconds - start_seconds,
        });

        if index + 1 < turn_audio_paths.len() {
            match spec.sample_format {
                hound::SampleFormat::Float => {
                    for _ in 0..silence_samples {
                        writer.write_sample(0.0f32).map_err(|error| {
                            format!("supertonic_podcast_wav_write_failed:{error}")
                        })?;
                        total_samples += 1;
                    }
                }
                hound::SampleFormat::Int => {
                    for _ in 0..silence_samples {
                        writer.write_sample(0i32).map_err(|error| {
                            format!("supertonic_podcast_wav_write_failed:{error}")
                        })?;
                        total_samples += 1;
                    }
                }
            }
        }
    }

    writer
        .finalize()
        .map_err(|error| format!("supertonic_podcast_wav_finalize_failed:{error}"))?;
    Ok(StitchedPodcastAudio {
        duration_seconds: wav_samples_to_seconds(total_samples, spec),
        turn_timings,
    })
}

fn wav_samples_to_seconds(samples: u64, spec: hound::WavSpec) -> f64 {
    samples as f64 / spec.sample_rate as f64 / spec.channels as f64
}

fn podcast_manifest_with_tts_metadata(
    manifest_json: &str,
    result: &SupertonicPodcastTtsResult,
) -> Result<String, String> {
    let mut manifest: Value = serde_json::from_str(manifest_json)
        .map_err(|error| format!("supertonic_podcast_manifest_invalid:{error}"))?;
    let object = manifest
        .as_object_mut()
        .ok_or_else(|| "supertonic_podcast_manifest_must_be_object".to_string())?;

    object.insert(
        "durationSeconds".to_string(),
        json!(result.duration_seconds),
    );
    object.insert("sizeBytes".to_string(), json!(result.size_bytes));
    object.insert(
        "turnTimings".to_string(),
        serde_json::to_value(&result.turn_timings)
            .map_err(|error| format!("supertonic_podcast_manifest_timing_failed:{error}"))?,
    );

    if let Some(artifacts) = object.get_mut("artifacts").and_then(Value::as_object_mut) {
        artifacts.insert("manifestPath".to_string(), json!(result.manifest_path));
        artifacts.insert("scriptPath".to_string(), json!(result.script_path));
        artifacts.insert("podcastAudioPath".to_string(), json!(result.audio_path));
        artifacts.insert("turnAudioPaths".to_string(), json!(result.turn_audio_paths));
    }

    serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("supertonic_podcast_manifest_serialize_failed:{error}"))
}

fn latest_supertonic_chat_tts_from_root(
    library_root: &Path,
    asset_library_path: &str,
    chat_message_id: &str,
) -> Result<Option<SupertonicChatTtsArtifact>, String> {
    let message_relative_path =
        chat_tts_message_relative_path(asset_library_path, chat_message_id)?;
    let message_dir = validated_library_output_path(library_root, &message_relative_path)?;
    reject_existing_relative_symlinks(library_root, Path::new(&message_relative_path))?;

    if !message_dir.exists() {
        return Ok(None);
    }
    if path_is_symlink(&message_dir)? {
        return Err("supertonic_chat_tts_dir_must_not_be_symlink".to_string());
    }

    let metadata = fs::metadata(&message_dir)
        .map_err(|error| format!("supertonic_chat_tts_dir_metadata_failed:{error}"))?;
    if !metadata.is_dir() {
        return Err("supertonic_chat_tts_dir_must_be_directory".to_string());
    }

    let mut latest: Option<(SystemTime, SupertonicChatTtsArtifact)> = None;
    for entry in fs::read_dir(&message_dir)
        .map_err(|error| format!("supertonic_chat_tts_dir_read_failed:{error}"))?
    {
        let entry =
            entry.map_err(|error| format!("supertonic_chat_tts_entry_read_failed:{error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("supertonic_chat_tts_entry_type_failed:{error}"))?;
        if file_type.is_symlink() || !file_type.is_dir() {
            continue;
        }

        let generation_id = entry.file_name().to_string_lossy().to_string();
        let audio_path = latest_voice_message_audio_path(&entry.path(), &generation_id)?;
        if path_is_symlink(&audio_path)? {
            continue;
        }
        let Ok(audio_metadata) = fs::metadata(&audio_path) else {
            continue;
        };
        if !audio_metadata.is_file() {
            continue;
        }

        let modified = audio_metadata.modified().unwrap_or(UNIX_EPOCH);
        let file_name = audio_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "supertonic_chat_tts_audio_name_invalid".to_string())?;
        let artifact = SupertonicChatTtsArtifact {
            audio_path: format!("{message_relative_path}/{generation_id}/{file_name}"),
            generation_id,
            size_bytes: audio_metadata.len(),
        };

        match &latest {
            Some((latest_modified, _)) if modified <= *latest_modified => {}
            _ => latest = Some((modified, artifact)),
        }
    }

    Ok(latest.map(|(_, artifact)| artifact))
}

fn latest_supertonic_podcast_tts_from_root(
    library_root: &Path,
    asset_library_path: &str,
) -> Result<Option<SupertonicPodcastTtsResult>, String> {
    let podcast_parent_relative = format!(
        "{}/podcast",
        asset_directory_from_library_path(asset_library_path)?
    );
    let podcast_parent = validated_library_output_path(library_root, &podcast_parent_relative)?;
    reject_existing_relative_symlinks(library_root, Path::new(&podcast_parent_relative))?;

    if !podcast_parent.exists() {
        return Ok(None);
    }
    if path_is_symlink(&podcast_parent)? {
        return Err("supertonic_podcast_parent_must_not_be_symlink".to_string());
    }

    let mut latest: Option<(SystemTime, SupertonicPodcastTtsResult)> = None;
    for entry in fs::read_dir(&podcast_parent)
        .map_err(|error| format!("supertonic_podcast_parent_read_failed:{error}"))?
    {
        let entry =
            entry.map_err(|error| format!("supertonic_podcast_entry_read_failed:{error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("supertonic_podcast_entry_type_failed:{error}"))?;
        if file_type.is_symlink() || !file_type.is_dir() {
            continue;
        }
        let podcast_id = entry.file_name().to_string_lossy().to_string();
        let paths = podcast_relative_paths(asset_library_path, &podcast_id)?;
        let audio_path = validated_library_output_path(library_root, &paths.audio_path)?;
        let Ok(metadata) = fs::metadata(&audio_path) else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
        let result = SupertonicPodcastTtsResult {
            podcast_id,
            audio_path: paths.audio_path,
            script_path: paths.script_path,
            manifest_path: paths.manifest_path,
            turn_audio_paths: list_podcast_turn_audio_paths(
                library_root,
                &paths.turn_audio_directory,
            )?,
            turn_timings: Vec::new(),
            model_id: MODEL_REPO_ID.to_string(),
            duration_seconds: 0.0,
            size_bytes: metadata.len(),
        };

        match &latest {
            Some((latest_modified, _)) if modified <= *latest_modified => {}
            _ => latest = Some((modified, result)),
        }
    }

    Ok(latest.map(|(_, artifact)| artifact))
}

fn list_podcast_turn_audio_paths(
    library_root: &Path,
    turn_audio_directory: &str,
) -> Result<Vec<String>, String> {
    let turn_dir = validated_library_output_path(library_root, turn_audio_directory)?;
    if !turn_dir.exists() {
        return Ok(Vec::new());
    }

    let mut paths = Vec::new();
    for entry in fs::read_dir(&turn_dir)
        .map_err(|error| format!("supertonic_podcast_turn_dir_read_failed:{error}"))?
    {
        let entry =
            entry.map_err(|error| format!("supertonic_podcast_turn_entry_read_failed:{error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("supertonic_podcast_turn_entry_type_failed:{error}"))?;
        if file_type.is_symlink() || !file_type.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.ends_with(".wav") {
            paths.push(format!("{turn_audio_directory}/{file_name}"));
        }
    }
    paths.sort();
    Ok(paths)
}

fn asset_directory_from_library_path(relative_path: &str) -> Result<String, String> {
    let path = PathBuf::from(relative_path);
    if path.is_absolute() || has_parent_dir_or_absolute_component(&path) {
        return Err("supertonic_asset_path_must_be_library_relative".to_string());
    }

    let mut components = path.components();
    let directory = normal_component(&mut components)
        .ok_or_else(|| "supertonic_asset_path_missing_directory".to_string())?;
    let asset_id = normal_component(&mut components)
        .ok_or_else(|| "supertonic_asset_path_missing_asset_id".to_string())?;

    match directory.as_str() {
        "videos" | "audios" | "pdfs" => Ok(format!("{directory}/{asset_id}")),
        _ => Err("supertonic_asset_path_unsupported_directory".to_string()),
    }
}

fn normal_component(components: &mut std::path::Components<'_>) -> Option<String> {
    match components.next()? {
        Component::Normal(value) => value.to_str().map(ToString::to_string),
        _ => None,
    }
}

fn validated_library_output_path(
    library_root: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let relative = PathBuf::from(relative_path);
    if relative.is_absolute() || has_parent_dir_or_absolute_component(&relative) {
        return Err("supertonic_output_path_must_be_library_relative".to_string());
    }
    let parent_relative = relative
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new(""));
    reject_existing_relative_symlinks(library_root, parent_relative)?;
    Ok(library_root.join(relative))
}

fn reject_existing_relative_symlinks(root: &Path, relative: &Path) -> Result<(), String> {
    let mut current = root.to_path_buf();
    for component in relative.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(segment) => {
                current.push(segment);
                if path_is_symlink(&current)? {
                    return Err("supertonic_output_path_must_not_contain_symlink".to_string());
                }
            }
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err("supertonic_output_path_must_be_library_relative".to_string());
            }
        }
    }
    Ok(())
}

fn path_is_symlink(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(metadata.file_type().is_symlink()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("supertonic_path_metadata_failed:{error}")),
    }
}

fn has_parent_dir_or_absolute_component(path: &Path) -> bool {
    path.components().any(|component| match component {
        Component::ParentDir | Component::Prefix(_) | Component::RootDir => true,
        Component::CurDir | Component::Normal(_) => false,
    })
}

fn sanitize_path_segment(value: &str) -> String {
    let mut sanitized = String::new();
    let mut last_was_dash = false;
    for character in value.chars() {
        let next = if character.is_ascii_alphanumeric() {
            character.to_ascii_lowercase()
        } else {
            '-'
        };
        if next == '-' {
            if !last_was_dash && !sanitized.is_empty() {
                sanitized.push(next);
            }
            last_was_dash = true;
        } else {
            sanitized.push(next);
            last_was_dash = false;
        }
    }
    let sanitized = sanitized.trim_matches('-');
    if sanitized.is_empty() {
        "item".to_string()
    } else {
        sanitized.chars().take(96).collect()
    }
}

fn sanitize_voice_style_id(value: &str) -> Result<String, String> {
    let sanitized = sanitize_path_segment(value).to_ascii_uppercase();
    match sanitized.as_str() {
        "M1" | "M2" | "M3" | "M4" | "M5" | "F1" | "F2" | "F3" | "F4" | "F5" => Ok(sanitized),
        _ => Err("supertonic_voice_style_unsupported".to_string()),
    }
}

fn sanitize_podcast_speaker_id(value: &str) -> Result<String, String> {
    match value.trim().to_ascii_uppercase().as_str() {
        "A" => Ok("a".to_string()),
        "B" => Ok("b".to_string()),
        _ => Err("supertonic_podcast_speaker_unsupported".to_string()),
    }
}

fn sanitize_tts_model_id(value: &str) -> Result<String, String> {
    let value = value.trim();
    match value {
        MODEL_REPO_ID | QWEN_TTS_06B_MODEL_ID | QWEN_TTS_17B_MODEL_ID => Ok(value.to_string()),
        _ => Err("tts_model_unsupported".to_string()),
    }
}

fn is_qwen_tts_model(model_id: &str) -> bool {
    matches!(model_id, QWEN_TTS_06B_MODEL_ID | QWEN_TTS_17B_MODEL_ID)
}

fn qwen_tts_supported_for_target_os(target_os: &str) -> bool {
    target_os != "linux"
}

fn qwen_tts_supported_on_current_platform() -> bool {
    qwen_tts_supported_for_target_os(std::env::consts::OS)
}

fn ensure_qwen_tts_supported_on_current_platform() -> Result<(), String> {
    if qwen_tts_supported_on_current_platform() {
        Ok(())
    } else {
        Err("qwen_tts_unsupported_platform".to_string())
    }
}

fn sanitize_qwen_preset_voice_id(value: &str) -> Result<String, String> {
    match value.trim() {
        "default" => Ok("default".to_string()),
        _ => Err("qwen_tts_preset_voice_unsupported".to_string()),
    }
}

fn sanitize_language(value: &str) -> Result<String, String> {
    let value = value.trim().to_ascii_lowercase();
    if value == "na" || (value.len() == 2 && value.chars().all(|c| c.is_ascii_lowercase())) {
        Ok(value)
    } else {
        Err("supertonic_language_unsupported".to_string())
    }
}

fn sanitize_qwen_tts_language(value: &str) -> Result<String, String> {
    let value = value.trim().to_ascii_lowercase();
    match value.as_str() {
        "zh" | "en" | "ja" | "ko" | "de" | "fr" | "ru" | "pt" | "es" | "it" => Ok(value),
        _ => Err("qwen_tts_language_unsupported".to_string()),
    }
}

fn create_generation_id(_chat_message_id: &str, _text: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("voice-message-{nanos}")
}

fn voice_message_file_name(generation_id: &str) -> String {
    format!("{generation_id}.wav")
}

fn latest_voice_message_audio_path(
    generation_dir: &Path,
    generation_id: &str,
) -> Result<PathBuf, String> {
    let named_audio = generation_dir.join(voice_message_file_name(generation_id));
    if named_audio.exists() || path_is_symlink(&named_audio)? {
        return Ok(named_audio);
    }

    Ok(generation_dir.join("audio.wav"))
}

fn tts_voice_catalog_from_app_data(app_data: &Path) -> Vec<TtsVoiceCatalogModel> {
    tts_voice_catalog_from_app_data_for_target(app_data, std::env::consts::OS)
}

fn tts_voice_catalog_from_app_data_for_target(
    app_data: &Path,
    target_os: &str,
) -> Vec<TtsVoiceCatalogModel> {
    let supertonic_downloaded = tts_model_downloaded(app_data, MODEL_REPO_ID);
    let qwen_06b_downloaded = tts_model_downloaded(app_data, QWEN_TTS_06B_MODEL_ID);
    let qwen_17b_downloaded = tts_model_downloaded(app_data, QWEN_TTS_17B_MODEL_ID);

    let mut catalog = vec![TtsVoiceCatalogModel {
        id: MODEL_REPO_ID.to_string(),
        name: "Supertonic 3".to_string(),
        engine: "supertonic".to_string(),
        downloaded: supertonic_downloaded,
        voices: supertonic_voice_catalog(supertonic_downloaded),
    }];

    if qwen_tts_supported_for_target_os(target_os) {
        catalog.extend([
            TtsVoiceCatalogModel {
                id: QWEN_TTS_06B_MODEL_ID.to_string(),
                name: "Qwen3-TTS 0.6B".to_string(),
                engine: "qwen".to_string(),
                downloaded: qwen_06b_downloaded,
                voices: qwen_voice_catalog(qwen_06b_downloaded),
            },
            TtsVoiceCatalogModel {
                id: QWEN_TTS_17B_MODEL_ID.to_string(),
                name: "Qwen3-TTS 1.7B".to_string(),
                engine: "qwen".to_string(),
                downloaded: qwen_17b_downloaded,
                voices: qwen_voice_catalog(qwen_17b_downloaded),
            },
        ]);
    }

    catalog
}

fn supertonic_voice_catalog(downloaded: bool) -> Vec<TtsVoiceCatalogVoice> {
    [
        ("M1", "Mark (M1)"),
        ("M2", "David (M2)"),
        ("M3", "Daniel (M3)"),
        ("M4", "James (M4)"),
        ("M5", "Lucas (M5)"),
        ("F1", "Emma (F1)"),
        ("F2", "Sophia (F2)"),
        ("F3", "Olivia (F3)"),
        ("F4", "Ava (F4)"),
        ("F5", "Mia (F5)"),
    ]
    .into_iter()
    .map(|(id, label)| TtsVoiceCatalogVoice {
        id: id.to_string(),
        label: label.to_string(),
        downloaded,
    })
    .collect()
}

fn qwen_voice_catalog(downloaded: bool) -> Vec<TtsVoiceCatalogVoice> {
    vec![TtsVoiceCatalogVoice {
        id: "default".to_string(),
        label: "Default".to_string(),
        downloaded,
    }]
}

fn tts_model_downloaded(app_data: &Path, model_id: &str) -> bool {
    match model_id {
        MODEL_REPO_ID => {
            let models_root = app_data.join("models").join("supertonic");
            hf_repo_cache_exists(&models_root, "Supertone/supertonic-3")
                || non_empty_dir(&models_root.join("cache"))
        }
        QWEN_TTS_06B_MODEL_ID => {
            let models_root = app_data.join("models").join("localai");
            hf_repo_cache_exists(&models_root, "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16")
                || hf_repo_cache_exists(&models_root, "Qwen/Qwen3-TTS-12Hz-0.6B-Base")
        }
        QWEN_TTS_17B_MODEL_ID => {
            let models_root = app_data.join("models").join("localai");
            hf_repo_cache_exists(&models_root, "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16")
                || hf_repo_cache_exists(&models_root, "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
        }
        _ => false,
    }
}

fn hf_repo_cache_exists(models_root: &Path, repo_id: &str) -> bool {
    let repo_cache = models_root
        .join("hf")
        .join("hub")
        .join(format!("models--{}", repo_id.replace('/', "--")));

    non_empty_dir(&repo_cache.join("snapshots")) || non_empty_dir(&repo_cache)
}

fn non_empty_dir(path: &Path) -> bool {
    fs::read_dir(path)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_chat_tts_path_inside_source_asset_directory() {
        let path = chat_tts_audio_relative_path(
            "audios/audio-1/source.mp3",
            "chat-audio-1-assistant-2026-05-23T00:00:00.000Z",
            "voice-message-123",
        )
        .unwrap();

        assert_eq!(
            path,
            "audios/audio-1/chat/tts/chat-audio-1-assistant-2026-05-23t00-00-00-000z/voice-message-123/voice-message-123.wav"
        );
    }

    #[test]
    fn builds_podcast_paths_inside_source_asset_directory() {
        let paths = podcast_relative_paths("pdfs/pdf-1/source.pdf", "podcast-2026-05-24").unwrap();

        assert_eq!(
            paths.manifest_path,
            "pdfs/pdf-1/podcast/podcast-2026-05-24/podcast.json"
        );
        assert_eq!(
            paths.script_path,
            "pdfs/pdf-1/podcast/podcast-2026-05-24/script.md"
        );
        assert_eq!(
            paths.audio_path,
            "pdfs/pdf-1/podcast/podcast-2026-05-24/audio/podcast.wav"
        );
        assert_eq!(
            paths.turn_audio_directory,
            "pdfs/pdf-1/podcast/podcast-2026-05-24/audio/turns"
        );
    }

    #[test]
    fn stitches_podcast_turns_with_turn_timings() {
        let library_root = std::env::temp_dir().join(format!(
            "openbrief-supertonic-stitch-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let first = "videos/video-1/podcast/podcast-1/audio/turns/0001-speaker-a.wav";
        let second = "videos/video-1/podcast/podcast-1/audio/turns/0002-speaker-b.wav";
        let output = library_root.join("videos/video-1/podcast/podcast-1/audio/podcast.wav");
        write_test_wav(&library_root.join(first), 4);
        write_test_wav(&library_root.join(second), 8);

        let stitched = stitch_wav_files(
            &[first.to_string(), second.to_string()],
            &["turn-0001".to_string(), "turn-0002".to_string()],
            &library_root,
            &output,
        )
        .unwrap();

        assert!((stitched.duration_seconds - 3.25).abs() < 0.001);
        assert_eq!(stitched.turn_timings[0].turn_id, "turn-0001");
        assert_eq!(stitched.turn_timings[0].start_seconds, 0.0);
        assert!((stitched.turn_timings[0].end_seconds - 1.0).abs() < 0.001);
        assert!((stitched.turn_timings[1].start_seconds - 1.25).abs() < 0.001);
        assert!((stitched.turn_timings[1].end_seconds - 3.25).abs() < 0.001);

        fs::remove_dir_all(library_root).unwrap();
    }

    #[test]
    fn writes_tts_metadata_into_podcast_manifest() {
        let result = SupertonicPodcastTtsResult {
            podcast_id: "podcast-1".to_string(),
            audio_path: "videos/video-1/podcast/podcast-1/audio/podcast.wav".to_string(),
            script_path: "videos/video-1/podcast/podcast-1/script.md".to_string(),
            manifest_path: "videos/video-1/podcast/podcast-1/podcast.json".to_string(),
            turn_audio_paths: vec![
                "videos/video-1/podcast/podcast-1/audio/turns/0001-speaker-a.wav".to_string(),
            ],
            turn_timings: vec![SupertonicPodcastTurnTiming {
                turn_id: "turn-0001".to_string(),
                audio_path: "videos/video-1/podcast/podcast-1/audio/turns/0001-speaker-a.wav"
                    .to_string(),
                start_seconds: 0.0,
                end_seconds: 1.5,
                duration_seconds: 1.5,
            }],
            model_id: MODEL_REPO_ID.to_string(),
            duration_seconds: 1.5,
            size_bytes: 128,
        };

        let manifest = podcast_manifest_with_tts_metadata(
            r#"{"schemaVersion":1,"id":"podcast-1","artifacts":{}}"#,
            &result,
        )
        .unwrap();
        let value: Value = serde_json::from_str(&manifest).unwrap();

        assert_eq!(value["durationSeconds"], json!(1.5));
        assert_eq!(value["sizeBytes"], json!(128));
        assert_eq!(value["turnTimings"][0]["turnId"], json!("turn-0001"));
        assert_eq!(
            value["artifacts"]["podcastAudioPath"],
            json!("videos/video-1/podcast/podcast-1/audio/podcast.wav")
        );
    }

    #[test]
    fn builds_sidecar_read_args_with_model_cache_dir() {
        let args = supertonic_read_args(
            "Welcome to OpenBrief",
            Path::new("/tmp/openbrief/audio.wav"),
            "M1",
            "en",
            Path::new("/tmp/openbrief/models/supertonic"),
        );

        assert_eq!(args[0], "read");
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--model" && pair[1] == MODEL_REPO_ID));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--text" && pair[1] == "Welcome to OpenBrief"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--cache-dir"
                && pair[1] == "/tmp/openbrief/models/supertonic/cache"));
    }

    #[test]
    fn builds_qwen_sidecar_read_args_with_model_cache_dir() {
        let args = qwen_tts_read_args(
            "Welcome to OpenBrief",
            Path::new("/tmp/openbrief/audio.wav"),
            QWEN_TTS_06B_MODEL_ID,
            "default",
            "en",
            Path::new("/tmp/openbrief/models/localai"),
        );

        assert_eq!(args[0], "read");
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--model" && pair[1] == QWEN_TTS_06B_MODEL_ID));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--preset-voice" && pair[1] == "default"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--language" && pair[1] == "en"));
        assert!(args.windows(2).any(
            |pair| pair[0] == "--cache-dir" && pair[1] == "/tmp/openbrief/models/localai/cache"
        ));
    }

    #[test]
    fn rejects_qwen_unsupported_languages() {
        assert_eq!(
            sanitize_qwen_tts_language("ar").unwrap_err(),
            "qwen_tts_language_unsupported"
        );
    }

    #[test]
    fn qwen_tts_is_disabled_on_linux() {
        assert!(!qwen_tts_supported_for_target_os("linux"));
        assert!(qwen_tts_supported_for_target_os("macos"));
        assert!(qwen_tts_supported_for_target_os("windows"));
    }

    #[test]
    fn marks_cached_tts_models_as_downloaded() {
        let app_data = std::env::temp_dir().join(format!(
            "openbrief-tts-catalog-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let supertonic_snapshot = app_data
            .join("models/supertonic/hf/hub/models--Supertone--supertonic-3/snapshots/revision");
        let qwen_snapshot = app_data.join(
            "models/localai/hf/hub/models--Qwen--Qwen3-TTS-12Hz-0.6B-Base/snapshots/revision",
        );
        fs::create_dir_all(&supertonic_snapshot).unwrap();
        fs::write(supertonic_snapshot.join("model.bin"), b"model").unwrap();
        fs::create_dir_all(&qwen_snapshot).unwrap();
        fs::write(qwen_snapshot.join("model.bin"), b"model").unwrap();

        let catalog = tts_voice_catalog_from_app_data_for_target(&app_data, "macos");

        assert_eq!(catalog[0].id, MODEL_REPO_ID);
        assert!(catalog[0].downloaded);
        assert!(catalog[0].voices.iter().all(|voice| voice.downloaded));
        assert!(catalog[1].downloaded);
        assert!(!catalog[2].downloaded);

        fs::remove_dir_all(app_data).unwrap();
    }

    #[test]
    fn linux_tts_catalog_excludes_qwen_models() {
        let app_data = std::env::temp_dir().join(format!(
            "openbrief-tts-linux-catalog-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&app_data).unwrap();

        let catalog = tts_voice_catalog_from_app_data_for_target(&app_data, "linux");

        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].id, MODEL_REPO_ID);

        fs::remove_dir_all(app_data).unwrap();
    }

    #[test]
    fn finds_latest_chat_tts_audio_inside_message_directory() {
        let library_root = std::env::temp_dir().join(format!(
            "openbrief-supertonic-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let first_audio =
            library_root.join("videos/video-1/chat/tts/chat-1/voice-message-1/voice-message-1.wav");
        let second_audio =
            library_root.join("videos/video-1/chat/tts/chat-1/voice-message-2/voice-message-2.wav");
        fs::create_dir_all(first_audio.parent().unwrap()).unwrap();
        fs::write(&first_audio, b"first").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        fs::create_dir_all(second_audio.parent().unwrap()).unwrap();
        fs::write(&second_audio, b"second").unwrap();

        let artifact = latest_supertonic_chat_tts_from_root(
            &library_root,
            "videos/video-1/source.mp4",
            "chat-1",
        )
        .unwrap()
        .unwrap();

        assert_eq!(
            artifact.audio_path,
            "videos/video-1/chat/tts/chat-1/voice-message-2/voice-message-2.wav"
        );
        assert_eq!(artifact.generation_id, "voice-message-2");
        assert_eq!(artifact.size_bytes, 6);

        fs::remove_dir_all(library_root).unwrap();
    }

    #[test]
    fn finds_legacy_audio_wav_inside_message_directory() {
        let library_root = std::env::temp_dir().join(format!(
            "openbrief-supertonic-legacy-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let legacy_audio = library_root.join("videos/video-1/chat/tts/chat-1/tts-1/audio.wav");
        fs::create_dir_all(legacy_audio.parent().unwrap()).unwrap();
        fs::write(&legacy_audio, b"legacy").unwrap();

        let artifact = latest_supertonic_chat_tts_from_root(
            &library_root,
            "videos/video-1/source.mp4",
            "chat-1",
        )
        .unwrap()
        .unwrap();

        assert_eq!(
            artifact.audio_path,
            "videos/video-1/chat/tts/chat-1/tts-1/audio.wav"
        );
        assert_eq!(artifact.generation_id, "tts-1");
        assert_eq!(artifact.size_bytes, 6);

        fs::remove_dir_all(library_root).unwrap();
    }

    #[test]
    fn rejects_non_asset_library_directories() {
        assert_eq!(
            asset_directory_from_library_path("summaries/video-1.md").unwrap_err(),
            "supertonic_asset_path_unsupported_directory"
        );
    }

    #[test]
    fn rejects_traversal_asset_paths() {
        assert_eq!(
            asset_directory_from_library_path("../videos/video-1/source.mp4").unwrap_err(),
            "supertonic_asset_path_must_be_library_relative"
        );
    }

    fn write_test_wav(path: &Path, sample_count: usize) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 4,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(path, spec).unwrap();
        for _ in 0..sample_count {
            writer.write_sample(1i16).unwrap();
        }
        writer.finalize().unwrap();
    }
}
