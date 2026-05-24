use rusqlite::{params, Connection};
use serde_json::{json, Map, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::{Component, Path, PathBuf},
};
use tauri::{AppHandle, Manager, Runtime};

#[tauri::command]
pub fn load_media_library_snapshot<R: Runtime>(app: AppHandle<R>) -> Result<Value, String> {
    let library_root = openbrief_library_root_for_app(&app)?;
    let db_path = library_root.join("openbrief.sqlite3");
    let connection = open_media_library_connection(&db_path)?;

    load_media_library_snapshot_from_connection(&connection, &library_root)
}

#[tauri::command]
pub fn save_media_library_snapshot<R: Runtime>(
    app: AppHandle<R>,
    snapshot: Value,
) -> Result<(), String> {
    let library_root = openbrief_library_root_for_app(&app)?;
    let db_path = media_library_db_path_for_app(&app)?;
    let mut connection = open_media_library_connection(&db_path)?;

    save_media_library_snapshot_to_connection(&mut connection, &library_root, &snapshot)
}

fn open_media_library_connection(db_path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(db_path)
        .map_err(|error| format!("media_library_db_open_failed:{error}"))?;
    migrate_media_library(&connection)?;
    Ok(connection)
}

fn migrate_media_library(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS media_records (
                kind TEXT NOT NULL,
                record_key TEXT NOT NULL,
                video_id TEXT,
                sort_key TEXT,
                json TEXT NOT NULL,
                PRIMARY KEY (kind, record_key)
            );
            CREATE INDEX IF NOT EXISTS idx_media_records_kind_video
            ON media_records(kind, video_id, sort_key);
            "#,
        )
        .map_err(|error| format!("media_library_db_migrate_failed:{error}"))
}

fn save_media_library_snapshot_to_connection(
    connection: &mut Connection,
    library_root: &Path,
    snapshot: &Value,
) -> Result<(), String> {
    let migrated_snapshot = migrate_video_bundle_paths(library_root, snapshot)?;
    let snapshot = &migrated_snapshot;
    let tx = connection
        .transaction()
        .map_err(|error| format!("media_library_db_transaction_failed:{error}"))?;
    tx.execute("DELETE FROM media_records", [])
        .map_err(|error| format!("media_library_db_clear_failed:{error}"))?;

    for video in array_field(snapshot, "videos") {
        insert_record(
            &tx,
            "video",
            value_id(video),
            value_video_id(video),
            value_sort_key(video),
            video,
        )?;
    }

    for job in array_field(snapshot, "ingestJobs") {
        insert_record(
            &tx,
            "ingest_job",
            value_id(job),
            value_video_id(job),
            value_sort_key(job),
            job,
        )?;
    }

    for job in array_field(snapshot, "transcriptJobs") {
        insert_record(
            &tx,
            "transcript_job",
            value_id(job),
            value_video_id(job),
            value_sort_key(job),
            job,
        )?;
    }

    for playlist in array_field(snapshot, "playlists") {
        insert_record(
            &tx,
            "playlist",
            value_id(playlist),
            None,
            value_sort_key(playlist),
            playlist,
        )?;
    }

    for (video_id, segments) in object_field(snapshot, "transcriptsByVideoId") {
        for (index, segment) in as_array(segments).iter().enumerate() {
            insert_record(
                &tx,
                "transcript_segment",
                &format!("{video_id}:{}", value_id(segment)),
                Some(video_id),
                Some(format!("{index:010}")),
                segment,
            )?;
        }
    }

    for (video_id, variants) in object_field(snapshot, "transcriptVariantsByVideoId") {
        for variant in as_array(variants) {
            let mut variant = variant.clone();
            let variant_id = value_id(&variant).to_string();
            let artifact_path = variant
                .get("artifactPath")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| transcript_variant_artifact_path(video_id, &variant_id));
            ensure_string_field(&mut variant, "artifactPath", &artifact_path);
            insert_record(
                &tx,
                "transcript_variant",
                &format!("{video_id}:{variant_id}"),
                Some(video_id),
                value_sort_key(&variant),
                &variant,
            )?;
            if let Some(segments) = variant.get("segments").and_then(Value::as_array) {
                write_library_artifact(
                    library_root,
                    &artifact_path,
                    transcript_segments_text(segments).as_bytes(),
                )?;
            }
        }
    }

    for (video_id, summary) in object_field(snapshot, "summariesByVideoId") {
        let mut summary = summary.clone();
        let summary_id = value_id(&summary);
        let artifact_path = summary_artifact_path(
            video_id,
            &summary_id,
            video_by_id(snapshot, video_id).and_then(Value::as_object),
        );
        ensure_string_field(&mut summary, "artifactPath", &artifact_path);
        insert_record(
            &tx,
            "summary",
            video_id,
            Some(video_id),
            value_sort_key(&summary),
            &summary,
        )?;
        if let Some(markdown) = summary.get("markdown").and_then(Value::as_str) {
            write_library_artifact(library_root, &artifact_path, markdown.as_bytes())?;
        }
    }

    let mut chat_sessions: BTreeMap<(String, String), Vec<Value>> = BTreeMap::new();
    for (video_id, messages) in object_field(snapshot, "chatMessagesByVideoId") {
        for (index, message) in as_array(messages).iter().enumerate() {
            let session_id = message
                .get("sessionId")
                .and_then(Value::as_str)
                .unwrap_or("default")
                .to_string();
            insert_record(
                &tx,
                "chat_message",
                &format!("{video_id}:{session_id}:{}", value_id(message)),
                Some(video_id),
                Some(format!("{session_id}:{index:010}")),
                message,
            )?;
            chat_sessions
                .entry((video_id.to_string(), session_id))
                .or_default()
                .push(message.clone());
        }
    }

    let mut podcasts: BTreeMap<(String, String), Value> = BTreeMap::new();
    for (video_id, podcast) in object_field(snapshot, "podcastsByVideoId") {
        podcasts.insert(
            (video_id.to_string(), value_id(podcast).to_string()),
            podcast.clone(),
        );
    }
    for (video_id, history) in object_field(snapshot, "podcastHistoryByVideoId") {
        for podcast in as_array(history) {
            podcasts.insert(
                (video_id.to_string(), value_id(podcast).to_string()),
                podcast.clone(),
            );
        }
    }
    for ((video_id, podcast_id), podcast) in podcasts {
        insert_record(
            &tx,
            "podcast",
            &format!("{video_id}:{podcast_id}"),
            Some(&video_id),
            value_sort_key(&podcast),
            &podcast,
        )?;
    }

    tx.commit()
        .map_err(|error| format!("media_library_db_commit_failed:{error}"))?;

    for ((video_id, session_id), messages) in chat_sessions {
        write_chat_session_artifact(library_root, &video_id, &session_id, &messages)?;
    }
    write_video_bundle_manifests(library_root, snapshot)?;

    Ok(())
}

