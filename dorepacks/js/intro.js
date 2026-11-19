// Doreventure boot intro — same sequence, timing, logo and text as Doreweb/Doreventure.
// Brand wordmark stays "Doremon" (red stroke, gold fill). Tap or A skips.
// After this ends, the home screen shows DorepacksTCG.
const TOP = ['badbulb', 'munchwag', 'belfable'];
const BOT = ['senkip', 'beonya', 'panpurr'];
const ALL = [...TOP, ...BOT];
const BASE = new URL('../assets/intro/', import.meta.url);
const IDUR = 6200;

function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
function ease(t) {
  t = Math.max(0, Math.min(1, t));
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export async function runIntro({ skip = false, seek = 0, freeze = false } = {}) {
  if (skip) return;
  const frames = {};
  await Promise.all(ALL.flatMap(id => ['side1', 'side2'].map(async tag => {
    const k = `${id}_${tag}`;
    const bundled = (typeof window !== 'undefined' && window.IMG) ? (window.IMG['intro/' + k] || window.IMG[k]) : null;
    frames[k] = await loadImg(bundled || new URL(`${k}.png`, BASE).href);
  })));

  const wrap = document.createElement('div');
  wrap.id = 'intro';
  wrap.innerHTML = `<canvas id="ic"></canvas><div id="iskip">TAP / A TO SKIP</div>`;
  document.body.appendChild(wrap);
  const canvas = wrap.querySelector('#ic');
  const ctx = canvas.getContext('2d');

  let DP = 1, IW = 0, IH = 0, sp = [];
  function mk(init) {
    return {
      x: Math.random() * IW,
      y: init ? -Math.random() * IH : -10 - Math.random() * IH * 0.3,
      v: (40 + Math.random() * 90) / 1000,
      s: 1 + Math.floor(Math.random() * 3),
      p: Math.random() * 6.3,
      c: Math.random() < 0.5 ? '#ffd23c' : (Math.random() < 0.5 ? '#fff1a8' : '#e8a81a')
    };
  }
  function resetSp(init) {
    sp = [];
    const n = Math.round(IW * IH / 9000);
    for (let i = 0; i < n; i++) sp.push(mk(init));
  }
  function isize() {
    DP = Math.max(1, window.devicePixelRatio || 1);
    IW = Math.round(innerWidth * DP);
    IH = Math.round(innerHeight * DP);
    canvas.width = IW; canvas.height = IH;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    resetSp(true);
  }
  isize();
  const onR = () => { if (!done) isize(); };
  addEventListener('resize', onR);
  function advanceSp(ms) {
    let acc = 0; const step = 16;
    while (acc < ms) {
      const now = acc;
      sp.forEach(q => {
        q.y += q.v * step * DP;
        q.x += Math.sin((now / 600) + q.p) * 0.15 * DP;
        if (q.y > IH + 10) { const r = mk(false); q.x = r.x; q.y = r.y; q.v = r.v; }
      });
      acc += step;
    }
  }
  if (seek) advanceSp(seek);

  function drawRow(names, y, dirLeft, t, k) {
    const ws = names.map(n => (frames[`${n}_side1`]?.width || 80) * k);
    let spacing = 0;
    ws.forEach(w => { spacing += w + Math.round(24 * DP); });
    const speed = 0.16 * DP, off = t * speed;
    let x = dirLeft ? Math.round(IW + 20 * DP - off) : Math.round(-spacing - 20 * DP + off);
    names.forEach((n, i) => {
      const im1 = frames[`${n}_side1`], im2 = frames[`${n}_side2`] || im1;
      const f = Math.floor(t / 140 + i) % 2;
      const im = f === 0 ? im1 : im2;
      const w = (im1.width) * k, h = (im1.height) * k;
      const bob = f * k * 2;
      if (im && im.complete) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        if (!dirLeft) {
          ctx.translate(x + w, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(im, 0, Math.round(y - h - bob), w, h);
        } else {
          ctx.drawImage(im, x, Math.round(y - h - bob), w, h);
        }
        ctx.restore();
      }
      x += w + Math.round(24 * DP);
    });
  }

  function drawLogo(t) {
    const cx = IW / 2, cy = IH / 2, fs = Math.round(Math.min(IW * 0.19, IH * 0.16));
    const pt = (t - 500) / 600;
    if (pt <= 0) return;
    const sc = ease(pt);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.font = '900 ' + fs + 'px "Arial Rounded MT Bold","SF Pro Rounded",-apple-system,Helvetica,Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.16;
    ctx.strokeStyle = '#7a0b10';
    ctx.strokeText('Doremon', 0, fs * 0.06);
    ctx.lineWidth = fs * 0.12;
    ctx.strokeStyle = '#e3222b';
    ctx.strokeText('Doremon', 0, 0);
    const g = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
    g.addColorStop(0, '#fff59a');
    g.addColorStop(0.45, '#ffd21f');
    g.addColorStop(1, '#f2a900');
    ctx.fillStyle = g;
    ctx.fillText('Doremon', 0, 0);
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 220);
    ctx.fillStyle = '#fff';
    const sx = Math.round(fs * 1.55 * Math.sin(t / 900));
    ctx.fillRect(sx, -fs * 0.42, DP * 3, DP * 3);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  let done = false, raf = 0, iT0 = performance.now() - (seek || 0), last = 0;
  function frame(now) {
    if (done) return;
    if (freeze) now = iT0 + (seek || 0);
    const t = now - iT0;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, IW, IH);
    ctx.imageSmoothingEnabled = false;
    const dt = last ? Math.min(50, now - last) : 16;
    last = now;
    if (!freeze) {
      sp.forEach(q => {
        q.y += q.v * dt * DP;
        q.x += Math.sin((now / 600) + q.p) * 0.15 * DP;
        if (q.y > IH + 10) { const r = mk(false); q.x = r.x; q.y = r.y; q.v = r.v; }
      });
    }
    sp.forEach(q => {
      const tw = 0.55 + 0.45 * Math.sin(now / 180 + q.p * 3);
      ctx.globalAlpha = tw;
      ctx.fillStyle = q.c;
      const s = Math.round(q.s * DP);
      ctx.fillRect(Math.round(q.x), Math.round(q.y), s, s * (q.s > 2 ? 2 : 1));
    });
    ctx.globalAlpha = 1;
    const fs = Math.round(Math.min(IW * 0.19, IH * 0.16));
    const targetH = Math.min(IH * 0.12, 74 * DP);
    const k = Math.max(1, Math.round(targetH / 90));
    const cy = IH / 2;
    if (t > 1300) {
      drawRow(TOP, cy - fs * 0.95, true, t - 1300, k);
      drawRow(BOT, cy + fs * 0.85 + 90 * k, false, t - 1300, k);
    }
    drawLogo(t);
    if (!freeze) {
      if (t > IDUR) { end(); return; }
      if (t > IDUR - 500) wrap.style.opacity = String(Math.max(0, (IDUR - t) / 500));
    }
    raf = requestAnimationFrame(frame);
  }

  function end() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', onR);
    removeEventListener('keydown', onKey);
    wrap.style.opacity = '0';
    setTimeout(() => wrap.remove(), 280);
    resolve();
  }
  function onKey(e) {
    const k = e.key;
    if (k === 'a' || k === 'A' || k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); end(); }
  }
  addEventListener('keydown', onKey);
  // A on a connected gamepad also skips
  let gpRaf = 0;
  const pollPad = () => {
    if (done) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && p.buttons[0] && p.buttons[0].pressed) { end(); return; }
    }
    gpRaf = requestAnimationFrame(pollPad);
  };
  gpRaf = requestAnimationFrame(pollPad);

  let resolve;
  const p = new Promise(r => resolve = r);
  wrap.addEventListener('pointerup', (e) => { e.preventDefault(); end(); });
  window.__introFrame = (ms) => { iT0 = performance.now() - ms; };
  window.__introEnd = end;
  raf = requestAnimationFrame(frame);
  return p;
}
