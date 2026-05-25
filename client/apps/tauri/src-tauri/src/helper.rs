use crate::helper_sidecar;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufRead, BufReader, Read},
    path::{Component, Path, PathBuf},
    process::{Child, Command, Output, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Instant,
};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_shell::ShellExt;

pub const HELPER_PROTOCOL_VERSION: u16 = 1;
pub const HELPER_SIDECAR_BASE_NAME: &str = "openbrief-helper";
pub const HELPER_EXTERNAL_BIN_PATH: &str = "openbrief-helper";
pub const MEDIA_TOOLS_RESOURCE_DIR: &str = "media-tools";
pub const MEDIA_TOOLS_DIR_ENV: &str = "OPENBRIEF_MEDIA_TOOLS_DIR";
pub const YTDLP_PATH_ENV: &str = "OPENBRIEF_YTDLP_PATH";
pub const DENO_PATH_ENV: &str = "OPENBRIEF_DENO_PATH";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HelperCommandName {
    ProbeMedia,
    DownloadYoutube,
    ExtractThumbnail,
    ListCaptions,
    ExtractCaptions,
    ExtractAudio,
    TranscodeVideo,
    InspectVideoGenerationRuntime,
    RenderHtmlComposition,
    TranscribeAudio,
    CancelJob,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HelperProtocolContract {
    protocol_version: u16,
    sidecar_base_name: &'static str,
    sidecar_external_bin: &'static str,
    commands: Vec<HelperCommandName>,
    media_tools: Vec<BundledMediaToolContract>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundledMediaToolContract {
    tool: &'static str,
    version_args: Vec<&'static str>,
    receives_provider_credentials: bool,
    execution_contract: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HelperRunResult {
    pub(crate) events: Vec<Value>,
    pub(crate) result: Value,
}

#[derive(Debug)]
pub(crate) struct ParsedHelperOutput {
    pub(crate) events: Vec<Value>,
    pub(crate) completed_result: Option<Value>,
    pub(crate) failed_message: Option<String>,
}

#[derive(Clone, Default)]
pub struct HelperJobRegistry {
    children: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
    cancelled: Arc<Mutex<HashSet<String>>>,
}

impl HelperJobRegistry {
    fn insert(&self, job_id: &str, child: Arc<Mutex<Child>>) -> Result<(), String> {
        self.children
            .lock()
            .map_err(|_| "helper_job_registry_poisoned".to_string())?
            .insert(job_id.to_string(), child);
        Ok(())
    }

    fn remove(&self, job_id: &str) {
        if let Ok(mut children) = self.children.lock() {
            children.remove(job_id);
        }
    }

    fn cancel(&self, job_id: &str) -> Result<bool, String> {
        self.cancelled
            .lock()
            .map_err(|_| "helper_job_registry_poisoned".to_string())?
            .insert(job_id.to_string());

        let child = self
            .children
            .lock()
            .map_err(|_| "helper_job_registry_poisoned".to_string())?
            .get(job_id)
            .cloned();

        if let Some(child) = child {
            let _ = child
                .lock()
                .map_err(|_| "helper_job_registry_poisoned".to_string())?
                .kill();
            Ok(true)
        } else {
            Ok(false)
        }
    }

    fn take_cancelled(&self, job_id: &str) -> bool {
        self.cancelled
            .lock()
            .map(|mut cancelled| cancelled.remove(job_id))
            .unwrap_or(false)
    }
}

#[tauri::command]
pub fn helper_protocol_contract() -> HelperProtocolContract {
    HelperProtocolContract {
        protocol_version: HELPER_PROTOCOL_VERSION,
        sidecar_base_name: HELPER_SIDECAR_BASE_NAME,
        sidecar_external_bin: HELPER_EXTERNAL_BIN_PATH,
        commands: vec![
            HelperCommandName::ProbeMedia,
            HelperCommandName::DownloadYoutube,
            HelperCommandName::ExtractThumbnail,
            HelperCommandName::ListCaptions,
            HelperCommandName::ExtractCaptions,
            HelperCommandName::ExtractAudio,
            HelperCommandName::TranscodeVideo,
            HelperCommandName::InspectVideoGenerationRuntime,
            HelperCommandName::RenderHtmlComposition,
            HelperCommandName::TranscribeAudio,
            HelperCommandName::CancelJob,
        ],
        media_tools: vec![
            media_tool_contract("yt-dlp", vec!["--version"]),
            media_tool_contract("ffmpeg", vec!["-version"]),
            media_tool_contract("ffprobe", vec!["-version"]),
            media_tool_contract("deno", vec!["--version"]),
        ],
    }
}

#[tauri::command]
pub async fn run_helper_command<R: Runtime>(
    app: AppHandle<R>,
    jobs: State<'_, HelperJobRegistry>,
    command: Value,
) -> Result<HelperRunResult, String> {
    let library_root = app_library_root(&app)?;
    let models_root = app_models_root(&app)?;
    let sidecar_command = prepare_helper_command_for_sidecar(command, &library_root, &models_root)?;
    let request = serde_json::from_value::<helper_sidecar::HelperRequest>(sidecar_command.clone())
        .map_err(|error| format!("helper_command_parse_failed:{error}"))?;

    if request.command == helper_sidecar::HelperCommandName::CancelJob {
        return cancel_helper_job(&request.payload, &jobs, &library_root);
    }

    if request.command == helper_sidecar::HelperCommandName::DownloadYoutube {
        let app = app.clone();
        let jobs = jobs.inner().clone();

        return tauri::async_runtime::spawn_blocking(move || {
            run_streaming_helper_command(app, jobs, request, library_root)
        })
        .await
        .map_err(|error| format!("helper_stream_join_failed:{error}"))?;
    }

    if request.command == helper_sidecar::HelperCommandName::TranscribeAudio {
        if let Some(model_id) = crate::qwen_asr::should_route_transcribe_to_qwen(&request.payload)?
        {
            return crate::qwen_asr::run_transcribe_audio(
                &app,
                &request,
                sidecar_command,
                &library_root,
                &models_root,
                model_id,
            )
            .await;
        }

        if let Some(normalized_language) =
            crate::fluidaudio::should_route_transcribe_to_fluidaudio(&request.payload)?
        {
            return crate::fluidaudio::run_transcribe_audio(
                &app,
                &request,
                sidecar_command,
                &library_root,
                &models_root,
                normalized_language,
            )
            .await;
        }
    }

    let command_json = serde_json::to_string(&sidecar_command)
        .map_err(|error| format!("helper_command_serialize_failed:{error}"))?;
    let should_log_stt = request.command == helper_sidecar::HelperCommandName::TranscribeAudio;
    if should_log_stt {
        log::info!(
            target: "openbrief::stt",
            "before running stt; job_id={}; command=transcribe_audio",
            request.job_id.as_deref().unwrap_or("unknown"),
        );
    }
    let mut sidecar = app
        .shell()
        .sidecar(HELPER_EXTERNAL_BIN_PATH)
        .map_err(|error| format!("helper_sidecar_unavailable:{error}"))?
        .args(["--json".to_string(), command_json]);

    if let Some(media_tools_dir) = media_tools_dir_for_app(&app) {
        sidecar = sidecar.env(MEDIA_TOOLS_DIR_ENV, media_tools_dir);
    }
    if let Some(ytdlp_path) = crate::media_tools::updated_ytdlp_path_for_app(&app) {
        sidecar = sidecar.env(YTDLP_PATH_ENV, ytdlp_path);
    }
    if let Ok(deno_path) = std::env::var(DENO_PATH_ENV) {
        sidecar = sidecar.env(DENO_PATH_ENV, deno_path);
    }

    let started_at = Instant::now();
    let output = sidecar.output().await.map_err(|error| {
        if should_log_stt {
            log::error!(
                target: "openbrief::stt",
                "after running stt; job_id={}; status=start_failed; elapsed_ms={}; error={}",
                request.job_id.as_deref().unwrap_or("unknown"),
                started_at.elapsed().as_millis(),
                error,
            );
        }
        format!("helper_sidecar_failed_to_start:{error}")
    })?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = parse_helper_output(&stdout, &library_root)?;

    if output.status.success() {
        if should_log_stt {
            log::info!(
                target: "openbrief::stt",
                "after running stt; job_id={}; status=success; elapsed_ms={}",
                request.job_id.as_deref().unwrap_or("unknown"),
                started_at.elapsed().as_millis(),
            );
        }
        let result = parsed
            .completed_result
            .ok_or_else(|| "helper_result_missing".to_string())?;
        let result =
            enrich_helper_result_from_trusted_context(request.command, &request.payload, result)
                .map_err(|error| format!("helper_result_enrich_failed:{error}"))?;
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
                "after running stt; job_id={}; status=failed; elapsed_ms={}; exit_code={}; error={}",
                request.job_id.as_deref().unwrap_or("unknown"),
                started_at.elapsed().as_millis(),
                output.status.code().unwrap_or(-1),
                detail,
            );
        }
        Err(format!(
            "helper_sidecar_failed:{}:{}",
            output.status.code().unwrap_or(-1),
            detail
        ))
    }
}

fn enrich_helper_result_from_trusted_context(
    command: helper_sidecar::HelperCommandName,
    payload: &Value,
    mut result: Value,
) -> Result<Value, String> {
    if command != helper_sidecar::HelperCommandName::ExtractCaptions {
        return Ok(result);
    }

    let has_segments = result
        .get("segments")
        .and_then(Value::as_array)
        .is_some_and(|segments| !segments.is_empty());
    if has_segments {
        return Ok(result);
    }

    let enriched =
        helper_sidecar::extract_captions_result(payload).map_err(|error| error.to_string())?;
    if let Some(segments) = enriched.get("segments") {
        result["segments"] = segments.clone();
    }

    Ok(result)
}

#[tauri::command]
pub fn resolve_library_file_path<R: Runtime>(
    app: AppHandle<R>,
    relative_path: String,
) -> Result<String, String> {
    let library_root = app_library_root(&app)?;
    let absolute_path = library_absolute_path(&library_root, &relative_path, false)?;
    let canonical_path = absolute_path
        .canonicalize()
        .map_err(|error| format!("library_file_not_found:{error}"))?;

    if !canonical_path.starts_with(&library_root) {
        return Err("library_file_escaped_root".to_string());
    }

    Ok(path_to_string(canonical_path))
}

fn cancel_helper_job(
    payload: &Value,
    jobs: &HelperJobRegistry,
    library_root: &Path,
) -> Result<HelperRunResult, String> {
    let target_job_id = payload
        .get("targetJobId")
        .or_else(|| payload.get("jobId"))
        .and_then(Value::as_str)
        .ok_or_else(|| "cancel_job_missing_target".to_string())?;
    let cancelled = jobs.cancel(target_job_id)?;
    let events = vec![
        relativize_helper_paths(
            json!({
                "protocolVersion": HELPER_PROTOCOL_VERSION,
                "event": "job_cancelled",
                "jobId": target_job_id,
                "command": "cancel_job",
                "targetJobId": target_job_id,
            }),
            library_root,
        )?,
        relativize_helper_paths(
            json!({
                "protocolVersion": HELPER_PROTOCOL_VERSION,
                "event": "job_completed",
                "jobId": format!("cancel-{target_job_id}"),
                "command": "cancel_job",
                "result": {
                    "command": "cancel_job",
                    "targetJobId": target_job_id,
                    "cancelled": cancelled,
                },
            }),
            library_root,
        )?,
    ];

    Ok(HelperRunResult {
        events,
        result: json!({
            "command": "cancel_job",
            "targetJobId": target_job_id,
            "cancelled": cancelled,
        }),
    })
}

fn run_streaming_helper_command<R: Runtime>(
    app: AppHandle<R>,
    jobs: HelperJobRegistry,
    request: helper_sidecar::HelperRequest,
    library_root: PathBuf,
) -> Result<HelperRunResult, String> {
    let job_id = request.job_id.as_deref().unwrap_or("unknown").to_string();
    let mut events = Vec::new();
    push_helper_event(
        &app,
        &library_root,
        &mut events,
        json!({
            "protocolVersion": HELPER_PROTOCOL_VERSION,
            "event": "job_started",
            "jobId": job_id,
            "command": request.command,
        }),
    )?;

    let mut plan = helper_sidecar::command_plan_for_request(&request)
        .map_err(|error| format!("helper_plan_failed:{error}"))?;
    plan.program = resolve_streaming_plan_program(&app, plan.tool, plan.program);
    attach_ffmpeg_location_to_download_plan(&mut plan, media_tools_dir_for_app(&app));
    push_helper_event(
        &app,
        &library_root,
        &mut events,
        json!({
            "protocolVersion": HELPER_PROTOCOL_VERSION,
            "event": "job_progress",
            "jobId": job_id,
            "command": request.command,
            "progress": 0.01,
            "message": "starting media tool",
            "result": {
                "tool": plan.tool,
                "argv": std::iter::once(plan.program.to_string_lossy().into_owned())
                    .chain(plan.args.iter().cloned())
                    .collect::<Vec<_>>(),
            },
        }),
    )?;

    let started_at = Instant::now();
    if request.command == helper_sidecar::HelperCommandName::DownloadYoutube {
        let output_dir = request
            .payload
            .get("outputDir")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        log::info!(
            target: "openbrief::video_download",
            "before downloading video; job_id={}; tool={}; program={}; output_dir={}",
            job_id,
            plan.tool,
            plan.program.to_string_lossy(),
            output_dir,
        );
    }

    let mut child = Command::new(&plan.program)
        .args(&plan.args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            if request.command == helper_sidecar::HelperCommandName::DownloadYoutube {
                log::error!(
                    target: "openbrief::video_download",
                    "after downloading video; job_id={}; status=start_failed; elapsed_ms={}; error={}",
                    job_id,
                    started_at.elapsed().as_millis(),
                    error,
                );
            }
            format!("failed to start {}: {error}", plan.tool)
        })?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "helper_stdout_unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "helper_stderr_unavailable".to_string())?;
    let child = Arc::new(Mutex::new(child));
    jobs.insert(&job_id, child.clone())?;

    let stdout_app = app.clone();
    let stdout_library_root = library_root.clone();
    let stdout_job_id = job_id.clone();
    let stdout_command = request.command;
    let stdout_handle = thread::spawn(move || {
        read_stdout_with_progress(
            stdout,
            stdout_app,
            stdout_library_root,
            stdout_job_id,
            stdout_command,
        )
    });
    let stderr_handle = thread::spawn(move || read_stream_to_bytes(stderr));

    let status = child
        .lock()
        .map_err(|_| "helper_job_registry_poisoned".to_string())?
        .wait()
        .map_err(|error| format!("helper_wait_failed:{error}"))?;
    jobs.remove(&job_id);

    let mut stdout_events = stdout_handle
        .join()
        .map_err(|_| "helper_stdout_thread_failed".to_string())??;
    let stdout = stdout_events.stdout;
    let stderr = stderr_handle
        .join()
        .map_err(|_| "helper_stderr_thread_failed".to_string())??;
    events.append(&mut stdout_events.events);
    let output = Output {
        status,
        stdout,
        stderr,
    };

    if output.status.success() {
        let result = helper_sidecar::command_result(request.command, &request.payload, &output)
            .map_err(|error| format!("helper_result_failed:{error}"))?;
        if request.command == helper_sidecar::HelperCommandName::DownloadYoutube {
            let output_dir = request
                .payload
                .get("outputDir")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let video_path = result
                .get("videoPath")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let thumbnail_path = result
                .get("thumbnailPath")
                .and_then(Value::as_str)
                .unwrap_or("none");
            log::info!(
                target: "openbrief::video_download",
                "after downloading video; job_id={}; status=success; elapsed_ms={}; output_dir={}; video_path={}; thumbnail_path={}",
                job_id,
                started_at.elapsed().as_millis(),
                output_dir,
                video_path,
                thumbnail_path,
            );
        }
        let completed_event = json!({
            "protocolVersion": HELPER_PROTOCOL_VERSION,
            "event": "job_completed",
            "jobId": job_id,
            "command": request.command,
            "progress": 1.0,
            "result": result,
        });
        push_helper_event(&app, &library_root, &mut events, completed_event)?;
        let result = events
            .iter()
            .rev()
            .find(|event| event.get("event").and_then(Value::as_str) == Some("job_completed"))
            .and_then(|event| event.get("result"))
            .cloned()
            .ok_or_else(|| "helper_result_missing".to_string())?;

        Ok(HelperRunResult { events, result })
    } else if jobs.take_cancelled(&job_id) {
        if request.command == helper_sidecar::HelperCommandName::DownloadYoutube {
            log::warn!(
                target: "openbrief::video_download",
                "after downloading video; job_id={}; status=cancelled; elapsed_ms={}",
                job_id,
                started_at.elapsed().as_millis(),
            );
        }
        push_helper_event(
            &app,
            &library_root,
            &mut events,
            json!({
                "protocolVersion": HELPER_PROTOCOL_VERSION,
                "event": "job_cancelled",
                "jobId": job_id,
                "command": "cancel_job",
                "targetJobId": job_id,
            }),
        )?;
        Err("helper_job_cancelled".to_string())
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if request.command == helper_sidecar::HelperCommandName::DownloadYoutube {
            log::error!(
                target: "openbrief::video_download",
                "after downloading video; job_id={}; status=failed; elapsed_ms={}; exit_status={}; error={}",
                job_id,
                started_at.elapsed().as_millis(),
                output.status,
                detail,
            );
        }
        push_helper_event(
            &app,
            &library_root,
            &mut events,
            json!({
                "protocolVersion": HELPER_PROTOCOL_VERSION,
                "event": "job_failed",
                "jobId": job_id,
                "command": request.command,
                "error": {
                    "message": format!("{} exited with status {}: {}", plan.tool, output.status, detail),
                },
            }),
        )?;
        Err(format!(
            "{} exited with status {}: {}",
            plan.tool, output.status, detail
        ))
    }
}

