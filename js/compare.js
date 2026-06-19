/**
 * compare.js — Compare OTEC Points
 * ====================================
 * Logic for the side-by-side OTEC point comparison page (compare.html).
 *
 * Flow:
 *   1. User selects a region → map zooms in + loads region grids
 *   2. User clicks Point A → marker placed, data extracted
 *   3. User clicks Point B → marker placed, data extracted + comparison rendered
 *   4. Radar chart and metric rows update automatically
 */

'use strict';

// ─── Region registry (mirrors process_regions.py) ──────────────────────────
const REGION_REGISTRY = {
  bali_selatan:       { name: "Selatan Bali",                center: [-9.8,  115.2], zoom: 9 },
  laut_banda:         { name: "Laut Banda",                  center: [-5.65, 123.75],zoom: 9 },
  selat_makassar:     { name: "Selat Makassar",              center: [-2.9,  118.5], zoom: 9 },
  selat_malaka:       { name: "Selat Malaka",                center: [3.0,   100.5], zoom: 9 },
  sulawesi_utara:     { name: "Sulawesi Utara",              center: [1.5,   125.0], zoom: 8 },
  babel:              { name: "Bangka Belitung",             center: [-2.0,  106.9], zoom: 9 },
  flores:             { name: "Laut Flores",                 center: [-8.0,  120.0], zoom: 9 },
  aceh_sabang:        { name: "Aceh (Sabang)",               center: [5.5,   96.5],  zoom: 9 },
  jatim_selatan:      { name: "Jawa Timur (Selatan Malang)", center: [-10.2, 112.8], zoom: 9 },
  jawa_selatan:       { name: "Selatan Jawa",                center: [-8.5,  109.5], zoom: 8 },
  kalbar:             { name: "Kalimantan Barat",            center: [-0.5,  109.2], zoom: 9 },
  mentawai:           { name: "Kepulauan Mentawai",          center: [-2.0,  100.5], zoom: 9 },
  teluk_cenderawasih: { name: "Teluk Cenderawasih (Papua)", center: [-2.0,  135.8], zoom: 9 },
};

// ─── Colors ────────────────────────────────────────────────────────────────
const COLOR_A = '#0EA5E9';
const COLOR_B = '#F59E0B';

// ─── State ─────────────────────────────────────────────────────────────────
let state = {
  regionId:   null,
  grids:      { sst: null, deep_temp: null, delta_t: null, bathy: null, salinity: null },
  ptA:        null,   // { lat, lon, data }
  ptB:        null,
  markerA:    null,
  markerB:    null,
  nextPoint:  'a',    // 'a' | 'b' | null
  map:        null,
};

// ─── DOM refs ──────────────────────────────────────────────────────────────
const regionSelect    = document.getElementById('region-select');
const mapPrompt       = document.getElementById('map-prompt');
const cursorIndicator = document.getElementById('cursor-indicator');
const nextPointBadge  = document.getElementById('next-point-badge');
const resetBtn        = document.getElementById('reset-btn');
const emptyState      = document.getElementById('empty-state');
const compareMetrics  = document.getElementById('compare-metrics');
const chartSection    = document.getElementById('chart-section');
const winnerBanner    = document.getElementById('winner-banner');
const cardA           = document.getElementById('card-a');
const cardB           = document.getElementById('card-b');
const coordsA         = document.getElementById('coords-a');
const coordsB         = document.getElementById('coords-b');
const scoreAWrap      = document.getElementById('score-a-wrap');
const scoreBWrap      = document.getElementById('score-b-wrap');
const scoreA          = document.getElementById('score-a');
const scoreB          = document.getElementById('score-b');

// ─── Populate region dropdown ───────────────────────────────────────────────
(function populateDropdown() {
  Object.entries(REGION_REGISTRY).forEach(([id, cfg]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = cfg.name;
    regionSelect.appendChild(opt);
  });

  // Pre-select from URL param
  const params = new URLSearchParams(window.location.search);
  const reg = params.get('region');
  if (reg && REGION_REGISTRY[reg]) {
    regionSelect.value = reg;
    onRegionChange(reg);
  }
})();

// ─── Init Leaflet Map ───────────────────────────────────────────────────────
function initMap() {
  state.map = L.map('compare-map', {
    center: [-2, 118],
    zoom: 5,
    zoomControl: true,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 18,
  }).addTo(state.map);

  L.control.attribution({ position: 'bottomright', prefix: false })
    .addAttribution('&copy; CARTO | myOTEC')
    .addTo(state.map);

  // Click handler
  state.map.on('click', onMapClick);

  // Cursor style
  state.map.getContainer().style.cursor = 'default';
}

initMap();

// ─── Region change ──────────────────────────────────────────────────────────
regionSelect.addEventListener('change', () => onRegionChange(regionSelect.value));

