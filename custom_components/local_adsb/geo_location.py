"""Geo-location entities for Local ADS-B Receiver aircraft."""

from __future__ import annotations

from typing import Any

from homeassistant.components.geo_location import GeolocationEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    ATTR_ALTITUDE_FEET,
    ATTR_CALLSIGN,
    ATTR_DISTANCE_MILES,
    ATTR_HEX,
    ATTR_LATITUDE,
    ATTR_LONGITUDE,
    ATTR_SPEED_KTS,
    ATTR_SQUAWK,
    ATTR_TRACK_DEGREES,
    ATTR_VERTICAL_RATE_FPM,
)
from .coordinator import LocalAdsbDataUpdateCoordinator
from .models import Aircraft

SOURCE = "Local ADS-B Receiver"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Local ADS-B aircraft map entities."""

    coordinator: LocalAdsbDataUpdateCoordinator = entry.runtime_data
    entities: dict[str, LocalAdsbAircraftGeoLocation] = {}

    async def async_sync_aircraft_entities() -> None:
        """Add active aircraft and remove stale aircraft map entities."""

        active_aircraft = coordinator.map_aircraft_by_hex
        stale_hexes = set(entities) - set(active_aircraft)
        for hex_id in stale_hexes:
            await entities[hex_id].async_remove()
            entities.pop(hex_id)

        new_entities: list[LocalAdsbAircraftGeoLocation] = []
        for hex_id in active_aircraft:
            if hex_id in entities:
                continue
            entity = LocalAdsbAircraftGeoLocation(coordinator, hex_id)
            entities[hex_id] = entity
            new_entities.append(entity)
        if new_entities:
            async_add_entities(new_entities)

    await async_sync_aircraft_entities()

    def _schedule_sync_aircraft_entities() -> None:
        hass.async_create_task(async_sync_aircraft_entities())

    entry.async_on_unload(coordinator.async_add_listener(_schedule_sync_aircraft_entities))


class LocalAdsbAircraftGeoLocation(
    CoordinatorEntity[LocalAdsbDataUpdateCoordinator], GeolocationEvent
):
    """A positioned aircraft seen recently by the local ADS-B receiver."""

    _attr_has_entity_name = False
    _attr_icon = "mdi:airplane-marker"
    _attr_source = SOURCE

    def __init__(self, coordinator: LocalAdsbDataUpdateCoordinator, hex_id: str) -> None:
        """Initialize an aircraft geo-location entity."""

        super().__init__(coordinator)
        self._hex = hex_id
        # No unique_id on purpose: these are ephemeral map points, not registry-backed
        # devices. This avoids filling the entity registry with every aircraft ever seen.

    @property
    def aircraft(self) -> Aircraft | None:
        """Return the current active aircraft observation."""

        return self.coordinator.map_aircraft_by_hex.get(self._hex)

    @property
    def name(self) -> str:
        """Return the aircraft map label."""

        aircraft = self.aircraft
        if aircraft is None:
            return self._hex.upper()
        return aircraft.display_name

    @property
    def available(self) -> bool:
        """Return whether this aircraft is still visible on the map."""

        return self.aircraft is not None

    @property
    def latitude(self) -> float | None:
        """Return aircraft latitude."""

        return self.aircraft.latitude if self.aircraft else None

    @property
    def longitude(self) -> float | None:
        """Return aircraft longitude."""

        return self.aircraft.longitude if self.aircraft else None

    @property
    def distance(self) -> float | None:
        """Return aircraft distance from home in miles."""

        return self.aircraft.distance_miles if self.aircraft else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return aircraft details for Lovelace cards and automations."""

        aircraft = self.aircraft
        if aircraft is None:
            return {ATTR_HEX: self._hex}

        return {
            ATTR_HEX: aircraft.hex,
            ATTR_CALLSIGN: aircraft.callsign,
            ATTR_DISTANCE_MILES: round(aircraft.distance_miles, 2)
            if aircraft.distance_miles is not None
            else None,
            ATTR_ALTITUDE_FEET: aircraft.altitude,
            ATTR_SPEED_KTS: aircraft.speed,
            ATTR_TRACK_DEGREES: aircraft.track,
            ATTR_VERTICAL_RATE_FPM: aircraft.vertical_rate,
            ATTR_SQUAWK: aircraft.squawk,
            ATTR_LATITUDE: aircraft.latitude,
            ATTR_LONGITUDE: aircraft.longitude,
            "category": aircraft.category,
            "rssi": aircraft.rssi,
            "seen_seconds": aircraft.seen,
            "seen_position_seconds": aircraft.seen_pos,
            "messages": aircraft.messages,
        }
