# FluidAudio Sidecar Integration Plan

## Target Result

Integrate FluidAudio into the OpenBrief Tauri app as a macOS Apple Silicon-only local STT path. When the user is on macOS arm64 and the requested transcription language is supported by the chosen FluidAudio Parakeet v3 path, OpenBrief should use Parakeet v3 by default. All other cases must continue to use the existing Whisper flow.

Implementation is now started in the Tauri app. Do not vendor the cloned `FluidAudio/` or `voicetypr/` reference repositories into product code.

Current implementation status:

- Swift sidecar: `client/apps/tauri/src-tauri/sidecars/fluidaudio-swift`, pinned to FluidAudio `0.14.7`.
- Tauri sidecar config: macOS-only `openbrief-fluidaudio` external binary, with build scripts that produce a real `aarch64-apple-darwin` binary and do not create unsupported-target placeholders.
- Rust routing: `transcribe_audio` routes eligible macOS Apple Silicon + macOS 14+ supported-language jobs to Parakeet v3, otherwise leaves the existing Whisper helper path intact.
- Model storage: Parakeet v3 uses `app-data/models/fluidaudio/parakeet-tdt-0.6b-v3`; Whisper keeps the existing flat `ggml-*.bin` files.
- Timestamp output: pinned FluidAudio `0.14.7` exposes Parakeet v3 `ASRResult.tokenTimings`; the Swift sidecar maps those into OpenBrief's existing `segments[].startSeconds`, `segments[].endSeconds`, and `segments[].words[].startSeconds/endSeconds` format.
- UI/catalog: Parakeet appears as the recommended STT model only when the Rust target/runtime supports the FluidAudio sidecar.
- Benchmark hook: `cd client/apps/tauri && pnpm benchmark:stt -- --models-dir <app-data-models>` compares `docs/assets/openbrief_mission.wav` across Whisper Small and Parakeet v3 when both checkpoints are already present.

## Current Anchors

- OpenBrief is a Tauri v2 app under `client/apps/tauri`.
- Tauri currently bundles one external sidecar: `binaries/openbrief-helper` in `client/apps/tauri/src-tauri/tauri.conf.json`.
- The existing helper command contract exposes `transcribe_audio` with `audioPath`, `modelPath`, `outputPath`, and optional `language` in `client/apps/tauri/src/domain/helper-protocol.ts`.
- The renderer transcript pipeline extracts audio first, then calls `transcribe_audio` in `client/apps/tauri/src/services/transcriptService.ts`.
- The Rust helper-sidecar currently implements `transcribe_audio` with `transcribe-rs` plus `whisper.cpp` in `client/apps/tauri/src-tauri/src/helper_sidecar.rs`.
- Whisper models are cataloged and downloaded by `client/apps/tauri/src-tauri/src/stt_models.rs` into Tauri `app_data_dir()/models`, surfaced through `client/apps/tauri/src/services/settingsService.ts`, `client/apps/tauri/src/services/setupService.ts`, `client/apps/tauri/src/features/setup/SetupDialog.tsx`, and `client/apps/tauri/src/features/settings/SettingsView.tsx`.
- FluidAudio current README shows Swift Package Manager install from `FluidInference/FluidAudio.git` at `0.12.4`, with Parakeet TDT v3 and Apple Neural Engine positioning.
- VoiceTypr is a useful Tauri reference for a Swift sidecar using FluidAudio, but it pins older FluidAudio `0.6.1` and still contains Parakeet v2 code. Treat it as a structural reference, not as a dependency/version source.

## Product Rules

1. FluidAudio is an acceleration/default path, not a removal of Whisper.
2. The renderer never decides platform authority. Rust owns platform, architecture, filesystem, sidecar, and model-checkpoint decisions.
3. Parakeet v3 is the only user-facing FluidAudio ASR model for this pass. Do not add Parakeet v2.
4. Keep the FluidAudio sidecar protocol and model catalog model-family aware so Qwen3 ASR can be added in a later pass without another storage/protocol rewrite.
5. Use FluidAudio only when all gates pass:
   - target OS is macOS,
   - architecture is `aarch64` / Apple Silicon,
   - FluidAudio sidecar is present and healthy,
   - requested language is in the approved Parakeet v3 allowlist,
   - local audio is available as the existing extracted 16 kHz mono WAV.
