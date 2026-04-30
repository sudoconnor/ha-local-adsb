"""Constants for the Local ADS-B Receiver integration."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "local_adsb"

CONF_AIRCRAFT_URL: Final = "aircraft_url"
CONF_MONITOR_URL: Final = "monitor_url"
CONF_HOME_LATITUDE: Final = "home_latitude"
CONF_HOME_LONGITUDE: Final = "home_longitude"
CONF_RADIUS_MILES: Final = "radius_miles"
CONF_LOW_ALTITUDE_FEET: Final = "low_altitude_feet"
CONF_ENABLE_EVENTS: Final = "enable_events"

DEFAULT_AIRCRAFT_PATH: Final = "/dump1090/data/aircraft.json"
DEFAULT_MONITOR_PORT: Final = 8754
DEFAULT_SCAN_INTERVAL: Final = 5
MIN_SCAN_INTERVAL: Final = 5
DEFAULT_MAP_TRACK_SECONDS: Final = 60
DEFAULT_RADIUS_MILES: Final = 10.0
DEFAULT_LOW_ALTITUDE_FEET: Final = 5000

EVENT_AIRCRAFT_ENTERED_RADIUS: Final = "local_adsb_aircraft_entered_radius"
EVENT_LOW_AIRCRAFT_DETECTED: Final = "local_adsb_low_aircraft_detected"

ATTR_HEX: Final = "hex"
ATTR_CALLSIGN: Final = "callsign"
ATTR_DISTANCE_MILES: Final = "distance_miles"
ATTR_ALTITUDE_FEET: Final = "altitude_feet"
ATTR_SPEED_KTS: Final = "speed_kts"
ATTR_TRACK_DEGREES: Final = "track_degrees"
ATTR_VERTICAL_RATE_FPM: Final = "vertical_rate_fpm"
ATTR_SQUAWK: Final = "squawk"
ATTR_LATITUDE: Final = "latitude"
ATTR_LONGITUDE: Final = "longitude"