struct StreamedStdout {
    stdout: Vec<u8>,
    events: Vec<Value>,
}

fn read_stdout_with_progress<R: Runtime>(
    stdout: impl Read,
    app: AppHandle<R>,
    library_root: PathBuf,
    job_id: String,
    command: helper_sidecar::HelperCommandName,
) -> Result<StreamedStdout, String> {
    let mut output = Vec::new();
    let mut events = Vec::new();

    for line in BufReader::new(stdout).lines() {
        let line = line.map_err(|error| format!("helper_stdout_read_failed:{error}"))?;
        output.extend_from_slice(line.as_bytes());
        output.push(b'\n');

        if let Some(progress) = parse_yt_dlp_progress(&line) {
            push_helper_event(
                &app,
                &library_root,
                &mut events,
                json!({
                    "protocolVersion": HELPER_PROTOCOL_VERSION,
                    "event": "job_progress",
                    "jobId": job_id,
                    "command": command,
                    "progress": progress,
                    "message": line,
                }),
            )?;
        }
    }

    Ok(StreamedStdout {
        stdout: output,
        events,
    })
}

fn read_stream_to_bytes(stream: impl Read) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    let mut reader = BufReader::new(stream);

    reader
        .read_to_end(&mut output)
        .map_err(|error| format!("helper_stderr_read_failed:{error}"))?;
    Ok(output)
}