6. If any gate fails, fall back to Whisper without user intervention.
7. UI must show why FluidAudio is available, unavailable, or bypassed. Avoid implying it is supported on Intel macOS, Windows, or Linux.

## Language Policy

Create a single source of truth for FluidAudio language support in Rust and mirror only display-safe metadata to the renderer.

Initial policy:

- Use the confirmed Parakeet v3 language list below.
- Normalize app language codes before routing, for example `en-US -> en` and `pt-BR -> pt`.
- Use Parakeet v3 only for approved codes on macOS Apple Silicon.
- Keep Japanese, Chinese, Korean, Hindi, Arabic, and every other non-listed language on Whisper unless a separate explicit FluidAudio model plan is written.
- For `"auto"` or missing language, allow FluidAudio only if the user has not explicitly selected an unsupported language. If confidence in auto-routing is weak, route auto to Whisper for the first release.

Confirmed Parakeet v3 allowlist:

```text
bg, hr, cs, da, nl, en, et, fi, fr, de, el, hu, it, lv, lt, mt, pl, pt, ro, sk, sl, es, sv, ru, uk
```

Display names:

```text
Bulgarian (bg), Croatian (hr), Czech (cs), Danish (da), Dutch (nl), English (en), Estonian (et), Finnish (fi), French (fr), German (de), Greek (el), Hungarian (hu), Italian (it), Latvian (lv), Lithuanian (lt), Maltese (mt), Polish (pl), Portuguese (pt), Romanian (ro), Slovak (sk), Slovenian (sl), Spanish (es), Swedish (sv), Russian (ru), Ukrainian (uk)
```

## Checkpoint Storage

Use one Rust-owned local STT model root for both Whisper and FluidAudio:

```text
Tauri app_data_dir()/models
```

The renderer should continue seeing the storage label as `app-data/models`, not a raw filesystem path. On macOS this resolves under the app's Application Support location for `dev.tantara.openbrief`.

Recommended layout:

```text
models/
  ggml-small.bin
  ggml-base.bin
  fluidaudio/
    parakeet-tdt-0.6b-v3/
      ... FluidAudio/CoreML checkpoint files ...
    qwen3-asr-0.6b/
      f32/
        ... future Qwen3-ASR f32 checkpoint files ...
      int8/
        ... future Qwen3-ASR int8 checkpoint files ...
```

Implementation rules:

- Keep existing flat Whisper filenames working for backward compatibility.
- Put Parakeet v3 under `models/fluidaudio/parakeet-tdt-0.6b-v3/`.
- Reserve `models/fluidaudio/qwen3-asr-0.6b/{f32,int8}/` for future Qwen3 ASR support.
- Rust creates and canonicalizes the model root, then passes the FluidAudio model directory to the Swift sidecar.
- The Swift sidecar must use FluidAudio's custom directory loading/downloading APIs, for example `AsrModels.download(to: ..., version: .v3)` / `downloadAndLoad(to: ..., version: .v3)`, instead of FluidAudio's default cache.
- All downloads still require user confirmation and should emit the existing STT model download progress event shape.
- Model catalog status should derive `downloaded` for Parakeet v3 from that directory, not from FluidAudio's default cache.

## Future FluidAudio Models

Parakeet v3 remains the default and only user-facing FluidAudio model for the first integration. The design should still account for Qwen3 ASR as the next FluidAudio model family.

Showcase findings from cloned FluidAudio Showcase repos:

