use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, Runtime};

use crate::helper::{runtime_target_triple, MEDIA_TOOLS_RESOURCE_DIR, YTDLP_PATH_ENV};

const YTDLP_TOOL: &str = "yt-dlp";
const YTDLP_RELEASES_API: &str = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
const POLICY_FILE_NAME: &str = "yt-dlp-update-policy.json";
const DEFAULT_STALE_AFTER_DAYS: u64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YtDlpUpdatePolicy {
    auto_update_enabled: bool,
    stale_after_days: u64,
}

impl Default for YtDlpUpdatePolicy {
    fn default() -> Self {
        Self {
            auto_update_enabled: false,
            stale_after_days: DEFAULT_STALE_AFTER_DAYS,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YtDlpUpdateStatus {
    tool: &'static str,
    version: Option<String>,
    version_date: Option<String>,
    age_days: Option<u64>,
    stale_after_days: u64,
    is_stale: bool,
    auto_update_enabled: bool,
    active_path: Option<String>,
    source: &'static str,
    can_update: bool,
    last_update_error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubReleaseAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[tauri::command]
pub async fn yt_dlp_update_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<YtDlpUpdateStatus, String> {
    let policy = read_update_policy(&app)?;
    let mut status = status_for_policy(&app, &policy, None)?;

    if policy.auto_update_enabled && status.is_stale && status.can_update {
        status = match update_yt_dlp_binary(&app).await {
            Ok(()) => status_for_policy(&app, &policy, None)?,
            Err(error) => status_for_policy(&app, &policy, Some(error))?,
        };
    }

    Ok(status)
}

#[tauri::command]
pub async fn set_yt_dlp_update_policy<R: Runtime>(
    app: AppHandle<R>,
    auto_update_enabled: bool,
    stale_after_days: Option<u64>,
) -> Result<YtDlpUpdateStatus, String> {
    let policy = YtDlpUpdatePolicy {
        auto_update_enabled,
        stale_after_days: stale_after_days.unwrap_or(DEFAULT_STALE_AFTER_DAYS).max(1),
    };
    write_update_policy(&app, &policy)?;
    yt_dlp_update_status(app).await
}

#[tauri::command]
pub async fn update_yt_dlp_now<R: Runtime>(app: AppHandle<R>) -> Result<YtDlpUpdateStatus, String> {
    let policy = read_update_policy(&app)?;

    match update_yt_dlp_binary(&app).await {
        Ok(()) => status_for_policy(&app, &policy, None),
        Err(error) => status_for_policy(&app, &policy, Some(error)),
    }
}

pub fn updated_ytdlp_path_for_app<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let path = app_data_media_tools_dir(app)
        .ok()?
        .join(executable_name(YTDLP_TOOL));
    path.is_file().then_some(path)
}

fn status_for_policy<R: Runtime>(
    app: &AppHandle<R>,
    policy: &YtDlpUpdatePolicy,
    last_update_error: Option<String>,
) -> Result<YtDlpUpdateStatus, String> {
    let active = active_ytdlp_path(app);
    let (version, version_date, age_days) = active
        .path
        .as_deref()
        .and_then(read_yt_dlp_version)
        .map(|version| {
            let version_date = release_date_from_version(&version);
            let age_days = version_date.as_deref().and_then(age_days_for_release_date);
            (Some(version), version_date, age_days)
        })
        .unwrap_or((None, None, None));
    let is_stale = age_days
        .map(|days| days > policy.stale_after_days)
        .unwrap_or(false);

    Ok(YtDlpUpdateStatus {
        tool: YTDLP_TOOL,
        version,
        version_date,
        age_days,
        stale_after_days: policy.stale_after_days,
        is_stale,
        auto_update_enabled: policy.auto_update_enabled,
        active_path: active.path.map(path_to_string),
        source: active.source,
        can_update: true,
        last_update_error,
    })
}

fn active_ytdlp_path<R: Runtime>(app: &AppHandle<R>) -> ActiveToolPath {
    if let Some(path) = updated_ytdlp_path_for_app(app) {
        return ActiveToolPath {
            path: Some(path),
            source: "app-data-override",
        };
    }

    if let Some(path) = bundled_ytdlp_path_for_app(app) {
        return ActiveToolPath {
            path: Some(path),
            source: "bundled-resource",
        };
    }

    if let Some(path) = std::env::var_os(YTDLP_PATH_ENV).map(PathBuf::from) {
        return ActiveToolPath {
            path: Some(path),
            source: "environment-override",
        };
    }

    ActiveToolPath {
        path: Some(PathBuf::from(executable_name(YTDLP_TOOL))),
        source: "path",
    }
}

struct ActiveToolPath {
    path: Option<PathBuf>,
    source: &'static str,
}

async fn update_yt_dlp_binary<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let target = runtime_target_triple();
    let asset_name = ytdlp_asset_name(target);
    let destination_dir = app_data_media_tools_dir(app)?;
    fs::create_dir_all(&destination_dir)
        .map_err(|error| format!("yt_dlp_update_dir_create_failed:{error}"))?;
    let destination = destination_dir.join(executable_name(YTDLP_TOOL));
    let partial = destination.with_extension("partial");

    let client = reqwest::Client::new();
    let release_text = client
        .get(YTDLP_RELEASES_API)
        .header("User-Agent", "OpenBrief yt-dlp updater")
        .send()
        .await
        .map_err(|error| format!("yt_dlp_release_check_failed:{error}"))?
        .error_for_status()
        .map_err(|error| format!("yt_dlp_release_check_failed:{error}"))?
        .text()
        .await
        .map_err(|error| format!("yt_dlp_release_read_failed:{error}"))?;
    let release: GitHubRelease = serde_json::from_str(&release_text)
        .map_err(|error| format!("yt_dlp_release_parse_failed:{error}"))?;
    let asset = release
        .assets
        .iter()
        .find(|candidate| candidate.name == asset_name)
        .ok_or_else(|| format!("yt_dlp_release_asset_missing:{asset_name}"))?;

    let response = client
        .get(&asset.browser_download_url)
        .header("User-Agent", "OpenBrief yt-dlp updater")
        .send()
        .await
        .map_err(|error| format!("yt_dlp_download_start_failed:{error}"))?
        .error_for_status()
        .map_err(|error| format!("yt_dlp_download_failed:{error}"))?;

    let mut stream = response.bytes_stream();
    let mut file =
        fs::File::create(&partial).map_err(|error| format!("yt_dlp_create_failed:{error}"))?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("yt_dlp_download_stream_failed:{error}"))?;
        file.write_all(&chunk)
            .map_err(|error| format!("yt_dlp_write_failed:{error}"))?;
    }