fn migrate_video_bundle_paths(library_root: &Path, snapshot: &Value) -> Result<Value, String> {
    let mut migrated = snapshot.clone();

    if let Some(videos) = migrated.get_mut("videos").and_then(Value::as_array_mut) {
        for video in videos {
            if let Some(video_object) = video.as_object_mut() {
                let video_id = video_object
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string();
                migrate_legacy_artifact_field(
                    library_root,
                    video_object,
                    "thumbnailPath",
                    &format!("thumbnails/{}/", sanitize_path_segment(&video_id)),
                    &thumbnail_artifact_path(video_object, &video_id),
                )?;
            }
        }
    }

    if let Some(jobs) = migrated
        .get_mut("transcriptJobs")
        .and_then(Value::as_array_mut)
    {
        for job in jobs {
            if let Some(job_object) = job.as_object_mut() {
                let video_id = job_object
                    .get("videoId")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string();
                if let Some(current_path) = job_object
                    .get("transcriptPath")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                {
                    let legacy_prefix =
                        format!("transcripts/{}/", sanitize_path_segment(&video_id));
                    if current_path.starts_with(&legacy_prefix) {
                        let file_name = file_name_from_relative_path(&current_path)
                            .unwrap_or_else(|| "transcript.json".to_string());
                        let target_path = format!(
                            "videos/{}/transcript/{}",
                            sanitize_path_segment(&video_id),
                            sanitize_path_segment(&file_name)
                        );
                        if copy_library_file_if_exists(library_root, &current_path, &target_path)? {
                            job_object
                                .insert("transcriptPath".to_string(), Value::String(target_path));
                        }
                    }
                }
            }
        }
    }

    Ok(migrated)
}

fn migrate_legacy_artifact_field(
    library_root: &Path,
    object: &mut Map<String, Value>,
    field: &str,
    legacy_prefix: &str,
    target_path: &str,
) -> Result<(), String> {
    let Some(current_path) = object
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_string)
    else {
        return Ok(());
    };

    if !current_path.starts_with(legacy_prefix) {
        return Ok(());
    }

    if copy_library_file_if_exists(library_root, &current_path, target_path)? {
        object.insert(field.to_string(), Value::String(target_path.to_string()));
    }

    Ok(())
}

