use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env,
    ffi::OsStr,
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Output},
    time::Duration,
};

pub const HELPER_PROTOCOL_VERSION: u16 = 1;
pub const MEDIA_TOOLS_DIR_ENV: &str = "OPENBRIEF_MEDIA_TOOLS_DIR";
pub const YTDLP_PATH_ENV: &str = "OPENBRIEF_YTDLP_PATH";

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HelperCommandName {
    ProbeMedia,
    DownloadYoutube,
    ExtractThumbnail,
    ListCaptions,
    ExtractCaptions,
    ExtractAudio,
    TranscodeVideo,
    TranscribeAudio,
    CancelJob,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelperRequest {
    pub protocol_version: u16,
    pub command: HelperCommandName,
    #[serde(default)]
    pub job_id: Option<String>,
    #[serde(flatten)]
    pub payload: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandPlan {
    pub tool: &'static str,
    pub program: PathBuf,
    pub args: Vec<String>,
}

impl CommandPlan {
    fn to_command(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.args);
        command
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelperEvent<'a> {
    pub protocol_version: u16,
    pub event: &'a str,
    pub job_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<HelperCommandName>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
}

#[derive(Debug)]
pub struct HelperError {
    message: String,
}

impl HelperError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for HelperError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for HelperError {}

pub type HelperResult<T> = Result<T, HelperError>;

pub fn run_cli<I, S>(args: I) -> i32
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    match read_request_json(args).and_then(|request_json| {
        let request: HelperRequest = serde_json::from_str(&request_json)
            .map_err(|error| HelperError::new(error.to_string()))?;
        run_request(&request, &mut io::stdout())
    }) {
        Ok(()) => 0,
        Err(error) => {
            let fallback_job_id = "unknown";
            let _ = write_event(
                &mut io::stdout(),
                &HelperEvent {
                    protocol_version: HELPER_PROTOCOL_VERSION,
                    event: "job_failed",
                    job_id: fallback_job_id,
                    command: None,
                    progress: None,
                    message: None,
                    result: None,
                    error: Some(json!({ "message": error.to_string() })),
                },
            );
            1
        }
    }
}

fn read_request_json<I, S>(args: I) -> HelperResult<String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let args = args.into_iter().map(Into::into).collect::<Vec<_>>();

    match args.as_slice() {
        [] => {
            let mut input = String::new();
            io::stdin()
                .read_to_string(&mut input)
                .map_err(|error| HelperError::new(error.to_string()))?;
            Ok(input)
        }
        [flag, value] if flag == "--json" => Ok(value.clone()),
        _ => Err(HelperError::new(
            "expected a single JSON command via --json <json> or stdin",
        )),
    }
}

pub fn run_request<W: Write>(request: &HelperRequest, writer: &mut W) -> HelperResult<()> {
    if request.protocol_version != HELPER_PROTOCOL_VERSION {
        return Err(HelperError::new(format!(
            "unsupported protocolVersion {}; expected {}",
            request.protocol_version, HELPER_PROTOCOL_VERSION
        )));
    }

    let job_id = request.job_id.as_deref().unwrap_or("unknown");
    write_event(writer, &event("job_started", job_id, request.command))?;

    let result = dispatch_request(request, writer, job_id);
    match result {
        Ok(result) => write_event(
            writer,
            &HelperEvent {
                protocol_version: HELPER_PROTOCOL_VERSION,
                event: "job_completed",
                job_id,
                command: Some(request.command),
                progress: Some(1.0),
                message: None,
                result: Some(result),
                error: None,
            },
        ),
        Err(error) => write_event(
            writer,
            &HelperEvent {
                protocol_version: HELPER_PROTOCOL_VERSION,
                event: "job_failed",
                job_id,
                command: Some(request.command),
                progress: None,
                message: None,
                result: None,
                error: Some(json!({ "message": error.to_string() })),
            },
        )
        .and(Err(error)),
    }
}

fn dispatch_request<W: Write>(
    request: &HelperRequest,
    writer: &mut W,
    job_id: &str,
) -> HelperResult<Value> {
    match request.command {
        HelperCommandName::CancelJob => Ok(json!({
            "cancelledJobId": string_field(&request.payload, "targetJobId")
                .or_else(|| string_field(&request.payload, "jobId"))
                .unwrap_or_else(|| job_id.to_string())
        })),
        HelperCommandName::TranscribeAudio => transcribe_audio(&request.payload, writer, job_id),
        _ => {
            let plan = command_plan_for_request(request)?;
            write_event(
                writer,
                &HelperEvent {
                    protocol_version: HELPER_PROTOCOL_VERSION,
                    event: "job_progress",
                    job_id,
                    command: Some(request.command),
                    progress: Some(0.1),
                    message: Some("starting media tool"),
                    result: Some(json!({ "tool": plan.tool, "argv": argv_for_event(&plan) })),
                    error: None,
                },
            )?;
            run_command_plan(&plan, request.command, &request.payload)
        }
    }
}

fn transcribe_audio<W: Write>(
    payload: &Value,
    writer: &mut W,
    job_id: &str,
) -> HelperResult<Value> {
    let audio_path = PathBuf::from(required_string(payload, &["audioPath"])?);
    let model_path = PathBuf::from(required_string(payload, &["modelPath"])?);
    let output_path = PathBuf::from(required_string(payload, &["outputPath"])?);
    let language = payload
        .get("language")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "auto")
        .map(ToString::to_string);

    if !audio_path.is_file() {
        return Err(HelperError::new("transcribe_audio_input_not_found"));
    }
    if !model_path.is_file() {
        return Err(HelperError::new(
            "transcribe_audio_model_not_found; download a Whisper model in Settings first",
        ));
    }

    write_progress(
        writer,
        job_id,
        HelperCommandName::TranscribeAudio,
        0.15,
        "loading transcription model",
    )?;
    let mut engine = transcribe_rs::whisper_cpp::WhisperEngine::load(&model_path)
        .map_err(|error| HelperError::new(format!("transcribe_audio_model_load_failed:{error}")))?;

    write_progress(
        writer,
        job_id,
        HelperCommandName::TranscribeAudio,
        0.35,
        "reading extracted audio",
    )?;
    let audio = read_wav_samples(&audio_path)?;

    write_progress(
        writer,
        job_id,
        HelperCommandName::TranscribeAudio,
        0.5,
        "transcribing extracted audio",
    )?;
    let result = engine
        .transcribe_with(
            &audio,
            &transcribe_rs::whisper_cpp::WhisperInferenceParams {
                language,
                ..transcribe_rs::whisper_cpp::WhisperInferenceParams::default()
            },
        )
        .map_err(|error| HelperError::new(format!("transcribe_audio_failed:{error}")))?;

    write_progress(
        writer,
        job_id,
        HelperCommandName::TranscribeAudio,
        0.95,
        "writing transcript",
    )?;
    let transcript = write_transcript_json(&output_path, &result.text, result.segments.as_deref())?;

    Ok(json!({
        "command": "transcribe_audio",
        "transcriptPath": path_to_string(output_path),
        "text": result.text,
        "segments": transcript["segments"].clone(),
    }))
}