    file.flush()
        .map_err(|error| format!("yt_dlp_flush_failed:{error}"))?;
    drop(file);

    mark_executable(&partial)?;
    sign_macos_ytdlp_if_needed(&partial)?;
    fs::rename(&partial, &destination).map_err(|error| format!("yt_dlp_rename_failed:{error}"))?;

    write_update_manifest(&destination_dir, &release.tag_name)?;
    Ok(())
}

fn read_update_policy<R: Runtime>(app: &AppHandle<R>) -> Result<YtDlpUpdatePolicy, String> {
    let path = policy_path(app)?;
    if !path.is_file() {
        return Ok(YtDlpUpdatePolicy::default());
    }

    let bytes = fs::read(&path).map_err(|error| format!("yt_dlp_policy_read_failed:{error}"))?;
    serde_json::from_slice::<YtDlpUpdatePolicy>(&bytes)
        .map_err(|error| format!("yt_dlp_policy_parse_failed:{error}"))
}

fn write_update_policy<R: Runtime>(
    app: &AppHandle<R>,
    policy: &YtDlpUpdatePolicy,
) -> Result<(), String> {
    let path = policy_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("yt_dlp_policy_dir_create_failed:{error}"))?;
    }

    let bytes = serde_json::to_vec_pretty(policy)
        .map_err(|error| format!("yt_dlp_policy_serialize_failed:{error}"))?;
    fs::write(path, bytes).map_err(|error| format!("yt_dlp_policy_write_failed:{error}"))
}

fn write_update_manifest(destination_dir: &Path, tag_name: &str) -> Result<(), String> {
    let manifest = serde_json::json!({
        "tool": YTDLP_TOOL,
        "source": "yt-dlp/yt-dlp",
        "tagName": tag_name,
    });
    fs::write(
        destination_dir.join("yt-dlp-update.json"),
        serde_json::to_vec_pretty(&manifest)
            .map_err(|error| format!("yt_dlp_manifest_serialize_failed:{error}"))?,
    )
    .map_err(|error| format!("yt_dlp_manifest_write_failed:{error}"))
}

fn policy_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app_data_media_tools_dir(app)?.join(POLICY_FILE_NAME))
}

fn app_data_media_tools_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(crate::workspace::workspace_child_dir_for_app(
        app,
        MEDIA_TOOLS_RESOURCE_DIR,
        "media_tools_dir_create_failed",
        "media_tools_dir_invalid",
    )?
    .join(runtime_target_triple()))
}