- `pasrom/meeting-transcriber` has a real `Qwen3AsrEngine` using FluidAudio `Qwen3AsrManager`, gated to macOS 15+, with chunking into `Qwen3AsrConfig.maxAudioSeconds` windows and plain-text output mapped to synthetic timestamp segments.
- `pHequals7/muesli` has a `Qwen3AsrTranscriber` using `Qwen3AsrModels.download(variant: .int8)`, `Qwen3AsrManager.loadModels(from:)`, a warmup inference, and text-only transcription.
- `yazinsai/OpenOats` has a `Qwen3Backend` that treats Qwen3 as a selectable local transcription model, uses `Qwen3AsrModels.modelsExist`, supports explicit language hints, and migrates downloads into an app-owned model store.
- `dokterbob/macos-speech-server` has a `Qwen3STTService` using FluidAudio `Qwen3AsrManager`, `Qwen3AsrModels.download(variant:)`, VAD segmentation, explicit language hints, and Qwen3-specific config.
- `altic-dev/Fluid-oss` has Qwen3 model catalog/UI metadata, but current runtime paths mark Qwen preview disabled and route legacy Qwen requests back to Parakeet. Treat this as useful evidence for gating, not as an active Qwen runtime reference.

Qwen3 ASR planning constraints:

- Model id: `qwen3-asr-0.6b`.
- CoreML repo: `FluidInference/qwen3-asr-0.6b-coreml`.
- FluidAudio API surface: `Qwen3AsrModels`, `Qwen3AsrManager`, `Qwen3AsrConfig.Language`, `Qwen3AsrVariant`.
- Variants: `f32` and `int8`. FluidAudio documents `f32` as about 1.75 GB and faster on Apple Silicon; `int8` is about 900 MB with lower RAM but can be slower because the autoregressive decoder dequantizes repeatedly.
- Platform gate: macOS 15+ and Apple Silicon. Qwen3 uses CoreML stateful decoder APIs.
- Language behavior: Qwen3 supports 30 languages and can auto-detect, but should accept explicit language hints when the app knows the language.
- Output shape: references generally return plain text without timestamps. Plan for synthetic whole-audio segments or chunk-derived segment timestamps unless FluidAudio exposes stable timing.
- Audio shape: 16 kHz mono Float32 samples. Long audio needs chunking because Qwen3 has a max audio window, commonly treated as 30 seconds.

Future Qwen3 language list from FluidAudio docs:

```text
zh, en, yue, ja, ko, vi, th, id, ms, hi, ar, tr, ru, de, fr, es, pt, it, nl, pl, sv, da, fi, cs, fil, fa, el, hu, mk, ro
```

Design requirements to preserve now:

- Keep `modelId` separate from `engine`; do not encode all FluidAudio behavior as `"fluidaudio" == Parakeet`.
- Add sidecar commands that accept `{ engine: "fluidaudio", modelId, variant?, language? }`.
- Keep download/list/status commands model-generic so Parakeet v3 and Qwen3 use the same UI/catalog machinery.
- Let routing prefer Parakeet v3 for supported languages in the first pass, with Whisper fallback. Qwen3 should be opt-in/beta in a later pass, not the default replacement.
- Benchmark harness should be extensible from Parakeet v3 vs Whisper Small to Parakeet v3 vs Qwen3 vs Whisper Small.

## Architecture

### Recommended Shape

Add a second native sidecar for FluidAudio and keep the existing Rust helper sidecar for media tools and Whisper.

```text
renderer transcript pipeline
  -> run_helper_command(transcribe_audio, enginePreference: "auto")
    -> Rust Tauri boundary selects STT engine
      -> FluidAudio Swift sidecar for eligible macOS arm64 + supported language
      -> existing openbrief-helper Whisper path otherwise
```

Keep transcript source kind as `local-stt` for now. If users need to compare engines later, add engine metadata to transcript artifacts instead of splitting `TranscriptSourceKind` immediately.

### Why Route In Rust Instead Of Renderer