fn load_media_library_snapshot_from_connection(
    connection: &Connection,
    library_root: &Path,
) -> Result<Value, String> {
    let mut statement = connection
        .prepare(
            "SELECT kind, record_key, video_id, json
             FROM media_records
             ORDER BY kind, sort_key, record_key",
        )
        .map_err(|error| format!("media_library_db_query_prepare_failed:{error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|error| format!("media_library_db_query_failed:{error}"))?;

    let mut videos = Vec::new();
    let mut ingest_jobs = Vec::new();
    let mut transcript_jobs = Vec::new();
    let mut playlists = Vec::new();
    let mut transcripts_by_video_id: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut transcript_variants_by_video_id: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut summaries_by_video_id = Map::new();
    let mut chat_messages_by_video_id: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut podcast_history_by_video_id: BTreeMap<String, Vec<Value>> = BTreeMap::new();

    for row in rows {
        let (kind, key, video_id, json_text) =
            row.map_err(|error| format!("media_library_db_row_failed:{error}"))?;
        let value: Value = serde_json::from_str(&json_text)
            .map_err(|error| format!("media_library_db_json_failed:{error}"))?;

        match kind.as_str() {
            "video" => videos.push(value),
            "ingest_job" => ingest_jobs.push(value),
            "transcript_job" => transcript_jobs.push(value),
            "playlist" => playlists.push(value),
            "transcript_segment" => {
                if let Some(video_id) = video_id {
                    transcripts_by_video_id
                        .entry(video_id)
                        .or_default()
                        .push(value);
                }
            }
            "transcript_variant" => {
                if let Some(video_id) = video_id {
                    transcript_variants_by_video_id
                        .entry(video_id)
                        .or_default()
                        .push(value);
                }
            }
            "summary" => {
                summaries_by_video_id.insert(video_id.unwrap_or(key), value);
            }
            "chat_message" => {
                if let Some(video_id) = video_id {
                    chat_messages_by_video_id
                        .entry(video_id)
                        .or_default()
                        .push(value);
                }
            }
            "podcast" => {
                if let Some(video_id) = video_id {
                    podcast_history_by_video_id
                        .entry(video_id)
                        .or_default()
                        .push(value);
                }
            }
            _ => {}
        }
    }

    recover_podcast_history_from_files(library_root, &videos, &mut podcast_history_by_video_id)?;

    let mut podcasts_by_video_id = Map::new();
    for (video_id, podcasts) in &mut podcast_history_by_video_id {
        sort_created_at_desc(podcasts);
        if let Some(latest) = podcasts.first() {
            podcasts_by_video_id.insert(video_id.clone(), latest.clone());
        }
    }

    Ok(json!({
        "videos": videos,
        "ingestJobs": ingest_jobs,
        "transcriptJobs": transcript_jobs,
        "playlists": playlists,
        "transcriptsByVideoId": transcripts_by_video_id,
        "transcriptVariantsByVideoId": transcript_variants_by_video_id,
        "summariesByVideoId": summaries_by_video_id,
        "chatMessagesByVideoId": chat_messages_by_video_id,
        "podcastsByVideoId": podcasts_by_video_id,
        "podcastHistoryByVideoId": podcast_history_by_video_id,
    }))
}

fn insert_record(
    connection: &Connection,
    kind: &str,
    key: &str,
    video_id: Option<&str>,
    sort_key: Option<String>,
    value: &Value,
) -> Result<(), String> {
    let json = serde_json::to_string(value)
        .map_err(|error| format!("media_library_record_json_failed:{error}"))?;
    connection
        .execute(
            "INSERT OR REPLACE INTO media_records
             (kind, record_key, video_id, sort_key, json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![kind, key, video_id, sort_key, json],
        )
        .map_err(|error| format!("media_library_record_insert_failed:{error}"))?;

    Ok(())
}

fn write_chat_session_artifact(
    library_root: &Path,
    video_id: &str,
    session_id: &str,
    messages: &[Value],
) -> Result<(), String> {
    let mut lines = String::new();
    for message in messages {
        lines.push_str(
            &serde_json::to_string(message)
                .map_err(|error| format!("media_library_chat_json_failed:{error}"))?,
        );
        lines.push('\n');
    }

    write_library_artifact(
        library_root,
        &chat_session_artifact_path(video_id, session_id),
        lines.as_bytes(),
    )
}

fn recover_podcast_history_from_files(
    library_root: &Path,
    videos: &[Value],
    history: &mut BTreeMap<String, Vec<Value>>,
) -> Result<(), String> {
    for video in videos {
        let video_id = value_id(video).to_string();
        let Some(asset_library_path) = video.get("libraryPath").and_then(Value::as_str) else {
            continue;
        };
        let Ok(asset_directory) = asset_directory_from_library_path(asset_library_path) else {
            continue;
        };
        let podcast_parent_relative = format!("{asset_directory}/podcast");
        let podcast_parent = library_root.join(&podcast_parent_relative);
        reject_existing_relative_symlinks(library_root, &podcast_parent)?;

        if !podcast_parent.exists() {
            continue;
        }
        if path_is_symlink(&podcast_parent)? {
            return Err("media_library_podcast_parent_must_not_be_symlink".to_string());
        }

        for entry in fs::read_dir(&podcast_parent)
            .map_err(|error| format!("media_library_podcast_parent_read_failed:{error}"))?
        {
            let entry = entry
                .map_err(|error| format!("media_library_podcast_entry_read_failed:{error}"))?;
            let file_type = entry
                .file_type()
                .map_err(|error| format!("media_library_podcast_entry_type_failed:{error}"))?;
            if file_type.is_symlink() || !file_type.is_dir() {
                continue;
            }

            let manifest_path = entry.path().join("podcast.json");
            if path_is_symlink(&manifest_path)? {
                return Err("media_library_podcast_manifest_must_not_be_symlink".to_string());
            }
            let Ok(manifest_json) = fs::read_to_string(&manifest_path) else {
                continue;
            };
            let Ok(podcast) = serde_json::from_str::<Value>(&manifest_json) else {
                continue;
            };
            if !podcast_audio_exists(library_root, &podcast)? {
                continue;
            }
            let podcast_id = value_id(&podcast);
            let podcasts = history.entry(video_id.clone()).or_default();
            if !podcasts
                .iter()
                .any(|candidate| value_id(candidate) == podcast_id)
            {
                podcasts.push(podcast);
            }
        }
    }

    Ok(())
}

fn podcast_audio_exists(library_root: &Path, podcast: &Value) -> Result<bool, String> {
    let Some(audio_path) = podcast
        .get("artifacts")
        .and_then(Value::as_object)
        .and_then(|artifacts| artifacts.get("podcastAudioPath"))
        .and_then(Value::as_str)
    else {
        return Ok(false);
    };
    validate_library_relative_file_path(audio_path)?;
    let path = library_root.join(audio_path);
    if let Some(parent) = path.parent() {
        reject_existing_relative_symlinks(library_root, parent)?;
    }
    if path_is_symlink(&path)? {
        return Err("media_library_podcast_audio_must_not_be_symlink".to_string());
    }

    match fs::metadata(&path) {
        Ok(metadata) => Ok(metadata.is_file()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "media_library_podcast_audio_metadata_failed:{error}"
        )),
    }
}

fn write_video_bundle_manifests(library_root: &Path, snapshot: &Value) -> Result<(), String> {
    for video in array_field(snapshot, "videos") {
        let video_id = value_id(video);
        let manifest_path = video_bundle_manifest_path(video_id);
        let mut artifacts = Map::new();
        if let Some(thumbnail_path) = video.get("thumbnailPath").and_then(Value::as_str) {
            artifacts.insert(
                "thumbnailPath".to_string(),
                Value::String(thumbnail_path.to_string()),
            );
        }
        if let Some(transcript_path) = transcript_path_for_video(snapshot, video_id) {
            artifacts.insert("transcriptPath".to_string(), Value::String(transcript_path));
        }
        artifacts.insert(
            "transcriptVariantPaths".to_string(),
            string_array_value(transcript_variant_paths_for_video(snapshot, video_id)),
        );
        artifacts.insert(
            "summaryPaths".to_string(),
            string_array_value(summary_paths_for_video(snapshot, video_id)),
        );
        artifacts.insert(
            "chatSessionPaths".to_string(),
            string_array_value(chat_session_paths_for_video(snapshot, video_id)),
        );
        artifacts.insert(
            "podcastManifestPaths".to_string(),
            string_array_value(podcast_manifest_paths_for_video(snapshot, video_id)),
        );
        artifacts.insert(
            "podcastAudioPaths".to_string(),
            string_array_value(podcast_audio_paths_for_video(snapshot, video_id)),
        );
        let manifest = json!({
            "schemaVersion": 1,
            "videoId": video_id,
            "video": video,
            "artifacts": artifacts
        });
        let contents = serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("media_library_manifest_json_failed:{error}"))?;
        write_library_artifact(library_root, &manifest_path, contents.as_bytes())?;
    }

    Ok(())
}

fn write_library_artifact(
    library_root: &Path,
    relative_path: &str,
    contents: &[u8],
) -> Result<(), String> {
    validate_library_relative_artifact_path(relative_path)?;
    let target = library_root.join(relative_path);
    let parent = target
        .parent()
        .ok_or_else(|| "media_library_artifact_parent_missing".to_string())?;
    reject_existing_relative_symlinks(library_root, target.parent().unwrap_or(library_root))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("media_library_artifact_dir_create_failed:{error}"))?;

    if path_is_symlink(&target)? {
        return Err("media_library_artifact_target_must_not_be_symlink".to_string());
    }

    fs::write(&target, contents)
        .map_err(|error| format!("media_library_artifact_write_failed:{error}"))
}

