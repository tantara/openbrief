import argparse
import importlib.util
import json
import math
import os
import platform
import struct
import sys
import wave
from pathlib import Path
from typing import Any


LANGUAGES = {
    "zh": "Chinese",
    "en": "English",
    "ja": "Japanese",
    "ko": "Korean",
    "de": "German",
    "fr": "French",
    "ru": "Russian",
    "pt": "Portuguese",
    "es": "Spanish",
    "it": "Italian",
}

QWEN3_ASR_LANGUAGES = {
    "zh": "Chinese",
    "en": "English",
    "yue": "Cantonese",
    "ar": "Arabic",
    "de": "German",
    "fr": "French",
    "es": "Spanish",
    "pt": "Portuguese",
    "id": "Indonesian",
    "it": "Italian",
    "ko": "Korean",
    "ru": "Russian",
    "th": "Thai",
    "vi": "Vietnamese",
    "ja": "Japanese",
    "tr": "Turkish",
    "hi": "Hindi",
    "ms": "Malay",
    "nl": "Dutch",
    "sv": "Swedish",
    "da": "Danish",
    "fi": "Finnish",
    "pl": "Polish",
    "cs": "Czech",
    "fil": "Filipino",
    "fa": "Persian",
    "el": "Greek",
    "hu": "Hungarian",
    "mk": "Macedonian",
    "ro": "Romanian",
}

QWEN3_ALIGNER_LANGUAGES = {
    "zh": "Chinese",
    "en": "English",
    "yue": "Cantonese",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "ja": "Japanese",
    "ko": "Korean",
    "pt": "Portuguese",
    "ru": "Russian",
    "es": "Spanish",
}

TTS_MODEL_ALIASES = {
    "qwen-tts-0.6b": "qwen-tts-0.6B",
    "qwen3-tts-0.6b": "qwen-tts-0.6B",
    "qwen/qwen3-tts-0.6b": "qwen-tts-0.6B",
    "qwen-tts-1.7b": "qwen-tts-1.7B",
    "qwen3-tts-1.7b": "qwen-tts-1.7B",
    "qwen/qwen3-tts-1.7b": "qwen-tts-1.7B",
}

TTS_MODEL_REPOS = {
    "qwen-tts-0.6B": {
        "mlx": "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16",
        "pytorch": "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
    },
    "qwen-tts-1.7B": {
        "mlx": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16",
        "pytorch": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    },
}

ASR_MODEL_ALIASES = {
    "qwen-asr-0.6b": "qwen3-asr-0.6B",
    "qwen3-asr-0.6b": "qwen3-asr-0.6B",
    "qwen/qwen3-asr-0.6b": "qwen3-asr-0.6B",
    "qwen-asr-1.7b": "qwen3-asr-1.7B",
    "qwen3-asr-1.7b": "qwen3-asr-1.7B",
    "qwen/qwen3-asr-1.7b": "qwen3-asr-1.7B",
}

ASR_MODEL_REPOS = {
    "qwen3-asr-0.6B": {
        "mlx": "mlx-community/Qwen3-ASR-0.6B-8bit",
        "pytorch": "Qwen/Qwen3-ASR-0.6B",
    },
    "qwen3-asr-1.7B": {
        "mlx": "mlx-community/Qwen3-ASR-1.7B-8bit",
        "pytorch": "Qwen/Qwen3-ASR-1.7B",
    },
}

ALIGNER_MODEL_ALIASES = {
    "qwen3-forced-aligner-0.6b": "qwen3-forced-aligner-0.6B",
    "qwen-forced-aligner-0.6b": "qwen3-forced-aligner-0.6B",
    "qwen/qwen3-forcedaligner-0.6b": "qwen3-forced-aligner-0.6B",
}

ALIGNER_MODEL_REPOS = {
    "qwen3-forced-aligner-0.6B": {
        "mlx": "mlx-community/Qwen3-ForcedAligner-0.6B-8bit",
        "pytorch": "Qwen/Qwen3-ForcedAligner-0.6B",
    },
}


