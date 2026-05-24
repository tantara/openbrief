mod credentials;
pub mod headless_download;
mod helper;
#[allow(dead_code)]
mod helper_sidecar;
mod ingest;
mod media_library;
mod media_tools;
mod platform_plugins;
mod provider;
mod stt_models;
mod trusted_paths;

use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

const TRANSCRIPT_OVERLAY_WINDOW_LABEL: &str = "transcript-overlay";
const TRANSCRIPT_OVERLAY_EVENT: &str = "openbrief://transcript-overlay";
const VIDEO_PLAYBACK_MENU_EVENT: &str = "openbrief://video-playback-command";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptOverlayPayload {
    video_title: String,
    timestamp: String,
    text: String,
}

#[tauri::command]
fn show_transcript_overlay(
    app: tauri::AppHandle,
    payload: TranscriptOverlayPayload,
) -> Result<bool, String> {
    let Some(window) = app.get_webview_window(TRANSCRIPT_OVERLAY_WINDOW_LABEL) else {
        return Ok(false);
    };

    window.show().map_err(|error| error.to_string())?;
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    app.emit_to(
        TRANSCRIPT_OVERLAY_WINDOW_LABEL,
        TRANSCRIPT_OVERLAY_EVENT,
        payload,
    )
    .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn hide_transcript_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window(TRANSCRIPT_OVERLAY_WINDOW_LABEL) else {
        return Ok(false);
    };

    window.hide().map_err(|error| error.to_string())?;
    Ok(true)
}

#[cfg(target_os = "macos")]
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let play = MenuItemBuilder::with_id("play-video", "Play").build(app)?;
    let pause = MenuItemBuilder::with_id("pause-video", "Pause").build(app)?;
    let menu = MenuBuilder::new(app).item(&play).item(&pause).build()?;
    let icon =
        Image::from_bytes(include_bytes!("../icons/32x32.png")).expect("failed to load tray icon");

    TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .tooltip("OpenBrief")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "play-video" => {
                let _ = app.emit_to("main", VIDEO_PLAYBACK_MENU_EVENT, "play");
            }
            "pause-video" => {
                let _ = app.emit_to("main", VIDEO_PLAYBACK_MENU_EVENT, "pause");
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn setup_tray(_app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder =
            builder
                .plugin(tauri_plugin_cli::init())
                .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                    use tauri::{Emitter, Manager};

                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }

                    let intent = platform_plugins::single_instance_intent_from_args(&args);
                    let _ = app.emit("openbrief://single-instance-intent", intent);
                }));
    }

    builder
        .manage(helper::HelperJobRegistry::default())
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("openbrief.log".to_string()),
                    },
                ))
                .build(),
        )
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            credentials::credential_storage_contract,
            credentials::provider_api_key_statuses,
            credentials::save_provider_api_key,
            helper::helper_protocol_contract,
            helper::run_helper_command,
            helper::resolve_library_file_path,
            ingest::classify_youtube_ingest_url,
            media_library::load_media_library_snapshot,
            media_library::save_media_library_snapshot,
            media_tools::yt_dlp_update_status,
            media_tools::set_yt_dlp_update_policy,
            media_tools::update_yt_dlp_now,
            platform_plugins::platform_plugin_contract,
            provider::complete_provider_request,
            show_transcript_overlay,
            stt_models::stt_model_catalog,
            stt_models::download_stt_model,
            trusted_paths::app_library_root,
            trusted_paths::copy_local_file_into_library,
            trusted_paths::copy_playlist_cover_into_library,
            credentials::provider_credential_handle,
            ingest::plan_local_file_import,
            credentials::redact_secret_fields,
            trusted_paths::trusted_local_file_import_plan,
            trusted_paths::validate_library_relative_path_command,
            trusted_paths::write_markdown_summary,
            trusted_paths::export_library_artifact,
            hide_transcript_overlay,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
