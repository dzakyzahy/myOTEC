/* ═══════════════════════════════════════════════════════════════════
   otec_zoning.js  —  myOTEC Unified MCDA + Power-Potential Module
   Three-panel layout:
     LEFT  : Point Analysis Report
     CENTER: Leaflet map with ImageOverlay (canvas-rendered raster)
     RIGHT : MCDA filters + power parameters

   Rendering strategy:
     · Uses an HTML5 <canvas> to paint a per-pixel turbo-colormap
       raster that encodes OTEC Net Power (MW) for cells that
       pass every active MCDA filter; non-qualifying pixels are
       fully transparent.
     · The canvas is converted to a data-URL and fed into
       L.imageOverlay — NO GeoJSON rectangles, NO grid polygons.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Guard: only run on the OTEC zoning page ── */
  if (!document.getElementById("map-otec-zoning")) return;

  /* ── Shared helpers / constants ── */
  const DEG = "\u00B0";
  const UNIT_C = DEG + "C";
  const OTEC_THRESHOLD = (typeof GRID_DATA !== 'undefined' && GRID_DATA.otec_threshold) ? GRID_DATA.otec_threshold : 20;

  /* ── Grid helpers (reuse GRID_DATA & BATHY_GRID from data.js) ── */
  function findNearest(arr, val) {
    let minDiff = Infinity,
      idx = 0;
    for (let i = 0; i < arr.length; i++) {
      const d = Math.abs(arr[i] - val);
      if (d < minDiff) {
        minDiff = d;
        idx = i;
      }
    }
    return idx;
  }

  function getDepthAt(lat, lon) {
    if (typeof BATHY_GRID === "undefined" || !BATHY_GRID?.lat || !BATHY_GRID.lat.length) return null;
    const raw =
      BATHY_GRID.depth[findNearest(BATHY_GRID.lat, lat)]?.[
        findNearest(BATHY_GRID.lon, lon)
      ];
    return raw != null ? Math.abs(raw) : null;
  }

  function gridValueAt(grid2d, lat, lon) {
    if (typeof GRID_DATA === "undefined" || !GRID_DATA?.lat || !GRID_DATA.lat.length || !grid2d) return null;
    const ri = findNearest(GRID_DATA.lat, lat);
    const ci = findNearest(GRID_DATA.lon, lon);
    return grid2d[ri]?.[ci] ?? null;
  }

  /* ── Turbo colormap (Google / Mikhail Pylnev, 200-stop LUT) ── */
  const TURBO_LUT = (() => {
    /* Compact keyframe definition [t, r, g, b] */
    const kf = [
      [0.0, 48, 18, 59],
      [0.1, 70, 114, 196],
      [0.2, 56, 185, 228],
      [0.3, 45, 219, 177],
      [0.4, 76, 232, 99],
      [0.5, 168, 234, 37],
      [0.6, 234, 209, 39],
      [0.7, 247, 152, 40],
      [0.8, 230, 87, 26],
      [0.9, 188, 35, 18],
      [1.0, 122, 4, 3],
    ];
    const lut = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let lo = 0;
      for (let k = 1; k < kf.length; k++) {
        if (kf[k][0] >= t) {
          lo = k - 1;
          break;
        }
        lo = k;
      }
      const hi = Math.min(lo + 1, kf.length - 1);
      const span = kf[hi][0] - kf[lo][0] || 1;
      const f = (t - kf[lo][0]) / span;
      lut[i * 3] = Math.round(kf[lo][1] + (kf[hi][1] - kf[lo][1]) * f);
      lut[i * 3 + 1] = Math.round(kf[lo][2] + (kf[hi][2] - kf[lo][2]) * f);
      lut[i * 3 + 2] = Math.round(kf[lo][3] + (kf[hi][3] - kf[lo][3]) * f);
    }
    return lut;
  })();

  function turboRGB(t) {
    const i = Math.max(0, Math.min(255, Math.round(t * 255)));
    return [TURBO_LUT[i * 3], TURBO_LUT[i * 3 + 1], TURBO_LUT[i * 3 + 2]];
  }

  /* ── State ── */
  let overlayLayer = null;
  let clickMarker = null;

  /* ── Map init ── */
  const lats = (typeof GRID_DATA !== 'undefined' && GRID_DATA.lat) ? GRID_DATA.lat : [];
  const lons = (typeof GRID_DATA !== 'undefined' && GRID_DATA.lon) ? GRID_DATA.lon : [];

  let latMin = -11.5, latMax = 6.0;
  let lonMin = 95.0, lonMax = 141.0;

  if (lats.length > 0 && lons.length > 0) {
    latMin = Math.min(...lats);
    latMax = Math.max(...lats);
    lonMin = Math.min(...lons);
    lonMax = Math.max(...lons);
  } else {
    // Region fallbacks when GRID_DATA is empty
    const urlParams = new URLSearchParams(window.location.search);
    const reg = urlParams.get('region');
    if (reg === 'sulawesi_utara') {
      latMin = 0.5; latMax = 5.5; lonMin = 121.0; lonMax = 127.5;
    } else if (reg === 'bali_selatan') {
      latMin = -11.5; latMax = -8.0; lonMin = 113.0; lonMax = 117.0;
    } else if (reg === 'ntt_barat') {
      latMin = -11.5; latMax = -8.0; lonMin = 117.0; lonMax = 121.0;
    } else if (reg === 'maluku_selatan') {
      latMin = -9.5; latMax = -5.0; lonMin = 128.0; lonMax = 135.0;
    } else if (reg === 'papua_utara') {
      latMin = -4.0; latMax = 2.0; lonMin = 130.0; lonMax = 141.0;
    }
  }
  const center = [(latMin + latMax) / 2, (lonMin + lonMax) / 2];
  const overlayBounds = [
    [latMin, lonMin],
    [latMax, lonMax],
  ];

  const map = L.map("map-otec-zoning", { center, zoom: 7, zoomControl: false });
  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    { attribution: "&copy; OSM &copy; CARTO", subdomains: "abcd", maxZoom: 19 }
  ).addTo(map);

  /* Draw 1000 m contour if available */
  if (typeof CONTOUR_1000M !== "undefined" && CONTOUR_1000M) {
    CONTOUR_1000M.forEach((line) =>
      L.polyline(line, { color: "#3DA87A", weight: 1.8, opacity: 0.7 }).addTo(
        map
      )
    );
  }

  /* ── Core: build canvas → ImageOverlay ── */
  const MAX_POWER_MW = 20; /* normalisation ceiling for colormap */

  function buildOverlay() {
    /* Read controls */
    const useDepth = document.getElementById("oz-mcda-depth")?.checked ?? true;
    const useDt = document.getElementById("oz-mcda-deltat")?.checked ?? true;
    const useCur = document.getElementById("oz-mcda-current")?.checked ?? true;
    const rawEff = parseFloat(
      document.getElementById("oz-efficiency")?.value ?? "3"
    );
    /* Clamp: forbid unrealistic 90 %+, default 3 % */
    const eff = Math.max(0.5, Math.min(rawEff, 89)) / 100;
    const flow = Math.max(
      1,
      parseFloat(document.getElementById("oz-flow")?.value ?? "100")
    );

    const nLat = lats.length;
    const nLon = lons.length;

    /* Create canvas sized to grid resolution */
    const canvas = document.createElement("canvas");
    canvas.width = nLon;
    canvas.height = nLat;
    const ctx = canvas.getContext("2d");
    const SCALE = 16;
    canvas.width = nLon * SCALE;
    canvas.height = nLat * SCALE;
    // const imgData = ctx.createImageData(nLon, nLat);

    for (let i = 0; i < nLat; i++) {
      for (let j = 0; j < nLon; j++) {
        const pixelIdx = (i * nLon + j) * 4;

        const dt = GRID_DATA.delta_t[i]?.[j];
        const cur = GRID_DATA.current[i]?.[j];
        const lat = lats[i];
        const lon = lons[j];
        const depth = getDepthAt(lat, lon);

        /* MCDA gate: each active filter must pass */
        let pass = true;
        if (useDt && (dt == null || dt < OTEC_THRESHOLD)) pass = false;
        if (useCur && (cur == null || cur >= 1)) pass = false;
        if (useDepth && (depth == null || depth < 1000)) pass = false;

        if (!pass || dt == null) {
          /* fully transparent */
          // transparent
          continue;
        }

        /* Gross power (Carnot-style): P_gross ∝ Q·(ΔT)² */
        const grossMW = (flow / 100) * 10 * Math.pow(dt / OTEC_THRESHOLD, 2);
        /* Net power */
        const netMW = eff * grossMW;

        const t = Math.min(1, netMW / MAX_POWER_MW);
        const [r, g, b] = turboRGB(t);

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
        ctx.fillRect(j * SCALE, i * SCALE, SCALE, SCALE); /* semi-transparent: 82% */
      }
    }

    // ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  function refreshOverlay() {
    if (overlayLayer) map.removeLayer(overlayLayer);
    const dataUrl = buildOverlay();
    overlayLayer = L.imageOverlay(dataUrl, overlayBounds, { opacity: 1 });
    overlayLayer.addTo(map);
    renderColorbarLegend();
  }

  /* ── Colorbar legend (horizontal, turbo) ── */
  function renderColorbarLegend() {
    const el = document.getElementById("oz-colorbar-canvas");
    if (!el) return;
    const w = el.width,
      h = el.height;
    const ctx = el.getContext("2d");
    for (let x = 0; x < w; x++) {
      const [r, g, b] = turboRGB(x / (w - 1));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, 1, h);
    }
  }

  /* ── Left panel: Point Analysis Report ── */
  function renderReport(data) {
    const panel = document.getElementById("oz-report-body");
    if (!panel) return;

    if (!data) {
      panel.innerHTML = `
        <div class="oz-report-placeholder">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.35">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <p>Klik titik pada peta<br>untuk melihat analisis</p>
        </div>`;
      return;
    }

    const eligible = data.pass;
    const statusColor = eligible ? "#3DA87A" : "#C95454";
    const statusBg = eligible
      ? "rgba(61,168,122,0.1)"
      : "rgba(201,84,84,0.1)";
    const statusBorder = eligible
      ? "rgba(61,168,122,0.25)"
      : "rgba(201,84,84,0.25)";
    const statusText = eligible ? "LAYAK (Eligible)" : "TIDAK LAYAK (Not Eligible)";

    const fmt = (v, dec, unit) =>
      v != null && !isNaN(v) ? `${v.toFixed(dec)} ${unit}` : "N/A";

    panel.innerHTML = `
      <!-- Coordinates -->
      <div class="oz-report-coord">
        <span class="oz-chip">LAT</span> ${data.lat.toFixed(5)}
        &nbsp;<span class="oz-chip">LON</span> ${data.lon.toFixed(5)}
      </div>

      <!-- Feasibility badge -->
      <div class="oz-status-badge" style="background:${statusBg};border:1px solid ${statusBorder};color:${statusColor}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">${eligible ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'}</svg>
        ${statusText}
      </div>

      <!-- Physical data -->
      <div class="oz-report-section-title">DATA FISIK</div>
      <div class="oz-metrics-grid">
        <div class="oz-metric">
          <div class="oz-metric-label">Kedalaman</div>
          <div class="oz-metric-value">${fmt(data.depth, 0, "m")}</div>
        </div>
        <div class="oz-metric">
          <div class="oz-metric-label">SST (Permukaan)</div>
          <div class="oz-metric-value">${fmt(data.sst, 2, UNIT_C)}</div>
        </div>
        <div class="oz-metric">
          <div class="oz-metric-label">Suhu Dalam (1000 m)</div>
          <div class="oz-metric-value">${fmt(data.deepTemp, 2, UNIT_C)}</div>
        </div>
        <div class="oz-metric">
          <div class="oz-metric-label">Delta T (ΔT)</div>
          <div class="oz-metric-value" style="color:${data.dt != null && data.dt >= OTEC_THRESHOLD ? "#3DA87A" : "#C9A84C"}">${fmt(data.dt, 2, UNIT_C)}</div>
        </div>
        <div class="oz-metric">
          <div class="oz-metric-label">Arus Maks</div>
          <div class="oz-metric-value" style="color:${data.cur != null && data.cur < 1 ? "#3DA87A" : "#C9A84C"}">${fmt(data.cur, 3, "m/s")}</div>
        </div>
      </div>

      <!-- Thermodynamic output -->
      <div class="oz-report-section-title">OUTPUT TERMODINAMIK</div>
      <div class="oz-metrics-grid">
        <div class="oz-metric oz-metric-wide">
          <div class="oz-metric-label">Est. Daya Bruto (Gross)</div>
          <div class="oz-metric-value oz-power-val">${data.grossMW != null ? data.grossMW.toFixed(3) + " MW" : "N/A"}</div>
        </div>
        <div class="oz-metric oz-metric-wide">
          <div class="oz-metric-label">Est. Daya Neto (Net)</div>
          <div class="oz-metric-value oz-power-val" style="color:#4A9EBF">${data.netMW != null ? data.netMW.toFixed(3) + " MW" : "N/A"}</div>
        </div>
      </div>

      <!-- MCDA detail -->
      <div class="oz-report-section-title">KRITERIA MCDA</div>
      <div class="oz-criteria-list">
        ${[
          { label: "Kedalaman > 1000 m", ok: data.depth != null && data.depth >= 1000 },
          { label: `ΔT > ${OTEC_THRESHOLD} °C`, ok: data.dt != null && data.dt >= OTEC_THRESHOLD },
          { label: "Arus < 1 m/s", ok: data.cur != null && data.cur < 1 },
        ]
          .map(
            (c) => `
          <div class="oz-criterion">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c.ok ? "#3DA87A" : "#C95454"}" stroke-width="2.5" stroke-linecap="round">
              ${c.ok ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'}
            </svg>
            <span style="color:${c.ok ? "var(--text-primary)" : "var(--text-muted)"}">${c.label}</span>
          </div>`
          )
          .join("")}
      </div>`;
  }

  /* ── Map click handler ── */
  map.on("click", (e) => {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    /* Read grid values */
    const dt = gridValueAt(GRID_DATA.delta_t, lat, lon);
    const sst = gridValueAt(GRID_DATA.sst, lat, lon);
    const cur = gridValueAt(GRID_DATA.current, lat, lon);
    const depth = getDepthAt(lat, lon);

    /* Deep temp from GRID_DATA.deep_temp (if available) */
    const deepTemp =
      typeof GRID_DATA.deep_temp !== "undefined"
        ? gridValueAt(GRID_DATA.deep_temp, lat, lon)
        : null;

    /* Current active filters */
    const useDepth = document.getElementById("oz-mcda-depth")?.checked ?? true;
    const useDt = document.getElementById("oz-mcda-deltat")?.checked ?? true;
    const useCur = document.getElementById("oz-mcda-current")?.checked ?? true;

    let pass = true;
    if (useDt && (dt == null || dt < OTEC_THRESHOLD)) pass = false;
    if (useCur && (cur == null || cur >= 1)) pass = false;
    if (useDepth && (depth == null || depth < 1000)) pass = false;

    /* Power calc */
    const rawEff = parseFloat(
      document.getElementById("oz-efficiency")?.value ?? "3"
    );
    const eff = Math.max(0.5, Math.min(rawEff, 89)) / 100;
    const flow = Math.max(
      1,
      parseFloat(document.getElementById("oz-flow")?.value ?? "100")
    );
    let grossMW = null,
      netMW = null;
    if (dt != null) {
      grossMW = (flow / 100) * 10 * Math.pow(dt / OTEC_THRESHOLD, 2);
      netMW = eff * grossMW;
    }

    /* Marker */
    if (clickMarker) map.removeLayer(clickMarker);
    clickMarker = L.circleMarker([lat, lon], {
      radius: 7,
      fillColor: pass ? "#3DA87A" : "#C95454",
      color: "#D8DEE4",
      weight: 2,
      fillOpacity: 0.95,
    }).addTo(map);

    renderReport({ lat, lon, dt, sst, deepTemp, cur, depth, grossMW, netMW, pass });
  });

  /* ── Bind controls ── */
  function bindControls() {
    [
      "oz-mcda-depth",
      "oz-mcda-deltat",
      "oz-mcda-current",
      "oz-efficiency",
      "oz-flow",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", refreshOverlay);
      el.addEventListener("input", () => {
        /* Live-update efficiency display */
        if (id === "oz-efficiency") {
          const v = parseFloat(el.value);
          const clamped = Math.max(0.5, Math.min(v, 89));
          if (v !== clamped) el.value = clamped;
          const disp = document.getElementById("oz-efficiency-display");
          if (disp) disp.textContent = clamped + "%";
        }
        if (id === "oz-flow") {
          const disp = document.getElementById("oz-flow-display");
          if (disp) disp.textContent = el.value + " m³/s";
        }
      });
    });
  }

  /* ── Init ── */
  document.addEventListener("DOMContentLoaded", () => {
    bindControls();
    renderReport(null);
    refreshOverlay();
  });

  /* Expose for external call if page is pre-loaded */
  if (document.readyState !== "loading") {
    bindControls();
    renderReport(null);
    refreshOverlay();
  }
})();