fn thumbnail_artifact_path(video: &Map<String, Value>, video_id: &str) -> String {
    let prefix = video_artifact_prefix(video, video_id);
    let sanitized_video_id = sanitize_path_segment(video_id);
    let sanitized_prefix = sanitize_path_segment(&prefix);

    format!("videos/{sanitized_video_id}/thumbnail/{sanitized_prefix}-thumbnail.jpg")
}

fn video_artifact_prefix(video: &Map<String, Value>, video_id: &str) -> String {
    video
        .get("originalFileName")
        .and_then(Value::as_str)
        .and_then(file_stem_from_path)
        .or_else(|| video.get("title").and_then(Value::as_str))
        .or_else(|| {
            video
                .get("libraryPath")
                .and_then(Value::as_str)
                .and_then(file_stem_from_path)
        })
        .unwrap_or(video_id)
        .to_string()
}

fn video_by_id<'a>(snapshot: &'a Value, video_id: &str) -> Option<&'a Value> {
    array_field(snapshot, "videos")
        .into_iter()
        .find(|video| video.get("id").and_then(Value::as_str) == Some(video_id))
}

fn file_stem_from_path(path: &str) -> Option<&str> {
    let file_name = path
        .rsplit(['/', '\\'])
        .next()
        .filter(|value| !value.trim().is_empty())?;
    let (stem, _) = file_name.rsplit_once('.').unwrap_or((file_name, ""));
    let trimmed = stem.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn copy_library_file_if_exists(
    library_root: &Path,
    source_relative_path: &str,
    target_relative_path: &str,
) -> Result<bool, String> {
    validate_library_relative_file_path(source_relative_path)?;
    validate_library_relative_artifact_path(target_relative_path)?;
    let source_path = library_root.join(source_relative_path);
    if let Some(parent) = source_path.parent() {
        reject_existing_relative_symlinks(library_root, parent)?;
    }
    if path_is_symlink(&source_path)? {
        return Err("media_library_migration_source_must_not_be_symlink".to_string());
    }
    let source = match source_path.canonicalize() {
        Ok(source) => source,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(format!("media_library_migration_source_invalid:{error}")),
    };

    if !source.starts_with(library_root) {
        return Err("media_library_migration_source_escaped_root".to_string());
    }
    if !source
        .metadata()
        .map_err(|error| format!("media_library_migration_source_metadata_failed:{error}"))?
        .is_file()
    {
        return Ok(false);
    }

    let target = library_root.join(target_relative_path);
    let parent = target
        .parent()
        .ok_or_else(|| "media_library_migration_target_parent_missing".to_string())?;
    reject_existing_relative_symlinks(library_root, parent)?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("media_library_migration_target_dir_create_failed:{error}"))?;
    if path_is_symlink(&target)? {
        return Err("media_library_migration_target_must_not_be_symlink".to_string());
    }
    fs::copy(&source, &target)
        .map_err(|error| format!("media_library_migration_copy_failed:{error}"))?;

    Ok(true)
}