- The renderer already sends the same `transcribe_audio` operation and can remain mostly engine-agnostic.
- Rust can validate macOS arm64, sidecar existence, app-data paths, and fallback behavior without exposing authority-bearing paths.
- The current helper process already handles Whisper and media tools. FluidAudio is platform-specific Swift, so it should not be compiled into the cross-platform Rust helper.

## Implementation Phases

### Phase 1: Pin Runtime Contract

Files:

- `client/apps/tauri/src/domain/helper-protocol.ts`
- `client/apps/tauri/src/domain/transcript.ts`
- `client/apps/tauri/src/services/transcriptService.ts`
- `client/apps/tauri/src/domain/helper-protocol.test.ts`
- `client/apps/tauri/src/services/transcriptService.test.ts`

Steps:

1. Extend `TranscribeAudioCommand` with optional fields:
   - `enginePreference?: "auto" | "whisper" | "fluidaudio"`
   - `language?: string`
   - `modelPath?: string`
   - `requestedModelId?: string`
2. Keep `modelPath` required only when Rust selects Whisper.
3. Default existing calls to `enginePreference: "auto"` and preserve current `whisperModelPath` behavior for fallback.
4. Extend helper results with optional metadata:
   - `engine?: "whisper" | "fluidaudio"`
   - `modelId?: string`
   - `variant?: string`
   - `language?: string`
   - `fallbackReason?: string`
5. Keep existing tests passing for Whisper-only behavior.
6. Add tests that `auto` preserves the existing command shape unless the platform catalog says FluidAudio is eligible.

Acceptance criteria:

- Existing local STT tests still pass unchanged or with intentionally updated expectations.
- A transcript produced by either engine remains consumable by summary/chat/export code.

### Phase 2: Add Rust Engine Router

Files:

- `client/apps/tauri/src-tauri/src/helper.rs`
- new `client/apps/tauri/src-tauri/src/fluidaudio.rs`
- `client/apps/tauri/src-tauri/src/lib.rs`
- `client/apps/tauri/src-tauri/tests/config_security.rs`

Steps:

1. Add a Rust module that answers:
   - `fluid_audio_runtime_status`
   - `is_fluidaudio_supported_platform`
   - `is_fluidaudio_supported_language`
   - `select_stt_engine`
2. In `run_helper_command`, special-case `transcribe_audio`:
   - Parse command.
   - If engine preference is `whisper`, keep current helper path.
   - If preference is `fluidaudio` or `auto`, evaluate gates.
   - On eligible `auto`, run FluidAudio sidecar.
   - On ineligible `auto`, rewrite to Whisper and call existing helper.
   - On ineligible explicit `fluidaudio`, return a clear unsupported error.
3. Emit the same `openbrief://helper-event` progress event shape for FluidAudio:
   - starting STT
   - loading Parakeet v3
   - transcribing extracted audio
   - writing transcript
4. Keep the unified `app_data_dir()/models` checkpoint root under Rust control.
5. Add structured fallback reasons:
   - `unsupported-platform`
   - `unsupported-architecture`
   - `unsupported-language`
   - `sidecar-missing`
   - `sidecar-health-failed`
   - `fluidaudio-transcription-failed`

Acceptance criteria:

- Non-macOS and Intel macOS always route to Whisper.
- Unsupported languages always route to Whisper in `auto`.
- Explicit FluidAudio requests fail with actionable errors when gates fail.
- Helper path checks still reject absolute and parent-traversal paths.

### Phase 3: Build The Swift Sidecar

Files:

- new `client/apps/tauri/src-tauri/sidecars/fluidaudio-swift/Package.swift`
- new `client/apps/tauri/src-tauri/sidecars/fluidaudio-swift/Sources/OpenBriefFluidAudio/main.swift`
- new or updated sidecar build scripts under `client/apps/tauri/scripts/`
- `client/apps/tauri/src-tauri/build.rs`
- `client/apps/tauri/src-tauri/tauri.conf.json`

Steps:

