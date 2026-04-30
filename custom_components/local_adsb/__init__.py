"""Home Assistant integration for Local ADS-B Receiver."""

from __future__ import annotations

from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

try:
    from homeassistant.components.http import StaticPathConfig
except ImportError:  # pragma: no cover - compatibility with older Home Assistant releases
    StaticPathConfig = None  # type: ignore[assignment]

from .api import LocalAdsbApiClient
from .const import CONF_AIRCRAFT_URL, CONF_MONITOR_URL, DOMAIN
from .coordinator import LocalAdsbDataUpdateCoordinator
from .history import LocalAdsbHistoryView

PLATFORMS: list[Platform] = [Platform.BINARY_SENSOR, Platform.GEO_LOCATION, Platform.SENSOR]
FRONTEND_PATH = Path(__file__).parent / "frontend"
STATIC_PATH = "/local_adsb"

LocalAdsbConfigEntry = ConfigEntry


async def async_setup_entry(hass: HomeAssistant, entry: LocalAdsbConfigEntry) -> bool:
    """Set up Local ADS-B Receiver from a config entry."""

    await _async_register_frontend(hass)
    _async_register_history_api(hass)

    session = async_get_clientsession(hass)
    client = LocalAdsbApiClient(
        session=session,
        aircraft_url=entry.data[CONF_AIRCRAFT_URL],
        monitor_url=entry.data.get(CONF_MONITOR_URL),
    )
    coordinator = LocalAdsbDataUpdateCoordinator(hass, entry, client)

    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    hass.data.setdefault(DOMAIN, {}).setdefault("coordinators", {})[
        entry.entry_id
    ] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: LocalAdsbConfigEntry) -> bool:
    """Unload Local ADS-B Receiver."""

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data.setdefault(DOMAIN, {}).setdefault("coordinators", {}).pop(
            entry.entry_id, None
        )
    return unload_ok


async def _async_update_listener(hass: HomeAssistant, entry: LocalAdsbConfigEntry) -> None:
    """Reload the integration when options change."""

    await hass.config_entries.async_reload(entry.entry_id)


async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Expose the bundled Lovelace card JavaScript through Home Assistant."""

    data = hass.data.setdefault(DOMAIN, {})
    if data.get("frontend_registered"):
        return

    if StaticPathConfig is not None and hasattr(hass.http, "async_register_static_paths"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_PATH, str(FRONTEND_PATH), True)]
        )
    else:  # pragma: no cover - compatibility with older Home Assistant releases
        hass.http.register_static_path(STATIC_PATH, str(FRONTEND_PATH), True)

    data["frontend_registered"] = True


def _async_register_history_api(hass: HomeAssistant) -> None:
    """Expose an authenticated in-memory aircraft history API."""

    data = hass.data.setdefault(DOMAIN, {})
    if data.get("history_api_registered"):
        return

    hass.http.register_view(LocalAdsbHistoryView(hass))
    data["history_api_registered"] = True