fn push_helper_event<R: Runtime>(
    app: &AppHandle<R>,
    library_root: &Path,
    events: &mut Vec<Value>,
    event: Value,
) -> Result<(), String> {
    let event = relativize_helper_paths(event, library_root)?;
    let _ = app.emit("openbrief://helper-event", event.clone());
    events.push(event);
    Ok(())
}

fn parse_yt_dlp_progress(line: &str) -> Option<f32> {
    if !line.starts_with("[download]") {
        return None;
    }

    let percent_index = line.find('%')?;
    let before_percent = &line[..percent_index];
    let token = before_percent
        .split_whitespace()
        .last()?
        .trim()
        .trim_end_matches('%');
    let percent = token.parse::<f32>().ok()?;

    Some((percent / 100.0).clamp(0.0, 1.0))
}

fn media_tool_contract(
    tool: &'static str,
    version_args: Vec<&'static str>,
) -> BundledMediaToolContract {
    BundledMediaToolContract {
        tool,
        version_args,
        receives_provider_credentials: false,
        execution_contract: "subprocess-argv-array-only",
    }
}

fn media_tools_dir_for_app<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .resource_dir()
        .ok()
        .map(|resource_dir| {
            resource_dir
                .join(MEDIA_TOOLS_RESOURCE_DIR)
                .join(runtime_target_triple())
        })
        .filter(|path| path.exists())
}

