use crate::helper_sidecar::{
    HelperCommandName, HelperRequest, HELPER_PROTOCOL_VERSION, MEDIA_TOOLS_DIR_ENV,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    env, fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

#[derive(Debug, PartialEq, Eq)]
pub enum HeadlessAction {
    NotRequested,
    Help,
    Download { url: String, output_dir: PathBuf },
    YtDlp { args: Vec<String> },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HeadlessDownloadOutput {
    command: &'static str,
    video_url: String,
    output_directory: String,
    video_path: String,
    thumbnail_path: Option<String>,
    title: String,
    resolution: Option<String>,
    width: Option<u64>,
    height: Option<u64>,
    file_size_bytes: u64,
    length_seconds: f64,
    duration_seconds: f64,
    container: String,
}

#[derive(Debug)]
struct ParsedHelperOutput {
    completed_result: Option<Value>,
    failed_message: Option<String>,
}

pub fn run_from_env() -> Option<i32> {
    let action = match parse_headless_args(env::args().skip(1)) {
        Ok(action) => action,
        Err(message) => {
            eprintln!("openbrief: {message}");
            eprintln!("{}", usage());
            return Some(2);
        }
    };

    match action {
        HeadlessAction::NotRequested => None,
        HeadlessAction::Help => {
            println!("{}", usage());
            Some(0)
        }
        HeadlessAction::Download { url, output_dir } => {
            match download_and_print_metadata(&url, &output_dir, &mut io::stdout()) {
                Ok(()) => Some(0),
                Err(message) => {
                    eprintln!("openbrief: {message}");
                    Some(1)
                }
            }
        }
        HeadlessAction::YtDlp { args } => match run_yt_dlp(&args) {
            Ok(exit_code) => Some(exit_code),
            Err(message) => {
                eprintln!("openbrief: {message}");
                Some(1)
            }
        },
    }
}

pub fn parse_headless_args<I, S>(args: I) -> Result<HeadlessAction, String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let args = args.into_iter().map(Into::into).collect::<Vec<_>>();
    if args.is_empty() {
        return Ok(HeadlessAction::NotRequested);
    }

    match args[0].as_str() {
        "-h" | "--help" => return Ok(HeadlessAction::Help),
        "download" => return parse_download_args(&args[1..]),
        "yt-dlp" => {
            return Ok(HeadlessAction::YtDlp {
                args: normalize_yt_dlp_args(&args[1..])?,
            });
        }
        command if command.starts_with('-') => {
            return Err(format!("unknown option: {command}"));
        }
        command => {
            return Err(format!(
                "unknown command: {command}. Use `openbrief download` or `openbrief yt-dlp`."
            ));
        }
    }
}

fn parse_download_args(args: &[String]) -> Result<HeadlessAction, String> {
    let mut url: Option<String> = None;
    let mut output_dir: Option<PathBuf> = None;
    let mut index = 0;

    while index < args.len() {
        let arg = &args[index];
        match arg.as_str() {
            "-h" | "--help" => return Ok(HeadlessAction::Help),
            "-o" | "--output" => {
                index += 1;
                let Some(value) = args.get(index) else {
                    return Err("missing value for --output".to_string());
                };
                output_dir = Some(output_dir_from_value(value)?);
            }
            value if value.starts_with("--output=") => {
                output_dir = Some(output_dir_from_value(&value["--output=".len()..])?);
            }
            value if value.starts_with("-o") && value.len() > 2 => {
                output_dir = Some(output_dir_from_value(&value[2..])?);
            }
            value if value.starts_with('-') => {
                return Err(format!("unknown option: {value}"));
            }
            value => {
                if url.is_some() {
                    return Err(format!("unexpected argument: {value}"));
                }
                url = Some(value.to_string());
            }
        }

        index += 1;
    }

    let Some(url) = url else {
        return Err("missing video url".to_string());
    };

    Ok(HeadlessAction::Download {
        url,
        output_dir: output_dir.unwrap_or_else(|| PathBuf::from(".")),
    })
}

fn normalize_yt_dlp_args(args: &[String]) -> Result<Vec<String>, String> {
    if args.len() == 1
        && args[0]
            .chars()
            .any(|character| character.is_whitespace() || character == '\'' || character == '"')
    {
        return split_quoted_args(&args[0]);
    }

    Ok(args.to_vec())
}

fn split_quoted_args(value: &str) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut token_started = false;
    let mut escape_next = false;

    for character in value.chars() {
        if escape_next {
            current.push(character);
            token_started = true;
            escape_next = false;
            continue;
        }

        if character == '\\' {
            escape_next = true;
            token_started = true;
            continue;
        }

        if let Some(quote_character) = quote {
            if character == quote_character {
                quote = None;
            } else {
                current.push(character);
            }
            token_started = true;
            continue;
        }

        if character == '\'' || character == '"' {
            quote = Some(character);
            token_started = true;
            continue;
        }

        if character.is_whitespace() {
            if token_started {
                args.push(std::mem::take(&mut current));
                token_started = false;
            }
            continue;
        }

        current.push(character);
        token_started = true;
    }

    if escape_next {
        current.push('\\');
    }

    if quote.is_some() {
        return Err("unterminated quote in yt-dlp arguments".to_string());
    }

    if token_started {
        args.push(current);
    }

    Ok(args)
}

