/* ═══════════════════════════════════════════
   dynamic_controls.js — Interactive Map Styling
   Opacity sliders, color palette selection
   ═══════════════════════════════════════════ */

const DynamicControls = (() => {
  'use strict';

  // ── Color Scales ──
  const COLOR_SCALES = {
    thermal: {
      name: 'Thermal',
      colors: ['#313695', '#4575B4', '#74ADD1', '#ABD9E9', '#FEE090', '#FDAE61', '#F46D43', '#D73027', '#A50026'],
      gradient: 'linear-gradient(to right, #313695, #4575B4, #74ADD1, #ABD9E9, #FEE090, #FDAE61, #F46D43, #D73027, #A50026)'
    },
    viridis: {
      name: 'Viridis',
      colors: ['#440154', '#482777', '#3F4A8A', '#31678E', '#26838F', '#1F9D8A', '#6CCE59', '#B6DE2B', '#FEE825'],
      gradient: 'linear-gradient(to right, #440154, #482777, #3F4A8A, #31678E, #26838F, #1F9D8A, #6CCE59, #B6DE2B, #FEE825)'
    },
    blues: {
      name: 'Ocean Blues',
      colors: ['#08306B', '#08519C', '#2171B5', '#4292C6', '#6BAED6', '#9ECAE1', '#C6DBEF', '#DEEBF7', '#F7FBFF'],
      gradient: 'linear-gradient(to right, #08306B, #2171B5, #6BAED6, #C6DBEF, #F7FBFF)'
    },
    plasma: {
      name: 'Plasma',
      colors: ['#0D0887', '#46039F', '#7201A8', '#9C179E', '#BD3786', '#D8576B', '#ED7953', '#FB9F3A', '#FDCA26'],
      gradient: 'linear-gradient(to right, #0D0887, #7201A8, #BD3786, #ED7953, #FDCA26)'
    },
    depth: {
      name: 'Depth',
      colors: ['#0C1929', '#1E3A5F', '#3D6B8E', '#7EB8C9', '#C4A035', '#6B8F3C', '#1A4D2E'],
      gradient: 'linear-gradient(to right, #0C1929, #1E3A5F, #7EB8C9, #C4A035, #1A4D2E)'
    }
  };

  let _activeScale = 'thermal';
  let _opacity = 0.7;
  let _onChangeCallback = null;

  // ── Interpolate color from scale ──
  function interpolateColor(value, min, max, scaleName) {
    const scale = COLOR_SCALES[scaleName || _activeScale];
    if (!scale) return '#888888';

    const t = Math.max(0, Math.min(1, (value - min) / (max - min + 1e-9)));
    const colors = scale.colors;
    const idx = t * (colors.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, colors.length - 1);
    const frac = idx - lo;

    return lerpHex(colors[lo], colors[hi], frac);
  }

  function lerpHex(a, b, t) {
    const ar = parseInt(a.slice(1, 3), 16);
    const ag = parseInt(a.slice(3, 5), 16);
    const ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16);
    const bg = parseInt(b.slice(3, 5), 16);
    const bb = parseInt(b.slice(5, 7), 16);

    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);

    return '#' + [r, g, bl].map(c => c.toString(16).padStart(2, '0')).join('');
  }

  // ── Apply color scale to a Leaflet GeoJSON layer ──
  function applyColorScale(layer, valueProperty, min, max, scaleName) {
    try {
      if (!layer || !layer.eachLayer) return;

      layer.eachLayer(function (featureLayer) {
        const props = featureLayer.feature && featureLayer.feature.properties;
        if (!props) return;

        const val = props[valueProperty];
        if (val == null || isNaN(val)) return;

        const color = interpolateColor(val, min, max, scaleName);
        featureLayer.setStyle({
          fillColor: color,
          fillOpacity: _opacity,
          color: color,
          weight: 0.5
        });
      });

      console.log('[DynamicControls] Applied color scale:', scaleName || _activeScale,
        'opacity:', _opacity, 'range:', min, '-', max);
    } catch (err) {
      console.warn('[DynamicControls] applyColorScale error:', err.message);
    }
  }

  // ── Set layer opacity ──
  function setLayerOpacity(layer, opacity) {
    try {
      _opacity = opacity;
      if (layer && layer.eachLayer) {
        layer.eachLayer(function (featureLayer) {
          if (featureLayer.setStyle) {
            featureLayer.setStyle({ fillOpacity: opacity });
          }
        });
      }
      console.log('[DynamicControls] Opacity:', opacity);
    } catch (err) {
      console.warn('[DynamicControls] setLayerOpacity error:', err.message);
    }
  }

  // ── Render Controls into a container ──
  function renderControls(containerId, options) {
    try {
      const container = document.getElementById(containerId);
      if (!container) return;

      const opts = options || {};
      const showOpacity = opts.showOpacity !== false;
      const showPalette = opts.showPalette !== false;

      let html = '';

      // Opacity Slider
      if (showOpacity) {
        html += `
          <div class="control-slider-group">
            <label>
              <span>Opacity Layer</span>
              <span class="slider-value" id="ctrl-opacity-val">${Math.round(_opacity * 100)}%</span>
            </label>
            <input type="range" id="ctrl-opacity" min="10" max="100" value="${Math.round(_opacity * 100)}" step="5">
          </div>
        `;
      }

      // Color Palette
      if (showPalette) {
        html += `
          <div class="control-group">
            <label>Skema Warna</label>
            <div class="color-palette-selector" id="ctrl-palette">
        `;
        for (const [key, scale] of Object.entries(COLOR_SCALES)) {
          const activeClass = key === _activeScale ? 'active' : '';
          html += `<button class="color-palette-btn ${activeClass}" data-palette="${key}" 
            style="background:${scale.gradient}" title="${scale.name}"></button>`;
        }
        html += `
            </div>
          </div>
        `;
      }

      container.insertAdjacentHTML('beforeend', html);

      // Wire events
      if (showOpacity) {
        const slider = document.getElementById('ctrl-opacity');
        const valLabel = document.getElementById('ctrl-opacity-val');
        if (slider) {
          slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value) / 100;
            _opacity = val;
            if (valLabel) valLabel.textContent = e.target.value + '%';
            if (_onChangeCallback) _onChangeCallback({ type: 'opacity', value: val });
          });
        }
      }

      if (showPalette) {
        const paletteBtns = document.querySelectorAll('#ctrl-palette .color-palette-btn');
        paletteBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            paletteBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _activeScale = btn.dataset.palette;
            if (_onChangeCallback) _onChangeCallback({ type: 'palette', value: _activeScale });
          });
        });
      }

    } catch (err) {
      console.warn('[DynamicControls] renderControls error:', err.message);
    }
  }

  // ── Set change callback ──
  function onChange(callback) {
    _onChangeCallback = callback;
  }

  // ── Getters ──
  function getOpacity() { return _opacity; }
  function getActiveScale() { return _activeScale; }
  function getScale(name) { return COLOR_SCALES[name]; }

  return {
    interpolateColor,
    applyColorScale,
    setLayerOpacity,
    renderControls,
    onChange,
    getOpacity,
    getActiveScale,
    getScale,
    COLOR_SCALES
  };
})();
