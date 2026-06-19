/* ═══════════════════════════════════════════
   analysis.js — myOTEC Analysis (3-category nav)
   ═══════════════════════════════════════════ */

const OTEC_THRESHOLD = (typeof GRID_DATA !== 'undefined' && GRID_DATA.otec_threshold) ? GRID_DATA.otec_threshold : 20;
const DEG = "\u00B0";
const UNIT_C = DEG + "C";
const EN_DASH = "\u2013";
const DELTA_T = "\u0394T";

const latArr = (typeof GRID_DATA !== 'undefined' && GRID_DATA.lat) ? GRID_DATA.lat : [];
const lonArr = (typeof GRID_DATA !== 'undefined' && GRID_DATA.lon) ? GRID_DATA.lon : [];

let latMin = -11.5, latMax = 6.0;
let lonMin = 95.0, lonMax = 141.0;

if (latArr.length > 0 && lonArr.length > 0) {
  latMin = Math.min(...latArr);
  latMax = Math.max(...latArr);
  lonMin = Math.min(...lonArr);
  lonMax = Math.max(...lonArr);
} else {
  // Region fallbacks when GRID_DATA is empty
  const urlParams = new URLSearchParams(window.location.search);
  const reg = urlParams.get('region');
  if (reg === 'sulawesi_utara') {
    latMin = -1.0; latMax = 3.5; lonMin = 122.0; lonMax = 127.0;
  } else if (reg === 'bali_selatan') {
    latMin = -11.5; latMax = -8.0; lonMin = 113.0; lonMax = 117.0;
  } else if (reg === 'laut_banda') {
    latMin = -6.3; latMax = -5.0; lonMin = 122.9; lonMax = 124.6;
  } else if (reg === 'selat_makassar') {
    latMin = -4.0; latMax = 1.0; lonMin = 116.0; lonMax = 120.0;
  } else if (reg === 'selat_malaka') {
    latMin = 0.0; latMax = 6.0; lonMin = 97.0; lonMax = 104.0;
  } else if (reg === 'babel') {
    latMin = -4.0; latMax = -1.0; lonMin = 104.0; lonMax = 109.0;
  } else if (reg === 'flores') {
    latMin = -9.0; latMax = -6.0; lonMin = 119.0; lonMax = 124.0;
  } else if (reg === 'sumatera_barat') {
    latMin = -4.0; latMax = 1.0; lonMin = 97.0; lonMax = 101.0;
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

const maps = {};
if (typeof window !== "undefined") window.maps = maps;
const initialized = {};
let currentPage = "sst_map";
let deltaThresholdOn = false;
let deltaGeoLayer = null;
let deltaThresholdLayer = null;
let deltaBathyLayer = null;
let deltaShardCache = {};
const DELTA_DEPTH_LEVELS = [100, 200, 500, 800, 1000];
let deltaYear = "2024";
let deltaDepthM = 800;
let powerOverlayLayer = null;
let feasibilityLayer = null;
let otecEvalLayer = null;
let infraState = { points: [], polyline: null, drawMode: false };

const YEARS = [
  "2015",
  "2016",
  "2017",
  "2018",
  "2019",
  "2020",
  "2021",
  "2022",
  "2023",
  "2024",
  "2025",
];
const SEASONS = [
  { id: "djf", label: "DJF (Des\u2013Feb)" },
  { id: "mam", label: "MAM (Mar\u2013Mei)" },
  { id: "jja", label: "JJA (Jun\u2013Agu)" },
  { id: "son", label: "SON (Sep\u2013Nov)" },
];
const DEPTH_LEVELS = [0, 100, 500, 1000];
const WAVE_SEASONS = [
  { id: "djf", label: "DJF (Des\u2013Feb)" },
  { id: "mam", label: "MAM (Mar\u2013Mei)" },
  { id: "jja", label: "JJA (Jun\u2013Agu)" },
  { id: "son", label: "SON (Sep\u2013Nov)" },
];
let wavesSeason = "djf";
let wavesGeoLayer = null;
let sstGeoLayer = null;
let sstViewMode = "season";
let sstPeriodId = "djf";
const DEEP_DEPTH_LEVELS = [0, 20, 50, 100, 200, 500, 1000];
let deepGeoLayer = null;
let deepGeoJsonCache = null;
let deepGeoJsonIndex = null;
let deepGeoJsonLoading = null;
let deepShardCache = {};
let deepFallbackOverlay = null;
let deepMapStatusEl = null;
let deepYear = "2023";
let deepDepthM = 20;
const VECTOR_SAMPLE_MAX = 100;
const CONTOUR_SAMPLE_MAX = 150;

const PAGE_META = {
  sst_map: {
    label: "SEA SURFACE TEMPERATURE",
    title: "Suhu Permukaan Laut (SST)",
  },
  deep_sea_temp: {
    label: "DEEP SEA TEMPERATURE",
    title: "Profil Suhu Kolom Air",
  },
  thermal_gradient: { label: "DELTA T", title: "Gradien Termal (Delta T)" },
  bathymetry: { label: "BATHYMETRY", title: "Batimetri" },
  salinity: { label: "SALINITY", title: "Salinitas" },
  currents: { label: "OCEAN CURRENTS", title: "Arus (Current)" },
  waves: { label: "WAVE CONDITIONS", title: "Kondisi Gelombang" },
  otec_eval: { label: "OTEC EVALUATION", title: "Evaluasi & Zonasi OTEC" },
  subsea_infrastructure: {
    label: "SUBSEA CABLE",
    title: "Infrastruktur Bawah Laut",
  },
};

const CATEGORY_FOR_PAGE = {
  sst_map: "thermal",
  deep_sea_temp: "thermal",
  thermal_gradient: "thermal",
  bathymetry: "physical",
  salinity: "physical",
  currents: "physical",
  waves: "physical",
  otec_eval: "feasibility",
  subsea_infrastructure: "feasibility",
};

function findNearest(arr, val) {
  let minDiff = Infinity,
    idx = 0;
  for (let i = 0; i < arr.length; i++) {
    const diff = Math.abs(arr[i] - val);
    if (diff < minDiff) {
      minDiff = diff;
      idx = i;
    }
  }
  return idx;
}

function computeStats(grid2d) {
  const flat = [];
  for (const row of grid2d)
    for (const v of row) if (v != null && !isNaN(v)) flat.push(v);
  if (!flat.length) return { min: 0, max: 0, mean: 0 };
  return {
    min: Math.min(...flat),
    max: Math.max(...flat),
    mean: flat.reduce((a, b) => a + b, 0) / flat.length,
  };
}

function fmt(v, d, suffix) {
  if (v == null || isNaN(v)) return "N/A";
  return v.toFixed(d) + (suffix || "");
}

function parseDeltaFromFeature(feature) {
  const mid = feature.properties?.dt_mid;
  if (mid != null && !isNaN(Number(mid))) return Number(mid);
  const range =
    feature.properties?.temp_range || feature.properties?.title || "";
  const nums = String(range).match(/[\d.]+/g);
  if (!nums || !nums.length) return null;
  return nums.length > 1
    ? (parseFloat(nums[0]) + parseFloat(nums[1])) / 2
    : parseFloat(nums[0]);
}

function sampleFeatures(features, maxCount) {
  if (features.length <= maxCount) return features;
  const step = Math.ceil(features.length / maxCount);
  return features.filter((_, i) => i % step === 0);
}

function renderMetrics(metrics) {
  const el = document.getElementById("info-metrics");
  if (!el) return;
  if (!metrics?.length) {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }
  el.style.display = "grid";
  el.innerHTML = metrics
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

function initMap(key, mapId, overlayImg, showContour, contourColor) {
  if (initialized[key]) {
    setTimeout(() => {
      if (maps[key]) maps[key].invalidateSize();
    }, 50);
    return maps[key];
  }
  initialized[key] = true;
  const el = document.getElementById(mapId);
  if (!el) return null;
  const m = L.map(el, { center, zoom: 7, zoomControl: false });
  L.control.zoom({ position: "topright" }).addTo(m);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OSM &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(m);
  if (overlayImg)
    L.imageOverlay(overlayImg, overlayBounds, { opacity: 0.75 }).addTo(m);
  if (showContour && typeof CONTOUR_1000M !== "undefined" && CONTOUR_1000M) {
    CONTOUR_1000M.forEach((line) =>
      L.polyline(line, {
        color: contourColor || "#C95454",
        weight: 2.5,
        opacity: 0.8,
      }).addTo(m),
    );
  }
  maps[key] = m;
  return m;
}

function plotTheme() {
  return {
    isDark: true,
    gridC: "rgba(71, 85, 105, 0.25)",
    fontC: "#94a3b8",
    hoverBg: "#1e293b",
    hoverText: "#e2e8f0",
  };
}

function getDepthAt(lat, lon) {
  if (typeof BATHY_GRID === "undefined" || !BATHY_GRID?.lat || !BATHY_GRID.lat.length) return null;
  const raw =
    BATHY_GRID.depth[findNearest(BATHY_GRID.lat, lat)]?.[
      findNearest(BATHY_GRID.lon, lon)
    ];
  return raw != null ? Math.abs(raw) : null;
}

function gridValueAt(grid, lat, lon) {
  if (typeof GRID_DATA === "undefined" || !GRID_DATA?.lat || !GRID_DATA.lat.length || !grid) return null;
  const latIdx = findNearest(GRID_DATA.lat, lat);
  const lonIdx = findNearest(GRID_DATA.lon, lon);
  return grid[latIdx]?.[lonIdx] ?? null;
}

/* ── Panel templates: right = controls, left = info/charts ── */
const INFO_TEMPLATES = {
  sst_map: () => `<div class="info-metrics" id="info-metrics"></div>`,
  deep_sea_temp: () => `<div class="info-metrics" id="info-metrics"></div>`,
  thermal_gradient: () => `
    <div class="info-metrics" id="info-metrics"></div>
    <div class="info-chart-block hidden" id="info-chart-delta">
      <h5>Fluktuasi ${DELTA_T} Bulanan (2015${EN_DASH}2025)</h5>
      <div id="chart-point-extract"></div>
    </div>
    <p style="font-size:.72rem;color:#64748b;margin:0">Klik peta untuk mengekstrak deret waktu di titik terpilih.</p>`,
  waves: () => `
    <div id="waves-click-prompt" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;padding:2.5rem 1rem;text-align:center;color:var(--text-muted);">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
      <p style="font-size:.82rem;font-weight:600;margin:0;line-height:1.4">KLIK PADA PETA<br>untuk informasi titik</p>
    </div>
    <div class="info-chart-block hidden" id="info-chart-waves" style="gap:.5rem;padding:.5rem 0">
      <div id="wave-point-info" class="analysis-box" style="margin:.25rem .5rem"></div>
      <div class="info-chart-block" id="info-chart-wave-rose" style="padding:.25rem 0 0">
        <h5 style="margin:.25rem .75rem .1rem;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;opacity:.7">Wave Rose <span style="font-weight:400;font-size:.72rem">(Hs & arah per musim, titik dipilih)</span></h5>
        <div id="chart-wave-rose" style="height:290px"></div>
      </div>
      <div class="info-chart-block" id="info-chart-wave-spectrum" style="padding:.25rem 0 0">
        <h5 style="margin:.25rem .75rem .1rem;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;opacity:.7">Spektrum Energi <span style="font-weight:400;font-size:.72rem">(S(f), m²/Hz)</span></h5>
        <div id="chart-wave-spectrum" style="height:230px"></div>
      </div>
    </div>`,
  currents: () => `
    <div id="currents-click-prompt" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;padding:2rem 1rem;text-align:center;color:var(--text-muted);">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
      <p style="font-size:.82rem;font-weight:600;margin:0;line-height:1.4">KLIK PADA PETA UNTUK MENGETAHUI INFORMASI LEBIH LANJUT</p>
    </div>
    <div class="info-chart-block hidden" id="info-chart-currents">
      <div id="current-point-info" class="analysis-box"></div>
      <div class="info-chart-block" id="info-chart-current-rose">
        <h5>Current Rose</h5>
        <div id="chart-current-rose" style="height:220px"></div>
      </div>
      <div class="info-chart-block" id="info-chart-current-profile">
        <h5>Vertical Velocity Profile</h5>
        <div id="chart-current-profile" style="height:220px"></div>
      </div>
    </div>`,
  bathymetry: () => `
    <div class="info-metrics" id="info-metrics"></div>
    <div class="info-chart-block" id="info-chart-bathy">
      <h5>Titik dan Sumber</h5>
      <div id="bathy-point-meta" class="analysis-box">Klik peta untuk menampilkan kedalaman, slope, dan jarak pantai.</div>
    </div>`,
  otec_eval: () => `
    <div id="otec-domain-stats"></div>
    <div id="otec-point-report" style="display:none">
      <button id="otec-back-btn" style="display:flex;align-items:center;gap:.35rem;font-family:'JetBrains Mono',monospace;font-size:.6rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--accent);background:none;border:none;cursor:pointer;padding:.1rem 0 .6rem;opacity:.85">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        kembali ke ringkasan
      </button>
      <div id="otec-point-report-inner"></div>
    </div>`,
  subsea_infrastructure: () => `
    <div class="info-chart-block" id="info-chart-infra">
      <h5>Profil Penampang Batimetri</h5>
      <div id="chart-cross-section"></div>
    </div>
    <div class="infra-stats" id="infra-stats">Belum ada rute kabel.</div>`,
};

const CONTROL_TEMPLATES = {
  sst_map: () => `
    <div class="control-group">
      <label for="ctrl-sst-mode">Tampilan</label>
      <select id="ctrl-sst-mode">
        <option value="season">Rata-rata musiman</option>
        <option value="year">Rata-rata tahunan</option>
      </select>
    </div>
    <div class="control-group" id="ctrl-sst-season-wrap">
      <label for="ctrl-season">Musim</label>
      <select id="ctrl-season">${SEASONS.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select>
    </div>
    <div class="control-group hidden" id="ctrl-sst-year-wrap">
      <label for="ctrl-year">Tahun</label>
      <select id="ctrl-year">${YEARS.map((y) => `<option value="${y}">${y}</option>`).join("")}</select>
    </div>
    <div class="legend-inline" id="legend-sst"></div>`,
  deep_sea_temp: () => `
    <div class="control-group">
      <label for="ctrl-year-deep">Tahun</label>
      <select id="ctrl-year-deep">${YEARS.map((y) => `<option value="${y}">${y}</option>`).join("")}</select>
    </div>
    <div class="control-group">
      <label for="ctrl-deep-depth">Kedalaman: <span id="deep-depth-label">${deepDepthM} m</span></label>
      <input type="range" id="ctrl-deep-depth" min="0" max="${DEEP_DEPTH_LEVELS.length - 1}" step="1" value="${DEEP_DEPTH_LEVELS.indexOf(deepDepthM) >= 0 ? DEEP_DEPTH_LEVELS.indexOf(deepDepthM) : 1}">
      <div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--text-muted);margin-top:4px">
        ${DEEP_DEPTH_LEVELS.map((d) => `<span>${d}m</span>`).join("")}
      </div>
    </div>
    <div class="legend-inline" id="legend-deep"></div>`,
  thermal_gradient: () => `
    <div class="control-group">
      <label for="ctrl-year-delta">Tahun</label>
      <select id="ctrl-year-delta">${YEARS.map((y) => `<option value="${y}">${y}</option>`).join("")}</select>
    </div>
    <div class="control-group">
      <label for="ctrl-delta-depth">Kedalaman CWP: <span id="delta-depth-label">${deltaDepthM} m</span></label>
      <input type="range" id="ctrl-delta-depth" min="0" max="${DELTA_DEPTH_LEVELS.length - 1}" step="1" value="${DELTA_DEPTH_LEVELS.indexOf(deltaDepthM) >= 0 ? DELTA_DEPTH_LEVELS.indexOf(deltaDepthM) : 3}">
      <div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--text-muted);margin-top:4px">
        ${DELTA_DEPTH_LEVELS.map((d) => `<span>${d}m</span>`).join("")}
      </div>
    </div>
    <div class="control-toggle-row">
      <span>Tampilkan hanya &Delta;T &ge; ${OTEC_THRESHOLD}${UNIT_C}</span>
      <label class="toggle-switch">
        <input type="checkbox" id="ctrl-delta-threshold">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="legend-inline" id="legend-delta"></div>
    <div class="legend-line-item" id="legend-delta-threshold">
      <span class="legend-line-swatch legend-line-dashed"></span>
      <span>Isoline ${OTEC_THRESHOLD}${UNIT_C} (ambang OTEC)</span>
    </div>`,
  bathymetry: () => `
    <div class="control-group">
      <label>Rentang kedalaman (m)</label>
      <div class="dual-range-track" id="bathy-range-track">
        <input type="range" id="bathy-range-min" class="dual-range-thumb dual-range-min">
        <input type="range" id="bathy-range-max" class="dual-range-thumb dual-range-max">
      </div>
    </div>
    <div class="legend-inline" id="legend-bathy"></div>`,
  salinity: () => `
    <div class="control-group">
      <label for="salinity-depth">Kedalaman (m)</label>
      <input type="range" id="salinity-depth" min="0" max="3" step="1" value="0">
      <div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--text-muted);margin-top:4px">
        ${DEPTH_LEVELS.map((d) => `<span>${d}m</span>`).join("")}
      </div>
    </div>
    <div class="legend-inline" id="legend-salinity"></div>`,
  currents: () => `
    <div class="control-group">
      <label for="currents-season">Musim</label>
      <select id="currents-season">
        <option value="djf">DJF (Des&ndash;Feb)</option>
        <option value="mam">MAM (Mar&ndash;Mei)</option>
        <option value="jja">JJA (Jun&ndash;Agu)</option>
        <option value="son">SON (Sep&ndash;Nov)</option>
      </select>
    </div>
    <div class="control-group">
      <label for="currents-depth">Kedalaman (m)</label>
      <input type="range" id="currents-depth" min="0" max="3" step="1" value="0">
      <div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--text-muted);margin-top:4px">
        ${DEPTH_LEVELS.map((d) => `<span>${d}m</span>`).join("")}
      </div>
    </div>
    <div class="control-group">
      <label style="font-family:'JetBrains Mono',monospace;font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">Referensi Kecepatan</label>
      <div style="display:flex;align-items:flex-end;gap:10px;margin:.4rem 0 .3rem;padding:.5rem .7rem;background:rgba(255,255,255,.06);border-radius:6px;border:1px solid rgba(255,255,255,.1)">
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <svg viewBox="0 0 20 16" width="14" height="16" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="10" y1="14" x2="10" y2="4"/>
            <polyline points="5 9 10 4 15 9"/>
          </svg>
          <span style="font-size:.58rem;font-family:'JetBrains Mono',monospace;color:var(--text-muted)">0.25</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <svg viewBox="0 0 20 26" width="14" height="26" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="10" y1="24" x2="10" y2="4"/>
            <polyline points="5 11 10 4 15 11"/>
          </svg>
          <span style="font-size:.58rem;font-family:'JetBrains Mono',monospace;color:var(--text-muted)">0.75</span>
        </div>
        <span style="font-size:.62rem;font-family:'JetBrains Mono',monospace;color:var(--text-muted);line-height:1;padding-bottom:2px">m/s</span>
      </div>
      <p style="font-size:.65rem;color:var(--text-muted);margin:0 0 .5rem;line-height:1.4">Arah &amp; panjang panah = arah &amp; kecepatan aliran.</p>
    </div>
    <div class="control-group">
      <label style="font-family:'JetBrains Mono',monospace;font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">Kecepatan Arus (m/s)</label>
      <div style="position:relative;height:14px;border-radius:4px;background:linear-gradient(to right,#440154,#31688e,#35b779,#fde725);margin:.3rem 0 .2rem;border:1px solid rgba(255,255,255,.08)"></div>
      <div style="display:flex;justify-content:space-between;font-size:.62rem;color:var(--text-muted);font-family:'JetBrains Mono',monospace">
        <span>0.0</span><span>0.25</span><span>0.5</span><span>0.75</span><span>1.0+</span>
      </div>
    </div>`,
  waves: () => `
    <div class="control-group">
      <label for="ctrl-wave-season">Musim</label>
      <select id="ctrl-wave-season">${WAVE_SEASONS.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select>
    </div>
    <div id="waves-legend-dynamic"></div>`,
  otec_eval: () => `
    <div class="ctrl-section-head">KRITERIA MCDA</div>
    <label class="mcda-check"><input type="checkbox" id="mcda-depth" checked>
      <div><b style="color:#e8edf2">Kedalaman &gt; 1000 m</b><br><small style="color:#a8bccf">Pipa pendingin OTEC</small></div>
    </label>
    <label class="mcda-check" style="margin-top:.3rem"><input type="checkbox" id="mcda-deltat" checked>
      <div><b style="color:#e8edf2">&Delta;T &gt; <span id="mcda-dt-val" style="color:var(--accent)">${OTEC_THRESHOLD}</span>${UNIT_C}</b><br><small style="color:#a8bccf">Gradien termal minimum</small></div>
    </label>
    <label class="mcda-check" style="margin-top:.3rem"><input type="checkbox" id="mcda-current" checked>
      <div><b style="color:#e8edf2">Arus &lt; 1 m/s</b><br><small style="color:#a8bccf">Stabilitas platform</small></div>
    </label>
    <div class="control-group" style="margin-top:.65rem;margin-bottom:.5rem">
      <label style="color:#c8d8e8">Ambang Min &Delta;T</label>
      <input type="range" id="mcda-dt-slider" min="18" max="25" step="0.5" value="${OTEC_THRESHOLD}">
      <div style="display:flex;justify-content:space-between;font-size:.58rem;font-family:'JetBrains Mono',monospace;color:#8aa8bc;margin-top:.2rem"><span>18${UNIT_C}</span><span>25${UNIT_C}</span></div>
    </div>
    <div class="ctrl-divider"></div>
    <div class="ctrl-section-head">PARAMETER DAYA</div>
    <div class="control-group">
      <label for="ctrl-efficiency" style="color:#c8d8e8">Efisiensi Neto &eta; &nbsp;<span id="ctrl-eff-display" style="color:var(--accent)">3%</span></label>
      <input type="number" id="ctrl-efficiency" min="0.5" max="89" value="3" step="0.5">
      <small style="font-size:.62rem;color:#8aa8bc">Rentang OTEC realistis: 2–5 %</small>
    </div>
    <div class="control-group">
      <label for="ctrl-flow" style="color:#c8d8e8">Aliran Air Q &nbsp;<span id="ctrl-flow-display" style="color:var(--accent)">100</span> m&sup3;/s</label>
      <input type="number" id="ctrl-flow" min="1" max="500" value="100" step="5">
    </div>
    <div class="ctrl-divider"></div>
    <div class="ctrl-section-head">LEGENDA DAYA NETO</div>
    <canvas id="ctrl-colorbar" width="180" height="10" style="width:100%;border-radius:3px;margin-top:.25rem"></canvas>
    <div style="display:flex;justify-content:space-between;font-size:.58rem;font-family:'JetBrains Mono',monospace;color:#b8ccdc;margin-top:.2rem">
      <span>0</span><span>5</span><span>10</span><span>15</span><span>&ge;20 MW</span>
    </div>
    <p style="font-size:.6rem;color:#8aa8bc;margin:.55rem 0 0;font-family:'JetBrains Mono',monospace;line-height:1.55">
      P<sub>gross</sub>&thinsp;=&thinsp;(Q/100)&thinsp;&times;&thinsp;10&thinsp;&times;&thinsp;(&Delta;T/22)&sup2; MW<br>
      P<sub>net</sub>&thinsp;=&thinsp;&eta;&thinsp;&times;&thinsp;P<sub>gross</sub>
    </p>`,
  subsea_infrastructure: () => `
    <div class="infra-toolbar">
      <button type="button" id="infra-draw">Gambar Rute</button>
      <button type="button" id="infra-finish">Selesai</button>
      <button type="button" id="infra-clear">Hapus</button>
    </div>
    <p style="font-size:.72rem;color:#8aa8bc;margin:0 0 12px 0">Klik titik A &rarr; B &rarr; C pada peta.</p>
    <div class="control-group">
      <label for="infra-max-depth-toggle" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" id="infra-max-depth-toggle" checked>
        Batas Kedalaman (m)
      </label>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <input type="range" id="infra-max-depth" min="100" max="4000" step="100" value="1000" style="flex:1">
        <span id="infra-max-depth-val" style="font-size:12px;font-weight:600;min-width:44px;text-align:right;">1000 m</span>
      </div>
    </div>`,
};

function renderInfoPanel(page) {
  const body = document.getElementById("info-panel-body");
  if (!body) return;
  const tpl = INFO_TEMPLATES[page];
  body.innerHTML = tpl
    ? tpl()
    : '<p style="font-size:.8rem;color:#a8bccf">Pilih layer untuk melihat statistik dan grafik.</p>';
  // domain stats for otec_eval are populated after controls render via refreshDomainStats()
}

function renderControls(page) {
  const body = document.getElementById("controls-panel-body");
  if (!body) return;
  const tpl = CONTROL_TEMPLATES[page];
  body.innerHTML = tpl
    ? tpl()
    : '<p style="font-size:.8rem;color:#64748b">Tidak ada kontrol untuk halaman ini.</p>';
  bindControlHandlers(page);
}

function updatePageTitle(page) {
  const meta = PAGE_META[page];
  if (!meta) return;
  const lbl = document.getElementById("page-label");
  const ttl = document.getElementById("page-title");
  if (lbl) lbl.textContent = meta.label;
  if (ttl) ttl.textContent = meta.title;
}

function fmtLegendTemp(v) {
  return v != null && !isNaN(v) ? `${Number(v).toFixed(2)}${UNIT_C}` : "N/A";
}

function renderGradientLegend(
  elId,
  title,
  minLabel,
  maxLabel,
  gradientCss,
  midLabel,
) {
  const el = document.getElementById(elId);
  if (!el) return;
  const hasMid = midLabel != null && midLabel !== "";
  el.innerHTML = `
    ${title ? `<div class="legend-title">${title}</div>` : ""}
    <div class="legend-gradient" style="background:${gradientCss}"></div>
    <div class="legend-labels${hasMid ? " legend-labels-3" : ""}">
      <span>${minLabel}</span>
      ${hasMid ? `<span>${midLabel}</span>` : ""}
      <span>${maxLabel}</span>
    </div>`;
}

const SST_LEGEND_GRADIENT =
  "linear-gradient(to right,#30123b,#4662d7,#35b779,#fde725)";
const DEEP_LEGEND_GRADIENT =
  "linear-gradient(to right,#08306b,#2171b5,#6baed6,#deebf7,#f7fbff)";
const DELTA_LEGEND_GRADIENT =
  "linear-gradient(to right,#3288bd,#66c2a5,#abdda4,#fee08b,#fdae61,#f46d43,#d53e4f,#9e0142)";

function deltaPeriodKey() {
  return `${deltaYear}_${deltaDepthM}`;
}

function updateDeltaLegend() {
  const meta = typeof DELTAT_META !== "undefined" ? DELTAT_META : null;
  const ps = meta?.periods?.[deltaPeriodKey()];
  if (ps) {
    renderGradientLegend(
      "legend-delta",
      DELTA_T,
      fmtLegendTemp(ps.min),
      fmtLegendTemp(ps.max),
      DELTA_LEGEND_GRADIENT,
      fmtLegendTemp(ps.mean),
    );
    return;
  }
  const d = computeStats(GRID_DATA.delta_t);
  renderGradientLegend(
    "legend-delta",
    DELTA_T,
    fmtLegendTemp(d.min),
    fmtLegendTemp(d.max),
    DELTA_LEGEND_GRADIENT,
    fmtLegendTemp(d.mean),
  );
}

function updateDeltaMetrics() {
  const meta = typeof DELTAT_META !== "undefined" ? DELTAT_META : null;
  const ps = meta?.periods?.[deltaPeriodKey()];
  if (ps) {
    renderMetrics([
      { label: "MIN " + DELTA_T, value: ps.min.toFixed(2), unit: UNIT_C },
      { label: "MEAN " + DELTA_T, value: ps.mean.toFixed(2), unit: UNIT_C },
      { label: "MAX " + DELTA_T, value: ps.max.toFixed(2), unit: UNIT_C },
      { label: "CWP", value: "~" + ps.actual_deep_m.toFixed(1), unit: "m" },
      { label: "TAHUN", value: deltaYear, unit: "" },
    ]);
    return;
  }
  const d = computeStats(GRID_DATA.delta_t);
  renderMetrics([
    { label: "MIN " + DELTA_T, value: d.min.toFixed(2), unit: UNIT_C },
    { label: "MEAN " + DELTA_T, value: d.mean.toFixed(2), unit: UNIT_C },
    { label: "MAX " + DELTA_T, value: d.max.toFixed(2), unit: UNIT_C },
  ]);
}

function updateSstLegend() {
  const meta =
    typeof SST_THERMAL_META !== "undefined" ? SST_THERMAL_META : null;
  const ps = meta?.periods?.[sstPeriodId];
  let vmin, vmax, vmean;
  if (ps) {
    vmin = ps.min;
    vmax = ps.max;
    vmean = ps.mean;
  } else if (meta) {
    vmin = meta.vmin;
    vmax = meta.vmax;
    vmean = (vmin + vmax) / 2;
  } else {
    const s = computeStats(GRID_DATA.sst);
    vmin = s.min;
    vmax = s.max;
    vmean = s.mean;
  }
  renderGradientLegend(
    "legend-sst",
    "SST",
    fmtLegendTemp(vmin),
    fmtLegendTemp(vmax),
    SST_LEGEND_GRADIENT,
    fmtLegendTemp(vmean),
  );
}

function updateDeepLegend() {
  const meta = typeof DEEP_TEMP_META !== "undefined" ? DEEP_TEMP_META : null;
  const ps = meta?.periods?.[deepPeriodKey()];
  if (ps) {
    renderGradientLegend(
      "legend-deep",
      "Suhu laut",
      fmtLegendTemp(ps.min),
      fmtLegendTemp(ps.max),
      DEEP_LEGEND_GRADIENT,
      fmtLegendTemp(ps.mean),
    );
    return;
  }
  const d = computeStats(GRID_DATA.deep_temp);
  renderGradientLegend(
    "legend-deep",
    "Suhu laut",
    fmtLegendTemp(d.min),
    fmtLegendTemp(d.max),
    DEEP_LEGEND_GRADIENT,
    fmtLegendTemp(d.mean),
  );
}

function isPolygonFeature(f) {
  const t = f.geometry?.type;
  return t === "Polygon" || t === "MultiPolygon";
}

function renderStepLegend(elId, title, items) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `
    ${title ? `<div class="legend-title">${title}</div>` : ""}
    <div class="legend-steps">${items
      .map(
        (it) => `
      <div class="legend-step"><span class="legend-swatch" style="background:${it.color}"></span><span>${it.label}</span></div>
    `,
      )
      .join("")}</div>`;
}

function bindControlHandlers(page) {
  if (page === "bathymetry") {
    if (maps.bathymetry && typeof BathyMap !== "undefined") {
      BathyMap.init(maps.bathymetry).then(() => BathyMap.bindUi());
    }
  }
  if (page === "sst_map") {
    const modeSel = document.getElementById("ctrl-sst-mode");
    const seasonSel = document.getElementById("ctrl-season");
    const yearSel = document.getElementById("ctrl-year");
    const seasonWrap = document.getElementById("ctrl-sst-season-wrap");
    const yearWrap = document.getElementById("ctrl-sst-year-wrap");

    const syncSstControlVisibility = () => {
      const isSeason = sstViewMode === "season";
      seasonWrap?.classList.toggle("hidden", !isSeason);
      yearWrap?.classList.toggle("hidden", isSeason);
    };

    if (modeSel) {
      modeSel.value = sstViewMode;
      modeSel.onchange = () => {
        sstViewMode = modeSel.value;
        syncSstControlVisibility();
        if (sstViewMode === "season" && seasonSel) {
          sstPeriodId = seasonSel.value;
        } else if (yearSel) {
          sstPeriodId = yearSel.value;
        }
        refreshSstMap();
        updateSstMetrics();
        updateSstLegend();
      };
    }
    if (seasonSel) {
      seasonSel.value =
        sstViewMode === "season"
          ? sstPeriodId
          : sstPeriodId.match(/^\d{4}$/)
            ? "djf"
            : sstPeriodId;
      seasonSel.onchange = () => {
        if (sstViewMode !== "season") return;
        sstPeriodId = seasonSel.value;
        refreshSstMap();
        updateSstMetrics();
        updateSstLegend();
      };
    }
    if (yearSel) {
      if (sstViewMode === "year") yearSel.value = sstPeriodId;
      yearSel.onchange = () => {
        if (sstViewMode !== "year") return;
        sstPeriodId = yearSel.value;
        refreshSstMap();
        updateSstMetrics();
        updateSstLegend();
      };
    }
    syncSstControlVisibility();
    updateSstLegend();
    refreshSstMap();
    updateSstMetrics();
  }
  if (page === "deep_sea_temp") {
    const yearSel = document.getElementById("ctrl-year-deep");
    const depthSlider = document.getElementById("ctrl-deep-depth");
    const depthLabel = document.getElementById("deep-depth-label");
    if (yearSel) {
      yearSel.value = deepYear;
      yearSel.onchange = () => {
        deepYear = yearSel.value;
        refreshDeepMap();
        updateDeepMetrics();
        updateDeepLegend();
      };
    }
    if (depthSlider) {
      const idx = Math.max(0, DEEP_DEPTH_LEVELS.indexOf(deepDepthM));
      depthSlider.value = String(idx >= 0 ? idx : 1);
      depthSlider.oninput = () => {
        deepDepthM = DEEP_DEPTH_LEVELS[parseInt(depthSlider.value, 10)] ?? 20;
        if (depthLabel) depthLabel.textContent = deepDepthM + " m";
        refreshDeepMap();
        updateDeepMetrics();
        updateDeepLegend();
      };
      if (depthLabel) depthLabel.textContent = deepDepthM + " m";
    }
    updateDeepLegend();
    refreshDeepMap();
    updateDeepMetrics();
  }
  if (page === "waves") {
    const sel = document.getElementById("ctrl-wave-season");
    if (sel) {
      sel.value = wavesSeason;
      sel.onchange = () => {
        wavesSeason = sel.value;
        refreshWavesMap();
        // If user already clicked a point, re-render info/rose/spectrum for new season
        if (window._waveClickLat != null && window._waveClickLon != null) {
          displayWavePointInfo(window._waveClickLat, window._waveClickLon);
        } else {
          // No prior click — reset to prompt
          const prompt = document.getElementById("waves-click-prompt");
          const panel = document.getElementById("info-chart-waves");
          if (prompt) prompt.style.display = "";
          if (panel) panel.classList.add("hidden");
        }
      };
    }
    refreshWavesMap();
    setTimeout(setupWavesClick, 300);
  }
  if (page === "salinity") {
    const slider = document.getElementById("salinity-depth");
    if (slider) {
      slider.oninput = () => refreshSalinityMap();
    }
    renderGradientLegend(
      "legend-salinity",
      "Salinitas (PSU)",
      "33.0",
      "35.0",
      "linear-gradient(to right,#f7fcf0,#e0f3db,#ccebc5,#a8ddb5,#7bccc4,#4eb3d3,#2b8cbe,#084081)",
    );
    refreshSalinityMap();
  }
  if (page === "currents") {
    const seasonSel = document.getElementById("currents-season");
    const depthSlider = document.getElementById("currents-depth");
    if (seasonSel) {
      seasonSel.value = currentsSeason;
      seasonSel.onchange = () => {
        currentsSeason = seasonSel.value;
        // When a season is selected, reset depth to surface (0)
        if (depthSlider) depthSlider.value = "0";
        refreshCurrentsMap();
        updateCurrentsSeasonTitle();
      };
    }
    if (depthSlider) {
      depthSlider.oninput = () => {
        // When depth changes, reset info panel to click-prompt state
        const prompt = document.getElementById("currents-click-prompt");
        const panel = document.getElementById("info-chart-currents");
        if (prompt) prompt.style.display = "";
        if (panel) panel.classList.add("hidden");
        if (window._curMarker) {
          maps.currents.removeLayer(window._curMarker);
          window._curMarker = null;
        }
        // When depth > 0, switch to depth overlay (season selector becomes secondary)
        refreshCurrentsMap();
      };
    }
    refreshCurrentsMap();
    updateCurrentsSeasonTitle();
  }
  if (page === "thermal_gradient") {
    const yearSel = document.getElementById("ctrl-year-delta");
    const depthSlider = document.getElementById("ctrl-delta-depth");
    const depthLabel = document.getElementById("delta-depth-label");
    const cb = document.getElementById("ctrl-delta-threshold");
    if (yearSel) {
      yearSel.value = deltaYear;
      yearSel.onchange = () => {
        deltaYear = yearSel.value;
        refreshDeltaMap();
        updateDeltaMetrics();
        updateDeltaLegend();
      };
    }
    if (depthSlider) {
      const idx = Math.max(0, DELTA_DEPTH_LEVELS.indexOf(deltaDepthM));
      depthSlider.value = String(idx >= 0 ? idx : 3);
      depthSlider.oninput = () => {
        deltaDepthM =
          DELTA_DEPTH_LEVELS[parseInt(depthSlider.value, 10)] ?? 800;
        if (depthLabel) depthLabel.textContent = deltaDepthM + " m";
        refreshDeltaMap();
        updateDeltaMetrics();
        updateDeltaLegend();
      };
      if (depthLabel) depthLabel.textContent = deltaDepthM + " m";
    }
    if (cb) {
      cb.checked = deltaThresholdOn;
      cb.onchange = () => {
        deltaThresholdOn = cb.checked;
        applyDeltaThresholdStyle();
      };
    }
    updateDeltaLegend();
    refreshDeltaMap();
    updateDeltaMetrics();
  }
  if (page === "otec_eval") {
    // MCDA checkboxes
    ["mcda-depth", "mcda-deltat", "mcda-current"].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.onchange = () => {
          updateOtecEvalOverlay();
          refreshDomainStats();
        };
    });
    // ΔT slider
    const dtSlider = document.getElementById("mcda-dt-slider");
    const dtLbl = document.getElementById("mcda-dt-val");
    if (dtSlider) {
      if (dtLbl) dtLbl.textContent = dtSlider.value;
      dtSlider.oninput = () => {
        if (dtLbl) dtLbl.textContent = dtSlider.value;
        updateOtecEvalOverlay();
        refreshDomainStats();
      };
    }
    // Daya controls
    ["ctrl-efficiency", "ctrl-flow"].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.oninput = () => {
          updateOtecEvalOverlay();
          refreshDomainStats();
        };
    });
    renderColorbar("ctrl-colorbar");
    updateOtecEvalOverlay();
    refreshDomainStats();
    // Back button
    document.getElementById("otec-back-btn")?.addEventListener("click", () => {
      document.getElementById("otec-point-report").style.display = "none";
      document.getElementById("otec-domain-stats").style.display = "";
    });
  }
  if (page === "subsea_infrastructure") {
    document
      .getElementById("infra-draw")
      ?.addEventListener("click", startInfraDraw);
    document
      .getElementById("infra-finish")
      ?.addEventListener("click", finishInfraDraw);
    document
      .getElementById("infra-clear")
      ?.addEventListener("click", clearInfraRoute);
      
    const maxDepthSlider = document.getElementById("infra-max-depth");
    const maxDepthVal = document.getElementById("infra-max-depth-val");
    const maxDepthToggle = document.getElementById("infra-max-depth-toggle");
    
    if (maxDepthSlider && maxDepthVal) {
      maxDepthSlider.addEventListener("input", (e) => {
        maxDepthVal.innerText = e.target.value + " m";
        if (maxDepthToggle?.checked) computeInfraRoute();
      });
    }
    if (maxDepthToggle) {
      maxDepthToggle.addEventListener("change", () => {
        computeInfraRoute();
      });
    }
  }
}

