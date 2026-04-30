"""HTTP API views for Local ADS-B Receiver dashboard history."""

from __future__ import annotations

from typing import Any

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DEFAULT_HISTORY_SECONDS, DOMAIN, MAX_HISTORY_SECONDS
from .coordinator import LocalAdsbDataUpdateCoordinator


class LocalAdsbHistoryView(HomeAssistantView):
    """Return in-memory aircraft position history for Lovelace cards."""

    url = "/api/local_adsb/history"
    name = "api:local_adsb:history"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the history API view."""

        self.hass = hass

    async def get(self, request: web.Request) -> web.Response:
        """Return aircraft history for all loaded Local ADS-B entries."""

        seconds = _bounded_seconds(request.query.get("seconds"))
        coordinators: dict[str, LocalAdsbDataUpdateCoordinator] = self.hass.data.get(
            DOMAIN, {}
        ).get("coordinators", {})
        entries = [coordinator.history_payload(seconds) for coordinator in coordinators.values()]

        aircraft: dict[str, Any] = {}
        generated_at = None
        for entry in entries:
            generated_at = max(generated_at or 0, entry["generated_at"])
            for hex_id, details in entry["aircraft"].items():
                existing = aircraft.get(hex_id)
                if existing is None or len(details["points"]) > len(existing["points"]):
                    aircraft[hex_id] = details

        return self.json(
            {
                "generated_at": generated_at,
                "history_seconds": seconds,
                "entries": entries,
                "aircraft": aircraft,
            }
        )


def _bounded_seconds(value: str | None) -> int:
    """Return a safe history window in seconds."""

    if value is None:
        return DEFAULT_HISTORY_SECONDS
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return DEFAULT_HISTORY_SECONDS
    return max(1, min(seconds, MAX_HISTORY_SECONDS))
