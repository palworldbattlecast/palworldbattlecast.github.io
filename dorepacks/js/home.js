// Animated home backdrop: brand-color parallax, falling sparkles, wandering doremon,
// and the trainer's walking sprite idling. Pixel-exact integer NN scales.
const HOME_MONS = ['axerupi','electrinx','badbulb','senkip','panpurr','munchwag','pinkit','solpuff'];
const BASE = new URL('../assets/intro/', import.meta.url);

function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

let raf = 0, running = false, frames = {}, trainerImg = null;

export async function startHomeScene(canvas, trainerId) {
  stopHomeScene();
  if (!canvas) return;
  await Promise.all(HOME_MONS.flatMap(id => ['side1','side2'].map(async tag => {
    const k = `${id}_${tag}`;
    if (!frames[k]) {
      const bundled = (typeof window !== 'undefined' && window.IMG) ? (window.IMG['intro/' + k] || window.IMG[k]) : null;
      frames[k] = await loadImg(bundled || new URL(`${id}_${tag}.png`, BASE).href);
    }
  })));
  trainerImg = null;
  if (trainerId && typeof document !== 'undefined') {
    // trainer may live in the IMG bundle as trainers/<id>
    const src = (window.IMG && (window.IMG['trainers/' + trainerId] || window.IMG[trainerId])) || null;
    if (src) trainerImg = await loadImg(src);
  }
  running = true;
  const ctx = canvas.getContext('2d');
  let t0 = performance.now(), last = t0;
  const wanders = [];
  const sparks = [];

  function size() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return { w: r.width, h: r.height, dpr };
  }

  function mkWander(w, h) {
    const id = HOME_MONS[Math.floor(Math.random() * HOME_MONS.length)];
    const a = frames[`${id}_side1`], b = frames[`${id}_side2`] || a;
    const want = Math.max(28, Math.round(h * 0.11));
    const k = a.height <= want ? Math.max(1, Math.floor(want / a.height)) : 1 / Math.ceil(a.height / want);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const ww = a.width * k, hh = a.height * k;
    return { a, b, w: ww, h: hh, dir, x: dir > 0 ? -ww : w + ww, y: h * (0.58 + Math.random() * 0.22), sp: w / (5 + Math.random() * 3), t: 0, live: true };
  }

  function boot(w, h) {
    sparks.length = 0;
    const n = Math.round(w * h / 14000);
    for (let i = 0; i < n; i++) sparks.push({ x: Math.random() * w, y: Math.random() * h, v: 18 + Math.random() * 40, s: 1 + Math.floor(Math.random() * 3), p: Math.random() * 6.3, c: Math.random() < 0.5 ? '#ffd21f' : '#fff6c0' });
    wanders.length = 0;
    wanders.push(mkWander(w, h));
  }

  let booted = false;
  function frame(now) {
    if (!running) return;
    const { w, h } = size();
    if (!booted) { boot(w, h); booted = true; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    // brand parallax gradient (black / red / gold horizon)
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#140404');
    g.addColorStop(0.35, '#2a080c');
    g.addColorStop(0.62, '#3a0c10');
    g.addColorStop(0.63, '#5a1a12');
    g.addColorStop(0.78, '#1a0a08');
    g.addColorStop(1, '#070707');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // drifting red/gold haze orbs (parallax)
    for (let i = 0; i < 5; i++) {
      const px = (w * 0.2 * i + t * (8 + i * 4)) % (w + 120) - 60;
      const py = h * 0.18 + Math.sin(t * 0.4 + i) * 18 + i * 16;
      const rad = 50 + i * 18;
      const rg = ctx.createRadialGradient(px, py, 4, px, py, rad);
      rg.addColorStop(0, i % 2 ? 'rgba(255,210,31,0.16)' : 'rgba(227,34,43,0.18)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    // ground band
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    ctx.fillStyle = 'rgba(227,34,43,0.35)';
    ctx.fillRect(0, h * 0.72, w, 3);
    ctx.fillStyle = 'rgba(255,210,31,0.45)';
    ctx.fillRect(0, h * 0.72 + 3, w, 2);

    sparks.forEach(s => {
      s.y += s.v * dt;
      s.x += Math.sin(now / 700 + s.p) * 0.15;
      if (s.y > h + 6) { s.y = -6; s.x = Math.random() * w; }
      ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(now / 200 + s.p));
      ctx.fillStyle = s.c;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s * (s.s > 2 ? 2 : 1));
    });
    ctx.globalAlpha = 1;

    if (wanders.filter(x => x.live).length < 2 && Math.random() < 0.012) wanders.push(mkWander(w, h));
    for (const r of wanders) {
      r.t += dt; r.x += r.dir * r.sp * dt;
      const fr = (Math.floor(r.t / 0.13) % 2 === 0) ? r.a : r.b;
      const bob = (Math.floor(r.t / 0.13) % 2 === 0) ? 0 : Math.max(2, 3);
      ctx.save(); ctx.imageSmoothingEnabled = false;
      if (r.dir < 0) { ctx.translate(r.x, r.y - bob); ctx.scale(-1, 1); ctx.drawImage(fr, -r.w / 2, -r.h, r.w, r.h); }
      else ctx.drawImage(fr, Math.round(r.x - r.w / 2), Math.round(r.y - r.h - bob), r.w, r.h);
      ctx.restore();
      if ((r.dir > 0 && r.x > w + r.w) || (r.dir < 0 && r.x < -r.w)) r.live = false;
    }
    for (let i = wanders.length - 1; i >= 0; i--) if (!wanders[i].live) wanders.splice(i, 1);

    // trainer idle (bob) at the right of the ground
    if (trainerImg) {
      const want = Math.max(48, Math.round(h * 0.2));
      const k = trainerImg.height <= want ? Math.max(1, Math.floor(want / trainerImg.height)) : 1 / Math.ceil(trainerImg.height / want);
      const tw = trainerImg.width * k, th = trainerImg.height * k;
      const bob = Math.round(Math.sin(t * 2.2) * 3);
      const tx = Math.round(w * 0.78 - tw / 2), ty = Math.round(h * 0.72 - th + 8 + bob);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(trainerImg, tx, ty, tw, th);
    }

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}

export function stopHomeScene() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}
