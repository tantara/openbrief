use futures_util::StreamExt;
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SttModelCatalog {
    models: Vec<SttModelInfo>,
    download_requires_user_confirmation: bool,
    storage: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SttModelInfo {
    id: &'static str,
    name: &'static str,
    engine: &'static str,
    file_name: &'static str,
    download_url: &'static str,
    sha1: &'static str,
    size_mb: u64,
    downloaded: bool,
    downloads_on_demand: bool,
    recommended: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SttModelDownloadResult {
    model_id: &'static str,
    file_name: &'static str,
    downloaded: bool,
    sha1: String,
    size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SttModelDownloadProgress {
    model_id: &'static str,
    file_name: &'static str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    progress: f32,
}

#[derive(Debug, Clone, Copy)]
struct SttModelDefinition {
    id: &'static str,
    name: &'static str,
    engine: &'static str,
    file_name: &'static str,
    download_url: &'static str,
    sha1: &'static str,
    size_mb: u64,
    downloads_on_demand: bool,
    recommended: bool,
}

const WHISPER_MODELS: [SttModelDefinition; 6] = [
    SttModelDefinition {
        id: "whisper-tiny",
        name: "Whisper Tiny",
        engine: "whisper.cpp",
        file_name: "ggml-tiny.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        sha1: "bd577a113a864445d4c299885e0cb97d4ba92b5f",
        size_mb: 75,
        downloads_on_demand: false,
        recommended: false,
    },
    SttModelDefinition {
        id: "whisper-base",
        name: "Whisper Base",
        engine: "whisper.cpp",
        file_name: "ggml-base.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        sha1: "465707469ff3a37a2b9b8d8f89f2f99de7299dac",
        size_mb: 142,
        downloads_on_demand: false,
        recommended: false,
    },
    SttModelDefinition {
        id: "whisper-small",
        name: "Whisper Small",
        engine: "whisper.cpp",
        file_name: "ggml-small.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        sha1: "55356645c2b361a969dfd0ef2c5a50d530afd8d5",
        size_mb: 466,
        downloads_on_demand: false,
        recommended: true,
    },
    SttModelDefinition {
        id: "whisper-medium",
        name: "Whisper Medium",
        engine: "whisper.cpp",
        file_name: "ggml-medium.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
        sha1: "fd9727b6e1217c2f614f9b698455c4ffd82463b4",
        size_mb: 1536,
        downloads_on_demand: false,
        recommended: false,
    },
    SttModelDefinition {
        id: "whisper-large-v3-turbo-q5",
        name: "Whisper Large v3 Turbo Q5",
        engine: "whisper.cpp",
        file_name: "ggml-large-v3-turbo-q5_0.bin",
        download_url:
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
        sha1: "e050f7970618a659205450ad97eb95a18d69c9ee",
        size_mb: 547,
        downloads_on_demand: false,
        recommended: false,
    },
    SttModelDefinition {
        id: "whisper-large-v3-turbo",
        name: "Whisper Large v3 Turbo",
        engine: "whisper.cpp",
        file_name: "ggml-large-v3-turbo.bin",
        download_url:
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
        sha1: "4af2b29d7ec73d781377bfd1758ca957a807e941",
        size_mb: 1536,
        downloads_on_demand: false,
        recommended: false,
    },
];

const PARAKEET_V3_MODEL: SttModelDefinition = SttModelDefinition {
    id: crate::fluidaudio::PARAKEET_V3_MODEL_ID,
    name: "Parakeet v3",
    engine: crate::fluidaudio::PARAKEET_V3_ENGINE,
    file_name: crate::fluidaudio::PARAKEET_V3_MODEL_DIR,
    download_url: "FluidInference/parakeet-tdt-0.6b-v3-coreml",
    sha1: "directory-managed-by-fluidaudio",
    size_mb: crate::fluidaudio::PARAKEET_V3_SIZE_MB,
    downloads_on_demand: false,
    recommended: true,
};

const QWEN_ASR_MODELS: [SttModelDefinition; 2] = [
    SttModelDefinition {
        id: crate::qwen_asr::QWEN_ASR_06B_MODEL_ID,
        name: "Qwen3-ASR 0.6B + ForcedAligner",
        engine: crate::qwen_asr::QWEN_ASR_ENGINE,
        file_name: crate::qwen_asr::QWEN_ASR_06B_MODEL_DIR,
        download_url: "Qwen/Qwen3-ASR-0.6B + Qwen/Qwen3-ForcedAligner-0.6B",
        sha1: "sidecar-downloads-on-demand",
        size_mb: crate::qwen_asr::QWEN_ASR_06B_SIZE_MB,
        downloads_on_demand: true,
        recommended: true,
    },
    SttModelDefinition {
        id: crate::qwen_asr::QWEN_ASR_17B_MODEL_ID,
        name: "Qwen3-ASR 1.7B + ForcedAligner",
        engine: crate::qwen_asr::QWEN_ASR_ENGINE,
        file_name: crate::qwen_asr::QWEN_ASR_17B_MODEL_DIR,
        download_url: "Qwen/Qwen3-ASR-1.7B + Qwen/Qwen3-ForcedAligner-0.6B",
        sha1: "sidecar-downloads-on-demand",
        size_mb: crate::qwen_asr::QWEN_ASR_17B_SIZE_MB,
        downloads_on_demand: true,
        recommended: false,
    },
];

#[tauri::command]
pub fn stt_model_catalog<R: Runtime>(app: AppHandle<R>) -> Result<SttModelCatalog, String> {
    let models_dir = models_dir_for_app(&app)?;
    Ok(catalog_for_models_dir(&models_dir))
}

#[tauri::command]
pub async fn download_stt_model<R: Runtime>(
    app: AppHandle<R>,
    model_id: String,
    user_confirmed: bool,
) -> Result<SttModelDownloadResult, String> {
    if !user_confirmed {
        return Err("stt_model_download_requires_user_confirmation".to_string());
    }

    let model = model_by_id(&model_id)?;
    let models_dir = models_dir_for_app(&app)?;
    download_model_to_dir(&app, model, &models_dir).await
}

fn catalog_for_models_dir(models_dir: &Path) -> SttModelCatalog {
    catalog_for_models_dir_with_fluidaudio(
        models_dir,
        crate::fluidaudio::can_use_fluidaudio_sidecar(),
    )
}

fn catalog_for_models_dir_with_fluidaudio(
    models_dir: &Path,
    parakeet_available: bool,
) -> SttModelCatalog {
    let mut models = Vec::new();
    models.extend(QWEN_ASR_MODELS.iter().map(|model| SttModelInfo {
        id: model.id,
        name: model.name,
        engine: model.engine,
        file_name: model.file_name,
        download_url: model.download_url,
        sha1: model.sha1,
        size_mb: model.size_mb,
        downloaded: crate::qwen_asr::qwen_asr_model_downloaded(models_dir, model.id),
        downloads_on_demand: model.downloads_on_demand,
        recommended: model.recommended,
    }));

    if parakeet_available {
        models.push(SttModelInfo {
            id: PARAKEET_V3_MODEL.id,
            name: PARAKEET_V3_MODEL.name,
            engine: PARAKEET_V3_MODEL.engine,
            file_name: PARAKEET_V3_MODEL.file_name,
            download_url: PARAKEET_V3_MODEL.download_url,
            sha1: PARAKEET_V3_MODEL.sha1,
            size_mb: PARAKEET_V3_MODEL.size_mb,
            downloaded: crate::fluidaudio::parakeet_model_downloaded(models_dir),
            downloads_on_demand: PARAKEET_V3_MODEL.downloads_on_demand,
            recommended: false,
        });
    }

    models.extend(WHISPER_MODELS.iter().map(|model| SttModelInfo {
        id: model.id,
        name: model.name,
        engine: model.engine,
        file_name: model.file_name,
        download_url: model.download_url,
        sha1: model.sha1,
        size_mb: model.size_mb,
        downloaded: models_dir.join(model.file_name).is_file(),
        downloads_on_demand: model.downloads_on_demand,
        recommended: false,
    }));

    SttModelCatalog {
        models,
        download_requires_user_confirmation: true,
        storage: "app-data/models",
    }
}

fn model_by_id(model_id: &str) -> Result<&'static SttModelDefinition, String> {
    model_by_id_with_fluidaudio(model_id, crate::fluidaudio::can_use_fluidaudio_sidecar())
}

fn model_by_id_with_fluidaudio(
    model_id: &str,
    parakeet_available: bool,
) -> Result<&'static SttModelDefinition, String> {
    if parakeet_available && model_id == PARAKEET_V3_MODEL.id {
        return Ok(&PARAKEET_V3_MODEL);
    }

    if let Some(model) = QWEN_ASR_MODELS.iter().find(|model| model.id == model_id) {
        return Ok(model);
    }

    WHISPER_MODELS
        .iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| "stt_model_unknown".to_string())
}