def module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def preferred_backend() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    if (
        system == "darwin"
        and machine in {"arm64", "aarch64"}
        and module_available("mlx")
        and module_available("mlx_audio")
    ):
        return "mlx"
    return "pytorch"


def torch_acceleration() -> dict[str, Any]:
    if not module_available("torch"):
        return {
            "torch": False,
            "cuda": False,
            "mps": False,
            "directml": module_available("torch_directml"),
        }

    import torch

    return {
        "torch": True,
        "cuda": bool(torch.cuda.is_available()),
        "mps": bool(
            hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
        ),
        "directml": module_available("torch_directml"),
    }


def runtime_info() -> dict[str, Any]:
    acceleration = torch_acceleration()
    return {
        "python": sys.version.split()[0],
        "platform": platform.system().lower(),
        "machine": platform.machine().lower(),
        "backend": preferred_backend(),
        "acceleration": acceleration,
        "modules": {
            "qwen_tts": module_available("qwen_tts"),
            "qwen_asr": module_available("qwen_asr"),
            "mlx": module_available("mlx"),
            "mlx_audio": module_available("mlx_audio"),
            "soundfile": module_available("soundfile"),
        },
    }


def normalize_tts_model(model: str | None) -> str:
    candidate = (model or "qwen-tts-0.6B").strip()
    normalized = TTS_MODEL_ALIASES.get(candidate.lower())
    if normalized:
        return normalized
    if candidate in TTS_MODEL_REPOS:
        return candidate
    supported = ", ".join(TTS_MODEL_REPOS)
    raise ValueError(f"Unsupported Qwen3-TTS model '{candidate}'. Supported: {supported}")


def normalize_asr_model(model: str | None) -> str:
    candidate = (model or "qwen3-asr-0.6B").strip()
    normalized = ASR_MODEL_ALIASES.get(candidate.lower())
    if normalized:
        return normalized
    if candidate in ASR_MODEL_REPOS:
        return candidate
    supported = ", ".join(ASR_MODEL_REPOS)
    raise ValueError(f"Unsupported Qwen3-ASR model '{candidate}'. Supported: {supported}")


def normalize_aligner_model(model: str | None) -> str:
    candidate = (model or "qwen3-forced-aligner-0.6B").strip()
    normalized = ALIGNER_MODEL_ALIASES.get(candidate.lower())
    if normalized:
        return normalized
    if candidate in ALIGNER_MODEL_REPOS:
        return candidate
    supported = ", ".join(ALIGNER_MODEL_REPOS)
    raise ValueError(
        f"Unsupported Qwen3 forced aligner '{candidate}'. Supported: {supported}"
    )


def model_repo_for_backend(repos: dict[str, str], backend: str) -> str:
    return repos["mlx" if backend == "mlx" else "pytorch"]


def normalize_language(language: str) -> str:
    value = language.strip().lower()
    if value not in LANGUAGES:
        supported = ", ".join(LANGUAGES)
        raise ValueError(f"Unsupported Qwen3-TTS language '{language}'. Supported: {supported}")
    return value


def normalize_asr_language(language: str | None) -> tuple[str | None, str | None]:
    value = (language or "auto").strip().lower()
    if not value or value == "auto":
        return None, None
    code = value.split("-", 1)[0].split("_", 1)[0]
    if code not in QWEN3_ASR_LANGUAGES:
        supported = ", ".join(QWEN3_ASR_LANGUAGES)
        raise ValueError(f"Unsupported Qwen3-ASR language '{language}'. Supported: {supported}")
    return code, QWEN3_ASR_LANGUAGES[code]


def language_code_for_label(label: str | None) -> str | None:
    if not label:
        return None
    normalized = label.strip().lower()
    for code, language_label in QWEN3_ASR_LANGUAGES.items():
        if normalized in {code.lower(), language_label.lower()}:
            return code
    return None


