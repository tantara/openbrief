# Local Model Storage

This document defines how OpenBrief should store local model checkpoints and related runtime assets for speech models. It covers the current Whisper and Parakeet STT paths and the planned Supertonic 3 TTS path.

## Storage Principles

- Rust owns the app data directory, model roots, sidecar execution, and filesystem authority.
- Renderer code should receive model IDs, status, size, and display metadata, not raw authority-bearing filesystem roots.
- Large model weights are downloaded explicitly after user confirmation. They should not be bundled with the app unless legal and product approval changes that rule.
- Downloads should be resumable or at least atomic from the app's point of view. Partial files and incomplete directories must not be reported as ready.
- Model metadata should include engine, model ID, source, revision or checksum where available, license, size, and required file list.

## Canonical Directory Layout

`<app-data>` means the Tauri `app_data_dir()` for OpenBrief. The current STT catalog exposes this root to the UI only as `app-data/models`.

```text
<app-data>/
  models/
    ggml-tiny.bin
    ggml-base.bin
    ggml-small.bin
    ggml-medium.bin
    ggml-large-v3-turbo-q5_0.bin
    ggml-large-v3-turbo.bin
    ggml-small.bin.partial

    fluidaudio/
      parakeet-tdt-0.6b-v3/
        Preprocessor.mlmodelc/
        Encoder.mlmodelc/
        Decoder.mlmodelc/
        JointDecisionv3.mlmodelc/
        parakeet_vocab.json

    supertonic/
      hf/
        hub/
          models--Supertone--supertonic-3/
      supertonic-3/
        onnx/
          duration_predictor.onnx
          text_encoder.onnx
          vector_estimator.onnx
          vocoder.onnx
          tts.json
          unicode_indexer.json
        voice_styles/
          F1.json
          F2.json
          F3.json
          F4.json
          F5.json
          M1.json
          M2.json
          M3.json
          M4.json
          M5.json
        manifest.json

  supertonic/
    voices/
      builtin/
        M1.json
        M2.json
        M3.json
        M4.json
        M5.json
        F1.json
        F2.json
        F3.json
        F4.json
        F5.json
      imported/
        <voice-style-id>.json
    logs/
      sidecar.log

  library/
    {videos,audios,pdfs}/
      <asset-id>/
        summary/
          <summary-id>.md
          tts/
            <summary-id>/
              <generation-id>/
                audio.wav
                metadata.json
        chat/
          <session-id>.jsonl
          tts/
            <chat-message-id>/
              <generation-id>/
                audio.wav
                metadata.json
```

`models/supertonic/hf` is a cache/download area. `models/supertonic/supertonic-3` is the app-owned ready-to-run model directory. Runtime state such as imported voice styles and logs belongs under `app-data/supertonic`, not inside the model checkpoint directory. Generated TTS audio belongs beside the summary or chat artifact it reads, under `app-data/library/{videos,audios,pdfs}/{asset-id}`.

`app-data/supertonic` is model-family runtime data, not checkpoint data:

- `voices/builtin` contains app-owned copies or links of the built-in Supertonic style JSON files that are safe to show in the voice picker. These should mirror the model bundle's `voice_styles` files and should be recreated if the model is reinstalled.
- `voices/imported` contains user-imported Supertonic Voice Builder JSON files. File names should use a stable app-generated `voiceStyleId`, not the original user filename, so duplicate names and path characters cannot affect storage. Each imported JSON should be validated before it appears in the voice picker.
- `logs` contains sidecar runtime logs such as `sidecar.log`. Logs should be bounded or rotated because generation requests can be frequent. They must not include raw provider secrets, arbitrary filesystem roots, or full user text unless the user has enabled an explicit diagnostic mode.

Generated TTS artifacts should be source-scoped:

- Summary read-aloud output goes under the same media asset's `summary/tts/<summary-id>/<generation-id>/` directory. This keeps audio cleanup tied to the summary document that produced it.
- Chat bubble read-aloud output goes under the same media asset's `chat/tts/<chat-message-id>/<generation-id>/` directory. The chat session remains the source of message order and content; the TTS directory stores derived audio for a specific message.
- `audio.wav` is the local output artifact. `metadata.json` should record `sourceKind`, source relative path, `summaryId` or `chatMessageId`, optional `chatSessionId`, text hash, engine, model ID, model revision, voice style ID, language, generation settings, sample rate, duration, created time, and license/provenance fields needed for export history.
- The TTS sidecar should receive a Rust-validated library-relative output target. It should not choose arbitrary output paths from renderer input.