/* ── Delta-T threshold & click chart ── */
function defaultDeltaFillStyle(feature) {
  return {
    fillColor: feature.properties.fill || "#f46d43",
    fillOpacity: 0.82,
    weight: 0,
    stroke: false,
  };
}

function applyDeltaThresholdStyle() {
  if (!deltaGeoLayer) return;
  deltaGeoLayer.eachLayer((layer) => {
    const dt = parseDeltaFromFeature(layer.feature);
    if (deltaThresholdOn && (dt == null || dt < OTEC_THRESHOLD)) {
      layer.setStyle({ fillOpacity: 0, weight: 0, stroke: false });
    } else {
      layer.setStyle(defaultDeltaFillStyle(layer.feature));
    }
  });
}

function showMonthlyDeltaChart(lat, lon, dt) {
  const panel = document.getElementById("info-chart-delta");
  if (panel) panel.classList.remove("hidden");
  const times = TIMESERIES.map((d) => d.time);
  const base = TIMESERIES.map((d) => d.Delta_T);
  const latFactor = 1 + (lat - center[0]) * 0.02;
  const lonFactor = 1 + (lon - center[1]) * 0.015;
  const y = base.map((v) => (v != null ? v * latFactor * lonFactor : null));
  const { gridC, fontC, hoverBg, hoverText } = plotTheme();
  Plotly.newPlot(
    "chart-point-extract",
    [
      {
        x: times,
        y,
        name: DELTA_T,
        mode: "lines+markers",
        line: { color: "#6BB8D4", width: 2 },
        hovertemplate: "%{y:.2f}" + UNIT_C + "<extra>" + DELTA_T + "</extra>",
      },
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      height: 180,
      margin: { l: 44, r: 12, t: 24, b: 36 },
      font: { family: "Inter", color: fontC, size: 11 },
      xaxis: { gridcolor: gridC, tickfont: { size: 9 } },
      yaxis: { title: UNIT_C, gridcolor: gridC, tickfont: { size: 9 } },
      hoverlabel: { bgcolor: hoverBg, font: { color: hoverText, size: 11 } },
      shapes: [
        {
          type: "line",
          x0: times[0],
          x1: times[times.length - 1],
          y0: 20,
          y1: 20,
          line: { color: "#C95454", width: 1, dash: "dash" },
        },
      ],
    },
    { responsive: true, displayModeBar: false },
  );
}

