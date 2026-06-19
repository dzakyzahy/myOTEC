/* ═══════════════════════════════════════════
   ai_analysis.js — myOTEC AI Analysis Module
   FAIL-SAFE: Never blocks or crashes main app
   ═══════════════════════════════════════════ */

const AIAnalysis = (() => {
  'use strict';

  // ── State ──
  let _status = 'unknown'; // 'online' | 'offline' | 'error' | 'unknown'
  let _panelOpen = false;
  const API_ENDPOINT = '/api/ai-analyze';
  const TIMEOUT_MS = 5000;

  // ── Analyze (with full fail-safe) ──
  async function analyze(regionData) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regionData || {}),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }

      const data = await res.json();

      if (data.status === 'offline') {
        _status = 'offline';
        return data;
      }

      _status = 'online';
      return data;

    } catch (err) {
      // Graceful degradation — never throw
      console.warn('[AI Analysis] Offline:', err.message || 'unknown error');
      _status = 'offline';
      return {
        status: 'offline',
        message: 'AI Agent belum terdeteksi. Melanjutkan mode dashboard standar.'
      };
    }
  }

  // ── Render AI Panel UI ──
  function renderPanel() {
    try {
      // Create FAB button
      const fab = document.createElement('button');
      fab.className = 'ai-fab';
      fab.id = 'ai-fab';
      fab.setAttribute('aria-label', 'AI Analysis');
      fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93V12h2.75a2.5 2.5 0 0 1 2.5 2.5V16a4 4 0 1 1-2 0v-1.5a.5.5 0 0 0-.5-.5H8.5a.5.5 0 0 0-.5.5V16a4 4 0 1 1-2 0v-1.5A2.5 2.5 0 0 1 8.5 12h2.75V9.93A4.001 4.001 0 0 1 8 6a4 4 0 0 1 4-4z"/></svg>';

      // Create panel
      const panel = document.createElement('div');
      panel.className = 'ai-panel collapsed';
      panel.id = 'ai-panel';
      panel.innerHTML = `
        <div class="ai-panel-header">
          <h4>
            <span class="ai-status-dot offline" id="ai-status-dot"></span>
            AI Analysis
          </h4>
          <button type="button" class="float-panel-toggle" id="ai-panel-close" aria-label="Tutup">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="ai-panel-body" id="ai-panel-body">
          <div class="ai-offline-msg" id="ai-msg">
            <div class="ai-icon">&#x1F916;</div>
            <h5>AI Agent Tidak Tersedia</h5>
            <p>Fitur AI Analysis sedang dalam pengembangan atau API Key belum dikonfigurasi. Dashboard oseanografi tetap berjalan normal.</p>
          </div>
        </div>
        <div class="ai-panel-footer">
          <button class="ai-analyze-btn" id="ai-analyze-btn" disabled>
            Analisis AI
          </button>
        </div>
      `;

      document.body.appendChild(fab);
      document.body.appendChild(panel);

      // Event: Toggle panel
      fab.addEventListener('click', () => {
        togglePanel(true);
      });

      const closeBtn = document.getElementById('ai-panel-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          togglePanel(false);
        });
      }

      // Event: Analyze button
      const analyzeBtn = document.getElementById('ai-analyze-btn');
      if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
          analyzeBtn.disabled = true;
          analyzeBtn.textContent = 'Memproses...';

          const result = await analyze({});

          if (result.status === 'online' && result.analysis) {
            updatePanelContent(result.analysis);
            updateStatusDot('online');
          } else {
            updateStatusDot('offline');
            analyzeBtn.textContent = 'AI Tidak Tersedia';
          }
        });
      }

      // Auto-check status on load (non-blocking)
      setTimeout(() => {
        checkStatus();
      }, 2000);

    } catch (err) {
      console.warn('[AI Analysis] Panel render failed:', err.message);
      // Fail silently — don't affect the rest of the app
    }
  }

  function togglePanel(open) {
    try {
      const panel = document.getElementById('ai-panel');
      const fab = document.getElementById('ai-fab');
      if (!panel || !fab) return;

      _panelOpen = open;
      if (open) {
        panel.classList.remove('collapsed');
        fab.classList.add('hidden');
      } else {
        panel.classList.add('collapsed');
        fab.classList.remove('hidden');
      }
    } catch (err) {
      console.warn('[AI Analysis] Toggle failed:', err.message);
    }
  }

  function updateStatusDot(status) {
    try {
      const dot = document.getElementById('ai-status-dot');
      if (!dot) return;
      dot.className = 'ai-status-dot ' + status;
    } catch (err) {
      // silent
    }
  }

  function updatePanelContent(html) {
    try {
      const body = document.getElementById('ai-panel-body');
      if (body) {
        body.innerHTML = '<div style="font-size:0.85rem;line-height:1.7;color:var(--text-secondary)">' + html + '</div>';
      }
    } catch (err) {
      // silent
    }
  }

  async function checkStatus() {
    try {
      const result = await analyze({});
      if (result.status === 'online') {
        updateStatusDot('online');
        const btn = document.getElementById('ai-analyze-btn');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Analisis AI';
        }
      } else {
        updateStatusDot('offline');
      }
    } catch (err) {
      updateStatusDot('offline');
    }
  }

  function disable() {
    _status = 'offline';
    updateStatusDot('offline');
    const btn = document.getElementById('ai-analyze-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'AI Tidak Tersedia';
    }
  }

  function getStatus() {
    return _status;
  }

  // ── Auto-init on DOM ready ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPanel);
  } else {
    // DOM already loaded, render immediately
    setTimeout(renderPanel, 100);
  }

  return { analyze, renderPanel, togglePanel, disable, getStatus };
})();
