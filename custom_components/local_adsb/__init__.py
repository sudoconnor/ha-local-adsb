"""Home Assistant integration for Local ADS-B Receiver."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import LocalAdsbApiClient
from .const import CONF_AIRCRAFT_URL, CONF_MONITOR_URL
from .coordinator import LocalAdsbDataUpdateCoordinator

PLATFORMS: list[Platform] = [Platform.BINARY_SENSOR, Platform.GEO_LOCATION, Platform.SENSOR]

LocalAdsbConfigEntry = ConfigEntry


async def async_setup_entry(hass: HomeAssistant, entry: LocalAdsbConfigEntry) -> bool:
    """Set up Local ADS-B Receiver from a config entry."""

    session = async_get_clientsession(hass)
    client = LocalAdsbApiClient(
        session=session,
        aircraft_url=entry.data[CONF_AIRCRAFT_URL],
        monitor_url=entry.data.get(CONF_MONITOR_URL),
    )
    coordinator = LocalAdsbDataUpdateCoordinator(hass, entry, client)

    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: LocalAdsbConfigEntry) -> bool:
    """Unload Local ADS-B Receiver."""

    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_update_listener(hass: HomeAssistant, entry: LocalAdsbConfigEntry) -> None:
    """Reload the integration when options change."""

    await hass.config_entries.async_reload(entry.entry_id)
