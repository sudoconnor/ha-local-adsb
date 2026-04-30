"""Sensors for Local ADS-B Receiver."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfLength
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import LocalAdsbDataUpdateCoordinator
from .entity import LocalAdsbEntity
from .models import Aircraft, ReceiverData

AircraftGetter = Callable[[ReceiverData, LocalAdsbDataUpdateCoordinator], Aircraft | None]
ValueGetter = Callable[[ReceiverData, LocalAdsbDataUpdateCoordinator], str | int | float | None]
AttrGetter = Callable[[ReceiverData, LocalAdsbDataUpdateCoordinator], dict[str, Any]]


def _monitor_int(key: str) -> ValueGetter:
    def getter(data: ReceiverData, _coordinator: LocalAdsbDataUpdateCoordinator) -> int | None:
        try:
            return int(data.monitor[key])
        except (KeyError, TypeError, ValueError):
            return None

    return getter


def _monitor_str(key: str) -> ValueGetter:
    def getter(data: ReceiverData, _coordinator: LocalAdsbDataUpdateCoordinator) -> str | None:
        value = data.monitor.get(key)
        return str(value) if value is not None else None

    return getter


def _aircraft_attrs(aircraft: Aircraft | None) -> dict[str, Any]:
    return aircraft.event_payload() if aircraft else {}


@dataclass(frozen=True, kw_only=True)
class LocalAdsbSensorDescription(SensorEntityDescription):
    """Description for a Local ADS-B sensor."""

    value_fn: ValueGetter
    attr_fn: AttrGetter | None = None


@dataclass(frozen=True, kw_only=True)
class AircraftSensorDescription(SensorEntityDescription):
    """Description for an aircraft summary sensor."""

    aircraft_fn: AircraftGetter
    value_attr: str | None = None


SENSORS: tuple[LocalAdsbSensorDescription, ...] = (
    LocalAdsbSensorDescription(
        key="aircraft_visible",
        translation_key="aircraft_visible",
        native_unit_of_measurement="aircraft",
        icon="mdi:airplane",
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data, _coordinator: data.aircraft_visible,
    ),
    LocalAdsbSensorDescription(
        key="aircraft_with_position",
        translation_key="aircraft_with_position",
        native_unit_of_measurement="aircraft",
        icon="mdi:map-marker-radius",
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data, _coordinator: data.aircraft_with_position,
    ),
    LocalAdsbSensorDescription(
        key="messages",
        translation_key="messages",
        icon="mdi:counter",
        state_class=SensorStateClass.TOTAL_INCREASING,
        value_fn=lambda data, _coordinator: data.messages,
    ),
    LocalAdsbSensorDescription(
        key="message_rate",
        translation_key="message_rate",
        native_unit_of_measurement="messages/s",
        icon="mdi:speedometer",
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data, _coordinator: (
            round(data.message_rate, 1) if data.message_rate is not None else None
        ),
    ),
    LocalAdsbSensorDescription(
        key="feed_status",
        translation_key="feed_status",
        icon="mdi:radar",
        value_fn=lambda data, _coordinator: data.feed_status,
        attr_fn=lambda data, _coordinator: {
            "feed_alias": data.monitor.get("feed_alias"),
            "feed_current_server": data.monitor.get("feed_current_server"),
            "feed_current_mode": data.monitor.get("feed_current_mode"),
            "feed_type": data.monitor.get("feed_type"),
            "feed_status_message": data.monitor.get("feed_status_message"),
        },
    ),
    LocalAdsbSensorDescription(
        key="feed_aircraft_tracked",
        translation_key="feed_aircraft_tracked",
        native_unit_of_measurement="aircraft",
        icon="mdi:upload-network",
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=_monitor_int("feed_num_ac_tracked"),
        attr_fn=lambda data, _coordinator: {
            "adsb_tracked": _safe_int(data.monitor.get("feed_num_ac_adsb_tracked")),
            "non_adsb_tracked": _safe_int(data.monitor.get("feed_num_ac_non_adsb_tracked")),
            "last_aircraft_sent": _safe_int(data.monitor.get("feed_last_ac_sent_num")),
        },
    ),
    LocalAdsbSensorDescription(
        key="mlat_status",
        translation_key="mlat_status",
        icon="mdi:crosshairs-gps",
        value_fn=lambda data, _coordinator: (
            _monitor_str("mlat_problem")(data, _coordinator)
            or _monitor_str("mlat-ok")(data, _coordinator)
        ),
    ),
)

AIRCRAFT_SENSORS: tuple[AircraftSensorDescription, ...] = (
    AircraftSensorDescription(
        key="nearest_aircraft",
        translation_key="nearest_aircraft",
        icon="mdi:airplane-marker",
        aircraft_fn=lambda data, _coordinator: data.nearest_aircraft,
    ),
    AircraftSensorDescription(
        key="nearest_aircraft_distance",
        translation_key="nearest_aircraft_distance",
        native_unit_of_measurement=UnitOfLength.MILES,
        device_class=SensorDeviceClass.DISTANCE,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:map-marker-distance",
        aircraft_fn=lambda data, _coordinator: data.nearest_aircraft,
        value_attr="distance_miles",
    ),
    AircraftSensorDescription(
        key="lowest_aircraft",
        translation_key="lowest_aircraft",
        icon="mdi:airplane-alert",
        aircraft_fn=lambda data, _coordinator: data.lowest_aircraft,
    ),
    AircraftSensorDescription(
        key="lowest_aircraft_altitude",
        translation_key="lowest_aircraft_altitude",
        native_unit_of_measurement="ft",
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:altimeter",
        aircraft_fn=lambda data, _coordinator: data.lowest_aircraft,
        value_attr="altitude",
    ),
    AircraftSensorDescription(
        key="nearest_low_aircraft",
        translation_key="nearest_low_aircraft",
        icon="mdi:airplane-alert",
        aircraft_fn=lambda data, coordinator: data.nearest_low_aircraft(
            coordinator.low_altitude_feet
        ),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up Local ADS-B Receiver sensors."""

    coordinator: LocalAdsbDataUpdateCoordinator = entry.runtime_data
    async_add_entities(
        [LocalAdsbSensor(coordinator, description) for description in SENSORS]
        + [LocalAdsbAircraftSensor(coordinator, description) for description in AIRCRAFT_SENSORS]
    )


