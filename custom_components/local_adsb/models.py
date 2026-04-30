"""Data models and derived metrics for Local ADS-B Receiver."""

from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt
from typing import Any

EARTH_RADIUS_MILES = 3958.7613


def _clean_callsign(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number


def _int(value: Any) -> int | None:
    number = _float(value)
    if number is None:
        return None
    return int(number)


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in miles."""

    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    r_lat1 = radians(lat1)
    r_lat2 = radians(lat2)
    a = sin(d_lat / 2) ** 2 + cos(r_lat1) * cos(r_lat2) * sin(d_lon / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * asin(sqrt(a))


@dataclass(slots=True, frozen=True)
class Aircraft:
    """A single ADS-B aircraft observation."""

    hex: str
    callsign: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    altitude: int | None = None
    speed: int | None = None
    track: int | None = None
    vertical_rate: int | None = None
    squawk: str | None = None
    category: str | None = None
    rssi: float | None = None
    seen: float | None = None
    seen_pos: float | None = None
    messages: int | None = None
    distance_miles: float | None = None

    @classmethod
    def from_dump1090(
        cls, payload: dict[str, Any], *, home: tuple[float, float] | None = None
    ) -> Aircraft | None:
        """Build an aircraft from dump1090/readsb-style JSON."""

        hex_id = payload.get("hex")
        if not isinstance(hex_id, str) or not hex_id:
            return None

        lat = _float(payload.get("lat"))
        lon = _float(payload.get("lon"))
        distance = None
        if home is not None and lat is not None and lon is not None:
            distance = haversine_miles(home[0], home[1], lat, lon)

        altitude = payload.get("altitude")
        if isinstance(altitude, str):
            altitude = None if altitude.casefold() in {"ground", "airborne"} else _int(altitude)
        else:
            altitude = _int(altitude)

        return cls(
            hex=hex_id.lower(),
            callsign=_clean_callsign(payload.get("flight")),
            latitude=lat,
            longitude=lon,
            altitude=altitude,
            speed=_int(payload.get("speed")),
            track=_int(payload.get("track")),
            vertical_rate=_int(payload.get("vert_rate")),
            squawk=str(payload["squawk"]) if payload.get("squawk") is not None else None,
            category=str(payload["category"]) if payload.get("category") is not None else None,
            rssi=_float(payload.get("rssi")),
            seen=_float(payload.get("seen")),
            seen_pos=_float(payload.get("seen_pos")),
            messages=_int(payload.get("messages")),
            distance_miles=distance,
        )

    @property
    def display_name(self) -> str:
        """Return a short display label."""

        return self.callsign or self.hex.upper()

    def event_payload(self) -> dict[str, Any]:
        """Return an event-safe payload."""

        return {
            "hex": self.hex,
            "callsign": self.callsign,
            "distance_miles": round(self.distance_miles, 2)
            if self.distance_miles is not None
            else None,
            "altitude_feet": self.altitude,
            "speed_kts": self.speed,
            "track_degrees": self.track,
            "vertical_rate_fpm": self.vertical_rate,
            "squawk": self.squawk,
            "latitude": self.latitude,
            "longitude": self.longitude,
        }


@dataclass(slots=True, frozen=True)
class ReceiverData:
    """Current receiver data and derived metrics."""

    now: float | None
    messages: int | None
    aircraft: tuple[Aircraft, ...]
    monitor: dict[str, Any]
    message_rate: float | None = None

    @property
    def aircraft_visible(self) -> int:
        return len(self.aircraft)

    @property
    def aircraft_with_position(self) -> int:
        return sum(
            1
            for aircraft in self.aircraft
            if aircraft.latitude is not None and aircraft.longitude is not None
        )

    @property
    def nearest_aircraft(self) -> Aircraft | None:
        positioned = [aircraft for aircraft in self.aircraft if aircraft.distance_miles is not None]
        return min(positioned, key=lambda aircraft: aircraft.distance_miles or 999999, default=None)

    @property
    def lowest_aircraft(self) -> Aircraft | None:
        positioned = [aircraft for aircraft in self.aircraft if aircraft.altitude is not None]
        return min(positioned, key=lambda aircraft: aircraft.altitude or 999999, default=None)

    def nearest_low_aircraft(self, max_altitude_feet: int) -> Aircraft | None:
        candidates = [
            aircraft
            for aircraft in self.aircraft
            if aircraft.distance_miles is not None
            and aircraft.altitude is not None
            and aircraft.altitude <= max_altitude_feet
        ]
        return min(candidates, key=lambda aircraft: aircraft.distance_miles or 999999, default=None)

    @property
    def feed_status(self) -> str | None:
        value = self.monitor.get("feed_status")
        return str(value) if value is not None else None

    @property
    def receiver_connected(self) -> bool | None:
        value = self.monitor.get("rx_connected")
        if value is None:
            return None
        return str(value) in {"1", "true", "True", "connected"}

    @property
    def feeder_connected(self) -> bool | None:
        status = self.feed_status
        if status is None:
            return None
        return status.casefold() == "connected"