async function onRegionChange(regionId) {
  if (!regionId || !REGION_REGISTRY[regionId]) return;

  resetPoints();
  state.regionId = regionId;
  const cfg = REGION_REGISTRY[regionId];

  // Fly to region
  state.map.flyTo(cfg.center, cfg.zoom, { duration: 1.2 });

  // Show cursor indicator
  mapPrompt.classList.add('hidden');
  cursorIndicator.classList.remove('hidden');
  nextPointBadge.textContent = 'Klik untuk Titik A';
  nextPointBadge.className = 'cursor-badge a';
  state.map.getContainer().style.cursor = 'crosshair';

  // Load grids
  loadRegionGrids(regionId);
}

// ─── Load JSON grids ────────────────────────────────────────────────────────
async function loadRegionGrids(regionId) {
  const base = `data/${regionId}/`;
  const grids = ['sst_grid', 'deep_temp_grid', 'delta_t_grid', 'bathy_grid', 'salinity_grid'];

  for (const g of grids) {
    try {
      const resp = await fetch(`${base}${g}.json`);
      if (!resp.ok) throw new Error(resp.status);
      const key = g.replace('_grid', '').replace('_', '');
      // Map to state key
      const stateKey = g === 'sst_grid'       ? 'sst'
                     : g === 'deep_temp_grid'  ? 'deep_temp'
                     : g === 'delta_t_grid'    ? 'delta_t'
                     : g === 'bathy_grid'      ? 'bathy'
                     : 'salinity';
      state.grids[stateKey] = await resp.json();
    } catch {
      // Grid file not available — leave null
    }
  }

  // Fallback: try to load region_meta.json for static summary data
  try {
    const resp = await fetch(`data/${regionId}/region_meta.json`);
    if (resp.ok) state.grids.meta = await resp.json();
  } catch {}
}

// ─── Map click handler ──────────────────────────────────────────────────────
function onMapClick(e) {
  if (!state.regionId) return;

  const { lat, lng } = e.latlng;
  const data = extractPointData(lat, lng);

  if (state.nextPoint === 'a') {
    placeMarker('a', lat, lng, data);
    state.ptA = { lat, lon: lng, data };
    coordsA.innerHTML = `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
    coordsA.className = 'pc-coords';
    cardA.classList.add('selected');

    state.nextPoint = 'b';
    nextPointBadge.textContent = 'Klik untuk Titik B';
    nextPointBadge.className = 'cursor-badge b';

  } else if (state.nextPoint === 'b') {
    placeMarker('b', lat, lng, data);
    state.ptB = { lat, lon: lng, data };
    coordsB.innerHTML = `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
    coordsB.className = 'pc-coords';
    cardB.classList.add('selected');

    state.nextPoint = null;
    cursorIndicator.classList.add('hidden');
    state.map.getContainer().style.cursor = 'default';

    // Render comparison
    renderComparison();
  }
}

// ─── Create map marker ──────────────────────────────────────────────────────
function makeIcon(label, color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:32px; height:32px; border-radius:50%;
      background:${color}; border:3px solid #fff;
      display:flex; align-items:center; justify-content:center;
      font-weight:800; font-size:13px; color:#fff;
      box-shadow:0 3px 12px rgba(0,0,0,0.5);
      font-family:'Space Grotesk',sans-serif;
    ">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function placeMarker(pt, lat, lng, data) {
  const color = pt === 'a' ? COLOR_A : COLOR_B;
  const label = pt === 'a' ? 'A' : 'B';
  const existing = pt === 'a' ? state.markerA : state.markerB;

  if (existing) state.map.removeLayer(existing);

  const marker = L.marker([lat, lng], { icon: makeIcon(label, color) })
    .addTo(state.map)
    .bindTooltip(buildTooltip(label, lat, lng, data), { permanent: false, direction: 'top' });

  if (pt === 'a') state.markerA = marker;
  else            state.markerB = marker;
}

function buildTooltip(label, lat, lng, data) {
  const sst   = data.sst      != null ? `SST: ${data.sst.toFixed(1)}°C` : '';
  const dt    = data.delta_t  != null ? `ΔT: ${data.delta_t.toFixed(1)}°C` : '';
  const depth = data.bathy    != null ? `Kedalaman: ${Math.abs(data.bathy).toFixed(0)}m` : '';
  return `<b>Titik ${label}</b><br>${[sst,dt,depth].filter(Boolean).join('<br>')}`;
}

// ─── Extract data at lat/lon from grid ─────────────────────────────────────
function bilinearInterp(grid, lat, lon) {
  if (!grid || !grid.lat || !grid.lon) return null;
  const lats = grid.lat;
  const lons = grid.lon;
  const values = grid.values || grid.depth;

  if (!values) return null;

  // Find nearest indices
  let ri = lats.reduce((best, v, i) => Math.abs(v - lat) < Math.abs(lats[best] - lat) ? i : best, 0);
  let ci = lons.reduce((best, v, i) => Math.abs(v - lon) < Math.abs(lons[best] - lon) ? i : best, 0);

  if (!values[ri] || values[ri][ci] == null) return null;
  return values[ri][ci];
}

