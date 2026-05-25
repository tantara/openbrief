use serde::Serialize;
use std::{
    fs,
    io::ErrorKind,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsageItem {
    category: &'static str,
    label: &'static str,
    size_bytes: u64,
    percentage: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsageSnapshot {
    total_bytes: u64,
    items: Vec<StorageUsageItem>,
    measured_at_iso: String,
}

#[tauri::command]
pub async fn storage_usage_snapshot<R: Runtime>(
    app: AppHandle<R>,
) -> Result<StorageUsageSnapshot, String> {
    let workspace_root = crate::workspace::workspace_root_for_app(&app)?;
    let shared_models_root = crate::workspace::models_dir_for_app(&app)?;

    tauri::async_runtime::spawn_blocking(move || {
        storage_usage_snapshot_for_workspace(&workspace_root, &shared_models_root)
    })
    .await
    .map_err(|error| format!("storage_usage_task_join_failed:{error}"))?
}

fn storage_usage_snapshot_for_workspace(
    workspace_root: &Path,
    shared_models_root: &Path,
) -> Result<StorageUsageSnapshot, String> {
    let library_root = workspace_root.join("library");
    let database = database_size(&library_root)?;
    let video = recursive_size(&library_root.join("videos"))?;
    let audio = recursive_size(&library_root.join("audios"))?;
    let pdf = recursive_size(&library_root.join("pdfs"))?;
    let csv = recursive_size(&library_root.join("csvs"))?;
    let model_checkpoint = recursive_size(shared_models_root)?;

    Ok(storage_usage_snapshot_from_sizes(
        database,
        video,
        audio,
        pdf,
        csv,
        model_checkpoint,
        measured_at_iso(),
    ))
}

fn storage_usage_snapshot_from_sizes(
    database: u64,
    video: u64,
    audio: u64,
    pdf: u64,
    csv: u64,
    model_checkpoint: u64,
    measured_at_iso: String,
) -> StorageUsageSnapshot {
    let total_bytes = database + video + audio + pdf + csv + model_checkpoint;
    let mut items = vec![
        storage_item("database", "Database", database),
        storage_item("video", "Video", video),
        storage_item("audio", "Audio", audio),
        storage_item("pdf", "PDF", pdf),
        storage_item("csv", "CSV", csv),
        storage_item("model-checkpoint", "Model checkpoint", model_checkpoint),
    ];

    for item in &mut items {
        item.percentage = if total_bytes == 0 {
            0.0
        } else {
            ((item.size_bytes as f64 / total_bytes as f64) * 1000.0).round() / 10.0
        };
    }

    StorageUsageSnapshot {
        total_bytes,
        items,
        measured_at_iso,
    }
}

fn storage_item(category: &'static str, label: &'static str, size_bytes: u64) -> StorageUsageItem {
    StorageUsageItem {
        category,
        label,
        size_bytes,
        percentage: 0.0,
    }
}

fn database_size(library_root: &Path) -> Result<u64, String> {
    [
        "openbrief.sqlite3",
        "openbrief.sqlite3-wal",
        "openbrief.sqlite3-shm",
        "openbrief.sqlite3-journal",
    ]
    .iter()
    .try_fold(0, |total, file_name| {
        file_size_without_following_symlink(&library_root.join(file_name)).map(|size| total + size)
    })
}

fn recursive_size(root: &Path) -> Result<u64, String> {
    let metadata = match fs::symlink_metadata(root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(format!("storage_metadata_failed:{error}")),
    };

    if metadata.file_type().is_symlink() {
        return Ok(0);
    }
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    if !metadata.is_dir() {
        return Ok(0);
    }

    let mut total = 0;
    for entry in fs::read_dir(root).map_err(|error| format!("storage_read_dir_failed:{error}"))? {
        let entry = entry.map_err(|error| format!("storage_dir_entry_failed:{error}"))?;
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(error) => return Err(format!("storage_metadata_failed:{error}")),
        };

        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            total += recursive_size(&path)?;
        } else if metadata.is_file() {
            total += metadata.len();
        }
    }

    Ok(total)
}

fn file_size_without_following_symlink(path: &Path) -> Result<u64, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(format!("storage_metadata_failed:{error}")),
    };

    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Ok(0);
    }

    Ok(metadata.len())
}

