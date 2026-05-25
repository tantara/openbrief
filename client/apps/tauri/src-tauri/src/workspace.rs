use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, Runtime};

const DEFAULT_WORKSPACE_ID: &str = "default";
const WORKSPACE_DIR_NAME: &str = "workspace";
const ACTIVE_WORKSPACE_FILE_NAME: &str = "active-workspace.json";
const WORKSPACE_METADATA_FILE_NAME: &str = "workspace.json";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDescriptor {
    id: String,
    name: String,
    path: String,
    is_default: bool,
    active: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    active_workspace_id: String,
    workspaces: Vec<WorkspaceDescriptor>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ActiveWorkspaceState {
    workspace_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMetadata {
    id: String,
    name: String,
    created_at_unix_ms: u128,
}

#[tauri::command]
pub fn workspace_snapshot<R: Runtime>(app: AppHandle<R>) -> Result<WorkspaceSnapshot, String> {
    let app_data_dir = app_data_dir_for_app(&app)?;
    workspace_snapshot_from_app_data(&app_data_dir)
}

#[tauri::command]
pub fn create_workspace<R: Runtime>(
    app: AppHandle<R>,
    name: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    let app_data_dir = app_data_dir_for_app(&app)?;
    let existing = workspace_snapshot_from_app_data(&app_data_dir)?;
    let workspace_name = name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Workspace {}", existing.workspaces.len() + 1));
    let workspace_id = unique_workspace_id(&app_data_dir, &workspace_name)?;
    let workspace_root = workspace_home_dir(&app_data_dir).join(&workspace_id);
    fs::create_dir_all(workspace_root.join("library"))
        .map_err(|error| format!("workspace_library_create_failed:{error}"))?;
    fs::create_dir_all(workspace_root.join("credentials"))
        .map_err(|error| format!("workspace_credentials_create_failed:{error}"))?;

    write_workspace_metadata(
        &workspace_root,
        &WorkspaceMetadata {
            id: workspace_id.clone(),
            name: workspace_name,
            created_at_unix_ms: now_unix_ms(),
        },
    )?;
    write_active_workspace_id(&app_data_dir, &workspace_id)?;
    workspace_snapshot_from_app_data(&app_data_dir)
}

#[tauri::command]
pub fn switch_workspace<R: Runtime>(
    app: AppHandle<R>,
    workspace_id: String,
) -> Result<WorkspaceSnapshot, String> {
    let app_data_dir = app_data_dir_for_app(&app)?;
    let workspace_id = workspace_id.trim();
    ensure_workspace_exists(&app_data_dir, workspace_id)?;
    write_active_workspace_id(&app_data_dir, workspace_id)?;
    workspace_snapshot_from_app_data(&app_data_dir)
}

pub(crate) fn workspace_root_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let app_data_dir = app_data_dir_for_app(app)?;
    let active_workspace_id = active_workspace_id(&app_data_dir)?;
    let root = workspace_root_for_id(&app_data_dir, &active_workspace_id)?;
    fs::create_dir_all(&root).map_err(|error| format!("workspace_root_create_failed:{error}"))?;
    canonicalize_existing_dir(&root, "workspace_root_invalid")
}

pub(crate) fn library_root_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    workspace_child_dir_for_app(
        app,
        "library",
        "library_root_create_failed",
        "library_root_invalid",
    )
}

pub(crate) fn credentials_dir_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    workspace_child_dir_for_app(
        app,
        "credentials",
        "provider_credentials_dir_create_failed",
        "provider_credentials_dir_invalid",
    )
}

pub(crate) fn models_dir_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    workspace_child_dir_for_app(
        app,
        "models",
        "models_dir_create_failed",
        "models_dir_invalid",
    )
}

pub(crate) fn workspace_child_dir_for_app<R: Runtime>(
    app: &AppHandle<R>,
    child: &str,
    create_error: &str,
    invalid_error: &str,
) -> Result<PathBuf, String> {
    let root = workspace_root_for_app(app)?;
    let child_dir = root.join(child);
    fs::create_dir_all(&child_dir).map_err(|error| format!("{create_error}:{error}"))?;
    canonicalize_existing_dir(&child_dir, invalid_error)
}

fn app_data_dir_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir_unavailable:{error}"))
}