fn media_library_db_path_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let library_root = openbrief_library_root_for_app(app)?;
    Ok(library_root.join("openbrief.sqlite3"))
}

fn openbrief_library_root_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir_unavailable:{error}"))?
        .join("library");
    fs::create_dir_all(&root).map_err(|error| format!("library_root_create_failed:{error}"))?;
    root.canonicalize()
        .map_err(|error| format!("library_root_invalid:{error}"))
}

fn validate_library_relative_artifact_path(relative_path: &str) -> Result<(), String> {
    validate_library_relative_file_path(relative_path)?;
    let relative = PathBuf::from(relative_path);

    let mut components = relative.components();
    if !matches!(components.next(), Some(Component::Normal(segment)) if segment == "videos") {
        return Err("media_library_artifact_path_must_start_with_videos".to_string());
    }

    if relative.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::Prefix(_) | Component::RootDir
        )
    }) {
        return Err("media_library_artifact_path_must_not_traverse".to_string());
    }

    Ok(())
}

fn validate_library_relative_file_path(relative_path: &str) -> Result<(), String> {
    let relative = PathBuf::from(relative_path);
    if relative.is_absolute() {
        return Err("media_library_artifact_path_must_be_relative".to_string());
    }

    if relative.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::Prefix(_) | Component::RootDir
        )
    }) {
        return Err("media_library_artifact_path_must_not_traverse".to_string());
    }

    Ok(())
}

fn asset_directory_from_library_path(relative_path: &str) -> Result<String, String> {
    validate_library_relative_file_path(relative_path)?;
    let mut components = Path::new(relative_path).components();
    let Some(Component::Normal(directory)) = components.next() else {
        return Err("media_library_asset_path_missing_directory".to_string());
    };
    let Some(Component::Normal(asset_id)) = components.next() else {
        return Err("media_library_asset_path_missing_asset_id".to_string());
    };
    let directory = directory.to_string_lossy();
    if !matches!(directory.as_ref(), "videos" | "audios" | "pdfs") {
        return Err("media_library_asset_path_unsupported_directory".to_string());
    }

    Ok(format!("{directory}/{}", asset_id.to_string_lossy()))
}

fn reject_existing_relative_symlinks(root: &Path, path: &Path) -> Result<(), String> {
    let relative = path.strip_prefix(root).unwrap_or(path);
    let mut current = root.to_path_buf();

    for component in relative.components() {
        if let Component::Normal(segment) = component {
            current.push(segment);
            if path_is_symlink(&current)? {
                return Err("media_library_artifact_path_must_not_contain_symlink".to_string());
            }
        }
    }

    Ok(())
}

fn path_is_symlink(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(metadata.file_type().is_symlink()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("media_library_artifact_metadata_failed:{error}")),
    }
}

fn array_field<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn object_field<'a>(value: &'a Value, key: &str) -> impl Iterator<Item = (&'a str, &'a Value)> {
    value
        .get(key)
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|object| object.iter().map(|(key, value)| (key.as_str(), value)))
}

fn as_array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or(&[])
}

fn value_id(value: &Value) -> &str {
    value.get("id").and_then(Value::as_str).unwrap_or("unknown")
}

fn value_video_id(value: &Value) -> Option<&str> {
    value.get("videoId").and_then(Value::as_str)
}