Deleting `models/supertonic/supertonic-3` removes the model checkpoint and makes new generation unavailable, but it should not delete imported voices or previously generated summary/chat audio. Deleting `app-data/supertonic` resets Supertonic voice imports and logs, but it should not be required for model upgrades and should not remove library-scoped TTS artifacts.

## Whisper

Whisper uses `whisper.cpp` GGML checkpoints loaded by the existing helper sidecar. It is the cross-platform STT fallback and remains the recommended model family when FluidAudio/Parakeet is not available.

### Checkpoint Structure

Whisper checkpoints are single files stored directly under `app-data/models`.

```text
<app-data>/
  models/
    ggml-small.bin
    ggml-small.bin.partial
```

Download flow:

1. Download to `<file>.partial`.
2. Verify SHA1.
3. Rename to the final `ggml-*.bin` file.
4. Report the model as downloaded when the final file exists.

### Catalog

| Model ID | File | Approx. size | Engine | Notes |
| --- | --- | ---: | --- | --- |
| `whisper-tiny` | `ggml-tiny.bin` | 75 MB | `whisper.cpp` | Smallest checkpoint. |
| `whisper-base` | `ggml-base.bin` | 142 MB | `whisper.cpp` | Low-cost baseline. |
| `whisper-small` | `ggml-small.bin` | 466 MB | `whisper.cpp` | Recommended fallback when Parakeet is unavailable. |
| `whisper-medium` | `ggml-medium.bin` | 1536 MB | `whisper.cpp` | Higher accuracy, larger footprint. |
| `whisper-large-v3-turbo-q5` | `ggml-large-v3-turbo-q5_0.bin` | 547 MB | `whisper.cpp` | Quantized large-v3 turbo. |
| `whisper-large-v3-turbo` | `ggml-large-v3-turbo.bin` | 1536 MB | `whisper.cpp` | Full large-v3 turbo checkpoint. |

Source: `ggerganov/whisper.cpp` GGML checkpoints on Hugging Face.

## Parakeet

Parakeet v3 is the FluidAudio STT path. It is cataloged only when the app can run the FluidAudio Swift sidecar: macOS, Apple Silicon, macOS 14 or newer.

### Checkpoint Structure

Parakeet uses a model directory managed by the FluidAudio sidecar, not a single flat model file.

```text
<app-data>/
  models/
    fluidaudio/
      parakeet-tdt-0.6b-v3/
        Preprocessor.mlmodelc/
        Encoder.mlmodelc/
        Decoder.mlmodelc/
        JointDecisionv3.mlmodelc/
        parakeet_vocab.json
```

Current readiness check requires all of these entries to exist:

- `Preprocessor.mlmodelc`
- `Encoder.mlmodelc`
- `Decoder.mlmodelc`
- `JointDecisionv3.mlmodelc`
- `parakeet_vocab.json`

### Catalog

| Model ID | Directory | Approx. size | Engine | Source |
| --- | --- | ---: | --- | --- |
| `parakeet-tdt-0.6b-v3` | `fluidaudio/parakeet-tdt-0.6b-v3` | 2100 MB | `fluidaudio` | `FluidInference/parakeet-tdt-0.6b-v3-coreml` |

When available, Parakeet is the recommended STT model. When unavailable, `whisper-small` is recommended instead.

## Supertonic

Supertonic 3 is the planned local TTS path for fast CPU narration. It is an ONNX Runtime model with preset voice styles and optional imported Supertonic Voice Builder JSON voice styles. It should not be presented as arbitrary in-app zero-shot voice cloning.

### Checkpoint Structure

Supertonic should use an app-owned ready directory plus an optional Hugging Face cache. The sidecar should load from `models/supertonic/supertonic-3`, not from a user-global cache.

```text
<app-data>/
  models/
    supertonic/
      hf/
        hub/
          models--Supertone--supertonic-3/
      supertonic-3/
        onnx/
          duration_predictor.onnx
          text_encoder.onnx
          vector_estimator.onnx
          vocoder.onnx
          tts.json
          unicode_indexer.json
        voice_styles/
          F1.json
          F2.json
          F3.json
          F4.json
          F5.json
          M1.json
          M2.json
          M3.json
          M4.json
          M5.json
        manifest.json
```

