"""Data update coordinator for Local ADS-B Receiver."""

from __future__ import annotations

import logging
from datetime import timedelta

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
    DEFAULT_LOW_ALTITUDE_FEET,
    DEFAULT_RADIUS_MILES,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    EVENT_AIRCRAFT_ENTERED_RADIUS,
    EVENT_LOW_AIRCRAFT_DETECTED,
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
        self._async_fire_events(data)
        return data

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