let deltaClickSetup = false;
function setupDeltaClick() {
  if (deltaClickSetup || !maps.delta) return;
  deltaClickSetup = true;
  maps.delta.on("click", (e) => {
    const lat = e.latlng.lat,
      lon = e.latlng.lng;
    const dt = gridValueAt(GRID_DATA.delta_t, lat, lon);
    const depth = getDepthAt(lat, lon);
    const sst = gridValueAt(GRID_DATA.sst, lat, lon);
    const cur = gridValueAt(GRID_DATA.current, lat, lon);
    let power = null;
    if (dt != null) power = 10 * Math.pow(dt / 22, 2);
    showMonthlyDeltaChart(lat, lon, dt);
    if (window._clickMarker) maps.delta.removeLayer(window._clickMarker);
    window._clickMarker = L.circleMarker([lat, lon], {
      radius: 6,
      fillColor: "#4A9EBF",
      color: "#D8DEE4",
      weight: 2,
      fillOpacity: 0.9,
    }).addTo(maps.delta).bindPopup(`
      <b>Koordinat:</b> ${lat.toFixed(4)}, ${lon.toFixed(4)}<br>
      <b>${DELTA_T}:</b> ${fmt(dt, 2, " " + UNIT_C)}<br>
      <b>SST:</b> ${fmt(sst, 2, " " + UNIT_C)}<br>
      <b>Kedalaman:</b> ${fmt(depth, 0, " m")}<br>
      <b>Arus:</b> ${fmt(cur, 3, " m/s")}<br>
      <b>Est. daya:</b> ${fmt(power, 2, " MW")}`);
    window._clickMarker.openPopup();
  });
}

/* ══════════════════════════════════════════════════════════════════
   Turbo colormap LUT (compact keyframes → 256-entry lookup table)
   ══════════════════════════════════════════════════════════════════ */
const TURBO_LUT_AN = (() => {
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

function turboRGBan(t) {
  const i = Math.max(0, Math.min(255, Math.round(t * 255)));
  return [
    TURBO_LUT_AN[i * 3],
    TURBO_LUT_AN[i * 3 + 1],
    TURBO_LUT_AN[i * 3 + 2],
  ];
}

/* Build a canvas-based ImageOverlay for OTEC net power (turbo colormap).
   Areas that fail active MCDA filters are fully transparent. */
/* ─────────────────────────────────────────────────────────────────
   buildOtecCanvas — bilinear interpolation, upscale 6×
   Setiap piksel output diinterpolasi dari 4 sel grid terdekat
   sehingga tidak ada gap dan transisi halus di seluruh domain.
   ───────────────────────────────────────────────────────────────── */
function buildOtecCanvas(opts) {
  const { useDepth, useDt, useCur, minDt, eff, flow, maxMW } = opts;
  const nLat = latArr.length,
    nLon = lonArr.length;
  const SCALE = 16; // piksel output per sel grid — resolusi lebih halus
  const W = nLon * SCALE,
    H = nLat * SCALE;

  // Pre-cache BATHY_GRID untuk bilinear depth interpolation
  const bathyLat = typeof BATHY_GRID !== "undefined" ? BATHY_GRID.lat : null;
  const bathyLon = typeof BATHY_GRID !== "undefined" ? BATHY_GRID.lon : null;
  const bathyDep = typeof BATHY_GRID !== "undefined" ? BATHY_GRID.depth : null;

  /** Bilinear interpolation pada array 2D grid[row][col].
   *  fi = posisi float di sumbu baris (0 = baris 0, 1 = baris 1, dst.)
   *  fj = posisi float di sumbu kolom */
  function bilinear(grid, fi, fj, rows, cols) {
    const i0 = Math.max(0, Math.min(rows - 2, Math.floor(fi)));
    const j0 = Math.max(0, Math.min(cols - 2, Math.floor(fj)));
    const i1 = i0 + 1,
      j1 = j0 + 1;
    const v00 = grid[i0]?.[j0];
    const v01 = grid[i0]?.[j1];
    const v10 = grid[i1]?.[j0];
    const v11 = grid[i1]?.[j1];
    // Tangani sel null: gunakan mean dari yang valid
    const vals = [v00, v01, v10, v11];
    const valid = vals.filter((v) => v != null && !isNaN(v));
    if (valid.length === 0) return null;
    if (valid.length < 4) {
      // partial: fill null dengan rata-rata tetangga valid
      const m = valid.reduce((a, b) => a + b, 0) / valid.length;
      const w00 = v00 ?? m,
        w01 = v01 ?? m,
        w10 = v10 ?? m,
        w11 = v11 ?? m;
      const ty = fi - i0,
        tx = fj - j0;
      return (
        w00 * (1 - ty) * (1 - tx) +
        w01 * (1 - ty) * tx +
        w10 * ty * (1 - tx) +
        w11 * ty * tx
      );
    }
    const ty = fi - i0,
      tx = fj - j0;
    return (
      v00 * (1 - ty) * (1 - tx) +
      v01 * (1 - ty) * tx +
      v10 * ty * (1 - tx) +
      v11 * ty * tx
    );
  }

  /** Bilinear depth dari BATHY_GRID (grid berbeda resolusi).
   *  fi/fj di-clamp ke batas grid sehingga area di luar domain BATHY
   *  mendapat nilai edge terdekat (nearest-boundary extrapolation). */
  function bilinearDepth(lat, lon) {
    if (!bathyLat || !bathyLon || !bathyDep) return null;
    const nr = bathyLat.length,
      nc = bathyLon.length;
    const fiRaw =
      ((lat - bathyLat[0]) / (bathyLat[nr - 1] - bathyLat[0])) * (nr - 1);
    const fjRaw =
      ((lon - bathyLon[0]) / (bathyLon[nc - 1] - bathyLon[0])) * (nc - 1);
    // Clamp ke dalam domain — jangan return null untuk area di luar batas
    const fi = Math.max(0, Math.min(nr - 1, fiRaw));
    const fj = Math.max(0, Math.min(nc - 1, fjRaw));
    const raw = bilinear(bathyDep, fi, fj, nr, nc);
    return raw != null ? Math.abs(raw) : null;
  }

  /* ── Inpaint null cells (nearest-valid-neighbor, multi-pass) ────────────
     Isi null di grid oceanik dengan nilai tetangga terdekat yang valid.
     Multi-pass menjamin semua sel null (termasuk daratan di tepi domain)
     terisi sehingga bilinear interpolation tidak menghasilkan gap. */
  function inpaintGrid(src) {
    const rows = src.length,
      cols = src[0].length;
    const out = src.map((row) => row.map((v) => (v == null ? NaN : +v)));
    let changed = true;
    for (let pass = 0; pass < 30 && changed; pass++) {
      changed = false;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          if (!isNaN(out[i][j])) continue;
          let sum = 0,
            cnt = 0;
          for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
              if (!di && !dj) continue;
              const ni = i + di,
                nj = j + dj;
              if (ni < 0 || ni >= rows || nj < 0 || nj >= cols) continue;
              if (!isNaN(out[ni][nj])) {
                sum += out[ni][nj];
                cnt++;
              }
            }
          }
          if (cnt > 0) {
            out[i][j] = sum / cnt;
            changed = true;
          }
        }
      }
    }
    return out;
  }

  // Pre-inpaint semua variabel yang dibutuhkan
  const dtGrid = inpaintGrid(GRID_DATA.delta_t);
  const curGrid = inpaintGrid(GRID_DATA.current);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(W, H);
  const d = imgData.data;

  for (let py = 0; py < H; py++) {
    const fi = (py / (H - 1)) * (nLat - 1);
    const lat = latArr[0] + ((latArr[nLat - 1] - latArr[0]) * py) / (H - 1);

    for (let px = 0; px < W; px++) {
      const fj = (px / (W - 1)) * (nLon - 1);
      const lon = lonArr[0] + ((lonArr[nLon - 1] - lonArr[0]) * px) / (W - 1);
      const pidx = (py * W + px) * 4;

      // Bilinear interpolasi dari grid yang sudah di-inpaint
      const dt = bilinear(dtGrid, fi, fj, nLat, nLon);
      const cur = bilinear(curGrid, fi, fj, nLat, nLon);
      const depth = bilinearDepth(lat, lon);

      if (dt == null || isNaN(dt)) {
        d[pidx + 3] = 0;
        continue;
      }

      let pass = true;
      if (useDt && dt < minDt) pass = false;
      if (useCur && (cur == null || isNaN(cur) || cur >= 1)) pass = false;
      if (useDepth && (depth == null || depth < 1000)) pass = false;

      if (!pass) {
        d[pidx + 3] = 0; // Transparent instead of dark block!
        continue;
      }

      const grossMW = (flow / 100) * 10 * Math.pow(dt / 22, 2);
      const netMW = eff * grossMW;
      const t = Math.min(1, Math.max(0, netMW / maxMW));
      const [r, g, b] = turboRGBan(t);
      d[pidx] = r;
      d[pidx + 1] = g;
      d[pidx + 2] = b;
      d[pidx + 3] = 220;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

function renderColorbar(canvasId) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const ctx = el.getContext("2d");
  const w = el.width;
  for (let x = 0; x < w; x++) {
    const [r, g, b] = turboRGBan(x / (w - 1));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, 0, 1, el.height);
  }
}

/* Shared click-report renderer for both OTEC pages */
function renderOtecPointReport(lat, lon, eff, flow) {
  const panel = document.getElementById("otec-point-report");
  if (!panel) return;
  const dt = gridValueAt(GRID_DATA.delta_t, lat, lon);
  const sst = gridValueAt(GRID_DATA.sst, lat, lon);
  const deep = gridValueAt(GRID_DATA.deep_temp, lat, lon);
  const cur = gridValueAt(GRID_DATA.current, lat, lon);
  const depth = getDepthAt(lat, lon);
  const useDepth = document.getElementById("mcda-depth")?.checked ?? true;
  const useDt = document.getElementById("mcda-deltat")?.checked ?? true;
  const useCur = document.getElementById("mcda-current")?.checked ?? true;
  const minDt =
    parseFloat(document.getElementById("mcda-dt-slider")?.value) || 22;

  let pass = true;
  if (useDt && (dt == null || dt < minDt)) pass = false;
  if (useCur && (cur == null || cur >= 1)) pass = false;
  if (useDepth && (depth == null || depth < 1000)) pass = false;

  let grossMW = null,
    netMW = null;
  if (dt != null) {
    grossMW = (flow / 100) * 10 * Math.pow(dt / 22, 2);
    netMW = eff * grossMW;
  }

  const f = (v, d, u) =>
    v != null && !isNaN(v) ? v.toFixed(d) + " " + u : "N/A";
  const statusColor = pass ? "#3DA87A" : "#C95454";
  const statusBg = pass ? "rgba(61,168,122,0.1)" : "rgba(201,84,84,0.1)";
  const statusBorder = pass ? "rgba(61,168,122,0.25)" : "rgba(201,84,84,0.25)";
  const statusText = pass ? "LAYAK (Eligible)" : "TIDAK LAYAK";
  const tickOk = '<polyline points="20 6 9 17 4 12"/>';
  const tickNo =
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

  panel.innerHTML = `
    <div style="font-family:'JetBrains Mono',monospace;font-size:.62rem;color:var(--text-muted);margin-bottom:.6rem">
      LAT ${lat.toFixed(4)} &nbsp; LON ${lon.toFixed(4)}
    </div>
    <div style="display:flex;align-items:center;gap:.4rem;padding:.4rem .7rem;border-radius:6px;background:${statusBg};border:1px solid ${statusBorder};color:${statusColor};font-family:'JetBrains Mono',monospace;font-size:.65rem;font-weight:600;text-transform:uppercase;margin-bottom:.8rem">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">${pass ? tickOk : tickNo}</svg>
      ${statusText}
    </div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:.55rem;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);border-bottom:1px solid var(--border);padding-bottom:.3rem;margin-bottom:.5rem">DATA FISIK</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-bottom:.6rem">
      ${[
        ["Kedalaman", f(depth, 0, "m")],
        ["SST", f(sst, 2, UNIT_C)],
        ["Suhu Dalam", f(deep, 2, UNIT_C)],
        [
          "Delta T",
          f(dt, 2, UNIT_C),
          dt != null && dt >= minDt ? "#3DA87A" : "#C9A84C",
        ],
        [
          "Arus Maks",
          f(cur, 3, "m/s"),
          cur != null && cur < 1 ? "#3DA87A" : "#C9A84C",
        ],
      ]
        .map(
          ([lbl, val, clr]) => `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:.4rem .6rem">
          <div style="font-family:'JetBrains Mono',monospace;font-size:.55rem;text-transform:uppercase;color:var(--text-muted)">${lbl}</div>
          <div style="font-family:'Space Grotesk',sans-serif;font-size:.95rem;font-weight:700;color:${clr || "var(--text-primary)"};">${val}</div>
        </div>`,
        )
        .join("")}
    </div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:.55rem;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);border-bottom:1px solid var(--border);padding-bottom:.3rem;margin-bottom:.5rem">OUTPUT TERMODINAMIK</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-bottom:.6rem">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:.4rem .6rem">
        <div style="font-family:'JetBrains Mono',monospace;font-size:.55rem;text-transform:uppercase;color:var(--text-muted)">Daya Bruto</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:1rem;font-weight:700;color:var(--text-primary)">${grossMW != null ? grossMW.toFixed(3) + " MW" : "N/A"}</div>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:.4rem .6rem">
        <div style="font-family:'JetBrains Mono',monospace;font-size:.55rem;text-transform:uppercase;color:var(--text-muted)">Daya Neto</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:1rem;font-weight:700;color:#4A9EBF">${netMW != null ? netMW.toFixed(3) + " MW" : "N/A"}</div>
      </div>
    </div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:.55rem;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);border-bottom:1px solid var(--border);padding-bottom:.3rem;margin-bottom:.5rem">KRITERIA MCDA</div>
    ${[
      ["Kedalaman > 1000 m", depth != null && depth >= 1000],
      ["\u0394T > " + minDt + "\u00B0C", dt != null && dt >= minDt],
      ["Arus < 1 m/s", cur != null && cur < 1],
    ]
      .map(
        ([lbl, ok]) => `
      <div style="display:flex;align-items:center;gap:.45rem;font-size:.74rem;margin:.25rem 0">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${ok ? "#3DA87A" : "#C95454"}" stroke-width="2.5" stroke-linecap="round">${ok ? tickOk : tickNo}</svg>
        <span style="color:${ok ? "var(--text-primary)" : "var(--text-muted)"}">${lbl}</span>
      </div>`,
      )
      .join("")}`;
}

/* ── Power potential dynamic overlay (canvas ImageOverlay — no polygons) ── */
function updatePowerPotentialOverlay() {
  const map = maps.potential;
  if (!map) return;
  const rawEff =
    parseFloat(document.getElementById("ctrl-efficiency")?.value) || 3;
  const eff = Math.max(0.005, Math.min(rawEff, 89)) / 100;
  const flow = Math.max(
    1,
    parseFloat(document.getElementById("ctrl-flow")?.value) || 100,
  );

  // Update display labels
  const effDisp = document.getElementById("ctrl-eff-display");
  const flowDisp = document.getElementById("ctrl-flow-display");
  if (effDisp) effDisp.textContent = Math.round(rawEff * 10) / 10 + "%";
  if (flowDisp) flowDisp.textContent = flow;

  if (powerOverlayLayer) map.removeLayer(powerOverlayLayer);
  const dataUrl = buildOtecCanvas({
    useDepth: false,
    useDt: false,
    useCur: false,
    minDt: 0,
    eff,
    flow,
    maxMW: 20,
  });
  powerOverlayLayer = L.imageOverlay(dataUrl, overlayBounds, { opacity: 1 });
  powerOverlayLayer.addTo(map);
  renderColorbar("ctrl-colorbar");
}

/* ── MCDA feasibility ── */
const ZONES = [
  {
    zona: "Deep Ocean South",
    lat: "-10.5 to -11.0",
    deltaT: "24.5 " + EN_DASH + " 25.2",
    depth: ">3000",
    status: "good",
    statusText: "Sangat Potensial",
  },
  {
    zona: "Mid-Shelf South Bali",
    lat: "-9.5 to -10.5",
    deltaT: "23.5 " + EN_DASH + " 24.5",
    depth: "1000" + EN_DASH + "3000",
    status: "good",
    statusText: "Sangat Potensial",
  },
  {
    zona: "Nearshore Bali",
    lat: "-8.5 to -9.5",
    deltaT: "23.0 " + EN_DASH + " 24.0",
    depth: "200" + EN_DASH + "1000",
    status: "medium",
    statusText: "Sedang",
  },
  {
    zona: "Shallow Shelf",
    lat: "-8.0 to -8.5",
    deltaT: "<23.0",
    depth: "<200",
    status: "bad",
    statusText: "Tidak Potensial",
  },
];

function renderZoneCardsCompact() {
  const c = document.getElementById("zone-cards-mcda");
  if (!c) return;
  const clr = {
    good: {
      bg: "rgba(61,168,122,0.08)",
      border: "rgba(61,168,122,0.25)",
      text: "#3DA87A",
    },
    medium: {
      bg: "rgba(201,168,76,0.08)",
      border: "rgba(201,168,76,0.25)",
      text: "#C9A84C",
    },
    bad: {
      bg: "rgba(201,84,84,0.08)",
      border: "rgba(201,84,84,0.25)",
      text: "#C95454",
    },
  };
  c.innerHTML = ZONES.map((z) => {
    const s = clr[z.status];
    return `<div class="zone-card" style="background:${s.bg};border:1px solid ${s.border};padding:.5rem;border-radius:8px">
      <div class="zone-name" style="font-size:.8rem;font-weight:600">${z.zona}</div>
      <div style="font-size:.72rem;color:var(--text-secondary)">${DELTA_T}: ${z.deltaT} ${UNIT_C}</div>
      <div class="zone-status" style="color:${s.text};font-size:.72rem">${z.statusText}</div>
    </div>`;
  }).join("");
}