fn write_progress<W: Write>(
    writer: &mut W,
    job_id: &str,
    command: HelperCommandName,
    progress: f32,
    message: &'static str,
) -> HelperResult<()> {
    write_event(
        writer,
        &HelperEvent {
            protocol_version: HELPER_PROTOCOL_VERSION,
            event: "job_progress",
            job_id,
            command: Some(command),
            progress: Some(progress),
            message: Some(message),
            result: None,
            error: None,
        },
    )
}

fn read_wav_samples(path: &Path) -> HelperResult<Vec<f32>> {
    let reader = hound::WavReader::open(path)
        .map_err(|error| HelperError::new(format!("transcribe_audio_wav_open_failed:{error}")))?;
    let spec = reader.spec();

    if spec.channels != 1 || spec.sample_rate != 16_000 {
        return Err(HelperError::new(
            "transcribe_audio_requires_extracted_16khz_mono_wav",
        ));
    }

    match (spec.sample_format, spec.bits_per_sample) {
        (hound::SampleFormat::Int, 16) => reader
            .into_samples::<i16>()
            .map(|sample| {
                sample
                    .map(|value| value as f32 / i16::MAX as f32)
                    .map_err(|error| {
                        HelperError::new(format!("transcribe_audio_wav_read_failed:{error}"))
                    })
            })
            .collect(),
        (hound::SampleFormat::Float, 32) => reader
            .into_samples::<f32>()
            .map(|sample| {
                sample.map_err(|error| {
                    HelperError::new(format!("transcribe_audio_wav_read_failed:{error}"))
                })
            })
            .collect(),
        _ => Err(HelperError::new(format!(
            "transcribe_audio_unsupported_wav_format:{}bit",
            spec.bits_per_sample
        ))),
    }
}

fn write_transcript_json(
    output_path: &Path,
    text: &str,
    segments: Option<&[transcribe_rs::TranscriptionSegment]>,
) -> HelperResult<Value> {
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            HelperError::new(format!("transcribe_audio_output_dir_failed:{error}"))
        })?;
    }

    let transcript = json!({
        "sourceKind": "local-stt",
        "text": text,
        "segments": transcript_segments_json(text, segments)
    });
    let bytes = serde_json::to_vec_pretty(&transcript)
        .map_err(|error| HelperError::new(format!("transcript_json_serialize_failed:{error}")))?;
    fs::write(output_path, bytes)
        .map_err(|error| HelperError::new(format!("transcript_json_write_failed:{error}")))?;
    Ok(transcript)
}

fn transcript_segments_json(
    text: &str,
    segments: Option<&[transcribe_rs::TranscriptionSegment]>,
) -> Vec<Value> {
    let timed_segments: Vec<Value> = segments
        .unwrap_or_default()
        .iter()
        .enumerate()
        .filter_map(|(index, segment)| {
            let segment_text = segment.text.trim();
            if segment_text.is_empty() {
                return None;
            }

            let start_seconds = sanitize_seconds(segment.start);
            let end_seconds = sanitize_seconds(segment.end).max(start_seconds);

            Some(json!({
                "id": format!("local-stt-{}", index + 1),
                "startSeconds": start_seconds,
                "endSeconds": end_seconds,
                "text": segment_text,
                "sourceKind": "local-stt",
                "words": evenly_distributed_words(segment_text, start_seconds, end_seconds),
            }))
        })
        .collect();

    if !timed_segments.is_empty() {
        return timed_segments;
    }

    let fallback_text = text.trim();
    if fallback_text.is_empty() {
        return vec![];
    }

    vec![json!({
        "id": "local-stt-1",
        "startSeconds": 0.0,
        "endSeconds": 0.0,
        "text": fallback_text,
        "sourceKind": "local-stt",
        "words": []
    })]
}

fn evenly_distributed_words(text: &str, start_seconds: f32, end_seconds: f32) -> Vec<Value> {
    let words: Vec<&str> = text
        .split_whitespace()
        .filter(|word| !word.is_empty())
        .collect();
    let duration = end_seconds - start_seconds;

    if words.is_empty() || duration <= 0.0 {
        return vec![];
    }

    let word_duration = duration / words.len() as f32;
    words
        .iter()
        .enumerate()
        .map(|(index, word)| {
            let word_start = start_seconds + index as f32 * word_duration;
            let word_end = if index + 1 == words.len() {
                end_seconds
            } else {
                start_seconds + (index + 1) as f32 * word_duration
            };

            json!({
                "text": word,
                "startSeconds": word_start,
                "endSeconds": word_end.max(word_start),
            })
        })
        .collect()
}

fn sanitize_seconds(seconds: f32) -> f32 {
    if seconds.is_finite() {
        seconds.max(0.0)
    } else {
        0.0
    }
}