fn resolve_streaming_plan_program<R: Runtime>(
    app: &AppHandle<R>,
    tool: &'static str,
    fallback: PathBuf,
) -> PathBuf {
    resolve_streaming_plan_program_from_paths(
        tool,
        fallback,
        crate::media_tools::updated_ytdlp_path_for_app(app),
        media_tools_dir_for_app(app),
    )
}

fn resolve_streaming_plan_program_from_paths(
    tool: &'static str,
    fallback: PathBuf,
    updated_ytdlp_path: Option<PathBuf>,
    media_tools_dir: Option<PathBuf>,
) -> PathBuf {
    if tool == "yt-dlp" {
        if let Some(ytdlp_path) = updated_ytdlp_path {
            return ytdlp_path;
        }
    }

    if let Some(media_tools_dir) = media_tools_dir {
        let bundled_path = media_tools_dir.join(media_tool_executable_name(tool));
        if bundled_path.is_file() {
            return bundled_path;
        }
    }

    fallback
}

fn attach_ffmpeg_location_to_download_plan(
    plan: &mut helper_sidecar::CommandPlan,
    media_tools_dir: Option<PathBuf>,
) {
    if plan.tool != "yt-dlp" || plan.args.iter().any(|arg| arg == "--ffmpeg-location") {
        return;
    }

    let Some(media_tools_dir) = media_tools_dir else {
        return;
    };

    let insert_at = plan.args.len().saturating_sub(1);
    plan.args.splice(
        insert_at..insert_at,
        [
            "--ffmpeg-location".to_string(),
            media_tools_dir.to_string_lossy().into_owned(),
        ],
    );
}