fn workspace_snapshot_from_app_data(app_data_dir: &Path) -> Result<WorkspaceSnapshot, String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("app_data_dir_create_failed:{error}"))?;
    fs::create_dir_all(workspace_home_dir(app_data_dir))
        .map_err(|error| format!("workspace_home_create_failed:{error}"))?;
    let active_workspace_id = active_workspace_id(app_data_dir)?;
    let mut workspaces = vec![workspace_descriptor(
        DEFAULT_WORKSPACE_ID,
        "Default",
        app_data_dir,
        true,
        active_workspace_id == DEFAULT_WORKSPACE_ID,
    )?];

    for entry in fs::read_dir(workspace_home_dir(app_data_dir))
        .map_err(|error| format!("workspace_home_read_failed:{error}"))?
    {
        let entry = entry.map_err(|error| format!("workspace_entry_read_failed:{error}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !is_valid_workspace_id(file_name) || file_name == DEFAULT_WORKSPACE_ID {
            continue;
        }
        let metadata = read_workspace_metadata(&path).unwrap_or_else(|| WorkspaceMetadata {
            id: file_name.to_string(),
            name: humanize_workspace_id(file_name),
            created_at_unix_ms: 0,
        });
        workspaces.push(workspace_descriptor(
            &metadata.id,
            &metadata.name,
            &path,
            false,
            active_workspace_id == metadata.id,
        )?);
    }

    workspaces.sort_by(|left, right| {
        left.is_default
            .cmp(&right.is_default)
            .reverse()
            .then_with(|| {
                left.name
                    .to_ascii_lowercase()
                    .cmp(&right.name.to_ascii_lowercase())
            })
            .then_with(|| left.id.cmp(&right.id))
    });

    Ok(WorkspaceSnapshot {
        active_workspace_id,
        workspaces,
    })
}

fn workspace_descriptor(
    id: &str,
    name: &str,
    path: &Path,
    is_default: bool,
    active: bool,
) -> Result<WorkspaceDescriptor, String> {
    Ok(WorkspaceDescriptor {
        id: id.to_string(),
        name: name.to_string(),
        path: path_to_string(canonicalize_existing_dir(path, "workspace_path_invalid")?),
        is_default,
        active,
    })
}

fn ensure_workspace_exists(app_data_dir: &Path, workspace_id: &str) -> Result<(), String> {
    if workspace_id == DEFAULT_WORKSPACE_ID {
        return Ok(());
    }
    if !is_valid_workspace_id(workspace_id) {
        return Err("workspace_id_invalid".to_string());
    }
    let root = workspace_home_dir(app_data_dir).join(workspace_id);
    let metadata = fs::metadata(&root).map_err(|_| "workspace_not_found".to_string())?;
    if !metadata.is_dir() {
        return Err("workspace_not_directory".to_string());
    }
    Ok(())
}

fn active_workspace_id(app_data_dir: &Path) -> Result<String, String> {
    let path = workspace_home_dir(app_data_dir).join(ACTIVE_WORKSPACE_FILE_NAME);
    let state = match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str::<ActiveWorkspaceState>(&contents).ok(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("active_workspace_read_failed:{error}")),
    };
    let workspace_id = state
        .map(|value| value.workspace_id)
        .filter(|value| is_valid_workspace_id(value))
        .unwrap_or_else(|| DEFAULT_WORKSPACE_ID.to_string());

    if workspace_id != DEFAULT_WORKSPACE_ID
        && !workspace_home_dir(app_data_dir)
            .join(&workspace_id)
            .is_dir()
    {
        return Ok(DEFAULT_WORKSPACE_ID.to_string());
    }

    Ok(workspace_id)
}

fn write_active_workspace_id(app_data_dir: &Path, workspace_id: &str) -> Result<(), String> {
    fs::create_dir_all(workspace_home_dir(app_data_dir))
        .map_err(|error| format!("workspace_home_create_failed:{error}"))?;
    let state = ActiveWorkspaceState {
        workspace_id: workspace_id.to_string(),
    };
    let bytes = serde_json::to_vec_pretty(&state)
        .map_err(|error| format!("active_workspace_serialize_failed:{error}"))?;
    fs::write(
        workspace_home_dir(app_data_dir).join(ACTIVE_WORKSPACE_FILE_NAME),
        bytes,
    )
    .map_err(|error| format!("active_workspace_write_failed:{error}"))
}

