"""Base entities for Local ADS-B Receiver."""

from __future__ import annotations

from typing import Any

from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import LocalAdsbDataUpdateCoordinator


class LocalAdsbEntity(CoordinatorEntity[LocalAdsbDataUpdateCoordinator]):
    """Base Local ADS-B entity."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: LocalAdsbDataUpdateCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_{key}"

    @property
    def device_info(self) -> dict[str, Any]:
        data = self.coordinator.data
        monitor = data.monitor if data else {}
        alias = monitor.get("feed_alias") or self.coordinator.config_entry.title
        version = monitor.get("build_version")
        return {
            "identifiers": {(DOMAIN, self.coordinator.config_entry.entry_id)},
            "manufacturer": "Local ADS-B",
            "model": "dump1090/readsb receiver",
            "name": str(alias),
            "sw_version": str(version) if version is not None else None,
            "configuration_url": self.coordinator.config_entry.data.get("monitor_url", ""),
        }