fn media_tool_executable_name(tool_name: &str) -> String {
    if cfg!(windows) {
        format!("{tool_name}.exe")
    } else {
        tool_name.to_string()
    }
}

pub fn runtime_target_triple() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return "aarch64-apple-darwin";
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        return "x86_64-apple-darwin";
    }
    #[cfg(all(windows, target_arch = "x86_64"))]
    {
        return "x86_64-pc-windows-msvc";
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        return "x86_64-unknown-linux-gnu";
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        return "aarch64-unknown-linux-gnu";
    }
    #[allow(unreachable_code)]
    "unsupported-target"
}

fn app_library_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    crate::workspace::library_root_for_app(app)
}

fn app_models_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    crate::workspace::workspace_child_dir_for_app(
        app,
        "models",
        "models_root_create_failed",
        "models_root_invalid",
    )
}

fn prepare_helper_command_for_sidecar(
    mut command: Value,
    library_root: &Path,
    models_root: &Path,
) -> Result<Value, String> {
    let object = command
        .as_object_mut()
        .ok_or_else(|| "helper_command_must_be_object".to_string())?;

    for key in [
        "inputPath",
        "videoPath",
        "audioPath",
        "outputPath",
        "outputDir",
        "tempDir",
    ] {
        let Some(path) = object.get(key).and_then(Value::as_str) else {
            continue;
        };
        let absolute_path = library_absolute_path(library_root, path, path_key_is_output(key))?;
        object.insert(
            key.to_string(),
            Value::String(path_to_string(absolute_path)),
        );
    }

    if let Some(model_path) = object.get("modelPath").and_then(Value::as_str) {
        let absolute_path = model_absolute_path(models_root, model_path)?;
        object.insert(
            "modelPath".to_string(),
            Value::String(path_to_string(absolute_path)),
        );
    }

    Ok(command)
}