fn output_dir_from_value(value: &str) -> Result<PathBuf, String> {
    if value.trim().is_empty() {
        Ok(PathBuf::from("."))
    } else {
        Ok(PathBuf::from(value))
    }
}

fn download_and_print_metadata<W: Write>(
    url: &str,
    output_dir: &Path,
    writer: &mut W,
) -> Result<(), String> {
    configure_bundled_media_tools_env();
    let output_dir = prepare_output_dir(output_dir)?;
    let output_dir_string = path_to_string(&output_dir);

    let download_result = run_helper_request(HelperRequest {
        protocol_version: HELPER_PROTOCOL_VERSION,
        command: HelperCommandName::DownloadYoutube,
        job_id: Some("headless-download".to_string()),
        payload: json!({
            "url": url,
            "outputDir": output_dir_string,
        }),
    })?;

    let video_path = required_result_string(&download_result, "videoPath")?;
    let probe_result = run_helper_request(HelperRequest {
        protocol_version: HELPER_PROTOCOL_VERSION,
        command: HelperCommandName::ProbeMedia,
        job_id: Some("headless-probe".to_string()),
        payload: json!({ "inputPath": video_path }),
    })?;

    let width = probe_result.get("width").and_then(Value::as_u64);
    let height = probe_result.get("height").and_then(Value::as_u64);
    let duration_seconds = probe_result
        .get("durationSeconds")
        .and_then(Value::as_f64)
        .unwrap_or_default();
    let file_size_bytes = probe_result
        .get("fileSizeBytes")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let output = HeadlessDownloadOutput {
        command: "download_youtube",
        video_url: url.to_string(),
        output_directory: output_dir_string,
        video_path: required_result_string(&download_result, "videoPath")?,
        thumbnail_path: download_result
            .get("thumbnailPath")
            .and_then(Value::as_str)
            .map(str::to_string),
        title: download_result
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Downloaded video")
            .to_string(),
        resolution: resolution_label(width, height),
        width,
        height,
        file_size_bytes,
        length_seconds: duration_seconds,
        duration_seconds,
        container: probe_result
            .get("container")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
    };

    serde_json::to_writer_pretty(&mut *writer, &output)
        .map_err(|error| format!("metadata_json_write_failed:{error}"))?;
    writer
        .write_all(b"\n")
        .map_err(|error| format!("metadata_stdout_write_failed:{error}"))
}

fn run_yt_dlp(args: &[String]) -> Result<i32, String> {
    configure_bundled_media_tools_env();
    let program = media_tool_program("yt-dlp");
    let status = Command::new(&program)
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|error| format!("yt-dlp_failed_to_start:{error}"))?;

    Ok(status
        .code()
        .unwrap_or(if status.success() { 0 } else { 1 }))
}

fn prepare_output_dir(output_dir: &Path) -> Result<PathBuf, String> {
    let path = if output_dir.as_os_str().is_empty() {
        PathBuf::from(".")
    } else {
        output_dir.to_path_buf()
    };
    let absolute = if path.is_absolute() {
        path
    } else {
        env::current_dir()
            .map_err(|error| format!("current_dir_unavailable:{error}"))?
            .join(path)
    };

    fs::create_dir_all(&absolute).map_err(|error| format!("output_dir_create_failed:{error}"))?;
    absolute
        .canonicalize()
        .map_err(|error| format!("output_dir_invalid:{error}"))
}