fn run_command_plan(
    plan: &CommandPlan,
    command: HelperCommandName,
    payload: &Value,
) -> HelperResult<Value> {
    let output = plan
        .to_command()
        .output()
        .map_err(|error| HelperError::new(format!("failed to start {}: {error}", plan.tool)))?;

    if !output.status.success() {
        return Err(HelperError::new(format!(
            "{} exited with status {}: {}",
            plan.tool,
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    command_result(command, payload, &output)
}

pub fn command_plan_for_request(request: &HelperRequest) -> HelperResult<CommandPlan> {
    match request.command {
        HelperCommandName::ProbeMedia => probe_media_plan(&request.payload),
        HelperCommandName::DownloadYoutube => download_youtube_plan(&request.payload),
        HelperCommandName::ExtractThumbnail => extract_thumbnail_plan(&request.payload),
        HelperCommandName::ListCaptions => list_captions_plan(&request.payload),
        HelperCommandName::ExtractCaptions => extract_captions_plan(&request.payload),
        HelperCommandName::ExtractAudio => extract_audio_plan(&request.payload),
        HelperCommandName::TranscodeVideo => transcode_video_plan(&request.payload),
        HelperCommandName::TranscribeAudio => Err(HelperError::new(
            "transcribe_audio has no media-tool command plan",
        )),
        HelperCommandName::CancelJob => Err(HelperError::new(
            "cancel_job is handled in-process and has no command plan",
        )),
    }
}

pub fn probe_media_plan(payload: &Value) -> HelperResult<CommandPlan> {
    let input = required_string(payload, &["inputPath", "path", "url"])?;
    Ok(CommandPlan {
        tool: "ffprobe",
        program: discover_media_tool("ffprobe"),
        args: vec![
            "-v".into(),
            "error".into(),
            "-print_format".into(),
            "json".into(),
            "-show_format".into(),
            "-show_streams".into(),
            input,
        ],
    })
}

pub fn download_youtube_plan(payload: &Value) -> HelperResult<CommandPlan> {
    let url = required_string(payload, &["url"])?;
    let output_template = output_template(payload)?;
    let mut args = vec![
        "--newline".into(),
        "--no-playlist".into(),
        "--extractor-args".into(),
        "youtube:player_client=default,-web,-web_safari".into(),
        "--format".into(),
        "bestvideo[ext=mp4][vcodec^=avc1][height<=720][fps<=30]+bestaudio[ext=m4a][acodec^=mp4a]/best[ext=mp4][vcodec^=avc1][acodec^=mp4a][height<=720][fps<=30]/bestvideo[ext=mp4][height<=720][fps<=30]+bestaudio[ext=m4a]/best[ext=mp4][height<=720][fps<=30]/best[height<=720][fps<=30]/bestvideo[ext=mp4][vcodec^=avc1][height<=720]+bestaudio[ext=m4a][acodec^=mp4a]/best[ext=mp4][vcodec^=avc1][acodec^=mp4a][height<=720]/best[height<=720]/best".into(),
        "--merge-output-format".into(),
        "mp4".into(),
        "--write-thumbnail".into(),
        "--convert-thumbnails".into(),
        "jpg".into(),
        "--write-info-json".into(),
    ];

    if let Some(media_tools_dir) = media_tools_dir() {
        args.extend(["--ffmpeg-location".into(), path_to_string(media_tools_dir)]);
    }

    args.extend(["-o".into(), output_template, url]);

    Ok(CommandPlan {
        tool: "yt-dlp",
        program: discover_media_tool("yt-dlp"),
        args,
    })
}

pub fn extract_thumbnail_plan(payload: &Value) -> HelperResult<CommandPlan> {
    let input = required_string(payload, &["videoPath", "inputPath", "path"])?;
    let output = required_string(payload, &["outputPath"])?;
    let seek_timestamp = ffmpeg_seek_timestamp(payload)?;
    Ok(CommandPlan {
        tool: "ffmpeg",
        program: discover_media_tool("ffmpeg"),
        args: vec![
            "-hide_banner".into(),
            "-y".into(),
            "-ss".into(),
            seek_timestamp,
            "-i".into(),
            input,
            "-frames:v".into(),
            "1".into(),
            "-vf".into(),
            "scale=640:-2".into(),
            output,
        ],
    })
}

fn ffmpeg_seek_timestamp(payload: &Value) -> HelperResult<String> {
    let Some(value) = payload.get("timestampSeconds") else {
        return Ok("00:00:01".to_string());
    };
    let seconds = value
        .as_f64()
        .ok_or_else(|| HelperError::new("timestampSeconds must be numeric"))?;

    if !seconds.is_finite() || seconds < 0.0 {
        return Err(HelperError::new(
            "timestampSeconds must be a finite non-negative number",
        ));
    }

    let rounded = (seconds * 1000.0).round() / 1000.0;
    if rounded.fract() == 0.0 {
        return Ok((rounded as u64).to_string());
    }

    let formatted = format!("{rounded:.3}");
    Ok(formatted
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string())
}

pub fn list_captions_plan(payload: &Value) -> HelperResult<CommandPlan> {
    let url = required_string(payload, &["url", "sourceUrl", "originalUri"])?;
    Ok(CommandPlan {
        tool: "yt-dlp",
        program: discover_media_tool("yt-dlp"),
        args: vec![
            "--newline".into(),
            "--skip-download".into(),
            "--no-playlist".into(),
            "--list-subs".into(),
            url,
        ],
    })
}

pub fn extract_captions_plan(payload: &Value) -> HelperResult<CommandPlan> {
    let url = required_string(payload, &["url", "sourceUrl", "originalUri"])?;
    let output_template = output_template(payload)?;
    Ok(CommandPlan {
        tool: "yt-dlp",
        program: discover_media_tool("yt-dlp"),
        args: vec![
            "--newline".into(),
            "--skip-download".into(),
            "--write-subs".into(),
            "--write-auto-subs".into(),
            "--sub-format".into(),
            "vtt".into(),
            "--sub-langs".into(),
            language_list_field(payload, "languages").unwrap_or_else(|| "en".into()),
            "-o".into(),
            output_template,
            url,
        ],
    })
}

pub fn extract_audio_plan(payload: &Value) -> HelperResult<CommandPlan> {
    let input = required_string(payload, &["videoPath", "inputPath", "path"])?;
    let output = required_string(payload, &["outputPath"])?;
    Ok(CommandPlan {
        tool: "ffmpeg",
        program: discover_media_tool("ffmpeg"),
        args: vec![
            "-hide_banner".into(),
            "-y".into(),
            "-i".into(),
            input,
            "-vn".into(),
            "-acodec".into(),
            "pcm_s16le".into(),
            "-ar".into(),
            "16000".into(),
            "-ac".into(),
            "1".into(),
            output,
        ],
    })
}

pub fn transcode_video_plan(payload: &Value) -> HelperResult<CommandPlan> {
    let input = required_string(payload, &["videoPath", "inputPath", "path"])?;
    let output = required_string(payload, &["outputPath"])?;
    Ok(CommandPlan {
        tool: "ffmpeg",
        program: discover_media_tool("ffmpeg"),
        args: vec![
            "-hide_banner".into(),
            "-y".into(),
            "-i".into(),
            input,
            "-map".into(),
            "0:v:0".into(),
            "-map".into(),
            "0:a:0?".into(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "veryfast".into(),
            "-crf".into(),
            "23".into(),
            "-vf".into(),
            "fps=30".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            "128k".into(),
            "-movflags".into(),
            "+faststart".into(),
            output,
        ],
    })
}

pub fn discover_media_tool(tool_name: &'static str) -> PathBuf {
    if tool_name == "yt-dlp" {
        if let Ok(path) = env::var(YTDLP_PATH_ENV) {
            return PathBuf::from(path);
        }
    }

    if let Some(media_tools_dir) = media_tools_dir() {
        let mut path = media_tools_dir;
        path.push(executable_name(tool_name));
        path
    } else {
        PathBuf::from(executable_name(tool_name))
    }
}

fn media_tools_dir() -> Option<PathBuf> {
    env::var(MEDIA_TOOLS_DIR_ENV).ok().map(PathBuf::from)
}

fn executable_name(tool_name: &'static str) -> String {
    if cfg!(windows) {
        format!("{tool_name}.exe")
    } else {
        tool_name.to_string()
    }
}

fn output_template(payload: &Value) -> HelperResult<String> {
    if let Some(output_path) = string_field(payload, "outputPath") {
        return Ok(output_path);
    }

    let output_dir = required_string(payload, &["outputDir"])?;
    Ok(path_to_string(
        Path::new(&output_dir).join("%(title)s.%(ext)s"),
    ))
}

fn required_string(payload: &Value, names: &[&str]) -> HelperResult<String> {
    names
        .iter()
        .find_map(|name| string_field(payload, name))
        .ok_or_else(|| HelperError::new(format!("missing required field: {}", names.join(" or "))))
}

fn string_field(payload: &Value, name: &str) -> Option<String> {
    payload
        .get(name)
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub fn command_result(
    command: HelperCommandName,
    payload: &Value,
    output: &Output,
) -> HelperResult<Value> {
    match command {
        HelperCommandName::ProbeMedia => probe_media_result(output),
        HelperCommandName::DownloadYoutube => download_youtube_result(payload),
        HelperCommandName::ExtractThumbnail => Ok(json!({
            "command": "extract_thumbnail",
            "thumbnailPath": required_string(payload, &["outputPath"])?,
        })),
        HelperCommandName::ListCaptions => list_captions_result(output),
        HelperCommandName::ExtractCaptions => extract_captions_result(payload),
        HelperCommandName::ExtractAudio => Ok(json!({
            "command": "extract_audio",
            "audioPath": required_string(payload, &["outputPath"])?,
        })),
        HelperCommandName::TranscodeVideo => Ok(json!({
            "command": "transcode_video",
            "videoPath": required_string(payload, &["outputPath"])?,
        })),
        HelperCommandName::TranscribeAudio | HelperCommandName::CancelJob => Err(HelperError::new(
            "command does not produce a media-tool result",
        )),
    }
}

fn probe_media_result(output: &Output) -> HelperResult<Value> {
    let stdout = String::from_utf8_lossy(&output.stdout);
    probe_media_result_from_stdout(&stdout)
}

fn list_captions_result(output: &Output) -> HelperResult<Value> {
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(json!({
        "command": "list_captions",
        "languages": parse_caption_languages(&stdout),
    }))
}

fn parse_caption_languages(stdout: &str) -> Vec<Value> {
    let mut languages = Vec::new();
    let mut current_kind: Option<&str> = None;

    for raw_line in stdout.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        if line.contains("Available automatic captions") {
            current_kind = Some("automatic");
            continue;
        }

        if line.contains("Available subtitles") {
            current_kind = Some("manual");
            continue;
        }

        let Some(kind) = current_kind else {
            continue;
        };

        if line.starts_with("[info]") || line.starts_with("Language") {
            continue;
        }

        let mut columns = line.split_whitespace().collect::<Vec<_>>();
        if columns.len() < 2 {
            continue;
        }

        let code = columns[0];
        if !code
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        {
            continue;
        }

        while columns.len() > 2 && looks_like_subtitle_format(columns[columns.len() - 1]) {
            columns.pop();
        }

        let label = if columns.len() > 1 {
            columns[1..].join(" ")
        } else {
            code.to_string()
        };

        if languages.iter().any(|language: &Value| {
            language.get("code").and_then(Value::as_str) == Some(code)
                && language.get("kind").and_then(Value::as_str) == Some(kind)
        }) {
            continue;
        }

        languages.push(json!({
            "code": code,
            "label": if label.trim().is_empty() { code } else { label.trim() },
            "kind": kind,
        }));
    }

    languages
}

fn looks_like_subtitle_format(value: &str) -> bool {
    let normalized = value.trim_end_matches(',');
    matches!(
        normalized,
        "vtt" | "ttml" | "srv1" | "srv2" | "srv3" | "json3" | "srt" | "ass" | "ssa"
    )
}

fn probe_media_result_from_stdout(stdout: &str) -> HelperResult<Value> {
    let value: Value = serde_json::from_str(stdout)
        .map_err(|error| HelperError::new(format!("ffprobe_json_parse_failed:{error}")))?;
    let format = value
        .get("format")
        .and_then(Value::as_object)
        .ok_or_else(|| HelperError::new("ffprobe_output_missing_format"))?;
    let duration_seconds = format
        .get("duration")
        .and_then(Value::as_str)
        .and_then(|duration| duration.parse::<f64>().ok())
        .unwrap_or_default();
    let file_size_bytes = format
        .get("size")
        .and_then(Value::as_str)
        .and_then(|size| size.parse::<u64>().ok())
        .unwrap_or_default();
    let container = format
        .get("format_name")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let video_stream = value
        .get("streams")
        .and_then(Value::as_array)
        .and_then(|streams| {
            streams
                .iter()
                .find(|stream| stream.get("codec_type").and_then(Value::as_str) == Some("video"))
        });
    let audio_stream = value
        .get("streams")
        .and_then(Value::as_array)
        .and_then(|streams| {
            streams
                .iter()
                .find(|stream| stream.get("codec_type").and_then(Value::as_str) == Some("audio"))
        });
    let video_codec = video_stream
        .and_then(|stream| stream.get("codec_name"))
        .and_then(Value::as_str);
    let audio_codec = audio_stream
        .and_then(|stream| stream.get("codec_name"))
        .and_then(Value::as_str);
    let width = video_stream
        .and_then(|stream| stream.get("width"))
        .and_then(Value::as_u64);
    let height = video_stream
        .and_then(|stream| stream.get("height"))
        .and_then(Value::as_u64);
    let frame_rate = video_stream
        .and_then(|stream| {
            stream
                .get("avg_frame_rate")
                .or_else(|| stream.get("r_frame_rate"))
        })
        .and_then(Value::as_str)
        .and_then(parse_ffprobe_rate);
    let pixel_format = video_stream
        .and_then(|stream| stream.get("pix_fmt"))
        .and_then(Value::as_str);
    let video_profile = video_stream
        .and_then(|stream| stream.get("profile"))
        .and_then(Value::as_str);
    let video_level = video_stream
        .and_then(|stream| stream.get("level"))
        .and_then(Value::as_u64);
    let resolution = match (width, height) {
        (Some(width), Some(height)) if width > 0 && height > 0 => Some(format!("{width}x{height}")),
        _ => None,
    };

    Ok(json!({
        "command": "probe_media",
        "durationSeconds": duration_seconds,
        "fileSizeBytes": file_size_bytes,
        "container": container,
        "videoCodec": video_codec,
        "audioCodec": audio_codec,
        "width": width,
        "height": height,
        "frameRate": frame_rate,
        "pixelFormat": pixel_format,
        "videoProfile": video_profile,
        "videoLevel": video_level,
        "resolution": resolution,
    }))
}

fn parse_ffprobe_rate(value: &str) -> Option<f64> {
    if let Some((numerator, denominator)) = value.split_once('/') {
        let numerator = numerator.parse::<f64>().ok()?;
        let denominator = denominator.parse::<f64>().ok()?;
        if denominator == 0.0 {
            return None;
        }
        let rate = numerator / denominator;
        return rate.is_finite().then_some(rate);
    }

    value
        .parse::<f64>()
        .ok()
        .filter(|rate| rate.is_finite() && *rate > 0.0)
}

fn download_youtube_result(payload: &Value) -> HelperResult<Value> {
    let output_dir = required_string(payload, &["outputDir"])?;
    let video_path = find_first_file_with_extensions(
        &PathBuf::from(&output_dir),
        &["mp4", "m4v", "mov", "webm", "mkv"],
    )
    .ok_or_else(|| HelperError::new("downloaded_video_not_found"))?;
    let thumbnail_path = find_first_file_with_extensions(
        &PathBuf::from(&output_dir),
        &["jpg", "jpeg", "png", "webp"],
    );
    let info_json = read_download_info_json(&PathBuf::from(&output_dir));
    let title = video_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Downloaded video")
        .to_string();
    let author_name = info_json
        .as_ref()
        .and_then(|info| string_from_info_fields(info, &["channel", "uploader", "creator"]));
    let author_url = info_json
        .as_ref()
        .and_then(|info| string_from_info_fields(info, &["channel_url", "uploader_url"]));

    Ok(json!({
        "command": "download_youtube",
        "videoPath": path_to_string(video_path),
        "title": title,
        "captionsAvailable": false,
        "thumbnailPath": thumbnail_path.map(path_to_string),
        "authorName": author_name,
        "authorUrl": author_url,
    }))
}

fn read_download_info_json(root: &Path) -> Option<Value> {
    let path = find_first_file_with_suffix(root, ".info.json")?;
    let mut file = fs::File::open(path).ok()?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).ok()?;
    serde_json::from_str(&contents).ok()
}

fn string_from_info_fields(info: &Value, fields: &[&str]) -> Option<String> {
    fields.iter().find_map(|field| {
        info.get(field)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

pub fn extract_captions_result(payload: &Value) -> HelperResult<Value> {
    let output_dir = required_string(payload, &["outputDir"])?;
    let captions_path =
        find_first_file_with_extensions(&PathBuf::from(output_dir), &["vtt", "srt", "json3"]);
    let segments = captions_path
        .as_deref()
        .map(parse_caption_segments)
        .transpose()?
        .unwrap_or_default();

    Ok(json!({
        "command": "extract_captions",
        "captionsAvailable": captions_path.is_some(),
        "captionsPath": captions_path.map(path_to_string),
        "segments": segments,
    }))
}

fn parse_caption_segments(path: &Path) -> HelperResult<Vec<Value>> {
    let contents = fs::read_to_string(path).map_err(|error| HelperError::new(error.to_string()))?;
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase();

    if extension == "vtt" {
        return parse_vtt_caption_segments(&contents);
    }

    if extension == "srt" {
        return parse_srt_caption_segments(&contents);
    }

    Ok(Vec::new())
}

#[derive(Debug)]
struct ParsedCaptionCue {
    start_seconds: f64,
    end_seconds: f64,
    lines: Vec<String>,
}

fn parse_vtt_caption_segments(contents: &str) -> HelperResult<Vec<Value>> {
    let normalized = normalize_vtt_for_subtp(contents);
    let vtt = subtp::vtt::WebVtt::parse(&normalized)
        .map_err(|error| HelperError::new(format!("vtt_parse_failed:{error}")))?;
    let cues = vtt
        .blocks
        .into_iter()
        .filter_map(|block| match block {
            subtp::vtt::VttBlock::Que(cue) => {
                let start: Duration = cue.timings.start.into();
                let end: Duration = cue.timings.end.into();
                Some(ParsedCaptionCue {
                    start_seconds: duration_seconds(start),
                    end_seconds: duration_seconds(end),
                    lines: cue.payload,
                })
            }
            _ => None,
        })
        .collect::<Vec<_>>();

    Ok(caption_cues_to_segments(cues))
}

fn normalize_vtt_for_subtp(contents: &str) -> String {
    let normalized_newlines = contents.replace("\r\n", "\n").replace('\r', "\n");
    let mut lines = Vec::new();
    let mut previous_line_was_timing = false;

    for line in normalized_newlines.lines() {
        if line.trim().is_empty() {
            if !previous_line_was_timing {
                lines.push(String::new());
            }
            continue;
        }

        if line.contains("-->") {
            lines.push(line.replace(',', "."));
            previous_line_was_timing = true;
        } else {
            lines.push(
                strip_vtt_inline_timestamp_tags(line)
                    .trim_start()
                    .to_string(),
            );
            previous_line_was_timing = false;
        }
    }

    let mut normalized = lines.join("\n");
    normalized.push('\n');
    normalized
}

fn strip_vtt_inline_timestamp_tags(line: &str) -> String {
    let mut output = String::with_capacity(line.len());
    let mut rest = line;

    while let Some(tag_start) = rest.find('<') {
        output.push_str(&rest[..tag_start]);
        let after_open = &rest[tag_start + 1..];
        let Some(tag_end) = after_open.find('>') else {
            output.push('<');
            rest = after_open;
            continue;
        };
        let tag = &after_open[..tag_end];
        if is_vtt_inline_timestamp_tag(tag) {
            rest = &after_open[tag_end + 1..];
        } else {
            output.push('<');
            rest = after_open;
        }
    }

    output.push_str(rest);
    output
}

fn is_vtt_inline_timestamp_tag(tag: &str) -> bool {
    tag.contains(':')
        && tag
            .chars()
            .all(|character| character.is_ascii_digit() || matches!(character, ':' | '.'))
}

fn parse_srt_caption_segments(contents: &str) -> HelperResult<Vec<Value>> {
    let srt = subtp::srt::SubRip::parse(contents)
        .map_err(|error| HelperError::new(format!("srt_parse_failed:{error}")))?;
    let cues = srt
        .subtitles
        .into_iter()
        .map(|subtitle| {
            let start: Duration = subtitle.start.into();
            let end: Duration = subtitle.end.into();
            ParsedCaptionCue {
                start_seconds: duration_seconds(start),
                end_seconds: duration_seconds(end),
                lines: subtitle.text,
            }
        })
        .collect::<Vec<_>>();

    Ok(caption_cues_to_segments(cues))
}

fn caption_cues_to_segments(cues: Vec<ParsedCaptionCue>) -> Vec<Value> {
    let mut segments = Vec::new();
    let mut previous_cue_lines: Vec<String> = Vec::new();
    let mut previous_segment_text = String::new();

    for cue in cues {
        let cue_lines = cue
            .lines
            .iter()
            .map(|line| clean_caption_text(line))
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>();

        if cue_lines.is_empty() {
            previous_cue_lines.clear();
            continue;
        }

        let mut new_lines = Vec::new();
        for line in &cue_lines {
            if previous_cue_lines.iter().any(|previous| previous == line) {
                continue;
            }

            let delta = previous_cue_lines
                .iter()
                .filter(|previous| {
                    line.starts_with(previous.as_str()) && line.len() > previous.len()
                })
                .max_by_key(|previous| previous.len())
                .map(|previous| line[previous.len()..].trim())
                .filter(|value| !value.is_empty());

            new_lines.push(delta.unwrap_or(line).to_string());
        }

        previous_cue_lines = cue_lines;
        let text = normalize_caption_whitespace(&new_lines.join(" "));
        if text.is_empty() || text == previous_segment_text {
            continue;
        }

        previous_segment_text = text.clone();
        segments.push(json!({
            "id": format!("youtube-captions-{}", segments.len() + 1),
            "startSeconds": cue.start_seconds,
            "endSeconds": cue.end_seconds,
            "text": text,
            "sourceKind": "youtube-captions",
        }));
    }

    segments
}

fn duration_seconds(duration: Duration) -> f64 {
    duration.as_secs_f64()
}

fn clean_caption_text(line: &str) -> String {
    let mut cleaned = String::new();
    let mut inside_tag = false;

    for character in line.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => cleaned.push(character),
            _ => {}
        }
    }

    normalize_caption_whitespace(
        &cleaned
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&apos;", "'"),
    )
}

fn normalize_caption_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn find_first_file_with_extensions(root: &Path, extensions: &[&str]) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;

    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .find(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| {
                    extensions
                        .iter()
                        .any(|candidate| extension.eq_ignore_ascii_case(candidate))
                })
                .unwrap_or(false)
        })
}

fn find_first_file_with_suffix(root: &Path, suffix: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;

    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.ends_with(suffix))
                .unwrap_or(false)
        })
}

