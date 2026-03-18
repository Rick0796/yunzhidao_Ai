from __future__ import annotations

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

LEGACY_MODEL_MAP = {
    "gemini-2.0-flash-exp": DEFAULT_GEMINI_MODEL,
    "gemini-2.0-flash-thinking-exp": DEFAULT_GEMINI_MODEL,
    "gemini-2.0-flash-thinking-exp-01-21": DEFAULT_GEMINI_MODEL,
    "gemini-exp-1206": DEFAULT_GEMINI_MODEL,
}


def normalize_gemini_model_name(model: str | None, fallback: str = DEFAULT_GEMINI_MODEL) -> str:
    cleaned = (model or "").strip()
    if not cleaned:
        return fallback
    return LEGACY_MODEL_MAP.get(cleaned.lower(), cleaned)
