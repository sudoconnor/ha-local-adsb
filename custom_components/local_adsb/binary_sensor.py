"""Binary sensors for Local ADS-B Receiver."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import LocalAdsbDataUpdateCoordinator
from .entity import LocalAdsbEntity
from .models import ReceiverData

StateGetter = Callable[[ReceiverData], bool | None]


@dataclass(frozen=True, kw_only=True)
class LocalAdsbBinarySensorDescription(BinarySensorEntityDescription):
    """Description for a Local ADS-B binary sensor."""

    display_name: str
    state_fn: StateGetter


BINARY_SENSORS: tuple[LocalAdsbBinarySensorDescription, ...] = (
    LocalAdsbBinarySensorDescription(
        key="receiver_connected",
        translation_key="receiver_connected",
        display_name="Receiver connected",
        device_class=BinarySensorDeviceClass.CONNECTIVITY,
        state_fn=lambda data: data.receiver_connected,
    ),
    LocalAdsbBinarySensorDescription(
        key="feeder_connected",
        translation_key="feeder_connected",
        display_name="Feeder connected",
        device_class=BinarySensorDeviceClass.CONNECTIVITY,
        state_fn=lambda data: data.feeder_connected,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up Local ADS-B Receiver binary sensors."""

    coordinator: LocalAdsbDataUpdateCoordinator = entry.runtime_data
    async_add_entities(
        [LocalAdsbBinarySensor(coordinator, description) for description in BINARY_SENSORS]
    )


class LocalAdsbBinarySensor(LocalAdsbEntity, BinarySensorEntity):
    """Local ADS-B binary sensor."""

    entity_description: LocalAdsbBinarySensorDescription

    def __init__(
        self,
        coordinator: LocalAdsbDataUpdateCoordinator,
        description: LocalAdsbBinarySensorDescription,
    ) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description
        self._attr_name = description.display_name

    @property
    def is_on(self) -> bool | None:
        data = self.coordinator.data
        if data is None:
            return None
        return self.entity_description.state_fn(data)