fn path_to_string(path: PathBuf) -> String {
    let path = path.to_string_lossy().into_owned();
    if cfg!(windows) {
        path.replace('\\', "/")
    } else {
        path
    }
}

fn language_list_field(payload: &Value, name: &str) -> Option<String> {
    match payload.get(name)? {
        Value::String(value) => Some(value.clone()),
        Value::Array(values) => {
            let languages = values
                .iter()
                .filter_map(Value::as_str)
                .filter(|language| !language.trim().is_empty())
                .collect::<Vec<_>>();

            if languages.is_empty() {
                None
            } else {
                Some(languages.join(","))
            }
        }
        _ => None,
    }
}

fn argv_for_event(plan: &CommandPlan) -> Vec<String> {
    std::iter::once(os_str_to_string(plan.program.as_os_str()))
        .chain(plan.args.iter().cloned())
        .collect()
}

fn os_str_to_string(value: &OsStr) -> String {
    value.to_string_lossy().into_owned()
}

fn event<'a>(event: &'static str, job_id: &'a str, command: HelperCommandName) -> HelperEvent<'a> {
    HelperEvent {
        protocol_version: HELPER_PROTOCOL_VERSION,
        event,
        job_id,
        command: Some(command),
        progress: None,
        message: None,
        result: None,
        error: None,
    }
}

