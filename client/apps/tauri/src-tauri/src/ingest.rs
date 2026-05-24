use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalImportPlan {
    source_path: String,
    library_relative_path: String,
    temp_relative_path: String,
    copy_strategy: &'static str,
    import_status: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeIngestClassification {
    kind: &'static str,
    message: String,
    provider: Option<&'static str>,
}

#[tauri::command]
pub fn plan_local_file_import(source_path: String) -> LocalImportPlan {
    let file_name = file_name_from_path(&source_path);
    let asset_id = format!(
        "local-{}",
        sanitize_path_segment(&title_from_file_name(&file_name))
    );

    LocalImportPlan {
        source_path,
        library_relative_path: format!("videos/{asset_id}/{}", sanitize_path_segment(&file_name)),
        temp_relative_path: format!("job-temp/{asset_id}"),
        copy_strategy: "copy-into-library",
        import_status: "importing",
    }
}

#[tauri::command]
pub fn classify_youtube_ingest_url(url: String) -> YoutubeIngestClassification {
    let host = match host_from_url(&url) {
        Some(value) => value,
        None => {
            return YoutubeIngestClassification {
                kind: "unsupported-provider",
                message: "Supported video providers are YouTube, TikTok, Twitch, and Vimeo"
                    .to_string(),
                provider: None,
            };
        }
    };

    let provider = match provider_from_host(&host) {
        Some(value) => value,
        None => {
            return YoutubeIngestClassification {
                kind: "unsupported-provider",
                message: "Supported video providers are YouTube, TikTok, Twitch, and Vimeo"
                    .to_string(),
                provider: None,
            };
        }
    };

    if is_unsupported_collection_url(&url, &host, provider) {
        return YoutubeIngestClassification {
            kind: "unsupported-playlist-or-channel",
            message: "Playlist, channel, profile, and collection imports are not supported in v1"
                .to_string(),
            provider: Some(provider),
        };
    }

    if !is_single_video_url(&url, &host, provider) {
        return YoutubeIngestClassification {
            kind: "unsupported-playlist-or-channel",
            message: format!("Only single {provider} video URLs are supported in v1"),
            provider: Some(provider),
        };
    }

    YoutubeIngestClassification {
        kind: "single-video",
        message: format!("Single {provider} video import can use the helper scaffold"),
        provider: Some(provider),
    }
}

fn host_from_url(url: &str) -> Option<String> {
    let (_, after_scheme) = url.split_once("://")?;
    let authority = after_scheme.split(['/', '?', '#']).next()?;
    let host_port = authority.rsplit('@').next().unwrap_or(authority);
    let host = host_port.split(':').next().unwrap_or(host_port);
    let host = host.strip_prefix("www.").unwrap_or(host);
    let host = host.strip_prefix("m.").unwrap_or(host).to_ascii_lowercase();

    if host.is_empty() {
        None
    } else {
        Some(host)
    }
}

fn is_single_video_url(url: &str, host: &str, provider: &str) -> bool {
    let path = path_from_url(url);

    match provider {
        "youtube" => {
            (host == "youtu.be" && path.len() > 1)
                || (path == "/watch" && url.contains("v="))
                || path.starts_with("/shorts/")
                || path.starts_with("/embed/")
        }
        "tiktok" => {
            path.contains("/video/")
                || path.starts_with("/t/")
                || host == "vm.tiktok.com"
                || host == "vt.tiktok.com"
        }
        "twitch" => {
            path.starts_with("/videos/") || path.contains("/clip/") || host == "clips.twitch.tv"
        }
        "vimeo" => {
            path.trim_start_matches('/')
                .chars()
                .next()
                .map(|character| character.is_ascii_digit())
                .unwrap_or(false)
                || path.starts_with("/video/")
                || path.starts_with("/manage/videos/")
        }
        _ => false,
    }
}

fn provider_from_host(host: &str) -> Option<&'static str> {
    match host {
        "youtube.com" | "youtu.be" => Some("youtube"),
        "tiktok.com" | "vm.tiktok.com" | "vt.tiktok.com" => Some("tiktok"),
        "twitch.tv" | "clips.twitch.tv" => Some("twitch"),
        "vimeo.com" | "player.vimeo.com" => Some("vimeo"),
        _ => None,
    }
}

fn is_unsupported_collection_url(url: &str, host: &str, provider: &str) -> bool {
    let path = path_from_url(url);

    match provider {
        "youtube" => {
            url.contains("list=")
                || path.starts_with("/playlist")
                || path.starts_with("/channel/")
                || path.starts_with("/c/")
                || path.starts_with("/@")
        }
        "tiktok" => {
            path == "/"
                || (path.starts_with("/@") && !path.contains("/video/"))
                || path.starts_with("/tag/")
                || path.starts_with("/music/")
        }
        "twitch" => host == "twitch.tv" && path.matches('/').count() <= 1 && path != "/",
        "vimeo" => [
            "/channels/",
            "/album/",
            "/groups/",
            "/ondemand/",
            "/showcase/",
        ]
        .iter()
        .any(|prefix| path.starts_with(prefix)),
        _ => false,
    }
}

