# OpenBrief Helper Sidecar Binaries

`tauri.conf.json` registers `binaries/openbrief-helper` as a Tauri sidecar.
Tauri resolves that base name to `openbrief-helper-<target-triple>` and adds
`.exe` on Windows.

Debug Rust/Tauri builds create an ignored placeholder automatically when the real
helper is absent. Release builds refuse to bundle that placeholder and require a
real helper binary over the placeholder size threshold. Local development can
also run:

```sh
npm run setup:dev-sidecars
```

That command builds the helper sidecar in debug mode and copies it to the
current host target sidecar name so the dev app and helper protocol stay in
sync.
