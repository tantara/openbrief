use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Runtime};

const CONFIG_FILE_NAME: &str = "video-download-access.json";

/// Rust-owned configuration for authenticated yt-dlp downloads.
///
/// The renderer never holds authority-bearing paths directly; it asks Rust to
/// validate and persist them, and Rust resolves them into yt-dlp argv at
/// download time. Slice 1 covers the `cookies.txt` file (`--cookies`); future
/// slices add `--cookies-from-browser`, PO tokens, and extractor args.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoDownloadAccessConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cookies_file: Option<String>,
}

/// Renderer-facing status. Mirrors `VideoDownloadAccessStatus` in
/// `src/domain/settings.ts`. Secrets are never included — only whether they are
/// configured.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoDownloadAccessStatus {
    cookies_enabled: bool,
    cookie_source: &'static str,
    browser: Option<String>,
    browser_profile: Option<String>,
    cookies_file_configured: bool,
    cookies_file_path: Option<String>,
    po_token_configured: bool,
    extractor_args_configured: bool,
}

/// Pure mapping from config to the extra yt-dlp arguments it implies.
///
/// Kept free of I/O so it is exhaustively unit-testable. Returns an empty vec
/// when nothing is configured, so callers can splice unconditionally.
pub fn cookie_yt_dlp_args(config: &VideoDownloadAccessConfig) -> Vec<String> {
    let mut args = Vec::new();

    if let Some(path) = config.cookies_file.as_deref() {
        if !path.trim().is_empty() {
            args.push("--cookies".to_string());
            args.push(path.to_string());
        }
    }

    args
}

fn status_for_config(config: &VideoDownloadAccessConfig) -> VideoDownloadAccessStatus {
    let cookies_file = config
        .cookies_file
        .clone()
        .filter(|path| !path.trim().is_empty());
    let cookies_file_configured = cookies_file.is_some();

    VideoDownloadAccessStatus {
        cookies_enabled: cookies_file_configured,
        cookie_source: if cookies_file_configured {
            "cookies-file"
        } else {
            "none"
        },
        browser: None,
        browser_profile: None,
        cookies_file_configured,
        cookies_file_path: cookies_file,
        po_token_configured: false,
        extractor_args_configured: false,
    }
}

fn config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(crate::workspace::workspace_child_dir_for_app(
        app,
        crate::helper::MEDIA_TOOLS_RESOURCE_DIR,
        "media_tools_dir_create_failed",
        "media_tools_dir_invalid",
    )?
    .join(crate::helper::runtime_target_triple())
    .join(CONFIG_FILE_NAME))
}

fn read_config<R: Runtime>(app: &AppHandle<R>) -> Result<VideoDownloadAccessConfig, String> {
    let path = config_path(app)?;
    if !path.is_file() {
        return Ok(VideoDownloadAccessConfig::default());
    }

    let bytes = fs::read(&path)
        .map_err(|error| format!("video_download_access_read_failed:{error}"))?;
    serde_json::from_slice::<VideoDownloadAccessConfig>(&bytes)
        .map_err(|error| format!("video_download_access_parse_failed:{error}"))
}

fn write_config<R: Runtime>(
    app: &AppHandle<R>,
    config: &VideoDownloadAccessConfig,
) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("video_download_access_dir_create_failed:{error}"))?;
    }

    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("video_download_access_serialize_failed:{error}"))?;
    fs::write(path, bytes)
        .map_err(|error| format!("video_download_access_write_failed:{error}"))
}

/// Read the persisted config for download-time use. Never fails the download:
/// a read/parse error falls back to "no access configured".
pub fn config_for_app<R: Runtime>(app: &AppHandle<R>) -> VideoDownloadAccessConfig {
    read_config(app).unwrap_or_default()
}

#[tauri::command]
pub fn video_download_access_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<VideoDownloadAccessStatus, String> {
    Ok(status_for_config(&read_config(&app)?))
}

#[tauri::command]
pub fn set_video_download_cookies_file<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<VideoDownloadAccessStatus, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("cookies_file_path_empty".to_string());
    }
    if !std::path::Path::new(trimmed).is_file() {
        return Err("cookies_file_not_found".to_string());
    }

    let mut config = read_config(&app)?;
    config.cookies_file = Some(trimmed.to_string());
    write_config(&app, &config)?;
    Ok(status_for_config(&config))
}

#[tauri::command]
pub fn clear_video_download_cookies_file<R: Runtime>(
    app: AppHandle<R>,
) -> Result<VideoDownloadAccessStatus, String> {
    let mut config = read_config(&app)?;
    config.cookies_file = None;
    write_config(&app, &config)?;
    Ok(status_for_config(&config))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_config_yields_no_args() {
        assert!(cookie_yt_dlp_args(&VideoDownloadAccessConfig::default()).is_empty());
    }

    #[test]
    fn cookies_file_yields_cookies_flag() {
        let config = VideoDownloadAccessConfig {
            cookies_file: Some("C:\\Users\\me\\cookies.txt".to_string()),
        };
        assert_eq!(
            cookie_yt_dlp_args(&config),
            vec![
                "--cookies".to_string(),
                "C:\\Users\\me\\cookies.txt".to_string(),
            ],
        );
    }

    #[test]
    fn blank_cookies_file_is_ignored() {
        let config = VideoDownloadAccessConfig {
            cookies_file: Some("   ".to_string()),
        };
        assert!(cookie_yt_dlp_args(&config).is_empty());
    }

    #[test]
    fn status_reflects_no_config() {
        let status = status_for_config(&VideoDownloadAccessConfig::default());
        assert!(!status.cookies_enabled);
        assert_eq!(status.cookie_source, "none");
        assert!(!status.cookies_file_configured);
        assert_eq!(status.cookies_file_path, None);
    }

    #[test]
    fn status_reflects_cookies_file() {
        let status = status_for_config(&VideoDownloadAccessConfig {
            cookies_file: Some("/home/me/cookies.txt".to_string()),
        });
        assert!(status.cookies_enabled);
        assert_eq!(status.cookie_source, "cookies-file");
        assert!(status.cookies_file_configured);
        assert_eq!(
            status.cookies_file_path,
            Some("/home/me/cookies.txt".to_string()),
        );
    }
}