fn models_dir_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let models_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir_unavailable:{error}"))?
        .join("models");

    fs::create_dir_all(&models_dir).map_err(|error| format!("models_dir_create_failed:{error}"))?;
    models_dir
        .canonicalize()
        .map_err(|error| format!("models_dir_invalid:{error}"))
}

async fn download_model_to_dir(
    app: &AppHandle<impl Runtime>,
    model: &SttModelDefinition,
    models_dir: &Path,
) -> Result<SttModelDownloadResult, String> {
    fs::create_dir_all(models_dir).map_err(|error| format!("models_dir_create_failed:{error}"))?;

    if model.id == crate::fluidaudio::PARAKEET_V3_MODEL_ID {
        let (sha1, size_bytes) =
            crate::fluidaudio::download_parakeet_model(app, models_dir).await?;
        emit_download_progress(app, model, size_bytes, Some(size_bytes));
        return Ok(SttModelDownloadResult {
            model_id: model.id,
            file_name: model.file_name,
            downloaded: true,
            sha1,
            size_bytes,
        });
    }

    if crate::qwen_asr::is_qwen_asr_model_id(Some(model.id)) {
        let (sha1, size_bytes) =
            crate::qwen_asr::mark_qwen_asr_model_ready(models_dir, model.id).await?;
        emit_download_progress(app, model, size_bytes, Some(size_bytes));
        return Ok(SttModelDownloadResult {
            model_id: model.id,
            file_name: model.file_name,
            downloaded: crate::qwen_asr::qwen_asr_model_downloaded(models_dir, model.id),
            sha1,
            size_bytes,
        });
    }

    let destination = models_dir.join(model.file_name);
    if destination.is_file() {
        let (sha1, size_bytes) = verify_model_file(&destination, model.sha1)?;
        emit_download_progress(app, model, size_bytes, Some(size_bytes));
        return Ok(SttModelDownloadResult {
            model_id: model.id,
            file_name: model.file_name,
            downloaded: true,
            sha1,
            size_bytes,
        });
    }

    let partial = models_dir.join(format!("{}.partial", model.file_name));
    let response = reqwest::get(model.download_url)
        .await
        .map_err(|error| format!("stt_model_download_start_failed:{error}"))?
        .error_for_status()
        .map_err(|error| format!("stt_model_download_failed:{error}"))?;
    let total_bytes = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file =
        fs::File::create(&partial).map_err(|error| format!("stt_model_create_failed:{error}"))?;
    let mut downloaded_bytes = 0_u64;
    emit_download_progress(app, model, downloaded_bytes, total_bytes);

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("stt_model_download_stream_failed:{error}"))?;
        downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
        file.write_all(&chunk)
            .map_err(|error| format!("stt_model_write_failed:{error}"))?;
        emit_download_progress(app, model, downloaded_bytes, total_bytes);
    }

    file.flush()
        .map_err(|error| format!("stt_model_flush_failed:{error}"))?;
    drop(file);

    let (sha1, size_bytes) = verify_model_file(&partial, model.sha1)?;
    fs::rename(&partial, &destination)
        .map_err(|error| format!("stt_model_rename_failed:{error}"))?;
    emit_download_progress(app, model, size_bytes, Some(size_bytes));

    Ok(SttModelDownloadResult {
        model_id: model.id,
        file_name: model.file_name,
        downloaded: true,
        sha1,
        size_bytes,
    })
}

