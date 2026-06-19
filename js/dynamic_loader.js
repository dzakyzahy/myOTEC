(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const regionId = urlParams.get('region') || 'bali_selatan';
  const jsPrefix = `data/${regionId}/js/`;
  const dataPrefix = `data/${regionId}/`;

  const scriptsToLoad = [
    jsPrefix + "sst_thermal_vector.js",
    jsPrefix + "deep_temp_vector.js",
    jsPrefix + "deep_temp_embedded.js",
    jsPrefix + "deltat_vector.js",
    jsPrefix + "deltat_embedded.js",
    jsPrefix + "bathy_layers.js",
    jsPrefix + "bathy_offline.js",
    jsPrefix + "bathy_full_vector.js",
    jsPrefix + "salinity_currents_vector.js",
    jsPrefix + "waves_vector.js",
    jsPrefix + "waves_arrows.js",
    jsPrefix + "waves_charts.js"
  ];

  const currentScript = document.currentScript;
  const mainScript = currentScript.getAttribute("data-main");

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => {
        console.warn("Failed to load script:", src);
        resolve(); // Continue anyway
      };
      document.head.appendChild(s);
    });
  }

  async function init() {
    console.log(`Loading data for region: ${regionId}`);
    
    // 1. Fetch JSON grids to dynamically reconstruct GRID_DATA, BATHY_GRID, TIMESERIES
    try {
      // For file:// protocol, fetch will fail due to CORS. 
      // Instead, we load pre-wrapped JS files that assign window.GRID_DATA directly.
      await loadScript(jsPrefix + 'grid_data.js');
      await loadScript(jsPrefix + 'bathy_grid.js');
      await loadScript(jsPrefix + 'timeseries.js');

      if (typeof window.GRID_DATA === 'undefined' || !window.GRID_DATA.lat) {
        throw new Error("GRID_DATA not properly loaded from JS.");
      }
      
      console.log(`Successfully built GRID_DATA for ${regionId}`);
    } catch(e) {
      console.warn(`Failed to load JS grids for ${regionId}, falling back to empty grids`, e);
      if (typeof window.GRID_DATA === 'undefined') {
        window.GRID_DATA = { lat: [], lon: [], sst: [], delta_t: [], deep_temp: [], current: [] };
      }
    }

    // 2. Load the regional vector layers
    for (const src of scriptsToLoad) {
      await loadScript(src);
    }
    
    // Also load shared scripts
    await loadScript("js/dynamic_controls.js");
    await loadScript("js/bathy_map.js");
    
    // 3. Load the main app script
    if (mainScript) {
      await loadScript(mainScript);
    }
  }

  init();
})();
