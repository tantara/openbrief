fn main() {
    if std::env::var("OPENBRIEF_BUILDING_HELPER_SIDECAR").as_deref() == Ok("1") {
        return;
    }

    ensure_sidecar_contract();
    ensure_media_tool_contract();
    tauri_build::build()
}

const HELPER_BASE_NAME: &str = "openbrief-helper";
const SUPERTONIC_BASE_NAME: &str = "openbrief-supertonic";
const VOICEBOX_BASE_NAME: &str = "openbrief-voicebox";
const FLUIDAUDIO_BASE_NAME: &str = "openbrief-fluidaudio";
const MEDIA_TOOL_NAMES: [&str; 3] = ["yt-dlp", "ffmpeg", "ffprobe"];
const PLACEHOLDER_MARKER: &str = "OpenBrief dev sidecar placeholder";
const MIN_REAL_BINARY_SIZE_BYTES: u64 = 10_000;

fn ensure_sidecar_contract() {
    if std::env::var("OPENBRIEF_BUILDING_HELPER_SIDECAR").as_deref() == Ok("1") {
        return;
    }

    let profile = std::env::var("PROFILE").unwrap_or_default();
    let target = build_target_triple();
    let helper_sidecar_path = target_named_sidecar_path(HELPER_BASE_NAME, &target);
    let supertonic_sidecar_path = target_named_sidecar_path(SUPERTONIC_BASE_NAME, &target);
    let voicebox_sidecar_path = target_named_sidecar_path(VOICEBOX_BASE_NAME, &target);

    if profile == "debug" {
        ensure_debug_sidecar_placeholder(&helper_sidecar_path);
        ensure_debug_sidecar_placeholder(&supertonic_sidecar_path);
        ensure_debug_sidecar_placeholder(&voicebox_sidecar_path);
    } else {
        enforce_release_sidecar(&helper_sidecar_path, "helper");
        enforce_release_sidecar(&supertonic_sidecar_path, "Supertonic");
        enforce_release_sidecar(&voicebox_sidecar_path, "Voicebox");
        enforce_release_fluidaudio_sidecar_if_needed();
    }
}

fn enforce_release_fluidaudio_sidecar_if_needed() {
    let target = build_target_triple();
    if target != "aarch64-apple-darwin" {
        return;
    }

    enforce_release_sidecar(
        &target_named_sidecar_path(FLUIDAUDIO_BASE_NAME, &target),
        "FluidAudio",
    );
}

fn target_named_sidecar_path(base_name: &str, target: &str) -> std::path::PathBuf {
    let manifest_dir = match std::env::var("CARGO_MANIFEST_DIR") {
        Ok(value) => value,
        Err(_) => return std::path::PathBuf::from("binaries").join(base_name),
    };
    let suffix = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    std::path::Path::new(&manifest_dir)
        .join("binaries")
        .join(format!("{base_name}-{target}{suffix}"))
}

fn ensure_media_tool_contract() {
    if std::env::var("OPENBRIEF_BUILDING_HELPER_SIDECAR").as_deref() == Ok("1") {
        return;
    }

    let profile = std::env::var("PROFILE").unwrap_or_default();
    if profile == "debug" {
        return;
    }

    let target = build_target_triple();
    let media_tools_dir = target_media_tools_dir(&target);

    for tool_name in MEDIA_TOOL_NAMES {
        enforce_release_media_tool(&media_tools_dir.join(executable_name(tool_name, &target)));
    }

    enforce_release_media_tool_manifest(&media_tools_dir.join("manifest.json"));
}

fn build_target_triple() -> String {
    std::env::var("TARGET")
        .or_else(|_| std::env::var("HOST"))
        .unwrap_or_else(|_| "aarch64-apple-darwin".to_string())
}

fn target_media_tools_dir(target: &str) -> std::path::PathBuf {
    let manifest_dir = match std::env::var("CARGO_MANIFEST_DIR") {
        Ok(value) => value,
        Err(_) => {
            return std::path::PathBuf::from("resources")
                .join("media-tools")
                .join(target)
        }
    };

    std::path::Path::new(&manifest_dir)
        .join("resources")
        .join("media-tools")
        .join(target)
}

fn executable_name(tool_name: &str, target: &str) -> String {
    if target.contains("windows") {
        format!("{tool_name}.exe")
    } else {
        tool_name.to_string()
    }
}

fn enforce_release_media_tool(binary_path: &std::path::Path) {
    let metadata = std::fs::metadata(binary_path).unwrap_or_else(|_| {
        panic!(
            "release build requires prepared media tool at {}; run npm run prepare:media-assets first",
            binary_path.display()
        )
    });

    if metadata.len() < MIN_REAL_BINARY_SIZE_BYTES {
        panic!(
            "release build refuses to bundle an invalid media tool at {}",
            binary_path.display()
        );
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        if metadata.permissions().mode() & 0o111 == 0 {
            panic!(
                "release build requires executable media tool permissions at {}",
                binary_path.display()
            );
        }
    }
}

fn enforce_release_media_tool_manifest(manifest_path: &std::path::Path) {
    let contents = std::fs::read_to_string(manifest_path).unwrap_or_else(|_| {
        panic!(
            "release build requires generated media tool manifest at {}; run npm run prepare:media-assets first",
            manifest_path.display()
        )
    });

    for tool_name in MEDIA_TOOL_NAMES {
        if !contents.contains(&format!("\"name\": \"{tool_name}\"")) {
            panic!(
                "release media tool manifest at {} is missing {tool_name}",
                manifest_path.display()
            );
        }
    }
}

fn ensure_debug_sidecar_placeholder(binary_path: &std::path::Path) {
    if binary_path.exists() {
        return;
    }

    let binaries_dir = match binary_path.parent() {
        Some(value) => value,
        None => return,
    };

    if std::fs::create_dir_all(&binaries_dir).is_err() {
        return;
    }

    let is_windows = binary_path
        .extension()
        .is_some_and(|extension| extension == "exe");
    let body = if is_windows {
        "@echo off\r\necho OpenBrief dev sidecar placeholder. Build the real helper before packaging.\r\nexit /b 1\r\n".to_string()
    } else {
        "#!/bin/sh\nprintf '%s\\n' 'OpenBrief dev sidecar placeholder. Build the real helper before packaging.'\nexit 1\n".to_string()
    };

    if std::fs::write(binary_path, body).is_ok() && !is_windows {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            if let Ok(metadata) = std::fs::metadata(binary_path) {
                let mut permissions = metadata.permissions();
                permissions.set_mode(0o755);
                let _ = std::fs::set_permissions(&binary_path, permissions);
            }
        }
    }
}

fn enforce_release_sidecar(binary_path: &std::path::Path, sidecar_name: &str) {
    let metadata = std::fs::metadata(binary_path).unwrap_or_else(|_| {
        panic!(
            "release build requires a real OpenBrief {sidecar_name} sidecar at {}",
            binary_path.display()
        )
    });

    if metadata.len() < MIN_REAL_BINARY_SIZE_BYTES {
        panic!(
            "release build refuses to bundle a dev {sidecar_name} placeholder at {}",
            binary_path.display()
        );
    }

    if let Ok(contents) = std::fs::read_to_string(binary_path) {
        if contents.contains(PLACEHOLDER_MARKER) {
            panic!(
                "release build refuses to bundle a dev {sidecar_name} placeholder at {}",
                binary_path.display()
            );
        }
    }
}
