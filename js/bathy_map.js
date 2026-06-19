/* bathy_map.js — Batimetri dinamis (API) + kontur; fallback PNG statis */
/* bathy_map.js — Batimetri dinamis (API) + kontur; fallback PNG statis */

const BathyMap = (() => {
  const UNIT_C = "\u00B0C";
  let map = null;
  let rasterLayer = null;
  let tileLayer = null;
  let fillLayer = null;
  let indexLayer = null;
  let landLayer = null;
  let clickMarker = null;
  let rangeMin = 0;
  let rangeMax = 3000;
  let meta = null;
  let fillCache = null;
  let indexCache = null;
  let sampleGrid = null;
  let landFeatures = null;
  let useDynamicApi = false;
  let rasterDebounce = null;
  let boundsFitted = false;

  function isOffline() {
    return window.location.protocol === "file:";
  }

  function apiBase() {
    if (typeof BATHY_API_BASE !== "undefined" && BATHY_API_BASE) {
      return String(BATHY_API_BASE).replace(/\/$/, "");
    }
    if (window.location.port === "8000") return "";
    return "http://127.0.0.1:8000";
  }

  function dynamicBathyUrl(minM, maxM) {
    const base = apiBase();
    const q = `min=${encodeURIComponent(minM)}&max=${encodeURIComponent(maxM)}&_=${Date.now()}`;
    return `${base}/api/bathy?${q}`;
  }

  function metaDefaults() {
    if (typeof BATHY_META !== "undefined") {
      const uParams = new URLSearchParams(window.location.search);
      const regId = uParams.get('region') || 'bali_selatan';
      let m = { ...BATHY_META };
      if (m.raster_url && m.raster_url.startsWith("data/bathy/")) {
        m.raster_url = m.raster_url.replace("data/bathy/", "data/" + regId + "/bathy/");
      }
      if (m.sample_grid_url && m.sample_grid_url.startsWith("data/bathy/")) {
        m.sample_grid_url = m.sample_grid_url.replace("data/bathy/", "data/" + regId + "/bathy/");
      }
      return m;
    }
    return {
      depth_min_m: 0,
      depth_max_m: 4600,
      default_range_m: [0, 3000],
      bounds:
        typeof BATHY_BOUNDS !== "undefined"
          ? [
              [BATHY_BOUNDS.bottom, BATHY_BOUNDS.left],
              [BATHY_BOUNDS.top, BATHY_BOUNDS.right],
            ]
          : null,
      raster_url: null,
    };
  }

  function resolveUrl(rel) {
    const urlParams = new URLSearchParams(window.location.search);
    const region = urlParams.get('region');
    if (region && rel.startsWith('data/')) {
       const filename = rel.substring(5);
       rel = `data/${region}/${filename}`;
    }
    return new URL(rel, window.location.href).href;
  }

  function fetchJson(url) {
    if (isOffline())
      return Promise.reject(new Error("fetch blocked on file://"));
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(url);
      return r.json();
    });
  }

  function probeDynamicApi() {
    if (isOffline()) return Promise.resolve(false);
    const url = `${apiBase()}/api/bathy/meta`;
    return fetch(url, { method: "GET", mode: "cors" })
      .then((r) => r.ok)
      .catch(() => false);
  }

  function loadLayers() {
    if (fillCache) return Promise.resolve();

    if (typeof BATHY_FILL_EMBEDDED !== "undefined") {
      fillCache = BATHY_FILL_EMBEDDED;
      indexCache =
        typeof BATHY_INDEX_EMBEDDED !== "undefined"
          ? BATHY_INDEX_EMBEDDED
          : typeof BATHY_FULL_GEOJSON !== "undefined"
            ? BATHY_FULL_GEOJSON
            : { type: "FeatureCollection", features: [] };
      return Promise.resolve();
    }

    if (typeof BATHY_FULL_GEOJSON !== "undefined") {
      fillCache = {
        type: "FeatureCollection",
        features: (BATHY_FULL_GEOJSON.features || []).filter(
          (f) => f.geometry?.type !== "Point",
        ),
      };
      indexCache = { type: "FeatureCollection", features: [] };
      return Promise.resolve();
    }

    const fillUrl =
      typeof BATHY_FILL_GEOJSON_URL !== "undefined"
        ? resolveUrl(BATHY_FILL_GEOJSON_URL)
        : null;
    const idxUrl =
      typeof BATHY_INDEX_GEOJSON_URL !== "undefined"
        ? resolveUrl(BATHY_INDEX_GEOJSON_URL)
        : null;
    if (!fillUrl) return Promise.reject(new Error("no bathy data"));
    return fetchJson(fillUrl).then((fill) => {
      fillCache = fill;
      if (!idxUrl) {
        indexCache = { type: "FeatureCollection", features: [] };
        return;
      }
      return fetchJson(idxUrl)
        .then((idx) => {
          indexCache = idx;
        })
        .catch(() => {
          indexCache = { type: "FeatureCollection", features: [] };
        });
    });
  }

  function loadSampleGrid() {
    if (sampleGrid) return Promise.resolve();
    if (
      typeof BATHY_SAMPLE_GRID_EMBEDDED !== "undefined" &&
      BATHY_SAMPLE_GRID_EMBEDDED?.lat
    ) {
      sampleGrid = BATHY_SAMPLE_GRID_EMBEDDED;
      return Promise.resolve();
    }
    if (typeof BATHY_GRID !== "undefined" && BATHY_GRID?.lat) {
      sampleGrid = BATHY_GRID;
      return Promise.resolve();
    }
    const url = meta?.sample_grid_url ? resolveUrl(meta.sample_grid_url) : null;
    if (!url) return Promise.resolve();
    return fetchJson(url)
      .then((g) => {
        sampleGrid = g;
      })
      .catch(() => {});
  }

  function depthInRange(depthPos) {
    return depthPos >= rangeMin && depthPos <= rangeMax;
  }

  function removeRasterLayers() {
    if (tileLayer) {
      map.removeLayer(tileLayer);
      tileLayer = null;
    }
    if (rasterLayer) {
      map.removeLayer(rasterLayer);
      rasterLayer = null;
    }
  }

  function fitBoundsOnce() {
    if (!map || !meta?.bounds || boundsFitted) return;
    try {
      map.fitBounds(meta.bounds, { padding: [24, 24], maxZoom: 10 });
      boundsFitted = true;
    } catch (e) {
      /* ignore */
    }
  }

  function addRasterOverlay(url) {
    if (!map || !meta?.bounds) return false;
    removeRasterLayers();
    const b = meta.bounds;
    rasterLayer = L.imageOverlay(url, b, {
      opacity: 0.96,
      className: "bathy-raster-layer",
      interactive: false,
    }).addTo(map);
    fitBoundsOnce();
    return true;
  }

  function refreshDynamicRaster() {
    if (!useDynamicApi || !map || !meta?.bounds) return;
    const url = dynamicBathyUrl(rangeMin, rangeMax);
    addRasterOverlay(url);
  }

  function scheduleDynamicRaster() {
    if (!useDynamicApi) return;
    clearTimeout(rasterDebounce);
    rasterDebounce = setTimeout(refreshDynamicRaster, 280);
  }

  function addStaticRasterFallback() {
    if (!meta?.raster_url) return false;
    return addRasterOverlay(resolveUrl(meta.raster_url));
  }

  function addRasterBase() {
    if (useDynamicApi) {
      refreshDynamicRaster();
      return;
    }

    // Jika API dinamis tidak tersedia, jangan tampilkan raster penuh yang
    // mengabaikan rentang slider. Gunakan fallback vector yang sudah difilter
    // berdasarkan rangeMin/rangeMax agar area di luar rentang hilang.
    if (fillCache) {
      return;
    }

    addStaticRasterFallback();
  }

  function addLandMask() {
    if (!map || landLayer || typeof PROVINCES_GEOJSON === "undefined") return;
    landLayer = L.geoJSON(PROVINCES_GEOJSON, {
      style: {
        fillColor: "#0f172a",
        fillOpacity: 0.55,
        color: "#94a3b8",
        weight: 1.2,
        opacity: 0.9,
      },
      interactive: false,
    }).addTo(map);
  }

  function refreshVectors() {
    if (!map) return;
    if (fillLayer) {
      map.removeLayer(fillLayer);
      fillLayer = null;
    }
    if (indexLayer) {
      map.removeLayer(indexLayer);
      indexLayer = null;
    }
    if (!fillCache) return;

    const showFill = true; // Selalu tampilkan vector contour, jangan disembunyikan walau API aktif
    if (showFill) {
      fillLayer = L.geoJSON(fillCache, {
        filter: (f) => depthInRange(Math.abs(f.properties.depth || 0)),
        style: (f) => ({
          fillColor: f.properties.fill || "#3b82f6",
          fillOpacity: 0.72,
          weight: 0,
          stroke: false,
        }),
        onEachFeature: (f, layer) => {
          layer.bindTooltip(
            `<b>Kedalaman:</b> ${f.properties.title || f.properties.depth + " m"}`,
            {
              sticky: true,
              className: "bathy-tooltip",
            },
          );
        },
      }).addTo(map);
    }

    if (indexCache?.features?.length) {
      indexLayer = L.geoJSON(indexCache, {
        filter: (f) => depthInRange(Math.abs(f.properties.depth || 0)),
        style: (f) => ({
          color: f.properties.index_class === "major" ? "#ff3b3b" : "#000000",
          weight: f.properties.index_class === "major" ? 2.2 : 1.2,
          opacity: 0.96,
          fill: false,
          dashArray: f.properties.index_class === "major" ? null : "8,4",
        }),
      }).addTo(map);
    }
  }

  function initLandIndex() {
    if (
      typeof PROVINCES_GEOJSON !== "undefined" &&
      PROVINCES_GEOJSON.features
    ) {
      landFeatures = PROVINCES_GEOJSON.features;
    }
  }

  function distanceToShoreKm(lat, lon) {
    if (typeof turf === "undefined" || !landFeatures?.length) return null;
    const pt = turf.point([lon, lat]);
    let minKm = Infinity;
    for (const f of landFeatures) {
      try {
        if (turf.booleanPointInPolygon(pt, f)) return 0;
        const boundary = turf.polygonToLine(f);
        const lines =
          boundary.type === "FeatureCollection"
            ? boundary.features
            : [boundary];
        for (const lineFeat of lines) {
          const snapped = turf.nearestPointOnLine(lineFeat, pt);
          const d = turf.distance(pt, snapped, { units: "kilometers" });
          if (d < minKm) minKm = d;
        }
      } catch (e) {
        /* skip */
      }
    }
    return Number.isFinite(minKm) ? minKm : null;
  }

  function gridAt(grid, lat, lon) {
    if (!grid?.lat) return null;
    let latIdx = 0;
    let lonIdx = 0;
    let minLat = Infinity;
    let minLon = Infinity;
    for (let i = 0; i < grid.lat.length; i++) {
      const d = Math.abs(grid.lat[i] - lat);
      if (d < minLat) {
        minLat = d;
        latIdx = i;
      }
    }
    for (let j = 0; j < grid.lon.length; j++) {
      const d = Math.abs(grid.lon[j] - lon);
      if (d < minLon) {
        minLon = d;
        lonIdx = j;
      }
    }
    const raw = grid.depth[latIdx]?.[lonIdx];
    return raw != null ? Math.abs(raw) : null;
  }

  function sampleDepth(lat, lon) {
    return gridAt(sampleGrid, lat, lon);
  }

  function estimateSlope(lat, lon) {
    const d0 = sampleDepth(lat, lon);
    if (d0 == null) return null;
    const dLon = sampleDepth(lat, lon + 0.02);
    const dLat = sampleDepth(lat + 0.02, lon);
    if (dLon == null || dLat == null) return null;
    const dx = (dLon - d0) / 0.02;
    const dy = (dLat - d0) / 0.02;
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
    const grad = Math.sqrt((dx / mPerDegLon) ** 2 + (dy / mPerDegLat) ** 2);
    return Math.atan(grad) * (180 / Math.PI);
  }

  function renderBathyPanel(lat, lon) {
    const depth = sampleDepth(lat, lon);
    const slope = estimateSlope(lat, lon);
    const shore = distanceToShoreKm(lat, lon);
    const sst =
      typeof GRID_DATA !== "undefined"
        ? gridValueAtBathy(GRID_DATA.sst, lat, lon)
        : null;
    const delta =
      typeof GRID_DATA !== "undefined"
        ? gridValueAtBathy(GRID_DATA.delta_t, lat, lon)
        : null;

    const metricsEl = document.getElementById("info-metrics");
    if (metricsEl) {
      metricsEl.style.display = "grid";
      metricsEl.innerHTML = [
        {
          label: "KEDALAMAN",
          value: depth != null ? depth.toFixed(0) : "N/A",
          unit: "m",
        },
        {
          label: "SLOPE",
          value: slope != null ? slope.toFixed(2) : "N/A",
          unit: "\u00b0",
        },
        {
          label: "JARAK PANTAI",
          value: shore != null ? shore.toFixed(2) : "N/A",
          unit: "km",
        },
        {
          label: "SST",
          value: sst != null ? sst.toFixed(2) : "N/A",
          unit: UNIT_C,
        },
        {
          label: "DELTA T",
          value: delta != null ? delta.toFixed(2) : "N/A",
          unit: UNIT_C,
        },
      ]
        .map(
          (m) => `
        <div class="metric-card">
          <div class="metric-label">${m.label}</div>
          <div class="metric-value">${m.value}</div>
          <div class="metric-unit">${m.unit}</div>
        </div>`,
        )
        .join("");
    }

    const metaEl = document.getElementById("bathy-point-meta");
    if (metaEl) {
      metaEl.innerHTML = `
        <div class="analysis-row"><span class="analysis-row-label">KOORDINAT</span><span class="analysis-row-value">${lat.toFixed(5)}, ${lon.toFixed(5)}</span></div>
        <div class="analysis-row"><span class="analysis-row-label">SUMBER</span><span class="analysis-row-value">${meta?.source || "BATNAS"}</span></div>
        <div class="analysis-row"><span class="analysis-row-label">RENTANG FILTER</span><span class="analysis-row-value">${rangeMin}&ndash;${rangeMax} m</span></div>`;
    }
  }

  function gridValueAtBathy(grid, lat, lon) {
    if (!grid || typeof GRID_DATA === "undefined") return null;
    let li = 0;
    let lj = 0;
    for (let i = 0; i < GRID_DATA.lat.length; i++) {
      if (Math.abs(GRID_DATA.lat[i] - lat) < Math.abs(GRID_DATA.lat[li] - lat))
        li = i;
    }
    for (let j = 0; j < GRID_DATA.lon.length; j++) {
      if (Math.abs(GRID_DATA.lon[j] - lon) < Math.abs(GRID_DATA.lon[lj] - lon))
        lj = j;
    }
    return grid[li]?.[lj] ?? null;
  }

  function bindDualRange() {
    const track = document.getElementById("bathy-range-track");
    const minIn = document.getElementById("bathy-range-min");
    const maxIn = document.getElementById("bathy-range-max");
    const label = document.getElementById("bathy-range-label");
    if (!minIn || !maxIn) return;

    const dmax = meta?.depth_max_m || 4600;
    minIn.min = maxIn.min = "0";
    minIn.max = maxIn.max = String(Math.round(dmax));
    minIn.value = String(rangeMin);
    maxIn.value = String(rangeMax);

    const update = () => {
      let a = parseInt(minIn.value, 10);
      let b = parseInt(maxIn.value, 10);
      if (a > b) [a, b] = [b, a];
      rangeMin = a;
      rangeMax = b;
      minIn.value = String(a);
      maxIn.value = String(b);
      if (label) label.textContent = `${a} – ${b} m`;
      if (track) {
        const p0 = (a / dmax) * 100;
        const p1 = (b / dmax) * 100;
        track.style.setProperty("--range-a", p0 + "%");
        track.style.setProperty("--range-b", p1 + "%");
      }
      scheduleDynamicRaster();
      refreshVectors();
      updateBathyLegend();
    };

    minIn.oninput = update;
    maxIn.oninput = update;
    update();
  }

  function buildBathyLegendGradient() {
    if (!fillCache?.features?.length) return null;
    const colorsByDepth = new Map();
    for (const feature of fillCache.features) {
      const props = feature?.properties;
      const fill = props?.fill;
      const depth = Number(props?.depth);
      if (!fill || Number.isNaN(depth)) continue;
      if (!colorsByDepth.has(fill)) colorsByDepth.set(fill, depth);
    }
    if (colorsByDepth.size < 2) return null;
    const sorted = Array.from(colorsByDepth.entries()).sort(
      (a, b) => a[1] - b[1],
    );
    const stops = sorted.map(([fill]) => fill);
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }

  function updateBathyLegend() {
    const el = document.getElementById("legend-bathy");
    if (!el) return;
    const mode = useDynamicApi
      ? "Render dinamis (luar rentang = transparan)"
      : "Mode statis (jalankan bathy_api.py untuk dinamis)";
    const gradient =
      buildBathyLegendGradient() ||
      "linear-gradient(to right, #1a4d2e, #6b8f3c, #c4a035, #7eb8c9, #1e3a5f, #0c1929)";
    el.innerHTML = `
      <div class="legend-title">Kedalaman</div>
      <div class="legend-gradient bathy-legend-gradient" style="background: ${gradient}"></div>
      <div class="legend-labels legend-labels-3">
        <span>${rangeMin} m</span>
        <span>${Math.round((rangeMin + rangeMax) / 2)} m</span>
        <span>${rangeMax} m</span>
      </div>
      <div class="legend-line-item">
        <span class="legend-line-swatch legend-line-solid"></span>
        <span>Index kontur (1000 m)</span>
      </div>
      <div class="legend-line-item">
        <span class="legend-line-swatch legend-line-dashed"></span>
        <span>Index minor (500 m)</span>
      </div>`;
  }

  function setupClick() {
    if (!map) return;
    map.on("click", (e) => {
      const { lat, lng: lon } = e.latlng;
      if (clickMarker) map.removeLayer(clickMarker);
      clickMarker = L.circleMarker([lat, lon], {
        radius: 7,
        fillColor: "#38bdf8",
        color: "#fff",
        weight: 2,
        fillOpacity: 0.95,
      }).addTo(map);
      renderBathyPanel(lat, lon);
    });
  }

  function bindUi() {
    bindDualRange();
    updateBathyLegend();
  }

  function init(leafletMap) {
    if (map) return Promise.resolve();
    map = leafletMap;
    meta = metaDefaults();
    if (meta.default_range_m) {
      rangeMin = meta.default_range_m[0];
      rangeMax = meta.default_range_m[1];
    }
    initLandIndex();
    boundsFitted = false;

    return probeDynamicApi()
      .then((ok) => {
        useDynamicApi = ok;
        if (ok) console.info("[bathy] API dinamis aktif:", apiBase());
        else
          console.warn(
            "[bathy] API tidak aktif — fallback PNG statis. Jalankan: python -m uvicorn bathy_api:app --port 8000",
          );
      })
      .then(() => loadSampleGrid())
      .then(() => loadLayers())
      .then(() => {
        addRasterBase();
        addLandMask();
        refreshVectors();
        setupClick();
      })
      .catch((err) => {
        console.warn("[bathy]", err);
        useDynamicApi = false;
        if (typeof BATHY_FULL_GEOJSON !== "undefined") {
          fillCache = null;
          indexCache = BATHY_FULL_GEOJSON;
        }
        addStaticRasterFallback();
        refreshVectors();
        setupClick();
      });
  }

  function invalidate() {
    if (map) map.invalidateSize();
  }

  return { init, bindUi, invalidate, updateBathyLegend };
})();
