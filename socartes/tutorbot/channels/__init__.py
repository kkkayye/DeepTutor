"""Chat channels module with plugin architecture."""

from socartes.tutorbot.channels.base import BaseChannel
from socartes.tutorbot.channels.manager import ChannelManager

__all__ = ["BaseChannel", "ChannelManager"]
