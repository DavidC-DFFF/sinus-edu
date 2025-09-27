(() => {
  // ===== Sinus interactif — sliders bicolores & animations =====
  const cfg = { axisLeftPx: 60, padL: 8, padR: 8, targetGridPx: 60 };

  const state = { umax: 5, f: 50, phiDeg: 0, umoy: 0 };
  let view = { tWindow: 0.04, pxPerVolt: 1, umoyVis: 0 };
  let umoyDelayTimer = null;
  let ampDelayTimer = null;
  let freqDelayTimer = null;

  // DOM
  const cvs = document.getElementById('scope');
  const ctx = cvs.getContext('2d');
  const uMax = document.getElementById('uMax');
  const freq = document.getElementById('freq');
  const phase = document.getElementById('phase');
  const uDc = document.getElementById('uDc');
  const uMaxOut = document.getElementById('uMaxOut');
  const freqOut = document.getElementById('freqOut');
  const phaseOut = document.getElementById('phaseOut');
  const uDcOut = document.getElementById('uDcOut');
  const numU = document.getElementById('numU');
  const numF = document.getElementById('numF');
  const numP = document.getElementById('numP');
  const numDC = document.getElementById('numDC');
  const tOut = document.getElementById('tOut');
  const ueffOut = document.getElementById('ueffOut');
  const themeToggle = document.getElementById('themeToggle');
  const root = document.documentElement;

  // Theme
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) root.setAttribute('data-theme', savedTheme);
  else root.setAttribute('data-theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  themeToggle.addEventListener('click', () => {
    const cur = root.getAttribute('data-theme');
    const next = cur === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    draw();
  });

  // Utils
  const TAU = Math.PI * 2;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const fmt = (n, d = 2) => { const f = Number(n); if (!isFinite(f)) return '—'; if (Math.abs(f) >= 1000) return f.toFixed(0); if (Math.abs(f) >= 100) return f.toFixed(1); return f.toFixed(d); };
  const fmtSI = (s) => { if (!isFinite(s)) return '—'; if (s >= 1) return fmt(s, 2) + ' s'; const ms = s * 1e3; if (ms >= 1) return fmt(ms, 2) + ' ms'; const us = s * 1e6; return fmt(us, 1) + ' µs'; };
  const fmtVolt = (v) => { const a = Math.abs(v); if (!isFinite(a)) return '—'; if (a >= 1) return fmt(v, 2) + ' V'; if (a >= 1e-3) return fmt(v * 1e3, 2) + ' mV'; if (a >= 1e-6) return fmt(v * 1e6, 2) + ' µV'; return fmt(v * 1e9, 2) + ' nV'; };
  function niceStep(raw) { if (!isFinite(raw) || raw <= 0) return raw; const e = Math.floor(Math.log10(raw)); const b = raw / 10 ** e; let n; if (b <= 1) n = 1; else if (b <= 2) n = 2; else if (b <= 5) n = 5; else n = 10; return n * 10 ** e; }

  function fitCanvas() { const r = cvs.getBoundingClientRect(); const cssH = parseFloat(getComputedStyle(cvs).height) || 320; cvs.width = Math.max(600, Math.floor(r.width)); cvs.height = Math.floor(cssH); }
  function layout() { const w = cvs.width, h = cvs.height; const ox = cfg.axisLeftPx + cfg.padL; const plotW = w - ox - cfg.padR; const centerY = Math.floor(h / 2); return { w, h, ox, plotW, centerY }; }

  // Sliders: fill computation (for WebKit)
  function setRangeFill(el) {
    const min = parseFloat(el.min || 0), max = parseFloat(el.max || 100), val = parseFloat(el.value || 0);
    const pct = ((val - min) / (max - min)) * 100;
    el.style.setProperty('--fill', pct + '%');
  }
  function updateAllFills() { setRangeFill(uMax); setRangeFill(freq); setRangeFill(uDc); setRangeFill(phase); }

  // ===== Drawing =====
  function drawGridAndAxes(ox, plotW, y0, stepXpx, stepYpx, minorX, minorY) {
    const w = cvs.width, h = cvs.height; ctx.clearRect(0, 0, w, h);
    const s = getComputedStyle(document.documentElement); const grid = s.getPropertyValue('--grid').trim(); const axis = s.getPropertyValue('--axis').trim(); const isLight = root.getAttribute('data-theme') === 'light';
    // minor grid
    ctx.lineWidth = isLight ? 1.1 : 1; ctx.strokeStyle = grid; ctx.globalAlpha = isLight ? 0.5 : 0.35; ctx.beginPath();
    if (minorX > 1) { const sx = stepXpx / minorX; for (let x = ox; x <= ox + plotW + 0.5; x += sx) { if (Math.abs((x - ox) % stepXpx) < 0.5) continue; ctx.moveTo(x, 0); ctx.lineTo(x, h); } }
    if (minorY > 1) { const sy = stepYpx / minorY; for (let y = y0; y >= 0; y -= sy) { if (Math.abs((y0 - y) % stepYpx) < 0.5) continue; ctx.moveTo(ox, y); ctx.lineTo(ox + plotW, y); } for (let y = y0 + sy; y < h; y += sy) { if (Math.abs((y - y0) % stepYpx) < 0.5) continue; ctx.moveTo(ox, y); ctx.lineTo(ox + plotW, y); } }
    ctx.stroke(); ctx.globalAlpha = 1;
    // major grid
    ctx.lineWidth = isLight ? 1.6 : 1.2; ctx.beginPath();
    for (let x = ox; x <= ox + plotW + 0.5; x += stepXpx) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = y0; y >= 0; y -= stepYpx) { ctx.moveTo(ox, y); ctx.lineTo(ox + plotW, y); }
    for (let y = y0 + stepYpx; y < h; y += stepYpx) { ctx.moveTo(ox, y); ctx.lineTo(ox + plotW, y); }
    ctx.stroke();
    // Y axis (arrow). The 0 V axis (time) is drawn later at yZero.
    ctx.strokeStyle = axis; ctx.fillStyle = axis; ctx.lineWidth = isLight ? 1.8 : 1.25;
    ctx.beginPath(); ctx.moveTo(ox, h); ctx.lineTo(ox, 0); ctx.stroke();
    const bx = ox, by = 6; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 4, by + 8); ctx.lineTo(bx + 4, by + 8); ctx.closePath(); ctx.fill();
  }

  function drawGraduations(ox, plotW, y0, stepXpx, stepYpx, majorT, majorV, centerV, Umean) {
    const h = cvs.height; const s = getComputedStyle(document.documentElement);
    const colMuted = s.getPropertyValue('--muted').trim();
    const colUmoy = s.getPropertyValue('--cDC').trim();
    ctx.font = '12px system-ui, Segoe UI, Arial';
    const labelX = ox - 12; const pxPerVolt = stepYpx / majorV;

    // Regular grid labels
    ctx.fillStyle = colMuted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const drawYLabel = (y) => { const v = centerV + (y0 - y) / pxPerVolt; ctx.fillText(Math.abs(v) < 1e-9 ? '0 V' : fmtVolt(v), labelX, y); };
    for (let y = y0; y >= 0; y -= stepYpx) drawYLabel(y);
    for (let y = y0 + stepYpx; y < h; y += stepYpx) drawYLabel(y);

    // X labels
    ctx.fillStyle = colMuted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const nDivX = Math.floor(plotW / stepXpx);
    for (let i = 0; i <= nDivX; i++) { const x = ox + i * stepXpx; const t = i * majorT; ctx.fillText(fmtSI(t), x, h - 16); }

    // Explicit Umoy label in BLUE (only if ≠ 0)
    const yUmoy = y0 - (Umean - centerV) * pxPerVolt;
    if (isFinite(Umean) && Math.abs(Umean) > 1e-6 && yUmoy >= 8 && yUmoy <= h - 8) {
      ctx.fillStyle = colUmoy; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fmtVolt(Umean), labelX, yUmoy);
    }
  }

  function drawCurve(ox, plotW, y0, pxPerVolt, A, f, phi, tWindow, centerV, Umean) {
    const isLight = root.getAttribute('data-theme') === 'light';
    ctx.save();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim();
    ctx.lineWidth = isLight ? 2.75 : 2.0;
    ctx.beginPath();
    const samples = Math.min(Math.max(Math.floor(plotW), 1200), 8000);
    for (let i = 0; i <= samples; i++) {
      const x = ox + (i / samples) * plotW;
      const t = (i / samples) * tWindow;
      const u = Umean + Math.sin(TAU * f * t + phi) * A;
      const y = y0 - (u - centerV) * pxPerVolt;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawAnnotations(ox, plotW, y0, pxPerVolt, A, f, tWindow, phi, centerV, Umean) {
    const s = getComputedStyle(document.documentElement);
    const cU = s.getPropertyValue('--cU').trim();
    const cF = s.getPropertyValue('--cF').trim();
    const cDC = s.getPropertyValue('--cDC').trim();
    const axis = s.getPropertyValue('--axis').trim();
    const w = cvs.width; const h = cvs.height;

    // 0 V axis — solid + arrow + label
    const yZero = y0 + centerV * pxPerVolt;
    ctx.save();
    ctx.strokeStyle = axis; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(ox, yZero); ctx.lineTo(ox + plotW, yZero); ctx.stroke();
    ctx.fillStyle = axis; ctx.beginPath(); ctx.moveTo(w - 6, yZero); ctx.lineTo(w - 14, yZero - 4); ctx.lineTo(w - 14, yZero + 4); ctx.closePath(); ctx.fill();
    ctx.font = '12px system-ui, Segoe UI'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const labY = Math.min(Math.max(yZero, 12), h - 2); ctx.fillText('0 V', ox + 6, labY - 2);
    ctx.restore();

    // Umoy dashed (only if ≠0)
    if (Math.abs(Umean) > 1e-6) {
      const yUmoy = y0 - (Umean - centerV) * pxPerVolt;
      ctx.save(); ctx.strokeStyle = cDC; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(ox, yUmoy); ctx.lineTo(ox + plotW, yUmoy); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }

    // Umax arrow from Umoy to Umoy+A
    const T = 1 / Math.max(0.1, f); let tPeak = (Math.PI / 2 - phi) / (TAU * f); tPeak = ((tPeak % T) + T) % T;
    const xPeak = ox + (tPeak / tWindow) * plotW;
    const yBase = y0 - (Umean - centerV) * pxPerVolt;
    const yTop = y0 - ((Umean + A) - centerV) * pxPerVolt;
    ctx.strokeStyle = cU; ctx.fillStyle = cU; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xPeak, yBase); ctx.lineTo(xPeak, yTop); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xPeak, yTop); ctx.lineTo(xPeak - 5, yTop + 8); ctx.lineTo(xPeak + 5, yTop + 8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(xPeak, yBase); ctx.lineTo(xPeak - 5, yBase - 8); ctx.lineTo(xPeak + 5, yBase - 8); ctx.closePath(); ctx.fill();
    ctx.font = '12px system-ui, Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`Umax = ${fmtVolt(A)}`, xPeak, Math.min(yTop, yBase) - 6);

    // Period T arrow just BELOW Umoy
    let tStart = (-phi) / (TAU * f); tStart = ((tStart % T) + T) % T;
    const wT = (T / tWindow) * plotW; const xStart = ox + (tStart / tWindow) * plotW;
    const yUmoy = y0 - (Umean - centerV) * pxPerVolt;
    let yAnnot = Math.min(yUmoy + 24, h - 22);
    ctx.strokeStyle = cF; ctx.fillStyle = cF; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xStart, yAnnot); ctx.lineTo(xStart + wT, yAnnot); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xStart, yAnnot); ctx.lineTo(xStart + 6, yAnnot - 6); ctx.lineTo(xStart + 6, yAnnot + 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(xStart + wT, yAnnot); ctx.lineTo(xStart + wT - 6, yAnnot - 6); ctx.lineTo(xStart + wT - 6, yAnnot + 6); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'center'; let yText = yAnnot + 6; let base = 'top'; if (yText > h - 6) { yText = yAnnot - 6; base = 'bottom'; }
    ctx.textBaseline = base; ctx.fillText(`T = ${fmtSI(T)}`, xStart + wT / 2, yText);
  }

  function draw() {
    const { h, ox, plotW, centerY } = layout();
    const A = Math.max(0, state.umax);
    const f = Math.max(0.1, state.f);
    const phi = state.phiDeg * Math.PI / 180;
    const centerV = view.umoyVis; // visual center (volts)
    const Umean = state.umoy;     // actual mean (volts)
    const tWindow = view.tWindow;
    const pxPerVolt = view.pxPerVolt;
    const y0 = centerY; // axes & grid centered

    const pxPerSecond = plotW / tWindow;
    const majorT = niceStep(cfg.targetGridPx / pxPerSecond);
    const majorV = niceStep(cfg.targetGridPx / pxPerVolt);
    const stepXpx = majorT * pxPerSecond;
    const stepYpx = majorV * pxPerVolt;
    const baseT = majorT / 10 ** Math.floor(Math.log10(majorT));
    const baseV = majorV / 10 ** Math.floor(Math.log10(majorV));
    const minorX = (baseT <= 1.1 ? 5 : (baseT <= 2.1 ? 2 : 5));
    const minorY = (baseV <= 1.1 ? 5 : (baseV <= 2.1 ? 2 : 5));

    drawGridAndAxes(ox, plotW, y0, stepXpx, stepYpx, minorX, minorY);
    drawGraduations(ox, plotW, y0, stepXpx, stepYpx, majorT, majorV, centerV, Umean);
    drawCurve(ox, plotW, y0, pxPerVolt, A, f, phi, tWindow, centerV, Umean);
    drawAnnotations(ox, plotW, y0, pxPerVolt, A, f, tWindow, phi, centerV, Umean);

    const T = 1 / f; tOut.textContent = fmtSI(T);
    updateFormulaLine();
  }

  function updateFormulaLine() {
    const u = fmt(state.umax, 2), f = fmt(state.f, 2), p = fmt(state.phiDeg, 1) + '°', dc = fmt(state.umoy, 2) + ' V';
    numU.textContent = u; numF.textContent = f; numP.textContent = p; numDC.textContent = dc;
    uMaxOut.textContent = `${u} V`; freqOut.textContent = `${f} Hz`; phaseOut.textContent = p; uDcOut.textContent = dc;
    ueffOut.textContent = fmtVolt(state.umax / Math.SQRT2);
  }

  // ===== Animations =====
  let animToken = 0; const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function animateValue(getter, setter, to, duration = 700) { const from = getter(); const start = performance.now(); const token = ++animToken; function frame(now) { const tt = Math.min(1, (now - start) / duration); const v = from + (to - from) * easeInOutCubic(tt); setter(v); draw(); if (token !== animToken) return; if (tt < 1) requestAnimationFrame(frame); } requestAnimationFrame(frame); }
  const animateTWindow = (to, _ms = 1000) => animateValue(() => view.tWindow, v => view.tWindow = v, to, 1000);
  const animatePxPerVolt = (to, _ms = 1000) => animateValue(() => view.pxPerVolt, v => view.pxPerVolt = v, to, 1000);
  const animateUmoy = (to, ms = 1000) => animateValue(() => view.umoyVis, v => view.umoyVis = v, to, ms);

  // ===== Snapping =====
  function smartSnap(val, relTol, absTol = 0, extras = []) {
    if (absTol > 0 && Math.abs(val) <= absTol) return 0;
    if (!(val > 0)) return null;
    const k = Math.floor(Math.log10(val));
    const base = [1, 1.25, 1.5, 2, 2.5, 5];
    const set = new Set();
    for (const b of base) { set.add(b * 10 ** (k - 1)); set.add(b * 10 ** k); set.add(b * 10 ** (k + 1)); }
    for (const ex of extras) set.add(ex);
    let best = val, err = Infinity;
    for (const c of set) { if (!(c > 0)) continue; const e = Math.abs(val - c) / c; if (e < err) { err = e; best = c; } }
    return (err <= relTol) ? best : null;
  }

  function snapUmoy(x) {
    const ZERO = 0.1; // ±0.1 V → 0
    const sgn = Math.sign(x) || 1;
    const abs = Math.abs(x);
    if (abs <= ZERO) return 0;
    if (abs < 1) { const q = Math.round(abs / 0.5) * 0.5; return sgn * q; }
    const quarterMagnets = [];
    if (abs < 2.5) { for (let m = 1.0; m <= 2.5 + 1e-9; m += 0.25) quarterMagnets.push(Number(m.toFixed(2))); }
    const majors = [1, 2, 2.5, 5, 10, 20];
    const q = Math.round(abs / 0.5) * 0.5;
    let best = q, bestErr = Math.abs(abs - q);
    for (const m of [...quarterMagnets, ...majors]) { const e = Math.abs(abs - m); if (e < bestErr) { best = m; bestErr = e; } }
    const tol = Math.max(0.05, 0.03 * best);
    return (bestErr <= tol) ? sgn * best : null;
  }

  // Magnets for Umax snapping: all integers 0–20 and half-steps (0.5)
  function buildUmaxExtras() {
    const extras = new Set();
    for (let n = 0; n <= 20; n++) extras.add(n);
    for (let n = 0.5; n <= 20.0001; n += 0.5) extras.add(Number(n.toFixed(2)));
    return Array.from(extras.values());
  }

  // ===== UI bindings =====
  function syncFromUI() { state.umax = parseFloat(uMax.value); state.f = clamp(parseFloat(freq.value), 0.1, 2000); state.phiDeg = parseFloat(phase.value); state.umoy = parseFloat(uDc.value); updateFormulaLine(); draw(); }

  phase.addEventListener('input', () => { let val = parseFloat(phase.value); const mags = [-180, -150, -135, -120, -90, -60, -45, -30, 0, 30, 45, 60, 90, 120, 135, 150, 180]; let best = val, dmin = Infinity; for (const m of mags) { const d = Math.abs(val - m); if (d < dmin) { dmin = d; best = m; } } if (dmin <= 2) phase.value = String(best); setRangeFill(phase); syncFromUI(); });

  uMax.addEventListener('input', () => {
    let v = parseFloat(uMax.value);
    const extras = buildUmaxExtras();
    const s = smartSnap(v, 0.02, 0.05, extras);
    if (s !== null) { v = s; uMax.value = String(v); }
    setRangeFill(uMax);
    syncFromUI();
    const { h } = layout();
    const A = Math.max(1e-9, parseFloat(uMax.value));
    const target = (0.8 * h) / (2 * Math.max(1e-6, A));
    if (ampDelayTimer) clearTimeout(ampDelayTimer);
    ampDelayTimer = setTimeout(() => {
      animatePxPerVolt(target, 1000);
    }, 500);
  });

  freq.addEventListener('input', () => {
    let v = parseFloat(freq.value);
    const extras = [50, 60, 100, 200, 450, 500, 750, 1000, Math.round(v / 25) * 25, Math.round(v / 50) * 50];
    const s = smartSnap(v, 0.015, 0, extras);
    if (s !== null) { v = s; freq.value = String(v); }
    setRangeFill(freq);
    syncFromUI();
    const target = 2 * (1 / Math.max(0.1, parseFloat(freq.value)));
    if (freqDelayTimer) clearTimeout(freqDelayTimer);
    freqDelayTimer = setTimeout(() => {
      animateTWindow(target, 1000);
    }, 500);
  });

  uDc.addEventListener('input', () => {
    let v = parseFloat(uDc.value);
    const s = snapUmoy(v);
    if (s !== null) { v = s; uDc.value = String(v); }
    setRangeFill(uDc);
    syncFromUI();
  });

  
  // Trigger Umoy animation only on release
  let _dragUmoy = false;
  uDc.addEventListener('pointerdown', () => { _dragUmoy = true; });
  uDc.addEventListener('pointerup',   () => { _dragUmoy = false; animateUmoy(state.umoy, 1000); });
  uDc.addEventListener('change',      () => { if (!_dragUmoy) animateUmoy(state.umoy, 1000); });
