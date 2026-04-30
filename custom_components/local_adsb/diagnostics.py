"""Diagnostics for Local ADS-B Receiver."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .coordinator import LocalAdsbDataUpdateCoordinator


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""

    coordinator: LocalAdsbDataUpdateCoordinator = entry.runtime_data
    data = coordinator.data
    return {
        "entry": {
            "title": entry.title,
            "aircraft_url": entry.data.get("aircraft_url"),
            "monitor_url": entry.data.get("monitor_url"),
            "scan_interval": entry.data.get("scan_interval"),
        },
        "last_update_success": coordinator.last_update_success,
        "counts": {
            "aircraft_visible": data.aircraft_visible if data else None,
            "aircraft_with_position": data.aircraft_with_position if data else None,
            "messages": data.messages if data else None,
        },
        "monitor": _redact_monitor(data.monitor if data else {}),
    }


def _redact_monitor(monitor: dict[str, Any]) -> dict[str, Any]:
    redacted = dict(monitor)
    for key in ("fr24key",):
        if key in redacted:
            redacted[key] = "REDACTED"
    return redacted
