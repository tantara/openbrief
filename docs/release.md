# Release Builds

Run commands from the repository root unless a command changes directories.

## macOS arm64

Load local release secrets first:

```bash
set -a
source .env.release
set +a
```

Build the local macOS arm64 release bundle:

```bash
cd client/apps/tauri

pnpm run prepare:media-assets -- --target aarch64-apple-darwin
pnpm run build:helper-sidecar -- --target aarch64-apple-darwin
pnpm tauri build --target aarch64-apple-darwin \
  --config '{"bundle":{"createUpdaterArtifacts":false,"macOS":{"hardenedRuntime":true}}}'
```

The notarized release path also signs bundled media tools and notarizes/staples the generated DMG. Prefer the GitHub release workflow for production notarized macOS artifacts:

```bash
gh workflow run "Release Build" \
  --ref main \
  -f platform=macos-arm64 \
  -f draft=true \
  -f upload_release=true \
  -f release_tag=v0.1.0-notarized-test \
  -f notarize_macos=true
```

## macOS Intel

Run on an Intel macOS runner or machine:

```bash
set -a
source .env.release
set +a

cd client/apps/tauri

pnpm run prepare:media-assets -- --target x86_64-apple-darwin
pnpm run build:helper-sidecar -- --target x86_64-apple-darwin
pnpm tauri build --target x86_64-apple-darwin \
  --config '{"bundle":{"createUpdaterArtifacts":false,"macOS":{"hardenedRuntime":true}}}'
```

## Linux x64

Install Tauri Linux system dependencies first, then build:

```bash
cd client/apps/tauri

pnpm run prepare:media-assets -- --target x86_64-unknown-linux-gnu
pnpm run build:helper-sidecar -- --target x86_64-unknown-linux-gnu
pnpm tauri build --target x86_64-unknown-linux-gnu \
  --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

The GitHub workflow uses Ubuntu 22.04 and installs:

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libasound2-dev
```

## Windows x64

Run on Windows:

```powershell
cd client/apps/tauri

pnpm run prepare:media-assets -- --target x86_64-pc-windows-msvc
pnpm run build:helper-sidecar -- --target x86_64-pc-windows-msvc
pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis --config '{\"bundle\":{\"createUpdaterArtifacts\":false}}'
```

## All Platforms In GitHub Actions

```bash
gh workflow run "Release Build" \
  --ref main \
  -f platform=all \
  -f draft=true \
  -f upload_release=true \
  -f release_tag=v0.1.0-release-test \
  -f notarize_macos=true
```
