"""Offline narration worker: preset or explicitly authorized reference voice.

Used by Electron and the developer CLI. Install models separately; never download at inference.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import time


def local_file(value: str, suffixes: set[str]) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute() or not path.is_file():
        raise ValueError("Expected an existing absolute local file path")
    if path.suffix.lower() not in suffixes:
        raise ValueError("Unsupported local file type")
    return path.resolve()


def validate_job(job: dict, output: Path) -> dict:
    mode = job.get("mode")
    if mode not in ("preset", "clone"):
        raise ValueError("mode must be preset or clone")
    instruction = job.get("instruct", "")
    if not isinstance(instruction, str) or len(instruction) > 1200:
        raise ValueError("Tone instruction must be text of at most 1200 characters")
    if mode == "clone" and "instruct" in job:
        raise ValueError("Tone control is not supported for voice cloning")
    text = job.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 2000:
        raise ValueError("text must contain 1 to 2000 characters")
    if not output.is_absolute() or output.suffix.lower() != ".wav":
        raise ValueError("output must be an absolute WAV path")
    if output.exists() or output.with_suffix(".json").exists():
        raise FileExistsError("Choose a new output version; existing files are preserved")
    if mode == "clone":
        if job.get("speakerConsent") is not True:
            raise ValueError("Explicit speaker permission is required for voice cloning")
        reference = local_file(job.get("referenceAudio", ""), {".wav", ".flac"})
        if reference.stat().st_size > 25 * 1024 * 1024:
            raise ValueError("Reference audio exceeds 25 MiB")
        transcript = job.get("referenceText")
        if not isinstance(transcript, str) or not transcript.strip():
            raise ValueError("Provide a transcript of the reference recording")
    elif any(key in job for key in ("referenceAudio", "referenceText", "speakerConsent")):
        raise ValueError("Preset mode must not read or depend on a personal recording")
    return job


def validate_tone_model(job: dict, config: dict) -> None:
    if job.get("instruct", "").strip() and (
        config.get("tts_model_type") != "custom_voice" or config.get("tts_model_size") != "1b7"
    ):
        raise ValueError("Tone control requires Qwen3-TTS 1.7B CustomVoice; this model would ignore it")


def disable_network() -> None:
    os.environ.update(
        HF_HUB_OFFLINE="1",
        TRANSFORMERS_OFFLINE="1",
        HF_HUB_DISABLE_TELEMETRY="1",
        HF_HUB_DISABLE_IMPLICIT_TOKEN="1",
        GRADIO_ANALYTICS_ENABLED="False",
    )

    def denied(*_args, **_kwargs):
        raise RuntimeError("Network is disabled during local narration generation")

    socket.socket.connect = denied
    socket.socket.connect_ex = denied
    socket.create_connection = denied


def generate(job: dict, config: dict, output: Path) -> dict:
    validate_job(job, output)
    model_path = Path(config[job["mode"] + "Model"]).resolve()
    if not model_path.is_dir() or not (model_path / "model.safetensors").is_file():
        raise ValueError("Install the local model before generation")
    validate_tone_model(job, json.loads((model_path / "config.json").read_text(encoding="utf-8")))
    disable_network()
    # Heavy libraries load only after local inputs and consent are checked.
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    torch.set_num_threads(4)
    # Preserve legacy/clone behavior; styled presets use the approved A/B QA seed.
    torch.manual_seed(20261014 if job.get("instruct", "").strip() else 20261011)
    if not torch.cuda.is_available():
        raise RuntimeError("This verified runtime requires a CUDA GPU; CPU mode is unverified")
    model = Qwen3TTSModel.from_pretrained(
        str(model_path), device_map="cuda:0", dtype=torch.bfloat16,
        attn_implementation="sdpa", local_files_only=True,
    )
    params = dict(text=job["text"], language="Korean", max_new_tokens=1800,
                  temperature=0.7, top_p=0.9, do_sample=True)
    started = time.monotonic()
    if job["mode"] == "clone":
        reference, rate = sf.read(job["referenceAudio"], dtype="float32")
        if reference.ndim > 1:
            reference = reference.mean(axis=1)
        if not 3 <= len(reference) / rate <= 30:
            raise ValueError("Choose 3 to 30 seconds of one consenting speaker")
        waves, sample_rate = model.generate_voice_clone(
            ref_audio=(reference, rate), ref_text=job["referenceText"], **params,
        )
    else:
        waves, sample_rate = model.generate_custom_voice(speaker="Sohee", instruct=job.get("instruct") or None, **params)
    wave = np.asarray(waves[0], dtype=np.float32)
    if not wave.size or not np.isfinite(wave).all():
        raise RuntimeError("Generation did not produce valid audio")
    if len(wave) / sample_rate >= 140:
        raise RuntimeError("Generation reached the duration ceiling; shorten the script")
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation also prevents accidental overwrite between preflight and write.
    with output.open("xb") as stream:
        sf.write(stream, wave, sample_rate, format="WAV", subtype="PCM_16")
    metadata = {
        "mode": job["mode"], "text": job["text"], "language": "ko",
        "speaker": "authorized-reference" if job["mode"] == "clone" else "Sohee",
        "model": model_path.name, "file": str(output),
        "instruction": job.get("instruct", ""),
        "sampleRate": sample_rate, "durationSec": len(wave) / sample_rate,
        "generationSec": time.monotonic() - started,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "network": "disabled in this process", "humanApproved": False,
    }
    with output.with_suffix(".json").open("x", encoding="utf-8") as stream:
        json.dump(metadata, stream, ensure_ascii=False, indent=2)
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", required=True, type=Path)
    parser.add_argument("--job", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args()
    result = generate(json.loads(options.job.read_text(encoding="utf-8")),
                      json.loads(options.runtime.read_text(encoding="utf-8")), options.output)
    print(json.dumps(result, ensure_ascii=False))