fn library_absolute_path(
    library_root: &Path,
    relative_path: &str,
    create_parent: bool,
) -> Result<PathBuf, String> {
    let relative = PathBuf::from(relative_path);

    if relative.is_absolute() || has_forbidden_component(&relative) {
        return Err("helper_path_must_be_library_relative".to_string());
    }

    let absolute = library_root.join(&relative);
    if create_parent {
        let parent = if absolute.extension().is_some() {
            absolute.parent().unwrap_or(library_root)
        } else {
            absolute.as_path()
        };
        fs::create_dir_all(parent)
            .map_err(|error| format!("helper_library_parent_create_failed:{error}"))?;
    }

    Ok(absolute)
}

fn model_absolute_path(models_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative = PathBuf::from(relative_path);

    if relative.is_absolute() || has_forbidden_component(&relative) {
        return Err("helper_model_path_must_be_model_relative".to_string());
    }

    let relative = relative
        .strip_prefix("models")
        .map(Path::to_path_buf)
        .unwrap_or(relative);

    Ok(models_root.join(relative))
}

pub(crate) fn parse_helper_output(
    stdout: &str,
    library_root: &Path,
) -> Result<ParsedHelperOutput, String> {
    let events = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let event = serde_json::from_str::<Value>(line)
                .map_err(|error| format!("helper_event_parse_failed:{error}"))
                .and_then(|event| relativize_helper_paths(event, library_root));
            event
        })
        .collect::<Result<Vec<_>, _>>()?;
    let completed_result = events
        .iter()
        .find(|event| event.get("event").and_then(Value::as_str) == Some("job_completed"))
        .and_then(|event| event.get("result"))
        .cloned();
    let failed_message = events
        .iter()
        .rev()
        .find(|event| event.get("event").and_then(Value::as_str) == Some("job_failed"))
        .and_then(|event| event.get("error"))
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string);

    Ok(ParsedHelperOutput {
        events,
        completed_result,
        failed_message,
    })
}

pub(crate) fn relativize_helper_paths(
    mut value: Value,
    library_root: &Path,
) -> Result<Value, String> {
    match &mut value {
        Value::Object(object) => {
            for key in [
                "inputPath",
                "videoPath",
                "audioPath",
                "outputPath",
                "outputDir",
                "tempDir",
                "thumbnailPath",
                "captionsPath",
                "transcriptPath",
            ] {
                if let Some(path) = object.get(key).and_then(Value::as_str) {
                    object.insert(
                        key.to_string(),
                        Value::String(library_relative_path(library_root, path)?),
                    );
                }
            }

            for nested in object.values_mut() {
                *nested = relativize_helper_paths(nested.take(), library_root)?;
            }
        }
        Value::Array(items) => {
            for item in items {
                *item = relativize_helper_paths(item.take(), library_root)?;
            }
        }
        _ => {}
    }

    Ok(value)
}

fn library_relative_path(library_root: &Path, path: &str) -> Result<String, String> {
    let path = PathBuf::from(path);

    if !path.is_absolute() {
        return Ok(path_to_string(path));
    }

    path.strip_prefix(library_root)
        .map(path_to_string_ref)
        .map_err(|_| "helper_result_path_escaped_library".to_string())
}

fn path_key_is_output(key: &str) -> bool {
    matches!(key, "outputPath" | "outputDir" | "tempDir")
}

fn has_forbidden_component(path: &Path) -> bool {
    path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::Prefix(_) | Component::RootDir
        )
    })
}

pub(crate) fn path_to_string(path: PathBuf) -> String {
    normalize_path_string(path.to_string_lossy().into_owned())
}

pub(crate) fn path_to_string_ref(path: &Path) -> String {
    normalize_path_string(path.to_string_lossy().into_owned())
}

