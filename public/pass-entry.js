window.passEntryCode = (() => {
  let active = null, timer = null;
  function clear() { clearInterval(timer); timer = null; active = null; }
  function draw() {
    const state = active;
    if (!state?.el.isConnected) { clear(); return; }
    const remaining = Math.max(0, Math.ceil((state.deadline - performance.now()) / 1000));
    if (state.qr && (!navigator.onLine || remaining === 0)) {
      state.qr = null;
      state.message = navigator.onLine ? 'Refreshing your entry QR…' : 'Reconnect to show a live entry QR.';
      if (navigator.onLine && !document.hidden) renew();
    }
    state.el.innerHTML = `<section class="entry-code"><p class="eyebrow">${state.subscription?'SUBSCRIPTION':'DIGITAL PASS'} / ENTRY QR</p>${state.qr?`<img class="entry-code-image" src="${state.qr}" alt="Unique entry QR for this parking pass"><p class="entry-code-countdown" role="timer">Refreshes in ${remaining}s</p><p class="hint">For <span translate="no">${esc(state.plate)}</span> at <span translate="no">${esc(state.zone)}</span>. Show this live code to the attendant; screenshots expire.</p>`:`<p class="hint" role="status">${esc(state.message || 'Show a live QR when you reach the gate. The attendant verifies your vehicle and approves entry.')}</p>`}<button type="button" class="secondary full" id="show-entry-code" ${state.busy||!navigator.onLine?'disabled':''}>${state.busy?'Preparing QR…':state.qr?'Refresh entry QR':'Show entry QR'}</button></section>`;
    state.el.querySelector('button').onclick = renew;
  }
  async function renew() {
    const state = active;
    if (!state || state.busy || !navigator.onLine) return;
    state.busy = true; state.qr = null; state.deadline = 0;
    draw();
    try {
      const started = performance.now();
      const result = await api('/api/pass/entry-code', {}, state.access);
      if (active !== state || !state.el.isConnected) return;
      state.qr = result.qrDataUrl;
      state.deadline = started + Math.max(0, result.expires - result.serverTime);
      state.message = '';
    } catch (error) { if (active === state) state.message = error.message; }
    finally { if (active === state) { state.busy = false; draw(); } }
  }
  function mount(el, pass, access) {
    if (!el) return;
    if (pass.paymentMethod !== 'digital' || pass.passType === 'walkin') { clear(); return; }
    if (pass.entryStatus !== 'ready') {
      clear();
      el.innerHTML = `<p class="hint">${pass.entryStatus==='inside'?'Checked in. The attendant will record your exit.':pass.entryStatus==='used'?'This single-visit pass has been used.':'Your entry QR becomes available after payment confirmation while the pass is valid.'}</p>`;
      return;
    }
    if (!active || active.access !== access) {
      clear(); active = { el, access, plate: pass.plate, zone: pass.zone, subscription: pass.passType === 'subscription', deadline: 0, qr: null, message: '', busy: false };
      timer = setInterval(draw, 1000);
    } else active.el = el;
    draw();
  }
  addEventListener('offline', () => { if (active) { active.qr = null; active.message = 'Reconnect to show a live entry QR.'; draw(); } });
  addEventListener('pagehide', clear);
  return { mount, clear };
})();

window.passScanner = (() => {
  let stream = null, interval = null, timeout = null, generation = 0;
  function stop() { generation++; clearInterval(interval); clearTimeout(timeout); stream?.getTracks().forEach(track => track.stop()); stream = null; document.querySelector('#pass-camera-panel')?.remove(); }
  async function start(container, onCode) {
    stop();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error('Camera scanning requires HTTPS or localhost. Use a QR scanner or paste the code instead.');
    const attempt = generation;
    let media;try{media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });}catch(error){throw Error(error.name==='NotAllowedError'?'Camera permission was not granted. Use a scanner or paste the QR code.':'The device camera is unavailable. Use a scanner or paste the QR code.');}
    if (attempt !== generation || !container.isConnected) { media.getTracks().forEach(track => track.stop()); return; }
    stream = media;
    try {
      await import('/vendor/jsQR.js');
      if (attempt !== generation || !container.isConnected) { media.getTracks().forEach(track => track.stop()); return; }
      const panel = document.createElement('section'); panel.id = 'pass-camera-panel'; panel.className = 'pass-camera-panel';
      panel.innerHTML = '<video autoplay playsinline muted aria-label="QR camera preview"></video><p class="hint">Point the camera at the driver’s live QR.</p><button type="button" class="secondary">Stop camera</button>';
      container.append(panel); panel.querySelector('button').onclick = stop;
      const video = panel.querySelector('video'), canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
      video.srcObject = stream; await video.play();
      interval = setInterval(() => {
        if (!panel.isConnected || document.hidden) { stop(); return; }
        if (video.readyState < 2 || !video.videoWidth) return;
        canvas.width = Math.min(640, video.videoWidth); canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const result = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
        if (result) { stop(); onCode(result.data); }
      }, 200);
      timeout = setTimeout(stop, 60000);
    } catch (error) { if (attempt === generation) stop(); throw error; }
  }
  addEventListener('pagehide', stop); document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return { start, stop };
})();
