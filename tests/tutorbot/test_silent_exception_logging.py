from __future__ import annotations

import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_targeted_exception_handlers_do_not_silently_pass() -> None:
    targets = [
        "socartes/services/memory/service.py",
        "socartes/tutorbot/channels/telegram.py",
        "socartes/tutorbot/channels/email.py",
        "socartes/tutorbot/channels/matrix.py",
        "socartes/tutorbot/channels/zulip.py",
        "socartes/tutorbot/channels/mochat.py",
    ]
    pattern = re.compile(r"except\s+Exception\s*:\s*\n\s*pass\b")
    offenders = [
        path
        for path in targets
        if pattern.search((PROJECT_ROOT / path).read_text(encoding="utf-8"))
    ]

    assert offenders == []
