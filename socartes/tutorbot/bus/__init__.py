"""Message bus module for decoupled channel-agent communication."""

from socartes.tutorbot.bus.events import InboundMessage, OutboundMessage
from socartes.tutorbot.bus.queue import MessageBus

__all__ = ["MessageBus", "InboundMessage", "OutboundMessage"]
