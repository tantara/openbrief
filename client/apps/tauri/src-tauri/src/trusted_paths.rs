use serde::Serialize;
use sha1::{Digest, Sha1};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Runtime};

static LOCAL_IMPORT_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TrustedLocalFileImportPlan {
    source_path: String,
    canonical_source_path: String,
    source_type: &'static str,
    asset_id: String,
    original_file_name: String,
    library_root: String,
    library_relative_path: String,
    temp_relative_path: String,
    copy_strategy: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TrustedLibraryPath {
    library_root: String,
    relative_path: String,
    canonical_parent: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownSaveResult {
    target_path: String,
    library_relative_path: String,
    bytes_written: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactExportResult {
    target_path: String,
    source_relative_path: String,
    bytes_written: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TtsPreviewAudioExportResult {
    target_path: String,
    bytes_written: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileImportResult {
    asset_id: String,
    original_file_name: String,
    library_relative_path: String,
    file_size_bytes: u64,
    source_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    page_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistCoverImportResult {
    library_relative_path: String,
    file_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppLibraryRoot {
    library_root: String,
    source: &'static str,
}

#[tauri::command]
pub fn trusted_local_file_import_plan<R: Runtime>(
    app: AppHandle<R>,
    source_path: String,
) -> Result<TrustedLocalFileImportPlan, String> {
    let library_root = openbrief_library_root_for_app(&app)?;

    trusted_local_file_import_plan_in_library(source_path, library_root)
}

#[tauri::command]
pub fn copy_local_file_into_library<R: Runtime>(
    app: AppHandle<R>,
    source_path: String,
) -> Result<LocalFileImportResult, String> {
    let library_root = openbrief_library_root_for_app(&app)?;

    copy_local_file_into_library_root(source_path, library_root)
}

#[tauri::command]
pub fn copy_playlist_cover_into_library<R: Runtime>(
    app: AppHandle<R>,
    playlist_id: String,
    source_path: String,
) -> Result<PlaylistCoverImportResult, String> {
    let library_root = openbrief_library_root_for_app(&app)?;

    copy_playlist_cover_into_library_root(playlist_id, source_path, library_root)
}

fn copy_local_file_into_library_root(
    source_path: String,
    library_root: PathBuf,
) -> Result<LocalFileImportResult, String> {
    let plan = trusted_local_file_import_plan_in_library(source_path, library_root)?;
    let target_path = Path::new(&plan.library_root).join(&plan.library_relative_path);
    let copied_bytes = fs::copy(&plan.canonical_source_path, &target_path)
        .map_err(|error| format!("local_file_copy_failed:{error}"))?;
    let page_count = if plan.source_type == "pdf" {
        pdf_page_count(&target_path)
    } else {
        None
    };

    Ok(LocalFileImportResult {
        asset_id: plan.asset_id,
        original_file_name: plan.original_file_name,
        library_relative_path: plan.library_relative_path,
        file_size_bytes: copied_bytes,
        source_type: plan.source_type,
        page_count,
    })
}

fn copy_playlist_cover_into_library_root(
    playlist_id: String,
    source_path: String,
    library_root: PathBuf,
) -> Result<PlaylistCoverImportResult, String> {
    let source = validate_existing_file(&source_path)?;
    let library_root = validate_existing_directory_path(&library_root)?;
    let extension = image_extension_from_path(&source)?;
    let playlist_segment = sanitize_path_segment(&playlist_id);
    let library_relative_path = format!("playlists/{playlist_segment}/cover.{extension}");
    let canonical_library_parent =
        validate_library_relative_path(&library_root, &library_relative_path)?;
    let library_file_name = Path::new(&library_relative_path)
        .file_name()
        .ok_or_else(|| "playlist_cover_relative_path_missing_file_name".to_string())?;
    let target_path = canonical_library_parent.join(library_file_name);

    if path_is_symlink(&target_path)? {
        return Err("playlist_cover_target_must_not_be_symlink".to_string());
    }

    let copied_bytes = fs::copy(&source, &target_path)
        .map_err(|error| format!("playlist_cover_copy_failed:{error}"))?;

    Ok(PlaylistCoverImportResult {
        library_relative_path,
        file_size_bytes: copied_bytes,
    })
}

fn trusted_local_file_import_plan_in_library(
    source_path: String,
    library_root: PathBuf,
) -> Result<TrustedLocalFileImportPlan, String> {
    trusted_local_file_import_plan_in_library_with_asset_id(source_path, library_root, None)
}

fn trusted_local_file_import_plan_in_library_with_asset_id(
    source_path: String,
    library_root: PathBuf,
    requested_asset_id: Option<String>,
) -> Result<TrustedLocalFileImportPlan, String> {
    let source = validate_existing_file(&source_path)?;
    let library_root = validate_existing_directory_path(&library_root)?;
    let file_name = file_name_from_path(&source)?;
    let source_type = media_source_type_from_file_name(&file_name)?;
    let library_directory = library_directory_for_media_source_type(source_type);
    let asset_id = requested_asset_id.unwrap_or_else(create_uuid);
    let library_relative_path = format!(
        "{library_directory}/{asset_id}/{}",
        sanitize_path_segment(&file_name)
    );
    let temp_relative_path = format!("job-temp/{asset_id}");

    let canonical_library_parent =
        validate_library_relative_path(&library_root, &library_relative_path)?;
    let library_file_name = Path::new(&library_relative_path)
        .file_name()
        .ok_or_else(|| "library_relative_path_missing_file_name".to_string())?;
    let library_target = canonical_library_parent.join(library_file_name);

    if path_is_symlink(&library_target)? {
        return Err("library_target_must_not_be_symlink".to_string());
    }

    validate_library_relative_path(&library_root, &temp_relative_path)?;

    Ok(TrustedLocalFileImportPlan {
        source_path,
        canonical_source_path: path_to_string(source),
        source_type,
        asset_id,
        original_file_name: file_name,
        library_root: path_to_string(library_root),
        library_relative_path,
        temp_relative_path,
        copy_strategy: "copy-into-library",
    })
}

#[tauri::command]
pub fn validate_library_relative_path_command<R: Runtime>(
    app: AppHandle<R>,
    relative_path: String,
) -> Result<TrustedLibraryPath, String> {
    let library_root = openbrief_library_root_for_app(&app)?;
    let canonical_parent = validate_library_relative_path(&library_root, &relative_path)?;

    Ok(TrustedLibraryPath {
        library_root: path_to_string(library_root),
        relative_path,
        canonical_parent: path_to_string(canonical_parent),
    })
}

#[tauri::command]
pub fn app_library_root<R: Runtime>(app: AppHandle<R>) -> Result<AppLibraryRoot, String> {
    let root = openbrief_library_root_for_app(&app)?;

    Ok(AppLibraryRoot {
        library_root: path_to_string(root),
        source: "tauri-app-data-dir",
    })
}

#[tauri::command]
pub fn write_markdown_summary<R: Runtime>(
    app: AppHandle<R>,
    relative_path: String,
    markdown: String,
) -> Result<MarkdownSaveResult, String> {
    write_text_artifact(app, relative_path, markdown)
}

#[tauri::command]
pub fn write_text_artifact<R: Runtime>(
    app: AppHandle<R>,
    relative_path: String,
    text: String,
) -> Result<MarkdownSaveResult, String> {
    let library_root = openbrief_library_root_for_app(&app)?;

    write_text_artifact_in_library(library_root, relative_path, text)
}

#[tauri::command]
pub fn export_library_artifact<R: Runtime>(
    app: AppHandle<R>,
    source_relative_path: String,
    output_directory: String,
    file_name: Option<String>,
) -> Result<ArtifactExportResult, String> {
    let library_root = openbrief_library_root_for_app(&app)?;

    export_library_artifact_from_root(
        library_root,
        source_relative_path,
        output_directory,
        file_name,
    )
}

#[tauri::command]
pub fn export_tts_preview_audio(
    audio_bytes: Vec<u8>,
    output_directory: String,
    file_name: String,
) -> Result<TtsPreviewAudioExportResult, String> {
    export_tts_preview_audio_to_directory(audio_bytes, output_directory, file_name)
}

fn export_library_artifact_from_root(
    library_root: PathBuf,
    source_relative_path: String,
    output_directory: String,
    file_name: Option<String>,
) -> Result<ArtifactExportResult, String> {
    let library_root = validate_existing_directory_path(&library_root)?;
    let source_parent = validate_library_relative_path(&library_root, &source_relative_path)?;
    let source_file_name = Path::new(&source_relative_path)
        .file_name()
        .ok_or_else(|| "artifact_source_missing_file_name".to_string())?;
    let source_path = source_parent.join(source_file_name);

    if path_is_symlink(&source_path)? {
        return Err("artifact_source_must_not_be_symlink".to_string());
    }

    let source_metadata =
        fs::metadata(&source_path).map_err(|error| format!("artifact_source_invalid:{error}"))?;

    if !source_metadata.is_file() {
        return Err("artifact_source_must_be_file".to_string());
    }

    let output_directory = validate_existing_export_directory(&PathBuf::from(output_directory))?;
    let export_file_name = file_name
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| source_file_name.to_string_lossy().to_string());
    let target_path = output_directory.join(sanitize_export_file_name(&export_file_name));

    if path_is_symlink(&target_path)? {
        return Err("artifact_target_must_not_be_symlink".to_string());
    }

    log::info!(
        "before exporting artifact; source_relative_path={}; source_path={}; output_directory={}; target_path={}",
        source_relative_path,
        path_to_string(source_path.clone()),
        path_to_string(output_directory.clone()),
        path_to_string(target_path.clone()),
    );

    let bytes_written = fs::copy(&source_path, &target_path).map_err(|error| {
        log::error!(
            "after exporting artifact; status=failed; source_relative_path={}; source_path={}; target_path={}; error={}",
            source_relative_path,
            path_to_string(source_path.clone()),
            path_to_string(target_path.clone()),
            error,
        );
        format!(
            "artifact_export_failed: source={} target={} error={}",
            path_to_string(source_path.clone()),
            path_to_string(target_path.clone()),
            error
        )
    })?;

    log::info!(
        "after exporting artifact; status=success; source_relative_path={}; target_path={}; bytes_written={}",
        source_relative_path,
        path_to_string(target_path.clone()),
        bytes_written,
    );

    Ok(ArtifactExportResult {
        target_path: path_to_string(target_path),
        source_relative_path,
        bytes_written,
    })
}

fn export_tts_preview_audio_to_directory(
    audio_bytes: Vec<u8>,
    output_directory: String,
    file_name: String,
) -> Result<TtsPreviewAudioExportResult, String> {
    if audio_bytes.is_empty() {
        return Err("tts_preview_audio_empty".to_string());
    }

    let output_directory = validate_existing_export_directory(&PathBuf::from(output_directory))?;
    let target_path = output_directory.join(sanitize_export_file_name_preserving_stem(&file_name));

    if path_is_symlink(&target_path)? {
        return Err("tts_preview_target_must_not_be_symlink".to_string());
    }

    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&target_path)
        .map_err(|error| format!("tts_preview_export_failed:{error}"))?;
    file.write_all(&audio_bytes)
        .map_err(|error| format!("tts_preview_export_failed:{error}"))?;

    Ok(TtsPreviewAudioExportResult {
        target_path: path_to_string(target_path),
        bytes_written: audio_bytes.len(),
    })
}

fn write_text_artifact_in_library(
    library_root: PathBuf,
    relative_path: String,
    text: String,
) -> Result<MarkdownSaveResult, String> {
    let library_root = validate_existing_directory_path(&library_root)?;
    let canonical_parent = validate_library_relative_path(&library_root, &relative_path)?;
    let file_name = Path::new(&relative_path)
        .file_name()
        .ok_or_else(|| "markdown_relative_path_missing_file_name".to_string())?;
    let target = canonical_parent.join(file_name);

    if path_is_symlink(&target)? {
        return Err("markdown_target_must_not_be_symlink".to_string());
    }

    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&target)
        .map_err(|error| format!("markdown_save_failed:{error}"))?;
    file.write_all(text.as_bytes())
        .map_err(|error| format!("markdown_save_failed:{error}"))?;

    Ok(MarkdownSaveResult {
        target_path: path_to_string(target),
        library_relative_path: relative_path,
        bytes_written: text.len(),
    })
}

fn openbrief_library_root_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    crate::workspace::library_root_for_app(app)
}

fn validate_existing_file(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);

    if !path.is_absolute() {
        return Err("source_path_must_be_absolute".to_string());
    }

    if has_parent_dir_or_absolute_component(&path) {
        return Err("source_path_must_not_traverse".to_string());
    }

    reject_path_or_ancestor_symlinks(&path, "source_path_must_not_contain_symlink")?;

    let metadata = fs::metadata(&path).map_err(|error| format!("source_path_invalid:{error}"))?;

    if !metadata.is_file() {
        return Err("source_path_must_be_file".to_string());
    }

    path.canonicalize()
        .map_err(|error| format!("source_path_invalid:{error}"))
}

fn validate_existing_directory_path(path: &Path) -> Result<PathBuf, String> {
    if path_is_symlink(path)? {
        return Err("directory_must_not_contain_symlink".to_string());
    }

    let metadata = fs::metadata(path).map_err(|error| format!("directory_invalid:{error}"))?;

    if !metadata.is_dir() {
        return Err("directory_must_exist".to_string());
    }

    path.canonicalize()
        .map_err(|error| format!("directory_invalid:{error}"))
}

fn validate_existing_export_directory(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("output_directory_must_be_absolute".to_string());
    }

    if has_parent_dir_or_absolute_component(path) {
        return Err("output_directory_must_not_traverse".to_string());
    }

    validate_existing_directory_path(path)
}

fn validate_library_relative_path(
    library_root: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let relative = PathBuf::from(relative_path);

    if relative.is_absolute() || has_parent_dir_or_absolute_component(&relative) {
        return Err("library_relative_path_must_stay_inside_root".to_string());
    }

    let parent_relative = relative
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new(""));
    reject_existing_relative_symlinks(library_root, parent_relative)?;
    let parent = library_root.join(parent_relative);
    fs::create_dir_all(&parent).map_err(|error| format!("library_parent_create_failed:{error}"))?;
    let canonical_parent = validate_existing_directory_path(&parent)?;
    let canonical_root = library_root
        .canonicalize()
        .map_err(|error| format!("library_root_invalid:{error}"))?;

    if !canonical_parent.starts_with(&canonical_root) {
        return Err("library_relative_path_escaped_root".to_string());
    }

    Ok(canonical_parent)
}

