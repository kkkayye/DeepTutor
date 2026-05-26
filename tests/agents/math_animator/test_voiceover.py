from pathlib import Path

import pytest

from socartes.agents.math_animator.models import RenderedArtifact, RenderResult, SummaryPayload
from socartes.agents.math_animator.voiceover import (
    add_edge_voiceover_to_render_result,
    choose_edge_voice,
    compose_voiceover_script,
)
from socartes.services.path_service import PathService


def test_choose_edge_voice_prefers_visible_language() -> None:
    assert choose_edge_voice("순환 신경망을 설명합니다.", "zh") == "ko-KR-SunHiNeural"
    assert choose_edge_voice("Explain recurrent neural networks.", "en") == "en-US-AriaNeural"
    assert choose_edge_voice("解释卷积神经网络。", "en") == "zh-CN-XiaoxiaoNeural"


def test_compose_voiceover_script_uses_summary_first() -> None:
    script = compose_voiceover_script(
        user_input="讲解 CNN",
        summary=SummaryPayload(
            summary_text="CNN first detects local patterns.",
            key_points=["Convolution scans small windows", "Pooling compresses features"],
        ),
    )

    assert script.startswith("CNN first detects local patterns.")
    assert "Convolution scans small windows" in script


@pytest.mark.asyncio
async def test_add_edge_voiceover_prepends_generated_artifact(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(PathService, "_instance", PathService(tmp_path))
    path_service = PathService.get_instance()
    monkeypatch.setattr(
        "socartes.agents.math_animator.voiceover.get_path_service",
        lambda: path_service,
    )
    artifacts_dir = path_service.get_agent_dir("math_animator") / "turn-1" / "artifacts"
    artifacts_dir.mkdir(parents=True)
    video_path = artifacts_dir / "turn-1-scene.mp4"
    video_path.write_bytes(b"video")
    rel_path = video_path.relative_to(path_service.user_data_dir)
    render_result = RenderResult(
        output_mode="video",
        artifacts=[
            RenderedArtifact(
                type="video",
                url=f"/api/outputs/{rel_path.as_posix()}",
                filename=video_path.name,
                content_type="video/mp4",
                label="Animation video",
            )
        ],
    )

    monkeypatch.setattr(
        "socartes.agents.math_animator.voiceover.importlib.util.find_spec",
        lambda name: object() if name == "edge_tts" else None,
    )
    monkeypatch.setattr("socartes.agents.math_animator.voiceover.shutil.which", lambda name: name)

    async def fake_synthesize(*, text: str, voice: str, output_path: Path) -> None:
        output_path.write_bytes(b"audio")

    async def fake_mux(*, video_path: Path, audio_path: Path, output_path: Path) -> None:
        output_path.write_bytes(video_path.read_bytes() + audio_path.read_bytes())

    monkeypatch.setattr(
        "socartes.agents.math_animator.voiceover._synthesize_edge_tts",
        fake_synthesize,
    )
    monkeypatch.setattr("socartes.agents.math_animator.voiceover._mux_voiceover", fake_mux)

    result = await add_edge_voiceover_to_render_result(
        render_result=render_result,
        narration_text="Short narration.",
        language="en",
    )

    assert result.artifacts[0].filename == "turn-1-scene-edge-voiceover.mp4"
    assert result.artifacts[0].label == "Edge TTS voiceover video"
    assert result.artifacts[0].url.endswith("/turn-1-scene-edge-voiceover.mp4")
    assert result.artifacts[1].filename == "turn-1-scene.mp4"
