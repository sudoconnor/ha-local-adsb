"""Config flow for Local ADS-B Receiver."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_HOST, CONF_SCAN_INTERVAL
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import LocalAdsbApiClient, LocalAdsbApiError, async_validate_receiver
from .const import (
    CONF_AIRCRAFT_URL,
    CONF_ENABLE_EVENTS,
    CONF_HOME_LATITUDE,
    CONF_HOME_LONGITUDE,
    CONF_LOW_ALTITUDE_FEET,
    CONF_MONITOR_URL,
    CONF_RADIUS_MILES,
    DEFAULT_AIRCRAFT_PATH,
    DEFAULT_LOW_ALTITUDE_FEET,
    DEFAULT_MONITOR_PORT,
    DEFAULT_RADIUS_MILES,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    MIN_SCAN_INTERVAL,
)


def _build_urls(host: str) -> tuple[str, str]:
    host = host.strip()
    if host.startswith(("http://", "https://")):
        parsed = urlparse(host)
        hostname = parsed.hostname or host
    else:
        hostname = host
    return (
        f"http://{hostname}{DEFAULT_AIRCRAFT_PATH}",
        f"http://{hostname}:{DEFAULT_MONITOR_PORT}/monitor.json",
    )


def _user_schema(hass: HomeAssistant, user_input: dict[str, Any] | None = None) -> vol.Schema:
    user_input = user_input or {}
    default_host = user_input.get(CONF_HOST, "")
    aircraft_url, monitor_url = _build_urls(default_host) if default_host else ("", "")
    return vol.Schema(
        {
            vol.Required(CONF_HOST, default=default_host): str,
            vol.Optional(
                CONF_AIRCRAFT_URL, default=user_input.get(CONF_AIRCRAFT_URL, aircraft_url)
            ): str,
            vol.Optional(
                CONF_MONITOR_URL, default=user_input.get(CONF_MONITOR_URL, monitor_url)
            ): str,
            vol.Optional(
                CONF_SCAN_INTERVAL,
                default=user_input.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
            ): vol.All(vol.Coerce(int), vol.Range(min=MIN_SCAN_INTERVAL)),
            vol.Optional(
                CONF_HOME_LATITUDE, default=user_input.get(CONF_HOME_LATITUDE, hass.config.latitude)
            ): vol.Coerce(float),
            vol.Optional(
                CONF_HOME_LONGITUDE,
                default=user_input.get(CONF_HOME_LONGITUDE, hass.config.longitude),
            ): vol.Coerce(float),
            vol.Optional(
                CONF_RADIUS_MILES, default=user_input.get(CONF_RADIUS_MILES, DEFAULT_RADIUS_MILES)
            ): vol.All(vol.Coerce(float), vol.Range(min=0.1)),
            vol.Optional(
                CONF_LOW_ALTITUDE_FEET,
                default=user_input.get(CONF_LOW_ALTITUDE_FEET, DEFAULT_LOW_ALTITUDE_FEET),
            ): vol.All(vol.Coerce(int), vol.Range(min=100)),
            vol.Optional(
                CONF_ENABLE_EVENTS, default=user_input.get(CONF_ENABLE_EVENTS, True)
            ): bool,
        }
    )


def _options_schema(options: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(
                CONF_SCAN_INTERVAL, default=options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
            ): vol.All(vol.Coerce(int), vol.Range(min=MIN_SCAN_INTERVAL)),
            vol.Optional(CONF_HOME_LATITUDE, default=options.get(CONF_HOME_LATITUDE)): vol.Coerce(
                float
            ),
            vol.Optional(CONF_HOME_LONGITUDE, default=options.get(CONF_HOME_LONGITUDE)): vol.Coerce(
                float
            ),
            vol.Optional(
                CONF_RADIUS_MILES, default=options.get(CONF_RADIUS_MILES, DEFAULT_RADIUS_MILES)
            ): vol.All(vol.Coerce(float), vol.Range(min=0.1)),
            vol.Optional(
                CONF_LOW_ALTITUDE_FEET,
                default=options.get(CONF_LOW_ALTITUDE_FEET, DEFAULT_LOW_ALTITUDE_FEET),
            ): vol.All(vol.Coerce(int), vol.Range(min=100)),
            vol.Optional(CONF_ENABLE_EVENTS, default=options.get(CONF_ENABLE_EVENTS, True)): bool,
        }
    )


class LocalAdsbConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a Local ADS-B Receiver config flow."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle the initial step."""

        errors: dict[str, str] = {}
        if user_input is not None:
            user_input = dict(user_input)
            host = user_input[CONF_HOST].strip()
            aircraft_url, monitor_url = _build_urls(host)
            user_input[CONF_AIRCRAFT_URL] = (
                user_input.get(CONF_AIRCRAFT_URL) or aircraft_url
            ).strip()
            user_input[CONF_MONITOR_URL] = (user_input.get(CONF_MONITOR_URL) or monitor_url).strip()
            try:
                await _validate_input(self.hass, user_input)
            except LocalAdsbApiError:
                errors["base"] = "cannot_connect"
            except Exception:  # pragma: no cover - defensive HA flow guard
                errors["base"] = "unknown"
            else:
                await self.async_set_unique_id(host.casefold())
                self._abort_if_unique_id_configured()
                title = f"Local ADS-B Receiver ({host})"
                return self.async_create_entry(title=title, data=user_input)

        return self.async_show_form(
            step_id="user", data_schema=_user_schema(self.hass, user_input), errors=errors
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> LocalAdsbOptionsFlow:
        """Create the options flow."""

        return LocalAdsbOptionsFlow(config_entry)


class LocalAdsbOptionsFlow(config_entries.OptionsFlow):
    """Handle Local ADS-B Receiver options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        options = {
            CONF_SCAN_INTERVAL: self._config_entry.options.get(
                CONF_SCAN_INTERVAL,
                self._config_entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
            ),
            CONF_HOME_LATITUDE: self._config_entry.options.get(
                CONF_HOME_LATITUDE, self._config_entry.data.get(CONF_HOME_LATITUDE)
            ),
            CONF_HOME_LONGITUDE: self._config_entry.options.get(
                CONF_HOME_LONGITUDE, self._config_entry.data.get(CONF_HOME_LONGITUDE)
            ),
            CONF_RADIUS_MILES: self._config_entry.options.get(
                CONF_RADIUS_MILES,
                self._config_entry.data.get(CONF_RADIUS_MILES, DEFAULT_RADIUS_MILES),
            ),
            CONF_LOW_ALTITUDE_FEET: self._config_entry.options.get(
                CONF_LOW_ALTITUDE_FEET,
                self._config_entry.data.get(CONF_LOW_ALTITUDE_FEET, DEFAULT_LOW_ALTITUDE_FEET),
            ),
            CONF_ENABLE_EVENTS: self._config_entry.options.get(
                CONF_ENABLE_EVENTS, self._config_entry.data.get(CONF_ENABLE_EVENTS, True)
            ),
        }
        return self.async_show_form(step_id="init", data_schema=_options_schema(options))


async def _validate_input(hass: HomeAssistant, user_input: dict[str, Any]) -> None:
    session = async_get_clientsession(hass)
    client = LocalAdsbApiClient(
        session=session,
        aircraft_url=user_input[CONF_AIRCRAFT_URL],
        monitor_url=user_input.get(CONF_MONITOR_URL),
    )
    await async_validate_receiver(client)