def create_smoke_wav(path: Path, duration_seconds: float = 0.6) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 24_000
    frame_count = int(sample_rate * duration_seconds)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for index in range(frame_count):
            value = int(0.10 * 32767 * math.sin(2 * math.pi * 330 * index / sample_rate))
            wav.writeframesraw(struct.pack("<h", value))


def write_wav(path: Path, samples: Any, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if module_available("soundfile"):
        import soundfile as sf

        sf.write(str(path), samples, sample_rate)
        return

    try:
        import numpy as np
    except ImportError as error:
        raise ValueError("soundfile or numpy is required to write model audio") from error

    array = np.asarray(samples, dtype=np.float32)
    array = np.clip(array, -1.0, 1.0)
    pcm = (array * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1 if pcm.ndim == 1 else pcm.shape[1])
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())


def synthesize_with_mlx(
    *,
    text: str,
    output_path: Path,
    model_repo: str,
    language: str,
) -> dict[str, Any]:
    if not module_available("mlx_audio"):
        raise ValueError("mlx_audio is required for the MLX Qwen3-TTS backend")

    import numpy as np
    from mlx_audio.tts import load

    model = load(model_repo)
    audio_chunks = []
    sample_rate = 24000
    lang = LANGUAGES.get(language, "English")
    for result in model.generate(text, lang_code=lang):
        audio_chunks.append(np.array(result.audio))
        sample_rate = int(result.sample_rate)

    audio = (
        np.concatenate([np.asarray(chunk, dtype=np.float32) for chunk in audio_chunks])
        if audio_chunks
        else np.array([], dtype=np.float32)
    )
    write_wav(output_path, audio, sample_rate)
    return {"sampleRate": sample_rate, "backend": "mlx"}


def synthesize_with_pytorch(
    *,
    text: str,
    output_path: Path,
    model_repo: str,
    language: str,
    cache_dir: str | None,
) -> dict[str, Any]:
    if not module_available("qwen_tts"):
        raise ValueError("qwen_tts is required for the PyTorch Qwen3-TTS backend")

    from qwen_tts import Qwen3TTSModel

    kwargs: dict[str, Any] = {}
    if cache_dir:
        kwargs["cache_dir"] = cache_dir
    model = Qwen3TTSModel.from_pretrained(model_repo, **kwargs)

    if hasattr(model, "generate"):
        generated = model.generate(text=text, language=language)
    elif hasattr(model, "synthesize"):
        generated = model.synthesize(text=text, language=language)
    else:
        raise ValueError("qwen_tts backend does not expose generate or synthesize")

    if isinstance(generated, (str, Path)):
        produced_path = Path(generated)
        if not produced_path.is_file():
            raise ValueError(f"qwen_tts produced missing audio path: {produced_path}")
        produced_path.replace(output_path)
        return {"sampleRate": 24000, "backend": "pytorch"}

    if isinstance(generated, tuple) and len(generated) >= 2:
        samples, sample_rate = generated[0], int(generated[1])
    elif isinstance(generated, dict):
        samples = generated.get("audio") or generated.get("samples") or generated.get("wav")
        sample_rate = int(generated.get("sample_rate") or generated.get("sampleRate") or 24000)
    else:
        samples = generated
        sample_rate = 24000

    write_wav(output_path, samples, sample_rate)
    return {"sampleRate": sample_rate, "backend": "pytorch"}


