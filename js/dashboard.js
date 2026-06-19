/* ═══════════════════════════════════════════
   dashboard.js — myOTEC Map Dashboard
   ═══════════════════════════════════════════ */

// ── Study Regions ──
const REGIONS = [
  {
    key: 'BALI', regionId: 'bali_selatan', name: 'Selatan Bali', rank: '#1',
    deltaT: 25.2, depth: '>3000m', sst: '29.3',
    status: 'good', statusText: 'SANGAT POTENSIAL',
    hasAnalysis: true, latlng: [-9.8, 115.2],
    desc: 'Perairan selatan Bali memiliki gradien termal tinggi dan kedalaman memadai untuk instalasi OTEC.'
  },
  {
    key: 'SULAWESI TENGGARA', regionId: 'laut_banda', name: 'Laut Banda', rank: '#2',
    deltaT: 23.8, depth: '>4000m', sst: '28.9',
    status: 'good', statusText: 'SANGAT POTENSIAL',
    hasAnalysis: true, latlng: [-5.65, 123.75],
    desc: 'Laut Banda merupakan salah satu cekungan laut terdalam di Indonesia dengan potensi OTEC tinggi.'
  },
  {
    key: 'JAWA TIMUR', regionId: 'jatim_selatan', name: 'Selatan Jawa Timur', rank: '#3',
    deltaT: 23.5, depth: '>3000m', sst: '29.1',
    status: 'good', statusText: 'SANGAT POTENSIAL',
    hasAnalysis: true, latlng: [-10.2, 112.8],
    desc: 'Selatan Jawa Timur memiliki kedalaman laut yang curam dari palung laut selatan Jawa.'
  },
  {
    key: 'NUSA TENGGARA TIMUR', regionId: 'flores', name: 'Laut Flores', rank: '#4',
    deltaT: 23.1, depth: '>2500m', sst: '28.7',
    status: 'good', statusText: 'SANGAT POTENSIAL',
    hasAnalysis: true, latlng: [-8.0, 120.0],
    desc: 'Perairan Laut Flores memiliki topografi dasar laut yang ideal untuk instalasi OTEC.'
  },
  {
    key: 'SUMATERA BARAT', regionId: 'mentawai', name: 'Kepulauan Mentawai', rank: '#5',
    deltaT: 23.0, depth: '>3000m', sst: '28.8',
    status: 'good', statusText: 'SANGAT POTENSIAL',
    hasAnalysis: true, latlng: [-2.0, 100.5],
    desc: 'Kepulauan Mentawai dekat dengan palung samudera sehingga profil termalnya sangat baik.'
  },
  {
    key: 'IRIAN JAYA TENGAH', regionId: 'teluk_cenderawasih', name: 'Teluk Cenderawasih', rank: '#6',
    deltaT: 22.8, depth: '>2000m', sst: '29.2',
    status: 'good', statusText: 'POTENSIAL',
    hasAnalysis: true, latlng: [-2.0, 135.8],
    desc: 'Teluk Cenderawasih di Papua menjanjikan kondisi termal stabil dan laut dalam.'
  },
  {
    key: 'SULAWESI SELATAN', regionId: 'selat_makassar', name: 'Selat Makassar', rank: '#7',
    deltaT: 22.8, depth: '>2500m', sst: '28.6',
    status: 'good', statusText: 'POTENSIAL',
    hasAnalysis: true, latlng: [-2.9, 118.5],
    desc: 'Selat Makassar memiliki profil kedalaman laut yang curam sehingga cocok untuk OTEC.'
  },
  {
    key: 'SULAWESI UTARA', regionId: 'sulawesi_utara', name: 'Sulawesi Utara', rank: '#8',
    deltaT: 22.5, depth: '>2000m', sst: '28.5',
    status: 'good', statusText: 'POTENSIAL',
    hasAnalysis: true, latlng: [1.5, 125.0],
    desc: 'Perairan utara Sulawesi memiliki akses ke kedalaman signifikan di Laut Sulawesi.'
  },
  {
    key: 'JAWA TENGAH', regionId: 'jawa_selatan', name: 'Selatan Jawa Tengah', rank: '#9',
    deltaT: 22.5, depth: '>2500m', sst: '28.9',
    status: 'good', statusText: 'POTENSIAL',
    hasAnalysis: true, latlng: [-8.5, 109.5],
    desc: 'Pantai selatan Jawa Tengah memiliki akses laut dalam dan kondisi termal mendukung.'
  },
  {
    key: 'DI. ACEH', regionId: 'aceh_sabang', name: 'Aceh (Sabang)', rank: '#10',
    deltaT: 22.0, depth: '>2000m', sst: '29.0',
    status: 'good', statusText: 'POTENSIAL',
    hasAnalysis: true, latlng: [5.5, 96.5],
    desc: 'Perairan di sekitar Sabang, Aceh, berpotensi baik untuk instalasi OTEC.'
  },
  {
    key: 'BANGKA BELITUNG', regionId: 'babel', name: 'Bangka Belitung', rank: '#11',
    deltaT: 19.5, depth: '<500m', sst: '28.8',
    status: 'medium', statusText: 'SEDANG',
    hasAnalysis: true, latlng: [-2.0, 106.9],
    desc: 'Perairan Bangka Belitung menawarkan potensi termal menengah karena kedalaman dangkal.'
  },
  {
    key: 'RIAU', regionId: 'selat_malaka', name: 'Selat Malaka', rank: '#12',
    deltaT: 18.5, depth: '<200m', sst: '29.0',
    status: 'medium', statusText: 'KURANG POTENSIAL',
    hasAnalysis: true, latlng: [3.0, 100.5],
    desc: 'Selat Malaka berpotensi kurang optimal karena kedalamannya sangat terbatas.'
  },
  {
    key: 'KALIMANTAN BARAT', regionId: 'kalbar', name: 'Kalimantan Barat', rank: '#13',
    deltaT: 18.0, depth: '<500m', sst: '29.0',
    status: 'medium', statusText: 'KURANG POTENSIAL',
    hasAnalysis: true, latlng: [-0.5, 109.2],
    desc: 'Perairan dangkal Kalimantan Barat kurang ideal untuk instalasi OTEC laut dalam.'
  }
];