function extractPointData(lat, lon) {
  return {
    sst:      bilinearInterp(state.grids.sst,      lat, lon),
    deep_temp:bilinearInterp(state.grids.deep_temp, lat, lon),
    delta_t:  bilinearInterp(state.grids.delta_t,  lat, lon),
    bathy:    bilinearInterp(state.grids.bathy,     lat, lon),
    salinity: bilinearInterp(state.grids.salinity,  lat, lon),
  };
}

// ─── OTEC Score (0–100) ─────────────────────────────────────────────────────
function calcOtecScore(data) {
  if (!data) return null;
  let score = 0;
  let weight = 0;

  // ΔT (most important, max 40 pts)
  if (data.delta_t != null) {
    const dt = data.delta_t;
    score  += Math.min(40, Math.max(0, (dt / 25) * 40));
    weight += 40;
  }
  // Depth (deeper = better for cold water pipe, max 25 pts)
  if (data.bathy != null) {
    const d = Math.abs(data.bathy);
    score  += Math.min(25, (d / 1000) * 25);
    weight += 25;
  }
  // SST (warmer surface = better, max 20 pts)
  if (data.sst != null) {
    score  += Math.min(20, Math.max(0, ((data.sst - 26) / 4) * 20));
    weight += 20;
  }
  // Salinity (higher = denser cold water, max 15 pts)
  if (data.salinity != null) {
    const sal = data.salinity;
    score  += Math.min(15, Math.max(0, ((sal - 33) / 3) * 15));
    weight += 15;
  }

  if (weight === 0) return null;
  return Math.round((score / weight) * 100);
}

// ─── Render comparison ──────────────────────────────────────────────────────
function renderComparison() {
  if (!state.ptA || !state.ptB) return;

  const dA = state.ptA.data;
  const dB = state.ptB.data;
  const sA = calcOtecScore(dA);
  const sB = calcOtecScore(dB);

  // Scores
  if (sA != null) {
    scoreA.textContent = sA;
    scoreAWrap.style.display = 'flex';
  }
  if (sB != null) {
    scoreB.textContent = sB;
    scoreBWrap.style.display = 'flex';
  }

  // Winner banner
  winnerBanner.className = 'winner-banner';
  if (sA != null && sB != null) {
    if (sA > sB) {
      winnerBanner.textContent = `🏆 Titik A lebih potensial (${sA} vs ${sB})`;
      winnerBanner.classList.add('show-a');
    } else if (sB > sA) {
      winnerBanner.textContent = `🏆 Titik B lebih potensial (${sB} vs ${sA})`;
      winnerBanner.classList.add('show-b');
    } else {
      winnerBanner.textContent = 'Kedua titik memiliki potensi OTEC yang setara';
      winnerBanner.classList.add('show-a');
    }
  }

  // Metric rows
  emptyState.style.display = 'none';
  compareMetrics.innerHTML = buildMetricRows(dA, dB);

  // Radar chart
  chartSection.style.display = 'block';
  renderRadar(dA, dB, sA, sB);
}

function fmt(val, unit, decimals = 1) {
  if (val == null) return '—';
  return `${val.toFixed(decimals)} ${unit}`.trim();
}

function buildMetricRows(dA, dB) {
  const metrics = [
    { label: 'SST (°C)',         keyA: 'sst',       keyB: 'sst',       unit: '°C',  higherWins: true,  group: 'Termal' },
    { label: 'Deep Temp (°C)',   keyA: 'deep_temp',  keyB: 'deep_temp', unit: '°C',  higherWins: false, group: 'Termal' },
    { label: 'Delta T (°C)',     keyA: 'delta_t',    keyB: 'delta_t',   unit: '°C',  higherWins: true,  group: 'Termal' },
    { label: 'Kedalaman (m)',    keyA: 'bathy',      keyB: 'bathy',     unit: 'm',   higherWins: true,  group: 'Fisik', transform: v => Math.abs(v) },
    { label: 'Salinitas (psu)', keyA: 'salinity',   keyB: 'salinity',  unit: 'psu', higherWins: true,  group: 'Fisik' },
  ];

  const groups = [...new Set(metrics.map(m => m.group))];
  let html = '';

  groups.forEach(grp => {
    html += `<div class="metric-group-title">${grp}</div>`;
    metrics.filter(m => m.group === grp).forEach(m => {
      let vA = dA[m.keyA];
      let vB = dB[m.keyB];
      if (m.transform) { vA = vA != null ? m.transform(vA) : null; vB = vB != null ? m.transform(vB) : null; }

      const winA = vA != null && vB != null && (m.higherWins ? vA > vB : vA < vB);
      const winB = vA != null && vB != null && (m.higherWins ? vB > vA : vB < vA);

      html += `
        <div class="metric-row">
          <div class="m-val-a ${winA ? 'winner' : ''}">${fmt(vA, m.unit)}</div>
          <div class="m-label">${m.label}</div>
          <div class="m-val-b ${winB ? 'winner' : ''}">${fmt(vB, m.unit)}</div>
        </div>`;
    });
  });

  return html;
}