def synthesize(args: argparse.Namespace) -> dict[str, Any]:
    model_id = normalize_tts_model(args.model)
    language = normalize_language(args.language)
    text = args.text.strip()
    if not text:
        raise ValueError("Text cannot be empty")

    output_path = Path(args.output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    backend = preferred_backend()
    model_repo = model_repo_for_backend(TTS_MODEL_REPOS[model_id], backend)

    if args.cache_dir:
        cache_dir = str(Path(args.cache_dir).expanduser())
        os.environ["HF_HOME"] = os.environ.get("HF_HOME", str(Path(cache_dir).parent / "hf"))
        os.environ["HF_HUB_CACHE"] = os.environ.get("HF_HUB_CACHE", str(Path(cache_dir) / "hub"))
    else:
        cache_dir = None

    if os.environ.get("OPENBRIEF_QWEN_TTS_SMOKE") == "1":
        create_smoke_wav(output_path)
        synthesis = {"sampleRate": 24000, "backend": "smoke"}
    elif backend == "mlx":
        synthesis = synthesize_with_mlx(
            text=text,
            output_path=output_path,
            model_repo=model_repo,
            language=language,
        )
    else:
        synthesis = synthesize_with_pytorch(
            text=text,
            output_path=output_path,
            model_repo=model_repo,
            language=language,
            cache_dir=cache_dir,
        )

    return {
        "outputPath": str(output_path),
        "model": model_id,
        "modelRepo": model_repo,
        "language": language,
        "presetVoice": args.preset_voice,
        "voiceClone": False,
        "backend": synthesis["backend"],
        "sampleRate": synthesis["sampleRate"],
        "sizeBytes": output_path.stat().st_size,
    }


def models() -> list[dict[str, Any]]:
    backend = preferred_backend()
    return [
        {
            "id": model_id,
            "repo": model_repo_for_backend(repos, backend),
            "repos": repos,
            "engine": "qwen",
            "backend": backend,
            "languages": [
                {"code": code, "label": label} for code, label in LANGUAGES.items()
            ],
            "presetVoices": [{"id": "default", "label": "Default"}],
            "voiceCloning": True,
        }
        for model_id, repos in TTS_MODEL_REPOS.items()
    ]


def asr_models() -> list[dict[str, Any]]:
    backend = preferred_backend()
    aligner_id = "qwen3-forced-aligner-0.6B"
    aligner_repos = ALIGNER_MODEL_REPOS[aligner_id]
    return [
        {
            "id": model_id,
            "repo": model_repo_for_backend(repos, backend),
            "repos": repos,
            "engine": "qwen3-asr",
            "backend": backend,
            "languages": [
                {"code": code, "label": label}
                for code, label in QWEN3_ASR_LANGUAGES.items()
            ],
            "forcedAligner": {
                "id": aligner_id,
                "repo": model_repo_for_backend(aligner_repos, backend),
                "repos": aligner_repos,
                "languages": [
                    {"code": code, "label": label}
                    for code, label in QWEN3_ALIGNER_LANGUAGES.items()
                ],
            },
        }
        for model_id, repos in ASR_MODEL_REPOS.items()
    ]


def normalize_alignment_items(alignment: Any) -> list[dict[str, Any]]:
    if alignment is None:
        return []
    if hasattr(alignment, "items"):
        raw_items = alignment.items
    else:
        raw_items = alignment
    words = []
    for item in raw_items or []:
        if isinstance(item, dict):
            text = item.get("text") or item.get("word") or ""
            start = item.get("start_time", item.get("start", item.get("startSeconds", 0.0)))
            end = item.get("end_time", item.get("end", item.get("endSeconds", start)))
        else:
            text = getattr(item, "text", getattr(item, "word", ""))
            start = getattr(item, "start_time", getattr(item, "start", 0.0))
            end = getattr(item, "end_time", getattr(item, "end", start))
        if str(text).strip():
            words.append(
                {
                    "text": str(text),
                    "startSeconds": round(float(start), 3),
                    "endSeconds": round(float(end), 3),
                }
            )
    return words


def transcript_segments(text: str, words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if words:
        return [
            {
                "id": "qwen3-asr-segment-1",
                "startSeconds": words[0]["startSeconds"],
                "endSeconds": words[-1]["endSeconds"],
                "text": text,
                "sourceKind": "local-stt",
                "words": words,
            }
        ]
    return [
        {
            "id": "qwen3-asr-segment-1",
            "startSeconds": 0.0,
            "text": text,
            "sourceKind": "local-stt",
            "words": [],
        }
    ]


def smoke_transcript(text: str, language: str | None) -> dict[str, Any]:
    words = [
        {"text": "Welcome", "startSeconds": 0.0, "endSeconds": 0.32},
        {"text": "to", "startSeconds": 0.32, "endSeconds": 0.48},
        {"text": "OpenBrief", "startSeconds": 0.48, "endSeconds": 0.9},
    ]
    return {
        "text": text or "Welcome to OpenBrief",
        "language": language or "en",
        "segments": transcript_segments(text or "Welcome to OpenBrief", words),
    }


def transcribe_with_mlx(
    *,
    audio_path: Path,
    model_repo: str,
    aligner_repo: str,
    language_label: str | None,
) -> dict[str, Any]:
    if not module_available("mlx_audio"):
        raise ValueError("mlx_audio is required for the MLX Qwen3-ASR backend")

    from mlx_audio.stt.utils import load_model

    asr_model = load_model(model_repo)
    asr_result = asr_model.generate(
        str(audio_path),
        language=language_label,
        verbose=False,
    )
    text = str(getattr(asr_result, "text", "")).strip()
    detected_language = getattr(asr_result, "language", None) or language_label
    aligner_language = language_label or detected_language or "English"
    aligner_code = language_code_for_label(str(aligner_language))
    if aligner_code and aligner_code not in QWEN3_ALIGNER_LANGUAGES:
        raise ValueError(f"Qwen3 forced aligner does not support {aligner_language}")

    aligner_model = load_model(aligner_repo)
    alignment = aligner_model.generate(
        str(audio_path),
        text=text,
        language=aligner_language,
    )
    words = normalize_alignment_items(alignment)
    return {
        "text": text,
        "language": aligner_code or language_code_for_label(str(detected_language)) or "en",
        "segments": transcript_segments(text, words),
    }


def torch_device_kwargs() -> dict[str, Any]:
    import torch

    if torch.cuda.is_available():
        return {"dtype": torch.bfloat16, "device_map": "cuda:0"}
    return {"dtype": torch.float32, "device_map": "cpu"}


def transcribe_with_pytorch(
    *,
    audio_path: Path,
    model_repo: str,
    aligner_repo: str,
    language_label: str | None,
    cache_dir: str | None,
) -> dict[str, Any]:
    if not module_available("qwen_asr"):
        raise ValueError("qwen_asr is required for the PyTorch Qwen3-ASR backend")

    from qwen_asr import Qwen3ASRModel

    model_kwargs = {
        **torch_device_kwargs(),
        "max_inference_batch_size": 1,
        "max_new_tokens": 512,
        "forced_aligner": aligner_repo,
        "forced_aligner_kwargs": torch_device_kwargs(),
    }
    if cache_dir:
        model_kwargs["cache_dir"] = cache_dir

    model = Qwen3ASRModel.from_pretrained(model_repo, **model_kwargs)
    results = model.transcribe(
        audio=str(audio_path),
        language=language_label,
        return_time_stamps=True,
    )
    result = results[0]
    text = str(getattr(result, "text", "")).strip()
    language_code = language_code_for_label(getattr(result, "language", None)) or "en"
    alignments = []
    for item in getattr(result, "time_stamps", None) or []:
        if hasattr(item, "items"):
            alignments.extend(list(item.items))
        elif isinstance(item, list):
            alignments.extend(item)
        else:
            alignments.append(item)
    words = normalize_alignment_items(alignments)
    return {
        "text": text,
        "language": language_code,
        "segments": transcript_segments(text, words),
    }


def transcribe(args: argparse.Namespace) -> dict[str, Any]:
    model_id = normalize_asr_model(args.model)
    aligner_id = normalize_aligner_model(args.aligner)
    language_code, language_label = normalize_asr_language(args.language)
    if language_code and language_code not in QWEN3_ALIGNER_LANGUAGES:
        raise ValueError(
            f"Qwen3 forced aligner does not support '{args.language}'. "
            f"Supported timestamp languages: {', '.join(QWEN3_ALIGNER_LANGUAGES)}"
        )

    audio_path = Path(args.audio).expanduser()
    if not audio_path.is_file() and os.environ.get("OPENBRIEF_QWEN_ASR_SMOKE") != "1":
        raise ValueError(f"Audio file not found: {audio_path}")

    output_path = Path(args.output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    backend = preferred_backend()
    model_repo = model_repo_for_backend(ASR_MODEL_REPOS[model_id], backend)
    aligner_repo = model_repo_for_backend(ALIGNER_MODEL_REPOS[aligner_id], backend)

    if args.cache_dir:
        cache_dir = str(Path(args.cache_dir).expanduser())
        os.environ["HF_HOME"] = os.environ.get("HF_HOME", str(Path(cache_dir).parent / "hf"))
        os.environ["HF_HUB_CACHE"] = os.environ.get("HF_HUB_CACHE", str(Path(cache_dir) / "hub"))
    else:
        cache_dir = None

    if os.environ.get("OPENBRIEF_QWEN_ASR_SMOKE") == "1":
        transcript = smoke_transcript(args.smoke_text, language_code)
        actual_backend = "smoke"
    elif backend == "mlx":
        transcript = transcribe_with_mlx(
            audio_path=audio_path,
            model_repo=model_repo,
            aligner_repo=aligner_repo,
            language_label=language_label,
        )
        actual_backend = "mlx"
    else:
        transcript = transcribe_with_pytorch(
            audio_path=audio_path,
            model_repo=model_repo,
            aligner_repo=aligner_repo,
            language_label=language_label,
            cache_dir=cache_dir,
        )
        actual_backend = "pytorch"

    result = {
        "command": "transcribe_audio",
        "transcriptPath": str(output_path),
        "text": transcript["text"],
        "segments": transcript["segments"],
        "engine": "qwen3-asr",
        "modelId": model_id,
        "modelRepo": model_repo,
        "forcedAligner": {
            "modelId": aligner_id,
            "modelRepo": aligner_repo,
            "enabled": True,
        },
        "language": transcript["language"],
        "backend": actual_backend,
    }
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="openbrief-voicebox")
    subcommands = parser.add_subparsers(dest="command", required=True)

    subcommands.add_parser("runtime", help="Print Qwen runtime capabilities as JSON")
    subcommands.add_parser("models", help="Print Qwen TTS/ASR model catalog as JSON")

    read = subcommands.add_parser("read", help="Synthesize speech with a Qwen3-TTS preset voice")
    read.add_argument("text_arg", nargs="?", default="")
    read.add_argument("--text", default="")
    read.add_argument("--model", default="qwen-tts-0.6B")
    read.add_argument("--language", default="en")
    read.add_argument("--preset-voice", default="default")
    read.add_argument("--output", default="openbrief-qwen-tts.wav")
    read.add_argument("--cache-dir", default="")

    transcribe_parser = subcommands.add_parser(
        "transcribe",
        help="Transcribe audio with Qwen3-ASR and Qwen3-ForcedAligner timestamps",
    )
    transcribe_parser.add_argument("--audio", required=True)
    transcribe_parser.add_argument("--model", default="qwen3-asr-0.6B")
    transcribe_parser.add_argument("--aligner", default="qwen3-forced-aligner-0.6B")
    transcribe_parser.add_argument("--language", default="auto")
    transcribe_parser.add_argument("--output", default="openbrief-qwen-asr.json")
    transcribe_parser.add_argument("--cache-dir", default="")
    transcribe_parser.add_argument("--smoke-text", default="Welcome to OpenBrief")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "runtime":
            print(json.dumps(runtime_info(), ensure_ascii=False))
            return 0
        if args.command == "models":
            print(json.dumps({"models": models(), "asrModels": asr_models()}, ensure_ascii=False))
            return 0
        if args.command == "read":
            args.text = args.text or args.text_arg
            print(json.dumps(synthesize(args), ensure_ascii=False))
            return 0
        if args.command == "transcribe":
            print(json.dumps(transcribe(args), ensure_ascii=False))
            return 0
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1

    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