const REGION_MAP = {};
REGIONS.forEach(r => {
  if (Array.isArray(r.key)) r.key.forEach(k => REGION_MAP[k] = r);
  else REGION_MAP[r.key] = r;
});

// ── Popup Builder ──
function createPopup(r) {
  const badgeClass = r.status === 'good' ? 'good' : r.status === 'medium' ? 'medium' : 'bad';
  const linkHtml = r.hasAnalysis
    ? `<div style="display:flex;gap:4px;width:100%"><a href="analysis.html?region=${r.regionId}" class="popup-link" style="flex:1;text-align:center;padding:6px 0;font-size:0.75rem;">ANALISIS</a><a href="compare.html?region=${r.regionId}" class="popup-link" style="flex:1;text-align:center;padding:6px 0;font-size:0.75rem;">COMPARE</a></div>`
    : `<div class="popup-coming">Data analisis segera hadir</div>`;

  return `
    <div class="popup-content">
      <div class="popup-title">${r.name}</div>
      <div class="popup-desc">${r.desc}</div>
      <div class="popup-row"><span class="popup-label">DELTA-T</span><span class="popup-value">${r.deltaT} &deg;C</span></div>
      <div class="popup-row"><span class="popup-label">SST</span><span class="popup-value">${r.sst} &deg;C</span></div>
      <div class="popup-row"><span class="popup-label">KEDALAMAN</span><span class="popup-value">${r.depth}</span></div>
      <div class="popup-status"><span class="status-badge ${badgeClass}">${r.statusText}</span></div>
      ${linkHtml}
    </div>`;
}

