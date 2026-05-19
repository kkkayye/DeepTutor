"""
Agents Module - Unified agent system for OpenTutor.

This module provides a unified BaseAgent class and module-specific agents:
- solve: Question solving agents (MainSolver, SolveAgent, etc.)
- research: Deep research agents (DecomposeAgent, ResearchAgent, etc.)
- question: Question generation agents (ReAct architecture, separate base)
- chat: Lightweight conversational agent with session management

Note: ``co_writer`` and ``book`` are independent top-level modules under
``socartes/`` (e.g. ``socartes.co_writer``, ``socartes.book``). They
still inherit from :class:`BaseAgent` defined here but are not part of
the ``socartes.agents`` package.

Usage:
    from socartes.agents.base_agent import BaseAgent

    class MyAgent(BaseAgent):
        async def process(self, *args, **kwargs):
            ...
"""

from .base_agent import BaseAgent
from .chat import ChatAgent, SessionManager

__all__ = ["BaseAgent", "ChatAgent", "SessionManager"]