fn path_from_url(url: &str) -> String {
    let Some((_, after_scheme)) = url.split_once("://") else {
        return "/".to_string();
    };
    let after_authority = after_scheme
        .split_once('/')
        .map(|(_, path)| path)
        .unwrap_or("");
    let path = after_authority.split(['?', '#']).next().unwrap_or("");

    if path.is_empty() {
        "/".to_string()
    } else {
        format!("/{path}").trim_end_matches('/').to_string()
    }
}

fn file_name_from_path(path: &str) -> String {
    path.rsplit(['/', '\\'])
        .find(|segment| !segment.is_empty())
        .unwrap_or("video.mp4")
        .to_string()
}

fn sanitize_path_segment(value: &str) -> String {
    let mut output = String::new();
    let mut last_was_dash = false;

    for character in value.trim().chars() {
        let replacement = if character.is_ascii_alphanumeric()
            || character == '.'
            || character == '_'
            || character == '-'
        {
            character
        } else {
            '-'
        };

        if replacement == '-' {
            if !last_was_dash {
                output.push(replacement);
            }
            last_was_dash = true;
        } else {
            output.push(replacement);
            last_was_dash = false;
        }
    }

    let trimmed = output.trim_matches(['.', '-']).to_string();

    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed
    }
}

fn title_from_file_name(file_name: &str) -> String {
    match file_name.rfind('.') {
        Some(index) if index > 0 => file_name[..index].replace(['-', '_'], " "),
        _ => file_name.replace(['-', '_'], " "),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plans_local_imports_inside_app_managed_library() {
        let plan = plan_local_file_import("/Users/me/Movies/demo clip.mp4".to_string());

        assert_eq!(plan.copy_strategy, "copy-into-library");
        assert_eq!(plan.import_status, "importing");
        assert!(plan
            .library_relative_path
            .starts_with("videos/local-demo-clip/"));
        assert!(plan.library_relative_path.ends_with("/demo-clip.mp4"));
        assert!(plan.temp_relative_path.starts_with("job-temp/local-"));
    }

    #[test]
    fn rejects_playlists_channels_profiles_and_collections() {
        let playlist =
            classify_youtube_ingest_url("https://www.youtube.com/watch?v=abc&list=def".to_string());
        let channel =
            classify_youtube_ingest_url("https://www.youtube.com/@samplechannel".to_string());
        let tiktok_profile =
            classify_youtube_ingest_url("https://www.tiktok.com/@samplecreator".to_string());
        let twitch_channel =
            classify_youtube_ingest_url("https://www.twitch.tv/openbrief".to_string());
        let vimeo_channel =
            classify_youtube_ingest_url("https://vimeo.com/channels/samplechannel".to_string());

        assert_eq!(playlist.kind, "unsupported-playlist-or-channel");
        assert_eq!(channel.kind, "unsupported-playlist-or-channel");
        assert_eq!(tiktok_profile.kind, "unsupported-playlist-or-channel");
        assert_eq!(twitch_channel.kind, "unsupported-playlist-or-channel");
        assert_eq!(vimeo_channel.kind, "unsupported-playlist-or-channel");
        assert_eq!(
            playlist.message,
            "Playlist, channel, profile, and collection imports are not supported in v1"
        );
    }

    #[test]
    fn rejects_unsupported_and_spoofed_hosts() {
        let unsupported =
            classify_youtube_ingest_url("https://example.com/watch?v=abc".to_string());
        let spoofed =
            classify_youtube_ingest_url("https://youtube.com.evil/watch?v=abc".to_string());
        let containing =
            classify_youtube_ingest_url("https://notyoutube.com/watch?v=abc".to_string());

        assert_eq!(unsupported.kind, "unsupported-provider");
        assert_eq!(spoofed.kind, "unsupported-provider");
        assert_eq!(containing.kind, "unsupported-provider");
    }

    #[test]
    fn accepts_single_video_urls_for_supported_providers() {
        for (url, provider) in [
            ("https://youtu.be/example", "youtube"),
            (
                "https://www.tiktok.com/@samplecreator/video/7320000000000000000",
                "tiktok",
            ),
            ("https://www.twitch.tv/videos/123456789", "twitch"),
            ("https://vimeo.com/123456789", "vimeo"),
        ] {
            let classification = classify_youtube_ingest_url(url.to_string());

            assert_eq!(classification.kind, "single-video");
            assert_eq!(classification.provider, Some(provider));
        }
    }
}