fn reject_existing_relative_symlinks(root: &Path, relative: &Path) -> Result<(), String> {
    let mut current = root.to_path_buf();

    for component in relative.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(segment) => {
                current.push(segment);

                if path_is_symlink(&current)? {
                    return Err("library_relative_path_must_not_contain_symlink".to_string());
                }
            }
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err("library_relative_path_must_stay_inside_root".to_string());
            }
        }
    }

    Ok(())
}

fn reject_path_or_ancestor_symlinks(path: &Path, error_code: &str) -> Result<(), String> {
    for ancestor in path.ancestors() {
        if path_is_symlink(ancestor)? {
            return Err(error_code.to_string());
        }
    }

    Ok(())
}

fn path_is_symlink(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(metadata.file_type().is_symlink()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("path_metadata_failed:{error}")),
    }
}

fn has_parent_dir_or_absolute_component(path: &Path) -> bool {
    path.components().any(|component| match component {
        Component::ParentDir => true,
        Component::Prefix(_) => false,
        Component::RootDir => false,
        Component::CurDir => false,
        Component::Normal(_) => false,
    })
}

fn file_name_from_path(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
        .ok_or_else(|| "source_path_missing_file_name".to_string())
}

fn image_extension_from_path(path: &Path) -> Result<String, String> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .ok_or_else(|| "playlist_cover_missing_extension".to_string())?;

    match extension.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "heic" | "heif" => Ok(extension),
        _ => Err("playlist_cover_unsupported_extension".to_string()),
    }
}

