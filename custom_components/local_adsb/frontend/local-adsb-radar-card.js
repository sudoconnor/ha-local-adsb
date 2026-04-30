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
    this._lastPlanes = new Map();
    this._historyFetchAt = 0;
    this._historyInFlight = undefined;
    this._selectedHex = undefined;
    this._scope = "all";
    this._search = "";
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
      show_controls: true,
      show_list: true,
      show_stats: true,
      show_trails: true,
      trail_minutes: 5,
      history_api: "/api/local_adsb/history",
      history_fetch_interval_seconds: 15,
      nearby_miles: 10,
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
        @import url("/local_adsb/vendor/leaflet/leaflet.css");
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
        .controls {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          padding: 0 12px 10px;
        }
        .control-group {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          border-radius: 999px;
          background: var(--secondary-background-color, rgba(127,127,127,0.09));
        }
        .control-btn {
          border: 0;
          border-radius: 999px;
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
          font-size: 0.8rem;
          padding: 6px 10px;
          background: transparent;
        }
        .control-btn:hover { background: rgba(127,127,127,0.16); }
        .control-btn.active { background: var(--accent-color, #03a9f4); color: var(--text-primary-color, white); }
        .search {
          border: 1px solid var(--divider-color, rgba(128,128,128,0.28));
          border-radius: 999px;
          box-sizing: border-box;
          min-width: 160px;
          padding: 8px 12px;
          background: var(--card-background-color, transparent);
          color: var(--primary-text-color);
          font: inherit;
          font-size: 0.85rem;
        }
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
        .selected-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; margin-bottom: 8px; }
        .selected-title { font-size: 1.08rem; font-weight: 750; line-height: 1.2; }
        .selected-subline { margin-top: 2px; color: var(--secondary-text-color); font-size: 0.78rem; }
        .selected-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 12px; }
        .status-chip {
          border-radius: 999px;
          color: white;
          flex: 0 0 auto;
          font-size: 0.76rem;
          font-weight: 700;
          padding: 5px 9px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .status-chip.climbing { background: #00b894; }
        .status-chip.descending { background: #e17055; }
        .status-chip.level { background: #636e72; }
        .status-chip.stale { background: #6c5ce7; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
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
        .badge { display: inline-block; margin-left: 6px; color: var(--secondary-text-color); font-size: 0.78rem; font-weight: 500; }
        .leaflet-container { font-family: var(--paper-font-body1_-_font-family, sans-serif); }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: var(--ha-card-background, var(--card-background-color, white)); color: var(--primary-text-color); }
        @media (max-width: 760px) {
          .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .below { grid-template-columns: 1fr; }
          .selected-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      </style>
      <ha-card>
        <div class="header">
          <div class="title"></div>
          <div class="count"></div>
        </div>
        <div class="controls">
          <div class="control-group" aria-label="Aircraft filter">
            <button class="control-btn" data-scope="all" type="button">All</button>
            <button class="control-btn" data-scope="nearby" type="button">Nearby</button>
            <button class="control-btn" data-scope="low" type="button">Low</button>
          </div>
          <div class="control-group" aria-label="Map toggles">
            <button class="control-btn" data-toggle="trails" type="button">Trails</button>
            <button class="control-btn" data-toggle="autofit" type="button">Auto-fit</button>
            <button class="control-btn" data-action="reset-view" type="button">Reset</button>
          </div>
          <input class="search" type="search" placeholder="Search callsign or ICAO" aria-label="Search aircraft">
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
    this._wireControls();
  }

  _update() {
    if (!this._hass || !this.shadowRoot) return;
    const allAircraft = localAdsbAircraftFromHass(this._hass, this._config.source);
    const aircraft = this._filterAircraft(allAircraft);
    this._refreshHistory(allAircraft);
    this._updateTracks(allAircraft);
    this._syncControls();
    this._updateHeaderAndPanels(aircraft, allAircraft);
    if (!this._map || !window.L) return;
    this._drawRangeRings();
    this._updateMarkers(aircraft);
    this._updateTrails(aircraft, allAircraft);
    this._autoFit(aircraft);
    const status = this.shadowRoot.querySelector(".map-status");
    if (status) status.textContent = aircraft.length ? "" : "No positioned aircraft currently visible.";
  }

  _wireControls() {
    const controls = this.shadowRoot.querySelector(".controls");
    if (!controls) return;
    controls.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const scope = button.getAttribute("data-scope");
      const toggle = button.getAttribute("data-toggle");
      const action = button.getAttribute("data-action");
      if (scope) this._scope = scope;
      if (toggle === "trails") this._config.show_trails = !this._config.show_trails;
      if (toggle === "autofit") {
        this._config.auto_fit = !this._config.auto_fit;
        if (this._config.auto_fit) this._userMoved = false;
      }
      if (action === "reset-view") {
        this._userMoved = false;
        this._map?.setView(this._homeCenter(), Number(this._config.zoom), { animate: true });
      }
      this._update();
    });
    const search = this.shadowRoot.querySelector(".search");
    search?.addEventListener("input", () => {
      this._search = search.value.trim().toLowerCase();
      this._update();
    });
  }

  _syncControls() {
    const controls = this.shadowRoot.querySelector(".controls");
    if (!controls) return;
    controls.style.display = this._config.show_controls ? "flex" : "none";
    controls.querySelectorAll("[data-scope]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-scope") === this._scope);
    });
    controls.querySelector('[data-toggle="trails"]')?.classList.toggle("active", Boolean(this._config.show_trails));
    controls.querySelector('[data-toggle="autofit"]')?.classList.toggle("active", Boolean(this._config.auto_fit) && !this._userMoved);
  }

  _filterAircraft(aircraft) {
    const nearbyMiles = Number(this._config.nearby_miles) || 10;
    const lowAltitude = Number(this._config.low_altitude_feet) || 3000;
    return aircraft.filter((plane) => {
      if (this._scope === "nearby" && !(plane.distance !== undefined && plane.distance <= nearbyMiles)) return false;
      if (this._scope === "low" && !(plane.altitude !== undefined && plane.altitude <= lowAltitude)) return false;
      if (this._search) {
        const haystack = [plane.callsign, plane.hex, plane.name].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(this._search)) return false;
      }
      return true;
    });
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
    const now = Date.now();
    const maxAge = Math.max(60 * 1000, Number(this._config.trail_minutes) * 60 * 1000 || 5 * 60 * 1000);
    for (const plane of aircraft) {
      const key = plane.hex || plane.entityId;
      this._lastPlanes.set(key, { ...plane, lastSeenAt: observedAt(plane, now) });
      if (!this._config.show_trails) continue;
      const points = this._trackPoints.get(key) || [];
      const last = points[points.length - 1];
      if (!last || last.lat !== plane.latitude || last.lon !== plane.longitude) {
        points.push(trackPointFromPlane(plane, now));
      }
      this._trackPoints.set(key, points.filter((point) => now - point.at <= maxAge).slice(-120));
    }
    for (const [key, plane] of this._lastPlanes) {
      if (now - (plane.lastSeenAt || 0) > maxAge) this._lastPlanes.delete(key);
    }
    if (!this._config.show_trails) return;
    for (const [key, points] of this._trackPoints) {
      if (!aircraft.some((plane) => (plane.hex || plane.entityId) === key)) {
        const fresh = points.filter((point) => now - point.at <= maxAge);
        if (fresh.length) this._trackPoints.set(key, fresh);
        else this._trackPoints.delete(key);
      }
    }
  }

  async _refreshHistory(aircraft) {
    if (!this._config.show_trails || !this._config.history_api || this._historyInFlight) return;
    const now = Date.now();
    const intervalMs = Math.max(5, Number(this._config.history_fetch_interval_seconds) || 15) * 1000;
    if (now - this._historyFetchAt < intervalMs) return;

    this._historyFetchAt = now;
    const maxAge = Math.max(60, Number(this._config.trail_minutes) * 60 || 300);
    const url = new URL(this._config.history_api, window.location.origin);
    url.searchParams.set("seconds", String(Math.ceil(maxAge)));

    this._historyInFlight = fetch(url.toString(), { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error(`history HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const activeKeys = new Set(aircraft.map((plane) => plane.hex || plane.entityId));
        if (this._selectedHex) activeKeys.add(this._selectedHex);
        for (const [key, details] of Object.entries(payload.aircraft || {})) {
          if (!activeKeys.has(key)) continue;
          const historyPoints = (details.points || [])
            .map((point) => ({
              lat: Number(point.lat),
              lon: Number(point.lon),
              at: Number(point.at) * 1000,
              altitude: num(point.altitude_feet),
              speed: num(point.speed_kts),
              track: num(point.track_degrees),
              verticalRate: num(point.vertical_rate_fpm),
              distance: num(point.distance_miles),
              callsign: point.callsign,
            }))
            .filter((point) =>
              Number.isFinite(point.lat) &&
              Number.isFinite(point.lon) &&
              Number.isFinite(point.at),
            );
          this._trackPoints.set(
            key,
            mergeTrackPoints(this._trackPoints.get(key) || [], historyPoints, maxAge * 1000),
          );
          const lastPoint = historyPoints[historyPoints.length - 1];
          if (lastPoint) {
            const remembered = this._lastPlanes.get(key) || {};
            this._lastPlanes.set(key, {
              ...remembered,
              callsign: remembered.callsign || details.callsign || lastPoint.callsign,
              hex: remembered.hex || details.hex || key,
              latitude: remembered.latitude ?? lastPoint.lat,
              longitude: remembered.longitude ?? lastPoint.lon,
              altitude: remembered.altitude ?? lastPoint.altitude,
              speed: remembered.speed ?? lastPoint.speed,
              track: remembered.track ?? lastPoint.track,
              verticalRate: remembered.verticalRate ?? lastPoint.verticalRate,
              distance: remembered.distance ?? lastPoint.distance,
              lastSeenAt: Math.max(remembered.lastSeenAt || 0, lastPoint.at),
            });
          }
        }
        const allAircraft = localAdsbAircraftFromHass(this._hass, this._config.source);
        this._updateTrails(this._filterAircraft(allAircraft), allAircraft);
        this._updateHeaderAndPanels(this._filterAircraft(allAircraft), allAircraft);
      })
      .catch((error) => {
        // The card still works with browser-session trails if the optional history API is unavailable.
        console.debug("Local ADS-B history fetch failed", error);
      })
      .finally(() => {
        this._historyInFlight = undefined;
      });
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
          const allAircraft = localAdsbAircraftFromHass(this._hass, this._config.source);
          this._updateHeaderAndPanels(this._filterAircraft(allAircraft), allAircraft);
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

  _updateTrails(aircraft, allAircraft = aircraft) {
    if (!window.L || !this._map) return;
    const L = window.L;
    const visible = new Set(aircraft.map((plane) => plane.hex || plane.entityId));
    if (this._selectedHex && this._trackPoints.has(this._selectedHex)) visible.add(this._selectedHex);
    for (const [key, layer] of this._trails) {
      if (!visible.has(key) || !this._config.show_trails) {
        layer.remove();
        this._trails.delete(key);
      }
    }
    if (!this._config.show_trails) return;
    const now = Date.now();
    const maxAge = Math.max(60 * 1000, Number(this._config.trail_minutes) * 60 * 1000 || 5 * 60 * 1000);
    for (const [key, rawPoints] of this._trackPoints) {
      if (!visible.has(key)) continue;
      const points = rawPoints.filter((point) => now - point.at <= maxAge).slice(-120);
      if (points.length < 2) {
        const existing = this._trails.get(key);
        existing?.remove?.();
        this._trails.delete(key);
        continue;
      }
      const plane =
        aircraft.find((candidate) => (candidate.hex || candidate.entityId) === key) ||
        allAircraft.find((candidate) => (candidate.hex || candidate.entityId) === key) ||
        this._lastPlanes.get(key);
      const color = planeColor(plane, this._config);
      const isSelected = key === this._selectedHex;
      const displayPoints = isSelected ? points : thinTrackPoints(points, 36);
      let layer = this._trails.get(key);
      if (!layer || !layer.clearLayers) {
        layer?.remove?.();
        layer = L.layerGroup().addTo(this._map);
        this._trails.set(key, layer);
      } else {
        layer.clearLayers();
      }
      for (let index = 1; index < displayPoints.length; index += 1) {
        const previous = displayPoints[index - 1];
        const point = displayPoints[index];
        const ageRatio = clamp((now - point.at) / maxAge, 0, 1);
        const opacity = clamp(0.12 + (1 - ageRatio) * (isSelected ? 0.72 : 0.52), 0.12, isSelected ? 0.84 : 0.64);
        L.polyline([[previous.lat, previous.lon], [point.lat, point.lon]], {
          color,
          interactive: false,
          opacity,
          weight: isSelected ? 3.2 : 2.1,
        }).addTo(layer);
      }
      if (isSelected) {
        const stride = Math.max(1, Math.floor(displayPoints.length / 8));
        displayPoints.forEach((point, index) => {
          const isLast = index === displayPoints.length - 1;
          if (!isLast && index % stride !== 0) return;
          const ageRatio = clamp((now - point.at) / maxAge, 0, 1);
          L.circleMarker([point.lat, point.lon], {
            color,
            fillColor: color,
            fillOpacity: clamp(0.16 + (1 - ageRatio) * 0.62, 0.16, 0.78),
            interactive: false,
            opacity: clamp(0.24 + (1 - ageRatio) * 0.52, 0.24, 0.76),
            radius: isLast ? 3.7 : 2.2,
            weight: 1,
          }).addTo(layer);
        });
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

  _updateHeaderAndPanels(aircraft, allAircraft = aircraft) {
    const title = this.shadowRoot.querySelector(".title");
    const count = this.shadowRoot.querySelector(".count");
    if (title) title.textContent = this._config.title;
    const scopeLabel = this._scope === "all" ? "visible" : this._scope;
    if (count) count.textContent = `${aircraft.length}/${allAircraft.length} ${scopeLabel} · ${this._config.source}`;

    const lowCount = aircraft.filter((plane) => plane.altitude !== undefined && plane.altitude <= Number(this._config.low_altitude_feet)).length;
    const nearest = aircraft[0];
    const fastest = [...aircraft].filter((plane) => plane.speed !== undefined).sort((a, b) => b.speed - a.speed)[0];
    const lowest = [...aircraft].filter((plane) => plane.altitude !== undefined).sort((a, b) => a.altitude - b.altitude)[0];
    const stats = this.shadowRoot.querySelector(".stats");
    if (stats) {
      stats.style.display = this._config.show_stats ? "grid" : "none";
      stats.innerHTML = `
        ${statHtml("Visible", `${aircraft.length}/${allAircraft.length}`)}
        ${statHtml(`Low ≤${Number(this._config.low_altitude_feet).toLocaleString()} ft`, lowCount)}
        ${statHtml("Nearest", nearest ? shortLabel(nearest) : "—")}
        ${statHtml("Fastest", fastest ? formatSpeed(fastest.speed) : "—")}`;
    }

    const selectedKey = this._selectedHex;
    const selected = selectedKey
      ? aircraft.find((plane) => (plane.hex || plane.entityId) === selectedKey) ||
        allAircraft.find((plane) => (plane.hex || plane.entityId) === selectedKey) ||
        this._lastPlanes.get(selectedKey) ||
        nearest
      : nearest;
    const selectedPanel = this.shadowRoot.querySelector(".selected");
    if (selectedPanel) {
      const key = selected ? selected.hex || selected.entityId : undefined;
      selectedPanel.innerHTML = selected ? selectedHtml(selected, this._trackPoints.get(key) || []) : `<div class="muted">Select an aircraft to inspect it.</div>`;
    }

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
          const allAircraft = localAdsbAircraftFromHass(this._hass, this._config.source);
          this._updateHeaderAndPanels(this._filterAircraft(allAircraft), allAircraft);
        });
      });
    }
    if (lowest && selectedPanel && !selected) selectedPanel.innerHTML = selectedHtml(lowest, this._trackPoints.get(lowest.hex || lowest.entityId) || []);
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
        seenPosition: num(attrs.seen_position_seconds),
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
  if (!plane) return "";
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
  const trend = flightTrend(plane);
  return `<div class="local-adsb-popup">
    <div class="popup-title">${escapeHtml(shortLabel(plane))}</div>
    <div class="popup-grid">
      <span>Altitude</span><strong>${escapeHtml(formatAltitude(plane.altitude) || "—")}</strong>
      <span>Speed</span><strong>${escapeHtml(formatSpeed(plane.speed) || "—")}</strong>
      <span>Trend</span><strong>${escapeHtml(trend.detail)}</strong>
      <span>Heading</span><strong>${escapeHtml(formatHeading(plane.track) || "—")}</strong>
      <span>Distance</span><strong>${escapeHtml(formatDistance(plane.distance) || "—")}</strong>
      <span>Squawk</span><strong>${escapeHtml(plane.squawk || "—")}</strong>
      <span>ICAO</span><strong>${escapeHtml(plane.hex?.toUpperCase() || "—")}</strong>
    </div>
  </div>`;
}

function selectedHtml(plane, points = []) {
  const trend = flightTrend(plane, points);
  const lastSeen = formatLastSeen(plane, points);
  const trail = trailSummary(points);
  const coordinates = formatCoordinates(plane.latitude, plane.longitude);
  const squawkIcao = [plane.hex?.toUpperCase(), plane.squawk].filter(Boolean).join(" / ");
  return `<div class="selected-head">
      <div>
        <div class="selected-title">${escapeHtml(shortLabel(plane))}</div>
        <div class="selected-subline"><span class="mono">${escapeHtml(squawkIcao || "Unknown ICAO")}</span>${lastSeen ? ` · ${escapeHtml(lastSeen)}` : ""}</div>
      </div>
      <div class="status-chip ${escapeHtml(trend.className)}">${escapeHtml(trend.label)}</div>
    </div>
    <div class="selected-grid">
      <div><div class="label">Altitude</div><div class="value">${escapeHtml(formatAltitude(plane.altitude) || "—")}</div></div>
      <div><div class="label">Speed</div><div class="value">${escapeHtml(formatSpeed(plane.speed) || "—")}</div></div>
      <div><div class="label">Heading</div><div class="value">${escapeHtml(formatHeading(plane.track) || "—")}</div></div>
      <div><div class="label">Distance</div><div class="value">${escapeHtml(formatDistance(plane.distance) || "—")}</div></div>
      <div><div class="label">Vertical trend</div><div class="value">${escapeHtml(trend.detail)}</div></div>
      <div><div class="label">Trail</div><div class="value">${escapeHtml(trail || "—")}</div></div>
      <div><div class="label">Coordinates</div><div class="value mono">${escapeHtml(coordinates || "—")}</div></div>
      <div><div class="label">Last point</div><div class="value">${escapeHtml(lastPointSummary(points) || "—")}</div></div>
      <div><div class="label">Entity</div><div class="value mono">${escapeHtml(plane.entityId || plane.hex || "—")}</div></div>
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

function trackPointFromPlane(plane, at) {
  return {
    lat: plane.latitude,
    lon: plane.longitude,
    at: observedAt(plane, at),
    altitude: plane.altitude,
    speed: plane.speed,
    track: plane.track,
    verticalRate: plane.verticalRate,
    distance: plane.distance,
    callsign: plane.callsign,
  };
}

function observedAt(plane, fallbackAt = Date.now()) {
  const ageSeconds = num(plane?.seenPosition) ?? num(plane?.seen);
  if (ageSeconds === undefined) return fallbackAt;
  return fallbackAt - Math.max(0, ageSeconds) * 1000;
}

function thinTrackPoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const thinned = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) {
    thinned.push(points[Math.round(index * step)]);
  }
  return thinned;
}

function flightTrend(plane, points = []) {
  if (plane?.lastSeenAt && Date.now() - plane.lastSeenAt > 20_000) {
    return { label: "Stale", className: "stale", detail: "No recent update" };
  }
  const verticalRate = num(plane?.verticalRate);
  if (verticalRate !== undefined) {
    if (verticalRate >= 300) return { label: "Climbing", className: "climbing", detail: `↑ ${formatVerticalRate(verticalRate)}` };
    if (verticalRate <= -300) return { label: "Descending", className: "descending", detail: `↓ ${formatVerticalRate(verticalRate)}` };
    return { label: "Level", className: "level", detail: formatVerticalRate(verticalRate) };
  }

  const altitudePoints = points.filter((point) => point.altitude !== undefined);
  if (altitudePoints.length >= 2) {
    const first = altitudePoints[0];
    const last = altitudePoints[altitudePoints.length - 1];
    const diff = last.altitude - first.altitude;
    if (diff > 250) return { label: "Climbing", className: "climbing", detail: `↑ ${Math.round(diff).toLocaleString()} ft over trail` };
    if (diff < -250) return { label: "Descending", className: "descending", detail: `↓ ${Math.round(Math.abs(diff)).toLocaleString()} ft over trail` };
    return { label: "Level", className: "level", detail: "Stable over trail" };
  }

  return { label: "Tracking", className: "level", detail: "Live position" };
}

function formatVerticalRate(value) {
  if (value === undefined) return "—";
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString()} fpm`;
}

function formatHeading(track) {
  return track !== undefined ? `${Math.round(track)}°` : "";
}

function formatDistance(distance) {
  return distance !== undefined ? `${distance.toFixed(1)} mi` : "";
}

function formatCoordinates(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function formatLastSeen(plane, points = []) {
  const lastPoint = points[points.length - 1];
  const lastAt = plane?.lastSeenAt || lastPoint?.at;
  if (lastAt) {
    const ageSeconds = Math.max(0, Math.round((Date.now() - lastAt) / 1000));
    return `seen ${formatAge(ageSeconds)} ago`;
  }
  if (plane?.seen !== undefined) return `seen ${formatAge(Math.round(plane.seen))} ago`;
  return "";
}

function formatAge(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function trailSummary(points = []) {
  if (points.length < 2) return "No trail yet";
  const first = points[0];
  const last = points[points.length - 1];
  const durationSeconds = Math.max(0, Math.round((last.at - first.at) / 1000));
  return `${points.length} pts · ${formatAge(durationSeconds)}`;
}

function lastPointSummary(points = []) {
  const point = points[points.length - 1];
  if (!point) return "";
  return [formatAltitude(point.altitude), formatSpeed(point.speed), formatHeading(point.track)]
    .filter(Boolean)
    .join(" · ");
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
    script.src = "/local_adsb/vendor/leaflet/leaflet.js";
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Leaflet failed to load from Local ADS-B assets"));
    document.head.appendChild(script);
  });
  return window.localAdsbLeafletPromise;
}

function mergeTrackPoints(existing, incoming, maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs;
  const merged = [...existing, ...incoming]
    .filter((point) => point.at >= cutoff)
    .sort((a, b) => a.at - b.at);
  const deduped = [];
  for (const point of merged) {
    const last = deduped[deduped.length - 1];
    if (
      last &&
      Math.abs(last.lat - point.lat) < 0.00001 &&
      Math.abs(last.lon - point.lon) < 0.00001 &&
      Math.abs(last.at - point.at) < 2000
    ) {
      continue;
    }
    deduped.push(point);
  }
  return deduped.slice(-240);
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