// ─── Radar chart (Plotly) ───────────────────────────────────────────────────
function renderRadar(dA, dB, sA, sB) {
  const categories = ['SST', 'Deep\nTemp', 'Delta T', 'Kedalaman', 'Salinitas', 'OTEC\nScore'];

  // Normalize values to 0–100 scale
  function norm(val, min, max) {
    if (val == null) return 0;
    return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  }

  const rA = [
    norm(dA.sst,       26, 32),
    norm(100 - (dA.deep_temp || 0), 0, 100),  // lower deep temp = better
    norm(dA.delta_t,   15, 26),
    norm(Math.abs(dA.bathy || 0), 0, 2000),
    norm(dA.salinity,  33, 36),
    sA || 0,
  ];
  const rB = [
    norm(dB.sst,       26, 32),
    norm(100 - (dB.deep_temp || 0), 0, 100),
    norm(dB.delta_t,   15, 26),
    norm(Math.abs(dB.bathy || 0), 0, 2000),
    norm(dB.salinity,  33, 36),
    sB || 0,
  ];

  const trace = (r, color, name) => ({
    type: 'scatterpolar',
    r: [...r, r[0]],
    theta: [...categories, categories[0]],
    fill: 'toself',
    name,
    line: { color, width: 2 },
    fillcolor: color.replace(')', ',0.15)').replace('rgb', 'rgba'),
    marker: { size: 5, color },
  });

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'transparent',
    polar: {
      bgcolor: 'transparent',
      radialaxis: {
        visible: true, range: [0, 100],
        gridcolor: 'rgba(148,163,184,0.15)',
        tickfont: { size: 8, color: '#64748b' },
        tickvals: [20, 40, 60, 80, 100],
      },
      angularaxis: {
        tickfont: { size: 9, color: '#94a3b8', family: 'Inter, sans-serif' },
        gridcolor: 'rgba(148,163,184,0.12)',
        linecolor: 'rgba(148,163,184,0.2)',
      },
    },
    legend: {
      font: { size: 10, color: '#94a3b8', family: 'Inter, sans-serif' },
      bgcolor: 'transparent',
      x: 0.35, y: -0.05,
      orientation: 'h',
    },
    margin: { t: 10, r: 20, b: 20, l: 20 },
  };

  Plotly.react('radar-chart',
    [trace(rA, COLOR_A, 'Titik A'), trace(rB, COLOR_B, 'Titik B')],
    layout,
    { responsive: true, displayModeBar: false }
  );
}

// ─── Reset ──────────────────────────────────────────────────────────────────
function resetPoints() {
  if (state.markerA) { state.map.removeLayer(state.markerA); state.markerA = null; }
  if (state.markerB) { state.map.removeLayer(state.markerB); state.markerB = null; }

  state.ptA = null;
  state.ptB = null;
  state.grids = { sst: null, deep_temp: null, delta_t: null, bathy: null, salinity: null };
  state.nextPoint = 'a';

  coordsA.textContent = 'Belum dipilih'; coordsA.className = 'pc-empty';
  coordsB.textContent = 'Belum dipilih'; coordsB.className = 'pc-empty';
  scoreAWrap.style.display = 'none';
  scoreBWrap.style.display = 'none';
  cardA.classList.remove('selected');
  cardB.classList.remove('selected');
  winnerBanner.className = 'winner-banner';
  emptyState.style.display = '';
  chartSection.style.display = 'none';
  compareMetrics.innerHTML = `<div class="empty-state" id="empty-state">
    <div class="es-icon">📍</div>
    <p>Klik dua titik di peta untuk melihat<br>perbandingan parameter OTEC.</p>
  </div>`;
  if (state.regionId) {
    cursorIndicator.classList.remove('hidden');
    nextPointBadge.textContent = 'Klik untuk Titik A';
    nextPointBadge.className = 'cursor-badge a';
    state.map.getContainer().style.cursor = 'crosshair';
  }
}

resetBtn.addEventListener('click', resetPoints);

// ─── Initial state ──────────────────────────────────────────────────────────
if (!regionSelect.value) {
  mapPrompt.classList.remove('hidden');
  cursorIndicator.classList.add('hidden');
}
