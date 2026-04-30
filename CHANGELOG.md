# Changelog

## 0.4.0

- Add `custom:local-adsb-map-card`, an interactive Leaflet-based map with heading-rotated aircraft markers, click popups, selected-aircraft details, range rings, and short browser-side trails.
- Keep the original radar card available as `custom:local-adsb-radar-card`.

## 0.3.2

- Sort manifest keys for hassfest validation.

## 0.3.1

- Declare the Home Assistant `http` component as an `after_dependency` for the bundled Lovelace card static path.

## 0.3.0

- Bundle a Lovelace radar card with heading-rotated aircraft silhouettes.
- Expose aircraft details on active `geo_location` entities for custom cards and automations.
- Register the card JavaScript at `/local_adsb/local-adsb-radar-card.js` when the integration loads.

## 0.2.0

- Add Home Assistant map support with `geo_location` entities for positioned aircraft seen in the last 60 seconds.
- Change default polling interval to 5 seconds.
- Start tagged releases for HACS version tracking.

## 0.1.0

- Initial HACS-ready custom integration for local ADS-B/dump1090 receivers.