fn emit_download_progress<R: Runtime>(
    app: &AppHandle<R>,
    model: &SttModelDefinition,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
) {
    let progress = total_bytes
        .filter(|total| *total > 0)
        .map(|total| downloaded_bytes as f32 / total as f32)
        .unwrap_or(0.0)
        .clamp(0.0, 1.0);

    let _ = app.emit(
        "openbrief://stt-model-download-progress",
        SttModelDownloadProgress {
            model_id: model.id,
            file_name: model.file_name,
            downloaded_bytes,
            total_bytes,
            progress,
        },
    );
}

fn verify_model_file(path: &Path, expected_sha1: &str) -> Result<(String, u64), String> {
    let bytes = fs::read(path).map_err(|error| format!("stt_model_read_failed:{error}"))?;
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    let sha1 = format!("{:x}", hasher.finalize());

    if sha1 != expected_sha1 {
        return Err("stt_model_checksum_mismatch".to_string());
    }

    Ok((sha1, bytes.len() as u64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_requires_confirmation_and_uses_app_data_storage() {
        let root = temp_models_dir();
        let catalog = catalog_for_models_dir(&root);

        assert!(catalog.download_requires_user_confirmation);
        assert_eq!(catalog.storage, "app-data/models");
        assert!(catalog.models.len() > 1);

        let default_model = catalog
            .models
            .iter()
            .find(|model| model.recommended)
            .unwrap();
        assert_eq!(default_model.engine, crate::qwen_asr::QWEN_ASR_ENGINE);
        assert_eq!(default_model.id, crate::qwen_asr::QWEN_ASR_06B_MODEL_ID);
        assert!(default_model.recommended);
        assert!(!default_model.downloaded);
        assert!(default_model.downloads_on_demand);
    }

    #[test]
    fn catalog_marks_model_downloaded_by_file_name() {
        let root = temp_models_dir();
        fs::write(root.join("ggml-small.bin"), b"placeholder").unwrap();

        let catalog = catalog_for_models_dir(&root);

        let small = catalog
            .models
            .iter()
            .find(|model| model.id == "whisper-small")
            .unwrap();
        assert!(small.downloaded);
    }

    #[test]
    fn catalog_marks_parakeet_downloaded_by_fluidaudio_directory() {
        if !crate::fluidaudio::can_use_fluidaudio_sidecar() {
            return;
        }

        let root = temp_models_dir();
        let model_dir = crate::fluidaudio::parakeet_model_dir(&root);
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

        let catalog = catalog_for_models_dir(&root);

        let parakeet = catalog
            .models
            .iter()
            .find(|model| model.id == "parakeet-tdt-0.6b-v3")
            .unwrap();
        assert!(parakeet.downloaded);
    }

    #[test]
    fn catalog_includes_parakeet_only_for_supported_fluidaudio_platforms() {
        let cases = [
            ("macOS Apple Silicon", "macos", "aarch64", Some(14), true),
            ("macOS Intel", "macos", "x86_64", Some(15), false),
            ("Windows", "windows", "x86_64", None, false),
            ("Linux x64", "linux", "x86_64", None, false),
            ("Linux arm64", "linux", "aarch64", None, false),
        ];

        for (label, os, arch, macos_major, expected_parakeet) in cases {
            let root = temp_models_dir();
            let parakeet_available =
                crate::fluidaudio::can_use_fluidaudio_sidecar_for_target(os, arch, macos_major);
            let catalog = catalog_for_models_dir_with_fluidaudio(&root, parakeet_available);
            let has_parakeet = catalog
                .models
                .iter()
                .any(|model| model.id == crate::fluidaudio::PARAKEET_V3_MODEL_ID);

            assert_eq!(has_parakeet, expected_parakeet, "{label}");

            let recommended = catalog
                .models
                .iter()
                .find(|model| model.recommended)
                .unwrap();
            if expected_parakeet {
                assert!(has_parakeet);
            } else {
                assert!(!has_parakeet);
            }
            assert_eq!(
                recommended.id,
                crate::qwen_asr::QWEN_ASR_06B_MODEL_ID,
                "{label}"
            );
            assert_eq!(
                recommended.engine,
                crate::qwen_asr::QWEN_ASR_ENGINE,
                "{label}"
            );

            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn rejects_parakeet_model_id_when_fluidaudio_is_unavailable() {
        assert_eq!(
            model_by_id_with_fluidaudio(crate::fluidaudio::PARAKEET_V3_MODEL_ID, false)
                .unwrap_err(),
            "stt_model_unknown"
        );
        assert_eq!(
            model_by_id_with_fluidaudio(crate::fluidaudio::PARAKEET_V3_MODEL_ID, true)
                .unwrap()
                .id,
            crate::fluidaudio::PARAKEET_V3_MODEL_ID
        );
    }

    #[test]
    fn rejects_unknown_models_before_download() {
        assert_eq!(model_by_id("missing").unwrap_err(), "stt_model_unknown");
    }

    fn temp_models_dir() -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "openbrief-stt-models-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
