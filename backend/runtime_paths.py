from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"
DEFAULT_RUNTIME_DIR = ROOT_DIR / "runtime"
SERVERLESS_RUNTIME_ROOT = Path(tempfile.gettempdir()) / "ai-copy-workbench"


def _resolve_override(name: str) -> Path | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    return Path(raw).expanduser().resolve()


def is_serverless_runtime() -> bool:
    return bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))


@dataclass(frozen=True)
class RuntimePaths:
    root_dir: Path
    dist_dir: Path
    runtime_dir: Path
    cache_dir: Path
    state_dir: Path
    serverless: bool


def resolve_runtime_paths() -> RuntimePaths:
    serverless = is_serverless_runtime()
    runtime_override = _resolve_override("AI_COPY_WORKBENCH_RUNTIME_DIR")
    cache_override = _resolve_override("AI_COPY_WORKBENCH_CACHE_DIR")
    state_override = _resolve_override("AI_COPY_WORKBENCH_STATE_DIR")

    runtime_dir = runtime_override or (SERVERLESS_RUNTIME_ROOT if serverless else DEFAULT_RUNTIME_DIR)
    cache_dir = cache_override or (runtime_dir / "cache" if serverless else runtime_dir)
    state_dir = state_override or (runtime_dir / "state" if serverless else runtime_dir)

    return RuntimePaths(
        root_dir=ROOT_DIR,
        dist_dir=DIST_DIR,
        runtime_dir=runtime_dir,
        cache_dir=cache_dir,
        state_dir=state_dir,
        serverless=serverless,
    )


def ensure_runtime_paths(paths: RuntimePaths | None = None) -> RuntimePaths:
    resolved = paths or resolve_runtime_paths()
    for path in {resolved.runtime_dir, resolved.cache_dir, resolved.state_dir}:
        path.mkdir(parents=True, exist_ok=True)
    return resolved
