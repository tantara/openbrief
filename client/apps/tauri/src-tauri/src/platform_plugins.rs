use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlatformPluginContract {
    single_instance: SingleInstancePolicy,
    os_info: OsInfoPolicy,
    updater: UpdaterPolicy,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SingleInstancePolicy {
    registered_first: bool,
    focuses_existing_window: bool,
    emits_raw_cwd_to_renderer: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OsInfoPolicy {
    intended_use: &'static str,
    exposes_hostname: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterPolicy {
    trigger_policy: &'static str,
    requires_signed_artifacts: bool,
    endpoint: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SingleInstanceIntent {
    youtube_urls: Vec<String>,
    file_argument_count: usize,
}

#[tauri::command]
pub fn platform_plugin_contract() -> PlatformPluginContract {
    PlatformPluginContract {
        single_instance: SingleInstancePolicy {
            registered_first: true,
            focuses_existing_window: true,
            emits_raw_cwd_to_renderer: false,
        },
        os_info: OsInfoPolicy {
            intended_use: "platform-aware diagnostics and release support",
            exposes_hostname: false,
        },
        updater: UpdaterPolicy {
            trigger_policy: "explicit-user-action",
            requires_signed_artifacts: true,
            endpoint:
                "https://github.com/tantara/openbrief/releases/latest/download/latest.json?download=",
        },
    }
}

pub fn single_instance_intent_from_args(args: &[String]) -> SingleInstanceIntent {
    let youtube_urls = args
        .iter()
        .filter(|arg| is_youtube_url(arg))
        .cloned()
        .collect();
    let file_argument_count = args
        .iter()
        .filter(|arg| looks_like_file_argument(arg))
        .count();

    SingleInstanceIntent {
        youtube_urls,
        file_argument_count,
    }
}

fn is_youtube_url(value: &str) -> bool {
    value.starts_with("https://www.youtube.com/")
        || value.starts_with("https://youtube.com/")
        || value.starts_with("https://youtu.be/")
}

fn looks_like_file_argument(value: &str) -> bool {
    !value.starts_with('-')
        && !value.starts_with("http://")
        && !value.starts_with("https://")
        && value != "openbrief"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_minimal_platform_plugin_policy() {
        let contract = platform_plugin_contract();

        assert!(contract.single_instance.registered_first);
        assert!(contract.single_instance.focuses_existing_window);
        assert!(!contract.single_instance.emits_raw_cwd_to_renderer);
        assert!(!contract.os_info.exposes_hostname);
        assert_eq!(contract.updater.trigger_policy, "explicit-user-action");
        assert!(contract.updater.requires_signed_artifacts);
    }

    #[test]
    fn sanitizes_single_instance_intents_for_renderer_events() {
        let args = vec![
            "openbrief".to_string(),
            "--flag".to_string(),
            "https://youtu.be/demo123".to_string(),
            "/Users/me/Movies/private.mp4".to_string(),
        ];

        let intent = single_instance_intent_from_args(&args);

        assert_eq!(intent.youtube_urls, vec!["https://youtu.be/demo123"]);
        assert_eq!(intent.file_argument_count, 1);
    }
}
