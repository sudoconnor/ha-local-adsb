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
    return localAdsbAircraftFromHass(this._hass, this._config.source);
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


class LocalAdsbMapCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._map = undefined;
    this._markers = new Map();
    this._trails = new Map();
    this._rangeRings = [];
    this._trackPoints = new Map();
    this._selectedHex = undefined;
    this._shellRendered = false;
  }

  setConfig(config) {
    this._config = {
      title: "Live ADS-B Map",
      source: "Local ADS-B Receiver",
      height: "620px",
      tile_url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      tile_attribution: "© OpenStreetMap contributors",
      dark: false,
      auto_fit: true,
      zoom: 9,
      max_zoom: 13,
      show_list: true,
      show_stats: true,
      show_trails: true,
      trail_minutes: 5,
      range_rings_miles: [5, 10, 25, 50],
      low_altitude_feet: 3000,
      very_low_altitude_feet: 1000,
      ...config,
    };
    this._renderShell();
    this._ensureMap();
  }

  set hass(hass) {
    this._hass = hass;
    this._renderShell();
    this._ensureMap();
    this._update();
  }

  getCardSize() {
    return 8;
  }

  async _ensureMap() {
    if (!this._hass || this._map || !this.shadowRoot?.querySelector("#map")) return;
    try {
      await loadLeaflet();
      const L = window.L;
      const center = this._homeCenter();
      this._map = L.map(this.shadowRoot.querySelector("#map"), {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
        preferCanvas: true,
      }).setView(center, Number(this._config.zoom));
      L.tileLayer(this._config.tile_url, {
        attribution: this._config.tile_attribution,
        maxZoom: Number(this._config.max_zoom),
      }).addTo(this._map);
      this._drawRangeRings();
      setTimeout(() => this._map?.invalidateSize(), 120);
      this._update();
    } catch (error) {
      const status = this.shadowRoot.querySelector(".map-status");
      if (status) status.textContent = `Could not load map engine: ${error.message}`;
    }
  }

  _renderShell() {
    if (!this.shadowRoot || this._shellRendered) return;
    this.shadowRoot.innerHTML = `
      <style>
        @import url("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
        :host { display: block; }
        ha-card { overflow: hidden; }
        .header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
          padding: 16px 16px 10px;
        }
        .title { font-size: 1.2rem; font-weight: 650; }
        .count { color: var(--secondary-text-color); font-size: 0.9rem; text-align: right; }
        #map {
          height: var(--local-adsb-map-height, ${cssLength(this._config.height || "620px")});
          min-height: 360px;
          margin: 0 12px;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid var(--divider-color, rgba(128,128,128,0.28));
          background: #0b1623;
        }
        .map-wrap { position: relative; }
        .map-status {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
          color: var(--secondary-text-color);
          padding: 24px;
          text-align: center;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          padding: 12px;
        }
        .stat, .selected, .aircraft-row {
          background: var(--secondary-background-color, rgba(127,127,127,0.09));
          border-radius: 12px;
        }
        .stat { padding: 10px; min-width: 0; }
        .label { color: var(--secondary-text-color); font-size: 0.74rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .value { font-size: 1rem; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .below { display: grid; grid-template-columns: 1fr 1.25fr; gap: 12px; padding: 0 12px 12px; }
        .selected { padding: 12px; min-height: 100px; }
        .selected-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 6px; }
        .selected-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; }
        .aircraft-list { display: grid; gap: 6px; max-height: 260px; overflow: auto; padding-right: 2px; }
        .aircraft-row {
          border: 0;
          color: var(--primary-text-color);
          cursor: pointer;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          padding: 9px 10px;
          text-align: left;
          font: inherit;
          width: 100%;
        }
        .aircraft-row:hover, .aircraft-row.selected { background: color-mix(in srgb, var(--accent-color, #03a9f4) 22%, transparent); }
        .muted { color: var(--secondary-text-color); font-size: 0.82rem; }
        .local-adsb-plane-marker { background: transparent; border: 0; }
        .local-adsb-plane {
          --plane-color: #03a9f4;
          color: var(--plane-color);
          filter: drop-shadow(0 2px 2px rgba(0,0,0,0.55));
          transform-origin: center;
        }
        .local-adsb-plane.low { --plane-color: #ffb300; }
        .local-adsb-plane.very-low { --plane-color: #ff5252; }
        .local-adsb-plane svg { display: block; overflow: visible; }
        .local-adsb-plane .halo { fill: rgba(0,0,0,0.38); stroke: rgba(255,255,255,0.78); stroke-width: 1.4; }
        .local-adsb-plane path { fill: currentColor; stroke: white; stroke-width: 1.2; paint-order: stroke; }
        .local-adsb-popup { min-width: 180px; }
        .local-adsb-popup .popup-title { font-weight: 750; font-size: 1rem; margin-bottom: 4px; }
        .local-adsb-popup .popup-grid { display: grid; grid-template-columns: auto auto; gap: 3px 10px; }
        .leaflet-container { font-family: var(--paper-font-body1_-_font-family, sans-serif); }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: var(--ha-card-background, var(--card-background-color, white)); color: var(--primary-text-color); }
        @media (max-width: 760px) {
          .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .below { grid-template-columns: 1fr; }
        }
      </style>
      <ha-card>
        <div class="header">
          <div class="title"></div>
          <div class="count"></div>
        </div>
        <div class="map-wrap">
          <div id="map"></div>
          <div class="map-status">Loading live aircraft map…</div>
        </div>
        <div class="stats"></div>
        <div class="below">
          <div class="selected"></div>
          <div class="aircraft-list"></div>
        </div>
      </ha-card>`;
    this._shellRendered = true;
  }

  _update() {
    if (!this._hass || !this.shadowRoot) return;
    const aircraft = localAdsbAircraftFromHass(this._hass, this._config.source);
    this._updateTracks(aircraft);
    this._updateHeaderAndPanels(aircraft);
    if (!this._map || !window.L) return;
    this._drawRangeRings();
    this._updateMarkers(aircraft);
    this._updateTrails(aircraft);
    this._autoFit(aircraft);
    const status = this.shadowRoot.querySelector(".map-status");
    if (status) status.textContent = aircraft.length ? "" : "No positioned aircraft currently visible.";
  }

  _homeCenter() {
    const lat = num(this._config.center_latitude) ?? num(this._hass?.config?.latitude) ?? 0;
    const lon = num(this._config.center_longitude) ?? num(this._hass?.config?.longitude) ?? 0;
    return [lat, lon];
  }

  _drawRangeRings() {
    if (!this._map || !window.L) return;
    const L = window.L;
    this._rangeRings.forEach((ring) => ring.remove());
    this._rangeRings = [];
    const center = this._homeCenter();
    for (const miles of this._config.range_rings_miles || []) {
      const radius = Number(miles) * 1609.344;
      if (!Number.isFinite(radius)) continue;
      const ring = L.circle(center, {
        radius,
        color: "#00b894",
        weight: 1,
        opacity: 0.36,
        fillOpacity: 0,
        interactive: false,
      }).addTo(this._map);
      this._rangeRings.push(ring);
    }
  }

  _updateTracks(aircraft) {
    if (!this._config.show_trails) return;
    const now = Date.now();
    const maxAge = Number(this._config.trail_minutes) * 60 * 1000;
    for (const plane of aircraft) {
      const key = plane.hex || plane.entityId;
      const points = this._trackPoints.get(key) || [];
      const last = points[points.length - 1];
      if (!last || last.lat !== plane.latitude || last.lon !== plane.longitude) {
        points.push({ lat: plane.latitude, lon: plane.longitude, at: now });
      }
      this._trackPoints.set(key, points.filter((point) => now - point.at <= maxAge).slice(-80));
    }
    for (const [key, points] of this._trackPoints) {
      if (!aircraft.some((plane) => (plane.hex || plane.entityId) === key)) {
        const fresh = points.filter((point) => now - point.at <= maxAge);
        if (fresh.length) this._trackPoints.set(key, fresh);
        else this._trackPoints.delete(key);
      }
    }
  }

  _updateMarkers(aircraft) {
    const L = window.L;
    const activeKeys = new Set();
    for (const plane of aircraft) {
      const key = plane.hex || plane.entityId;
      activeKeys.add(key);
      const latLng = [plane.latitude, plane.longitude];
      const icon = L.divIcon({
        html: planeMarkerHtml(plane, this._config),
        className: "local-adsb-plane-marker",
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });
      let marker = this._markers.get(key);
      if (!marker) {
        marker = L.marker(latLng, { icon, riseOnHover: true }).addTo(this._map);
        marker.on("click", () => {
          this._selectedHex = key;
          marker.openPopup();
          this._updateHeaderAndPanels(localAdsbAircraftFromHass(this._hass, this._config.source));
        });
        this._markers.set(key, marker);
      } else {
        marker.setLatLng(latLng);
        marker.setIcon(icon);
      }
      marker.bindPopup(planePopupHtml(plane), { className: "local-adsb-popup" });
    }
    for (const [key, marker] of this._markers) {
      if (!activeKeys.has(key)) {
        marker.remove();
        this._markers.delete(key);
      }
    }
  }

  _updateTrails(aircraft) {
    if (!window.L || !this._map) return;
    const L = window.L;
    const active = new Set(aircraft.map((plane) => plane.hex || plane.entityId));
    for (const [key, polyline] of this._trails) {
      if (!active.has(key) || !this._config.show_trails) {
        polyline.remove();
        this._trails.delete(key);
      }
    }
    if (!this._config.show_trails) return;
    for (const [key, points] of this._trackPoints) {
      if (!active.has(key) || points.length < 2) continue;
      const plane = aircraft.find((candidate) => (candidate.hex || candidate.entityId) === key);
      const color = planeColor(plane, this._config);
      const latLngs = points.map((point) => [point.lat, point.lon]);
      let polyline = this._trails.get(key);
      if (!polyline) {
        polyline = L.polyline(latLngs, { color, weight: 2, opacity: 0.55, interactive: false }).addTo(this._map);
        this._trails.set(key, polyline);
      } else {
        polyline.setLatLngs(latLngs);
        polyline.setStyle({ color });
      }
    }
  }

  _autoFit(aircraft) {
    if (!this._config.auto_fit || !aircraft.length || !this._map || this._userMoved) return;
    const L = window.L;
    const points = aircraft.map((plane) => [plane.latitude, plane.longitude]);
    points.push(this._homeCenter());
    const bounds = L.latLngBounds(points);
    if (bounds.isValid()) this._map.fitBounds(bounds.pad(0.18), { animate: false, maxZoom: Number(this._config.max_zoom) });
    this._map.once("dragstart zoomstart", () => {
      this._userMoved = true;
    });
  }

  _updateHeaderAndPanels(aircraft) {
    const title = this.shadowRoot.querySelector(".title");
    const count = this.shadowRoot.querySelector(".count");
    if (title) title.textContent = this._config.title;
    if (count) count.textContent = `${aircraft.length} aircraft · ${this._config.source}`;

    const lowCount = aircraft.filter((plane) => plane.altitude !== undefined && plane.altitude <= Number(this._config.low_altitude_feet)).length;
    const nearest = aircraft[0];
    const fastest = [...aircraft].filter((plane) => plane.speed !== undefined).sort((a, b) => b.speed - a.speed)[0];
    const lowest = [...aircraft].filter((plane) => plane.altitude !== undefined).sort((a, b) => a.altitude - b.altitude)[0];
    const stats = this.shadowRoot.querySelector(".stats");
    if (stats) {
      stats.style.display = this._config.show_stats ? "grid" : "none";
      stats.innerHTML = `
        ${statHtml("Visible", aircraft.length || "—")}
        ${statHtml(`Low ≤${Number(this._config.low_altitude_feet).toLocaleString()} ft`, lowCount)}
        ${statHtml("Nearest", nearest ? shortLabel(nearest) : "—")}
        ${statHtml("Fastest", fastest ? formatSpeed(fastest.speed) : "—")}`;
    }

    const selected = aircraft.find((plane) => (plane.hex || plane.entityId) === this._selectedHex) || nearest;
    const selectedPanel = this.shadowRoot.querySelector(".selected");
    if (selectedPanel) selectedPanel.innerHTML = selected ? selectedHtml(selected) : `<div class="muted">Select an aircraft to inspect it.</div>`;

    const list = this.shadowRoot.querySelector(".aircraft-list");
    if (list) {
      list.style.display = this._config.show_list ? "grid" : "none";
      list.innerHTML = aircraft.slice(0, 80).map((plane) => aircraftRowHtml(plane, (plane.hex || plane.entityId) === this._selectedHex)).join("");
      list.querySelectorAll(".aircraft-row").forEach((row) => {
        row.addEventListener("click", () => {
          const key = row.getAttribute("data-key");
          this._selectedHex = key;
          const marker = this._markers.get(key);
          if (marker && this._map) {
            this._map.panTo(marker.getLatLng(), { animate: true });
            marker.openPopup();
          }
          this._updateHeaderAndPanels(localAdsbAircraftFromHass(this._hass, this._config.source));
        });
      });
    }
    if (lowest && selectedPanel && !selected) selectedPanel.innerHTML = selectedHtml(lowest);
  }
}