function updateFeasibilityLayer() {
  const map = maps.feasibility;
  if (!map) return;
  const useDepth = document.getElementById("mcda-depth")?.checked ?? true;
  const useDt = document.getElementById("mcda-deltat")?.checked ?? true;
  const useCur = document.getElementById("mcda-current")?.checked ?? true;
  const minDt =
    parseFloat(document.getElementById("mcda-dt-slider")?.value) || 22;

  // update slider label
  const dtVal = document.getElementById("mcda-dt-val");
  if (dtVal) dtVal.textContent = minDt;

  if (feasibilityLayer) map.removeLayer(feasibilityLayer);

  // canvas: eligible cells → solid green, rest transparent
  const nLat = latArr.length,
    nLon = lonArr.length;
  const cvs = document.createElement("canvas");
  cvs.width = nLon;
  cvs.height = nLat;
  const ctx = cvs.getContext("2d");
  const img = ctx.createImageData(nLon, nLat);
  const d = img.data;

  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      const px = (i * nLon + j) * 4;
      const dt = GRID_DATA.delta_t[i]?.[j];
      const cur = GRID_DATA.current[i]?.[j];
      const depth = getDepthAt(latArr[i], lonArr[j]);

      let pass = true;
      if (useDt && (dt == null || dt < minDt)) pass = false;
      if (useCur && (cur == null || cur >= 1)) pass = false;
      if (useDepth && (depth == null || depth < 1000)) pass = false;

      if (!pass) {
        d[px + 3] = 0;
        continue;
      }
      // green with slight turbo tint based on delta-T
      const t = dt != null ? Math.min(1, (dt - minDt) / (26 - minDt)) : 0.5;
      const [r, g, b] = turboRGBan(0.25 + t * 0.35); // green-yellow slice of turbo
      d[px] = r;
      d[px + 1] = g;
      d[px + 2] = b;
      d[px + 3] = 210;
    }
  }
  ctx.putImageData(img, 0, 0);
  feasibilityLayer = L.imageOverlay(cvs.toDataURL("image/png"), overlayBounds, {
    opacity: 1,
  });
  feasibilityLayer.addTo(map);
}

/* ── Subsea infrastructure ── */
function startInfraDraw() {
  infraState.drawMode = true;
  infraState.points = [];
  clearInfraRoute(false);
  document.getElementById("infra-draw")?.classList.add("active");
}

function finishInfraDraw() {
  infraState.drawMode = false;
  document.getElementById("infra-draw")?.classList.remove("active");
  computeInfraRoute();
}

function clearInfraRoute(resetMode = true) {
  const map = maps.infrastructure;
  if (!map) return;
  if (infraState.polyline) map.removeLayer(infraState.polyline);
  infraState.points.forEach((p) => {
    if (p.marker) map.removeLayer(p.marker);
  });
  infraState.points = [];
  infraState.polyline = null;
  if (resetMode) {
    infraState.drawMode = false;
    document.getElementById("infra-draw")?.classList.remove("active");
  }
  document.getElementById("infra-stats").innerHTML = "Belum ada rute.";
  Plotly.purge("chart-cross-section");
}

function setupInfraClick() {
  if (!maps.infrastructure || maps.infrastructure._infraClick) return;
  maps.infrastructure._infraClick = true;
  maps.infrastructure.on("click", (e) => {
    if (!infraState.drawMode) return;
    const map = maps.infrastructure;
    const pt = e.latlng;
    const marker = L.circleMarker(pt, {
      radius: 5,
      fillColor: "#f97316",
      fillOpacity: 1,
      color: "#fff",
      weight: 2,
    }).addTo(map);
    infraState.points.push({ lat: pt.lat, lon: pt.lng, marker });
    const latlngs = infraState.points.map((p) => [p.lat, p.lon]);
    if (infraState.polyline) map.removeLayer(infraState.polyline);
    infraState.polyline = L.polyline(latlngs, {
      color: "#f97316",
      weight: 3.5,
      dashArray: "8,5",
    }).addTo(map);
    if (infraState.points.length >= 2) computeInfraRoute();
  });
}

function sampleBathyAlongRoute(points, n) {
  const samples = [];
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const segIdx = Math.min(
      Math.floor(t * (points.length - 1)),
      points.length - 2,
    );
    const localT = t * (points.length - 1) - segIdx;
    const a = points[segIdx],
      b = points[segIdx + 1] || a;
    const lat = a.lat + (b.lat - a.lat) * localT;
    const lon = a.lon + (b.lon - a.lon) * localT;
    const depth = getDepthAt(lat, lon) ?? 0;
    samples.push({ dist: t, depth, lat, lon });
  }
  let cum = 0;
  for (let i = 1; i < samples.length; i++) {
    const p0 = samples[i - 1],
      p1 = samples[i];
    const d2d = haversineM(p0.lat, p0.lon, p1.lat, p1.lon);
    cum += d2d;
    samples[i].distKm = cum / 1000;
    samples[i].depth = p1.depth;
  }
  samples[0].distKm = 0;
  return samples;
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1),
    dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeInfraRoute() {
  if (infraState.points.length < 2) return;
  const pts = infraState.points;

  // Gunakan N=200 sample untuk kalkulasi panjang yang akurat
  const samples = sampleBathyAlongRoute(pts, 200);

  // Hitung panjang 2D dan 3D dari sample (bukan antar waypoint)
  // sehingga perubahan kedalaman per segmen ikut dihitung dengan benar
  let len2d = 0,
    len3d = 0,
    lenInvalid = 0;
    
  const useMaxDepth = document.getElementById("infra-max-depth-toggle")?.checked ?? true;
  const maxDepth = parseFloat(document.getElementById("infra-max-depth")?.value) || 1000;

  for (let i = 1; i < samples.length; i++) {
    const p0 = samples[i - 1],
      p1 = samples[i];
    const d2 = haversineM(p0.lat, p0.lon, p1.lat, p1.lon);
    const dz = (p1.depth || 0) - (p0.depth || 0); // beda kedalaman (m)
    len2d += d2;
    const dist3d = Math.sqrt(d2 * d2 + dz * dz);
    len3d += dist3d;
    
    if (useMaxDepth && ((p0.depth || 0) > maxDepth || (p1.depth || 0) > maxDepth)) {
      lenInvalid += dist3d;
    }
  }

  // Ambil sample lebih sedikit hanya untuk plot (N=200 terlalu detail)
  const plotSamples = sampleBathyAlongRoute(pts, 80);
  const yVals = plotSamples.map((s) => -(s.depth || 0));
  const yMin = Math.min(...yVals, useMaxDepth ? -maxDepth : 0);
  // Beri ruang 15% di bawah nilai terdalam, min -1500m
  const yFloor = Math.max(-6000, Math.floor((yMin * 1.15) / 100) * 100);

  document.getElementById("infra-stats").innerHTML = `
    <div><strong>Panjang 2D:</strong> ${(len2d / 1000).toFixed(2)} km</div>
    <div><strong>Panjang 3D (slope):</strong> ${(len3d / 1000).toFixed(2)} km</div>
    ${useMaxDepth ? `<div style="color:#ef4444;font-weight:bold;">Tdk Valid (>${maxDepth}m): ${(lenInvalid / 1000).toFixed(2)} km</div>` : ""}
    <div><strong>Titik:</strong> ${pts.length}</div>`;

  const { gridC, fontC } = plotTheme();
  
  const shapes = [];
  if (useMaxDepth) {
    const maxX = plotSamples[plotSamples.length - 1]?.distKm || 0;
    shapes.push({
      type: "line",
      x0: 0,
      x1: maxX,
      y0: -maxDepth,
      y1: -maxDepth,
      line: { color: "#ef4444", width: 1.5, dash: "dot" }
    });
    shapes.push({
      type: "rect",
      xref: "x",
      yref: "y",
      x0: 0,
      x1: maxX,
      y0: -maxDepth,
      y1: Math.min(-6000, yFloor - 500),
      fillcolor: "rgba(239, 68, 68, 0.15)",
      line: { width: 0 },
      layer: "below"
    });
  }

  Plotly.newPlot(
    "chart-cross-section",
    [
      {
        x: plotSamples.map((s) => s.distKm),
        y: yVals,
        fill: "tozeroy",
        fillcolor: "rgba(30,58,138,0.35)",
        line: { color: "#60a5fa", width: 2 },
        name: "Bathymetry",
        hovertemplate:
          "Jarak: %{x:.2f} km<br>Kedalaman: %{y:.0f} m<extra></extra>",
      },
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      height: 180,
      margin: { l: 55, r: 14, t: 20, b: 46 },
      font: { family: "Inter", color: fontC, size: 11 },
      xaxis: {
        title: { text: "Jarak (km)", standoff: 8 },
        gridcolor: gridC,
        tickfont: { size: 10 },
      },
      yaxis: {
        title: { text: "Kedalaman (m)", standoff: 4 },
        gridcolor: gridC,
        range: [yFloor, 10], // autorange dinamis — bisa sampai -6000m
        tickfont: { size: 10 },
      },
      shapes: shapes,
    },
    { responsive: true, displayModeBar: false },
  );
}

/* ── Salinity / currents layers (shared helpers) ── */
function getSalinityColor(psu) {
  if (psu <= 33.0) return "#f7fcf0";
  if (psu <= 33.5) return "#e0f3db";
  if (psu <= 34.0) return "#ccebc5";
  if (psu <= 34.2) return "#a8ddb5";
  if (psu <= 34.4) return "#7bccc4";
  if (psu <= 34.6) return "#4eb3d3";
  if (psu <= 34.8) return "#2b8cbe";
  if (psu <= 35.0) return "#0868ac";
  return "#084081";
}

const CURRENT_SPEED_STOPS = [
  { t: 0, color: [29, 78, 216] },
  { t: 0.25, color: [34, 211, 238] },
  { t: 0.5, color: [251, 191, 36] },
  { t: 0.75, color: [249, 115, 22] },
  { t: 1, color: [239, 68, 68] },
];

function getCurrentSpeedColor(speed) {
  const s = Math.max(0, Math.min(1, speed ?? 0));
  let i = 0;
  while (i < CURRENT_SPEED_STOPS.length - 2 && s > CURRENT_SPEED_STOPS[i + 1].t)
    i++;
  const a = CURRENT_SPEED_STOPS[i];
  const b = CURRENT_SPEED_STOPS[i + 1];
  const span = b.t - a.t || 1;
  const u = (s - a.t) / span;
  const r = Math.round(a.color[0] + (b.color[0] - a.color[0]) * u);
  const g = Math.round(a.color[1] + (b.color[1] - a.color[1]) * u);
  const bl = Math.round(a.color[2] + (b.color[2] - a.color[2]) * u);
  return `rgb(${r},${g},${bl})`;
}

// Arrow size scales with speed (journal quiver style): min 10 px, max 34 px at ~1 m/s
function currentArrowSize(speed) {
  return Math.round(Math.max(10, Math.min(34, 10 + (speed ?? 0) * 24)));
}

const salinityLayers = {};
const currentsLayers = {};
let currentsSeason = "annual"; // selected season key
let currentsOverlayLayer = null; // Leaflet ImageOverlay for magnitude
let currentsVectorLayer = null; // Leaflet GeoJSON for quiver arrows

function buildSalinityLayer(mapKey, depth) {
  return L.geoJSON(SALINITY_VECTOR_GEOJSON, {
    filter: (f) => f.properties.depth === depth,
    style: (f) => ({
      fillColor: getSalinityColor(parseFloat(f.properties.title)),
      fillOpacity: 0.8,
      weight: 0,
      stroke: false,
    }),
    onEachFeature: (f, layer) => {
      layer.bindTooltip(`<b>Salinitas:</b> ${f.properties.title} PSU`, {
        sticky: true,
        className: "custom-popup",
      });
    },
  });
}

/* ── Currents: seasonal magnitude overlay + quiver vectors ── */

function getCurrentsSeasonData() {
  if (typeof CURRENTS_SEASONAL === "undefined") return null;
  const depthIdx = parseInt(
    document.getElementById("currents-depth")?.value || "0",
    10,
  );
  const depth = DEPTH_LEVELS[depthIdx];

  // If depth > 0, use depth overlay (annual); else use selected season
  if (depth > 0) {
    const d = CURRENTS_SEASONAL.depth_overlays?.[String(depth)];
    return d || null;
  }
  return CURRENTS_SEASONAL.seasons?.[currentsSeason] || null;
}

