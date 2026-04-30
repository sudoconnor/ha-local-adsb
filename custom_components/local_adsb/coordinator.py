"""Data update coordinator for Local ADS-B Receiver."""

from __future__ import annotations

import logging
import time
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import LocalAdsbApiClient, LocalAdsbApiError
from .const import (
    CONF_ENABLE_EVENTS,
    CONF_HOME_LATITUDE,
    CONF_HOME_LONGITUDE,
    CONF_LOW_ALTITUDE_FEET,
    CONF_RADIUS_MILES,
    DEFAULT_HISTORY_SECONDS,
    DEFAULT_LOW_ALTITUDE_FEET,
    DEFAULT_MAP_TRACK_SECONDS,
    DEFAULT_RADIUS_MILES,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    EVENT_AIRCRAFT_ENTERED_RADIUS,
    EVENT_LOW_AIRCRAFT_DETECTED,
    MAX_HISTORY_SECONDS,
)
from .models import Aircraft, ReceiverData

_LOGGER = logging.getLogger(__name__)


class LocalAdsbDataUpdateCoordinator(DataUpdateCoordinator[ReceiverData]):
    """Coordinate local ADS-B receiver polling."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: LocalAdsbApiClient) -> None:
        """Initialize the coordinator."""

        self.client = client
        self.config_entry = entry
        self._previous_messages: int | None = None
        self._previous_now: float | None = None
        self._known_radius_hexes: set[str] = set()
        self._known_low_hexes: set[str] = set()
        self._has_event_baseline = False
        self._track_history: dict[str, list[dict[str, Any]]] = {}
        interval_seconds = int(
            entry.options.get(
                "scan_interval", entry.data.get("scan_interval", DEFAULT_SCAN_INTERVAL)
            )
        )
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=interval_seconds),
            config_entry=entry,
        )

    @property
    def home(self) -> tuple[float, float] | None:
        """Return configured home coordinates."""

        lat = self.config_entry.options.get(
            CONF_HOME_LATITUDE, self.config_entry.data.get(CONF_HOME_LATITUDE)
        )
        lon = self.config_entry.options.get(
            CONF_HOME_LONGITUDE, self.config_entry.data.get(CONF_HOME_LONGITUDE)
        )
        if lat is None or lon is None:
            return None
        return (float(lat), float(lon))

    @property
    def radius_miles(self) -> float:
        """Return event radius in miles."""

        return float(
            self.config_entry.options.get(
                CONF_RADIUS_MILES,
                self.config_entry.data.get(CONF_RADIUS_MILES, DEFAULT_RADIUS_MILES),
            )
        )

    @property
    def low_altitude_feet(self) -> int:
        """Return low altitude threshold in feet."""

        return int(
            self.config_entry.options.get(
                CONF_LOW_ALTITUDE_FEET,
                self.config_entry.data.get(CONF_LOW_ALTITUDE_FEET, DEFAULT_LOW_ALTITUDE_FEET),
            )
        )

    @property
    def map_track_seconds(self) -> int:
        """Return how long aircraft remain active on the map after being seen."""

        return DEFAULT_MAP_TRACK_SECONDS

    @property
    def map_aircraft(self) -> tuple[Aircraft, ...]:
        """Return positioned aircraft seen within the map tracking window."""

        if self.data is None:
            return ()
        return tuple(
            aircraft
            for aircraft in self.data.aircraft
            if aircraft.latitude is not None
            and aircraft.longitude is not None
            and aircraft.seen is not None
            and aircraft.seen <= self.map_track_seconds
        )

    @property
    def map_aircraft_by_hex(self) -> dict[str, Aircraft]:
        """Return active map aircraft keyed by ICAO hex."""

        return {aircraft.hex: aircraft for aircraft in self.map_aircraft}

    @property
    def events_enabled(self) -> bool:
        """Return whether receiver events should be fired."""

        return bool(
            self.config_entry.options.get(
                CONF_ENABLE_EVENTS, self.config_entry.data.get(CONF_ENABLE_EVENTS, True)
            )
        )

    async def _async_update_data(self) -> ReceiverData:
        """Fetch latest receiver data."""

        try:
            data = await self.client.async_get_data(
                home=self.home,
                previous_messages=self._previous_messages,
                previous_now=self._previous_now,
            )
        except LocalAdsbApiError as err:
            raise UpdateFailed(str(err)) from err

        self._previous_messages = data.messages
        self._previous_now = data.now
        self._update_track_history(data)
        self._async_fire_events(data)
        return data

    def _update_track_history(self, data: ReceiverData) -> None:
        """Keep a bounded in-memory position history for dashboard trails."""

        now = data.now or time.time()
        cutoff = now - MAX_HISTORY_SECONDS
        seen_hexes: set[str] = set()

        for aircraft in data.aircraft:
            if aircraft.latitude is None or aircraft.longitude is None:
                continue

            seen_hexes.add(aircraft.hex)
            observed_at = now
            if aircraft.seen_pos is not None:
                observed_at = max(cutoff, now - aircraft.seen_pos)
            elif aircraft.seen is not None:
                observed_at = max(cutoff, now - aircraft.seen)

            point = {
                "at": round(observed_at, 3),
                "lat": aircraft.latitude,
                "lon": aircraft.longitude,
                "altitude_feet": aircraft.altitude,
                "speed_kts": aircraft.speed,
                "track_degrees": aircraft.track,
                "vertical_rate_fpm": aircraft.vertical_rate,
                "callsign": aircraft.callsign,
                "distance_miles": round(aircraft.distance_miles, 2)
                if aircraft.distance_miles is not None
                else None,
            }

            points = [
                existing
                for existing in self._track_history.get(aircraft.hex, [])
                if existing["at"] >= cutoff
            ]
            last = points[-1] if points else None
            if (
                last is None
                or abs(last["lat"] - point["lat"]) > 0.00001
                or abs(last["lon"] - point["lon"]) > 0.00001
                or point["at"] - last["at"] >= self.update_interval.total_seconds()
            ):
                points.append(point)
            self._track_history[aircraft.hex] = points[-720:]

        for hex_id, points in list(self._track_history.items()):
            fresh_points = [point for point in points if point["at"] >= cutoff]
            if fresh_points:
                self._track_history[hex_id] = fresh_points
            elif hex_id not in seen_hexes:
                self._track_history.pop(hex_id, None)

    def history_payload(self, seconds: int = DEFAULT_HISTORY_SECONDS) -> dict[str, Any]:
        """Return a recorder-safe in-memory aircraft track-history payload."""

        seconds = max(1, min(seconds, MAX_HISTORY_SECONDS))
        generated_at = self.data.now if self.data and self.data.now is not None else time.time()
        cutoff = generated_at - seconds
        aircraft: dict[str, Any] = {}

        for hex_id, points in self._track_history.items():
            filtered = [point for point in points if point["at"] >= cutoff]
            if not filtered:
                continue
            current = self.map_aircraft_by_hex.get(hex_id)
            aircraft[hex_id] = {
                "hex": hex_id,
                "callsign": current.callsign if current else filtered[-1].get("callsign"),
                "active": current is not None,
                "points": filtered,
            }

        return {
            "generated_at": round(generated_at, 3),
            "history_seconds": seconds,
            "entry_id": self.config_entry.entry_id,
            "aircraft": aircraft,
        }

    def _async_fire_events(self, data: ReceiverData) -> None:
        """Fire threshold-crossing events for nearby/low aircraft."""

        if not self.events_enabled or self.home is None:
            return

        radius_now = {
            aircraft.hex: aircraft
            for aircraft in data.aircraft
            if aircraft.distance_miles is not None and aircraft.distance_miles <= self.radius_miles
        }
        low_now = {
            aircraft.hex: aircraft
            for aircraft in data.aircraft
            if aircraft.distance_miles is not None
            and aircraft.distance_miles <= self.radius_miles
            and aircraft.altitude is not None
            and aircraft.altitude <= self.low_altitude_feet
        }

        if not self._has_event_baseline:
            self._known_radius_hexes = set(radius_now)
            self._known_low_hexes = set(low_now)
            self._has_event_baseline = True
            return

        for aircraft in _new_aircraft(radius_now, self._known_radius_hexes):
            self.hass.bus.async_fire(EVENT_AIRCRAFT_ENTERED_RADIUS, aircraft.event_payload())
        for aircraft in _new_aircraft(low_now, self._known_low_hexes):
            self.hass.bus.async_fire(EVENT_LOW_AIRCRAFT_DETECTED, aircraft.event_payload())

        self._known_radius_hexes = set(radius_now)
        self._known_low_hexes = set(low_now)


def _new_aircraft(current: dict[str, Aircraft], known: set[str]) -> list[Aircraft]:
    """Return newly seen aircraft from a current aircraft mapping."""

    return [aircraft for hex_id, aircraft in current.items() if hex_id not in known]