fn media_source_type_from_file_name(file_name: &str) -> Result<&'static str, String> {
    let extension = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match extension.as_str() {
        "mp4" | "m4v" | "mov" | "webm" | "mkv" => Ok("video"),
        "mp3" | "wav" | "m4a" | "aac" | "flac" | "ogg" | "opus" => Ok("audio"),
        "pdf" => Ok("pdf"),
        _ => Err("local_file_unsupported_extension".to_string()),
    }
}

fn library_directory_for_media_source_type(source_type: &str) -> &'static str {
    match source_type {
        "audio" => "audios",
        "pdf" => "pdfs",
        _ => "videos",
    }
}

fn create_uuid() -> String {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let counter = LOCAL_IMPORT_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut hasher = Sha1::new();
    hasher.update(format!("{unique}-{counter}").as_bytes());
    let mut hex = format!("{:x}", hasher.finalize());
    hex.replace_range(12..13, "4");
    hex.replace_range(16..17, "8");

    format_uuid_hex(&hex[..32])
}

fn format_uuid_hex(hex: &str) -> String {
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32],
    )
}

fn pdf_page_count(path: &Path) -> Option<u32> {
    let bytes = fs::read(path).ok()?;
    let mut count = 0_u32;
    let mut cursor = 0_usize;

    while let Some(type_offset) = find_bytes(&bytes[cursor..], b"/Type") {
        cursor += type_offset + b"/Type".len();
        cursor = skip_pdf_whitespace(&bytes, cursor);

        if bytes[cursor..].starts_with(b"/Page")
            && !bytes
                .get(cursor + b"/Page".len())
                .is_some_and(|byte| byte.is_ascii_alphanumeric())
        {
            count = count.saturating_add(1);
        }
    }

    (count > 0).then_some(count)
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn skip_pdf_whitespace(bytes: &[u8], mut cursor: usize) -> usize {
    while bytes
        .get(cursor)
        .is_some_and(|byte| matches!(byte, b'\0' | b'\t' | b'\n' | b'\x0c' | b'\r' | b' '))
    {
        cursor += 1;
    }

    cursor
}

fn sanitize_path_segment(value: &str) -> String {
    let mut output = String::new();
    let mut last_was_dash = false;

    for character in value.trim().chars() {
        let replacement = if character.is_ascii_alphanumeric()
            || character == '.'
            || character == '_'
            || character == '-'
        {
            character
        } else {
            '-'
        };

        if replacement == '-' {
            if !last_was_dash {
                output.push(replacement);
            }
            last_was_dash = true;
        } else {
            output.push(replacement);
            last_was_dash = false;
        }
    }

    let trimmed = output.trim_matches(['.', '-']).to_string();

    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed
    }
}