fn run_helper_request(request: HelperRequest) -> Result<Value, String> {
    let mut output = Vec::new();
    let request_result = crate::helper_sidecar::run_request(&request, &mut output);
    let stdout =
        String::from_utf8(output).map_err(|error| format!("helper_output_utf8_failed:{error}"))?;
    let parsed = parse_helper_output(&stdout)?;

    match request_result {
        Ok(()) => parsed
            .completed_result
            .ok_or_else(|| "helper_result_missing".to_string()),
        Err(error) => Err(parsed.failed_message.unwrap_or_else(|| error.to_string())),
    }
}

fn parse_helper_output(stdout: &str) -> Result<ParsedHelperOutput, String> {
    let mut completed_result = None;
    let mut failed_message = None;

    for line in stdout.lines().filter(|line| !line.trim().is_empty()) {
        let event = serde_json::from_str::<Value>(line)
            .map_err(|error| format!("helper_event_parse_failed:{error}"))?;
        if event.get("event").and_then(Value::as_str) == Some("job_completed") {
            completed_result = event.get("result").cloned();
        }
        if event.get("event").and_then(Value::as_str) == Some("job_failed") {
            failed_message = event
                .get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
                .map(str::to_string);
        }
    }

    Ok(ParsedHelperOutput {
        completed_result,
        failed_message,
    })
}

fn required_result_string(value: &Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("helper_result_missing_field:{key}"))
}

fn configure_bundled_media_tools_env() {
    if env::var_os(MEDIA_TOOLS_DIR_ENV).is_some() {
        return;
    }

    if let Some(path) = discover_bundled_media_tools_dir() {
        env::set_var(MEDIA_TOOLS_DIR_ENV, path);
    }
}

fn discover_bundled_media_tools_dir() -> Option<PathBuf> {
    media_tool_dir_candidates()
        .into_iter()
        .find(|candidate| media_tools_dir_is_usable(candidate))
}

fn media_tool_dir_candidates() -> Vec<PathBuf> {
    let triple = runtime_target_triple();
    let mut candidates = Vec::new();

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(
            current_dir
                .join("resources")
                .join("media-tools")
                .join(triple),
        );
        candidates.push(
            current_dir
                .join("src-tauri")
                .join("resources")
                .join("media-tools")
                .join(triple),
        );
    }

    if let Ok(exe) = env::current_exe() {
        for ancestor in exe.ancestors() {
            candidates.push(ancestor.join("resources").join("media-tools").join(triple));
            candidates.push(
                ancestor
                    .join("src-tauri")
                    .join("resources")
                    .join("media-tools")
                    .join(triple),
            );

            if ancestor.file_name().and_then(|name| name.to_str()) == Some("MacOS") {
                if let Some(contents_dir) = ancestor.parent() {
                    candidates.push(
                        contents_dir
                            .join("Resources")
                            .join("media-tools")
                            .join(triple),
                    );
                }
            }
        }
    }

    candidates
}

fn media_tools_dir_is_usable(path: &Path) -> bool {
    path.join(executable_name("yt-dlp")).is_file()
        && path.join(executable_name("ffprobe")).is_file()
}

fn media_tool_program(tool_name: &str) -> PathBuf {
    if let Some(path) = env::var_os(MEDIA_TOOLS_DIR_ENV).map(PathBuf::from) {
        return path.join(executable_name(tool_name));
    }

    discover_bundled_media_tools_dir()
        .map(|path| path.join(executable_name(tool_name)))
        .unwrap_or_else(|| PathBuf::from(executable_name(tool_name)))
}

fn executable_name(tool_name: &str) -> String {
    if cfg!(windows) {
        format!("{tool_name}.exe")
    } else {
        tool_name.to_string()
    }
}

fn runtime_target_triple() -> &'static str {
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