function makeCurrentArrowIcon(dir, speed) {
  // Width is fixed (24 px DOM), height scales with speed → longer shaft = higher speed
  const w = 20;
  const h = currentArrowSize(speed);
  // SVG viewBox: fixed 24 wide, shaft fills from bottom to top; arrowhead always at top
  const html = `<div style="width:${w}px;height:${h}px;transform:rotate(${dir}deg);transform-origin:center;">
    <svg viewBox="0 0 24 ${h * 1.2}" width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="${h * 1.2 - 2}" x2="12" y2="6"/>
      <polyline points="6 14 12 6 18 14"/>
    </svg>
  </div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
  });
}

function buildCurrentsArrowLayer(vectors) {
  const sampled = sampleFeatures(vectors, 300);
  const features = sampled.map((v) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [v.lon, v.lat] },
    properties: { speed: v.speed, dir: v.dir, u: v.u, v_: v.v },
  }));
  return L.geoJSON(
    { type: "FeatureCollection", features },
    {
      pointToLayer: (f, latlng) => {
        const speed = Number(f.properties.speed) || 0;
        const dir = Number(f.properties.dir) || 0;
        return L.marker(latlng, { icon: makeCurrentArrowIcon(dir, speed) });
      },
      onEachFeature: (f, layer) => {
        layer.bindTooltip(
          `<b>Kecepatan:</b> ${Number(f.properties.speed).toFixed(3)} m/s<br><b>Arah:</b> ${f.properties.dir}${DEG}`,
          { sticky: true, className: "custom-popup" },
        );
      },
    },
  );
}

function refreshSalinityMap() {
  const map = maps.salinity;
  if (!map) return;
  const depth =
    DEPTH_LEVELS[
      parseInt(document.getElementById("salinity-depth")?.value || 0)
    ];
  if (salinityLayers.salinity) map.removeLayer(salinityLayers.salinity);
  salinityLayers.salinity = buildSalinityLayer("salinity", depth);
  salinityLayers.salinity.addTo(map);
}

function refreshCurrentsMap() {
  const map = maps.currents;
  if (!map) return;

  // Remove old layers
  if (currentsOverlayLayer) {
    map.removeLayer(currentsOverlayLayer);
    currentsOverlayLayer = null;
  }
  if (currentsVectorLayer) {
    map.removeLayer(currentsVectorLayer);
    currentsVectorLayer = null;
  }
  // Remove legacy layer if present
  if (currentsLayers.currents) {
    map.removeLayer(currentsLayers.currents);
    currentsLayers.currents = null;
  }

  const data = getCurrentsSeasonData();

  if (data && data.png_b64 && data.bounds) {
    // Magnitude overlay (viridis PNG)
    const b = data.bounds;
    const imgUrl = "data:image/png;base64," + data.png_b64;
    currentsOverlayLayer = L.imageOverlay(
      imgUrl,
      [
        [b.south, b.west],
        [b.north, b.east],
      ],
      { opacity: 0.85, interactive: false, zIndex: 200 },
    ).addTo(map);

    // Quiver arrow layer
    if (data.vectors && data.vectors.length) {
      currentsVectorLayer = buildCurrentsArrowLayer(data.vectors);
      currentsVectorLayer.addTo(map);
    }

    // Update stats
    if (data.stats) updateCurrentsMetrics(data.stats);
  } else {
    // Fallback: legacy point GeoJSON (depth > 0 without CURRENTS_SEASONAL)
    const depth =
      DEPTH_LEVELS[
        parseInt(document.getElementById("currents-depth")?.value || 0)
      ];
    const feats = (CURRENTS_VECTOR_GEOJSON?.features || []).filter(
      (f) => Number(f.properties.depth) === Number(depth),
    );
    const sampled = sampleFeatures(feats, VECTOR_SAMPLE_MAX);
    const fallback = L.geoJSON(
      { type: "FeatureCollection", features: sampled },
      {
        pointToLayer: (f, latlng) => {
          const speed = Number(f.properties.speed) || 0;
          const dir = Number(f.properties.direction_degrees) || 0;
          return L.marker(latlng, { icon: makeCurrentArrowIcon(dir, speed) });
        },
      },
    );
    currentsLayers.currents = fallback;
    fallback.addTo(map);
  }

  map.invalidateSize({ animate: false });
}

function updateCurrentsMetrics(stats) {
  if (!stats) return;
  renderMetrics([
    {
      label: "MEAN SPEED",
      value: stats.mean_speed?.toFixed(3) ?? "N/A",
      unit: "m/s",
    },
    {
      label: "MAX SPEED",
      value: stats.max_speed?.toFixed(3) ?? "N/A",
      unit: "m/s",
    },
    {
      label: "DATA POINTS",
      value: String(stats.n_vectors ?? ""),
      unit: "titik",
    },
  ]);
}

function updateCurrentsSeasonTitle() {
  const depthIdx = parseInt(
    document.getElementById("currents-depth")?.value || "0",
    10,
  );
  const depth = DEPTH_LEVELS[depthIdx];
  const labels =
    (typeof CURRENTS_SEASONAL !== "undefined" &&
      CURRENTS_SEASONAL.season_labels) ||
    {};
  let subtitle = "";
  if (depth > 0) {
    subtitle = `Rata-rata Tahunan — Kedalaman ${depth} m`;
  } else {
    const key = currentsSeason;
    if (key === "annual")
      subtitle = "Rata-rata Tahunan (2015–2025) — Permukaan";
    else
      subtitle =
        (labels[key.toUpperCase()] || key.toUpperCase()) + " — Permukaan";
  }
  const el = document.getElementById("currents-season-label");
  if (el) el.textContent = subtitle;

  // Also update the stats from current data
  const data = getCurrentsSeasonData();
  if (data?.stats) updateCurrentsMetrics(data.stats);
}

function displayCurrentPointInfo(lat, lon, depth, cur) {
  // Hide click prompt, show info panel
  const prompt = document.getElementById("currents-click-prompt");
  if (prompt) prompt.style.display = "none";
  const panel = document.getElementById("info-chart-currents");
  if (panel) panel.classList.remove("hidden");
  const info = document.getElementById("current-point-info");
  if (info) {
    info.innerHTML = `
      <div class="analysis-row"><span class="analysis-row-label">KOORDINAT</span><span class="analysis-row-value">${lat.toFixed(4)}, ${lon.toFixed(4)}</span></div>
      <div class="analysis-row"><span class="analysis-row-label">KEDALAMAN</span><span class="analysis-row-value">${depth} m</span></div>
      <div class="analysis-row"><span class="analysis-row-label">ARUS LOKAL</span><span class="analysis-row-value">${fmt(cur, 3, " m/s")}</span></div>
      <p style="font-size:.75rem;color:var(--text-muted);margin-top:.5rem">Sumber: data arus terdekat, arah dan kecepatan.</p>`;
  }
  updateCurrentPointCharts(lat, lon, depth);
}

function selectDefaultCurrentPoint(depth) {
  const feats = (CURRENTS_VECTOR_GEOJSON.features || []).filter(
    (f) => Number(f.properties.depth) === depth,
  );
  if (!feats.length) return;
  const target = feats.reduce((best, f) => {
    const [fx, fy] = f.geometry.coordinates || [];
    const dist = Math.hypot(fy - center[0], fx - center[1]);
    return !best || dist < best.dist ? { feature: f, dist } : best;
  }, null);
  if (!target || !target.feature) return;
  const [lon, lat] = target.feature.geometry.coordinates || [];
  const cur = gridValueAt(GRID_DATA.current, lat, lon);
  if (window._curMarker) maps.currents.removeLayer(window._curMarker);
  window._curMarker = L.circleMarker([lat, lon], {
    radius: 6,
    fillColor: "#10b981",
    color: "#fff",
    weight: 2,
  }).addTo(maps.currents);
  displayCurrentPointInfo(lat, lon, depth, cur);
}

function findNearbyCurrentPoints(lat, lon, depth, maxRadius = 0.5) {
  const all = (CURRENTS_VECTOR_GEOJSON.features || []).filter(
    (f) => Number(f.properties.depth) === depth,
  );
  return all
    .map((f) => {
      const [fx, fy] = f.geometry.coordinates || [];
      const dx = fx - lon;
      const dy = fy - lat;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return { feature: f, dist };
    })
    .filter((item) => item.dist <= maxRadius)
    .sort((a, b) => a.dist - b.dist)
    .map((item) => item.feature);
}

function renderCurrentRose(points, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!points || !points.length) {
    el.innerHTML =
      '<div class="analysis-box" style="padding:1rem">Data tidak tersedia di lokasi ini.</div>';
    return;
  }
  const bins = 16;
  const speedSum = Array(bins).fill(0);
  const count = Array(bins).fill(0);
  points.forEach((pt) => {
    const dir = Number(pt.properties.direction_degrees) || 0;
    const sp = Number(pt.properties.speed) || 0;
    const idx = Math.floor(((dir % 360) / 360) * bins) % bins;
    speedSum[idx] += sp;
    count[idx] += 1;
  });
  const r = speedSum.map((sum, i) => (count[i] ? sum / count[i] : 0));
  const theta = Array.from({ length: bins }, (_, i) => i * (360 / bins));
  Plotly.newPlot(
    elId,
    [
      {
        type: "barpolar",
        r,
        theta,
        marker: { color: "#38bdf8", line: { color: "#0f172a", width: 1 } },
        hovertemplate: "%{theta}°<br>%{r:.3f} m/s<extra></extra>",
      },
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "#000", family: "Inter", size: 11 },
      polar: {
        angularaxis: {
          direction: "clockwise",
          rotation: 90,
          tickcolor: "#000",
          gridcolor: "#aaa",
          tickfont: { color: "#000" },
        },
        radialaxis: {
          tickcolor: "#000",
          gridcolor: "#aaa",
          angle: 90,
          tickfont: { size: 10, color: "#000" },
        },
      },
      margin: { l: 24, r: 24, t: 24, b: 24 },
      showlegend: false,
    },
    { responsive: true, displayModeBar: false },
  );
}

function renderCurrentProfile(points, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!points || !points.length) {
    el.innerHTML =
      '<div class="analysis-box" style="padding:1rem">Data profil arus tidak tersedia.</div>';
    return;
  }
  const depthOrder = [0, 100, 500, 1000];
  const speedsByDepth = {};
  points.forEach((pt) => {
    const depth = Number(pt.properties.depth);
    const sp = Number(pt.properties.speed) || 0;
    if (!Number.isFinite(depth)) return;
    speedsByDepth[depth] = Math.max(speedsByDepth[depth] || 0, sp);
  });
  const y = depthOrder.filter((d) => speedsByDepth[d] != null).map((d) => d);
  const x = y.map((d) => speedsByDepth[d]);
  if (!x.length) {
    el.innerHTML =
      '<div class="analysis-box" style="padding:1rem">Tidak ada data profil arus untuk kedalaman ini.</div>';
    return;
  }
  Plotly.newPlot(
    elId,
    [
      {
        x,
        y,
        type: "scatter",
        mode: "lines+markers",
        line: { color: "#22d3ee", width: 2 },
        marker: { color: "#38bdf8", size: 8 },
        hovertemplate: "%{y} m: %{x:.3f} m/s<extra></extra>",
      },
    ],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "#cbd5e1", family: "Inter", size: 11 },
      xaxis: {
        title: "Kecepatan (m/s)",
        gridcolor: "#334155",
        zerolinecolor: "#334155",
      },
      yaxis: {
        title: "Kedalaman (m)",
        autorange: "reversed",
        gridcolor: "#334155",
      },
      margin: { l: 40, r: 24, t: 24, b: 36 },
      showlegend: false,
    },
    { responsive: true, displayModeBar: false },
  );
}

function findNearestCurrentPointAtDepth(lat, lon, depthM, maxRadius = 1.5) {
  const all = (CURRENTS_VECTOR_GEOJSON.features || []).filter(
    (f) => Number(f.properties.depth) === depthM,
  );
  if (!all.length) return null;
  let best = null,
    bestDist = Infinity;
  all.forEach((f) => {
    const [fx, fy] = f.geometry.coordinates || [];
    const dist = Math.sqrt((fx - lon) ** 2 + (fy - lat) ** 2);
    if (dist < bestDist) {
      bestDist = dist;
      best = f;
    }
  });
  return bestDist <= maxRadius ? best : null;
}

function updateCurrentPointCharts(lat, lon, depth) {
  const nearby = findNearbyCurrentPoints(lat, lon, depth, 0.45);
  renderCurrentRose(nearby, "chart-current-rose");

  // Build vertical profile: find nearest point at each depth level for this location
  const profileFeats = DEPTH_LEVELS.map((d) =>
    findNearestCurrentPointAtDepth(lat, lon, d, 1.5),
  ).filter(Boolean);
  renderCurrentProfile(profileFeats, "chart-current-profile");
}

let currentsClickSetup = false;
function setupCurrentsClick() {
  if (currentsClickSetup || !maps.currents) return;
  currentsClickSetup = true;
  maps.currents.on("click", (e) => {
    const lat = e.latlng.lat,
      lon = e.latlng.lng;
    const depth =
      DEPTH_LEVELS[
        parseInt(document.getElementById("currents-depth")?.value || 0)
      ];
    const cur = gridValueAt(GRID_DATA.current, lat, lon);
    if (window._curMarker) maps.currents.removeLayer(window._curMarker);
    window._curMarker = L.circleMarker([lat, lon], {
      radius: 6,
      fillColor: "#10b981",
      color: "#fff",
      weight: 2,
    }).addTo(maps.currents);
    displayCurrentPointInfo(lat, lon, depth, cur);
  });
}

/* ── Page activation ── */
/* ── Helper: clear semua stray markers dari semua peta ── */
function clearAllMapMarkers() {
  // Click markers on each map
  const markerRefs = [
    '_clickMarker', '_waveMarker', '_curMarker', '_otecEvalMarker'
  ];
  markerRefs.forEach(ref => {
    if (window[ref]) {
      Object.values(maps).forEach(m => {
        try { if (m) m.removeLayer(window[ref]); } catch(e) {}
      });
      window[ref] = null;
    }
  });
}

/* ── Helper: fly to region center saat ganti tab ── */
function flyToRegion(mapKey) {
  const m = maps[mapKey];
  if (!m) return;
  // Compute default zoom from data extent
  const latSpan = latMax - latMin;
  const lonSpan = lonMax - lonMin;
  const span = Math.max(latSpan, lonSpan);
  const zoom = span > 15 ? 6 : span > 8 ? 7 : span > 4 ? 8 : 9;
  m.flyTo(center, zoom, { duration: 0.8, easeLinearity: 0.5 });
}

function activatePage(pageId) {
  currentPage = pageId;
  clearAllMapMarkers();
  document
    .querySelectorAll(".nav-dropdown-item")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === pageId));
  document.querySelectorAll(".nav-dropdown").forEach((dd) => {
    dd.classList.toggle(
      "has-active",
      dd.dataset.category === CATEGORY_FOR_PAGE[pageId],
    );
  });
  document
    .querySelectorAll(".page-panel")
    .forEach((p) => p.classList.toggle("active", p.dataset.page === pageId));
  updatePageTitle(pageId);
  renderInfoPanel(pageId);
  initPageMap(pageId);
  renderControls(pageId);
  setTimeout(() => {
    const key = pageToMapKey(pageId);
    if (maps[key]) {
      maps[key].invalidateSize({ animate: false });
      // Auto-zoom to region
      flyToRegion(key);
    }
    if (pageId === "deep_sea_temp") refreshDeepMap();
  }, 250);
  if (pageId === "deep_sea_temp") {
    setTimeout(repaintDeepMap, 450);
  }
  if (pageId === "thermal_gradient") {
    setTimeout(() => {
      if (maps.delta) {
        maps.delta.invalidateSize();
        refreshDeltaMap();
      }
    }, 450);
  }
  if (pageId === "currents") {
    setTimeout(() => {
      if (maps.currents) {
        maps.currents.invalidateSize({ animate: false });
        refreshCurrentsMap();
      }
    }, 450);
  }
  if (pageId === "bathymetry" && typeof BathyMap !== "undefined") {
    setTimeout(() => BathyMap.invalidate(), 450);
  }
}

function pageToMapKey(pageId) {
  const map = {
    sst_map: "sst",
    deep_sea_temp: "deep",
    thermal_gradient: "delta",
    bathymetry: "bathymetry",
    salinity: "salinity",
    currents: "currents",
    waves: "waves",
    otec_eval: "oteceval",
    subsea_infrastructure: "infrastructure",
  };
  return map[pageId] || pageId;
}

function initPageMap(pageId) {
  switch (pageId) {
    case "sst_map":
      initSst();
      break;
    case "deep_sea_temp":
      initDeep();
      break;
    case "thermal_gradient":
      initDelta();
      break;
    case "bathymetry":
      initBathymetry();
      break;
    case "salinity":
      initSalinity();
      break;
    case "currents":
      initCurrents();
      break;
    case "waves":
      initWaves();
      break;
    case "otec_eval":
      initOtecEval();
      break;
    case "subsea_infrastructure":
      initInfrastructure();
      break;
  }
}

function refreshSstMap() {
  const map = maps.sst;
  if (!map) return;
  if (typeof SST_THERMAL_GEOJSON !== "undefined") {
    if (sstGeoLayer) map.removeLayer(sstGeoLayer);
    sstGeoLayer = L.geoJSON(SST_THERMAL_GEOJSON, {
      filter: (f) =>
        f.properties.period_kind === sstViewMode &&
        f.properties.period_id === sstPeriodId,
      style: (f) => ({
        fillColor: f.properties.fill || "#fde725",
        fillOpacity: 0.78,
        weight: 0,
        stroke: false,
      }),
      onEachFeature: (f, layer) => {
        const tr = f.properties.temp_range || f.properties.title;
        layer.bindTooltip(`<b>SST:</b> ${tr} ${UNIT_C}`, {
          sticky: true,
          className: "custom-popup",
        });
      },
    }).addTo(map);
    return;
  }
  if (typeof SST_VECTOR_GEOJSON !== "undefined") {
    if (sstGeoLayer) map.removeLayer(sstGeoLayer);
    sstGeoLayer = L.geoJSON(SST_VECTOR_GEOJSON, {
      style: (f) => ({
        fillColor: f.properties.fill || "#fc4e2a",
        fillOpacity: 0.75,
        weight: 0,
      }),
      onEachFeature: (f, layer) => {
        layer.bindTooltip(
          `<b>SST:</b> ${f.properties.temp_range || f.properties.title} ${UNIT_C}`,
          { sticky: true },
        );
      },
    }).addTo(map);
  } else {
    L.imageOverlay(OVERLAY_SST, overlayBounds, { opacity: 0.75 }).addTo(map);
  }
}

function updateSstMetrics() {
  const meta =
    typeof SST_THERMAL_META !== "undefined" ? SST_THERMAL_META : null;
  const ps = meta?.periods?.[sstPeriodId];
  if (ps) {
    const periodLbl =
      sstViewMode === "season"
        ? SEASONS.find((s) => s.id === sstPeriodId)?.label ||
          sstPeriodId.toUpperCase()
        : `Tahun ${sstPeriodId}`;
    renderMetrics([
      { label: "MIN SST", value: ps.min.toFixed(2), unit: UNIT_C },
      { label: "MEAN SST", value: ps.mean.toFixed(2), unit: UNIT_C },
      { label: "MAX SST", value: ps.max.toFixed(2), unit: UNIT_C },
      { label: "PERIODE", value: periodLbl, unit: "CMEMS" },
    ]);
    return;
  }
  const s = computeStats(GRID_DATA.sst);
  renderMetrics([
    { label: "MIN SST", value: s.min.toFixed(2), unit: UNIT_C },
    { label: "MEAN SST", value: s.mean.toFixed(2), unit: UNIT_C },
    { label: "MAX SST", value: s.max.toFixed(2), unit: UNIT_C },
  ]);
}

function initSst() {
  const m = initMap("sst", "map-sst", null, false);
  if (!m || m.sstInit) return;
  m.sstInit = true;
}

function deepPeriodKey() {
  return `${deepYear}_${deepDepthM}`;
}

function deepShardRelPath(key) {
  const base =
    typeof DEEP_TEMP_SHARD_BASE !== "undefined"
      ? DEEP_TEMP_SHARD_BASE
      : "data/deep_temp/";
  return `${base}${key || deepPeriodKey()}.geojson`;
}

function setDeepMapStatus(msg, isError) {
  if (!deepMapStatusEl)
    deepMapStatusEl = document.getElementById("legend-deep");
  if (!deepMapStatusEl || !msg) {
    if (deepMapStatusEl) {
      const note = deepMapStatusEl.querySelector(".deep-load-note");
      if (note) note.remove();
    }
    return;
  }
  let note = deepMapStatusEl.querySelector(".deep-load-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "deep-load-note";
    note.style.cssText =
      "font-size:.72rem;margin:.45rem 0 0;color:var(--text-muted)";
    deepMapStatusEl.appendChild(note);
  }
  note.textContent = msg;
  note.style.color = isError ? "#f87171" : "var(--text-muted)";
}

function resolveDataUrl(relPath) {
  return new URL(relPath, window.location.href).href;
}

function repaintDeepMap() {
  const map = maps.deep;
  if (!map) return;
  map.invalidateSize();
  refreshDeepMap();
}

function buildDeepGeoIndex(fc) {
  const index = {};
  for (const f of fc.features || []) {
    const p = f.properties || {};
    const key = `${p.year}_${p.depth_m}`;
    if (!index[key]) index[key] = [];
    index[key].push(f);
  }
  return index;
}

function clearDeepOverlays(map) {
  if (deepGeoLayer) {
    map.removeLayer(deepGeoLayer);
    deepGeoLayer = null;
  }
  if (deepFallbackOverlay) {
    map.removeLayer(deepFallbackOverlay);
    deepFallbackOverlay = null;
  }
}

function applyDeepFallback(map) {
  if (!map || typeof OVERLAY_DEEP === "undefined" || !OVERLAY_DEEP)
    return false;
  clearDeepOverlays(map);
  deepFallbackOverlay = L.imageOverlay(OVERLAY_DEEP, overlayBounds, {
    opacity: 0.78,
  }).addTo(map);
  setDeepMapStatus(
    "Menampilkan rata-rata suhu dalam (fallback). Jalankan server HTTP dari folder web/.",
    false,
  );
  return true;
}

function applyDeepLayer(fc) {
  const map = maps.deep;
  if (!map || !fc) return;
  clearDeepOverlays(map);
  const key = deepPeriodKey();
  let feats = (fc.features || []).filter(isPolygonFeature);
  if (!feats.length && deepGeoJsonIndex)
    feats = (deepGeoJsonIndex[key] || []).filter(isPolygonFeature);
  if (!feats.length) {
    if (!applyDeepFallback(map)) {
      setDeepMapStatus("Data peta tidak tersedia untuk kedalaman ini.", true);
      const mapContainer = map.getContainer();
      const oldWarn = mapContainer.querySelector('.deep-not-available-warning');
      if (oldWarn) oldWarn.remove();
      const warnDiv = document.createElement('div');
      warnDiv.className = 'deep-not-available-warning';
      warnDiv.style.cssText = `
        position: absolute; top: 70px; right: 12px; z-index: 900;
        background: rgba(245, 158, 11, 0.92); color: white;
        padding: 10px 36px 10px 14px; border-radius: 8px;
        font-size: 12px; line-height: 1.5; max-width: 260px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        border: 1.5px solid rgba(255,255,255,0.25);
        backdrop-filter: blur(4px);
      `;
      warnDiv.innerHTML = `
        <button onclick="this.parentElement.remove()" style="
          position:absolute; top:6px; right:8px;
          background:none; border:none; color:rgba(255,255,255,0.85);
          font-size:16px; cursor:pointer; line-height:1; padding:0;
        " aria-label="Tutup peringatan">&times;</button>
        <b>&#9888;&#65039; TIDAK TERSEDIA</b><br>
        Tidak ada data suhu laut dalam untuk kedalaman yang dipilih (${deepDepthM} m).<br>
        Wilayah ini kemungkinan terlalu dangkal.
      `;
      mapContainer.style.position = mapContainer.style.position || 'relative';
      mapContainer.appendChild(warnDiv);
    }
    return;
  }
  const oldWarn = map.getContainer().querySelector('.deep-not-available-warning');
  if (oldWarn) oldWarn.remove();
  setDeepMapStatus("");
  deepGeoLayer = L.geoJSON(
    { type: "FeatureCollection", features: feats },
    {
      filter: isPolygonFeature,
      style: (f) => ({
        fillColor: f.properties.fill || "#2171b5",
        fillOpacity: 0.82,
        weight: 0,
        stroke: false,
      }),
      onEachFeature: (f, layer) => {
        const tr = f.properties.temp_range || f.properties.title;
        const ad = f.properties.actual_depth_m;
        layer.bindTooltip(
          `<b>Suhu:</b> ${tr} ${UNIT_C}<br><b>Kedalaman:</b> ~${ad} m`,
          { sticky: true, className: "custom-popup" },
        );
      },
    },
  ).addTo(map);
  requestAnimationFrame(() => map.invalidateSize());
}

function isOfflineHtml() {
  return window.location.protocol === "file:";
}

function initDeepTempIndexFromEmbedded() {
  if (typeof DEEP_TEMP_BY_PERIOD === "undefined") return false;
  if (!deepGeoJsonIndex) {
    deepGeoJsonIndex = {};
    for (const [key, fc] of Object.entries(DEEP_TEMP_BY_PERIOD)) {
      deepGeoJsonIndex[key] = fc.features || [];
    }
  }
  return true;
}

function fetchDeepGeoJsonOnce(url) {
  if (isOfflineHtml()) {
    return Promise.reject(new Error("fetch tidak tersedia pada file://"));
  }
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
  });
}

function loadDeepGeoJsonFull() {
  if (deepGeoJsonCache) return Promise.resolve(deepGeoJsonCache);
  if (typeof DEEP_TEMP_BY_PERIOD !== "undefined") {
    initDeepTempIndexFromEmbedded();
    const all = [];
    for (const fc of Object.values(DEEP_TEMP_BY_PERIOD))
      all.push(...(fc.features || []));
    deepGeoJsonCache = { type: "FeatureCollection", features: all };
    return Promise.resolve(deepGeoJsonCache);
  }
  if (typeof DEEP_TEMP_GEOJSON !== "undefined") {
    deepGeoJsonCache = DEEP_TEMP_GEOJSON;
    deepGeoJsonIndex = buildDeepGeoIndex(deepGeoJsonCache);
    return Promise.resolve(deepGeoJsonCache);
  }
  if (isOfflineHtml()) {
    return Promise.reject(new Error("deep_temp_embedded.js tidak dimuat"));
  }
  if (deepGeoJsonLoading) return deepGeoJsonLoading;

  const candidates = [];
  candidates.push(resolveDataUrl("data/Deep_Temp_Optimized.geojson"));
  if (typeof DEEP_TEMP_GEOJSON_FALLBACK !== "undefined") {
    candidates.push(resolveDataUrl(DEEP_TEMP_GEOJSON_FALLBACK));
  }
  if (typeof DEEP_TEMP_GEOJSON_URL !== "undefined") {
    candidates.push(resolveDataUrl(DEEP_TEMP_GEOJSON_URL));
  }
  candidates.push(resolveDataUrl("../data/Deep_Temp_Optimized.geojson"));

  const tryNext = (i) => {
    if (i >= candidates.length) {
      return Promise.reject(
        new Error("Deep_Temp_Optimized.geojson tidak ditemukan"),
      );
    }
    return fetchDeepGeoJsonOnce(candidates[i]).catch(() => tryNext(i + 1));
  };

  deepGeoJsonLoading = tryNext(0)
    .then((fc) => {
      deepGeoJsonCache = fc;
      deepGeoJsonIndex = buildDeepGeoIndex(fc);
      return fc;
    })
    .finally(() => {
      deepGeoJsonLoading = null;
    });
  return deepGeoJsonLoading;
}

function loadDeepPeriodGeoJson() {
  const key = deepPeriodKey();
  if (typeof DEEP_TEMP_BY_PERIOD !== "undefined" && DEEP_TEMP_BY_PERIOD[key]) {
    return Promise.resolve(DEEP_TEMP_BY_PERIOD[key]);
  }
  if (typeof DEEP_TEMP_GEOJSON !== "undefined") {
    return loadDeepGeoJsonFull().then(() => ({
      type: "FeatureCollection",
      features: (deepGeoJsonIndex && deepGeoJsonIndex[key]) || [],
    }));
  }
  if (deepShardCache[key]) return Promise.resolve(deepShardCache[key]);
  if (deepGeoJsonIndex && deepGeoJsonIndex[key]) {
    return Promise.resolve({
      type: "FeatureCollection",
      features: deepGeoJsonIndex[key],
    });
  }

  if (isOfflineHtml()) {
    return loadDeepGeoJsonFull().then(() => ({
      type: "FeatureCollection",
      features: (deepGeoJsonIndex && deepGeoJsonIndex[key]) || [],
    }));
  }

  const shardUrl = resolveDataUrl(deepShardRelPath(key));
  return fetchDeepGeoJsonOnce(shardUrl)
    .then((fc) => {
      deepShardCache[key] = fc;
      return fc;
    })
    .catch(() =>
      loadDeepGeoJsonFull().then(() => ({
        type: "FeatureCollection",
        features: (deepGeoJsonIndex && deepGeoJsonIndex[key]) || [],
      })),
    );
}

function refreshDeepMap() {
  const map = maps.deep;
  if (!map) return;
  setDeepMapStatus("Memuat peta suhu kolom air…", false);
  loadDeepPeriodGeoJson()
    .then((fc) => {
      if (currentPage !== "deep_sea_temp") return;
      applyDeepLayer(fc);
    })
    .catch((err) => {
      console.error("[deep temp]", err);
      if (currentPage !== "deep_sea_temp") return;
      clearDeepOverlays(map);
      if (!applyDeepFallback(map)) {
        setDeepMapStatus(
          isOfflineHtml()
            ? "Gagal memuat data. Pastikan js/deep_temp_embedded.js ada di folder web."
            : "Gagal memuat data peta suhu kolom air.",
          true,
        );
      }
    });
}

function updateDeepMetrics() {
  const meta = typeof DEEP_TEMP_META !== "undefined" ? DEEP_TEMP_META : null;
  const ps = meta?.periods?.[deepPeriodKey()];
  if (ps) {
    renderMetrics([
      { label: "MIN T", value: ps.min.toFixed(2), unit: UNIT_C },
      { label: "MEAN T", value: ps.mean.toFixed(2), unit: UNIT_C },
      { label: "MAX T", value: ps.max.toFixed(2), unit: UNIT_C },
      {
        label: "KEDALAMAN",
        value: "~" + ps.actual_depth_m.toFixed(1),
        unit: "m",
      },
      { label: "TAHUN", value: deepYear, unit: "" },
    ]);
    return;
  }
  const d = computeStats(GRID_DATA.deep_temp);
  renderMetrics([
    { label: "MIN DEEP T", value: d.min.toFixed(2), unit: UNIT_C },
    { label: "MEAN DEEP T", value: d.mean.toFixed(2), unit: UNIT_C },
    { label: "MAX DEEP T", value: d.max.toFixed(2), unit: UNIT_C },
  ]);
}

function initDeep() {
  const m = initMap("deep", "map-deep", null, false);
  if (!m) return;
  if (!m.deepInit) {
    m.deepInit = true;
    requestAnimationFrame(() => {
      m.invalidateSize();
      if (currentPage === "deep_sea_temp") refreshDeepMap();
    });
  }
}

function clearDeltaOverlays(map) {
  if (deltaGeoLayer) {
    map.removeLayer(deltaGeoLayer);
    deltaGeoLayer = null;
  }
  if (deltaThresholdLayer) {
    map.removeLayer(deltaThresholdLayer);
    deltaThresholdLayer = null;
  }
  if (deltaBoundingBox) {
    map.removeLayer(deltaBoundingBox);
    deltaBoundingBox = null;
  }
  const oldWarn = map.getContainer().querySelector('.otec-not-potensial-warning');
  if (oldWarn) oldWarn.remove();
}

let otecWarningControl = null;
let deltaBoundingBox = null;

function applyDeltaLayers(fillFc, thrFc) {
  const map = maps.delta;
  if (!map) return;
  clearDeltaOverlays(map);
  
  const fillFeats = (fillFc?.features || []).filter(isPolygonFeature);
  if (!fillFeats.length) {
    L.imageOverlay(OVERLAY_DT, overlayBounds, { opacity: 0.75 }).addTo(map);
  }

  const thrFeats = thrFc?.features || [];
  if (!thrFeats.length) {
    // Tampilkan peringatan tidak potensial — dismissable popup
    const mapContainer = map.getContainer();
    const oldWarn = mapContainer.querySelector('.otec-not-potensial-warning');
    if (oldWarn) oldWarn.remove();
    const warnDiv = document.createElement('div');
    warnDiv.className = 'otec-not-potensial-warning';
    warnDiv.style.cssText = `
      position: absolute; top: 70px; right: 12px; z-index: 900;
      background: rgba(220, 38, 38, 0.92); color: white;
      padding: 10px 36px 10px 14px; border-radius: 8px;
      font-size: 12px; line-height: 1.5; max-width: 260px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      border: 1.5px solid rgba(255,255,255,0.25);
      backdrop-filter: blur(4px);
    `;
    warnDiv.innerHTML = `
      <button onclick="this.parentElement.remove()" style="
        position:absolute; top:6px; right:8px;
        background:none; border:none; color:rgba(255,255,255,0.85);
        font-size:16px; cursor:pointer; line-height:1; padding:0;
      " aria-label="Tutup peringatan">&times;</button>
      <b>&#9888;&#65039; TIDAK POTENSIAL</b><br>
      Kedalaman sangat dangkal (&lt;100m).<br>
      Tidak ada gradien termal yang mencukupi.
    `;
    mapContainer.style.position = mapContainer.style.position || 'relative';
    mapContainer.appendChild(warnDiv);
  }

  if (fillFeats.length > 0) {
    deltaGeoLayer = L.geoJSON(
    { type: "FeatureCollection", features: fillFeats },
    {
      filter: isPolygonFeature,
      style: (f) => defaultDeltaFillStyle(f),
      onEachFeature: (f, layer) => {
        const tr = f.properties.temp_range || f.properties.title;
        const ad = f.properties.actual_deep_m;
        layer.bindTooltip(
          `<b>${DELTA_T}:</b> ${tr} ${UNIT_C}<br><b>CWP:</b> ~${ad} m`,
          { sticky: true, className: "custom-popup" },
        );
      },
    },
  ).addTo(map);
    applyDeltaThresholdStyle();
  }

  if (thrFeats.length) {
    deltaThresholdLayer = L.geoJSON(
      { type: "FeatureCollection", features: thrFeats },
      {
        style: () => ({
          color: "#1e293b",
          weight: 2.5,
          opacity: 0.95,
          dashArray: "10,6",
          fill: false,
        }),
        onEachFeature: (f, layer) => {
          layer.bindTooltip(
            `<b>Ambang OTEC:</b> ${f.properties.threshold_c || 20} ${UNIT_C}`,
            { sticky: true },
          );
        },
      },
    ).addTo(map);
  }
  requestAnimationFrame(() => map.invalidateSize());
}

function fetchDeltaJsonOnce(url) {
  if (isOfflineHtml()) {
    return Promise.reject(new Error("fetch tidak tersedia pada file://"));
  }
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
  });
}

function loadDeltaPeriodData() {
  const key = deltaPeriodKey();
  if (typeof DELTAT_BY_PERIOD !== "undefined" && DELTAT_BY_PERIOD[key]) {
    return Promise.resolve(DELTAT_BY_PERIOD[key]);
  }
  if (deltaShardCache[key]) return Promise.resolve(deltaShardCache[key]);
  if (typeof DELTAT_VECTOR_GEOJSON !== "undefined") {
    return Promise.resolve({
      fill: DELTAT_VECTOR_GEOJSON,
      threshold: { type: "FeatureCollection", features: [] },
    });
  }
  if (isOfflineHtml()) {
    return Promise.reject(new Error("deltat_embedded.js tidak dimuat"));
  }
  const base =
    typeof DELTAT_SHARD_BASE !== "undefined"
      ? DELTAT_SHARD_BASE
      : "data/deltat/";
  const fillUrl = new URL(`${base}${key}_fill.geojson`, window.location.href)
    .href;
  const thrUrl = new URL(`${base}${key}_thr.geojson`, window.location.href)
    .href;
  return Promise.all([
    fetchDeltaJsonOnce(fillUrl),
    fetchDeltaJsonOnce(thrUrl).catch(() => ({
      type: "FeatureCollection",
      features: [],
    })),
  ]).then(([fill, threshold]) => {
    const pack = { fill, threshold };
    deltaShardCache[key] = pack;
    return pack;
  });
}

function refreshDeltaMap() {
  const map = maps.delta;
  if (!map) return;
  loadDeltaPeriodData()
    .then((pack) => {
      if (currentPage !== "thermal_gradient") return;
      applyDeltaLayers(pack.fill, pack.threshold);
    })
    .catch((err) => {
      console.error("[delta T]", err);
      if (currentPage !== "thermal_gradient") return;
      clearDeltaOverlays(map);
      L.imageOverlay(OVERLAY_DT, overlayBounds, { opacity: 0.75 }).addTo(map);
    });
}

function initDeltaBathymetry(map) {
  if (deltaBathyLayer || typeof BATHYMETRY_VECTOR_GEOJSON === "undefined")
    return;
  try {
    deltaBathyLayer = L.geoJSON(BATHYMETRY_VECTOR_GEOJSON, {
      style: (f) =>
        f.properties.depth === 1000
          ? {
              color: "#22d3ee",
              weight: 2.5,
              dashArray: "8,4",
              fill: false,
              opacity: 0.9,
            }
          : { color: "#ffffff", weight: 1, fill: false, opacity: 0.5 },
      onEachFeature: (f, layer) =>
        layer.bindTooltip(`<b>Kedalaman:</b> ${f.properties.depth} m`, {
          sticky: true,
        }),
    }).addTo(map);
  } catch (e) {
    /* optional */
  }
}

function initDelta() {
  const m = initMap("delta", "map-delta", null, false);
  if (!m) return;
  initDeltaBathymetry(m);
  if (!m.deltaInit) {
    m.deltaInit = true;
    requestAnimationFrame(() => {
      m.invalidateSize();
      if (currentPage === "thermal_gradient") refreshDeltaMap();
    });
  }
  setTimeout(setupDeltaClick, 200);
}

function initBathymetry() {
  const m = initMap("bathymetry", "map-bathymetry", null, false);
  if (!m) return;
  if (!m.bathyMapInit) {
    m.bathyMapInit = true;
    requestAnimationFrame(() => {
      m.invalidateSize();
      if (currentPage === "bathymetry" && typeof BathyMap !== "undefined") {
        BathyMap.init(m).then(() => BathyMap.bindUi());
      }
    });
  }
}

function initSalinity() {
  const m = initMap("salinity", "map-salinity", null, true, "#10b981");
  if (!m || m.salInit) return;
  m.salInit = true;
}

function initCurrents() {
  const m = initMap("currents", "map-currents", null, false);
  if (!m || m.curInit) {
    setTimeout(setupCurrentsClick, 200);
    return;
  }
  m.curInit = true;
  setTimeout(setupCurrentsClick, 200);
}

function waveRoseSeasonKey(seasonId) {
  if (typeof WAVES_ROSE_DATA === "undefined") return null;
  const seasons = WAVES_ROSE_DATA.seasons || {};
  return seasons[seasonId] ? seasonId : seasons.all ? "all" : null;
}

function updateWavesMetrics(seasonId) {
  const spec =
    typeof WAVES_SPECTRUM_DATA !== "undefined"
      ? WAVES_SPECTRUM_DATA.seasons?.[seasonId]
      : null;
  if (!spec) {
    renderMetrics([]);
    return;
  }
  renderMetrics([
    { label: "MEAN Hs", value: fmt(spec.mean_hs_m, 2), unit: "m" },
    { label: "PEAK Tp", value: fmt(spec.peak_period_s, 2), unit: "s" },
  ]);
}

/* Wave rose: stacked barpolar per Hs bin.
   Angular axis: 8 compass labels only (N/NE/E/SE/S/SW/W/NW) for clarity.
   Radial axis:  % waktu (occurrence frequency). */
/* Wave rose untuk titik yang diklik — barpolar 5 musim (DJF/MAM/JJA/SON/Annual)
   theta = vmdr (arah datang gelombang), r = Hs (m), satu bar per musim.
   Data diambil dari WAVES_ARROW_GRID[season] untuk titik terdekat. */
function renderWaveRose(seasonId, clickLat, clickLon) {
  const el = document.getElementById("chart-wave-rose");
  if (!el) return;
  const { gridC, fontC, hoverBg, hoverText } = plotTheme();

  const SEASONS = [
    { id: "djf", label: "DJF", color: "#60a5fa" },
    { id: "mam", label: "MAM", color: "#34d399" },
    { id: "jja", label: "JJA", color: "#f97316" },
    { id: "son", label: "SON", color: "#a78bfa" },
    { id: "annual", label: "Annual", color: "#f59e0b" },
  ];

  // Find nearest arrow-grid point per season at clicked location
  function nearestPt(season) {
    if (typeof WAVES_ARROW_GRID === "undefined") return null;
    const pts = WAVES_ARROW_GRID[season] || [];
    if (!pts.length) return null;
    return pts.reduce(
      (best, p) => {
        const d = Math.hypot(p.lat - (clickLat ?? 0), p.lon - (clickLon ?? 0));
        return d < best.d ? { p, d } : best;
      },
      { p: null, d: Infinity },
    ).p;
  }

  const traces = SEASONS.map(({ id, label, color }) => {
    const pt = nearestPt(id);
    if (!pt) return null;
    return {
      type: "barpolar",
      r: [pt.hs],
      theta: [pt.vmdr],
      name: label,
      width: 30,
      marker: {
        color,
        opacity: id === seasonId ? 1 : 0.55,
        line: { color: "rgba(255,255,255,0.25)", width: 0.8 },
      },
      hovertemplate: `<b>${label}</b><br>Arah: %{theta:.0f}°<br>Hs: %{r:.2f} m<extra></extra>`,
    };
  }).filter(Boolean);

  if (!traces.length) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:.8rem;padding:.5rem">Data tidak tersedia untuk titik ini.</p>`;
    return;
  }

  const allHs = traces.map((t) => t.r[0]);
  const rMax = Math.ceil(Math.max(...allHs) * 10) / 10 + 0.2;

  Plotly.newPlot(
    el,
    traces,
    {
      barmode: "overlay",
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      height: 280,
      margin: { l: 36, r: 36, t: 14, b: 14 },
      font: { family: "Inter", color: fontC, size: 11 },
      polar: {
        bgcolor: "rgba(0,0,0,0)",
        hole: 0.06,
        radialaxis: {
          ticksuffix: " m",
          gridcolor: gridC,
          linecolor: "rgba(0,0,0,0)",
          angle: 90,
          tickangle: 0,
          tickfont: { size: 9, color: fontC },
          range: [0, rMax],
          showline: false,
          layer: "below traces",
        },
        angularaxis: {
          direction: "clockwise",
          rotation: 90,
          gridcolor: gridC,
          tickmode: "array",
          tickvals: [0, 45, 90, 135, 180, 225, 270, 315],
          ticktext: ["U", "TL", "T", "TG", "S", "BD", "B", "BL"],
          tickfont: { size: 12, color: fontC },
          layer: "above traces",
        },
      },
      legend: {
        orientation: "h",
        x: 0.5,
        xanchor: "center",
        y: -0.08,
        yanchor: "top",
        font: { size: 9, color: fontC },
        tracegroupgap: 2,
      },
      hoverlabel: { bgcolor: hoverBg, font: { color: hoverText, size: 11 } },
      showlegend: true,
    },
    { responsive: true, displayModeBar: false },
  );
}

