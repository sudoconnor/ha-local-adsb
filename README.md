# Local ADS-B Receiver for Home Assistant

A HACS-ready Home Assistant custom integration for local ADS-B receivers that expose `dump1090`, `readsb`, `tar1090`, Pi24, or Flightradar24 receiver JSON.

It polls your receiver locally and exposes recorder-safe summary entities plus Home Assistant events for nearby/low aircraft. The full aircraft list stays on the receiver/dashboard side so Home Assistant does not store a giant changing JSON blob every few seconds.

## Tested receiver endpoints

This integration is designed around common local endpoints such as:

- `http://192.168.10.8/dump1090/data/aircraft.json`
- `http://192.168.10.8/data/aircraft.json`
- `http://192.168.10.8/tar1090/data/aircraft.json`
- optional FR24 feeder monitor: `http://192.168.10.8:8754/monitor.json`

## Entities

Sensors:

- Aircraft visible
- Aircraft with position
- Messages
- Message rate
- Feed status
- Feed aircraft tracked
- MLAT status
- Nearest aircraft
- Nearest aircraft distance
- Lowest aircraft
- Lowest aircraft altitude
- Nearest low aircraft

Binary sensors:

- Receiver connected
- Feeder connected

Map entities:

- One `geo_location` entity per positioned aircraft seen in the last 60 seconds. These show up on the built-in Home Assistant Map card while active, then go unavailable when stale.

Aircraft summary entities include useful attributes such as ICAO hex, callsign, distance, altitude, speed, heading, vertical rate, squawk, and lat/lon.

## Events

When enabled, the integration fires:

- `local_adsb_aircraft_entered_radius`
- `local_adsb_low_aircraft_detected`

Event payload example:

```json
{
  "hex": "a7e276",
  "callsign": "NKS1342",
  "distance_miles": 8.4,
  "altitude_feet": 6350,
  "speed_kts": 272,
  "track_degrees": 222,
  "vertical_rate_fpm": -1728,
  "squawk": "3642",
  "latitude": 28.312134,
  "longitude": -82.299904
}
```

## Installation with HACS custom repository

This repository is not submitted to the HACS default store yet.

1. HACS → Integrations → ⋮ → Custom repositories
2. Repository: `https://github.com/sudoconnor/ha-local-adsb`
3. Category: Integration
4. Install **Local ADS-B Receiver**
5. Restart Home Assistant
6. Settings → Devices & Services → Add Integration → **Local ADS-B Receiver**

## Configuration

The config flow asks for:

- Receiver host/IP
- Aircraft JSON URL
- FR24 monitor JSON URL
- Poll interval, default 5 seconds
- Home latitude/longitude
- Event radius in miles
- Low-altitude threshold in feet
- Whether to fire events

For Connor's current FR24/Pi24 receiver, the likely values are:

- Host: `192.168.10.8`
- Aircraft JSON: `http://192.168.10.8/dump1090/data/aircraft.json`
- Monitor JSON: `http://192.168.10.8:8754/monitor.json`

## Network/firewall notes

Home Assistant must be able to reach the receiver. For an FR24/Pi24 receiver, allow HA to receiver TCP:

- `80` for dump1090 aircraft JSON
- `8754` for FR24 feeder monitor JSON

Raw ADS-B ports such as `30003` are not required for this integration.

## Why local ADS-B, not FR24?

Flightradar24 is one feeder/consumer. The local receiver data comes from ADS-B decoder software (`dump1090`/`readsb`/similar), so the integration is named **Local ADS-B Receiver** and can work with more than FR24.