// ===== Init + tests =====
  function init() {
    fitCanvas();
    window.addEventListener('resize', () => { fitCanvas(); draw(); });
    const { h } = layout();
    view.tWindow = 2 * (1 / state.f);
    view.pxPerVolt = (0.8 * h) / (2 * Math.max(1e-6, state.umax));
    view.umoyVis = state.umoy;
    updateFormulaLine();
    updateAllFills();
    draw();

    function assert(name, cond) { console[cond ? 'log' : 'error'](`Test ${cond ? 'OK' : 'FAIL'} — ${name}`); }
    // tests
    assert('snap Umax 7.02 → 7', smartSnap(7.02, 0.02, 0, buildUmaxExtras()) === 7);
    assert('snap f 449.4 → 450', smartSnap(449.4, 0.02, 0, [450]) === 450);
    assert('snap Umoy 0.03 → 0', snapUmoy(0.03) === 0);
    assert('snap Umoy -0.07 → 0', snapUmoy(-0.07) === 0);
    assert('snap Umoy 0.26 ≈ 0.5', Math.abs(Math.abs(snapUmoy(0.26)) - 0.5) < 1e-6);
    assert('smartSnap 999 → 1000 (tol 2%)', smartSnap(999, 0.02, 0, [1000]) === 1000);
    assert('smartSnap freq 450.1 → 450', smartSnap(450.1, 0.015, 0, [450]) === 450);
    assert('init umoyVis equals state.umoy', Math.abs(view.umoyVis - state.umoy) < 1e-9);
    assert('snap Umoy 1.24 → ~1.25', Math.abs(Math.abs(snapUmoy(1.24)) - 1.25) < 1e-6);
    assert('snap Umoy 1.74 → ~1.75', Math.abs(Math.abs(snapUmoy(1.74)) - 1.75) < 1e-6);
    // Extra tests Umax
    assert('snap Umax 0.99 → 1.0', smartSnap(0.99, 0.02, 0, buildUmaxExtras()) === 1);
    assert('snap Umax 4.49 → 4.5', smartSnap(4.49, 0.02, 0, buildUmaxExtras()) === 4.5);
    assert('snap Umax 9.51 → 9.5', smartSnap(9.51, 0.02, 0, buildUmaxExtras()) === 9.5);
  }
  init();
})();