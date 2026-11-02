window.parkingBasemap = (() => {
  const attribution = '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
  let renderer;
  function loadRenderer() {
    return renderer ??= import('/vendor/maplibre-gl.mjs').then(async gl => {
      window.maplibregl = gl;
      gl.setWorkerUrl('/vendor/maplibre-gl-worker.mjs');
      await import('/vendor/leaflet-maplibre-gl.js');
    });
  }
  function add(map, onUnavailable) {
    const controller = new AbortController();
    let disposed = false;
    map.once('unload', () => { disposed = true; controller.abort(); });
    const unavailable = () => { if (!disposed) onUnavailable?.(); };
    Promise.all([
      loadRenderer(),
      fetch('https://tiles.openfreemap.org/styles/positron', { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
        .then(response => { if (!response.ok) throw new Error('Basemap unavailable'); return response.json(); })
    ]).then(([, style]) => {
      if (disposed) return;
      // Positron supplies the light streets and restrained labels; tint the water blue.
      for (const layer of style.layers) {
        if (layer['source-layer'] === 'water' && layer.type === 'fill') layer.paint = { ...layer.paint, 'fill-color': '#cde8ed' };
        if (layer['source-layer'] === 'waterway' && layer.type === 'line') layer.paint = { ...layer.paint, 'line-color': '#cde8ed' };
      }
      const layer = L.maplibreGL({ style, attributionControl: { customAttribution: attribution }, interactive: false });
      try { layer.addTo(map); }
      catch (error) {
        // A failed WebGL constructor must not leave a half-added layer that breaks
        // Leaflet cleanup when the driver changes tabs or selects the list view.
        if (!layer.getMaplibreMap()) layer.onRemove = () => layer.getContainer()?.remove();
        if (map.hasLayer(layer)) map.removeLayer(layer);
        throw error;
      }
      layer.getMaplibreMap().on('error', unavailable);
    }).catch(unavailable);
  }
  return { add };
})();