fn sanitize_export_file_name(value: &str) -> String {
    sanitize_export_file_name_with_stem_limit(value, Some(20))
}

fn sanitize_export_file_name_preserving_stem(value: &str) -> String {
    sanitize_export_file_name_with_stem_limit(value, None)
}

fn sanitize_export_file_name_with_stem_limit(value: &str, stem_limit: Option<usize>) -> String {
    let normalized: String = value
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect();
    let trimmed = normalized.trim_matches(['.', ' ', '-']).to_string();

    if trimmed.is_empty() {
        return "untitled".to_string();
    }

    let (stem, extension) = match trimmed.rfind('.') {
        Some(index) if index > 0 && index + 1 < trimmed.len() => {
            (&trimmed[..index], &trimmed[index..])
        }
        _ => (trimmed.as_str(), ""),
    };
    let trimmed_stem = stem.trim_matches(['.', ' ', '-']);
    let limited_stem: String = match stem_limit {
        Some(limit) => trimmed_stem.chars().take(limit).collect(),
        None => trimmed_stem.to_string(),
    };
    let file_stem = if limited_stem.is_empty() {
        "untitled".to_string()
    } else {
        limited_stem
    };

    format!("{file_stem}{extension}")
}

fn path_to_string(path: PathBuf) -> String {
    let path = path.to_string_lossy().to_string();
    if cfg!(windows) {
        path.replace('\\', "/")
    } else {
        path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    const UUID_PATTERN_LENGTH: usize = 36;

    #[test]
    fn plans_local_file_imports_with_canonical_source_and_library_paths() {
        let fixture = TestFixture::new("trusted-import");
        let source = fixture.write_file("source/demo clip.mp4", "video");
        let library = fixture.create_dir("library");

        let plan =
            trusted_local_file_import_plan_in_library(path_to_string(source), library).unwrap();

        assert!(plan.canonical_source_path.ends_with("source/demo clip.mp4"));
        assert_eq!(plan.copy_strategy, "copy-into-library");
        assert_eq!(plan.source_type, "video");
        assert_eq!(plan.asset_id.len(), UUID_PATTERN_LENGTH);
        assert_eq!(plan.original_file_name, "demo clip.mp4");
        assert_eq!(
            plan.library_relative_path,
            format!("videos/{}/demo-clip.mp4", plan.asset_id)
        );
        assert_eq!(
            plan.temp_relative_path,
            format!("job-temp/{}", plan.asset_id)
        );
    }

    #[test]
    fn copies_local_file_into_library_after_validation() {
        let fixture = TestFixture::new("trusted-copy");
        let source = fixture.write_file("source/demo clip.mp4", "video bytes");
        let library = fixture.create_dir("library");

        let result =
            copy_local_file_into_library_root(path_to_string(source), library.clone()).unwrap();
        let target = library.join(&result.library_relative_path);

        assert_eq!(result.asset_id.len(), UUID_PATTERN_LENGTH);
        assert_eq!(result.original_file_name, "demo clip.mp4");
        assert_eq!(
            result.library_relative_path,
            format!("videos/{}/demo-clip.mp4", result.asset_id)
        );
        assert_eq!(result.source_type, "video");
        assert_eq!(result.file_size_bytes, 11);
        assert_eq!(fs::read_to_string(target).unwrap(), "video bytes");
    }

    #[test]
    fn repeated_local_file_imports_get_distinct_library_paths() {
        let fixture = TestFixture::new("trusted-copy-repeat");
        let source = fixture.write_file("source/demo clip.mp4", "video bytes");
        let library = fixture.create_dir("library");

        let first =
            copy_local_file_into_library_root(path_to_string(source.clone()), library.clone())
                .unwrap();
        let second = copy_local_file_into_library_root(path_to_string(source), library).unwrap();

        assert_ne!(first.asset_id, second.asset_id);
        assert_ne!(first.library_relative_path, second.library_relative_path);
    }

    #[test]
    fn copies_audio_and_pdf_into_shared_library_storage() {
        let fixture = TestFixture::new("trusted-copy-shared-media");
        let audio = fixture.write_file("source/demo audio.mp3", "audio bytes");
        let pdf = fixture.write_file(
            "source/demo paper.pdf",
            "%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >> endobj
3 0 obj << /Type /Page /Parent 2 0 R >> endobj
4 0 obj << /Type/Page /Parent 2 0 R >> endobj",
        );
        let library = fixture.create_dir("library");

        let audio_result =
            copy_local_file_into_library_root(path_to_string(audio), library.clone()).unwrap();
        let pdf_result =
            copy_local_file_into_library_root(path_to_string(pdf), library.clone()).unwrap();

        assert_eq!(audio_result.source_type, "audio");
        assert_eq!(audio_result.original_file_name, "demo audio.mp3");
        assert_eq!(audio_result.asset_id.len(), UUID_PATTERN_LENGTH);
        assert_eq!(
            audio_result.library_relative_path,
            format!("audios/{}/demo-audio.mp3", audio_result.asset_id)
        );
        assert_eq!(pdf_result.source_type, "pdf");
        assert_eq!(pdf_result.original_file_name, "demo paper.pdf");
        assert_eq!(pdf_result.page_count, Some(2));
        assert_eq!(pdf_result.asset_id.len(), UUID_PATTERN_LENGTH);
        assert_eq!(
            pdf_result.library_relative_path,
            format!("pdfs/{}/demo-paper.pdf", pdf_result.asset_id)
        );
        assert_eq!(
            fs::read_to_string(library.join(audio_result.library_relative_path)).unwrap(),
            "audio bytes"
        );
        assert_eq!(
            fs::read_to_string(library.join(pdf_result.library_relative_path)).unwrap(),
            "%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >> endobj
3 0 obj << /Type /Page /Parent 2 0 R >> endobj
4 0 obj << /Type/Page /Parent 2 0 R >> endobj"
        );
    }

    #[test]
    fn rejects_unsupported_local_file_import_extensions() {
        let fixture = TestFixture::new("trusted-copy-reject-extension");
        let source = fixture.write_file("source/notes.txt", "text");
        let library = fixture.create_dir("library");

        let result = copy_local_file_into_library_root(path_to_string(source), library);

        assert_eq!(result.unwrap_err(), "local_file_unsupported_extension");
    }

    #[test]
    fn copies_playlist_cover_into_playlist_library_directory() {
        let fixture = TestFixture::new("trusted-playlist-cover");
        let source = fixture.write_file("source/Cover Image.PNG", "image bytes");
        let library = fixture.create_dir("library");

        let result = copy_playlist_cover_into_library_root(
            "../playlist one".to_string(),
            path_to_string(source),
            library.clone(),
        )
        .unwrap();
        let target = library.join(&result.library_relative_path);

        assert_eq!(
            result.library_relative_path,
            "playlists/playlist-one/cover.png"
        );
        assert_eq!(result.file_size_bytes, 11);
        assert_eq!(fs::read_to_string(target).unwrap(), "image bytes");
    }

    #[test]
    fn rejects_non_image_playlist_covers() {
        let fixture = TestFixture::new("trusted-playlist-cover-reject");
        let source = fixture.write_file("source/cover.txt", "not image");
        let library = fixture.create_dir("library");

        let result = copy_playlist_cover_into_library_root(
            "playlist".to_string(),
            path_to_string(source),
            library,
        );

        assert_eq!(result.unwrap_err(), "playlist_cover_unsupported_extension");
    }

    #[test]
    fn rejects_traversal_for_library_relative_paths() {
        let fixture = TestFixture::new("trusted-library");
        let library = fixture.create_dir("library");

        let result = validate_library_relative_path(&library, "../outside.md");

        assert_eq!(
            result.unwrap_err(),
            "library_relative_path_must_stay_inside_root"
        );
    }

    #[test]
    fn rejects_symlink_source_paths() {
        let fixture = TestFixture::new("trusted-symlink");
        let target = fixture.write_file("target.mp4", "video");
        let symlink = fixture.root.join("linked.mp4");
        let library = fixture.create_dir("library");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, &symlink).unwrap();

        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&target, &symlink).unwrap();

        let result = trusted_local_file_import_plan_in_library(path_to_string(symlink), library);

        assert_eq!(result.unwrap_err(), "source_path_must_not_contain_symlink");
    }

    #[test]
    fn rejects_symlink_source_ancestor_paths() {
        let fixture = TestFixture::new("trusted-source-ancestor-symlink");
        let target_dir = fixture.create_dir("target");
        let target = target_dir.join("video.mp4");
        fs::write(&target, "video").unwrap();
        let symlink_dir = fixture.root.join("linked-source");
        let library = fixture.create_dir("library");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&target_dir, &symlink_dir).unwrap();

        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&target_dir, &symlink_dir).unwrap();

        let result = trusted_local_file_import_plan_in_library(
            path_to_string(symlink_dir.join("video.mp4")),
            library,
        );

        assert_eq!(result.unwrap_err(), "source_path_must_not_contain_symlink");
    }

    #[test]
    fn rejects_existing_import_target_symlink() {
        let fixture = TestFixture::new("trusted-import-target-symlink");
        let source = fixture.write_file("source/demo clip.mp4", "video");
        let library = fixture.create_dir("library");
        let asset_id = "00000000-0000-4000-8000-000000000001";
        let import_parent = library.join(format!("videos/{asset_id}"));
        fs::create_dir_all(&import_parent).unwrap();
        let outside = fixture.write_file("outside.mp4", "old");
        let symlink = import_parent.join("demo-clip.mp4");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &symlink).unwrap();

        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&outside, &symlink).unwrap();

        let result = trusted_local_file_import_plan_in_library_with_asset_id(
            path_to_string(source),
            library,
            Some(asset_id.to_string()),
        );

        assert_eq!(result.unwrap_err(), "library_target_must_not_be_symlink");
        assert_eq!(fs::read_to_string(outside).unwrap(), "old");
    }

    #[test]
    fn writes_markdown_inside_validated_library_path() {
        let fixture = TestFixture::new("trusted-markdown");
        let library = fixture.create_dir("library");

        let result = write_text_artifact_in_library(
            library.clone(),
            "summaries/video-1.md".to_string(),
            "# Summary".to_string(),
        )
        .unwrap();
        let target = library.join("summaries/video-1.md");

        assert_eq!(result.bytes_written, 9);
        assert_eq!(result.library_relative_path, "summaries/video-1.md");
        assert_eq!(
            result.target_path,
            path_to_string(target.canonicalize().unwrap())
        );
        assert_eq!(fs::read_to_string(target).unwrap(), "# Summary");
    }

    #[test]
    fn exports_library_artifact_to_user_selected_directory() {
        let fixture = TestFixture::new("trusted-artifact-export");
        let library = fixture.create_dir("library");
        let output = fixture.create_dir("exports");
        fixture.write_file("library/videos/video-1/source.mp4", "video-bytes");

        let result = export_library_artifact_from_root(
            library,
            "videos/video-1/source.mp4".to_string(),
            path_to_string(output.clone()),
            Some("Readable title.mp4".to_string()),
        )
        .unwrap();

        assert!(result.target_path.ends_with("Readable title.mp4"));
        assert_eq!(result.source_relative_path, "videos/video-1/source.mp4");
        assert_eq!(result.bytes_written, 11);
        assert_eq!(
            fs::read_to_string(output.join("Readable title.mp4")).unwrap(),
            "video-bytes"
        );
    }

    #[test]
    fn preserves_unicode_and_truncates_export_file_name_stems() {
        let fixture = TestFixture::new("trusted-artifact-export-unicode");
        let library = fixture.create_dir("library");
        let output = fixture.create_dir("exports");
        fixture.write_file("library/videos/video-1/summary/summary.md", "summary");

        let result = export_library_artifact_from_root(
            library,
            "videos/video-1/summary/summary.md".to_string(),
            path_to_string(output.clone()),
            Some("가나다라마바사아자차카타파하1234567890 요약.md".to_string()),
        )
        .unwrap();

        let expected_file_name = "가나다라마바사아자차카타파하123456.md";
        assert!(result.target_path.ends_with(expected_file_name));
        assert_eq!(
            fs::read_to_string(output.join(expected_file_name)).unwrap(),
            "summary"
        );
    }

    #[test]
    fn exports_tts_preview_audio_to_user_selected_directory() {
        let fixture = TestFixture::new("trusted-tts-preview-export");
        let output = fixture.create_dir("exports");

        let result = export_tts_preview_audio_to_directory(
            vec![1, 2, 3, 4],
            path_to_string(output.clone()),
            "A much longer custom preview filename.wav".to_string(),
        )
        .unwrap();

        let expected_file_name = "A much longer custom preview filename.wav";
        assert!(result.target_path.ends_with(expected_file_name));
        assert_eq!(result.bytes_written, 4);
        assert_eq!(
            fs::read(output.join(expected_file_name)).unwrap(),
            vec![1, 2, 3, 4]
        );
    }

    #[test]
    fn rejects_empty_tts_preview_audio_export() {
        let fixture = TestFixture::new("trusted-tts-preview-empty");
        let output = fixture.create_dir("exports");

        let result = export_tts_preview_audio_to_directory(
            vec![],
            path_to_string(output),
            "preview.wav".to_string(),
        );

        assert_eq!(result.unwrap_err(), "tts_preview_audio_empty");
    }

    #[test]
    fn rejects_exporting_symlink_library_artifacts() {
        let fixture = TestFixture::new("trusted-artifact-export-symlink");
        let library = fixture.create_dir("library");
        let output = fixture.create_dir("exports");
        fixture.create_dir("library/videos/video-1");
        let outside = fixture.write_file("outside/source.mp4", "video");
        let symlink = fixture.root.join("library/videos/video-1/source.mp4");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &symlink).unwrap();

        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&outside, &symlink).unwrap();

        let result = export_library_artifact_from_root(
            library,
            "videos/video-1/source.mp4".to_string(),
            path_to_string(output),
            None,
        );

        assert_eq!(result.unwrap_err(), "artifact_source_must_not_be_symlink");
    }

    #[test]
    fn rejects_markdown_save_through_symlink() {
        let fixture = TestFixture::new("trusted-markdown-symlink");
        let library = fixture.create_dir("library");
        let outside = fixture.create_dir("outside");
        let symlink = library.join("summaries");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &symlink).unwrap();

        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&outside, &symlink).unwrap();

        let result = write_text_artifact_in_library(
            library,
            "summaries/video-1.md".to_string(),
            "# Summary".to_string(),
        );

        assert_eq!(
            result.unwrap_err(),
            "library_relative_path_must_not_contain_symlink"
        );
    }

    #[test]
    fn rejects_markdown_save_absolute_or_traversing_paths() {
        let fixture = TestFixture::new("trusted-markdown-traversal");
        let library = fixture.create_dir("library");

        let absolute = write_text_artifact_in_library(
            library.clone(),
            path_to_string(fixture.root.join("outside.md")),
            "# Summary".to_string(),
        );
        let traversal = write_text_artifact_in_library(
            library,
            "../outside.md".to_string(),
            "# Summary".to_string(),
        );

        assert_eq!(
            absolute.unwrap_err(),
            "library_relative_path_must_stay_inside_root"
        );
        assert_eq!(
            traversal.unwrap_err(),
            "library_relative_path_must_stay_inside_root"
        );
    }

    #[test]
    fn rejects_existing_final_target_symlink() {
        let fixture = TestFixture::new("trusted-markdown-target-symlink");
        let library = fixture.create_dir("library");
        let summaries = library.join("summaries");
        fs::create_dir_all(&summaries).unwrap();
        let outside = fixture.write_file("outside.md", "old");
        let symlink = summaries.join("video-1.md");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &symlink).unwrap();

        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&outside, &symlink).unwrap();

        let result = write_text_artifact_in_library(
            library,
            "summaries/video-1.md".to_string(),
            "# Summary".to_string(),
        );

        assert_eq!(result.unwrap_err(), "markdown_target_must_not_be_symlink");
        assert_eq!(fs::read_to_string(outside).unwrap(), "old");
    }

    struct TestFixture {
        root: PathBuf,
    }

    impl TestFixture {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!("openbrief-{name}-{unique}"));
            fs::create_dir_all(&root).unwrap();
            let root = root.canonicalize().unwrap();

            Self { root }
        }

        fn create_dir(&self, relative: &str) -> PathBuf {
            let path = self.root.join(relative);
            fs::create_dir_all(&path).unwrap();
            path
        }

        fn write_file(&self, relative: &str, contents: &str) -> PathBuf {
            let path = self.root.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, contents).unwrap();
            path
        }
    }

    impl Drop for TestFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