1. Create a small Swift executable target using FluidAudio from the currently selected package version. Start from `from: "0.12.4"` unless implementation review chooses a newer verified release.
2. Use a line-delimited JSON protocol over stdin/stdout. Log diagnostics to stderr only.
3. Supported commands:
   - `health`
   - `list_models`
   - `download_model`
   - `load_model`
   - `transcribe`
   - `status`
   - `shutdown`
4. Default first-pass FluidAudio requests to Parakeet `AsrModelVersion.v3`.
5. Avoid Parakeet v2.
6. Download and load Parakeet v3 from the Rust-provided `models/fluidaudio/parakeet-tdt-0.6b-v3/` directory. Do not use FluidAudio's default cache for OpenBrief.
7. Keep command payloads model-generic enough for Qwen3 later:
   - `modelId: "parakeet-tdt-0.6b-v3" | "qwen3-asr-0.6b"`
   - `variant?: "f32" | "int8"`
   - `language?: string`
8. Build and embed the real Swift sidecar only for `aarch64-apple-darwin`.
9. Do not add FluidAudio to a global `externalBin` list used by every release target. Scope the Tauri config/build input so `binaries/openbrief-fluidaudio` is listed only for macOS arm64 builds.
10. For unsupported targets, leave FluidAudio out of the bundle entirely. The Rust router should report `unsupported-platform` / `unsupported-architecture` from capability checks and never try to launch the sidecar.
11. Extend `build.rs` release checks so macOS arm64 release builds fail if the FluidAudio binary is missing or non-executable, but do not require any FluidAudio binary for unsupported targets.

Acceptance criteria:

- `pnpm setup:dev-sidecars` builds or prepares the correct dev sidecars on macOS arm64.
- Release macOS arm64 builds package the real FluidAudio sidecar.
- Windows/Linux builds are not forced to compile or package FluidAudio.

### Phase 4: Model Catalog And Setup UI

Files:

- `client/apps/tauri/src-tauri/src/stt_models.rs`
- `client/apps/tauri/src/services/settingsService.ts`
- `client/apps/tauri/src/domain/settings.ts`
- `client/apps/tauri/src/domain/compatibility.ts`
- `client/apps/tauri/src/features/setup/SetupDialog.tsx`
- `client/apps/tauri/src/features/settings/SettingsView.tsx`
- `client/apps/tauri/src/i18n/locales/en_us.ts` and other locale files as needed

Steps:

1. Change STT catalog from "Whisper-only files" to "local STT engines and models". The catalog shape should support multiple models per engine family, including future FluidAudio Qwen3 entries.
2. Add a FluidAudio model entry:
   - `id: "parakeet-tdt-0.6b-v3"`
   - `name: "Parakeet v3"`
   - `engine: "FluidAudio"`
   - platform: `macos`
   - architecture: `aarch64`
   - supported languages: allowlist
   - storage path: `models/fluidaudio/parakeet-tdt-0.6b-v3/`
   - recommended: true only when compatible
3. Keep Whisper Small recommended when FluidAudio is not compatible.
4. Do not expose Qwen3 in the first pass, but keep catalog fields ready for it:
   - `id: "qwen3-asr-0.6b"`
   - `name: "Qwen3 ASR 0.6B"`
   - `engine: "FluidAudio"`
   - platform: `macos`
   - minimum macOS: `15`
   - architecture: `aarch64`
   - variants: `f32`, `int8`
   - storage paths: `models/fluidaudio/qwen3-asr-0.6b/f32/` and `models/fluidaudio/qwen3-asr-0.6b/int8/`
   - status: hidden or beta until explicitly implemented
5. Update setup copy:
   - macOS Apple Silicon: "Use Parakeet v3 with FluidAudio, or choose Whisper."
   - unsupported systems: "FluidAudio requires Apple Silicon. Whisper is available."
6. Rename UI internals from `WhisperSetup` to `SttSetup` only if the diff stays reviewable. Otherwise preserve component names for the first integration and update visible copy only.
7. Show a compatibility badge for Parakeet v3:
   - Available
   - Requires macOS Apple Silicon
   - Unsupported language, using Whisper
   - Downloaded / ready