// ── Region List Sidebar ──
function renderRegionList() {
  const container = document.getElementById('region-list');
  if (!container) return;

  const maxDT = Math.max(...REGIONS.map(r => r.deltaT));

  container.innerHTML = REGIONS.map(r => {
    const badgeClass = r.status === 'good' ? 'good' : 'medium';
    const barColor = r.status === 'good' ? 'var(--success)' : 'var(--warning)';
    const barWidth = ((r.deltaT / maxDT) * 100).toFixed(0);
    const actionText = r.hasAnalysis 
        ? `<div style="display:flex; gap:8px; margin-top:12px;">
             <a href="analysis.html?region=${r.regionId}" class="region-action" style="flex:1; justify-content:center; text-align:center;">ANALISIS</a>
             <a href="compare.html?region=${r.regionId}" class="region-action" style="flex:1; justify-content:center; text-align:center;">COMPARE</a>
           </div>` 
        : `<span class="region-action disabled">SEGERA HADIR</span>`;

    return `
      <div class="region-item" data-key="${r.key}">
        <div class="region-item-header">
          <span class="region-rank">${r.rank}</span>
          <span class="region-badge ${badgeClass}">${r.statusText}</span>
        </div>
        <div class="region-name">${r.name}</div>
        <div class="region-meta">
          <div class="region-meta-item"><span>DELTA-T</span><span>${r.deltaT}&deg;C</span></div>
          <div class="region-meta-item"><span>DEPTH</span><span>${r.depth}</span></div>
        </div>
        <div class="region-dt-bar"><div class="region-dt-fill" style="width:${barWidth}%;background:${barColor}"></div></div>
        ${actionText}
      </div>`;
  }).join('');

  // Click handler: fly to region on map + open popup
  container.querySelectorAll('.region-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't intercept the "Lihat Analisis" link
      if (e.target.closest('.region-action')) return;
      const key = item.dataset.key;
      const r = REGION_MAP[key];
      if (r && window._map) {
        window._map.flyTo(r.latlng, 7, { duration: 0.8 });
        setTimeout(() => {
          L.popup({ className: 'custom-popup', maxWidth: 300, closeButton: true })
            .setLatLng(r.latlng)
            .setContent(createPopup(r))
            .openOn(window._map);
        }, 400);
      }
    });
  });
}

// ── Map Init ──
document.addEventListener('DOMContentLoaded', () => {

  const map = L.map('map-dashboard', {
    center: [-2.5, 118],
    zoom: 5,
    zoomControl: false,
    attributionControl: true
  });
  window._map = map;

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OSM &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // GeoJSON
  function styleFeature(feature) {
    const name = feature.properties.Propinsi || '';
    const r = REGION_MAP[name];
    if (r) {
      const color = r.status === 'good' ? '#4A9EBF' : '#C9A84C';
      return {
        fillColor: color,
        color: color,
        weight: 2,
        fillOpacity: 0.18,
        dashArray: ''
      };
    }
    return {
      fillColor: '#111D2B',
      color: '#2A3A4A',
      weight: 0.5,
      fillOpacity: 0.06,
      dashArray: '3'
    };
  }

  const geojsonLayer = L.geoJSON(PROVINCES_GEOJSON, {
    style: styleFeature,
    onEachFeature: function (feature, layer) {
      const name = feature.properties.Propinsi || '';
      const r = REGION_MAP[name];

      layer.bindTooltip(name, {
        className: 'province-tooltip',
        sticky: true,
        direction: 'top',
        offset: [0, -10]
      });

      layer.on({
        mouseover: function (e) {
          if (r) {
            const color = r.status === 'good' ? '#6BB8D4' : '#D4B85A';
            e.target.setStyle({
              fillColor: color, color: color,
              weight: 3, fillOpacity: 0.35
            });
          } else {
            e.target.setStyle({
              fillColor: '#1C2D42', color: '#3A4A5A',
              weight: 1, fillOpacity: 0.1
            });
          }
          e.target.bringToFront();
        },
        mouseout: function (e) {
          geojsonLayer.resetStyle(e.target);
        },
        click: function (e) {
          if (r) {
            L.popup({ className: 'custom-popup', maxWidth: 300, closeButton: true })
              .setLatLng(e.latlng)
              .setContent(createPopup(r))
              .openOn(map);
          }
        }
      });
    }
  }).addTo(map);

  // Render sidebar region list
  renderRegionList();

  // ── Sidebar Nav ──
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const menuToggle = document.getElementById('menu-toggle');
  const sidebarClose = document.getElementById('sidebar-close');

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (menuToggle) menuToggle.addEventListener('click', openSidebar);
  if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    link.addEventListener('click', closeSidebar);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });

  // ── Theme Toggle ──
  function getTheme() { return localStorage.getItem('myotec-theme') || 'dark'; }
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('myotec-theme', theme);
  }
  setTheme(getTheme());

  document.querySelectorAll('#theme-toggle-sidebar, #theme-toggle-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  });

  // ── Navbar scroll ──
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });
});
