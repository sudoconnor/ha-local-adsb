class LocalAdsbRadarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
  }

  setConfig(config) {
    this._config = {
      title: "ADS-B Radar",
      source: "Local ADS-B Receiver",
      radius_miles: undefined,
      min_radius_miles: 10,
      max_radius_miles: 120,
      show_labels: true,
      show_stats: true,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 6;
  }

  _aircraft() {
    if (!this._hass) return [];
    const source = this._config.source || "Local ADS-B Receiver";
    return Object.entries(this._hass.states)
      .filter(([entityId, state]) =>
        entityId.startsWith("geo_location.") && state.attributes?.source === source
      )
      .map(([entityId, state]) => {
        const attrs = state.attributes || {};
        const latitude = Number(attrs.latitude);
        const longitude = Number(attrs.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
        return {
          entityId,
          name: attrs.friendly_name || attrs.callsign || attrs.hex || entityId,
          callsign: attrs.callsign || attrs.friendly_name || attrs.hex || "Unknown",
          hex: attrs.hex,
          latitude,
          longitude,
          altitude: num(attrs.altitude_feet),
          speed: num(attrs.speed_kts),
          track: num(attrs.track_degrees),
          verticalRate: num(attrs.vertical_rate_fpm),
          distance: num(attrs.distance_miles),
          seen: num(attrs.seen_seconds),
          squawk: attrs.squawk,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
  }

  _render() {
    if (!this.shadowRoot || !this._hass) return;
    const aircraft = this._aircraft();
    const homeLat = num(this._config.center_latitude) ?? num(this._hass.config?.latitude);
    const homeLon = num(this._config.center_longitude) ?? num(this._hass.config?.longitude);
    const centerLat = homeLat ?? average(aircraft.map((plane) => plane.latitude)) ?? 0;
    const centerLon = homeLon ?? average(aircraft.map((plane) => plane.longitude)) ?? 0;
    const projected = aircraft.map((plane) => ({
      ...plane,
      ...project(centerLat, centerLon, plane.latitude, plane.longitude),
    }));
    const maxSeen = projected.reduce((max, plane) => Math.max(max, Math.hypot(plane.x, plane.y)), 0);
    const configuredRadius = num(this._config.radius_miles);
    const minRadius = num(this._config.min_radius_miles) ?? 10;
    const maxRadius = num(this._config.max_radius_miles) ?? 120;
    const radius = configuredRadius ?? clamp(Math.ceil((maxSeen || minRadius) / 10) * 10, minRadius, maxRadius);
    const lowCount = aircraft.filter((plane) => plane.altitude !== undefined && plane.altitude <= 3000).length;
    const nearest = aircraft[0];
    const lowest = aircraft
      .filter((plane) => plane.altitude !== undefined)
      .sort((a, b) => a.altitude - b.altitude)[0];

    const planeMarkup = projected.map((plane) => this._planeMarkup(plane, radius)).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          overflow: hidden;
          background: radial-gradient(circle at 50% 50%, rgba(0, 168, 120, 0.12), rgba(3, 16, 28, 0.96) 72%), var(--ha-card-background, var(--card-background-color, #111));
          color: var(--primary-text-color);
        }
        .header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
          padding: 16px 16px 0;
        }
        .title { font-size: 1.2rem; font-weight: 600; }
        .count { color: var(--secondary-text-color); font-size: 0.9rem; }
        .radar {
          position: relative;
          margin: 12px 12px 0;
          aspect-ratio: 1 / 1;
          min-height: 320px;
          border-radius: 16px;
          border: 1px solid rgba(0, 255, 170, 0.24);
          overflow: hidden;
          background:
            linear-gradient(rgba(0, 255, 170, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 170, 0.08) 1px, transparent 1px),
            radial-gradient(circle at center, rgba(0, 255, 170, 0.13), rgba(0, 0, 0, 0.05) 42%, rgba(0, 0, 0, 0.38));
          background-size: 40px 40px, 40px 40px, 100% 100%;
        }
        svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        .ring { fill: none; stroke: rgba(0, 255, 170, 0.28); stroke-width: 1.2; }
        .axis { stroke: rgba(0, 255, 170, 0.2); stroke-width: 1; }
        .range-label { fill: rgba(210, 255, 237, 0.62); font-size: 11px; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
        .home { fill: rgba(255, 255, 255, 0.9); stroke: rgba(0, 255, 170, 0.9); stroke-width: 2; }
        .plane path { fill: var(--accent-color, #03a9f4); stroke: rgba(255,255,255,0.9); stroke-width: 0.8; paint-order: stroke; }
        .plane.low path { fill: #ffb300; }
        .plane.very-low path { fill: #ff5252; }
        .plane text { fill: white; paint-order: stroke; stroke: rgba(0,0,0,0.78); stroke-width: 3px; font-size: 11px; font-weight: 600; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
        .plane .sub { fill: rgba(255,255,255,0.88); font-size: 9px; font-weight: 500; }
        .empty {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: var(--secondary-text-color);
          text-align: center;
          padding: 24px;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          padding: 12px;
        }
        .stat {
          background: rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 10px;
          min-width: 0;
        }
        .stat .label { color: var(--secondary-text-color); font-size: 0.74rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stat .value { font-size: 1rem; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        @media (max-width: 520px) {
          .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .radar { min-height: 280px; }
        }
      </style>
      <ha-card>
        <div class="header">
          <div class="title">${escapeHtml(this._config.title)}</div>
          <div class="count">${aircraft.length} aircraft · ${radius} mi range</div>
        </div>
        <div class="radar">
          <svg viewBox="0 0 1000 1000" role="img" aria-label="Local ADS-B aircraft radar">
            <circle class="ring" cx="500" cy="500" r="125"></circle>
            <circle class="ring" cx="500" cy="500" r="250"></circle>
            <circle class="ring" cx="500" cy="500" r="375"></circle>
            <circle class="ring" cx="500" cy="500" r="475"></circle>
            <line class="axis" x1="500" y1="25" x2="500" y2="975"></line>
            <line class="axis" x1="25" y1="500" x2="975" y2="500"></line>
            <text class="range-label" x="508" y="121">N</text>
            <text class="range-label" x="508" y="249">${Math.round(radius * 0.5)} mi</text>
            <text class="range-label" x="508" y="36">${radius} mi</text>
            <circle class="home" cx="500" cy="500" r="5"></circle>
            ${planeMarkup}
          </svg>
          ${aircraft.length ? "" : `<div class="empty">No positioned aircraft currently visible from ${escapeHtml(this._config.source)}.</div>`}
        </div>
        ${this._config.show_stats ? `
        <div class="stats">
          <div class="stat"><div class="label">Visible</div><div class="value">${aircraft.length}</div></div>
          <div class="stat"><div class="label">Low ≤3k ft</div><div class="value">${lowCount}</div></div>
          <div class="stat"><div class="label">Nearest</div><div class="value">${nearest ? escapeHtml(shortLabel(nearest)) : "—"}</div></div>
          <div class="stat"><div class="label">Lowest</div><div class="value">${lowest ? formatAltitude(lowest.altitude) : "—"}</div></div>
        </div>` : ""}
      </ha-card>`;
  }

  _planeMarkup(plane, radius) {
    const scale = 475 / radius;
    const x = clamp(500 + plane.x * scale, 20, 980);
    const y = clamp(500 - plane.y * scale, 20, 980);
    const heading = Number.isFinite(plane.track) ? plane.track : 0;
    const lowClass = plane.altitude !== undefined && plane.altitude <= 1000
      ? " very-low"
      : plane.altitude !== undefined && plane.altitude <= 3000
        ? " low"
        : "";
    const label = escapeHtml(shortLabel(plane));
    const sub = escapeHtml([formatAltitude(plane.altitude), formatSpeed(plane.speed)].filter(Boolean).join(" · "));
    const labelMarkup = this._config.show_labels
      ? `<text x="16" y="4">${label}</text>${sub ? `<text class="sub" x="16" y="17">${sub}</text>` : ""}`
      : "";
    return `<g class="plane${lowClass}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <title>${label}${sub ? ` — ${sub}` : ""}${plane.distance !== undefined ? ` — ${plane.distance.toFixed(1)} mi` : ""}</title>
      <g transform="rotate(${heading}) scale(0.92)">
        <path d="M0,-18 L6,-3 L18,3 L18,8 L4,7 L4,18 L0,21 L-4,18 L-4,7 L-18,8 L-18,3 L-6,-3 Z"></path>
      </g>
      ${labelMarkup}
    </g>`;
  }
}

function num(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return undefined;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function project(centerLat, centerLon, lat, lon) {
  const milesPerDegreeLat = 69.0;
  const milesPerDegreeLon = 69.172 * Math.cos((centerLat * Math.PI) / 180);
  return {
    x: (lon - centerLon) * milesPerDegreeLon,
    y: (lat - centerLat) * milesPerDegreeLat,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortLabel(plane) {
  return plane.callsign || plane.hex?.toUpperCase() || plane.name || "Aircraft";
}

function formatAltitude(altitude) {
  if (altitude === undefined) return "";
  return `${Math.round(altitude).toLocaleString()} ft`;
}

function formatSpeed(speed) {
  if (speed === undefined) return "";
  return `${Math.round(speed)} kt`;
}

customElements.define("local-adsb-radar-card", LocalAdsbRadarCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "local-adsb-radar-card",
  name: "Local ADS-B Radar Card",
  description: "Radar-style aircraft plot with heading-rotated plane icons for Local ADS-B Receiver.",
});