8. Preserve user confirmation before any large model download.
9. Extend `download_stt_model` so Whisper downloads stay Rust-native and FluidAudio downloads invoke the macOS arm64 Swift sidecar with the Rust-provided checkpoint directory.
10. Ensure all new user-visible strings go through i18n.

Acceptance criteria:

- Settings and setup show Parakeet v3 only as available on macOS arm64.
- Unsupported targets see clear fallback copy and no dead download action.
- Whisper model download and selection still work.

### Phase 5: Transcript Pipeline Selection

Files:

- `client/apps/tauri/src/domain/transcript.ts`
- `client/apps/tauri/src/services/transcriptService.ts`
- `client/apps/tauri/src/hooks/useMediaLibrary.ts`
- `client/apps/tauri/src/app/AppShell.tsx`

Steps:

1. When a user chooses local STT, pass the selected transcription language into `createTranscribeAudioCommand`.
2. Default `enginePreference` to `auto`.
3. Let Rust return engine metadata in the completed `transcribe_audio` result.
4. Use engine metadata only for user-facing details and logs; keep summaries/chat/export consuming the same transcript segment contract.
5. Add fallback telemetry/logging for `auto` decisions without leaking filesystem paths.

Acceptance criteria:

- Captions-first behavior remains unchanged.
- Local STT chooses FluidAudio only when eligible.
- Fallback to Whisper is silent in normal use but visible in logs/settings diagnostics.

### Phase 6: Tests And Verification

Frontend/domain tests:

- `cd client/apps/tauri && pnpm test:run transcript`
- `cd client/apps/tauri && pnpm test:run settings`
- `cd client/apps/tauri && pnpm test:run setup`
- `cd client/apps/tauri && pnpm typecheck`

Rust tests:

- `cd client/apps/tauri/src-tauri && cargo test stt`
- `cd client/apps/tauri/src-tauri && cargo test config_security`
- `cd client/apps/tauri/src-tauri && cargo check`
- On macOS arm64: `cargo check --target aarch64-apple-darwin`

Swift sidecar checks:

- `swift build -c release` in the FluidAudio sidecar package.
- Sidecar `health` command returns JSON and no stdout noise.
- Sidecar `download_model` can download Parakeet v3 into `app-data/models/fluidaudio/parakeet-tdt-0.6b-v3/`.
- Sidecar `transcribe` produces transcript JSON for a short 16 kHz mono WAV.

Benchmark fixture:

- Use `docs/assets/openbrief_mission.wav` as the fixed local STT benchmark sample.
- The fixture is 16-bit mono PCM at 44.1 kHz and about 11.33 seconds long.
- Expected transcript text:

```text
OpenBrief turns long videos, audio, and recordings into clear briefs - without the busywork. Import a source, get a transcript, ask questions that stay grounded in what was said, and export only the notes you need.
```

Benchmark harness:

- Add a macOS arm64-only benchmark command or test script that runs the same extracted-audio path used by production STT.
- Resample the fixture to the existing STT input format, 16 kHz mono WAV, before timing engine inference.
- Require both checkpoints to be present before timing:
  - `app-data/models/ggml-small.bin`
  - `app-data/models/fluidaudio/parakeet-tdt-0.6b-v3/`
- Compare `enginePreference: "fluidaudio"` against `enginePreference: "whisper"` with Whisper Small.
- Exclude model download time from the benchmark. Record cold-load and warm-run timings separately:
  - cold-load: first transcription after process start, includes model load
  - warm-run: second transcription in the same process, excludes already-loaded model cost where the engine supports reuse
- Record wall-clock milliseconds, audio duration, real-time factor, engine, model id, language, architecture, and whether the output contains the expected key phrases.
- Key phrase checks should be tolerant of punctuation and dash variants, but should require these phrases:
  - `OpenBrief turns long videos, audio, and recordings into clear briefs`
  - `without the busywork`
  - `ask questions that stay grounded in what was said`
  - `export only the notes you need`