fn measured_at_iso() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = duration.as_secs() as i64;
    let milliseconds = duration.subsec_millis();
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{milliseconds:03}Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i32, u32, u32) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };

    (year as i32, month as u32, day as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env, fs,
        io::Write,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn computes_storage_snapshot_from_known_roots() {
        let root = create_temp_root("storage-snapshot");
        let shared = create_temp_root("storage-shared");
        write_bytes(&root.join("library/openbrief.sqlite3"), 10);
        write_bytes(&root.join("library/openbrief.sqlite3-wal"), 5);
        write_bytes(&root.join("library/videos/video-1/source.mp4"), 80);
        write_bytes(&root.join("library/videos/video-1/chat/tts/audio.wav"), 20);
        write_bytes(&root.join("library/audios/audio-1/source.mp3"), 30);
        write_bytes(&root.join("library/pdfs/pdf-1/source.pdf"), 15);
        write_bytes(&root.join("library/csvs/csv-1/source.csv"), 12);
        write_bytes(&shared.join("models/whisper/ggml-small.bin"), 40);
        write_bytes(
            &shared.join("models/supertonic/runtime/python/site-packages/module.py"),
            10,
        );

        let snapshot = storage_usage_snapshot_for_workspace(&root, &shared.join("models")).unwrap();

        assert_eq!(snapshot.total_bytes, 222);
        assert_eq!(snapshot.items[0].size_bytes, 15);
        assert_eq!(snapshot.items[1].size_bytes, 100);
        assert_eq!(snapshot.items[2].size_bytes, 30);
        assert_eq!(snapshot.items[3].size_bytes, 15);
        assert_eq!(snapshot.items[4].size_bytes, 12);
        assert_eq!(snapshot.items[5].size_bytes, 50);

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(shared);
    }

    #[test]
    fn missing_roots_return_zero_percentages() {
        let snapshot = storage_usage_snapshot_from_sizes(
            0,
            0,
            0,
            0,
            0,
            0,
            "2026-05-24T00:00:00.000Z".to_string(),
        );

        assert_eq!(snapshot.total_bytes, 0);
        assert_eq!(snapshot.items.len(), 6);
        assert!(snapshot.items.iter().all(|item| item.percentage == 0.0));
    }

    #[test]
    fn computes_percentages_from_category_total() {
        let snapshot = storage_usage_snapshot_from_sizes(
            1,
            2,
            3,
            4,
            5,
            10,
            "2026-05-24T00:00:00.000Z".to_string(),
        );

        assert_eq!(snapshot.total_bytes, 25);
        assert_eq!(snapshot.items[0].percentage, 4.0);
        assert_eq!(snapshot.items[1].percentage, 8.0);
        assert_eq!(snapshot.items[2].percentage, 12.0);
        assert_eq!(snapshot.items[3].percentage, 16.0);
        assert_eq!(snapshot.items[4].percentage, 20.0);
        assert_eq!(snapshot.items[5].percentage, 40.0);
    }

    #[test]
    fn skips_symlink_targets_when_measuring() {
        let root = create_temp_root("storage-symlink");
        write_bytes(&root.join("library/videos/video-1/source.mp4"), 10);
        write_bytes(&root.join("outside.bin"), 500);

        if create_file_symlink(
            &root.join("outside.bin"),
            &root.join("library/videos/video-1/link.bin"),
        )
        .is_err()
        {
            let _ = fs::remove_dir_all(root);
            return;
        }

        let size = recursive_size(&root.join("library/videos")).unwrap();

        assert_eq!(size, 10);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn formats_unix_epoch_as_iso() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(20_237), (2025, 5, 29));
    }

    fn create_temp_root(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = env::temp_dir().join(format!("openbrief-{name}-{nanos}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn write_bytes(path: &Path, len: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut file = fs::File::create(path).unwrap();
        file.write_all(&vec![b'x'; len]).unwrap();
    }

    #[cfg(unix)]
    fn create_file_symlink(source: &Path, link: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(source, link)
    }

    #[cfg(windows)]
    fn create_file_symlink(source: &Path, link: &Path) -> std::io::Result<()> {
        std::os::windows::fs::symlink_file(source, link)
    }
}
