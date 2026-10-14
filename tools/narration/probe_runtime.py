"""Explicit, offline preflight. Does not load weights, generate audio or install packages."""
import json
import sys
import os
import time
from pathlib import Path
from generate import disable_network

disable_network()
report = {"ready": False, "python": sys.version.split()[0], "cuda": False}
started = time.monotonic()
def stage(value):
    destination = os.environ.get("STUDIO_NARRATION_PROBE_REPORT")
    if destination:
        Path(destination).write_text(json.dumps({**report, "stage": value, "elapsedSeconds": time.monotonic()-started}, ensure_ascii=False), encoding="utf-8")
try:
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError("python-3.12-required")
    stage("import-soundfile")
    import soundfile
    stage("import-torch")
    import torch
    stage("import-qwen")
    from qwen_tts import Qwen3TTSModel
    stage("cuda")
    report["cuda"] = torch.cuda.is_available()
    if not report["cuda"]:
        raise RuntimeError("cuda-required")
    gpu = torch.cuda.get_device_properties(0)
    report.update(gpu=gpu.name, vramBytes=gpu.total_memory)
    if not torch.cuda.is_bf16_supported():
        raise RuntimeError("bfloat16-required")
    report["ready"] = True
except Exception as error:
    # No traceback, account data or environment is returned to the renderer.
    report["error"] = type(error).__name__
stage("complete")
print(json.dumps(report, ensure_ascii=False))