fn write_event<W: Write>(writer: &mut W, event: &HelperEvent<'_>) -> HelperResult<()> {
    serde_json::to_writer(&mut *writer, event)
        .map_err(|error| HelperError::new(error.to_string()))?;
    writer
        .write_all(b"\n")
        .map_err(|error| HelperError::new(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{
        sync::{Mutex, OnceLock},
        time::{SystemTime, UNIX_EPOCH},
    };

    static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    fn unique_test_id() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    }

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        ENV_LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    fn request(command: HelperCommandName, payload: Value) -> HelperRequest {
        HelperRequest {
            protocol_version: HELPER_PROTOCOL_VERSION,
            command,
            job_id: Some("job-1".into()),
            payload,
        }
    }

    #[test]
    fn discovers_media_tools_from_configured_directory() {
        let _guard = env_lock();
        env::set_var(MEDIA_TOOLS_DIR_ENV, "/tmp/openbrief-tools");

        let path = discover_media_tool("ffmpeg");

        assert!(path.ends_with(executable_name("ffmpeg")));
        assert!(path.starts_with("/tmp/openbrief-tools"));
        env::remove_var(MEDIA_TOOLS_DIR_ENV);
    }

    #[test]
    fn falls_back_to_path_lookup_when_media_tools_dir_is_unset() {
        let _guard = env_lock();
        env::remove_var(MEDIA_TOOLS_DIR_ENV);
        env::remove_var(YTDLP_PATH_ENV);

        assert_eq!(
            discover_media_tool("ffprobe"),
            PathBuf::from(executable_name("ffprobe"))
        );
    }

    #[test]
    fn prefers_updated_yt_dlp_path_override() {
        let _guard = env_lock();
        env::set_var(YTDLP_PATH_ENV, "/tmp/openbrief-updated/yt-dlp");

        assert_eq!(
            discover_media_tool("yt-dlp"),
            PathBuf::from("/tmp/openbrief-updated/yt-dlp")
        );

        env::remove_var(YTDLP_PATH_ENV);
    }

    #[test]
    fn shapes_probe_media_as_ffprobe_argv_array() {
        let plan = command_plan_for_request(&request(
            HelperCommandName::ProbeMedia,
            json!({ "inputPath": "/media/input.mp4" }),
        ))
        .unwrap();

        assert_eq!(plan.tool, "ffprobe");
        assert_eq!(
            plan.args,
            vec![
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                "/media/input.mp4"
            ]
        );
    }

    #[test]
    fn shapes_youtube_download_as_yt_dlp_argv_array() {
        let _guard = env_lock();
        env::remove_var(MEDIA_TOOLS_DIR_ENV);
        env::remove_var(YTDLP_PATH_ENV);
        let plan = command_plan_for_request(&request(
            HelperCommandName::DownloadYoutube,
            json!({ "url": "https://youtu.be/example", "outputDir": "/library" }),
        ))
        .unwrap();

        assert_eq!(plan.tool, "yt-dlp");
        assert_eq!(
            plan.args,
            vec![
                "--newline",
                "--no-playlist",
                "--extractor-args",
                "youtube:player_client=default,-web,-web_safari",
                "--format",
                "bestvideo[ext=mp4][vcodec^=avc1][height<=720][fps<=30]+bestaudio[ext=m4a][acodec^=mp4a]/best[ext=mp4][vcodec^=avc1][acodec^=mp4a][height<=720][fps<=30]/bestvideo[ext=mp4][height<=720][fps<=30]+bestaudio[ext=m4a]/best[ext=mp4][height<=720][fps<=30]/best[height<=720][fps<=30]/bestvideo[ext=mp4][vcodec^=avc1][height<=720]+bestaudio[ext=m4a][acodec^=mp4a]/best[ext=mp4][vcodec^=avc1][acodec^=mp4a][height<=720]/best[height<=720]/best",
                "--merge-output-format",
                "mp4",
                "--write-thumbnail",
                "--convert-thumbnails",
                "jpg",
                "--write-info-json",
                "-o",
                "/library/%(title)s.%(ext)s",
                "https://youtu.be/example"
            ]
        );
    }

    #[test]
    fn passes_bundled_ffmpeg_location_to_youtube_downloads() {
        let _guard = env_lock();
        env::set_var(MEDIA_TOOLS_DIR_ENV, "/tmp/openbrief-tools");

        let plan = command_plan_for_request(&request(
            HelperCommandName::DownloadYoutube,
            json!({ "url": "https://youtu.be/example", "outputDir": "/library" }),
        ))
        .unwrap();

        assert!(plan
            .args
            .windows(2)
            .any(|pair| pair == ["--ffmpeg-location", "/tmp/openbrief-tools"]));
        env::remove_var(MEDIA_TOOLS_DIR_ENV);
    }

    #[test]
    fn shapes_timestamp_thumbnail_extraction_as_fast_ffmpeg_seek() {
        let plan = command_plan_for_request(&request(
            HelperCommandName::ExtractThumbnail,
            json!({
                "videoPath": "/library/videos/video-1/source.mp4",
                "outputPath": "/library/videos/video-1/frames/245.jpg",
                "timestampSeconds": 245
            }),
        ))
        .unwrap();

        assert_eq!(plan.tool, "ffmpeg");
        assert_eq!(
            plan.args,
            vec![
                "-hide_banner",
                "-y",
                "-ss",
                "245",
                "-i",
                "/library/videos/video-1/source.mp4",
                "-frames:v",
                "1",
                "-vf",
                "scale=640:-2",
                "/library/videos/video-1/frames/245.jpg"
            ]
        );
    }

    #[test]
    fn shapes_transcode_video_as_webview_safe_mp4_argv_array() {
        let plan = command_plan_for_request(&request(
            HelperCommandName::TranscodeVideo,
            json!({
                "videoPath": "/media/input.webm",
                "outputPath": "/library/playback.mp4"
            }),
        ))
        .unwrap();

        assert_eq!(plan.tool, "ffmpeg");
        assert_eq!(
            plan.args,
            vec![
                "-hide_banner",
                "-y",
                "-i",
                "/media/input.webm",
                "-map",
                "0:v:0",
                "-map",
                "0:a:0?",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-vf",
                "fps=30",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+faststart",
                "/library/playback.mp4"
            ]
        );
    }

    #[test]
    fn shapes_probe_media_result_from_ffprobe_json() {
        let result = probe_media_result_from_stdout(
            r#"{"streams":[{"codec_type":"audio","codec_name":"aac"},{"codec_type":"video","codec_name":"h264","profile":"Main","pix_fmt":"yuv420p","level":32,"width":1280,"height":720,"avg_frame_rate":"60000/1001"}],"format":{"duration":"42.5","size":"2048","format_name":"mov,mp4"}}"#,
        )
        .unwrap();

        assert_eq!(result["command"], "probe_media");
        assert_eq!(result["durationSeconds"], 42.5);
        assert_eq!(result["fileSizeBytes"], 2048);
        assert_eq!(result["container"], "mov,mp4");
        assert_eq!(result["videoCodec"], "h264");
        assert_eq!(result["audioCodec"], "aac");
        assert_eq!(result["width"], 1280);
        assert_eq!(result["height"], 720);
        assert_eq!(result["frameRate"], 60000.0 / 1001.0);
        assert_eq!(result["pixelFormat"], "yuv420p");
        assert_eq!(result["videoProfile"], "Main");
        assert_eq!(result["videoLevel"], 32);
        assert_eq!(result["resolution"], "1280x720");
    }

    #[test]
    fn parses_ffprobe_fractional_frame_rates() {
        assert_eq!(parse_ffprobe_rate("30000/1001"), Some(30000.0 / 1001.0));
        assert_eq!(parse_ffprobe_rate("0/0"), None);
        assert_eq!(parse_ffprobe_rate("30"), Some(30.0));
    }

    #[test]
    fn shapes_youtube_download_result_with_author_metadata_from_info_json() {
        let test_id = unique_test_id();
        let root = env::temp_dir().join(format!("openbrief-ytdlp-info-test-{test_id}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("sample.mp4"), b"video").unwrap();
        fs::write(root.join("sample.jpg"), b"thumbnail").unwrap();
        fs::write(
            root.join("sample.info.json"),
            r#"{"channel":"Sample Creator","channel_url":"https://www.youtube.com/@samplecreator","uploader":"fallback"}"#,
        )
        .unwrap();

        let result =
            download_youtube_result(&json!({ "outputDir": root.to_string_lossy() })).unwrap();

        assert_eq!(result["command"], "download_youtube");
        assert_eq!(result["title"], "sample");
        assert_eq!(result["authorName"], "Sample Creator");
        assert_eq!(
            result["authorUrl"],
            "https://www.youtube.com/@samplecreator"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn shapes_caption_extraction_as_yt_dlp_argv_array() {
        let plan = command_plan_for_request(&request(
            HelperCommandName::ExtractCaptions,
            json!({
                "sourceUrl": "https://youtu.be/example",
                "videoPath": "/media/input.mp4",
                "outputPath": "/library/captions.%(ext)s",
                "languages": ["en", "es"]
            }),
        ))
        .unwrap();

        assert_eq!(plan.tool, "yt-dlp");
        assert_eq!(
            plan.args,
            vec![
                "--newline",
                "--skip-download",
                "--write-subs",
                "--write-auto-subs",
                "--sub-format",
                "vtt",
                "--sub-langs",
                "en,es",
                "-o",
                "/library/captions.%(ext)s",
                "https://youtu.be/example"
            ]
        );
    }

    #[test]
    fn defaults_caption_extraction_to_english_when_language_is_missing() {
        let plan = command_plan_for_request(&request(
            HelperCommandName::ExtractCaptions,
            json!({
                "sourceUrl": "https://youtu.be/example",
                "videoPath": "/media/input.mp4",
                "outputPath": "/library/captions.%(ext)s"
            }),
        ))
        .unwrap();

        assert!(plan
            .args
            .windows(2)
            .any(|pair| pair == ["--sub-langs", "en"]));
    }

    #[test]
    fn shapes_caption_language_listing_and_parses_languages() {
        let plan = command_plan_for_request(&request(
            HelperCommandName::ListCaptions,
            json!({
                "sourceUrl": "https://youtu.be/example"
            }),
        ))
        .unwrap();

        assert_eq!(plan.tool, "yt-dlp");
        assert_eq!(
            plan.args,
            vec![
                "--newline",
                "--skip-download",
                "--no-playlist",
                "--list-subs",
                "https://youtu.be/example"
            ]
        );

        let languages = parse_caption_languages(
            r#"[info] Available subtitles for example:
Language Name Formats
en English vtt, ttml
ko Korean vtt
[info] Available automatic captions for example:
Language Name Formats
ja Japanese vtt
"#,
        );

        assert_eq!(
            languages,
            vec![
                json!({"code": "en", "label": "English", "kind": "manual"}),
                json!({"code": "ko", "label": "Korean", "kind": "manual"}),
                json!({"code": "ja", "label": "Japanese", "kind": "automatic"})
            ]
        );
    }

    #[test]
    fn parses_youtube_vtt_captions_into_deduped_segments() {
        let youtube_vtt = r#"WEBVTT
Kind: captions
Language: ko

00:00:00.280 --> 00:00:02.190
<c>샘플 자막 첫 문장입니다</c>

00:00:02.190 --> 00:00:02.200
<c>샘플 자막 첫 문장입니다</c>

00:00:02.200 --> 00:00:03.709
<c>샘플 자막 첫 문장입니다</c>
<c>두 번째 문장입니다.</c>

00:00:04,000 --> 00:00:05,500
{blank}
&amp; 핵심은 <00:00:04.200><c>반복 제거</c>
"#
        .replace("{blank}", " ");
        let segments = parse_vtt_caption_segments(&youtube_vtt).unwrap();

        assert_eq!(segments.len(), 3);
        assert_eq!(segments[0]["startSeconds"], json!(0.28));
        assert_eq!(segments[0]["text"], json!("샘플 자막 첫 문장입니다"));
        assert_eq!(segments[1]["text"], json!("두 번째 문장입니다."));
        assert_eq!(segments[2]["text"], json!("& 핵심은 반복 제거"));
        assert_eq!(segments[2]["sourceKind"], json!("youtube-captions"));
    }

    #[test]
    fn parses_srt_captions_into_internal_segments() {
        let segments = parse_srt_caption_segments(
            r#"1
00:00:01,000 --> 00:00:02,500
First caption line

2
00:00:03,000 --> 00:00:04,250
Second caption line
"#,
        )
        .unwrap();

        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0]["startSeconds"], json!(1.0));
        assert_eq!(segments[0]["endSeconds"], json!(2.5));
        assert_eq!(segments[0]["text"], json!("First caption line"));
        assert_eq!(segments[1]["startSeconds"], json!(3.0));
        assert_eq!(segments[1]["endSeconds"], json!(4.25));
        assert_eq!(segments[1]["sourceKind"], json!("youtube-captions"));
    }

    #[test]
    fn shapes_audio_extraction_as_ffmpeg_argv_array() {
        let plan = command_plan_for_request(&request(
            HelperCommandName::ExtractAudio,
            json!({ "videoPath": "/media/input.mp4", "outputPath": "/tmp/audio.wav" }),
        ))
        .unwrap();

        assert_eq!(plan.tool, "ffmpeg");
        assert_eq!(
            plan.args,
            vec![
                "-hide_banner",
                "-y",
                "-i",
                "/media/input.mp4",
                "-vn",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                "/tmp/audio.wav"
            ]
        );
    }

    #[test]
    fn transcribe_audio_uses_whisper_model_contract_after_audio_extraction() {
        let test_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = env::temp_dir().join(format!("openbrief-stt-sidecar-test-{test_id}"));
        fs::create_dir_all(&root).unwrap();
        let audio_path = root.join("transcript-audio.wav");
        write_test_wav(&audio_path);

        let mut output = Vec::new();
        let error = run_request(
            &request(
                HelperCommandName::TranscribeAudio,
                json!({
                    "audioPath": audio_path,
                    "modelPath": root.join("missing-model.bin"),
                    "outputPath": root.join("transcript.json")
                }),
            ),
            &mut output,
        )
        .unwrap_err();
        let output = String::from_utf8(output).unwrap();

        assert!(error
            .to_string()
            .contains("transcribe_audio_model_not_found"));
        assert!(output.contains(r#""command":"transcribe_audio""#));
        assert!(!output.contains("transcription engine and is not enabled"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn transcript_json_uses_whisper_segments_and_synthetic_word_timing() {
        let test_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = env::temp_dir().join(format!("openbrief-stt-segments-test-{test_id}"));
        let output_path = root.join("transcript.json");
        let segments = vec![
            transcribe_rs::TranscriptionSegment {
                start: 1.25,
                end: 2.75,
                text: "hello detailed timestamps".to_string(),
            },
            transcribe_rs::TranscriptionSegment {
                start: 4.0,
                end: 5.0,
                text: "second segment".to_string(),
            },
        ];

        let transcript = write_transcript_json(
            &output_path,
            "hello detailed timestamps second segment",
            Some(&segments),
        )
        .unwrap();

        assert!(output_path.is_file());
        let first = &transcript["segments"][0];
        assert_eq!(first["startSeconds"], 1.25);
        assert_eq!(first["endSeconds"], 2.75);
        assert_eq!(first["words"][0]["text"], "hello");
        assert_eq!(first["words"][0]["startSeconds"], 1.25);
        assert_eq!(first["words"][2]["text"], "timestamps");
        assert_eq!(first["words"][2]["endSeconds"], 2.75);
        assert_eq!(transcript["segments"][1]["startSeconds"], 4.0);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_wrong_protocol_version_before_running_a_command() {
        let mut output = Vec::new();
        let request = HelperRequest {
            protocol_version: 2,
            command: HelperCommandName::ProbeMedia,
            job_id: Some("job-1".into()),
            payload: json!({ "inputPath": "/media/input.mp4" }),
        };

        let error = run_request(&request, &mut output).unwrap_err();

        assert!(error.to_string().contains("unsupported protocolVersion"));
        assert!(output.is_empty());
    }

    #[test]
    fn cancel_job_completes_without_a_media_tool_plan() {
        let mut output = Vec::new();
        run_request(
            &request(
                HelperCommandName::CancelJob,
                json!({ "targetJobId": "download-1" }),
            ),
            &mut output,
        )
        .unwrap();

        let lines = String::from_utf8(output).unwrap();
        assert!(lines.contains("\"event\":\"job_started\""));
        assert!(lines.contains("\"event\":\"job_completed\""));
        assert!(lines.contains("\"cancelledJobId\":\"download-1\""));
    }

    fn write_test_wav(path: &Path) {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(path, spec).unwrap();
        for _ in 0..160 {
            writer.write_sample::<i16>(0).unwrap();
        }
        writer.finalize().unwrap();
    }
}
