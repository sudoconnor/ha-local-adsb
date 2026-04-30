"""Local ADS-B receiver API client."""

from __future__ import annotations

from typing import Any

from aiohttp import ClientError, ClientSession

from .models import Aircraft, ReceiverData


class LocalAdsbApiError(Exception):
    """Raised when the receiver cannot be queried."""


class LocalAdsbApiClient:
    """Client for dump1090/readsb and FR24 feeder endpoints."""

    def __init__(
        self,
        *,
        session: ClientSession,
        aircraft_url: str,
        monitor_url: str | None = None,
        timeout: int = 10,
    ) -> None:
        self._session = session
        self.aircraft_url = aircraft_url
        self.monitor_url = monitor_url
        self._timeout = timeout

    async def async_get_data(
        self,
        *,
        home: tuple[float, float] | None = None,
        previous_messages: int | None = None,
        previous_now: float | None = None,
    ) -> ReceiverData:
        """Fetch aircraft and feeder data."""

        aircraft_payload = await self._async_get_json(self.aircraft_url)
        monitor_payload: dict[str, Any] = {}
        if self.monitor_url:
            try:
                monitor_payload = await self._async_get_json(self.monitor_url)
            except LocalAdsbApiError:
                monitor_payload = {}

        aircraft = tuple(
            parsed
            for row in aircraft_payload.get("aircraft", [])
            if isinstance(row, dict)
            for parsed in [Aircraft.from_dump1090(row, home=home)]
            if parsed is not None
        )

        now = _float(aircraft_payload.get("now"))
        messages = _int(aircraft_payload.get("messages"))
        message_rate = None
        if (
            previous_messages is not None
            and previous_now is not None
            and messages is not None
            and now is not None
            and now > previous_now
            and messages >= previous_messages
        ):
            message_rate = (messages - previous_messages) / (now - previous_now)

        return ReceiverData(
            now=now,
            messages=messages,
            aircraft=aircraft,
            monitor=monitor_payload,
            message_rate=message_rate,
        )

    async def _async_get_json(self, url: str) -> dict[str, Any]:
        try:
            async with self._session.get(url, timeout=self._timeout) as response:
                if response.status >= 400:
                    raise LocalAdsbApiError(f"{url} returned HTTP {response.status}")
                data = await response.json(content_type=None)
        except (ClientError, TimeoutError, ValueError) as err:
            raise LocalAdsbApiError(str(err)) from err
        if not isinstance(data, dict):
            raise LocalAdsbApiError(f"{url} did not return a JSON object")
        return data


async def async_validate_receiver(client: LocalAdsbApiClient) -> None:
    """Validate that aircraft data can be fetched."""

    await client.async_get_data()


def _float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> int | None:
    number = _float(value)
    if number is None:
        return None
    return int(number)
