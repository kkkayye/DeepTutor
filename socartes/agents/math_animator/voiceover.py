"""Optional Edge TTS voiceover support for math animator videos."""

from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import re
import shutil
import subprocess
from typing import Awaitable, Callable
from urllib.parse import urlparse

from socartes.services.path_service import get_path_service

from .models import ConceptAnalysis, RenderedArtifact, RenderResult, SceneDesign, SummaryPayload
from .utils import trim_error_message

ProgressCallback = Callable[[str, bool], Awaitable[None]]

OUTPUT_PREFIX = "/api/outputs/"
VOICEOVER_RE = re.compile(r"edge[-_ ]?voiceover|voiceover|配音", re.IGNORECASE)


async def add_edge_voiceover_to_render_result(
    *,
    render_result: RenderResult,
    narration_text: str,
    language: str,
    progress_callback: ProgressCallback | None = None,
) -> RenderResult:
    """Return a copy of ``render_result`` with a voiceover mp4 prepended when possible."""

    if getattr(render_result, "output_mode", "video") != "video":
        return render_result
    if not narration_text.strip():
        await _emit(progress_callback, "Skipped voiceover: no narration text.")
        return render_result
    artifacts = list(getattr(render_result, "artifacts", []) or [])
    if any(_is_voiceover_artifact(artifact) for artifact in artifacts):
        return render_result
    if importlib.util.find_spec("edge_tts") is None:
        await _emit(progress_callback, "Skipped voiceover: edge-tts is not installed.")
        return render_result
    if shutil.which("ffmpeg") is None:
        await _emit(progress_callback, "Skipped voiceover: ffmpeg is not installed.")
        return render_result

    video_artifact = next(
        (artifact for artifact in artifacts if getattr(artifact, "type", "") == "video"),
        None,
    )
    if video_artifact is None:
        return render_result

    path_service = get_path_service()
    video_path = _artifact_path(video_artifact, path_service.user_data_dir)
    if video_path is None or not video_path.is_file():
        await _emit(progress_callback, "Skipped voiceover: rendered video file was not found.")
        return render_result

    meta_dir = video_path.parent.parent / "meta"
    meta_dir.mkdir(parents=True, exist_ok=True)
    audio_path = meta_dir / f"{video_path.stem}-edge-voiceover.mp3"
    output_path = video_path.with_name(f"{video_path.stem}-edge-voiceover.mp4")
    voice = choose_edge_voice(narration_text, language)

    try:
        await _emit(progress_callback, f"Synthesizing voiceover with Edge TTS voice {voice}.")
        await _synthesize_edge_tts(
            text=clamp_narration(narration_text),
            voice=voice,
            output_path=audio_path,
        )
        await _emit(progress_callback, "Merging narration into rendered video.")
        await _mux_voiceover(video_path=video_path, audio_path=audio_path, output_path=output_path)
    except Exception as exc:  # pragma: no cover - defensive around optional external tools
        await _emit(
            progress_callback,
            f"Skipped voiceover: {trim_error_message(str(exc), limit=300)}",
        )
        return render_result

    voiceover_artifact = _build_artifact(
        output_path,
        artifact_type="video",
        content_type="video/mp4",
        label="Edge TTS voiceover video",
    )
    return render_result.model_copy(
        update={"artifacts": [voiceover_artifact, *render_result.artifacts]}
    )


def compose_voiceover_script(
    *,
    user_input: str,
    summary: SummaryPayload | None = None,
    analysis: ConceptAnalysis | None = None,
    design: SceneDesign | None = None,
) -> str:
    parts: list[str] = []
    if summary is not None:
        key_points = list(getattr(summary, "key_points", []) or [])
        parts.extend(
            [
                getattr(summary, "summary_text", ""),
                getattr(summary, "generated_output", ""),
                ". ".join(key_points[:3]),
            ]
        )
    if analysis is not None:
        parts.extend(list(getattr(analysis, "narrative_steps", []) or [])[:3])
        learning_goal = getattr(analysis, "learning_goal", "")
        if learning_goal:
            parts.append(learning_goal)
    if design is not None:
        parts.extend(list(getattr(design, "animation_notes", []) or [])[:2])
    parts.append(user_input)

    seen: set[str] = set()
    cleaned: list[str] = []
    for part in parts:
        text = _clean_text(part)
        if not text or text in seen:
            continue
        seen.add(text)
        cleaned.append(text)

    return clamp_narration(" ".join(cleaned))


def clamp_narration(text: str, *, max_chars: int = 700) -> str:
    text = _clean_text(text)
    if len(text) <= max_chars:
        return text
    clipped = text[:max_chars].rsplit(" ", 1)[0].strip()
    return clipped or text[:max_chars].strip()


def choose_edge_voice(text: str, language: str) -> str:
    lang = (language or "").lower()
    if lang.startswith("ko") or re.search(r"[\uac00-\ud7af]", text):
        return "ko-KR-SunHiNeural"
    if lang.startswith("ja") or re.search(r"[\u3040-\u30ff]", text):
        return "ja-JP-NanamiNeural"
    if lang.startswith("zh") or re.search(r"[\u4e00-\u9fff]", text):
        return "zh-CN-XiaoxiaoNeural"
    return "en-US-AriaNeural"


async def _synthesize_edge_tts(*, text: str, voice: str, output_path: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text=text, voice=voice)
    await communicate.save(str(output_path))


async def _mux_voiceover(*, video_path: Path, audio_path: Path, output_path: Path) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-i",
        str(audio_path),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    result = await asyncio.to_thread(
        subprocess.run,
        command,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "ffmpeg voiceover merge failed")


def _artifact_path(artifact: RenderedArtifact, user_data_dir: Path) -> Path | None:
    url = str(getattr(artifact, "url", "") or "")
    if not url:
        return None
    parsed = urlparse(url)
    url_path = parsed.path or url
    if not url_path.startswith(OUTPUT_PREFIX):
        return None
    rel_path = url_path[len(OUTPUT_PREFIX) :].lstrip("/")
    root = user_data_dir.resolve()
    candidate = (root / rel_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def _build_artifact(
    artifact_path: Path,
    *,
    artifact_type: str,
    content_type: str,
    label: str,
) -> RenderedArtifact:
    path_service = get_path_service()
    rel_path = artifact_path.resolve().relative_to(path_service.user_data_dir.resolve())
    return RenderedArtifact(
        type=artifact_type,
        filename=artifact_path.name,
        url=f"/api/outputs/{rel_path.as_posix()}",
        content_type=content_type,
        label=label,
    )


def _is_voiceover_artifact(artifact: RenderedArtifact) -> bool:
    filename = str(getattr(artifact, "filename", "") or "")
    label = str(getattr(artifact, "label", "") or "")
    return bool(VOICEOVER_RE.search(f"{filename} {label}"))


def _clean_text(value: str) -> str:
    text = str(value or "")
    text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"[*_#>\-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


async def _emit(callback: ProgressCallback | None, message: str, raw: bool = False) -> None:
    if callback is not None:
        await callback(message, raw)


__all__ = [
    "add_edge_voiceover_to_render_result",
    "choose_edge_voice",
    "clamp_narration",
    "compose_voiceover_script",
]
