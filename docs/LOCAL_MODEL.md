# Local Model Storage

This document defines how OpenBrief should store local model checkpoints and related runtime assets for speech models. It covers the current Whisper, Parakeet, and Qwen3-ASR STT paths plus Supertonic 3 and Qwen3-TTS read-aloud paths.

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

    voicebox/
      hf/
        hub/
          models--Qwen--Qwen3-TTS-12Hz-0.6B-Base/
          models--Qwen--Qwen3-TTS-12Hz-1.7B-Base/
          models--Qwen--Qwen3-ASR-0.6B/
          models--Qwen--Qwen3-ASR-1.7B/
          models--Qwen--Qwen3-ForcedAligner-0.6B/
          models--mlx-community--Qwen3-TTS-12Hz-0.6B-Base-bf16/
          models--mlx-community--Qwen3-TTS-12Hz-1.7B-Base-bf16/
          models--mlx-community--Qwen3-ASR-0.6B-8bit/
          models--mlx-community--Qwen3-ASR-1.7B-8bit/
          models--mlx-community--Qwen3-ForcedAligner-0.6B-8bit/
      profiles/
        <profile-id>/
          samples/
            <sample-id>.wav
            <sample-id>.json

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
                voice-message-<time>.wav
        chat/
          <session-id>.jsonl
          tts/
            <chat-message-id>/
              <generation-id>/
                voice-message-<time>.wav
```

`models/supertonic/hf` and `models/voicebox/hf` are cache/download areas. `models/supertonic/supertonic-3` is the app-owned ready-to-run Supertonic directory. Qwen3-TTS and Qwen3-ASR keep Hugging Face snapshots under `models/voicebox/hf/hub` and choose the MLX or PyTorch repo family at runtime. Runtime state such as imported voice styles and logs belongs under `app-data/supertonic` or model-family runtime directories, not inside checkpoint directories. Generated TTS audio belongs beside the summary or chat artifact it reads, under `app-data/library/{videos,audios,pdfs}/{asset-id}`.

`app-data/supertonic` is model-family runtime data, not checkpoint data:

- `voices/builtin` contains app-owned copies or links of the built-in Supertonic style JSON files that are safe to show in the voice picker. These should mirror the model bundle's `voice_styles` files and should be recreated if the model is reinstalled.
- `voices/imported` contains user-imported Supertonic Voice Builder JSON files. File names should use a stable app-generated `voiceStyleId`, not the original user filename, so duplicate names and path characters cannot affect storage. Each imported JSON should be validated before it appears in the voice picker.
- `logs` contains sidecar runtime logs such as `sidecar.log`. Logs should be bounded or rotated because generation requests can be frequent. They must not include raw provider secrets, arbitrary filesystem roots, or full user text unless the user has enabled an explicit diagnostic mode.

Generated TTS artifacts should be source-scoped:

- Summary read-aloud output goes under the same media asset's `summary/tts/<summary-id>/<generation-id>/` directory. This keeps audio cleanup tied to the summary document that produced it.
- Chat bubble read-aloud output goes under the same media asset's `chat/tts/<chat-message-id>/<generation-id>/` directory. The chat session remains the source of message order and content; the TTS directory stores derived audio for a specific message.
- `voice-message-<time>.wav` is the local output artifact for chat read-aloud. Legacy `audio.wav` is still recognized for older generated messages.
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

The first implementation bundles a per-platform PyInstaller `openbrief-supertonic` sidecar so users do not need to install Python or debug pip packages. Model weights are still not bundled. The sidecar runs with `HF_HOME`, `HF_HUB_CACHE`, and `--cache-dir` pointed at app-owned `models/supertonic` directories, so first use downloads only the Supertonic model weights.

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

## Qwen3-TTS

Qwen3-TTS is the Voicebox-style TTS path for preset read-aloud and future voice cloning. The app bundles a per-platform `openbrief-voicebox` Python sidecar, but does not bundle Qwen model weights. The first use downloads weights into `models/voicebox/hf`.

Supported synthesis languages are Chinese (`zh`), English (`en`), Japanese (`ja`), Korean (`ko`), German (`de`), French (`fr`), Russian (`ru`), Portuguese (`pt`), Spanish (`es`), and Italian (`it`).

| Model ID | Approx. size | macOS arm64 repo | PyTorch repo |
| --- | ---: | --- | --- |
| `qwen-tts-0.6B` | ~1.2 GB | `mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16` | `Qwen/Qwen3-TTS-12Hz-0.6B-Base` |
| `qwen-tts-1.7B` | ~3.5 GB | `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16` | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` |

`openbrief-voicebox runtime` reports the active backend. It prefers MLX on Apple Silicon when `mlx` imports successfully, otherwise PyTorch. PyTorch reports CUDA, MPS, and DirectML capability, but the minimal release path is CPU-safe on macOS x86_64, Windows x86_64, and Linux x86_64.

## Qwen3-ASR

Qwen3-ASR is the Voicebox sidecar STT path for timestamped local transcription. OpenBrief does not bundle model weights. The first transcription downloads the selected ASR checkpoint and the forced-aligner checkpoint into the app-owned Voicebox Hugging Face cache.