fn normalize_path_string(path: String) -> String {
    if cfg!(windows) {
        path.replace('\\', "/")
    } else {
        path
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_phase_two_helper_commands() {
        let contract = helper_protocol_contract();

        assert_eq!(contract.protocol_version, 1);
        assert_eq!(contract.sidecar_base_name, "openbrief-helper");
        assert_eq!(contract.sidecar_external_bin, "openbrief-helper");
        assert_eq!(contract.commands.len(), 11);
        assert!(contract.commands.contains(&HelperCommandName::ProbeMedia));
        assert!(contract
            .commands
            .contains(&HelperCommandName::DownloadYoutube));
        assert!(contract
            .commands
            .contains(&HelperCommandName::ExtractThumbnail));
        assert!(contract.commands.contains(&HelperCommandName::ListCaptions));
        assert!(contract
            .commands
            .contains(&HelperCommandName::ExtractCaptions));
        assert!(contract.commands.contains(&HelperCommandName::ExtractAudio));
        assert!(contract
            .commands
            .contains(&HelperCommandName::TranscodeVideo));
        assert!(contract
            .commands
            .contains(&HelperCommandName::InspectVideoGenerationRuntime));
        assert!(contract
            .commands
            .contains(&HelperCommandName::RenderHtmlComposition));
        assert!(contract
            .commands
            .contains(&HelperCommandName::TranscribeAudio));
        assert!(contract.commands.contains(&HelperCommandName::CancelJob));
    }

    #[test]
    fn keeps_media_tool_contracts_as_argument_arrays_without_credentials() {
        let contract = helper_protocol_contract();

        assert_eq!(contract.media_tools.len(), 4);
        for tool in contract.media_tools {
            assert!(!tool.version_args.is_empty());
            assert!(!tool.receives_provider_credentials);
            assert_eq!(tool.execution_contract, "subprocess-argv-array-only");
        }
    }

    #[test]
    fn runtime_target_triple_is_available_for_media_tool_resources() {
        let target_triple = runtime_target_triple();

        assert!(!target_triple.is_empty());
        assert!(target_triple.contains('-'));
    }

    #[test]
    fn serialized_contract_does_not_expose_provider_secret_fields() {
        let serialized = serde_json::to_string(&helper_protocol_contract()).unwrap();
        let lower = serialized.to_lowercase();

        for forbidden in [
            "api_key",
            "apikey",
            "authorization",
            "oauth",
            "secret",
            "token",
        ] {
            assert!(
                !lower.contains(forbidden),
                "helper contract leaked forbidden field: {forbidden}"
            );
        }
    }

    #[test]
    fn parses_helper_json_lines_into_result_and_events() {
        let parsed = parse_helper_output(
            r#"{"protocolVersion":1,"event":"job_started","jobId":"job-1","command":"probe_media"}"#
                .to_string()
                .as_str(),
            Path::new("/tmp/openbrief-library"),
        )
        .unwrap();

        assert!(parsed.completed_result.is_none());
        assert!(parsed.failed_message.is_none());

        let library_root = test_absolute_path("openbrief-library");
        let video_path = path_to_string(library_root.join("videos/video-1/source.mp4"));
        let output = format!(
            r#"{{"protocolVersion":1,"event":"job_started","jobId":"job-1","command":"probe_media"}}
{{"protocolVersion":1,"event":"job_completed","jobId":"job-1","command":"probe_media","result":{{"command":"probe_media","durationSeconds":12,"fileSizeBytes":34,"container":"mp4","videoPath":"{video_path}"}}}}"#
        );
        let parsed = parse_helper_output(&output, &library_root).unwrap();

        assert_eq!(parsed.events.len(), 2);
        let result = parsed.completed_result.unwrap();
        assert_eq!(result["command"], "probe_media");
        assert_eq!(result["fileSizeBytes"], serde_json::json!(34));
        assert_eq!(result["videoPath"], "videos/video-1/source.mp4");
    }

    #[test]
    fn preserves_failed_helper_event_message_without_completed_result() {
        let parsed = parse_helper_output(
            r#"{"protocolVersion":1,"event":"job_started","jobId":"job-1","command":"download_youtube"}
{"protocolVersion":1,"event":"job_failed","jobId":"job-1","command":"download_youtube","error":{"message":"yt-dlp exited with status 1: HTTP Error 403"}}"#,
            Path::new("/tmp/openbrief-library"),
        )
        .unwrap();

        assert!(parsed.completed_result.is_none());
        assert_eq!(
            parsed.failed_message.as_deref(),
            Some("yt-dlp exited with status 1: HTTP Error 403")
        );
    }

    #[test]
    fn enriches_stale_extract_captions_sidecar_result_with_segments() {
        let test_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("openbrief-captions-enrich-{test_id}"));
        let transcript_dir = root.join("videos/video-1/transcript");
        fs::create_dir_all(&transcript_dir).unwrap();
        fs::write(
            transcript_dir.join("captions.vtt"),
            r#"WEBVTT

00:00:00.000 --> 00:00:01.500
Provider captions text
"#,
        )
        .unwrap();

        let result = enrich_helper_result_from_trusted_context(
            helper_sidecar::HelperCommandName::ExtractCaptions,
            &json!({ "outputDir": path_to_string(transcript_dir) }),
            json!({
                "command": "extract_captions",
                "captionsAvailable": true,
                "captionsPath": "videos/video-1/transcript/captions.vtt"
            }),
        )
        .unwrap();

        assert_eq!(result["segments"][0]["text"], "Provider captions text");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn streaming_download_prefers_bundled_or_updated_yt_dlp_over_path_lookup() {
        let test_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("openbrief-helper-test-{test_id}"));
        let media_tools_dir = root.join("media-tools");
        fs::create_dir_all(&media_tools_dir).unwrap();
        let bundled_ytdlp = media_tools_dir.join(media_tool_executable_name("yt-dlp"));
        fs::write(&bundled_ytdlp, "fake yt-dlp").unwrap();

        assert_eq!(
            resolve_streaming_plan_program_from_paths(
                "yt-dlp",
                PathBuf::from("yt-dlp"),
                None,
                Some(media_tools_dir.clone()),
            ),
            bundled_ytdlp
        );

        let updated_ytdlp = root.join("updated-yt-dlp");
        assert_eq!(
            resolve_streaming_plan_program_from_paths(
                "yt-dlp",
                PathBuf::from("yt-dlp"),
                Some(updated_ytdlp.clone()),
                Some(media_tools_dir),
            ),
            updated_ytdlp
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn streaming_download_passes_bundled_ffmpeg_location() {
        let mut plan = helper_sidecar::CommandPlan {
            tool: "yt-dlp",
            program: PathBuf::from("yt-dlp"),
            args: vec![
                "--newline".to_string(),
                "-o".to_string(),
                "%(title)s.%(ext)s".to_string(),
                "https://www.youtube.com/watch?v=abc".to_string(),
            ],
        };

        attach_ffmpeg_location_to_download_plan(
            &mut plan,
            Some(PathBuf::from("/tmp/openbrief-media-tools")),
        );

        assert!(plan
            .args
            .windows(2)
            .any(|pair| pair == ["--ffmpeg-location", "/tmp/openbrief-media-tools"]));
        assert_eq!(
            plan.args.last().map(String::as_str),
            Some("https://www.youtube.com/watch?v=abc")
        );
    }

    #[test]
    fn parses_yt_dlp_newline_progress_percentages() {
        let progress =
            parse_yt_dlp_progress("[download]  42.7% of 10.00MiB at 1.00MiB/s ETA 00:05").unwrap();

        assert!((progress - 0.427).abs() < f32::EPSILON);
        assert_eq!(
            parse_yt_dlp_progress("[download] 100% of 10.00MiB in 00:10"),
            Some(1.0)
        );
        assert_eq!(parse_yt_dlp_progress("[Merger] Merging formats"), None);
    }

    #[test]
    fn prepares_helper_paths_inside_library_root() {
        let library_root = test_absolute_path("openbrief-library");
        let models_root = test_absolute_path("openbrief-models");
        let prepared = prepare_helper_command_for_sidecar(
            serde_json::json!({
                "protocolVersion": 1,
                "command": "probe_media",
                "jobId": "job-1",
                "inputPath": "videos/video-1/source.mp4"
            }),
            &library_root,
            &models_root,
        )
        .unwrap();

        assert_eq!(
            prepared["inputPath"],
            path_to_string(library_root.join("videos/video-1/source.mp4"))
        );
        assert!(prepare_helper_command_for_sidecar(
            serde_json::json!({
                "protocolVersion": 1,
                "command": "probe_media",
                "jobId": "job-1",
                "inputPath": "../escape.mp4"
            }),
            &library_root,
            &models_root,
        )
        .is_err());
    }

    #[test]
    fn prepares_stt_model_paths_inside_models_root() {
        let library_root = test_absolute_path("openbrief-library");
        let models_root = test_absolute_path("openbrief-models");
        let prepared = prepare_helper_command_for_sidecar(
            serde_json::json!({
                "protocolVersion": 1,
                "command": "transcribe_audio",
                "jobId": "job-1",
                "audioPath": "videos/video-1/audio/audio.wav",
                "modelPath": "models/ggml-small.bin",
                "outputPath": "videos/video-1/transcript/transcript.json"
            }),
            &library_root,
            &models_root,
        )
        .unwrap();

        assert_eq!(
            prepared["audioPath"],
            path_to_string(library_root.join("videos/video-1/audio/audio.wav"))
        );
        assert_eq!(
            prepared["modelPath"],
            path_to_string(models_root.join("ggml-small.bin"))
        );
        assert!(prepare_helper_command_for_sidecar(
            serde_json::json!({
                "protocolVersion": 1,
                "command": "transcribe_audio",
                "jobId": "job-1",
                "audioPath": "videos/video-1/audio/audio.wav",
                "modelPath": "../ggml-small.bin",
                "outputPath": "videos/video-1/transcript/transcript.json"
            }),
            &library_root,
            &models_root,
        )
        .is_err());
    }

    fn test_absolute_path(name: &str) -> PathBuf {
        if cfg!(windows) {
            PathBuf::from(format!("C:/tmp/{name}"))
        } else {
            PathBuf::from(format!("/tmp/{name}"))
        }
    }
}
