use serde_json::Value;

#[test]
fn tauri_config_uses_non_null_csp() {
    let config: Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid tauri config json");
    let security = &config["app"]["security"];
    let csp = security["csp"].as_str().expect("csp must be a string");

    assert!(csp.contains("default-src 'self'"));
    assert!(csp.contains("script-src 'self'"));
    assert!(csp.contains("img-src 'self' asset: http://asset.localhost data:"));
    assert!(csp.contains("media-src 'self' asset: http://asset.localhost data: blob:"));
    assert!(csp.contains("connect-src ipc: http://ipc.localhost"));
    assert!(!csp.contains("unsafe-eval"));
    assert!(!csp.contains("default-src *"));

    let asset_protocol = &security["assetProtocol"];
    assert_eq!(asset_protocol["enable"], true);
    assert_eq!(asset_protocol["scope"][0], "$APPDATA/library/**/*");
}

#[test]
fn tauri_config_uses_signed_github_release_updater() {
    let config: Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid tauri config json");
    let updater = &config["plugins"]["updater"];

    assert_eq!(
        config["bundle"]["createUpdaterArtifacts"], true,
        "release build must emit signed updater artifacts"
    );
    let pubkey = updater["pubkey"].as_str().expect("updater pubkey string");

    assert_ne!(
        pubkey,
        "OPENBRIEF_UPDATER_PUBLIC_KEY_REPLACE_BEFORE_RELEASE"
    );
    assert!(pubkey.starts_with("dW50cnVzdGVkIGNvbW1lbnQ6"));
    assert_eq!(updater["windows"]["installMode"], "passive");
    assert_eq!(
        updater["endpoints"][0],
        "https://github.com/tantara/openbrief/releases/latest/download/latest.json?download="
    );
    assert!(
        updater["endpoints"][0]
            .as_str()
            .expect("endpoint string")
            .starts_with("https://"),
        "production updater endpoints must use TLS"
    );
}

#[test]
fn tauri_main_window_uses_product_default_and_minimum_size() {
    let config: Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid tauri config json");
    let window = &config["app"]["windows"][0];

    assert_eq!(window["width"], 1280);
    assert_eq!(window["height"], 960);
    assert_eq!(window["minWidth"], 600);
    assert_eq!(window["minHeight"], 600);
}

#[test]
fn macos_bundle_uses_explicit_private_build_signing() {
    let config: Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid tauri config json");
    let macos = &config["bundle"]["macOS"];

    assert_eq!(
        macos["signingIdentity"], "-",
        "private MVP builds must still ad-hoc sign the macOS bundle"
    );
    assert_eq!(
        macos["hardenedRuntime"], false,
        "hardened runtime requires Developer ID signing and entitlements"
    );
    assert_eq!(
        macos["minimumSystemVersion"], "10.15",
        "whisper.cpp's C++ filesystem dependency requires macOS 10.15+"
    );
}

#[test]
fn default_capability_grants_only_minimal_platform_plugin_permissions() {
    let capability: Value = serde_json::from_str(include_str!("../capabilities/default.json"))
        .expect("valid default capability json");
    let permissions = capability["permissions"]
        .as_array()
        .expect("permissions array");
    let permission_strings = permissions
        .iter()
        .map(|permission| permission.as_str().expect("permission string"))
        .collect::<Vec<_>>();

    for required in [
        "core:window:allow-start-dragging",
        "dialog:allow-open",
        "dialog:allow-save",
        "os:default",
        "updater:allow-check",
        "updater:allow-download",
        "updater:allow-install",
    ] {
        assert!(permission_strings.contains(&required));
    }

    assert!(
        permission_strings
            .iter()
            .all(|permission| !permission.starts_with("notification:")),
        "notification permissions must be absent in the notification-free macOS build"
    );
    assert!(!permission_strings.contains(&"notification:default"));
    assert!(!permission_strings.contains(&"dialog:default"));
    assert!(!permission_strings.contains(&"updater:default"));
    assert!(!permission_strings.contains(&"os:allow-hostname"));
    assert!(!permission_strings.contains(&"updater:allow-download-and-install"));
}