fn bundled_ytdlp_path_for_app<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let path = app
        .path()
        .resource_dir()
        .ok()?
        .join(MEDIA_TOOLS_RESOURCE_DIR)
        .join(runtime_target_triple())
        .join(executable_name(YTDLP_TOOL));

    path.is_file().then_some(path)
}

fn read_yt_dlp_version(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

fn release_date_from_version(version: &str) -> Option<String> {
    for token in version.split(|character: char| !(character.is_ascii_digit() || character == '.'))
    {
        if is_release_date_token(token) {
            return Some(token.to_string());
        }
        if token.len() > 10 && is_release_date_token(&token[..10]) {
            return Some(token[..10].to_string());
        }
    }

    None
}

fn is_release_date_token(token: &str) -> bool {
    let parts = token.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts[0].len() == 4
        && parts[1].len() == 2
        && parts[2].len() == 2
        && parts
            .iter()
            .all(|part| part.chars().all(|c| c.is_ascii_digit()))
}

fn age_days_for_release_date(date: &str) -> Option<u64> {
    let mut parts = date.split('.');
    let year = parts.next()?.parse::<i32>().ok()?;
    let month = parts.next()?.parse::<u32>().ok()?;
    let day = parts.next()?.parse::<u32>().ok()?;
    let release_days = days_from_civil(year, month, day)?;
    let now_days = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs() / 86_400;

    Some(now_days.saturating_sub(release_days as u64))
}

fn days_from_civil(year: i32, month: u32, day: u32) -> Option<i64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let year = year - (month <= 2) as i32;
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let month = month as i32;
    let day = day as i32;
    let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some((era * 146_097 + doe - 719_468) as i64)
}

fn ytdlp_asset_name(target: &str) -> &'static str {
    if target.contains("windows") {
        "yt-dlp.exe"
    } else if target.contains("apple-darwin") {
        "yt-dlp_macos"
    } else if target.contains("aarch64") {
        "yt-dlp_linux_aarch64"
    } else {
        "yt-dlp_linux"
    }
}

fn executable_name(tool_name: &str) -> String {
    if cfg!(windows) {
        format!("{tool_name}.exe")
    } else {
        tool_name.to_string()
    }
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(unix)]
fn mark_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)
        .map_err(|error| format!("yt_dlp_permissions_read_failed:{error}"))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)
        .map_err(|error| format!("yt_dlp_permissions_write_failed:{error}"))
}

#[cfg(not(unix))]
fn mark_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn sign_macos_ytdlp_if_needed(path: &Path) -> Result<(), String> {
    let output = Command::new("codesign")
        .args(macos_ytdlp_codesign_args(path))
        .output()
        .map_err(|error| format!("yt_dlp_codesign_start_failed:{error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(format!(
        "yt_dlp_codesign_failed:{}",
        if detail.is_empty() {
            "unknown"
        } else {
            &detail
        }
    ))
}

#[cfg(not(target_os = "macos"))]
fn sign_macos_ytdlp_if_needed(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn macos_ytdlp_codesign_args(path: &Path) -> Vec<String> {
    vec![
        "--force".to_string(),
        "--sign".to_string(),
        "-".to_string(),
        path.to_string_lossy().into_owned(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_release_dates_from_stable_and_nightly_versions() {
        assert_eq!(
            release_date_from_version("2026.03.17"),
            Some("2026.03.17".to_string())
        );
        assert_eq!(
            release_date_from_version("nightly@2025.02.19.023542"),
            Some("2025.02.19".to_string())
        );
    }

    #[test]
    fn maps_target_triples_to_yt_dlp_release_assets() {
        assert_eq!(ytdlp_asset_name("aarch64-apple-darwin"), "yt-dlp_macos");
        assert_eq!(ytdlp_asset_name("x86_64-pc-windows-msvc"), "yt-dlp.exe");
        assert_eq!(
            ytdlp_asset_name("aarch64-unknown-linux-gnu"),
            "yt-dlp_linux_aarch64"
        );
        assert_eq!(ytdlp_asset_name("x86_64-unknown-linux-gnu"), "yt-dlp_linux");
    }

    #[test]
    fn shapes_macos_ytdlp_ad_hoc_codesign_args() {
        assert_eq!(
            macos_ytdlp_codesign_args(Path::new("/tmp/yt-dlp")),
            vec!["--force", "--sign", "-", "/tmp/yt-dlp"]
        );
    }

    #[test]
    fn unix_epoch_day_math_matches_known_release_date() {
        assert_eq!(days_from_civil(1970, 1, 1), Some(0));
        assert_eq!(days_from_civil(2026, 3, 17), Some(20_529));
    }
}