Benchmark acceptance criteria:

- On macOS Apple Silicon, the benchmark prints a single JSON or table result comparing Parakeet v3 and Whisper Small.
- Parakeet v3 and Whisper Small both produce recognizable transcript text for the fixture.
- The result makes clear whether timings include model load or warm inference only.
- The benchmark is skipped or marked unsupported on non-macOS-arm64 targets.

Packaging checks:

- `cd client/apps/tauri && pnpm setup:dev-sidecars`
- `cd client/apps/tauri && pnpm build`
- `cd client/apps/tauri/src-tauri && cargo test`
- macOS arm64 Tauri build smoke with the sidecar present.
- At least one unsupported target check proving the FluidAudio sidecar is not listed or required.
- `git diff --check`

Manual QA:

- macOS Apple Silicon, supported language: local STT uses FluidAudio Parakeet v3.
- macOS Apple Silicon, unsupported language: local STT falls back to Whisper.
- macOS Intel or Windows/Linux: FluidAudio is unavailable and Whisper remains usable.
- Missing FluidAudio sidecar: `auto` falls back to Whisper, explicit FluidAudio reports a clear error.
- Failed FluidAudio transcription: `auto` falls back to Whisper if a Whisper model is available.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| FluidAudio is accidentally listed in global `externalBin` for unsupported targets | Scope FluidAudio sidecar config to macOS arm64 only. Do not create placeholder FluidAudio sidecars for Windows/Linux/Intel macOS. |
| Swift/SPM build slows or breaks non-macOS CI | Gate Swift build scripts by target triple and host OS. Never require Swift outside macOS arm64 packaging. |
| FluidAudio API changes across versions | Pin the Swift package and document the chosen version in `Package.resolved`. Update only with a focused compatibility PR. Keep model-specific adapters behind a stable sidecar protocol. |
| Parakeet v3 language support drifts across package versions | Treat the confirmed allowlist as code, backed by the pinned FluidAudio version. Keep non-listed languages on Whisper until the plan is explicitly updated. |
| Parakeet output shape lacks timestamps | Resolved for FluidAudio `0.14.7`: Parakeet v3 returns token timings. Keep synthetic word timing only as a defensive fallback if a future result returns text without timing metadata. |
| Qwen3 is added later but the first sidecar protocol assumes Parakeet-only behavior | Keep `engine`, `modelId`, `variant`, `language`, download, load, status, and transcript metadata generic from the first pass. |
| Qwen3 model size and macOS 15 requirement surprise users | Keep Qwen3 hidden/beta in the first pass and require explicit opt-in, clear size copy, and a macOS 15+ compatibility gate when implemented. |
| Model download path escapes app authority | Rust owns the unified checkpoint root and passes only canonical app-data model paths to the sidecar. Renderer receives model status only. |
| UI becomes confusing with two local engines | Present one "Local transcription" area with badges and compatibility messages rather than separate competing settings sections. |

## Explicit Non-Goals

- No Parakeet v2.
- No user-facing Qwen3 ASR rollout in the first pass. The protocol and storage layout should prepare for it.
- No iOS integration in this pass.
- No streaming/real-time ASR in this pass.
- No speaker diarization in this pass.
- No direct renderer access to FluidAudio or model checkpoint paths.
- No removal of Whisper.

## Open Questions For Implementation

1. For Qwen3 ASR, does the selected future FluidAudio version expose stable timing, or only full text?
2. Should explicit user model selection include "Auto" as the default, or should Settings store a concrete engine/model choice?
3. Do release/notarization settings need additional entitlements for the Swift sidecar and CoreML model loading?

## Stop Condition

The integration is complete when macOS Apple Silicon users with supported languages get Parakeet v3 by default, every unsupported platform/language reliably falls back to Whisper, settings/setup clearly explain availability, builds remain cross-platform, and the verification matrix above passes.