function localAdsbAircraftFromHass(hass, source = "Local ADS-B Receiver") {
  if (!hass) return [];
  return Object.entries(hass.states)
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

function planeMarkerHtml(plane, config) {
  const heading = Number.isFinite(plane.track) ? plane.track : 0;
  const className = planeAltitudeClass(plane, config);
  return `<div class="local-adsb-plane ${className}" style="transform: rotate(${heading}deg)">
    <svg viewBox="-24 -24 48 48" width="42" height="42" aria-label="${escapeHtml(shortLabel(plane))}">
      <circle class="halo" cx="0" cy="0" r="20"></circle>
      <path d="M0,-20 L7,-3 L21,4 L21,10 L5,8 L5,20 L0,23 L-5,20 L-5,8 L-21,10 L-21,4 L-7,-3 Z"></path>
    </svg>
  </div>`;
}

function planeAltitudeClass(plane, config) {
  if (plane.altitude !== undefined && plane.altitude <= Number(config.very_low_altitude_feet)) return "very-low";
  if (plane.altitude !== undefined && plane.altitude <= Number(config.low_altitude_feet)) return "low";
  return "";
}

function planeColor(plane, config) {
  const className = planeAltitudeClass(plane, config);
  if (className === "very-low") return "#ff5252";
  if (className === "low") return "#ffb300";
  return "#03a9f4";
}

function planePopupHtml(plane) {
  return `<div class="local-adsb-popup">
    <div class="popup-title">${escapeHtml(shortLabel(plane))}</div>
    <div class="popup-grid">
      <span>Altitude</span><strong>${escapeHtml(formatAltitude(plane.altitude) || "—")}</strong>
      <span>Speed</span><strong>${escapeHtml(formatSpeed(plane.speed) || "—")}</strong>
      <span>Heading</span><strong>${plane.track !== undefined ? `${Math.round(plane.track)}°` : "—"}</strong>
      <span>Distance</span><strong>${plane.distance !== undefined ? `${plane.distance.toFixed(1)} mi` : "—"}</strong>
      <span>Squawk</span><strong>${escapeHtml(plane.squawk || "—")}</strong>
      <span>ICAO</span><strong>${escapeHtml(plane.hex?.toUpperCase() || "—")}</strong>
    </div>
  </div>`;
}

function selectedHtml(plane) {
  return `<div class="selected-title">${escapeHtml(shortLabel(plane))}</div>
    <div class="selected-grid">
      <div><div class="label">Altitude</div><div class="value">${escapeHtml(formatAltitude(plane.altitude) || "—")}</div></div>
      <div><div class="label">Speed</div><div class="value">${escapeHtml(formatSpeed(plane.speed) || "—")}</div></div>
      <div><div class="label">Heading</div><div class="value">${plane.track !== undefined ? `${Math.round(plane.track)}°` : "—"}</div></div>
      <div><div class="label">Distance</div><div class="value">${plane.distance !== undefined ? `${plane.distance.toFixed(1)} mi` : "—"}</div></div>
      <div><div class="label">Vertical rate</div><div class="value">${plane.verticalRate !== undefined ? `${Math.round(plane.verticalRate).toLocaleString()} fpm` : "—"}</div></div>
      <div><div class="label">ICAO / squawk</div><div class="value">${escapeHtml([plane.hex?.toUpperCase(), plane.squawk].filter(Boolean).join(" / ") || "—")}</div></div>
    </div>`;
}

function aircraftRowHtml(plane, selected) {
  const key = escapeHtml(plane.hex || plane.entityId);
  const detail = [formatAltitude(plane.altitude), formatSpeed(plane.speed), plane.distance !== undefined ? `${plane.distance.toFixed(1)} mi` : ""].filter(Boolean).join(" · ");
  return `<button class="aircraft-row${selected ? " selected" : ""}" data-key="${key}">
    <span><strong>${escapeHtml(shortLabel(plane))}</strong><br><span class="muted">${escapeHtml(detail || plane.hex?.toUpperCase() || "Aircraft")}</span></span>
    <span class="muted">${plane.track !== undefined ? `${Math.round(plane.track)}°` : ""}</span>
  </button>`;
}

function statHtml(label, value) {
  return `<div class="stat"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function cssLength(value) {
  const text = String(value);
  return /^\d+(\.\d+)?(px|em|rem|vh|vw|%)$/.test(text) ? text : "620px";
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (window.localAdsbLeafletPromise) return window.localAdsbLeafletPromise;
  window.localAdsbLeafletPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Leaflet failed to load from CDN"));
    document.head.appendChild(script);
  });
  return window.localAdsbLeafletPromise;
}

if (!customElements.get("local-adsb-radar-card")) {
  customElements.define("local-adsb-radar-card", LocalAdsbRadarCard);
}
if (!customElements.get("local-adsb-map-card")) {
  customElements.define("local-adsb-map-card", LocalAdsbMapCard);
}
window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "local-adsb-radar-card",
    name: "Local ADS-B Radar Card",
    description: "Radar-style aircraft plot with heading-rotated plane icons for Local ADS-B Receiver.",
  },
  {
    type: "local-adsb-map-card",
    name: "Local ADS-B Interactive Map Card",
    description: "Interactive map with clickable heading-rotated aircraft, popups, range rings, and trails.",
  },
);