macOS Apple Silicon uses the MLX-Audio Qwen3-ASR and Qwen3-ForcedAligner ports when available:

- `mlx-community/Qwen3-ASR-0.6B-8bit`
- `mlx-community/Qwen3-ASR-1.7B-8bit`
- `mlx-community/Qwen3-ForcedAligner-0.6B-8bit`

Other platforms use the official Qwen checkpoints through the `qwen-asr` Python package:

- `Qwen/Qwen3-ASR-0.6B`
- `Qwen/Qwen3-ASR-1.7B`
- `Qwen/Qwen3-ForcedAligner-0.6B`

The ASR models support 30 languages plus 22 Chinese dialects in the upstream toolkit. The forced aligner supports timestamp prediction for Chinese, English, Cantonese, French, German, Italian, Japanese, Korean, Portuguese, Russian, and Spanish. OpenBrief exposes only this 11-language intersection in the model card because transcript word timestamps are part of the local STT contract.

| Model ID | Approx. size with aligner | macOS arm64 repo | PyTorch repo | Timestamp source |
| --- | ---: | --- | --- | --- |
| `qwen3-asr-0.6B` | ~2.4 GB | `mlx-community/Qwen3-ASR-0.6B-8bit` | `Qwen/Qwen3-ASR-0.6B` | `Qwen3-ForcedAligner-0.6B` |
| `qwen3-asr-1.7B` | ~5.8 GB | `mlx-community/Qwen3-ASR-1.7B-8bit` | `Qwen/Qwen3-ASR-1.7B` | `Qwen3-ForcedAligner-0.6B` |

Supertonic default generation config:

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
| Supertonic 3 / ONNX Runtime CPU | First-class via PyInstaller sidecar | First-class via PyInstaller sidecar | First-class via PyInstaller sidecar | First-class via PyInstaller sidecar | Conditional on release target and wheel availability |
| Qwen3-TTS / Voicebox sidecar | MLX preferred, PyTorch fallback | PyTorch CPU | PyTorch CPU, optional CUDA/DirectML later | PyTorch CPU, optional CUDA/ROCm later | Conditional on release target and wheel availability |
| Qwen3-ASR + ForcedAligner / Voicebox sidecar | MLX-Audio preferred | Official `qwen-asr` PyTorch CPU | Official `qwen-asr` PyTorch CPU, optional CUDA/DirectML later | Official `qwen-asr` PyTorch CPU, optional CUDA/ROCm later | Conditional on release target and wheel availability |

Notes:

- Whisper is the default cross-platform STT fallback.
- Parakeet is available only when `target_os == macos`, `target_arch == aarch64`, and the detected macOS major version is at least 14.
- Supertonic avoids GPU requirements for the first implementation. CPU ONNX Runtime inside the PyInstaller sidecar is the minimal-cost cross-platform path.

## Download And Readiness Rules

| Model family | Download method | Ready check | Failure behavior |
| --- | --- | --- | --- |
| Whisper | Rust downloads direct GGML file to `.partial`, verifies SHA1, then renames. | Final `ggml-*.bin` exists and checksum matched during download. | Keep or remove `.partial`; never mark final file ready on checksum mismatch. |
| Parakeet | Rust asks the FluidAudio sidecar to download into `models/fluidaudio/parakeet-tdt-0.6b-v3`. | Required CoreML directories and `parakeet_vocab.json` exist. | Hide from catalog on unsupported OS; fall back to Whisper when auto routing cannot use FluidAudio. |
| Supertonic | PyInstaller sidecar downloads or materializes assets into `models/supertonic`. | Existing chat/summary audio is discovered under library-scoped `tts` directories; future explicit model status should verify required ONNX files, voice styles, and `manifest.json`. | Report not ready and keep renderer away from raw cache paths. |
| Qwen3-TTS | Voicebox PyInstaller sidecar downloads Hugging Face snapshots into `models/voicebox/hf`. | Sidecar `models` and future status commands report the backend-specific repo and cache state. | Report not ready; do not expose raw HF cache paths to the renderer. |
| Qwen3-ASR | Voicebox PyInstaller sidecar downloads ASR and forced-aligner snapshots into `models/voicebox/hf` on first transcription. | STT catalog treats the sidecar-managed model as selectable; the sidecar owns actual snapshot readiness. | Fall back only when the user selects another STT model; Qwen timestamp languages should fail clearly if unsupported by the aligner. |

## Implementation Anchors

- Current STT catalog and Whisper downloads: `client/apps/tauri/src-tauri/src/stt_models.rs`
- Current model-root path authority: `client/apps/tauri/src-tauri/src/helper.rs`
- Current FluidAudio platform gate and Parakeet readiness check: `client/apps/tauri/src-tauri/src/fluidaudio.rs`
- Qwen3-ASR sidecar routing: `client/apps/tauri/src-tauri/src/qwen_asr.rs`
- Supertonic integration plan: `PLAN_SUPERTONIC.md`
- Qwen3-TTS integration plan: `PLAN_VOICEBOX.md`
- FluidAudio integration plan: `PLAN_FLUIDAUDIO.md`