fn value_sort_key(value: &Value) -> Option<String> {
    value
        .get("createdAtIso")
        .or_else(|| value.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn sort_created_at_desc(values: &mut [Value]) {
    values.sort_by(|left, right| {
        value_sort_key(right)
            .unwrap_or_default()
            .cmp(&value_sort_key(left).unwrap_or_default())
    });
}

fn ensure_string_field(value: &mut Value, key: &str, field_value: &str) {
    if let Some(object) = value.as_object_mut() {
        object
            .entry(key.to_string())
            .or_insert_with(|| Value::String(field_value.to_string()));
    }
}

fn summary_artifact_path(
    video_id: &str,
    summary_id: &str,
    video: Option<&Map<String, Value>>,
) -> String {
    let sanitized_video_id = sanitize_path_segment(video_id);
    let Some(video) = video else {
        return format!(
            "videos/{}/summary/{}.md",
            sanitized_video_id,
            sanitize_path_segment(summary_id)
        );
    };
    let prefix = video_artifact_prefix(video, video_id);
    let summary_prefix = format!("summary-{video_id}-");
    let summary_suffix = summary_id
        .strip_prefix(&summary_prefix)
        .or_else(|| summary_id.strip_prefix("summary-"))
        .filter(|value| !value.is_empty())
        .unwrap_or(summary_id);

    format!(
        "videos/{sanitized_video_id}/summary/{}-summary-{}.md",
        sanitize_path_segment(&prefix),
        sanitize_path_segment(summary_suffix)
    )
}

fn transcript_variant_artifact_path(video_id: &str, variant_id: &str) -> String {
    format!(
        "videos/{}/transcript/{}.txt",
        sanitize_path_segment(video_id),
        sanitize_path_segment(variant_id)
    )
}

fn transcript_segments_text(segments: &[Value]) -> String {
    segments
        .iter()
        .filter_map(|segment| {
            let start = segment.get("startSeconds").and_then(Value::as_f64)?;
            let text = segment.get("text").and_then(Value::as_str)?;
            Some(format!("{}\t{}", format_timestamp(start), text))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_timestamp(total_seconds: f64) -> String {
    let total_seconds = total_seconds.max(0.0).floor() as u64;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;

    if hours > 0 {
        format!("{hours}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes}:{seconds:02}")
    }
}

fn chat_session_artifact_path(video_id: &str, session_id: &str) -> String {
    format!(
        "videos/{}/chat/{}.jsonl",
        sanitize_path_segment(video_id),
        sanitize_path_segment(session_id)
    )
}

fn video_bundle_manifest_path(video_id: &str) -> String {
    format!(
        "videos/{}/openbrief-video.json",
        sanitize_path_segment(video_id)
    )
}

fn transcript_path_for_video(snapshot: &Value, video_id: &str) -> Option<String> {
    array_field(snapshot, "transcriptJobs")
        .iter()
        .rev()
        .find(|job| job.get("videoId").and_then(Value::as_str) == Some(video_id))
        .and_then(|job| job.get("transcriptPath").and_then(Value::as_str))
        .map(str::to_string)
}

fn transcript_variant_paths_for_video(snapshot: &Value, video_id: &str) -> Vec<String> {
    object_field(snapshot, "transcriptVariantsByVideoId")
        .find(|(candidate_video_id, _)| *candidate_video_id == video_id)
        .map(|(_, variants)| {
            as_array(variants)
                .iter()
                .map(|variant| {
                    variant
                        .get("artifactPath")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .unwrap_or_else(|| {
                            transcript_variant_artifact_path(video_id, value_id(variant))
                        })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn summary_paths_for_video(snapshot: &Value, video_id: &str) -> Vec<String> {
    object_field(snapshot, "summariesByVideoId")
        .filter(|(candidate_video_id, _)| *candidate_video_id == video_id)
        .map(|(_, summary)| {
            summary
                .get("artifactPath")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| {
                    summary_artifact_path(
                        video_id,
                        value_id(summary),
                        video_by_id(snapshot, video_id).and_then(Value::as_object),
                    )
                })
        })
        .collect()
}

fn chat_session_paths_for_video(snapshot: &Value, video_id: &str) -> Vec<String> {
    let mut paths = object_field(snapshot, "chatMessagesByVideoId")
        .find(|(candidate_video_id, _)| *candidate_video_id == video_id)
        .map(|(_, messages)| {
            as_array(messages)
                .iter()
                .filter_map(|message| {
                    message
                        .get("sessionId")
                        .and_then(Value::as_str)
                        .or(Some("default"))
                })
                .map(|session_id| chat_session_artifact_path(video_id, session_id))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    paths.sort();
    paths.dedup();
    paths
}

fn podcast_manifest_paths_for_video(snapshot: &Value, video_id: &str) -> Vec<String> {
    podcast_artifact_paths_for_video(snapshot, video_id, "manifestPath")
}

fn podcast_audio_paths_for_video(snapshot: &Value, video_id: &str) -> Vec<String> {
    podcast_artifact_paths_for_video(snapshot, video_id, "podcastAudioPath")
}

fn podcast_artifact_paths_for_video(
    snapshot: &Value,
    video_id: &str,
    artifact_key: &str,
) -> Vec<String> {
    let mut paths = object_field(snapshot, "podcastHistoryByVideoId")
        .find(|(candidate_video_id, _)| *candidate_video_id == video_id)
        .map(|(_, podcasts)| {
            as_array(podcasts)
                .iter()
                .filter_map(|podcast| {
                    podcast
                        .get("artifacts")
                        .and_then(Value::as_object)
                        .and_then(|artifacts| artifacts.get(artifact_key))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if let Some(latest_path) = object_field(snapshot, "podcastsByVideoId")
        .find(|(candidate_video_id, _)| *candidate_video_id == video_id)
        .and_then(|(_, podcast)| {
            podcast
                .get("artifacts")
                .and_then(Value::as_object)
                .and_then(|artifacts| artifacts.get(artifact_key))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
    {
        paths.push(latest_path);
    }

    paths.sort();
    paths.dedup();
    paths
}

fn string_array_value(values: Vec<String>) -> Value {
    Value::Array(values.into_iter().map(Value::String).collect())
}

fn file_name_from_relative_path(relative_path: &str) -> Option<String> {
    Path::new(relative_path)
        .file_name()
        .map(|file_name| file_name.to_string_lossy().to_string())
}

fn sanitize_path_segment(value: &str) -> String {
    let sanitized = value
        .trim()
        .replace(['/', '\\'], "-")
        .replace("..", ".")
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric()
                || character == '.'
                || character == '_'
                || character == '-'
            {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let sanitized = sanitized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let sanitized = sanitized.trim_matches(['.', '-']);

    if sanitized.is_empty() {
        "untitled".to_string()
    } else {
        sanitized.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn saves_and_loads_snapshot_through_sql_tables() {
        let fixture = TestFixture::new("media-library-sql");
        let db = fixture.root.join("library.sqlite3");
        let library = fixture.create_dir("library").canonicalize().unwrap();
        let mut connection = open_media_library_connection(&db).unwrap();
        let snapshot = sample_snapshot();

        save_media_library_snapshot_to_connection(&mut connection, &library, &snapshot).unwrap();
        let reloaded = load_media_library_snapshot_from_connection(&connection, &library).unwrap();

        assert_eq!(reloaded["videos"][0]["id"], "video-1");
        assert_eq!(
            reloaded["summariesByVideoId"]["video-1"]["artifactPath"],
            "videos/video-1/summary/Design-Review-summary-video-1.md"
        );
        assert_eq!(reloaded["playlists"][0]["id"], "playlist-1");
        assert_eq!(reloaded["playlists"][0]["videoIds"][0], "video-1");
        assert_eq!(
            reloaded["playlists"][0]["coverImagePath"],
            "playlists/playlist-1/cover.png"
        );
        assert_eq!(
            fs::read_to_string(
                library.join("videos/video-1/summary/Design-Review-summary-video-1.md")
            )
            .unwrap(),
            "# Summary"
        );
        assert!(
            fs::read_to_string(library.join("videos/video-1/chat/default.jsonl"))
                .unwrap()
                .contains("\"content\":\"Question\"")
        );
        assert_eq!(
            reloaded["podcastsByVideoId"]["video-1"]["id"],
            "podcast-video-1-2026-05-21"
        );
        assert_eq!(
            reloaded["podcastHistoryByVideoId"]["video-1"][0]["artifacts"]["podcastAudioPath"],
            "videos/video-1/podcast/podcast-video-1-2026-05-21/audio/podcast.wav"
        );
        let manifest: Value = serde_json::from_str(
            &fs::read_to_string(library.join("videos/video-1/openbrief-video.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(manifest["schemaVersion"], 1);
        assert_eq!(manifest["videoId"], "video-1");
        assert_eq!(
            manifest["artifacts"]["thumbnailPath"],
            "videos/video-1/thumbnail/video-1-thumbnail.jpg"
        );
        assert_eq!(
            manifest["artifacts"]["summaryPaths"][0],
            "videos/video-1/summary/Design-Review-summary-video-1.md"
        );
        assert_eq!(
            manifest["artifacts"]["chatSessionPaths"][0],
            "videos/video-1/chat/default.jsonl"
        );
        assert_eq!(
            manifest["artifacts"]["podcastManifestPaths"][0],
            "videos/video-1/podcast/podcast-video-1-2026-05-21/podcast.json"
        );
        assert_eq!(
            manifest["artifacts"]["podcastAudioPaths"][0],
            "videos/video-1/podcast/podcast-video-1-2026-05-21/audio/podcast.wav"
        );
    }

    #[test]
    fn migrates_legacy_thumbnail_and_transcript_paths_into_video_bundle() {
        let fixture = TestFixture::new("media-library-migrate-bundle");
        let db = fixture.root.join("library.sqlite3");
        let library = fixture.create_dir("library").canonicalize().unwrap();
        fixture.write_file("library/thumbnails/video-1/poster.jpg", "image");
        fixture.write_file(
            "library/transcripts/video-1/transcript.json",
            "{\"text\":\"ok\"}",
        );
        let mut connection = open_media_library_connection(&db).unwrap();
        let snapshot = json!({
            "videos": [{
                "id": "video-1",
                "title": "Design Review",
                "sourceKind": "youtube",
                "originalUri": "https://youtu.be/example",
                "libraryPath": "videos/video-1/video.mp4",
                "thumbnailPath": "thumbnails/video-1/poster.jpg",
                "importStatus": "ready",
                "createdAtIso": "2026-05-21T00:00:00.000Z"
            }],
            "transcriptJobs": [{
                "id": "transcript-video-1-pipeline",
                "videoId": "video-1",
                "status": "completed",
                "preferredSource": "local-stt",
                "progressPercent": 100,
                "transcriptPath": "transcripts/video-1/transcript.json"
            }]
        });

        save_media_library_snapshot_to_connection(&mut connection, &library, &snapshot).unwrap();
        let reloaded = load_media_library_snapshot_from_connection(&connection, &library).unwrap();

        assert_eq!(
            reloaded["videos"][0]["thumbnailPath"],
            "videos/video-1/thumbnail/Design-Review-thumbnail.jpg"
        );
        assert_eq!(
            reloaded["transcriptJobs"][0]["transcriptPath"],
            "videos/video-1/transcript/transcript.json"
        );
        assert_eq!(
            fs::read_to_string(
                library.join("videos/video-1/thumbnail/Design-Review-thumbnail.jpg")
            )
            .unwrap(),
            "image"
        );
        assert_eq!(
            fs::read_to_string(library.join("videos/video-1/transcript/transcript.json")).unwrap(),
            "{\"text\":\"ok\"}"
        );
    }

    #[test]
    fn recovers_podcast_history_from_existing_bundle_manifests() {
        let fixture = TestFixture::new("media-library-podcast-recovery");
        let db = fixture.root.join("library.sqlite3");
        let library = fixture.create_dir("library").canonicalize().unwrap();
        let mut connection = open_media_library_connection(&db).unwrap();
        let snapshot = json!({
            "videos": [{
                "id": "video-1",
                "title": "Design Review",
                "sourceKind": "youtube",
                "originalUri": "https://youtu.be/example",
                "libraryPath": "videos/video-1/video.mp4",
                "importStatus": "ready",
                "createdAtIso": "2026-05-21T00:00:00.000Z"
            }]
        });
        let podcast = sample_podcast();
        fixture.write_file(
            "library/videos/video-1/podcast/podcast-video-1-2026-05-21/podcast.json",
            &serde_json::to_string(&podcast).unwrap(),
        );
        fixture.write_file(
            "library/videos/video-1/podcast/podcast-video-1-2026-05-21/audio/podcast.wav",
            "audio",
        );

        save_media_library_snapshot_to_connection(&mut connection, &library, &snapshot).unwrap();
        let reloaded = load_media_library_snapshot_from_connection(&connection, &library).unwrap();

        assert_eq!(
            reloaded["podcastsByVideoId"]["video-1"]["id"],
            "podcast-video-1-2026-05-21"
        );
        assert_eq!(
            reloaded["podcastHistoryByVideoId"]["video-1"][0]["script"]["title"],
            "Design Review podcast"
        );
    }

    #[test]
    fn rejects_artifacts_outside_video_directories() {
        assert_eq!(
            validate_library_relative_artifact_path("summaries/video-1.md").unwrap_err(),
            "media_library_artifact_path_must_start_with_videos"
        );
        assert_eq!(
            validate_library_relative_artifact_path("videos/video-1/../bad.md").unwrap_err(),
            "media_library_artifact_path_must_not_traverse"
        );
    }

    fn sample_podcast() -> Value {
        json!({
            "schemaVersion": 1,
            "id": "podcast-video-1-2026-05-21",
            "sourceAssetId": "video-1",
            "mode": "podcast-summary",
            "sourceKind": "current-summary",
            "lengthMode": "default",
            "provider": "openai",
            "createdAtIso": "2026-05-21T00:04:00.000Z",
            "script": {
                "title": "Design Review podcast",
                "turns": [
                    {
                        "id": "turn-0001",
                        "speakerId": "A",
                        "speakerLabel": "Mark",
                        "text": "Welcome."
                    },
                    {
                        "id": "turn-0002",
                        "speakerId": "B",
                        "speakerLabel": "Sophia",
                        "text": "Here are the notes."
                    },
                    {
                        "id": "turn-0003",
                        "speakerId": "A",
                        "speakerLabel": "Mark",
                        "text": "The library changed."
                    },
                    {
                        "id": "turn-0004",
                        "speakerId": "B",
                        "speakerLabel": "Sophia",
                        "text": "That is the recap."
                    }
                ],
                "markdown": "# Design Review podcast\n"
            },
            "tts": {
                "modelId": "Supertone/supertonic-3",
                "languageCode": "en",
                "speakers": [
                    { "id": "A", "label": "Mark", "voiceStyleId": "M1" },
                    { "id": "B", "label": "Sophia", "voiceStyleId": "F2" }
                ]
            },
            "artifacts": {
                "rootDirectory": "videos/video-1/podcast/podcast-video-1-2026-05-21",
                "manifestPath": "videos/video-1/podcast/podcast-video-1-2026-05-21/podcast.json",
                "scriptPath": "videos/video-1/podcast/podcast-video-1-2026-05-21/script.md",
                "turnAudioDirectory": "videos/video-1/podcast/podcast-video-1-2026-05-21/audio/turns",
                "podcastAudioPath": "videos/video-1/podcast/podcast-video-1-2026-05-21/audio/podcast.wav",
                "turnAudioPaths": [
                    "videos/video-1/podcast/podcast-video-1-2026-05-21/audio/turns/0001-speaker-a.wav"
                ]
            },
            "durationSeconds": 42.0,
            "sizeBytes": 2048
        })
    }

    fn sample_snapshot() -> Value {
        let podcast = sample_podcast();
        json!({
            "videos": [{
                "id": "video-1",
                "title": "Design Review",
                "sourceKind": "youtube",
                "originalUri": "https://youtu.be/example",
                "libraryPath": "videos/video-1/video.mp4",
                "thumbnailPath": "videos/video-1/thumbnail/video-1-thumbnail.jpg",
                "importStatus": "ready",
                "createdAtIso": "2026-05-21T00:00:00.000Z"
            }],
            "ingestJobs": [],
            "transcriptJobs": [],
            "playlists": [{
                "id": "playlist-1",
                "title": "Launch videos",
                "videoIds": ["video-1"],
                "coverImagePath": "playlists/playlist-1/cover.png",
                "createdAtIso": "2026-05-21T00:03:00.000Z",
                "updatedAtIso": "2026-05-21T00:03:00.000Z"
            }],
            "transcriptsByVideoId": {
                "video-1": [{
                    "id": "segment-1",
                    "startSeconds": 0,
                    "text": "Transcript",
                    "sourceKind": "youtube-captions"
                }]
            },
            "summariesByVideoId": {
                "video-1": {
                    "id": "summary-video-1",
                    "videoId": "video-1",
                    "markdown": "# Summary",
                    "provider": "openai",
                    "sourceSegmentCount": 1,
                    "createdAtIso": "2026-05-21T00:01:00.000Z"
                }
            },
            "chatMessagesByVideoId": {
                "video-1": [{
                    "id": "chat-1",
                    "videoId": "video-1",
                    "role": "user",
                    "content": "Question",
                    "contextMode": "summary",
                    "sessionId": "default",
                    "createdAtIso": "2026-05-21T00:02:00.000Z"
                }]
            },
            "podcastsByVideoId": {
                "video-1": podcast.clone()
            },
            "podcastHistoryByVideoId": {
                "video-1": [podcast]
            }
        })
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

            Self { root }
        }

        fn create_dir(&self, relative: &str) -> PathBuf {
            let path = self.root.join(relative);
            fs::create_dir_all(&path).unwrap();
            path
        }

        fn write_file(&self, relative: &str, contents: &str) -> PathBuf {
            let path = self.root.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
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