fn resolution_label(width: Option<u64>, height: Option<u64>) -> Option<String> {
    match (width, height) {
        (Some(width), Some(height)) if width > 0 && height > 0 => Some(format!("{width}x{height}")),
        _ => None,
    }
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn usage() -> &'static str {
    "Usage:\n  openbrief download <video-url> [--output OUTPUT_DIR]\n  openbrief yt-dlp [YT_DLP_ARGS...]\n\n`download` saves one video with bundled media tools and prints JSON metadata.\n`yt-dlp` runs the bundled yt-dlp directly. If YT_DLP_ARGS is one quoted string, OpenBrief splits it into arguments.\nIf OUTPUT_DIR is empty or omitted, the current directory is used."
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_args_leave_gui_startup_unhandled() {
        assert_eq!(
            parse_headless_args(Vec::<String>::new()).unwrap(),
            HeadlessAction::NotRequested
        );
    }

    #[test]
    fn parses_download_with_default_output_directory() {
        assert_eq!(
            parse_headless_args([
                "download",
                "https://www.youtube.com/watch?v=openclip-test-id"
            ])
            .unwrap(),
            HeadlessAction::Download {
                url: "https://www.youtube.com/watch?v=openclip-test-id".to_string(),
                output_dir: PathBuf::from("."),
            }
        );
    }

    #[test]
    fn parses_output_directory_forms() {
        assert_eq!(
            parse_headless_args(["download", "https://youtu.be/example", "-o", "downloads"])
                .unwrap(),
            HeadlessAction::Download {
                url: "https://youtu.be/example".to_string(),
                output_dir: PathBuf::from("downloads"),
            }
        );
        assert_eq!(
            parse_headless_args(["download", "--output=clips", "https://youtu.be/example"])
                .unwrap(),
            HeadlessAction::Download {
                url: "https://youtu.be/example".to_string(),
                output_dir: PathBuf::from("clips"),
            }
        );
    }

    #[test]
    fn treats_empty_output_directory_as_current_directory() {
        assert_eq!(
            parse_headless_args(["download", "https://youtu.be/example", "--output", ""]).unwrap(),
            HeadlessAction::Download {
                url: "https://youtu.be/example".to_string(),
                output_dir: PathBuf::from("."),
            }
        );
    }

    #[test]
    fn parses_help_without_starting_gui() {
        assert_eq!(
            parse_headless_args(["--help"]).unwrap(),
            HeadlessAction::Help
        );
    }

    #[test]
    fn rejects_unknown_or_incomplete_options() {
        assert_eq!(
            parse_headless_args(["--bad"]).unwrap_err(),
            "unknown option: --bad"
        );
        assert_eq!(
            parse_headless_args(["download", "https://youtu.be/example", "-o"]).unwrap_err(),
            "missing value for --output"
        );
        assert_eq!(
            parse_headless_args(["https://youtu.be/example"]).unwrap_err(),
            "unknown command: https://youtu.be/example. Use `openbrief download` or `openbrief yt-dlp`."
        );
    }

    #[test]
    fn parses_yt_dlp_passthrough_arguments() {
        assert_eq!(
            parse_headless_args(["yt-dlp", "--version"]).unwrap(),
            HeadlessAction::YtDlp {
                args: vec!["--version".to_string()],
            }
        );
        assert_eq!(
            parse_headless_args([
                "yt-dlp",
                "-f",
                "best",
                "https://www.youtube.com/watch?v=openclip-test-id",
            ])
            .unwrap(),
            HeadlessAction::YtDlp {
                args: vec![
                    "-f".to_string(),
                    "best".to_string(),
                    "https://www.youtube.com/watch?v=openclip-test-id".to_string(),
                ],
            }
        );
    }

    #[test]
    fn splits_single_quoted_yt_dlp_argument_string() {
        assert_eq!(
            parse_headless_args([
                "yt-dlp",
                "--format \"best video\" 'https://youtu.be/example id'",
            ])
            .unwrap(),
            HeadlessAction::YtDlp {
                args: vec![
                    "--format".to_string(),
                    "best video".to_string(),
                    "https://youtu.be/example id".to_string(),
                ],
            }
        );
        assert_eq!(
            parse_headless_args(["yt-dlp", "\"unterminated"]).unwrap_err(),
            "unterminated quote in yt-dlp arguments",
        );
    }

    #[test]
    fn parses_helper_completion_and_failure_events() {
        let parsed = parse_helper_output(
            r#"{"event":"job_started"}
{"event":"job_completed","result":{"videoPath":"/tmp/video.mp4"}}"#,
        )
        .unwrap();
        assert_eq!(
            parsed.completed_result.unwrap()["videoPath"],
            "/tmp/video.mp4"
        );

        let parsed = parse_helper_output(
            r#"{"event":"job_failed","error":{"message":"yt-dlp exited with status 1"}}"#,
        )
        .unwrap();
        assert_eq!(
            parsed.failed_message.as_deref(),
            Some("yt-dlp exited with status 1")
        );
    }
}
