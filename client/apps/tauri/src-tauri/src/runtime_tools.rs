use futures_util::StreamExt;
use serde::Serialize;
use std::{
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Runtime};
use zip::ZipArchive;

use crate::helper::{path_to_string, runtime_target_triple, DENO_PATH_ENV};

const DENO_TOOL: &str = "deno";
const DENO_RELEASE_LATEST: &str = "https://dl.deno.land/release-latest.txt";
const DENO_RELEASE_BASE: &str = "https://dl.deno.land/release";
const RUNTIME_TOOLS_DIR: &str = "runtime-tools";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DenoRuntimeInstallResult {
    tool: &'static str,
    version: Option<String>,
    active_path: String,
    source: &'static str,
}

#[tauri::command]
pub async fn install_deno_runtime<R: Runtime>(
    app: AppHandle<R>,
) -> Result<DenoRuntimeInstallResult, String> {
    if let Some(path) = active_deno_path_for_app(&app) {
        if let Some(version) = read_deno_version(&path) {
            return Ok(DenoRuntimeInstallResult {
                tool: DENO_TOOL,
                version: Some(version),
                active_path: path_to_string(path),
                source: "existing",
            });
        }
    }

    let target = runtime_target_triple();
    if target == "unsupported-target" {
        return Err("deno_runtime_unsupported_target".to_string());
    }

    let destination_dir = app_data_runtime_tools_dir(&app)?;
    fs::create_dir_all(&destination_dir)
        .map_err(|error| format!("deno_runtime_dir_create_failed:{error}"))?;
    let destination = destination_dir.join(executable_name(DENO_TOOL));
    let partial = destination.with_extension("partial");
    let archive = download_deno_archive(target).await?;

    tauri::async_runtime::spawn_blocking({
        let destination = destination.clone();
        move || install_deno_archive(&archive, &partial, &destination)
    })
    .await
    .map_err(|error| format!("deno_runtime_install_join_failed:{error}"))??;

    let version = read_deno_version(&destination);
    Ok(DenoRuntimeInstallResult {
        tool: DENO_TOOL,
        version,
        active_path: path_to_string(destination),
        source: "downloaded",
    })
}

pub fn active_deno_path_for_app<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    std::env::var_os(DENO_PATH_ENV)
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| installed_deno_path_for_app(app))
}

pub fn installed_deno_path_for_app<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let path = app_data_runtime_tools_dir(app)
        .ok()?
        .join(executable_name(DENO_TOOL));
    path.is_file().then_some(path)
}

async fn download_deno_archive(target: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    let version = client
        .get(DENO_RELEASE_LATEST)
        .send()
        .await
        .map_err(|error| format!("deno_runtime_release_check_failed:{error}"))?
        .error_for_status()
        .map_err(|error| format!("deno_runtime_release_check_failed:{error}"))?
        .text()
        .await
        .map_err(|error| format!("deno_runtime_release_read_failed:{error}"))?
        .trim()
        .to_string();

    if !version.starts_with('v') {
        return Err("deno_runtime_release_invalid".to_string());
    }

    let url = format!("{DENO_RELEASE_BASE}/{version}/deno-{target}.zip");
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("deno_runtime_download_start_failed:{error}"))?
        .error_for_status()
        .map_err(|error| format!("deno_runtime_download_failed:{error}"))?;
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|error| format!("deno_runtime_download_stream_failed:{error}"))?;
        bytes.extend_from_slice(&chunk);
    }

    Ok(bytes)
}

fn install_deno_archive(archive: &[u8], partial: &Path, destination: &Path) -> Result<(), String> {
    let mut zip = ZipArchive::new(Cursor::new(archive))
        .map_err(|error| format!("deno_runtime_zip_open_failed:{error}"))?;
    let entry_name = executable_name(DENO_TOOL);
    let mut entry = zip
        .by_name(&entry_name)
        .map_err(|error| format!("deno_runtime_zip_entry_missing:{error}"))?;
    let mut file =
        fs::File::create(partial).map_err(|error| format!("deno_runtime_create_failed:{error}"))?;
    let mut buffer = Vec::new();

    entry
        .read_to_end(&mut buffer)
        .map_err(|error| format!("deno_runtime_zip_read_failed:{error}"))?;
    file.write_all(&buffer)
        .map_err(|error| format!("deno_runtime_write_failed:{error}"))?;
    file.flush()
        .map_err(|error| format!("deno_runtime_flush_failed:{error}"))?;
    drop(file);

    mark_executable(partial)?;
    fs::rename(partial, destination)
        .map_err(|error| format!("deno_runtime_rename_failed:{error}"))?;
    Ok(())
}

fn app_data_runtime_tools_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(crate::workspace::workspace_child_dir_for_app(
        app,
        RUNTIME_TOOLS_DIR,
        "runtime_tools_dir_create_failed",
        "runtime_tools_dir_invalid",
    )?
    .join(runtime_target_triple()))
}

fn read_deno_version(path: &Path) -> Option<String> {
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

fn executable_name(tool_name: &str) -> String {
    if cfg!(windows) {
        format!("{tool_name}.exe")
    } else {
        tool_name.to_string()
    }
}

#[cfg(unix)]
fn mark_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)
        .map_err(|error| format!("deno_runtime_metadata_failed:{error}"))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)
        .map_err(|error| format!("deno_runtime_chmod_failed:{error}"))
}

#[cfg(not(unix))]
fn mark_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_deno_archive_executable_name_for_platform() {
        let name = executable_name(DENO_TOOL);

        if cfg!(windows) {
            assert_eq!(name, "deno.exe");
        } else {
            assert_eq!(name, "deno");
        }
    }
}