fn workspace_root_for_id(app_data_dir: &Path, workspace_id: &str) -> Result<PathBuf, String> {
    if workspace_id == DEFAULT_WORKSPACE_ID {
        return Ok(app_data_dir.to_path_buf());
    }
    if !is_valid_workspace_id(workspace_id) {
        return Err("workspace_id_invalid".to_string());
    }
    Ok(workspace_home_dir(app_data_dir).join(workspace_id))
}

fn unique_workspace_id(app_data_dir: &Path, name: &str) -> Result<String, String> {
    let base = workspace_id_from_name(name);
    for suffix in 0..100 {
        let candidate = if suffix == 0 {
            base.clone()
        } else {
            format!("{base}-{suffix}")
        };
        if candidate != DEFAULT_WORKSPACE_ID
            && !workspace_home_dir(app_data_dir).join(&candidate).exists()
        {
            return Ok(candidate);
        }
    }
    Ok(format!("workspace-{}", now_unix_ms()))
}

fn workspace_id_from_name(name: &str) -> String {
    let mut id = String::new();
    let mut previous_dash = false;
    for character in name.trim().chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            id.push(character);
            previous_dash = false;
        } else if !previous_dash && !id.is_empty() {
            id.push('-');
            previous_dash = true;
        }
        if id.len() >= 48 {
            break;
        }
    }
    while id.ends_with('-') {
        id.pop();
    }
    if id.is_empty() {
        "workspace".to_string()
    } else {
        id
    }
}

fn is_valid_workspace_id(workspace_id: &str) -> bool {
    !workspace_id.is_empty()
        && workspace_id.len() <= 64
        && workspace_id != "."
        && workspace_id != ".."
        && workspace_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn workspace_home_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(WORKSPACE_DIR_NAME)
}

fn write_workspace_metadata(root: &Path, metadata: &WorkspaceMetadata) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(metadata)
        .map_err(|error| format!("workspace_metadata_serialize_failed:{error}"))?;
    fs::write(root.join(WORKSPACE_METADATA_FILE_NAME), bytes)
        .map_err(|error| format!("workspace_metadata_write_failed:{error}"))
}

fn read_workspace_metadata(root: &Path) -> Option<WorkspaceMetadata> {
    let contents = fs::read_to_string(root.join(WORKSPACE_METADATA_FILE_NAME)).ok()?;
    let metadata = serde_json::from_str::<WorkspaceMetadata>(&contents).ok()?;
    (metadata.id == root.file_name()?.to_str()?).then_some(metadata)
}

fn humanize_workspace_id(workspace_id: &str) -> String {
    workspace_id
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn canonicalize_existing_dir(path: &Path, error_code: &str) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|error| format!("{error_code}:{error}"))
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn default_workspace_uses_existing_app_data_root() {
        let root = create_temp_root("workspace-default");
        let snapshot = workspace_snapshot_from_app_data(&root).unwrap();

        assert_eq!(snapshot.active_workspace_id, "default");
        assert_eq!(snapshot.workspaces.len(), 1);
        assert_eq!(snapshot.workspaces[0].id, "default");
        assert_eq!(
            snapshot.workspaces[0].path,
            root.to_string_lossy().into_owned()
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn created_workspace_uses_workspace_child_root_and_becomes_active() {
        let root = create_temp_root("workspace-created");
        let workspace_id = unique_workspace_id(&root, "Research Notes").unwrap();
        let workspace_root = workspace_home_dir(&root).join(&workspace_id);
        fs::create_dir_all(workspace_root.join("library")).unwrap();
        fs::create_dir_all(workspace_root.join("credentials")).unwrap();
        write_workspace_metadata(
            &workspace_root,
            &WorkspaceMetadata {
                id: workspace_id.clone(),
                name: "Research Notes".to_string(),
                created_at_unix_ms: 1,
            },
        )
        .unwrap();
        write_active_workspace_id(&root, &workspace_id).unwrap();

        let snapshot = workspace_snapshot_from_app_data(&root).unwrap();

        assert_eq!(snapshot.active_workspace_id, workspace_id);
        assert!(snapshot.workspaces.iter().any(|workspace| {
            workspace.id == "research-notes"
                && workspace.active
                && workspace.path.ends_with("workspace/research-notes")
        }));

        let _ = fs::remove_dir_all(root);
    }

    fn create_temp_root(name: &str) -> PathBuf {
        let root = env::temp_dir().join(format!("{name}-{}", now_unix_ms()));
        fs::create_dir_all(&root).unwrap();
        root.canonicalize().unwrap()
    }
}