/* Spektrum energi gelombang — x: frekuensi (Hz), y: S(f) (m²/Hz)
   Tambah garis vertikal Tp (peak period) dan anotasi n_samples.
   Konversi: f = 1/T, S(f)_density = energy_m2 / df dimana df = |Δ(1/T)|. */
function renderWaveSpectrum(seasonId) {
  const el = document.getElementById("chart-wave-spectrum");
  if (!el || typeof WAVES_SPECTRUM_DATA === "undefined") return;
  const spec =
    WAVES_SPECTRUM_DATA.seasons?.[seasonId] || WAVES_SPECTRUM_DATA.seasons?.all;
  if (!spec?.periods_s?.length) return;
  const { gridC, fontC, hoverBg, hoverText } = plotTheme();

  // Convert period → frequency, compute S(f) density
  const T = spec.periods_s; // periods in s (ascending)
  const E = spec.energy_m2; // band energy (m²) per band
  // freq array (descending T → ascending f)
  const f = T.map((t) => 1 / t); // Hz, will be descending
  // df ≈ |Δf| for each band (use central difference, edge = one-sided)
  const df = f.map((fi, i) => {
    const prev = i > 0 ? f[i - 1] : f[i];
    const next = i < f.length - 1 ? f[i + 1] : f[i];
    return Math.abs(next - prev) / 2 || 1e-6;
  });
  const Sf = E.map((e, i) => (df[i] > 0 ? e / df[i] : 0)); // m²/Hz

  // fp = 1/Tp (peak frequency)
  const Tp = spec.peak_period_s || null;
  const fp = Tp ? 1 / Tp : null;

  const traces = [
    {
      x: f,
      y: Sf,
      type: "scatter",
      mode: "lines",
      name: "S(f)",
      fill: "tozeroy",
      fillcolor: "rgba(56,189,248,0.15)",
      line: { color: "#38bdf8", width: 2 },
      hovertemplate:
        "f: %{x:.4f} Hz (T=%{customdata:.1f}s)<br>S(f): %{y:.2f} m²/Hz<extra></extra>",
      customdata: T,
    },
  ];

  // Vertical line at peak frequency
  const shapes = [];
  const annotations = [];
  if (fp != null) {
    const maxSf = Math.max(...Sf);
    shapes.push({
      type: "line",
      x0: fp,
      x1: fp,
      y0: 0,
      y1: maxSf,
      line: { color: "#f59e0b", width: 1.5, dash: "dot" },
    });
    annotations.push({
      x: fp,
      y: maxSf * 1.02,
      text: `Tp=${Tp?.toFixed(1)}s`,
      showarrow: false,
      font: { size: 9, color: "#f59e0b" },
      xanchor: "left",
    });
  }
  // n_samples note
  if (spec.n_samples) {
    annotations.push({
      xref: "paper",
      yref: "paper",
      x: 0.98,
      y: 0.96,
      text: `n=${spec.n_samples.toLocaleString()} sampel`,
      showarrow: false,
      font: { size: 8, color: fontC },
      xanchor: "right",
    });
  }

  Plotly.newPlot(
    el,
    traces,
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      height: 220,
      margin: { l: 60, r: 12, t: 10, b: 44 },
      font: { family: "Inter", color: fontC, size: 11 },
      xaxis: {
        title: { text: "Frekuensi (Hz)", font: { size: 10 } },
        gridcolor: gridC,
        tickfont: { size: 9 },
        tickformat: ".3f",
        autorange: "reversed", // low-f (long period) on right, matches physical convention
      },
      yaxis: {
        title: { text: "S(f) (m²/Hz)", font: { size: 10 } },
        gridcolor: gridC,
        tickfont: { size: 9 },
      },
      shapes,
      annotations,
      hoverlabel: { bgcolor: hoverBg, font: { color: hoverText, size: 11 } },
      showlegend: false,
    },
    { responsive: true, displayModeBar: false },
  );
}