class LocalAdsbSensor(LocalAdsbEntity, SensorEntity):
    """Local ADS-B scalar sensor."""

    entity_description: LocalAdsbSensorDescription

    def __init__(
        self, coordinator: LocalAdsbDataUpdateCoordinator, description: LocalAdsbSensorDescription
    ) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> str | int | float | None:
        data = self.coordinator.data
        if data is None:
            return None
        return self.entity_description.value_fn(data, self.coordinator)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.coordinator.data
        if data is None or self.entity_description.attr_fn is None:
            return {}
        return {
            k: v
            for k, v in self.entity_description.attr_fn(data, self.coordinator).items()
            if v is not None
        }


class LocalAdsbAircraftSensor(LocalAdsbEntity, SensorEntity):
    """Local ADS-B aircraft summary sensor."""

    entity_description: AircraftSensorDescription

    def __init__(
        self, coordinator: LocalAdsbDataUpdateCoordinator, description: AircraftSensorDescription
    ) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def aircraft(self) -> Aircraft | None:
        data = self.coordinator.data
        if data is None:
            return None
        return self.entity_description.aircraft_fn(data, self.coordinator)

    @property
    def native_value(self) -> str | int | float | None:
        aircraft = self.aircraft
        if aircraft is None:
            return None
        if self.entity_description.value_attr is None:
            return aircraft.display_name
        value = getattr(aircraft, self.entity_description.value_attr)
        if isinstance(value, float):
            return round(value, 2)
        return value

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return _aircraft_attrs(self.aircraft)


def _safe_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