`manifest.json` should be written by OpenBrief after a verified download:

```json
{
  "modelId": "supertonic-3",
  "engine": "supertonic",
  "runtime": "onnxruntime",
  "repoId": "Supertone/supertonic-3",
  "revision": "3cadd1ee6394adea1bd021217a0e650ede09a323",
  "license": "openrail",
  "sampleRate": 44100,
  "parameters": "~99M",
  "downloadedAt": "2026-05-23T00:00:00Z"
}
```

The first implementation can use the Python SDK sidecar, but model download must still be explicit. The SDK's automatic download behavior should only run inside an OpenBrief `/models/download` command with `HF_HOME`, `HF_HUB_CACHE`, and `SUPERTONIC_MODEL_DIR` pointed at the app-owned directories.

### Required Files

Supertonic is ready only when the model ONNX files, config files, voice styles, and manifest are present.

```text
onnx/duration_predictor.onnx
onnx/text_encoder.onnx
onnx/vector_estimator.onnx
onnx/vocoder.onnx
onnx/tts.json
onnx/unicode_indexer.json
voice_styles/F1.json
voice_styles/F2.json
voice_styles/F3.json
voice_styles/F4.json
voice_styles/F5.json
voice_styles/M1.json
voice_styles/M2.json
voice_styles/M3.json
voice_styles/M4.json
voice_styles/M5.json
manifest.json
```

### Catalog

| Model ID | Directory | Approx. size | Runtime | Source |
| --- | --- | ---: | --- | --- |
| `supertonic-3` | `supertonic/supertonic-3` | ~260 MB | ONNX Runtime CPU | `Supertone/supertonic-3` |

Default generation config:

```json
{
  "engine": "supertonic",
  "modelId": "supertonic-3",
  "voiceStyleId": "M1",
  "language": "en",
  "totalSteps": 8,
  "speed": 1.05,
  "silenceDuration": 0.3,
  "sampleRate": 44100
}
```

## Platform Support

| Model family | macOS arm64 | macOS x86_64 | Windows x86_64 | Linux x86_64 | Linux arm64 |
| --- | --- | --- | --- | --- | --- |
| Whisper GGML | Supported | Supported | Supported | Supported | Conditional on helper release target |
| Parakeet v3 / FluidAudio | Supported on macOS 14+ | Not supported | Not supported | Not supported | Not supported |
| Supertonic 3 / ONNX Runtime CPU | Planned first-class | Planned first-class | Planned first-class | Planned first-class | Conditional on ONNX Runtime and sidecar packaging |

Notes:

- Whisper is the default cross-platform STT fallback.
- Parakeet is available only when `target_os == macos`, `target_arch == aarch64`, and the detected macOS major version is at least 14.
- Supertonic should avoid GPU requirements for the first implementation. CPU ONNX Runtime is the minimal-cost cross-platform path.

## Download And Readiness Rules

| Model family | Download method | Ready check | Failure behavior |
| --- | --- | --- | --- |
| Whisper | Rust downloads direct GGML file to `.partial`, verifies SHA1, then renames. | Final `ggml-*.bin` exists and checksum matched during download. | Keep or remove `.partial`; never mark final file ready on checksum mismatch. |
| Parakeet | Rust asks the FluidAudio sidecar to download into `models/fluidaudio/parakeet-tdt-0.6b-v3`. | Required CoreML directories and `parakeet_vocab.json` exist. | Hide from catalog on unsupported OS; fall back to Whisper when auto routing cannot use FluidAudio. |
| Supertonic | Planned sidecar command downloads or materializes assets into `models/supertonic/supertonic-3`. | Required ONNX files, voice styles, and `manifest.json` exist. | Report not ready and keep renderer away from raw cache paths. |

## Implementation Anchors

- Current STT catalog and Whisper downloads: `client/apps/tauri/src-tauri/src/stt_models.rs`
- Current model-root path authority: `client/apps/tauri/src-tauri/src/helper.rs`
- Current FluidAudio platform gate and Parakeet readiness check: `client/apps/tauri/src-tauri/src/fluidaudio.rs`
- Supertonic integration plan: `PLAN_SUPERTONIC.md`
- FluidAudio integration plan: `PLAN_FLUIDAUDIO.md`