/* ── Turbo colormap for Hs (0–4+ m) ── */
const TURBO_STOPS = [
  [0.0, [48, 18, 59]],
  [0.25, [65, 125, 224]],
  [0.5, [28, 207, 159]],
  [0.75, [237, 175, 35]],
  [1.0, [196, 37, 3]],
];
function hsToTurboColor(hs, maxHs) {
  const t = Math.min(1, Math.max(0, hs / (maxHs || 4)));
  for (let i = 0; i < TURBO_STOPS.length - 1; i++) {
    const [t0, c0] = TURBO_STOPS[i];
    const [t1, c1] = TURBO_STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * u);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * u);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * u);
      return `rgb(${r},${g},${b})`;
    }
  }
  return `rgb(${TURBO_STOPS[TURBO_STOPS.length - 1][1].join(",")})`;
}

/* ── Wave arrow: size ∝ Hs, black, directional ── */
let wavesArrowLayer = null;
function waveArrowSize(hs) {
  return Math.round(Math.max(8, Math.min(32, 8 + (hs ?? 0) * 6)));
}
function makeWaveArrowIcon(dir, hs) {
  const w = 20,
    h = waveArrowSize(hs);
  const html = `<div style="width:${w}px;height:${h}px;transform:rotate(${dir}deg);transform-origin:center;">
    <svg viewBox="0 0 24 ${h * 1.2}" width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="${h * 1.2 - 2}" x2="12" y2="6"/>
      <polyline points="6 14 12 6 18 14"/>
    </svg>
  </div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
  });
}

function buildWavesArrowLayer(season) {
  // Use regular-grid arrow data (WAVES_ARROW_GRID) if available,
  // else fall back to WAVES_VECTOR_GEOJSON polygon centroids
  if (
    typeof WAVES_ARROW_GRID !== "undefined" &&
    WAVES_ARROW_GRID[season]?.length
  ) {
    const pts = WAVES_ARROW_GRID[season];
    return L.layerGroup(
      pts.map(({ lat, lon, hs, vmdr }) =>
        L.marker([lat, lon], { icon: makeWaveArrowIcon(vmdr, hs) }).bindTooltip(
          `<b>Hs:</b> ${hs.toFixed(2)} m<br><b>Arah:</b> ${vmdr.toFixed(0)}\u00b0`,
          { sticky: true, className: "custom-popup" },
        ),
      ),
    );
  }
  // Fallback: polygon centroids from WAVES_VECTOR_GEOJSON
  if (typeof WAVES_VECTOR_GEOJSON === "undefined") return null;
  const feats = (WAVES_VECTOR_GEOJSON.features || []).filter(
    (f) => f.properties.season === season && f.properties.vmdr != null,
  );
  if (!feats.length) return null;
  const points = feats
    .map((f) => {
      const coords = f.geometry?.coordinates;
      let lon = 0,
        lat = 0,
        n = 0;
      const ring = Array.isArray(coords?.[0]?.[0]?.[0])
        ? coords[0][0]
        : coords?.[0] || [];
      ring.forEach(([x, y]) => {
        lon += x;
        lat += y;
        n++;
      });
      if (!n) return null;
      return {
        lat: lat / n,
        lon: lon / n,
        hs: f.properties.hs_mid || 0,
        vmdr: f.properties.vmdr || 0,
      };
    })
    .filter(Boolean);
  return L.layerGroup(
    points.map(({ lat, lon, hs, vmdr }) =>
      L.marker([lat, lon], { icon: makeWaveArrowIcon(vmdr, hs) }).bindTooltip(
        `<b>Hs:</b> ${hs.toFixed(2)} m<br><b>Arah:</b> ${vmdr.toFixed(0)}\u00b0`,
        { sticky: true, className: "custom-popup" },
      ),
    ),
  );
}

/* ── Dynamic colorbar + arrow legend for waves control panel ── */
function updateWavesLegend(season) {
  const el = document.getElementById("waves-legend-dynamic");
  if (!el) return;

  // Compute actual Hs range for this season
  const feats =
    typeof WAVES_VECTOR_GEOJSON !== "undefined"
      ? (WAVES_VECTOR_GEOJSON.features || []).filter(
          (f) => f.properties.season === season,
        )
      : [];
  const hsVals = feats
    .map((f) => f.properties.hs_mid || 0)
    .filter((v) => v > 0);
  const maxHs = hsVals.length ? Math.max(...hsVals) : 2;
  const minHs = hsVals.length ? Math.min(...hsVals) : 0;

  // Build 5 evenly-spaced tick labels from 0 to ceil(maxHs*10)/10
  const hsMax = Math.ceil(maxHs * 10) / 10;
  const step4 = hsMax / 4;
  const ticks = [0, 1, 2, 3, 4].map((i) =>
    i < 4 ? (i * step4).toFixed(1) : hsMax.toFixed(1) + "+",
  );

  // Arrow reference: low = 25th pct Hs, high = max Hs (both from data)
  const arrowPts =
    typeof WAVES_ARROW_GRID !== "undefined"
      ? WAVES_ARROW_GRID[season] || []
      : [];
  const arrowHs = arrowPts.map((p) => p.hs).sort((a, b) => a - b);
  const hsLow = arrowHs.length
    ? arrowHs[Math.floor(arrowHs.length * 0.25)]
    : hsMax * 0.3;
  const hsHigh = arrowHs.length ? arrowHs[arrowHs.length - 1] : hsMax;

  // Arrow SVG heights proportional to Hs
  function arrowH(hs) {
    return Math.round(Math.max(10, Math.min(36, 10 + hs * 8)));
  }
  const hLow = arrowH(hsLow);
  const hHigh = arrowH(hsHigh);

  el.innerHTML = `
    <div class="control-group">
      <label style="font-family:'JetBrains Mono',monospace;font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">
        Tinggi Gelombang Hs (m)
      </label>
      <div style="position:relative;height:14px;border-radius:4px;background:linear-gradient(to right,#30123b,#4145ab,#4675ed,#39a2fc,#1bcfd4,#24eca6,#61fc6c,#aef359,#eacf32,#f79c25,#e85b25,#c42503);margin:.3rem 0 .2rem;border:1px solid rgba(255,255,255,.08)"></div>
      <div style="display:flex;justify-content:space-between;font-size:.62rem;color:var(--text-muted);font-family:'JetBrains Mono',monospace">
        ${ticks.map((t) => `<span>${t}</span>`).join("")}
      </div>
      <div style="font-size:.6rem;color:var(--text-muted);margin:.2rem 0 0;opacity:.75">
        Data musim ini: ${minHs.toFixed(2)} – ${maxHs.toFixed(2)} m
      </div>
    </div>
    <div class="control-group">
      <label style="font-family:'JetBrains Mono',monospace;font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">Referensi Panah</label>
      <div style="display:flex;align-items:center;gap:14px;margin:.4rem 0 .3rem;padding:.5rem .8rem;background:rgba(255,255,255,.06);border-radius:6px;border:1px solid rgba(255,255,255,.1)">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <svg viewBox="0 0 20 ${hHigh + 4}" width="14" height="${hHigh}" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="10" y1="${hHigh + 2}" x2="10" y2="4"/>
            <polyline points="5 ${Math.round(hHigh * 0.55)} 10 4 15 ${Math.round(hHigh * 0.55)}"/>
          </svg>
          <span style="font-size:.62rem;font-family:'JetBrains Mono',monospace;color:var(--text-muted)">${hsHigh.toFixed(1)} m</span>
        </div>
        <div style="font-size:.63rem;color:var(--text-muted);line-height:1.5">
          Panjang ∝ Hs<br>Arah = arah gelombang
        </div>
      </div>
    </div>`;
}

function refreshWavesMap() {
  const map = maps.waves;
  if (!map || typeof WAVES_VECTOR_GEOJSON === "undefined") return;
  if (wavesGeoLayer) map.removeLayer(wavesGeoLayer);
  if (wavesArrowLayer) map.removeLayer(wavesArrowLayer);

  // Compute actual max Hs for this season for turbo color scaling
  const seasonFeats = (WAVES_VECTOR_GEOJSON.features || []).filter(
    (f) => f.properties.season === wavesSeason,
  );
  const maxHs =
    seasonFeats.reduce((m, f) => Math.max(m, f.properties.hs_mid || 0), 0) || 2;

  // Update dynamic legend to match current season's real data range
  updateWavesLegend(wavesSeason);

  wavesGeoLayer = L.geoJSON(WAVES_VECTOR_GEOJSON, {
    filter: (f) => f.properties.season === wavesSeason,
    style: (f) => ({
      fillColor: hsToTurboColor(f.properties.hs_mid || 0, maxHs),
      fillOpacity: 0.82,
      weight: 0,
      stroke: false,
    }),
    onEachFeature: (f, layer) => {
      const hs = f.properties.hs_mid ?? f.properties.title;
      layer.bindTooltip(`<b>Hs:</b> ${hs} m`, {
        sticky: true,
        className: "custom-popup",
      });
    },
  }).addTo(map);

  wavesArrowLayer = buildWavesArrowLayer(wavesSeason);
  if (wavesArrowLayer) wavesArrowLayer.addTo(map);
}

/* ── Wave click handler ── */
let wavesClickSetup = false;
function setupWavesClick() {
  if (wavesClickSetup || !maps.waves) return;
  wavesClickSetup = true;
  maps.waves.on("click", (e) => {
    displayWavePointInfo(e.latlng.lat, e.latlng.lng);
  });
}

function getNearestWaveFeature(lat, lon) {
  if (typeof WAVES_VECTOR_GEOJSON === "undefined") return null;
  const feats = (WAVES_VECTOR_GEOJSON.features || []).filter(
    (f) => f.properties.season === wavesSeason,
  );
  let best = null,
    bestDist = Infinity;
  feats.forEach((f) => {
    const coords = f.geometry?.coordinates;
    const ring = Array.isArray(coords?.[0]?.[0]?.[0])
      ? coords[0][0]
      : coords?.[0] || [];
    let cx = 0,
      cy = 0,
      n = 0;
    ring.forEach(([x, y]) => {
      cx += x;
      cy += y;
      n++;
    });
    if (!n) return;
    const dist = Math.hypot(cx / n - lon, cy / n - lat);
    if (dist < bestDist) {
      bestDist = dist;
      best = f;
    }
  });
  return best;
}

function displayWavePointInfo(lat, lon) {
  // Persist last-clicked coords so season change can re-render automatically
  window._waveClickLat = lat;
  window._waveClickLon = lon;

  // Place / move the marker on the map
  if (maps.waves) {
    if (window._waveMarker) maps.waves.removeLayer(window._waveMarker);
    window._waveMarker = L.circleMarker([lat, lon], {
      radius: 6,
      fillColor: "#f59e0b",
      color: "#fff",
      weight: 2,
      fillOpacity: 1,
    }).addTo(maps.waves);
  }

  const prompt = document.getElementById("waves-click-prompt");
  const panel = document.getElementById("info-chart-waves");
  if (prompt) prompt.style.display = "none";
  if (panel) panel.classList.remove("hidden");

  const feat = getNearestWaveFeature(lat, lon);
  const hs = feat?.properties?.hs_mid ?? null;
  const vmdr = feat?.properties?.vmdr ?? null;

  // Domain-wide stats for this season from spectrum data
  const spec =
    typeof WAVES_SPECTRUM_DATA !== "undefined"
      ? WAVES_SPECTRUM_DATA.seasons?.[wavesSeason] ||
        WAVES_SPECTRUM_DATA.seasons?.all
      : null;
  const meanHs = spec?.mean_hs_m ?? null;
  const Tp = spec?.peak_period_s ?? null;
  const nSamp = spec?.n_samples ?? null;

  // Domain Hs range from vector features
  const domFeats =
    typeof WAVES_VECTOR_GEOJSON !== "undefined"
      ? (WAVES_VECTOR_GEOJSON.features || []).filter(
          (f) => f.properties.season === wavesSeason,
        )
      : [];
  const domHsVals = domFeats
    .map((f) => f.properties.hs_mid || 0)
    .filter((v) => v > 0);
  const domHsMin = domHsVals.length ? Math.min(...domHsVals) : null;
  const domHsMax = domHsVals.length ? Math.max(...domHsVals) : null;

  // Compass label helper
  function degToCompass(d) {
    const dirs = [
      "U",
      "ULu",
      "TL",
      "TMLa",
      "T",
      "TMSe",
      "TG",
      "STg",
      "S",
      "SBD",
      "BD",
      "BBD",
      "B",
      "BBL",
      "BL",
      "UBL",
    ];
    return dirs[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
  }

  const info = document.getElementById("wave-point-info");
  if (info) {
    info.innerHTML =
      `<div class="analysis-row"><span class="analysis-row-label">KOORDINAT</span><span class="analysis-row-value">${lat.toFixed(3)}°, ${lon.toFixed(3)}°</span></div>` +
      `<div class="analysis-row"><span class="analysis-row-label">Hs LOKAL (${wavesSeason.toUpperCase()})</span><span class="analysis-row-value">${hs != null ? hs.toFixed(2) + " m" : "N/A"}</span></div>` +
      (vmdr != null
        ? `<div class="analysis-row"><span class="analysis-row-label">ARAH GELOMBANG</span><span class="analysis-row-value">${vmdr.toFixed(0)}° (${degToCompass(vmdr)})</span></div>`
        : "") +
      (meanHs != null
        ? `<div class="analysis-row"><span class="analysis-row-label">Hs DOMAIN (rerata)</span><span class="analysis-row-value">${meanHs.toFixed(2)} m</span></div>`
        : "") +
      (domHsMin != null && domHsMax != null
        ? `<div class="analysis-row"><span class="analysis-row-label">RENTANG Hs DOMAIN</span><span class="analysis-row-value">${domHsMin.toFixed(2)} – ${domHsMax.toFixed(2)} m</span></div>`
        : "") +
      (Tp != null
        ? `<div class="analysis-row"><span class="analysis-row-label">PERIODE PUNCAK (Tp)</span><span class="analysis-row-value">${Tp.toFixed(1)} s</span></div>`
        : "") +
      (nSamp != null
        ? `<div class="analysis-row"><span class="analysis-row-label">JUMLAH SAMPEL</span><span class="analysis-row-value">${nSamp.toLocaleString()}</span></div>`
        : "") +
      `<p style="font-size:.68rem;color:var(--text-muted);margin:.35rem .5rem .1rem;line-height:1.4;opacity:.8">Wave rose: Hs &amp; arah per musim di titik ini. Spektrum: domain ${wavesSeason.toUpperCase()}.</p>`;
  }

  // Delay Plotly renders by one animation frame so the browser has time to
  // lay out the newly-visible panel (#info-chart-waves was display:none).
  // Without this, Plotly measures a 0×0 container and produces a blank chart.
  requestAnimationFrame(() => {
    renderWaveRose(wavesSeason, window._waveClickLat, window._waveClickLon);
    renderWaveSpectrum(wavesSeason);
    // Force resize in case Plotly already has a cached 0-size layout
    const rEl = document.getElementById("chart-wave-rose");
    const sEl = document.getElementById("chart-wave-spectrum");
    if (rEl && window.Plotly) Plotly.Plots.resize(rEl);
    if (sEl && window.Plotly) Plotly.Plots.resize(sEl);
  });
}

function initWaves() {
  const m = initMap("waves", "map-waves", null, false, null);
  const ph = document.getElementById("waves-placeholder");
  if (typeof WAVES_VECTOR_GEOJSON === "undefined") {
    if (ph) ph.style.display = "flex";
    return;
  }
  if (ph) ph.style.display = "none";
  if (!m || m.wavesInit) {
    refreshWavesMap();
    setTimeout(setupWavesClick, 200);
    return;
  }
  m.wavesInit = true;
  // Fit map to NC data domain (from arrow grid or vector geojson bbox)
  if (typeof WAVES_ARROW_GRID !== "undefined") {
    const allPts = Object.values(WAVES_ARROW_GRID).flat();
    if (allPts.length) {
      const lons = allPts.map((p) => p.lon);
      const lats = allPts.map((p) => p.lat);
      const pad = 0.3;
      m.fitBounds([
        [Math.min(...lats) - pad, Math.min(...lons) - pad],
        [Math.max(...lats) + pad, Math.max(...lons) + pad],
      ]);
    }
  }
  refreshWavesMap();
  setTimeout(setupWavesClick, 200);
}

/* ══════════════════════════════════════════════════════
   OTEC EVALUATION PAGE — unified MCDA + Power overlay
   ══════════════════════════════════════════════════════ */

/** Baca efisiensi dan flow dari kontrol, kembalikan {eff, flow, rawEff} */
function readOtecParams() {
  const rawEff =
    parseFloat(document.getElementById("ctrl-efficiency")?.value) || 3;
  const eff = Math.max(0.005, Math.min(rawEff, 89)) / 100;
  const flow = Math.max(
    1,
    parseFloat(document.getElementById("ctrl-flow")?.value) || 100,
  );
  return { rawEff, eff, flow };
}

/** Baca status checkbox MCDA dan slider ΔT */
function readMcda() {
  return {
    useDepth: document.getElementById("mcda-depth")?.checked ?? true,
    useDt: document.getElementById("mcda-deltat")?.checked ?? true,
    useCur: document.getElementById("mcda-current")?.checked ?? true,
    minDt: parseFloat(document.getElementById("mcda-dt-slider")?.value) || 22,
  };
}

/** Canvas overlay gabungan: zona MCDA eligible diwarnai turbo(daya neto) */
function updateOtecEvalOverlay() {
  const map = maps.oteceval;
  if (!map) return;
  const { rawEff, eff, flow } = readOtecParams();
  const { useDepth, useDt, useCur, minDt } = readMcda();

  // Update display labels
  const effDisp = document.getElementById("ctrl-eff-display");
  const flowDisp = document.getElementById("ctrl-flow-display");
  if (effDisp) effDisp.textContent = Math.round(rawEff * 10) / 10 + "%";
  if (flowDisp) flowDisp.textContent = flow;
  const dtLbl = document.getElementById("mcda-dt-val");
  if (dtLbl) dtLbl.textContent = minDt;

  if (otecEvalLayer) map.removeLayer(otecEvalLayer);

  const dataUrl = buildOtecCanvas({
    useDepth,
    useDt,
    useCur,
    minDt,
    eff,
    flow,
    maxMW: 20,
  });
  otecEvalLayer = L.imageOverlay(dataUrl, overlayBounds, { opacity: 1 });
  otecEvalLayer.addTo(map);

  // Selalu tampilkan bounding box area kajian
  if (window._otecBoundaryBox) map.removeLayer(window._otecBoundaryBox);
  window._otecBoundaryBox = L.rectangle(overlayBounds, {
    color: '#22d3ee',
    weight: 2,
    dashArray: '8,5',
    fill: false,
    opacity: 0.7,
    interactive: false,
  }).addTo(map).bindTooltip('Area Kajian OTEC', { permanent: false, direction: 'topleft' });
  renderColorbar("ctrl-colorbar");
}

/** Hitung statistik domain: area layak, % eligible, max/mean daya */
function computeDomainStats() {
  const { eff, flow } = readOtecParams();
  const { useDepth, useDt, useCur, minDt } = readMcda();
  const nLat = latArr.length,
    nLon = lonArr.length;

  // km² per sel (approx)
  const dLatKm = Math.abs(latArr[1] - latArr[0]) * 111.32;
  const dLonKm =
    Math.abs(lonArr[1] - lonArr[0]) *
    111.32 *
    Math.cos((((latArr[0] + latArr[nLat - 1]) / 2) * Math.PI) / 180);
  const cellKm2 = dLatKm * dLonKm;

  let eligible = 0,
    total = 0,
    sumPow = 0,
    maxPow = 0,
    powVals = [];
  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      const dt = GRID_DATA.delta_t[i]?.[j];
      const cur = GRID_DATA.current[i]?.[j];
      const depth = getDepthAt(latArr[i], lonArr[j]);
      if (dt == null) continue;
      total++;
      let pass = true;
      if (useDt && dt < minDt) pass = false;
      if (useCur && cur >= 1) pass = false;
      if (useDepth && (depth == null || depth < 1000)) pass = false;
      if (!pass) continue;
      eligible++;
      const grossMW = (flow / 100) * 10 * Math.pow(dt / 22, 2);
      const netMW = eff * grossMW;
      sumPow += netMW;
      if (netMW > maxPow) maxPow = netMW;
      powVals.push(netMW);
    }
  }
  const pct = total > 0 ? (eligible / total) * 100 : 0;
  const meanPow = powVals.length > 0 ? sumPow / powVals.length : 0;
  const areaKm2 = eligible * cellKm2;
  return { eligible, total, pct, areaKm2, meanPow, maxPow };
}

/** Render kartu statistik domain di panel kiri */
function refreshDomainStats() {
  const el = document.getElementById("otec-domain-stats");
  if (!el) return;
  const s = computeDomainStats();
  const f1 = (v) => (isNaN(v) ? "—" : v.toFixed(1));
  const f0 = (v) => (isNaN(v) ? "—" : Math.round(v).toLocaleString("id-ID"));
  const pctBar = Math.min(100, s.pct);

  el.innerHTML = `
    <div class="otec-domain-header">
      <span style="font-family:'JetBrains Mono',monospace;font-size:.55rem;text-transform:uppercase;letter-spacing:2px;color:#8aa8bc">RINGKASAN DOMAIN</span>
    </div>
    <div class="otec-stat-grid">
      <div class="otec-stat-card">
        <div class="otec-stat-label">Area Layak</div>
        <div class="otec-stat-value">${f0(s.areaKm2)}</div>
        <div class="otec-stat-unit">km²</div>
      </div>
      <div class="otec-stat-card">
        <div class="otec-stat-label">% Eligible</div>
        <div class="otec-stat-value">${f1(s.pct)}</div>
        <div class="otec-stat-unit">%</div>
      </div>
      <div class="otec-stat-card">
        <div class="otec-stat-label">Daya Maks</div>
        <div class="otec-stat-value">${f1(s.maxPow)}</div>
        <div class="otec-stat-unit">MW</div>
      </div>
      <div class="otec-stat-card">
        <div class="otec-stat-label">Daya Rata²</div>
        <div class="otec-stat-value">${f1(s.meanPow)}</div>
        <div class="otec-stat-unit">MW</div>
      </div>
    </div>
    <div style="margin:.65rem 0 .3rem">
      <div style="display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:.58rem;color:#b8ccdc;margin-bottom:.25rem">
        <span>Persentase zona layak</span><span style="color:var(--accent)">${f1(s.pct)}%</span>
      </div>
      <div style="height:6px;border-radius:3px;background:rgba(74,158,191,0.15);overflow:hidden">
        <div style="height:100%;width:${pctBar}%;background:linear-gradient(90deg,#3da87a,#4a9ebf);border-radius:3px;transition:width .4s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:.55rem;color:#8aa8bc;margin-top:.15rem">
        <span>${s.eligible} sel</span><span>${s.total} total</span>
      </div>
    </div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:.55rem;text-transform:uppercase;letter-spacing:2px;color:#8aa8bc;border-bottom:1px solid var(--border);padding-bottom:.3rem;margin:.65rem 0 .4rem">KLIK PETA</div>
    <div style="display:flex;align-items:center;gap:.5rem;color:#b8ccdc;font-size:.74rem">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".7"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
      <span>Klik titik pada peta untuk analisis &amp; laporan lengkap per titik</span>
    </div>`;
}

/** Render laporan lengkap per titik: status → fisik → gauge daya → bar MCDA → timeseries */
function renderOtecFullReport(lat, lon) {
  const { eff, flow } = readOtecParams();
  const { useDepth, useDt, useCur, minDt } = readMcda();

  const dt = gridValueAt(GRID_DATA.delta_t, lat, lon);
  const sst = gridValueAt(GRID_DATA.sst, lat, lon);
  const deep = gridValueAt(GRID_DATA.deep_temp, lat, lon);
  const cur = gridValueAt(GRID_DATA.current, lat, lon);
  const depth = getDepthAt(lat, lon);

  let pass = true;
  if (useDt && (dt == null || dt < minDt)) pass = false;
  if (useCur && (cur == null || cur >= 1)) pass = false;
  if (useDepth && (depth == null || depth < 1000)) pass = false;

  const grossMW = dt != null ? (flow / 100) * 10 * Math.pow(dt / 22, 2) : null;
  const netMW = grossMW != null ? eff * grossMW : null;
  const f = (v, d, u) =>
    v != null && !isNaN(v) ? v.toFixed(d) + " " + u : "N/A";

  const statusColor = pass ? "#3DA87A" : "#C95454";
  const statusBg = pass ? "rgba(61,168,122,0.10)" : "rgba(201,84,84,0.10)";
  const statusBorder = pass ? "rgba(61,168,122,0.30)" : "rgba(201,84,84,0.30)";
  const tickOk = '<polyline points="20 6 9 17 4 12"/>';
  const tickNo =
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
  const pctMW = netMW != null ? Math.min(100, (netMW / 20) * 100) : 0;

  // Gauge SVG
  const gaugeRadius = 42,
    gaugeCirc = 2 * Math.PI * gaugeRadius;
  const gaugeDash = (pctMW / 100) * gaugeCirc * 0.75;
  const gaugeColor =
    netMW != null
      ? netMW >= 10
        ? "#3DA87A"
        : netMW >= 5
          ? "#C9A84C"
          : "#4A9EBF"
      : "#4d5e70";

  const panel = document.getElementById("otec-point-report-inner");
  if (!panel) return;

  panel.innerHTML = `
    <div style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:var(--text-muted);margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;">
      <span>LAT <b>${lat.toFixed(4)}</b></span>
      <span>LON <b>${lon.toFixed(4)}</b></span>
    </div>

    <!-- Status badge -->
    <div style="display:flex;align-items:center;justify-content:center;gap:0.5rem;padding:0.6rem 1rem;border-radius:8px;background:${statusBg};border:1px solid ${statusBorder};color:${statusColor};font-family:'Space Grotesk',sans-serif;font-size:0.85rem;font-weight:700;text-transform:uppercase;margin-bottom:1.2rem;box-shadow: 0 4px 12px ${statusBg}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">${pass ? tickOk : tickNo}</svg>
      ${pass ? "LAYAK — Eligible OTEC" : "TIDAK LAYAK"}
    </div>

    <!-- Gauge daya neto -->
    <div style="display:flex;align-items:center;gap:1.2rem;margin-bottom:1.2rem;padding:1rem;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
      <svg width="100" height="100" viewBox="0 0 100 100" style="flex-shrink:0; filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.05));">
        <circle cx="50" cy="50" r="${gaugeRadius}" fill="none" stroke="var(--border)" stroke-width="8"
          stroke-dasharray="${gaugeCirc * 0.75} ${gaugeCirc * 0.25}" stroke-dashoffset="${gaugeCirc * 0.125}" stroke-linecap="round"/>
        <circle cx="50" cy="50" r="${gaugeRadius}" fill="none" stroke="${gaugeColor}" stroke-width="8"
          stroke-dasharray="${gaugeDash} ${gaugeCirc - gaugeDash}" stroke-dashoffset="${gaugeCirc * 0.125}" stroke-linecap="round"
          style="transition:stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)"/>
        <text x="50" y="47" text-anchor="middle" fill="${gaugeColor}" font-family="'Space Grotesk',sans-serif" font-size="18" font-weight="800">${netMW != null ? netMW.toFixed(2) : "—"}</text>
        <text x="50" y="62" text-anchor="middle" fill="var(--text-muted)" font-family="'Inter',sans-serif" font-size="9" font-weight="600">MW NETO</text>
      </svg>
      <div style="flex-grow:1;">
        <div style="font-size:0.7rem;color:var(--text-muted);font-family:'Inter',sans-serif;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:0.2rem">Daya Bruto</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:1.4rem;font-weight:800;color:var(--text-main);margin-bottom:0.4rem">${grossMW != null ? grossMW.toFixed(2) + " MW" : "N/A"}</div>
        <div style="display:flex; gap:10px;">
          <div style="background:var(--bg-panel); border-radius:4px; padding:4px 8px; font-size:0.65rem; color:var(--text-main); font-family:'JetBrains Mono',monospace; border:1px solid var(--border);">
            &eta; = ${(eff * 100).toFixed(1)}%
          </div>
          <div style="background:var(--bg-panel); border-radius:4px; padding:4px 8px; font-size:0.65rem; color:var(--text-main); font-family:'JetBrains Mono',monospace; border:1px solid var(--border);">
            Q = ${flow} m³/s
          </div>
        </div>
      </div>
    </div>

    <!-- Data fisik grid -->
    <div style="font-family:'Inter',sans-serif;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);margin-bottom:0.6rem;display:flex;align-items:center;gap:8px;">
      <div style="flex-grow:1;height:1px;background:var(--border);"></div>
      PARAMETER FISIK
      <div style="flex-grow:1;height:1px;background:var(--border);"></div>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:1.2rem">
      ${[
        ["Kedalaman", f(depth, 0, "m"), null],
        ["SST", f(sst, 2, "°C"), null],
        ["T Dalam", f(deep, 2, "°C"), null],
        [
          "ΔT",
          f(dt, 2, "°C"),
          dt != null && dt >= minDt ? "#3DA87A" : "#C9A84C",
        ],
        [
          "Arus",
          f(cur, 3, "m/s"),
          cur != null && cur < 1 ? "#3DA87A" : "#C9A84C",
        ],
      ]
        .map(
          ([lbl, val, clr]) => `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:.38rem .5rem">
          <div style="font-family:'JetBrains Mono',monospace;font-size:.5rem;text-transform:uppercase;color:#7090aa">${lbl}</div>
          <div style="font-family:'Space Grotesk',sans-serif;font-size:.9rem;font-weight:700;color:${clr || "#e8edf2"};">${val}</div>
        </div>`,
        )
        .join("")}
    </div>

    <!-- Bar MCDA horizontal -->
    <div style="font-family:'Inter',sans-serif;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);margin-bottom:0.6rem;display:flex;align-items:center;gap:8px;">
      <div style="flex-grow:1;height:1px;background:var(--border);"></div>
      KRITERIA MCDA
      <div style="flex-grow:1;height:1px;background:var(--border);"></div>
    </div>
    <div id="otec-mcda-bars" style="margin-bottom:1.2rem"></div>

    <!-- Timeseries mini -->
    <div style="font-family:'Inter',sans-serif;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);margin-bottom:0.6rem;display:flex;align-items:center;gap:8px;">
      <div style="flex-grow:1;height:1px;background:var(--border);"></div>
      VARIASI ΔT BULANAN
      <div style="flex-grow:1;height:1px;background:var(--border);"></div>
    </div>
    <div id="otec-ts-chart" style="height:140px;width:100%"></div>`;

  // -- render bar MCDA --
  const barsEl = document.getElementById("otec-mcda-bars");
  if (barsEl) {
    const criteria = [
      {
        label: "Kedalaman",
        val: depth,
        threshold: 1000,
        unit: "m",
        invert: false,
        fmt: (v) => Math.round(v) + " m",
      },
      {
        label: "ΔT",
        val: dt,
        threshold: minDt,
        unit: "°C",
        invert: false,
        fmt: (v) => v.toFixed(1) + "°C",
      },
      {
        label: "Arus",
        val: cur,
        threshold: 1,
        unit: "m/s",
        invert: true,
        fmt: (v) => v.toFixed(2) + " m/s",
      },
    ];
    barsEl.innerHTML = criteria
      .map(({ label, val, threshold, fmt, invert }) => {
        const ok =
          val != null && (!invert ? val >= threshold : val < threshold);
        const pct =
          val != null
            ? Math.min(
                100,
                invert ? (1 - val / 2) * 100 : (val / (threshold * 1.5)) * 100,
              )
            : 0;
        const barC = ok ? "#3DA87A" : "#C95454";
        return `<div style="margin-bottom:0.8rem">
        <div style="display:flex;justify-content:space-between;font-family:'Inter',sans-serif;font-size:0.65rem;font-weight:600;color:var(--text-main);margin-bottom:0.3rem">
          <span>${label}</span>
          <span style="color:${barC};font-family:'Space Grotesk',sans-serif;font-weight:700;">${val != null ? fmt(val) : "N/A"}</span>
        </div>
        <div style="position:relative;height:6px;border-radius:6px;background:var(--border);overflow:hidden;">
          <div style="position:absolute;left:0;top:0;height:100%;width:${pct}%;background:${barC};border-radius:6px;transition:width 1s cubic-bezier(0.4,0,0.2,1)"></div>
        </div>
      </div>`;
      })
      .join("");
  }

  // -- Timeseries Plotly mini --
  const tsEl = document.getElementById("otec-ts-chart");
  if (tsEl && typeof Plotly !== "undefined" && Array.isArray(TIMESERIES)) {
    const times = TIMESERIES.map((d) => d.time);
    const dtVals = TIMESERIES.map((d) => d.Delta_T);
    const threshLine = times.map(() => minDt);
    Plotly.newPlot(
      tsEl,
      [
        {
          x: times,
          y: dtVals,
          type: "scatter",
          mode: "lines",
          line: { color: "#4a9ebf", width: 1.5 },
          name: "ΔT",
          hovertemplate: "%{x|%b %Y}<br>ΔT: %{y:.2f}°C<extra></extra>",
        },
        {
          x: times,
          y: threshLine,
          type: "scatter",
          mode: "lines",
          line: { color: "rgba(61,168,122,0.5)", width: 1, dash: "dash" },
          name: "min ΔT",
          hoverinfo: "none",
        },
      ],
      {
        margin: { t: 4, r: 6, b: 28, l: 30 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: {
          color: "var(--text-muted)",
          size: 8,
          family: "'JetBrains Mono', monospace",
        },
        xaxis: {
          showgrid: false,
          tickformat: "%Y",
          tickfont: { size: 7 },
          linecolor: "var(--border)",
          tickcolor: "var(--border)",
        },
        yaxis: {
          showgrid: true,
          gridcolor: "var(--border)",
          tickfont: { size: 7 },
          title: { text: "°C", font: { size: 7 } },
        },
        showlegend: false,
      },
      { responsive: true, displayModeBar: false },
    );
  }

  // Tampilkan panel laporan, sembunyikan stats
  document.getElementById("otec-domain-stats").style.display = "none";
  document.getElementById("otec-point-report").style.display = "";
}

function initOtecEval() {
  const m = initMap(
    "oteceval",
    "map-otec-eval",
    null,
    false, // tidak tampilkan garis kontour 1000m
    "#3DA87A",
  );
  if (!m || m.otecInit) return;
  m.otecInit = true;
  updateOtecEvalOverlay();
  refreshDomainStats();
  m.on("click", (e) => {
    const { lat, lng } = e.latlng;
    if (window._otecEvalMarker) m.removeLayer(window._otecEvalMarker);
    window._otecEvalMarker = L.circleMarker([lat, lng], {
      radius: 7,
      fillColor: "#eab308",
      color: "#ffffff",
      weight: 2.5,
      fillOpacity: 1
    }).addTo(m);
    renderOtecFullReport(lat, lng);
  });
}

function initInfrastructure() {
  const m = initMap(
    "infrastructure",
    "map-infrastructure",
    null,
    true, // Restore vector base map for better visibility
  );
  if (!m) return;
  
  if (typeof BATHY_META !== "undefined" && BATHY_META.raster_url) {
    if (window._infraRaster) m.removeLayer(window._infraRaster);
    
    // Fix broken path from BATHY_META by injecting regionId
    let url = BATHY_META.raster_url;
    if (url.startsWith("data/bathy/")) {
      const urlParams = new URLSearchParams(window.location.search);
      const currentRegionId = urlParams.get('region') || 'bali_selatan';
      url = url.replace("data/bathy/", "data/" + currentRegionId + "/bathy/");
    }
    
    window._infraRaster = L.imageOverlay(url, BATHY_META.bounds, {
      opacity: 0.8,
      className: "infra-bathy-monochrome",
      interactive: false
    }).addTo(m);
  }

  // Restore bathymetry contour lines
  if (typeof BATHY_FULL_GEOJSON !== "undefined") {
    if (window._infraVector) m.removeLayer(window._infraVector);
    window._infraVector = L.geoJSON(BATHY_FULL_GEOJSON, {
      style: () => ({
        color: "rgba(255,255,255,0.35)",
        weight: 1,
        fill: false,
      }),
    }).addTo(m);
  }

  setupInfraClick();
}

function setupCategoryNav() {
  const dropdowns = document.querySelectorAll(".nav-dropdown");
  dropdowns.forEach((dd) => {
    const trigger = dd.querySelector(".nav-dropdown-trigger");
    trigger?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = dd.classList.contains("open");
      dropdowns.forEach((d) => {
        d.classList.remove("open");
        d.querySelector(".nav-dropdown-trigger")?.setAttribute(
          "aria-expanded",
          "false",
        );
      });
      if (!isOpen) {
        dd.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
      }
    });
  });
  document.addEventListener("click", () => {
    dropdowns.forEach((d) => {
      d.classList.remove("open");
      d.querySelector(".nav-dropdown-trigger")?.setAttribute(
        "aria-expanded",
        "false",
      );
    });
  });
  document.querySelectorAll(".nav-dropdown-menu").forEach((menu) => {
    menu.addEventListener("click", (e) => e.stopPropagation());
  });
  document.querySelectorAll(".nav-dropdown-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      activatePage(btn.dataset.page);
      dropdowns.forEach((d) => {
        d.classList.remove("open");
        d.querySelector(".nav-dropdown-trigger")?.setAttribute(
          "aria-expanded",
          "false",
        );
      });
    });
  });
}

function setupFloatingPanels() {
  const infoPanel = document.getElementById("info-panel");
  const controlsPanel = document.getElementById("controls-panel");
  const infoFab = document.getElementById("info-panel-expand");
  const ctrlFab = document.getElementById("controls-panel-expand");

  document
    .getElementById("info-panel-collapse")
    ?.addEventListener("click", () => {
      infoPanel?.classList.add("collapsed");
      infoFab?.classList.add("visible");
    });
  infoFab?.addEventListener("click", () => {
    infoPanel?.classList.remove("collapsed");
    infoFab?.classList.remove("visible");
  });
  document
    .getElementById("controls-panel-collapse")
    ?.addEventListener("click", () => {
      controlsPanel?.classList.add("collapsed");
      ctrlFab?.classList.add("visible");
    });
  ctrlFab?.addEventListener("click", () => {
    controlsPanel?.classList.remove("collapsed");
    ctrlFab?.classList.remove("visible");
  });
}

/* ── DOM init ── */
function initApp() {
  document.documentElement.setAttribute("data-theme", "dark");
  if (typeof DELTAT_META !== "undefined") {
    if (DELTAT_META.default_depth_m != null)
      deltaDepthM = DELTAT_META.default_depth_m;
  }

  setupCategoryNav();
  setupFloatingPanels();

  const sb = document.getElementById("sidebar"),
    overlay = document.getElementById("sidebar-overlay");
  const menuToggle = document.getElementById("menu-toggle"),
    sidebarClose = document.getElementById("sidebar-close");
  function openSB() {
    sb?.classList.add("open");
    overlay?.classList.add("open");
  }
  function closeSB() {
    sb?.classList.remove("open");
    overlay?.classList.remove("open");
  }
  menuToggle?.addEventListener("click", openSB);
  sidebarClose?.addEventListener("click", closeSB);
  overlay?.addEventListener("click", closeSB);
  document
    .querySelectorAll(".sidebar-nav a")
    .forEach((l) => l.addEventListener("click", closeSB));

  activatePage("sst_map");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
