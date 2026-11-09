import * as E from './engine.js';
import { Audio, TITLES } from './audio.js';
const { Game, TIERS, MR, SETS, SET_NAMES, isDouble, isSpread, DB, card, inSet, isMon, isSpell, isTrap, spriteId, Rarity, Packs, Battle, BattleAI, DeckRules, ACHIEVEMENTS, STATUS, tier, effectiveness, canAttack, monCount, tapOwnMonSel, seasonOfDay, daysLeftInSeason, seasonFeatured, SEASON_DAYS, trainerSprite, SEASON_REWARDS } = E;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const IMG = {}, SIZE = {}, BOX = {};
const VERB = { plays: 'play', uses: 'use', sets: 'set', loses: 'lose', reveals: 'reveal', goes: 'go', wins: 'win', attacks: 'attack' };
const fixG = t => t.replace(/\bYou (plays|uses|sets|loses|reveals|goes|wins|attacks)\b/g, (m, v) => 'You ' + VERB[v]);
const HEART = '<svg viewBox="0 0 24 22"><path d="M12 21.3 10.5 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.5 11.5z"/></svg>';
const RCOL = { MYT: '#cc80ff', LGD: '#ffc73d', SSR: '#ff73f2', SR: '#ffcc40', R: '#d9e0f2', U: '#59d9bf', ITEM: '#80e699', C: '#8cb3ff' };
const FORK = '<svg class="fork" viewBox="0 0 16 12"><path d="M1 6h5l4-4h3M6 6l4 4h3M11 0l3 2-3 2M11 8l3 2-3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const splitIcon = c => isDouble(c) ? '<span class="sx d" title="Double hit">x2</span>' : isSpread(c) ? `<span class="sx s" title="Split: up to 2 targets">${FORK}</span>` : '';
// every set has a printed back (curved DOREMONSTERS / TRADING CARD GAME over four doreballs)
const packBack = set => IMG['cards/pack_' + String(set).toLowerCase() + '_back'];
const SETICON = { WW: '🌱', FL: '🔥', T2: '⚡' , HT: '🌑'};
const SAVE_KEY = 'dorepacks_save_v1';

// ---------- assets ----------
async function loadAssets() {
  const msg = $('#loadmsg');
  const idx = await (await fetch('assets/index.json')).json();
  const b64ToBytes = b => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  await Promise.all(Array.from({ length: idx.n }, async (_, i) => {
    const j = await (await fetch(`assets/b${i}.json`)).json();
    for (const k in j) { const v = j[k]; IMG[k] = URL.createObjectURL(new Blob([b64ToBytes(v.slice(1))], { type: v[0] === 'w' ? 'image/webp' : 'image/png' })); }
    if (msg) msg.textContent = `LOADING ${Object.keys(IMG).length}`;
  }));
  for (const [fam, f] of [['Lilita', 'LilitaOne-Regular'], ['Pixel', 'PressStart2P-Regular']]) {
    const b = b64ToBytes(await (await fetch(`assets/${f}.b64`)).text());
    const ff = new FontFace(fam, b.buffer); await ff.load(); document.fonts.add(ff);
  }
  // sprite natural sizes (for integer scaling)
  // + opaque bounding box, so every doremon is trimmed of its transparent padding and centred/scaled by its real pixels
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
  await Promise.all(Object.keys(IMG).filter(k => k.startsWith('sprites/')).map(k => new Promise(r => { const im = new Image(); im.onload = () => {
    const w = im.naturalWidth, h = im.naturalHeight; SIZE[k] = [w, h];
    try { cv.width = w; cv.height = h; cx.clearRect(0, 0, w, h); cx.drawImage(im, 0, 0); const d = cx.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      BOX[k] = x1 >= 0 ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : [0, 0, w, h]; } catch (e) { BOX[k] = [0, 0, w, h]; }
    r(); }; im.onerror = r; im.src = IMG[k]; })));
  initDB(await (await fetch('cards.json')).json());
}
function initDB(j) { E.initDB(j); }
const cardImg = (id, cls = 'cardimg') => `<img class="${cls}" src="${IMG['cards/' + id] || ''}" alt="" draggable="false">`;
// Pixel-exact sprite: trimmed to its opaque pixels, integer up-scale (or 1/n down-step) computed in DEVICE pixels, nearest-neighbour,
// centred in a box of the requested size so every doremon lines up the same way.
function fitSprite(id, bw, bh, box = true) {
  const k0 = 'sprites/' + id, [W, H] = SIZE[k0] || [155, 273], [x, y, w, h] = BOX[k0] || [0, 0, W, H], dpr = window.devicePixelRatio || 1;
  const r = Math.min(bw * dpr / w, bh * dpr / h), k = r >= 1 ? Math.floor(r) : 1 / Math.ceil(1 / r), u = v => (v * k / dpr) + 'px';
  const inner = `<span class="spr" style="width:${u(w)};height:${u(h)}"><img class="px" src="${IMG[k0] || ''}" style="width:${u(W)};height:${u(H)};left:-${u(x)};top:-${u(y)}" alt="" draggable="false"></span>`;
  return box ? `<span class="sprbox" style="width:${bw}px;height:${bh}px">${inner}</span>` : inner;
}
const sprite = (id, maxSide) => fitSprite(id, maxSide, maxSide);
/** profile / trainer art: season pics & mon sprites use sprite(); trainer NPCs use IMG trainers/ */
function avImg(id, size = 40) {
  if (!id) id = 'axerupi';
  if (String(id).startsWith('trainers/') || String(id).startsWith('npc_') || String(id).startsWith('trainer_') || String(id).startsWith('boy_')) {
    const k = String(id).startsWith('trainers/') ? id : 'trainers/' + id;
    return `<img class="px" src="${IMG[k] || ''}" style="width:${size}px;height:${size}px;image-rendering:pixelated;object-fit:contain" alt="" draggable="false">`;
  }
  return sprite(id, size);
}
function goldCoin(mon, size = 54) {
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#ffe9a0,#d4a017 55%,#8a6a10);box-shadow:inset 0 0 0 3px #f5d76e,0 2px 6px #0008">${sprite(mon, Math.round(size * 0.7))}</span>`;
}

const rar = r => `<span class="rar" style="background:${RCOL[r] || '#888'}">${r === 'ITEM' ? 'ITEM' : r}</span>`;

// ---------- state ----------
const params = new URLSearchParams(location.search);
const SNAP = params.get('snap'), DEBUG = params.has('debug');
// ---------- real-time league days ----------
const clock = ms => { const t = Math.ceil(ms / 1000); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60; return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`; };
function dayText() { const sn = seasonOfDay(G.s.day); return `<span>📅 Day <b>${G.s.day}</b> · Season <b>${sn}</b></span><span class="grow"></span><span>next day in <b class="cd">${clock(G.msToNextDay())}</b></span>`; }
let catching = false;
function tickDays() {
  if (!G || SNAP || catching) return;
  const due = G.daysDue();
  if (due > 0) {
    if (due <= 3) { G.advanceDays(due); dayDone(due); }
    else { // long catch-up (app was closed): chunked so the page never freezes
      catching = true; const total = Math.min(due, E.MAX_CATCHUP); let doneN = 0;
      const ov = document.createElement('div'); ov.className = 'overlay catch'; document.body.appendChild(ov);
      const step = () => { const n = G.advanceDays(40); doneN += n; ov.innerHTML = `<div class="title" style="font-size:26px">While you were away…</div><div class="small" style="margin:8px 0 12px">Simulating league day ${doneN} / ${total}</div><div class="bar" style="width:220px"><i style="width:${doneN / total * 100}%"></i></div>`;
        if (n > 0 && G.daysDue() > 0) setTimeout(step, 16); else { ov.remove(); catching = false; dayDone(doneN, true); } };
      step();
    }
  }
  const el = document.getElementById('dayline'); if (el) el.innerHTML = dayText();
}
function dayDone(n, away) { if (UI.battle || UI.overlay) return; banner(away ? `${n} league days passed` : `League day ${G.s.day}`); const sc = $('#main')?.scrollTop; render(); if ($('#main') && sc) $('#main').scrollTop = sc; }
setInterval(tickDays, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickDays(); });
const AU = new Audio(SNAP ? null : localStorage);
const sfx = n => AU.play(n);
AU.onTrack = () => { const el = document.getElementById('nowplaying'); if (el) el.textContent = AU.nowPlaying || '—'; };
let G, UI = { tab: 'packs', binderSet: 'WW', deck: 0, more: null, shopTab: 'packs', overlay: null, battle: null };
function storage() { return SNAP ? null : { load: () => localStorage.getItem(SAVE_KEY), save: t => { try { localStorage.setItem(SAVE_KEY, t); } catch (e) {} } }; }

// ---------- render ----------
function render() {
  const app = $('#app');
  AU.music(UI.battle ? 'battle' : 'menu');
  if (UI.battle) { app.innerHTML = battleView(); afterBattleRender(); renderOverlay(); return; }
  const s = G.s;
  const tabs = [['packs', '🎴', 'Packs'], ['binder', '📒', 'Collection'], ['decks', '🃏', 'Decks'], ['league', '🏆', 'League'], ['profile', '👤', 'Profile'], ['more', '⚙️', 'More']];
  app.innerHTML = `<div class="top"><div class="brand">DOREPACKS</div>
    <span class="chip" style="color:#7dfc9f">${money(s.money)}</span>${SETS.map(k => `<span class="chip" title="${esc(SET_NAMES[k])} packs">${SETICON[k]} ${s.packs[k] || 0}</span>`).join('')}<span class="chip" style="color:var(--yellow)">${s.mr}</span></div>
    <div class="dayline" id="dayline">${dayText()}</div>
    <div class="main" id="main">${screen()}</div>
    <div class="tabs">${tabs.map(([k, i, t]) => `<button class="${UI.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}"><span class="i">${i}</span>${t}</button>`).join('')}</div>`;
  renderOverlay(); showAchievements();
}
function screen() {
  switch (UI.tab) {
    case 'packs': return packsView(); case 'binder': return binderView(); case 'decks': return decksView();
    case 'battle': return battleSetupView(); case 'league': return leagueView(); case 'profile': return profileView();
    case 'more': return moreView();
  }
}
function packsView() {
  const s = G.s;
  return `<div class="page-head"><div><h1>Packs</h1><div class="sub">Rip packs · chase Legendaries & Mythicals</div></div><button class="btn y sm" data-a="tab" data-v="battle">⚔️ Battle</button></div><div class="pack-grid">` + SETS.map(set => {
    const r = Packs.rule(set), pity = s.pity[set] || 0;
    const chase = inSet(set).filter(c => Rarity.isChase(c.rarity));
    const flip = UI.packBack === set;
    return `<div class="panel set-card"><div class="row" style="width:100%"><img class="pack-thumb" src="${flip ? packBack(set) : IMG['cards/pack_' + set.toLowerCase()]}" style="cursor:pointer" alt="" data-a="packFlip" data-v="${set}" title="Tap to see the back">
      <div class="grow col" style="gap:6px"><div class="title" style="font-size:22px;color:var(--yellow)">${r.name}</div>
      <div class="small">7 cards · ${money(r.price)} · you have <b style="color:#fff">${s.packs[set] || 0}</b></div>
      <div class="small" style="color:#7ee0ff">${set === 'T2' ? 'Split attacks · ' : set === 'HT' ? 'Brown & silver · Revive & Sandstorm · ' : ''}tap the pack to flip it</div><div class="small">Pity ${pity}/${r.pity - 1}</div><div class="bar"><i style="width:${pity / (r.pity - 1) * 100}%"></i></div>
      <div class="row"><button class="btn y sm grow" data-a="open" data-v="${set}" ${s.packs[set] > 0 ? '' : 'disabled'}>Open</button><button class="btn sm grow" data-a="buyPack" data-v="${set}" ${s.money >= r.price ? '' : 'disabled'}>Buy ${money(r.price)}</button></div></div></div>
      <div class="row wrap" style="margin-top:8px;gap:4px">${chase.map(c => `<span style="opacity:${s.owned[c.id] > 0 ? 1 : .3}">${sprite(spriteId(c), 40)}</span>`).join('')}</div>
      <details style="margin-top:6px"><summary class="small">Odds &amp; pity</summary>${Packs.ratesText(set).map(([a, b]) => `<div class="small" style="margin-top:5px"><b style="color:#fff">${a}:</b> ${esc(b)}</div>`).join('')}</details></div>`;
  }).join('') + '</div>';
}
function binderView() {
  const set = UI.binderSet, list = inSet(set), s = G.s;
  const have = list.filter(c => s.owned[c.id] > 0).length;
  return `<div class="page-head"><div><h1>Collection</h1><div class="sub">Every set you own, tidy in one place</div></div></div><div class="seg">${[...SETS.map(k => [k, SET_NAMES[k]]), ['ST', 'Supplies']].map(([k, n]) => `<button class="${set === k ? 'on' : ''}" data-a="bset" data-v="${k}">${n}</button>`).join('')}</div>
   <div class="sub">${have}/${list.length} collected · tap a card to inspect</div>
   <div class="binder-grid">${list.map(c => `<div class="cell ${s.owned[c.id] > 0 ? '' : 'missing'}" data-a="inspect" data-v="${c.id}">${cardImg(c.id)}${s.owned[c.id] > 0 ? `<span class="cnt">×${s.owned[c.id]}</span>` : ''}</div>`).join('')}</div>`;
}
function deckCounts(d) { const m = {}; for (const id of d) m[id] = (m[id] || 0) + 1; return m; }
function decksView() {
  const s = G.s, d = s.decks[UI.deck], probs = DeckRules.problems(d), owns = G.ownsDeck(d), cnt = deckCounts(d);
  const ids = Object.keys(cnt).sort((a, b) => (isMon(card(b)) - isMon(card(a))) || card(a).set.localeCompare(card(b).set) || card(a).num - card(b).num);
  const pool = Object.keys(s.owned).filter(id => s.owned[id] > 0 && card(id)).sort((a, b) => (isMon(card(b)) - isMon(card(a))) || Rarity.rank(card(b).rarity) - Rarity.rank(card(a).rarity) || card(a).name.localeCompare(card(b).name));
  return `<h1>Decks</h1><div class="seg">${s.decks.map((_, i) => `<button class="${UI.deck === i ? 'on' : ''}" data-a="deck" data-v="${i}">${esc(s.deckNames[i])}${s.activeDeck === i ? ' ★' : ''}</button>`).join('')}</div>
  <div class="panel"><div class="row"><div class="grow"><b>${d.length}/20</b> cards · ${d.map(card).filter(isMon).length} doremon</div>
   ${s.activeDeck === UI.deck ? '<span class="chip" style="background:var(--green)">Active</span>' : `<button class="btn sm g" data-a="setActive">Use</button>`}</div>
   <div class="small" style="margin:6px 0;color:${probs.length || !owns ? '#ff9b9b' : '#7dfc9f'}">${probs.length ? probs.map(esc).join('<br>') : owns ? 'Deck is legal ✓' : 'You no longer own every card in this deck.'}</div>
   <div class="row"><button class="btn sm p grow" data-a="autoBuild">Auto-build</button><button class="btn sm k grow" data-a="clearDeck">Clear</button></div></div>
  <div class="sub">In deck — tap to remove</div>
  <div class="list panel" style="padding:4px 12px">${ids.length ? ids.map(id => { const c = card(id); return `<div class="it" data-a="rm" data-v="${id}">${isMon(c) ? sprite(spriteId(c), 30) : '<span style="width:30px;text-align:center">✨</span>'}<div class="grow">${esc(c.name)} ${rar(c.rarity)}</div><b>×${cnt[id]}</b></div>`; }).join('') : '<div class="small" style="padding:10px 0">Empty deck.</div>'}</div>
  <div class="sub">Your cards — tap to add</div>
  <div class="grid3">${pool.map(id => { const left = s.owned[id] - (cnt[id] || 0); return `<div class="cell" data-a="add" data-v="${id}" style="opacity:${left > 0 ? 1 : .4}">${cardImg(id)}<span class="cnt">${left}/${s.owned[id]}</span></div>`; }).join('')}</div>`;
}
function battleSetupView() {
  const s = G.s, k = G.nextLeagueOpponent(), o = s.ai[k], ok = G.activeDeckValid;
  return `<h1>Battle</h1>${questsPanel(true)}${tourBanner()}<div class="sub">Deck: ${esc(s.deckNames[s.activeDeck])} ${ok ? '✓' : '<span style="color:#ff9b9b">(not legal — fix it in Decks)</span>'}</div>
  <div class="panel" style="text-align:center"><div class="pix" style="color:var(--yellow)">RANKED MATCH</div>
   <div style="margin:10px 0">${sprite(o.avatar, 90)}</div><div class="title" style="font-size:26px">${esc(o.name)}</div>
   <div class="small">${o.mr} MR · ${tier(o.mr)} · ${o.wins}W ${o.losses}L · cash <span style="color:#7dfc9f">${money(o.money)}</span></div>
   <div class="small" style="margin:6px 0">You: ${s.mr} MR · ${tier(s.mr)} · streak ${s.streak}</div>
   <button class="btn y" style="width:100%" data-a="fight" data-v="L${k}" ${ok ? '' : 'disabled'}>Ranked Battle</button></div>
  <div class="sub">Friendly match (no MR)</div>
  <div class="grid3">${s.ai.map((p, i) => `<button class="btn k" style="flex-direction:column;padding:8px 4px" data-a="fight" data-v="F${i}" ${ok ? '' : 'disabled'}>${sprite(p.avatar, 44)}<span style="font-size:13px">${esc(p.name)}</span><span class="small">${p.mr}</span></button>`).join('')}</div>
  <div class="row" style="margin-top:12px"><button class="btn p grow" data-a="more" data-v="draft">🎲 Draft</button><button class="btn k grow" data-a="more" data-v="rules">How to play</button></div>`;
}
// ---------- Daily Adventures ----------
function questsPanel(compact) {
  const qs = G.quests;
  return `<div class="panel"><div class="row"><div class="title grow" style="font-size:20px;color:var(--yellow)">🗺 Daily Adventures</div><span class="small">new in ${clock(G.msToNextDay())}</span></div>
   ${qs.map(q => `<div class="row" style="margin-top:8px"><span style="font-size:20px">${q.done ? '✅' : '⬜'}</span><div class="grow"><div style="font-weight:700${q.done ? ';opacity:.7' : ''}">${esc(q.text)}</div><div class="bar" style="margin-top:3px"><i style="width:${q.have / q.need * 100}%"></i></div></div><span class="small" style="width:70px;text-align:right">${q.done ? `${SETICON[q.reward]} +1 pack` : `${q.have}/${q.need} · 🎁`}</span></div>`).join('')}
   ${compact ? '' : `<div class="small" style="margin-top:8px">Three adventures each league day. Each one pays a random booster pack (${SETS.map(k => esc(SET_NAMES[k])).join(', ')}) straight into your packs.</div>`}</div>`;
}
// ---------- Tournament ----------
function tourBanner() {
  const T = G.tour;
  if (!T) { const d = G.s.day, next = d + ((2 - d % 3) + 3) % 3; return `<div class="panel row small" data-a="more" data-v="tour" style="cursor:pointer"><span style="font-size:22px">🏆</span><span class="grow">Next tournament on league day <b style="color:#fff">${next}</b> · ${esc(SET_NAMES[G.tourSet(next)])} sponsored</span><span>›</span></div>`; }
  const tm = G.tourMatch();
  return `<div class="panel row" data-a="more" data-v="tour" style="cursor:pointer;border-color:var(--yellow)"><img src="${IMG['cards/pack_' + T.set.toLowerCase()]}" style="width:40px;image-rendering:pixelated" alt=""><div class="grow"><b style="color:var(--yellow)">TOURNAMENT TODAY</b><div class="small">${T.done ? `Champion: ${esc(G.nameOf(T.champion))}` : tm ? `Your ${tm.round} vs ${esc(G.s.ai[tm.opp].name)} (${tm.m.w[tm.m.p[0] === E.ME ? 0 : 1]}-${tm.m.w[tm.m.p[0] === E.ME ? 1 : 0]})` : T.entrants.includes(E.ME) ? 'You are out — watch the bracket' : 'Top 8 by MR only'}</div></div><span>›</span></div>`;
}
function tourView() {
  const T = G.tour, s = G.s;
  if (!T) return `<h1>Tournament</h1>${tourBanner()}<div class="panel small">Every third league day the top 8 trainers by MR play a one-day knockout: quarter-finals, semi-finals and a final, every match best of 3. The champion wins ${money(Game.TOUR_PRIZE)} and a pack from the sponsoring set. Matches you don't play by the end of the day are forfeited.</div>`;
  const nm = w => w === E.ME ? '<b style="color:var(--yellow)">You</b>' : esc(s.ai[w].name), av = w => sprite(w === E.ME ? 'axerupi' : s.ai[w].avatar, 26);
  const tm = G.tourMatch();
  const rounds = ['Quarter-finals', 'Semi-finals', 'Final'].map((t, ri) => { const R = T.rounds[ri];
    return `<div class="sub">${t}</div><div class="panel list" style="padding:4px 12px">${R ? R.map(m => `<div class="it">${av(m.p[0])}<span class="grow" style="${m.winner === m.p[0] ? 'font-weight:800' : m.winner != null ? 'opacity:.55' : ''}">${nm(m.p[0])}</span><b>${m.w[0]} - ${m.w[1]}</b><span class="grow" style="text-align:right;${m.winner === m.p[1] ? 'font-weight:800' : m.winner != null ? 'opacity:.55' : ''}">${nm(m.p[1])}</span>${av(m.p[1])}</div>${m.forfeit ? '<div class="small">forfeited</div>' : ''}`).join('') : '<div class="small" style="padding:8px 0">Waiting for the previous round…</div>'}</div>`; }).join('');
  const mine = tm ? (() => { const me = tm.m.p[0] === E.ME ? 0 : 1; return `<div class="panel" style="text-align:center"><div class="pix" style="color:var(--yellow)">YOUR ${tm.round.toUpperCase()} · BEST OF 3</div><div style="margin:8px 0">${sprite(s.ai[tm.opp].avatar, 70)}</div><div class="title" style="font-size:22px">${esc(s.ai[tm.opp].name)}</div><div class="small">${s.ai[tm.opp].mr} MR · series ${tm.m.w[me]}-${tm.m.w[1 - me]}</div>
    <button class="btn y" style="width:100%;margin-top:8px" data-a="fight" data-v="T${tm.opp}" ${G.activeDeckValid ? '' : 'disabled'}>Play game ${tm.m.w[0] + tm.m.w[1] + 1}</button><button class="btn k sm" style="margin-top:6px" data-a="tourForfeit">Withdraw</button></div>`; })() : '';
  return `<h1>Tournament</h1><div class="panel row"><img src="${IMG['cards/pack_' + T.set.toLowerCase()]}" style="width:64px;image-rendering:pixelated" alt=""><div class="grow"><div class="title" style="font-size:20px;color:var(--yellow)">${esc(SET_NAMES[T.set])} Cup</div><div class="small">League day ${T.day} · top 8 by MR · best of 3<br>Prize: ${money(Game.TOUR_PRIZE)} + a ${esc(SET_NAMES[T.set])} pack</div></div></div>
   ${T.done ? `<div class="panel row" style="border-color:var(--yellow)">${av(T.champion)}<div class="grow"><b style="color:var(--yellow)">🏆 CHAMPION</b><div>${nm(T.champion)}</div></div></div>` : ''}${mine}${rounds}<div class="small" style="margin-top:8px">Tournament games don't change MR. Matches you haven't played when the league day ends are forfeited.</div>`;
}
// ---------- Draft ----------
function draftView() {
  const D = G.s.draft, s = G.s;
  const who = w => w === E.ME ? 'You' : esc(s.ai[w].name), av = w => sprite(w === E.ME ? 'axerupi' : s.ai[w].avatar, 28);
  if (!D || (D.done && UI.draftNew)) return `<h1>Draft</h1><div class="sub">You and 6 trainers draft from one shared pool of 20 booster packs, snake order (1→7, then 7→1…), 20 picks each. Then play 3 games against the drafters seated after you.</div>
    ${D?.done ? '' : ''}<div class="panel small">Entry ${money(Game.DRAFT_FEE)} · ${money(150)} per win · go 3-0 for a free pack of the drafted set. Draft cards are played with, not kept. Every drafted deck has at least 8 doremon.</div>
    ${SETS.map(k => `<div class="panel row"><img src="${IMG['cards/pack_' + k.toLowerCase()]}" style="width:48px;image-rendering:pixelated" alt=""><b class="grow">${esc(SET_NAMES[k])}</b><button class="btn y sm" data-a="draftStart" data-v="${k}" ${s.money >= Game.DRAFT_FEE ? '' : 'disabled'}>Draft ${money(Game.DRAFT_FEE)}</button></div>`).join('')}`;
  const me = G.draftSeat(), mine = D.picks[me], mons = mine.filter(id => isMon(card(id))).length;
  const seats = `<div class="row wrap" style="gap:4px;margin-bottom:6px">${D.seats.map((w, i) => `<span class="chip" style="${D.order[D.pick] === i && G.draftPicking ? 'background:var(--yellow);color:#000' : w === E.ME ? 'border:1px solid var(--yellow)' : ''}">${i + 1}. ${who(w)} ${D.picks[i].length}</span>`).join('')}</div>`;
  const myPicks = `<div class="sub">Your picks (${mine.length}/20 · ${mons} doremon)</div><div class="row wrap" style="gap:4px">${mine.map(id => isMon(card(id)) ? `<span data-a="inspect" data-v="${id}">${sprite(spriteId(card(id)), 30)}</span>` : '<span style="font-size:22px">✨</span>').join('') || '<span class="small">None yet.</span>'}</div>`;
  if (G.draftPicking) {
    const cnt = deckCounts(D.pool), ids = Object.keys(cnt).sort((a, b) => (isMon(card(b)) - isMon(card(a))) || Rarity.rank(card(b).rarity) - Rarity.rank(card(a).rarity) || card(a).name.localeCompare(card(b).name));
    const need = G.draftNeedsMon(me);
    return `<h1>Draft · ${esc(SET_NAMES[D.set])}</h1><div class="sub">Pick ${Math.floor(D.pick / D.seats.length) + 1} of 20 · your pick! ${need ? '<b style="color:#ffb84d">You need doremon to reach 8.</b>' : ''}</div>${seats}
     <div class="grid3">${ids.map(id => { const ok = G.draftLegal(me, id); return `<div class="cell" data-a="${ok ? 'draftPick' : 'inspect'}" data-v="${id}" style="opacity:${ok ? 1 : .35}">${cardImg(id)}<span class="cnt">×${cnt[id]}</span></div>`; }).join('')}</div>${myPicks}
     <div class="small" style="margin-top:6px">Tap a card to draft it. Hold to read it.</div>`;
  }
  const op = G.draftOpponent();
  return `<h1>Draft · ${esc(SET_NAMES[D.set])}</h1>${seats}
   <div class="panel"><div class="pix" style="color:var(--yellow)">GAMES ${D.games.filter(Boolean).length}-${D.games.filter(x => !x).length}</div>
   ${D.games.map((w, i) => { const o = D.seats[(me + 1 + i) % D.seats.length]; return `<div class="row small" style="margin-top:6px">${av(o)}<span class="grow">Game ${i + 1} vs ${who(o)}</span><b style="color:${w ? '#7dfc9f' : '#ff9b9b'}">${w ? 'WIN' : 'LOSS'}</b></div>`; }).join('')}
   ${op ? `<div class="row" style="margin-top:10px">${av(op.who)}<div class="grow"><b>Game ${D.games.length + 1} vs ${who(op.who)}</b><div class="small">${op.deck.filter(id => isMon(card(id))).length} doremon drafted</div></div><button class="btn y" data-a="fight" data-v="D${op.who}">Play</button></div>` : ''}
   ${D.done ? `<div style="margin-top:10px"><b style="color:#7dfc9f">Prize: +${money(D.reward.cash)}</b>${D.reward.pack ? ` and a ${esc(SET_NAMES[D.reward.pack])} pack!` : ''}</div><button class="btn y" style="width:100%;margin-top:8px" data-a="draftNew">New draft</button>` : ''}</div>${myPicks}`;
}
// ---------- Trainers (Verified cards) ----------
function trainersView() {
  if (UI.trainer != null) {
    const t = G.trainerStats(UI.trainer), mp = t.mostPlayed ? card(t.mostPlayed) : null;
    const kv = (k, v) => `<div class="it"><span class="grow">${k}</span><b>${v}</b></div>`;
    return `<h1>Trainer</h1><div class="panel" style="text-align:center;border-color:#4fc3ff"><div class="pix" style="color:#4fc3ff">✔ VERIFIED TRAINER</div><div style="margin:10px 0">${avImg(t.avatar || (UI.trainer === E.ME ? G.picOf('me') : G.picOf(UI.trainer)), 90)}</div><div class="title" style="font-size:26px">${esc(t.name)}</div><div class="small">${esc(t.tier)} · ${t.mr} MR${UI.trainer !== E.ME ? ` · plays ${esc(E.persOf(UI.trainer).fav.join(' / '))} · ${esc(E.persOf(UI.trainer).style)}` : ''}</div></div>
     <div class="panel list" style="padding:4px 12px">${kv('Cash', `<span style="color:#7dfc9f">${money(t.money)}</span>`)}${kv('Binder', `${t.binder} / ${t.binderTotal} cards (${t.copies} copies)`)}${kv('Ranked games', t.games)}${kv('Record', `${t.wins}W ${t.losses}L · ${t.wins + t.losses ? Math.round(t.wins / (t.wins + t.losses) * 100) : 0}%`)}${kv('Win streak', t.streak)}${kv('Tournaments won', t.tourWins)}
      <div class="it"><span class="grow">Most played card</span>${mp ? `${isMon(mp) ? sprite(spriteId(mp), 30) : '✨'}<b data-a="inspect" data-v="${mp.id}">${esc(mp.name)} ×${t.mostPlayedN}</b>` : '<b>—</b>'}</div></div>
     <button class="btn k" style="width:100%" data-a="trainer" data-v="">‹ All trainers</button>`;
  }
  const lb = G.leaderboard;
  return `<h1>Trainers</h1><div class="sub">${lb.length} trainers in the league · tap one for their Verified card</div><div class="grid3">${lb.map(r => `<button class="btn k" style="flex-direction:column;padding:8px 4px${r.me ? ';border:2px solid var(--yellow)' : ''}" data-a="trainer" data-v="${r.k}">${avImg(r.avatar, 44)}<span style="font-size:13px">${esc(r.name)} <span style="color:#4fc3ff">✔</span></span><span class="small">${r.mr} · ${tier(r.mr)}</span></button>`).join('')}</div>`;
}
function moreView() {
  const m = UI.more;
  if (!m) {
    const T = G.tour, qd = G.quests.filter(q => q.done).length;
    const it = { battle: ['⚔️', 'Battle', 'Ranked & friendly'], league: ['🏆', 'League', 'Leaderboard'], spectate: ['📺', 'Spectate', 'Live matches'], tour: ['🥇', 'Tournament', T ? (T.done ? 'Finished today' : 'Today!') : 'Every 3rd day'], quests: ['🗺', 'Adventures', `${qd}/3 done`], draft: ['🎲', 'Draft', G.s.draft && !G.s.draft.done ? 'In progress' : `${money(Game.DRAFT_FEE)} entry`], trainers: ['🪪', 'Trainers', 'Verified stats'], shop: ['🛒', 'Shop', 'Packs · singles · sell'], auction: ['🔨', 'Auctions', `${G.s.auctions.length} listings`],
      profile: ['👤', 'Profile', 'Pic & coin'], market: ['📈', 'Market', 'Prices'], trades: ['🤝', 'Trades', `${G.s.offers.length} offer${G.s.offers.length === 1 ? '' : 's'}`], stats: ['📊', 'Stats', 'Career'], ach: ['🏅', 'Achievements', `${G.s.achievements.length}/${ACHIEVEMENTS.length}`], rules: ['📖', 'How to Play', 'Rules'] };
    const grp = (t, ks) => `<div class="gh">${t}</div><div class="tiles">${ks.map(k => { const [i, n, d] = it[k]; return `<button class="tile" data-a="more" data-v="${k}"><span class="ti">${i}</span><span class="tn">${n}</span><span class="td">${d}</span>${k === 'trades' && G.s.offers.length ? '<span class="dot"></span>' : ''}</button>`; }).join('')}</div>`;
    return `<h1>More</h1><div class="sub">Shop, play modes & settings</div>` + grp('Play', ['battle', 'quests', 'draft', 'tour', 'spectate', 'trainers']) + grp('Trading', ['shop', 'auction', 'market', 'trades']) + grp('Record', ['stats', 'ach', 'rules'])
      + `<div class="gh">Settings</div>` + audioPanel() + newGameBtn() + `<div class="small" style="margin-top:8px;text-align:center">Progress is saved on this device.</div>`;
  }
  const back = `<button class="btn k sm" data-a="more" data-v="" style="margin-bottom:8px">‹ Back</button>`;
  return back + ({ battle: battleSetupView, league: leagueView, profile: profileView, trades: tradesView, shop: shopView, market: marketView, ach: achView, rules: rulesView, auction: auctionView, spectate: spectateView, stats: statsView, tour: tourView, quests: () => `<h1>Daily Adventures</h1>` + questsPanel(false), draft: draftView, trainers: trainersView })[m]();
}
function leagueView() {
  const lb = G.leaderboard, sn = seasonOfDay(G.s.day), left = daysLeftInSeason(G.s.day), feat = seasonFeatured(sn);
  const top8 = lb.slice(0, 8);
  const hist = (G.s.seasonHistory || []).slice().reverse();
  return `<h1>League</h1><div class="sub">Season ${sn} · ${left} day${left === 1 ? '' : 's'} left · featured ${esc(feat)} · ${lb.length} trainers</div>
  <div class="panel" id="seasontracker"><div class="title" style="font-size:20px;color:var(--yellow)">Season Tracker</div>
    <div class="row" style="margin:6px 0;gap:10px;align-items:center">${avImg(feat, 48)}<div class="grow"><b>Season ${sn}</b> · featured <b>${esc(feat)}</b><div class="small">${left} league days left (seasons last ${SEASON_DAYS} days). Ranks reset every season.</div></div></div>
    <div class="small" style="color:var(--yellow);margin:6px 0 2px">Top 8 this season</div>
    <div class="list">${top8.map((r, i) => `<div class="it">${avImg(r.avatar, 36)}<div class="grow"><b>${i + 1}. ${esc(r.name)}</b>${r.me ? ' · you' : ''}<div class="small">${r.mr} MR</div></div></div>`).join('')}</div>
    <div class="small" style="margin-top:8px">End rewards: 1st 5 packs + $5,000 · 2nd 3 + $3,000 · 3rd 2 + $2,000 · 4th–8th 1 + $1,000 · plus season pic & gold coin</div>
  </div>
  ${hist.length ? `<div class="panel"><div class="title" style="font-size:18px;color:var(--yellow)">Past seasons</div>${hist.map(h => `<div style="margin:8px 0;border-top:1px solid #fff2;padding-top:6px"><div class="row" style="gap:8px;align-items:center">${avImg(h.featured, 32)}<b>Season ${h.season}</b><span class="small">featured ${esc(h.featured)}</span></div><div class="small">${(h.top8 || []).map((t, i) => `${i + 1}. ${esc(t.name)} (${t.mr})`).join(' · ')}</div></div>`).join('')}</div>` : ''}
  <div class="panel"><div class="row wrap" style="gap:4px">${TIERS.map(([n, v]) => `<span class="chip">${n} ${v ? v + '+' : ''}</span>`).join('')}</div><div class="small" style="margin-top:6px">A win always gains at least +15 MR (plus a streak bonus). Loss costs Elo points vs that opponent.</div></div>
  <div class="panel list" style="padding:4px 12px">${lb.map((r, i) => `<div class="it" data-a="trainerFrom" data-v="${r.k}" style="cursor:pointer;${r.me ? 'background:#ffd64022;margin:0 -12px;padding:8px 12px' : ''}">${avImg(r.avatar, 40)}<div class="grow"><b>${i + 1}. ${esc(r.name)}</b><div class="small">${r.mr} MR · ${r.w}-${r.l}</div></div></div>`).join('')}</div>
  ${DEBUG ? '<button class="btn k" style="width:100%" data-a="skipDay">[debug] Skip a day</button>' : ''}
  <div class="sub">Recent results</div><div class="panel list" style="padding:4px 12px">${G.s.recent.slice(0, 15).map(r => `<div class="it small"><span class="grow" style="color:#fff">${esc(r.a)} vs ${esc(r.b)}</span><span>${esc(r.winner)}${r.mrChange ? ` (${r.mrChange > 0 ? '+' : ''}${r.mrChange})` : ''}</span></div>`).join('') || '<div class="it small">No matches yet</div>'}</div>`;
}
function profileView() {
  const s = G.s, pics = [{ id: null, label: 'Default (Axerupi)', mon: 'axerupi' }, ...((s.seasonPics || []).map(n => ({ id: 'season:' + n, label: 'Season ' + n + ' · ' + seasonFeatured(n), mon: seasonFeatured(n) })))];
  const coins = [{ id: 'axerupi', label: 'Default Axerupi coin', mon: 'axerupi' }, ...((s.seasonCoins || []).map(n => ({ id: 'season:' + n, label: 'Season ' + n + ' gold · ' + seasonFeatured(n), mon: seasonFeatured(n) })))];
  const curP = s.profilePic, curC = s.coin || 'axerupi';
  return `<h1>Profile</h1><div class="sub">Equip a profile pic and a coin for the opening flip</div>
  <div class="panel" id="profiletab"><div class="row" style="gap:14px;align-items:center">${avImg(G.picOf('me'), 72)}${goldCoin(G.coinOf('me'), 64)}<div class="grow"><b>Your look</b><div class="small">Shown on the league ladder and when AIs face you. Season rewards unlock new pics and gold coins.</div></div></div></div>
  <div class="panel"><div class="title" style="font-size:18px;color:var(--yellow)">Profile pic</div>
    ${pics.map(p => `<button class="btn ${curP === p.id || (!curP && p.id === null) ? 'y' : 'k'} sm" style="width:100%;margin:4px 0;justify-content:flex-start;gap:10px" data-a="setPic" data-v="${p.id === null ? 'default' : p.id}">${avImg(p.mon, 36)}<span class="grow" style="text-align:left">${esc(p.label)}</span>${curP === p.id || (!curP && !p.id) ? '✓' : ''}</button>`).join('') || '<div class="small">Finish a season in the top 8 to earn pics.</div>'}
  </div>
  <div class="panel"><div class="title" style="font-size:18px;color:var(--yellow)">Coin</div>
    ${coins.map(c => `<button class="btn ${curC === c.id ? 'y' : 'k'} sm" style="width:100%;margin:4px 0;justify-content:flex-start;gap:10px" data-a="setCoin" data-v="${c.id}">${goldCoin(c.mon, 36)}<span class="grow" style="text-align:left">${esc(c.label)}</span>${curC === c.id ? '✓' : ''}</button>`).join('')}
  </div>`;
}
function tradesView() {
  const s = G.s;
  if (UI.counter) { const o = s.offers.find(x => x.id === UI.counter); if (o) { const opts = G.counterOptions(o); return `<h1>Counter</h1><div class="sub">Ask for a different card in exchange for your ${esc(card(o.want).name)} (${money(G.value(o.want))}).</div><div class="panel list" style="padding:4px 12px">${opts.map(id => `<div class="it" data-a="doCounter" data-v="${id}">${sprite(spriteId(card(id)), 30)}<div class="grow">${esc(card(id).name)} ${rar(card(id).rarity)}</div><b>${money(G.value(id))}</b></div>`).join('') || '<div class="small">Nothing they can spare.</div>'}</div><button class="btn k" data-a="cancelCounter">Cancel</button>`; } UI.counter = null; }
  return `<h1>Trades</h1><div class="sub">AI players send new offers every league day (every 2 hours).</div>` + (s.offers.length ? s.offers.map(o => { const p = s.ai.find(a => a.id === o.aiId); return `<div class="panel"><div class="row">${sprite(p.avatar, 34)}<b class="grow">${esc(p.name)}</b><span class="small">${esc(o.note)}</span></div>
   <div class="row" style="margin:10px 0;align-items:flex-start"><div class="grow" style="text-align:center"><div class="small">You get</div>${cardImg(o.give)}<b>${money(G.value(o.give))}</b></div><div style="align-self:center;font-size:24px">⇄</div><div class="grow" style="text-align:center"><div class="small">You give</div>${cardImg(o.want)}<b>${money(G.value(o.want))}</b></div></div>
   <div class="row"><button class="btn g sm grow" data-a="accept" data-v="${o.id}">Accept</button><button class="btn sm grow" data-a="counter" data-v="${o.id}" ${o.countered ? 'disabled' : ''}>Counter</button><button class="btn r sm grow" data-a="decline" data-v="${o.id}">Decline</button></div></div>`; }).join('') : '<div class="panel small">No offers right now. Play a battle to advance the day — AIs who want your cards will reach out.</div>');
}
function shopView() {
  const s = G.s, t = UI.shopTab;
  let body = '';
  if (t === 'packs') body = SETS.map(set => { const r = Packs.rule(set); return `<div class="panel row"><img src="${IMG['cards/pack_' + set.toLowerCase()]}" style="width:60px" alt=""><div class="grow"><b>${r.name}</b><div class="small">You have ${s.packs[set] || 0}</div></div><button class="btn y sm" data-a="buyPack" data-v="${set}" ${s.money >= r.price ? '' : 'disabled'}>${money(r.price)}</button></div>`; }).join('');
  if (t === 'singles' || t === 'supplies') { const list = t === 'singles' ? DB.cards.filter(isMon).sort((a, b) => G.value(b.id) - G.value(a.id)) : inSet('ST'); body = `<div class="panel list" style="padding:4px 12px">${list.map(c => `<div class="it">${isMon(c) ? sprite(spriteId(c), 30) : '✨'}<div class="grow" data-a="inspect" data-v="${c.id}">${esc(c.name)} ${rar(c.rarity)}<div class="small">own ${s.owned[c.id] || 0}</div></div><button class="btn sm" data-a="buySingle" data-v="${c.id}" ${s.money >= G.buyPrice(c.id) ? '' : 'disabled'}>${money(G.buyPrice(c.id))}</button></div>`).join('')}</div>`; }
  if (t === 'sell') { const list = Object.keys(s.owned).filter(id => G.sellableCount(id) > 0).sort((a, b) => G.sellPrice(b) - G.sellPrice(a)); body = `<button class="btn p" style="width:100%;margin-bottom:10px" data-a="sellDupes">Sell all dupes (keeps 3 of each)</button><div class="panel list" style="padding:4px 12px">${list.map(id => { const c = card(id); return `<div class="it">${isMon(c) ? sprite(spriteId(c), 30) : '✨'}<div class="grow">${esc(c.name)} ${rar(c.rarity)}<div class="small">${G.sellableCount(id)} spare</div></div><button class="btn g sm" data-a="sell" data-v="${id}">+${money(G.sellPrice(id))}</button></div>`; }).join('') || '<div class="small" style="padding:8px 0">Nothing spare to sell (you keep 1 of each doremon and what your decks use).</div>'}</div>`; }
  return `<h1>Shop</h1><div class="seg">${[['packs', 'Packs'], ['singles', 'Singles'], ['supplies', 'Supplies'], ['sell', 'Sell']].map(([k, n]) => `<button class="${t === k ? 'on' : ''}" data-a="shopTab" data-v="${k}">${n}</button>`).join('')}</div>${body}`;
}
function spark(h) { if (!h || h.length < 2) return ''; const mn = Math.min(...h), mx = Math.max(...h), rg = mx - mn || 1; const pts = h.map((v, i) => `${(i / (h.length - 1) * 70).toFixed(1)},${(22 - (v - mn) / rg * 20).toFixed(1)}`).join(' '); const up = h[h.length - 1] >= h[0]; return `<svg class="spark" viewBox="0 0 70 24"><polyline points="${pts}" fill="none" stroke="${up ? '#40c773' : '#f25252'}" stroke-width="2"/></svg>`; }
function marketView() {
  const ids = Object.keys(G.s.market).sort((a, b) => G.value(b) - G.value(a)); const top = G.topCard;
  return `<h1>Market</h1><div class="sub">Day ${G.s.day} · prices move with supply (packs opened) and demand (buys, trades, AI wants)</div>
  ${top ? `<div class="panel row">${sprite(spriteId(card(top)), 56)}<div class="grow"><div class="pix" style="color:var(--yellow)">TOP CARD</div><div class="title" style="font-size:22px">${esc(card(top).name)}</div><b>${money(G.value(top))}</b></div></div>` : ''}
  <div class="panel list" style="padding:4px 12px">${ids.map(id => { const c = card(id), ch = G.change(id); return `<div class="it" data-a="inspect" data-v="${id}">${sprite(spriteId(c), 28)}<div class="grow" style="min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}</div>${rar(c.rarity)}</div>${spark(G.s.market[id].history)}<div style="text-align:right;width:76px"><b>${money(G.value(id))}</b><div class="small" style="color:${ch > 0 ? '#40c773' : ch < 0 ? '#f25252' : 'var(--dim)'}">${ch > 0 ? '+' : ''}${(ch * 100).toFixed(1)}%</div></div></div>`; }).join('')}</div>`;
}
function ends(l) { const d = l.endDay - G.s.day; return d <= 1 ? `ends in ${clock(G.msToNextDay())}` : `ends in ${d} days (~${Math.round(((d - 1) * 120 + G.msToNextDay() / 60000))} min)`; }
function auctionView() {
  const s = G.s, t = UI.aTab || 'browse'; let body = '';
  const who = w => w === E.ME ? 'You' : esc(s.ai[w].name);
  const row = (l, btn) => { const c = card(l.card); return `<div class="it">${isMon(c) ? sprite(spriteId(c), 34) : '✨'}<div class="grow" data-a="inspect" data-v="${c.id}"><b>${esc(c.name)}</b> ${rar(c.rarity)}<div class="small">${l.kind === 'auction' ? '🔨 auction' : '🏷 fixed price'} · by ${who(l.seller)} · ${ends(l)} · value ${money(G.value(l.card))}</div>
    <div class="small">${l.kind === 'auction' ? (l.high ? `high bid <b style="color:#fff">${money(l.high.amt)}</b> by ${who(l.high.who)} · ${l.bids} bid(s)` : `start ${money(l.price)} · no bids`) : `price <b style="color:#fff">${money(l.price)}</b>`}</div></div>${btn}</div>`; };
  if (t === 'browse') { const ls = s.auctions.filter(l => l.seller !== E.ME).sort((a, b) => a.endDay - b.endDay);
    body = `<div class="panel list" style="padding:4px 12px">${ls.map(l => row(l, l.kind === 'auction' ? (l.high?.who === E.ME ? '<span class="rar" style="background:var(--green)">LEADING</span>' : `<button class="btn y sm" data-a="bid" data-v="${l.id}" ${s.money >= G.minBid(l) - (l.high?.who === E.ME ? l.high.amt : 0) ? '' : 'disabled'}>Bid ${money(G.minBid(l))}</button>`) : `<button class="btn g sm" data-a="buyNow" data-v="${l.id}" ${s.money >= l.price ? '' : 'disabled'}>Buy ${money(l.price)}</button>`)).join('') || '<div class="small" style="padding:8px 0">No listings right now. AIs list spare cards as days pass.</div>'}</div>`; }
  if (t === 'mine') { const ls = s.auctions.filter(l => l.seller === E.ME); const lead = s.auctions.filter(l => l.high?.who === E.ME);
    body = `<div class="sub">Your listings</div><div class="panel list" style="padding:4px 12px">${ls.map(l => row(l, !l.high ? `<button class="btn r sm" data-a="cancelListing" data-v="${l.id}">Cancel</button>` : '')).join('') || '<div class="small" style="padding:8px 0">Nothing listed.</div>'}</div>
    <div class="sub">Bids you're leading (${money(G.committed(E.ME))} held in escrow)</div><div class="panel list" style="padding:4px 12px">${lead.map(l => row(l, '')).join('') || '<div class="small" style="padding:8px 0">None.</div>'}</div>`; }
  if (t === 'sell') { const kind = UI.lKind || 'auction', days = UI.lDays || 2; const list = Object.keys(s.owned).filter(id => G.sellableCount(id) > 0).sort((a, b) => G.value(b) - G.value(a));
    body = `<div class="seg">${[['auction', 'Auction'], ['fixed', 'Fixed price']].map(([k, n]) => `<button class="${kind === k ? 'on' : ''}" data-a="lKind" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="seg">${[1, 2, 3, 5].map(d => `<button class="${days === d ? 'on' : ''}" data-a="lDays" data-v="${d}">${d} day${d > 1 ? 's' : ''}</button>`).join('')}</div>
    <div class="small" style="margin-bottom:6px">${kind === 'auction' ? 'Set a starting price; highest bid when the timer ends wins. Bids are held in escrow.' : 'First buyer at your price gets it.'} Shop sell price shown for comparison.</div>
    <div class="panel list" style="padding:4px 12px">${list.map(id => { const c = card(id); return `<div class="it">${isMon(c) ? sprite(spriteId(c), 30) : '✨'}<div class="grow">${esc(c.name)} ${rar(c.rarity)}<div class="small">${G.sellableCount(id)} spare · value ${money(G.value(id))} · shop pays ${money(G.sellPrice(id))}</div></div><button class="btn y sm" data-a="listCard" data-v="${id}">List</button></div>`; }).join('') || '<div class="small" style="padding:8px 0">Nothing spare to list.</div>'}</div>`; }
  if (t === 'history') body = `<div class="panel list" style="padding:4px 12px">${s.auctionLog.map(x => `<div class="it small"><span>Day ${x.day}</span><span class="grow" style="color:#fff">${esc(card(x.card).name)}</span><span>${who(x.seller)} → ${who(x.buyer)}</span><b style="color:#7dfc9f">${money(x.price)}</b></div>`).join('') || '<div class="small" style="padding:8px 0">No sales yet.</div>'}</div>`;
  return `<h1>Auction House</h1><div class="sub">Day ${s.day} · you ${money(s.money)} · timers count league days · next day in ${clock(G.msToNextDay())}</div>
  <div class="seg">${[['browse', 'Browse'], ['mine', 'Mine'], ['sell', 'List a card'], ['history', 'Sold']].map(([k, n]) => `<button class="${t === k ? 'on' : ''}" data-a="aTab" data-v="${k}">${n}</button>`).join('')}</div>${body}
  ${DEBUG ? '<button class="btn k" style="width:100%;margin-top:10px" data-a="skipDay">[debug] Skip a day</button>' : ''}`;
}
function spectateView() {
  const s = G.s;
  return `<h1>Spectate</h1><div class="panel" style="text-align:center"><div class="pix" style="color:var(--yellow)">LIVE LEAGUE MATCHES</div><div class="small" style="margin:6px 0">A fresh pairing every time, never the same two trainers twice in a row. The result really counts: MR, cash and records.</div><button class="btn y" style="width:100%" data-a="watch" data-v="N">📺 Watch a live match</button></div>
  <div class="sub">Replays from league day ${s.lastDay?.[0]?.day ?? '—'}</div>
  <div class="panel list" style="padding:4px 12px">${(s.lastDay || []).map((m, i) => `<div class="it">${avImg(G.picOf(m.a), 30)}<div class="grow"><b>${esc(s.ai[m.a].name)}</b> vs <b>${esc(s.ai[m.b].name)}</b><div class="small">Day ${m.day}</div></div><button class="btn y sm" data-a="watch" data-v="R${i}">Watch</button></div>`).join('') || '<div class="small" style="padding:8px 0">No league matches yet — play or skip a day.</div>'}</div>
`;
}
const NEW_GAME_WARN = 'Start a new game?\n\nThis permanently erases ALL your cards, Dorebucks, MR, decks, stats, achievements and league progress on this device.\n\nEveryone (you and all 16 AI trainers) restarts equal: starter deck, $1500, 1000 MR and 2 WW + 1 FL packs.';
function audioPanel() {
  const c = AU.cfg, sl = (k, label) => `<div class="row" style="margin:6px 0"><span style="width:62px">${label}</span><input type="range" min="0" max="100" step="5" value="${Math.round(c[k] * 100)}" data-vol="${k}" class="grow vol"><b id="vl_${k}" style="width:48px;text-align:right">${Math.round(c[k] * 100)}%</b></div>`;
  return `<div class="panel" id="audiopanel"><div class="row"><div class="title grow" style="font-size:20px">🎵 Sound & Music</div><button class="btn sm ${c.mute ? 'r' : 'k'}" data-a="audio" data-v="mute">${c.mute ? '🔇 Muted' : '🔊 On'}</button></div>
   ${sl('music', 'Music')}${sl('sfx', 'Effects')}
   <div class="row" style="margin-top:6px"><span class="small grow">♪ Now playing: <b style="color:#fff" id="nowplaying">${esc(AU.nowPlaying || '—')}</b><br>Songs change on their own (menus rotate 3 songs, battles 4, including the calm Meadow Path and Lantern Tide).</span><button class="btn sm k" data-a="audio" data-v="next">⏭ Next song</button></div>
   <div class="small" style="margin-top:6px">All music and sounds are original and generated live on your device. On iPhone, flip the silent switch off to hear them.</div></div>`;
}
function newGameBtn() { return `<button class="btn r" data-a="reset" style="width:100%;margin-top:14px;font-size:18px">🔄 Start New Game</button>`; }
function statsView() {
  const s = G.s, t = s.stats, pct = (w, l) => w + l ? Math.round(w / (w + l) * 100) + '%' : '—';
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const kv = (k, v) => `<div class="it"><span class="grow">${k}</span><b>${v}</b></div>`;
  const panel = (title, rows) => `<div class="sub">${title}</div><div class="panel list" style="padding:4px 12px">${rows.join('')}</div>`;
  const order = ['MYT', 'LGD', 'SSR', 'SR', 'R', 'U', 'C', 'ITEM'];
  const bp = t.bestPull ? card(t.bestPull) : null;
  return `<h1>Stats</h1>` +
  (bp ? `<div class="panel row">${sprite(spriteId(bp), 56)}<div class="grow"><div class="pix" style="color:var(--yellow)">BEST PULL</div><div class="title" style="font-size:22px">${esc(bp.name)}</div>${rar(bp.rarity)} <span class="small">worth ${money(G.value(bp.id))}</span></div></div>` : '') +
  panel('Packs', [...SETS.map(k => kv(SET_NAMES[k] + ' opened', s.packsOpened[k] || 0)), kv('Packs bought', sum(t.packsBought)), kv('Cards pulled', t.cardsPulled)]) +
  panel('Pulls by rarity', order.filter(r => t.pulls[r]).map(r => kv(`${rar(r)} ${Rarity.name(r)}`, t.pulls[r]))) +
  panel('Battles', [['Ranked', t.battles.ranked], ['Friendly', t.battles.friendly]].map(([n, b]) => kv(n, `${b.w}W ${b.l}L${b.d ? ' ' + b.d + 'D' : ''} · ${pct(b.w, b.l)}`)).concat([kv('Total', `${s.wins}W ${s.losses}L · ${pct(s.wins, s.losses)}`), kv('MR now / peak', `${s.mr} / ${s.bestMr}`), kv('Win streak now / best', `${s.streak} / ${s.bestStreak}`)])) +
  panel('Dorebucks', [kv('Cash', money(s.money)), kv('Earned', `<span style="color:#7dfc9f">${money(sum(t.earned))}</span>`)].concat(Object.entries(t.earned).map(([k, v]) => kv('&nbsp;&nbsp;' + esc(k), money(v))), [kv('Spent', `<span style="color:#ff9b9b">${money(sum(t.spent))}</span>`)], Object.entries(t.spent).map(([k, v]) => kv('&nbsp;&nbsp;' + esc(k), money(v))))) +
  panel('Trading', [kv('Cards sold (shop + auction)', s.cardsSold), kv('Singles bought', s.singlesBought), kv('Auctions won', t.auctionsWon), kv('Auctions sold', t.auctionsSold), kv('Listings / bids placed', `${t.listings} / ${t.bids}`), kv('Trades done', s.trades), kv('Split-attack double KOs', s.splitKOs || 0), kv('Achievements', `${s.achievements.length}/${ACHIEVEMENTS.length}`)]) + newGameBtn();
}
function achView() {
  return `<h1>Achievements</h1><div class="sub">${G.s.achievements.length}/${ACHIEVEMENTS.length} unlocked</div><div class="panel list" style="padding:4px 12px">${ACHIEVEMENTS.map(a => { const on = G.s.achievements.includes(a.id); return `<div class="it" style="opacity:${on ? 1 : .55}"><span style="font-size:24px">${on ? '🏅' : '🔒'}</span><div class="grow"><b>${esc(a.title)}</b><div class="small">${esc(a.desc)} · ${esc(G.rewardText(a))}</div></div></div>`; }).join('')}</div>`;
}
const RULES = [
  ['Goal', 'Each player starts with 5 life ❤️. Every time one of your doremon is knocked out you lose 1 life. Get your opponent to 0 life to win.'],
  ['Setup', 'Decks are exactly 20 cards with at least 8 doremon (max 10 spells/traps). Copies: at most 2 of any card, and only 1 of a Legendary or Mythical. Shuffle and draw 5 (your opening hand always has a doremon).'],
  ['Coin toss', 'Before every match you call heads or tails. Call it right and you choose to go first or second; call it wrong and your opponent chooses (the AI always goes first). AI vs AI league matches use a coin toss too.'],
  ['Going second', 'To make up for not moving first, the first doremon the second player puts down gets a QUICK START: it can attack on the turn it is played. In 20,000 simulated games this brings going first to about 50%.'],
  ['Mulligan', 'After the coin toss you see your opening hand and may mulligan once for free: the whole hand goes back, the deck is shuffled and you draw the same number of cards again (still guaranteed a doremon). The AI mulligans hands with fewer than 2 doremon or no spells/traps.'],
  ['Move effects', 'Some moves have a side effect printed on the card, e.g. "30% chance to poison". It rolls when the move hits and the target survives without a status already.'],
  ['Your turn', 'Draw 1 card. Then in any order: play up to 1 doremon card into an empty DOREMON slot (6 slots), play up to 2 spell/trap cards, and attack. Hand limit is 10. Drawing from an empty deck costs 1 life.'],
  ['Take back', 'Misplayed? Tap a doremon you played this turn (marked ↩) or a trap you set this turn, then press ↩ Take back: the card returns to your hand and you get the play back. Not allowed once anything has happened to it (a spell or effect resolved on it) or after your turn ends. Instant spells resolve right away, so they can\'t be taken back.'],
  ['Attacking', 'Each of your doremon can attack once per turn, but not on the turn it was played. Tap your doremon (⚡ means ready), then tap an enemy doremon. If your opponent has no doremon on their mat, attack them directly for 1 life.'],
  ['Split attacks (Troublesome 2)', 'Some Troublesome 2 doremon split their attack. x2 DOUBLE HIT: hits the same target twice; if the first hit knocks it out, the second hit fizzles. SPLIT (forked arrow): hits up to 2 different enemy doremon once each — tap the first target, then a second one (or press Hit one only). The damage printed on the card is per hit. A trap springs once per attack and applies to the whole attack (a stopping trap stops every hit), and a confused attacker rolls once.'],
  ['Mirror Veil (protect)', 'The chosen doremon cannot be targeted by attacks until the start of your next turn. Poison/burn still tick. If every enemy doremon is protected you cannot attack at all (no direct hit either).'],
  ['Reprints & deck limit', 'A doremon can be printed in more than one set; each printing is its own card in the binder, market and auctions. The deck limit counts by doremon NAME: max 2 copies of a doremon across all printings (1 for Legendary/Mythical).'],
  ['Damage', "Damage = the move's power on the card × type effectiveness (the standard type chart: 2× super effective, ½ not very effective, 0 no effect; dual types multiply, so 4× is possible) × ATK/DEF stages, rounded to 10. Burned doremon deal half damage. Effectiveness uses the MOVE's type (shown on the card) vs the defender's type(s), not the attacker's own types. There is no same-type bonus: every move hits at its full listed power whatever doremon uses it."],
  ['Stages', 'ATK +1 = +50% damage, +2 = ×2. DEF +1 = take ⅔ damage, +2 = take half. Stages go from −4 to +4 and stay until the doremon leaves the mat.'],
  ['Spells', 'Played from your hand and resolved right away: Potion (heal 50), Super Potion (heal 100), Soothing Song (heal 30 on all), status cures (Antidote, Burn Heal, Paralyze Heal, Awakening, Full Heal) and buffs (Power Up, Iron Guard, Brace Up, Cheer On, Shield Pal). Troublesome 2 adds Mirror Veil (protect), Twin Remedy / Duo Bloom (heal your 2 most hurt doremon 60 / 100) and Twin War Cry (ATK +1 on your 2 strongest).'],
  ['Traps', 'Set face-down in a SPELL/TRAP slot (6 slots). When the enemy declares an attack, your leftmost trap springs: Guard Wall stalls them (no more attacks that turn), Bramble Shield blocks and hits back for 30, debuffs (Menace, Cute Growl, Metal Screech, Glare Down) and status traps (Static Web, Doze Spores stop the attack; Wisp Scorch, Venom Dust, Bewilder Beam). Troublesome 2 multi-traps hit the attacker AND its strongest teammate: Twin Growl (ATK −1), Double Glare (DEF −1), Toxic Spray (poison).'],
  ['Status', 'Poison: −20 HP at the end of its owner\'s turn. Burn: −10 HP each turn and half damage. Paralysis: can\'t attack for one turn. Sleep: can\'t attack; 50% to wake each turn, always wakes by the 2nd. Confusion: 50% to hit itself for 30 instead, lasts 2 turns.'],
  ['Rewards', 'Friendly win $150 (loss $30). Ranked win $300 + $25 per win streak (loss $60) and MR. A win is always worth at least +15 MR plus a streak bonus (+2 per win in a row, up to +8); a loss costs Elo points (less against a lower-rated trainer, never more than 24). Every league day everyone above 1000 MR gives back 2% of the excess. Tiers: Bronze, Silver 1050, Gold 1150, Platinum 1250, Diamond 1400, Master 1550.'],
  ['Tournaments', 'Every third league day the top 8 by MR play a best-of-3 knockout sponsored by one set (rotating). Champion: $2,000 and a pack of that set. No MR changes. Unplayed matches are forfeited when the day ends.'],
  ['Draft', 'Pay $300 to draft with 6 trainers from a shared pool of 20 packs in snake order, 20 picks each (at least 8 doremon guaranteed). Play 3 games with your draft deck: $150 per win, 3-0 earns a pack. Draft cards are not kept.'],
  ['Daily Adventures', 'Three small quests every league day. Each one completed pays a random booster pack.'],
  ['Packs', 'Every pack has 7 cards: 2 Commons, a Common-or-spell/trap slot (30% spell/trap), 1 guaranteed spell/trap, then 3 doremon slots where Uncommons, Rares and the chase cards live. Cheaper spells/traps drop more often. Pity guarantees a chase card if you go long enough without one.'],
  ['Dupes & selling', 'You always keep 3 copies of every card (2 for a deck + 1 spare to trade). Only copies beyond 3 count as dupes: those show up in Sell and get sold by Sell all dupes. Cards in your decks are never sold. The AIs follow the same rule.'],
  ['Ranked matchmaking', 'Your ranked opponent is picked at random, weighted toward players near your MR. You never face the same player twice in a row, and the last few opponents are much less likely to come up again.'],
  ['Seasons', 'A league season lasts 62 league days. Season 1 features Egmil. At season end the top 8 get packs, cash, that season\'s profile pic and a gold coin for the flip; then EVERY trainer\'s MR resets to 1000. Future seasons rotate a new featured doremon (no repeats until all are used).'],
  ['League days', 'The league runs in real time: a new league day starts every 2 hours (the countdown is under the top bar). Each day the AI players battle each other, open packs, trade, list and bid at the Auction House, and market prices move. Days keep passing while the app is closed and catch up when you come back (up to one week). Your own battles don\'t use up days.'],
  ['Auction House', 'List spare cards at a fixed price or as an auction lasting 1–5 league days. Bids are held in escrow and refunded the moment someone outbids you; when the timer ends the seller gets the winning bid and the winner gets the card. AIs list and bid too, using only their own cash.'],
  ['Fair play', 'The AI players open packs with the exact same function, odds and pity as you, shuffle the same way, build decks only from cards they own, and play by the same rules. They never see your hand, your deck order or which traps you set. Each AI has its own wallet: it earns the same battle rewards you do and pays for packs and bids out of it, and it never bids more than a card is worth to it or more than it can afford.'],
];
const tchip = t => { const [r, g, b] = E.DB.typeColors[t] || [120, 120, 120]; return `<span style="display:inline-block;background:rgb(${r},${g},${b});color:#fff;text-shadow:0 1px 1px #0008;border-radius:4px;padding:0 4px;margin:1px;font-size:12px;font-weight:700;line-height:17px">${t}</span>`; };
function typeGuideView() { const g = E.typeGuide(), chips = a => a.length ? a.map(tchip).join('') : '<span class="small">—</span>';
  return `<div class="panel" id="typeguide"><div class="title" style="font-size:20px;color:var(--yellow)">Type guide</div>
  <div style="font-weight:600;margin:4px 0 6px">The <b>move's</b> type is what counts (shown on the card), vs the defender's type(s). No same-type bonus. Dual types multiply.</div>
  <table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="text-align:left;color:var(--yellow)"><th style="padding:2px">Move</th><th>Strong vs (2×)</th><th>Weak vs (½×)</th></tr>
  ${g.map(r => `<tr style="border-top:1px solid #fff2;vertical-align:top"><td style="padding:3px 2px">${tchip(r.t)}</td><td>${chips(r.strong)}</td><td>${chips(r.weak)}${r.none.length ? `<div class="small" style="color:#ffb3b3">No effect: ${r.none.join(', ')}</div>` : ''}</td></tr>`).join('')}</table></div>`; }
function rulesView() { return `<h1>How to Play</h1><div class="sub">Doremonsters mat battles</div>` + RULES.map(([a, b]) => `<div class="panel"><div class="title" style="font-size:20px;color:var(--yellow)">${a}</div><div style="font-weight:500;margin-top:4px">${esc(b)}</div></div>`).join('') + typeGuideView(); }

// ---------- overlays: pack opening, inspector, result ----------
function renderOverlay() {
  document.querySelectorAll('.overlay').forEach(e => e.remove());
  const o = UI.overlay; if (!o) return;
  const d = document.createElement('div'); d.className = 'overlay'; d.dataset.a = 'ovTap';
  if (o.kind === 'pack') {
    const art = IMG['cards/pack_' + o.set.toLowerCase()];
    if (o.phase === 0) d.innerHTML = `<div class="pix" style="color:var(--yellow);margin-bottom:18px">TAP TO TEAR OPEN</div><div class="pack sealed" id="pk${o.n}"><img class="packart" src="${art}" alt=""><div class="shine"></div></div><div class="small" style="margin-top:14px">${esc(Packs.rule(o.set).name)} · 7 cards</div><img src="${packBack(o.set)}" style="width:64px;margin-top:8px;image-rendering:pixelated;opacity:.9" alt="pack back">`;
    else if (o.phase === 0.5) d.innerHTML = `<div class="pix" style="color:var(--yellow);margin-bottom:18px;visibility:hidden">.</div><div class="pack ripping"><img class="packart" src="${art}" alt=""><img class="packart top" src="${art}" alt=""><div class="burst"></div></div><div class="small" style="margin-top:14px;visibility:hidden">.</div>`;
    else if (o.phase === 1) { const c = o.cards[o.i], chase = Rarity.isChase(c.rarity), flipped = o.flipped;
      d.innerHTML = `<div class="pix" style="margin-bottom:12px">CARD ${o.i + 1} / 7</div><div class="reveal"><div class="flip ${flipped && !o.anim ? '' : 'back'} ${flipped && chase ? 'glow' : ''}" id="pflip" style="border-radius:6%/4.3%">${cardImg(c.id)}${flipped && Rarity.rank(c.rarity) >= 3 ? '<div class="holo"></div>' : ''}<img class="cardimg bk" src="${IMG['cards/card_back']}" alt=""></div></div>
      <div style="height:64px;margin-top:14px;text-align:center">${flipped ? `<div class="title" style="font-size:26px;color:${RCOL[c.rarity]}">${esc(c.name)}</div><div>${rar(c.rarity)} ${o.fresh.has(c.id) ? '<span class="rar" style="background:var(--green)">NEW!</span>' : ''}</div>` : '<div class="small">Tap to flip</div>'}</div>
      <button class="btn k sm" data-a="skipPack" style="margin-top:6px">Skip to summary</button>`; }
    else d.innerHTML = `<h1>${Packs.rule(o.set).name}</h1><div class="grid3" style="width:100%;max-width:420px;margin:8px 0 14px">${o.cards.map(c => `<div class="cell" style="position:relative">${cardImg(c.id)}${Rarity.rank(c.rarity) >= 3 ? '<div class="holo"></div>' : ''}${o.fresh.has(c.id) ? '<span class="badge">NEW</span>' : ''}</div>`).join('')}</div>
      <div class="row" style="width:100%;max-width:420px">${G.s.packs[o.set] > 0 ? `<button class="btn y grow" data-a="open" data-v="${o.set}">Open another (${G.s.packs[o.set]})</button>` : ''}<button class="btn grow" data-a="closeOv">Done</button></div>`;
  } else if (o.kind === 'inspect') {
    const c = card(o.id), owned = G.s.owned[c.id] || 0, m = o.live ? UI.battle?.b.sides[o.live.side].mons[o.live.i] : null;
    if (o.live || o.battle) {   // battle view: big card + readable text panel, no tilt/flip
      const stg = m ? [m.atk ? `Attack ${m.atk > 0 ? '+' : ''}${m.atk}` : '', m.def ? `Defense ${m.def > 0 ? '+' : ''}${m.def}` : '', m.status !== 'none' ? STATUS[m.status].join(' ') : ''].filter(Boolean).join(' · ') : '';
      d.innerHTML = `<div class="insp"><div class="inspc">${cardImg(c.id)}${Rarity.rank(c.rarity) >= 3 ? '<div class="holo"></div>' : ''}</div>
        <div class="inspt"><div class="title" style="font-size:24px;color:${RCOL[c.rarity] || '#fff'}">${esc(c.name)} ${rar(c.rarity)}</div>
        ${isMon(c) ? `<div class="kv"><span>Type</span><b>${c.types.join(' / ')}</b></div><div class="kv"><span>HP</span><b>${m ? `${m.hp} / ${c.hp}` : c.hp}</b></div><div class="kv"><span>Move</span><b>${esc(c.move)} · ${c.dmg}${isDouble(c) ? '×2' : ''} dmg (${c.moveType})</b></div>${c.split ? `<div class="kv"><span>Split</span><b style="color:#7ee0ff">${isDouble(c) ? 'Double hit: strikes the same target twice' : 'Hits up to 2 different targets'}</b></div>` : ''}${m && m.protected ? '<div class="kv"><span>Shield</span><b style="color:#7ee0ff">🛡 Protected — can\'t be targeted</b></div>' : ''}${stg ? `<div class="kv"><span>Now</span><b style="color:#ffb84d">${esc(stg)}</b></div>` : ''}${o.live ? `<div class="kv"><span>Side</span><b>${o.live.side === 0 ? 'Yours' : 'Opponent'}</b></div>` : ''}`
          : `<div class="kv"><span>Kind</span><b>${isTrap(c) ? 'Trap' : 'Spell'}</b></div><div class="txt">${esc(c.text || '')}</div>`}
        </div></div><button class="btn" data-a="closeOv" style="margin-top:12px;min-width:160px">Close</button>`;
      document.body.appendChild(d); return;
    }
    d.innerHTML = `<div class="reveal" id="tilt" style="width:74vw;max-width:320px"><div class="flip ${o.back ? 'back' : ''}" id="tiltc">${cardImg(c.id)}${Rarity.rank(c.rarity) >= 3 && !o.back ? '<div class="holo"></div>' : ''}<img class="cardimg bk" src="${IMG['cards/card_back']}" alt=""></div></div>
      <div style="text-align:center;margin-top:12px"><div class="title" style="font-size:24px">${esc(c.name)}</div><div class="small">${rar(c.rarity)} · ${c.set} #${c.num} · owned ${owned} · value ${money(G.value(c.id))}${isMon(c) ? ` · ${c.types.join('/')} · HP ${c.hp} · ${esc(c.move)} ${c.dmg}${isDouble(c) ? '×2' : ''} (${c.moveType})${isSpread(c) ? ' · split: 2 targets' : ''}` : c.text ? ' · ' + esc(c.text) : ''}</div></div>
      <div class="row" style="margin-top:12px"><button class="btn k sm" data-a="flipInspect">Flip</button><button class="btn sm" data-a="closeOv">Close</button></div>`;
  } else if (o.kind === 'result') {
    d.innerHTML = `<div class="logo" style="font-size:52px;color:${o.won ? 'var(--yellow)' : o.won === false ? 'var(--red)' : '#fff'}">${o.won ? 'VICTORY!' : o.won === false ? 'DEFEAT' : 'DRAW'}</div>
      <div style="margin:10px 0">${sprite(o.won ? 'axerupi' : o.avatar, 100)}</div>
      <div class="panel" style="text-align:center;width:100%;max-width:360px">${o.note ? `<div style="font-size:18px;font-weight:800;color:var(--yellow)">${esc(o.note)}</div>` : `<div style="font-size:20px;color:#7dfc9f">+${money(o.bucks)}</div>`}${o.league ? `<div style="margin-top:4px">MR ${o.d >= 0 ? '+' : ''}${o.d} → <b style="color:var(--yellow)">${G.s.mr}</b> (${tier(G.s.mr)})</div>` : `<div class="small">${{ tour: 'Tournament game · no MR', draft: 'Draft game · no MR' }[o.mode] || 'Friendly match'}</div>`}<div class="small" style="margin-top:4px">KOs: you ${o.ko[0]} · them ${o.ko[1]}</div></div>
      <button class="btn y" data-a="leaveBattle" style="width:100%;max-width:360px">Continue</button>`;
  } else if (o.kind === 'mulligan') { d.innerHTML = mulliganHTML();
  } else if (o.kind === 'coin') {
    d.innerHTML = coinHTML(o);
    if (o.phase === 'spin') requestAnimationFrame(() => requestAnimationFrame(() => { const c = document.getElementById('coin'); if (c) { c.style.transition = 'transform 1.6s cubic-bezier(.2,.7,.25,1)'; c.style.transform = `rotateY(${o.result === 'heads' ? 1800 : 1980}deg)`; } }));
  } else if (o.kind === 'log') {
    d.innerHTML = `<h1>Battle log</h1><div class="panel log" style="max-width:420px">${o.lines.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div><button class="btn" data-a="closeOv">Close</button>`;
  }
  document.body.appendChild(d);
  // animate the card turning over (render it face-down first, then flip on the next frame)
  if (o.kind === 'pack' && o.anim) { o.anim = false; const f = document.getElementById('pflip'); f.getBoundingClientRect(); requestAnimationFrame(() => f.classList.remove('back')); }
  if (o.kind === 'inspect') { const t = $('#tilt'), c = $('#tiltc'); t.addEventListener('touchmove', ev => { const r = t.getBoundingClientRect(), p = ev.touches[0]; const x = (p.clientX - r.left) / r.width - .5, y = (p.clientY - r.top) / r.height - .5; c.style.transform = `${o.back ? 'rotateY(180deg) ' : ''}rotateX(${-y * 22}deg) rotateY(${x * 22}deg)`; ev.preventDefault(); }, { passive: false }); t.addEventListener('touchend', () => { c.style.transform = ''; }); }
}
function showAchievements() {
  if (!G.newAchievements.length || document.querySelector('.toast')) return;
  const a = G.newAchievements.shift(); const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<div class="row"><span style="font-size:30px">🏅</span><div><div class="pix" style="color:var(--yellow)">ACHIEVEMENT UNLOCKED</div><div class="title" style="font-size:22px">${esc(a.title)}</div><div class="small">${esc(a.desc)} · Reward: ${esc(G.rewardText(a))}</div></div></div>`;
  document.body.appendChild(t); setTimeout(() => { t.remove(); showAchievements(); }, 2800);
}

// ---------- battle ----------
// coin toss before every match: call it; win → you choose first/second, lose → the AI chooses (it goes first: ~60% win rate in playtests)
function startBattle(v) { UI.overlay = { kind: 'coin', v, phase: 'call', result: G.rng.int(2) ? 'heads' : 'tails' }; render(); }
function coinCall(call) {
  const o = UI.overlay; o.call = call; o.won = call === o.result; o.phase = 'spin'; sfx('coin'); renderOverlay();
  setTimeout(() => { if (UI.overlay !== o) return; o.phase = o.won ? 'choose' : 'ai'; sfx(o.won ? 'coinWin' : 'coinLose'); renderOverlay(); }, SNAP ? 0 : 1700);
}
function coinHTML(o) {
  const face = (cls, label, icon) => `<div class="cf ${cls}"><div class="ci">${icon}</div><div class="cl">${label}</div></div>`;
  const spin = o.phase === 'spin', rot = (o.result === 'heads' ? 1800 : 1980);
  const myCoin = G.coinOf('me'); const coinFace = myCoin === 'axerupi' ? sprite('axerupi', 54) : goldCoin(myCoin, 54);
  const coin = `<div class="coinwrap"><div class="coin" id="coin" style="transform:rotateY(${spin ? 0 : rot}deg)">${face('h', 'HEADS', coinFace)}${face('t', 'TAILS', '★')}</div></div>`;
  const opp = G.s.ai[+o.v.slice(1)].name, what = { L: 'RANKED', F: 'FRIENDLY', T: 'TOURNAMENT', D: 'DRAFT' }[o.v[0]];
  let body = '';
  if (o.phase === 'call') body = `<div class="title" style="font-size:24px;margin-bottom:10px">Call it!</div><div class="row" style="width:100%;max-width:340px"><button class="btn y grow" data-a="coinCall" data-v="heads">Heads</button><button class="btn p grow" data-a="coinCall" data-v="tails">Tails</button></div>`;
  else if (o.phase === 'spin') body = `<div class="small">You called ${o.call.toUpperCase()}…</div>`;
  else if (o.phase === 'choose') body = `<div class="title" style="font-size:24px;color:var(--yellow)">${o.result.toUpperCase()}! You won the toss</div><div class="small" style="margin:4px 0 10px">Choose who goes first</div><div class="row" style="width:100%;max-width:340px"><button class="btn y grow" data-a="coinGo" data-v="0">Go first</button><button class="btn k grow" data-a="coinGo" data-v="1">Go second</button></div>`;
  else body = `<div class="title" style="font-size:24px;color:#ff9b9b">${o.result.toUpperCase()} — you lost the toss</div><div class="small" style="margin:4px 0 10px">${esc(opp)} chooses to go first.</div><button class="btn y" style="width:100%;max-width:340px" data-a="coinGo" data-v="1">Start battle</button>`;
  return `<div class="pix" style="color:var(--yellow);margin-bottom:14px">${what} · COIN TOSS · vs ${esc(opp)}</div>${coin}<div style="text-align:center;margin-top:18px;width:100%;display:flex;flex-direction:column;align-items:center">${body}</div>
  ${o.phase === 'call' ? '<button class="btn k sm" style="margin-top:14px" data-a="closeOv">Cancel</button>' : ''}`;
}
// v = mode letter + AI index: L ranked, F friendly, T tournament game, D draft game
const MODE = { L: 'league', F: 'friendly', T: 'tour', D: 'draft' };
function beginBattle(v, first) {
  const mode = MODE[v[0]], league = mode === 'league', k = +v.slice(1), o = G.s.ai[k];
  UI.overlay = null;
  let mine = G.activeDeckCards, theirs;
  if (mode === 'draft') { const op = G.draftOpponent(); mine = G.s.draft.picks[G.draftSeat()].map(card); theirs = op.deck.map(card); } else theirs = G.aiDeck(k);
  const b = new Battle(mine, 'You', theirs, o.name, G.rng.next(), first);
  BattleAI.openingMulligans(b, [1]);      // the AI decides first (it can't see your hand); then you get the prompt
  UI.battle = { b, k, league, mode, sel: null, ei: b.events.length, busy: false, floats: [], lines: b.events.filter(e => e.e === 'log').map(e => fixG(e.text)) };
  if (b.canMulligan(0)) UI.overlay = { kind: 'mulligan' };
  render(); if (!UI.overlay && b.current === 1) setTimeout(aiTurn, 700);
}
function mulliganHTML() {
  const b = UI.battle.b, h = b.sides[0].hand, mons = h.filter(isMon).length;
  return `<div class="pix" style="color:var(--yellow);margin-bottom:8px">YOUR OPENING HAND</div><div class="title" style="font-size:24px;margin-bottom:6px">Keep or mulligan?</div>
   <div class="small" style="margin-bottom:10px;text-align:center">${mons} doremon · ${h.length - mons} spell/trap · you go ${b.current === 0 ? 'FIRST' : 'SECOND (your first doremon gets a quick start)'}</div>
   <div class="mhand">${h.map(c => `<div class="mc" data-card="${c.id}">${cardImg(c.id)}</div>`).join('')}</div>
   <div class="small" style="margin:10px 0;text-align:center">A free mulligan shuffles this hand back and draws ${h.length} new cards (still at least one doremon). Once per game.</div>
   <div class="row" style="width:100%;max-width:360px"><button class="btn y grow" data-a="keepHand">Keep hand</button><button class="btn p grow" data-a="mulligan">Mulligan</button></div>`;
}
function slotHTML(side, i) {
  const B = UI.battle, b = B.b, S = b.sides[side], m = S.mons[i], me = side === 0, my = b.current === 0 && !B.busy && !b.over;
  let cls = 'slot', extra = '';
  const sel = B.sel;
  if (m) {
    cls += ' mon';
    if (me && (sel?.kind === 'mon' || sel?.kind === 'mon2' || sel?.kind === 'fresh') && sel.i === i) cls += ' sel';
    if (my && me && sel?.kind === 'hand') { const c = S.hand[sel.i]; if (isSpell(c) && b.isLegal({ t: 'spell', hand: sel.i, target: i })) cls += ' can'; }
    if (my && me && !sel && b.canPickAttacker(0, i)) cls += ' can';
    if (my && !me && (sel?.kind === 'mon' || sel?.kind === 'mon2')) { const a = b.sides[0].mons[sel.i];
      const first = sel.kind === 'mon2' && sel.t === i, ok = sel.kind === 'mon' ? b.isLegal({ t: 'attack', from: sel.i, to: i }) : first || b.isLegal({ t: 'attack', from: sel.i, to: sel.t, to2: i });
      if (a && ok) { const [dmg, ef] = Battle.damage(a, m); cls += first ? ' tgt t1' : ' tgt'; extra = `<span class="tg" style="color:${ef > 1 ? '#7dfc9f' : ef < 1 ? '#ffb3b3' : '#fff'};background:#000a;border-radius:4px;padding:0 3px">${first ? '① ' : sel.kind === 'mon2' ? '② ' : ''}-${dmg}${isDouble(a.card) ? '×2' : ''}${ef === 1 ? '' : ' ×' + (ef === 0.5 ? '½' : ef === 0.25 ? '¼' : ef)}</span>`; } }
    const pct = m.hp / m.card.hp * 100, col = pct > 50 ? 'var(--green)' : pct > 25 ? 'var(--yellow)' : 'var(--red)';
    const st = m.status !== 'none' ? `<span style="color:#ffb84d">${STATUS[m.status][0]}</span> ` : '';
    const stg = (m.atk ? `A${m.atk > 0 ? '+' : ''}${m.atk} ` : '') + (m.def ? `D${m.def > 0 ? '+' : ''}${m.def}` : '');
    const tag = extra || `<span class="tg">${m.protected ? '<span class="prot" title="Protected">🛡</span>' : ''}${st}${stg}${me && canAttack(m) && b.current === 0 && !S.stalled ? '⚡' : ''}${me && !B.spec && my && b.canUndo(0, 'mon', i) ? '<span class="undo">↩</span>' : ''}</span>`;
    const tc = E.DB.typeColors[m.card.types[0]];
    if (m.protected) cls += ' protected';
    return `<div class="${cls}" data-a="slot" data-v="${side}:${i}" data-card="${m.card.id}" id="s${side}${i}" style="--tc:${tc ? 'rgb(' + tc.join(',') + ')' : '#fff'}"><div class="sh"><span class="nm">${splitIcon(m.card)}${esc(m.card.name)}</span>${tag}</div><span class="sp" data-sp="${spriteId(m.card)}"></span><div class="hp"><i style="width:${pct}%;background:${col}"></i><span>${m.hp}/${m.card.hp}</span></div></div>`;
  }
  if (my && me && sel?.kind === 'hand' && isMon(S.hand[sel.i]) && b.isLegal({ t: 'playMon', hand: sel.i, slot: i })) cls += ' can';
  return `<div class="${cls}" data-a="slot" data-v="${side}:${i}" id="s${side}${i}"></div>`;
}
function stRow(side) {
  const B = UI.battle, b = B.b, S = b.sides[side], sel = B.sel;
  return `<div class="strow">${S.traps.map((t, i) => { let c = 'st' + (t ? ' set' : '') + (side === 0 && sel?.kind === 'ftrap' && sel.i === i ? ' sel' : '') + (side === 0 && !B.spec && b.current === 0 && b.canUndo(0, 'trap', i) ? ' fresh' : ''); if (side === 0 && sel?.kind === 'hand' && isTrap(S.hand[sel.i]) && b.isLegal({ t: 'setTrap', hand: sel.i, slot: i })) c += ' can'; return `<div class="${c}" data-a="st" data-v="${side}:${i}">${t ? (side === 0 ? esc(t.name.split(' ')[0]) + (c.includes('fresh') ? ' ↩' : '') : '?') : ''}</div>`; }).join('')}</div>`;
}
function battleView() {
  const B = UI.battle, b = B.b, me = b.sides[0], op = b.sides[1], o = B.spec ? { name: B.spec.nb, avatar: B.spec.ab } : G.s.ai[B.k], my = !B.spec && b.current === 0 && !b.over && !B.busy;
  const nA = B.spec ? esc(B.spec.na) : 'You', avA = B.spec ? B.spec.aa : 'axerupi';
  const prev = B.prevLife || [me.life, op.life];
  const hearts = (side, n) => `<span class="hearts" aria-label="${n} of ${Battle.startLife} hearts left">${Array.from({ length: Battle.startLife }, (_, i) => `<i class="ht ${i < n ? 'on' : i < prev[side] ? 'lost' : ''}">${HEART}</i>`).join('')}<b class="hn">${n}</b></span>`;
  B.prevLife = [me.life, op.life];
  let hint = '';
  if (B.spec) hint = b.over ? `🏆 ${esc(b.winner == null ? 'Draw' : b.winner === 0 ? B.spec.na : B.spec.nb)} wins!` : `Turn ${b.turnNumber} · ${esc(b.current === 0 ? B.spec.na : B.spec.nb)} to move`; else if (!my) hint = b.over ? '' : `${esc(o.name)} is thinking…`;
  else if (B.sel?.kind === 'hand') { const c = me.hand[B.sel.i]; hint = isMon(c) ? (me.monsPlayed ? 'Already played a doremon this turn' : 'Tap an empty slot on your mat') : isTrap(c) ? 'Tap a SPELL/TRAP slot to set it' : b.spellNeedsTarget(c) ? 'Tap one of your doremon' : ''; }
  else if (B.sel?.kind === 'fresh') hint = `Played this turn — take ${esc(me.mons[B.sel.i].card.name)} back to your hand?`;
  else if (B.sel?.kind === 'ftrap') hint = `Set this turn — pick ${esc(me.traps[B.sel.i].name)} back up?`;
  else if (B.sel?.kind === 'mon2') hint = `Split! Tap a 2nd target, or hit ${esc(op.mons[B.sel.t].card.name)} only`;
  else if (B.sel?.kind === 'mon') { const a = me.mons[B.sel.i]; hint = !monCount(op) ? 'No enemies — attack directly!' : !op.mons.some((x, j) => x && b.isLegal({ t: 'attack', from: B.sel.i, to: j })) ? 'Every enemy is protected — no attack this turn' : isSpread(a.card) ? 'Split attack: tap the 1st target' : isDouble(a.card) ? 'Double hit: tap an enemy to hit it twice' : 'Tap an enemy to attack'; }
  else if (b.turnNumber <= 2 && !G.s.seenHoldTip) hint = 'Tip: hold any card (or tap an enemy) to read it';
  else hint = `Turn ${b.turnNumber} · doremon ${me.monsPlayed}/1 · spell/trap ${me.stPlayed}/2${me.stalled ? ' · STALLED' : ''}`;
  const selC = B.sel?.kind === 'hand' ? me.hand[B.sel.i] : null;
  const castBtn = my && selC && isSpell(selC) && !b.spellNeedsTarget(selC) ? `<button class="btn y sm" data-a="cast">Cast ${esc(selC.name)}</button>` : '';
  const backBtn = my && (B.sel?.kind === 'fresh' || B.sel?.kind === 'ftrap' || (B.sel?.kind === 'mon' && b.canUndo(0, 'mon', B.sel.i))) ? `<button class="btn p sm" data-a="takeBack">↩ Take back</button>` : '';
  const selId = B.sel ? (B.sel.kind === 'hand' ? me.hand[B.sel.i]?.id : B.sel.kind === 'ftrap' ? me.traps[B.sel.i]?.id : me.mons[B.sel.i]?.card.id) : null;
  const infoBtn = selId ? `<button class="btn k sm" data-a="inspectB" data-v="${B.sel.kind === 'hand' || B.sel.kind === 'ftrap' ? 'c:' + selId : 'm:0:' + B.sel.i}" aria-label="Card details">ⓘ</button>` : '';
  const oneBtn = my && B.sel?.kind === 'mon2' ? `<button class="btn r sm" data-a="hitOne">Hit one only</button>` : '';
  const directBtn = my && B.sel?.kind === 'mon' && b.isLegal({ t: 'attack', from: B.sel.i, to: null }) ? `<button class="btn r sm" data-a="direct">Direct attack!</button>` : '';
  const top = B.spec ? `<div class="top" style="padding-bottom:4px"><button class="btn k sm" data-a="leaveSpec">✕</button><div class="grow" style="text-align:center;font-weight:800">📺 ${B.spec.title}</div><button class="btn k sm" data-a="log">Log</button></div>`
    : `<div class="top" style="padding-bottom:4px"><button class="btn k sm" data-a="forfeit">✕</button><div class="grow" style="text-align:center;font-weight:800">${{ league: 'Ranked', friendly: 'Friendly', tour: 'Tournament', draft: 'Draft' }[B.mode] || 'Friendly'} vs ${esc(o.name)}</div><button class="btn k sm" data-a="log">Log</button></div>`;
  const handA = B.spec ? me.hand.map(() => `<div class="hc dis">${`<img class="cardimg" src="${IMG['cards/card_back']}" alt="">`}</div>`).join('') : null;
  const bar = B.spec ? `<div class="bbar">${[0.5, 1, 2, 4].map(x => `<button class="btn sm ${B.spec.speed === x ? 'y' : 'k'}" data-a="specSpeed" data-v="${x}">${x}×</button>`).join('')}<span class="grow"></span><button class="btn sm" data-a="specPause">${B.spec.paused ? '▶' : '⏸'}</button><button class="btn sm k" data-a="specStep" ${B.spec.paused && !b.over ? '' : 'disabled'}>Step</button>${b.over && B.spec.rec?.live ? '<button class="btn sm y" data-a="watch" data-v="N">Next match ▶</button>' : ''}</div>
   <div class="panel log" style="max-height:92px;overflow:auto;margin:4px 0 calc(var(--sb) + 6px);font-size:13px;padding:6px 10px;flex:none">${B.lines.slice(-8).reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div>` : null;
  return `${top}
  <div class="bt">
   <div class="bhead">${sprite(o.avatar, 26)}<b class="bn">${esc(o.name)}</b>${hearts(1, op.life)}<span class="grow"></span><span class="small">✋${op.hand.length} · 🂠${op.deck.length}</span></div>
   ${stRow(1)}
   <div class="mat op" id="matop"><div class="lbl">DOREMON</div>${[3, 4, 5, 0, 1, 2].map(i => slotHTML(1, i)).join('')}</div>
   <div class="prev">${hint}</div>
   <div class="mat me" id="matme"><div class="lbl">DOREMON</div>${[0, 1, 2, 3, 4, 5].map(i => slotHTML(0, i)).join('')}</div>
   ${stRow(0)}
   <div class="bhead">${sprite(avA, 26)}<b class="bn">${nA}</b>${hearts(0, me.life)}<span class="grow"></span><span class="small">${B.spec ? `✋${me.hand.length} · ` : ''}🂠${me.deck.length}</span></div>
   ${bar ? bar : `<div class="hand">${me.hand.map((c, i) => { const can = my && (isMon(c) ? me.monsPlayed < 1 && monCount(me) < 6 : me.stPlayed < 2); return `<div class="hc ${B.sel?.kind === 'hand' && B.sel.i === i ? 'sel' : ''} ${can ? '' : 'dis'}" data-a="hand" data-v="${i}" data-card="${c.id}">${cardImg(c.id)}</div>`; }).join('')}</div>
   <div class="bbar">${infoBtn}${castBtn}${backBtn}${oneBtn}${directBtn}<span class="grow"></span><button class="btn y" data-a="endTurn" ${my ? '' : 'disabled'}>End turn</button></div>`}
  </div>`;
}
// ---------- spectate ----------
function watch(v) {
  const s = G.s; let A, Bk, da, db, seed, first, title, rec = null;
  if (UI.battle?.spec) { settleSpec(UI.battle); clearTimeout(UI.battle.spec.timer); }
  if (v[0] === 'R') { const m = s.lastDay[+v.slice(1)]; A = m.a; Bk = m.b; da = m.deckA.map(card); db = m.deckB.map(card); seed = BigInt(m.seed); first = m.first; title = `Replay · league day ${m.day}`; }
  else { rec = G.nextSpectate(); A = rec.a; Bk = rec.b; da = rec.deckA.map(card); db = rec.deckB.map(card); seed = BigInt(rec.seed); first = rec.first; title = `LIVE · day ${s.day}`; }
  if (DeckRules.problems(da.map(c => c.id)).length) da = G.aiDeck(A); if (DeckRules.problems(db.map(c => c.id)).length) db = G.aiDeck(Bk);
  const b = new Battle(da, s.ai[A].name, db, s.ai[Bk].name, seed, first);
  BattleAI.openingMulligans(b);
  UI.battle = { b, k: Bk, league: false, sel: null, ei: b.events.length, busy: true, floats: [], lines: b.events.filter(e => e.e === 'log').map(e => e.text),
    spec: { na: s.ai[A].name, nb: s.ai[Bk].name, aa: G.picOf(A), ab: G.picOf(Bk), ca: G.coinOf(A), cb: G.coinOf(Bk), speed: 1, paused: false, title, timer: null, rec } };
  // opening flip uses each trainer's equipped coin (season gold coin if they earned one)
  UI.overlay = { kind: 'speccoin', a: A, b: Bk, ca: G.coinOf(A), cb: G.coinOf(Bk), na: s.ai[A].name, nb: s.ai[Bk].name, first };
  render();
  setTimeout(() => { if (UI.overlay?.kind === 'speccoin') { UI.overlay = null; render(); specTick(); } }, SNAP ? 0 : 2200);
}
function specStep() { const B = UI.battle; if (!B?.spec || B.b.over) return; const a = BattleAI.next(B.b); if (!B.b.apply(a)) B.b.apply({ t: 'end' }); drainEvents(); if (B.b.over) specDone(B); render(); return a; }
// a live match counts when it ends; leaving early plays the rest out instantly so the result still counts
function specDone(B) { const r = B.spec.rec; if (!r || r.counted) return; const d = G.finishSpectate(r, B.b.winner, B.b); if (B.b.winner != null && !SNAP) banner(`${B.b.winner === 0 ? B.spec.na : B.spec.nb} +${d} MR`); }
function settleSpec(B) { if (!B?.spec?.rec || B.spec.rec.counted) return; for (let n = 0; n < 3000 && !B.b.over; n++) { const a = BattleAI.next(B.b); if (!B.b.apply(a)) B.b.apply({ t: 'end' }); } if (!B.b.over) B.b.finish(null); specDone(B); }
function specTick() { const B = UI.battle; if (!B?.spec) return; clearTimeout(B.spec.timer); if (B.spec.paused || B.b.over) return; const a = specStep(); B.spec.timer = setTimeout(specTick, (a && a.t === 'end' ? 350 : 800) / B.spec.speed); }
function afterBattleRender() {
  const B = UI.battle; if (!B) return;
  let box = null;     // all slots share one size: measure once, then fit every sprite into the same box
  document.querySelectorAll('.slot .sp[data-sp]').forEach(el => { if (!box) box = [el.clientWidth, el.clientHeight]; el.innerHTML = fitSprite(el.dataset.sp, box[0], box[1]); });
  for (const f of B.floats) { const el = document.getElementById(`s${f.side}${f.slot}`); if (!el) continue; const d = document.createElement('div'); d.className = 'float' + (f.heal ? ' heal' : ''); d.textContent = f.text; el.appendChild(d); if (!f.heal) el.classList.add('shake'); }
  B.floats = [];
}
function drainEvents() {
  const B = UI.battle, ev = B.b.events;
  for (; B.ei < ev.length; B.ei++) {
    const e = ev[B.ei];
    if (e.e === 'log') B.lines.push(fixG(e.text));
    else if (e.e === 'played') sfx(isMon(e.card) ? 'place' : 'flip');
    else if (e.e === 'set') sfx('trapSet');
    else if (e.e === 'damage') sfx(e.eff > 1 ? 'superHit' : 'hit'), B.floats.push({ side: e.side, slot: e.slot, text: `-${e.amount}${e.eff > 1 ? '!' : ''}` });
    else if (e.e === 'heal') B.floats.push({ side: e.side, slot: e.slot, text: `+${e.amount}`, heal: true });
    else if (e.e === 'stat') B.floats.push({ side: e.side, slot: e.slot, text: e.text, heal: true });
    else if (e.e === 'ko') setTimeout(() => sfx('ko'), 150), B.floats.push({ side: e.side, slot: e.slot, text: 'KO!' });
    else if (e.e === 'direct') sfx('superHit'), B.floats.push({ side: e.side, slot: 1, text: '-1 ❤️' });
    else if (e.e === 'trap') sfx('trapSpring'), banner(`TRAP! ${e.card.name}`);
  }
}
function banner(t) { if (SNAP) return; const d = document.createElement('div'); d.className = 'banner'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 1400); }
function act(a) { const B = UI.battle; if (!B.b.apply(a)) return false; B.sel = null; drainEvents(); render(); checkOver(); return true; }
function checkOver() {
  const B = UI.battle; if (!B || !B.b.over || UI.overlay) return;
  const w = B.b.winner, won = w == null ? null : w === 0;
  let bucks = 0, d = 0, note = '';
  if (B.mode === 'tour') { const m = G.tourGame(won); if (m) { const me = m.p[0] === E.ME ? 0 : 1; note = won == null ? 'Draw — replay this game' : m.winner == null ? `Series ${m.w[me]}-${m.w[1 - me]}` : m.winner === E.ME ? `You win the series ${m.w[me]}-${m.w[1 - me]}!${G.s.tour.champion === E.ME ? ' 🏆 CHAMPION!' : ''}` : `Knocked out ${m.w[me]}-${m.w[1 - me]}`; } }
  else if (B.mode === 'draft') { const D = G.draftResult(won); if (D) { const ww = D.games.filter(Boolean).length; note = D.done ? `Draft finished ${ww}-${D.games.length - ww} · +${money(D.reward.cash)}${D.reward.pack ? ' + a pack' : ''}` : `Draft record ${ww}-${D.games.length - ww}`; } else note = 'Draw — replay this game'; }
  else [bucks, d] = G.recordResult(won, B.league, B.k, B.b.splitKOs[0], Game.playedIds(B.b, 0));
  setTimeout(() => { sfx(won ? 'win' : 'lose'); UI.overlay = { kind: 'result', won, bucks, d, note, mode: B.mode, league: B.league, avatar: G.s.ai[B.k].avatar, ko: [B.b.sides[0].koCount, B.b.sides[1].koCount] }; render(); }, 900);
}
function aiTurn() {
  const B = UI.battle; if (!B || B.b.over) return;
  if (B.b.current !== 1) { B.busy = false; render(); return; }
  B.busy = true;
  let a = BattleAI.next(B.b);
  if (!B.b.apply(a)) B.b.apply({ t: 'end' });
  drainEvents(); render();
  if (B.b.over) { B.busy = false; checkOver(); return; }
  setTimeout(aiTurn, a && a.t === 'end' ? 300 : 650);
}
function tapSlot(side, i) {
  const B = UI.battle, b = B.b; if (B.spec || b.current !== 0 || B.busy || b.over) { inspectMon(side, i); return; }
  const me = b.sides[0], sel = B.sel;
  if (side === 0) {
    if (sel?.kind === 'hand') { const c = me.hand[sel.i];
      if (isMon(c) && act({ t: 'playMon', hand: sel.i, slot: i })) return;
      if (isSpell(c) && act({ t: 'spell', hand: sel.i, target: i })) return; }
    const m = me.mons[i];
    // a doremon that can attack is picked as the attacker FIRST - even if it was just played (quick start) and could
    // still be taken back (Take back stays available for it). Before this fix a just-played quick-start doremon could only
    // be selected for take-back, so going second you never got an attack option on your first turn.
    B.sel = tapOwnMonSel(b, 0, i, sel); render(); return;
  }
  if (sel?.kind === 'mon2' && b.sides[1].mons[i]) { if (i === sel.t) act({ t: 'attack', from: sel.i, to: i }); else if (!act({ t: 'attack', from: sel.i, to: sel.t, to2: i })) inspectMon(1, i); return; }
  if (sel?.kind === 'mon' && b.sides[1].mons[i]) {
    if (!b.isLegal({ t: 'attack', from: sel.i, to: i })) { if (b.sides[1].mons[i].protected) banner('🛡 Protected — pick another target'); return; }
    const a = me.mons[sel.i];
    if (isSpread(a.card) && b.sides[1].mons.some((x, j) => j !== i && x && b.isLegal({ t: 'attack', from: sel.i, to: i, to2: j }))) { B.sel = { kind: 'mon2', i: sel.i, t: i }; sfx('click'); render(); return; }
    act({ t: 'attack', from: sel.i, to: i }); }
  else if (b.sides[1].mons[i]) inspectMon(1, i);
}
// large readable card view during a battle (live HP / stages / status for doremon on the mat)
function inspectMon(side, i) { const m = UI.battle?.b.sides[side].mons[i]; if (!m) return; G.s.seenHoldTip = true; UI.overlay = { kind: 'inspect', id: m.card.id, back: false, live: { side, i } }; sfx('click'); renderOverlay(); }
function inspectCard(id) { G.s.seenHoldTip = true; UI.overlay = { kind: 'inspect', id, back: false, battle: !!UI.battle }; sfx('click'); renderOverlay(); }

// ---------- actions ----------
const A = {
  tab: v => { UI.tab = v; if (v !== 'more') UI.more = null; render(); $('#main').scrollTop = 0; },
  bset: v => { UI.binderSet = v; render(); },
  // every pack gets a brand-new overlay object (fresh sealed state, new animation key) - nothing carries over from the last one
  open: v => { const r = G.openPack(v); if (!r) return; UI.packN = (UI.packN || 0) + 1; UI.overlay = { kind: 'pack', n: UI.packN, set: v, cards: r.cards, fresh: r.fresh, phase: 0, i: 0, flipped: false }; render(); },
  buyPack: v => { if (G.buyPack(v)) sfx('buy'); render(); },
  ovTap: (v, ev) => { const o = UI.overlay; if (!o || ev.target.closest('button')) return;
    if (o.kind === 'pack') { if (o.phase === 0) { o.phase = 0.5; sfx('rip'); setTimeout(() => { if (UI.overlay === o && o.phase === 0.5) { o.phase = 1; renderOverlay(); } }, SNAP ? 0 : 700); } else if (o.phase === 0.5) return; else if (o.phase === 1) { if (!o.flipped) { o.flipped = true; o.anim = !SNAP; revealSfx(o.cards[o.i]); } else if (o.i < 6) { o.i++; o.flipped = false; } else o.phase = 2; } else return; renderOverlay(); }
    else if (o.kind === 'inspect' && ev.target === ev.currentTarget) { UI.overlay = null; renderOverlay(); } },
  coinCall: v => coinCall(v),
  coinGo: v => { const o = UI.overlay; beginBattle(o.v, +v); },
  takeBack: () => { const B = UI.battle, s = B.sel; if (!s) return; if (act({ t: 'undo', kind: s.kind === 'ftrap' ? 'trap' : 'mon', slot: s.i })) sfx('undo'); },
  audio: v => { const c = AU.cfg; sfx('click'); if (v === 'next') { AU.next(); return; } if (v === 'mute') c.mute = !c.mute; AU.saveCfg(); render(); },
  skipPack: () => { UI.overlay.phase = 2; renderOverlay(); },
  closeOv: () => { UI.overlay = null; render(); },
  inspectB: v => { const p = v.split(':'); if (p[0] === 'm') inspectMon(+p[1], +p[2]); else inspectCard(p.slice(1).join(':')); },
  inspect: v => { UI.overlay = { kind: 'inspect', id: v, back: false }; renderOverlay(); },
  flipInspect: () => { UI.overlay.back = !UI.overlay.back; renderOverlay(); },
  deck: v => { UI.deck = +v; render(); },
  setActive: () => { G.s.activeDeck = UI.deck; G.save(); render(); },
  autoBuild: () => { G.s.decks[UI.deck] = DeckRules.autoBuild(G.s.owned, G.rng); G.checkAchievements(); G.save(); render(); },
  clearDeck: () => { G.s.decks[UI.deck] = []; G.save(); render(); },
  rm: v => { const d = G.s.decks[UI.deck], i = d.lastIndexOf(v); if (i >= 0) d.splice(i, 1); G.save(); render(); },
  add: v => { const d = G.s.decks[UI.deck], n = d.filter(x => x === v).length, c = card(v); if (d.length >= 20 || n >= (G.s.owned[v] || 0) || n >= Rarity.copyLimit(c)) return; d.push(v); G.checkAchievements(); G.save(); const sc = $('#main').scrollTop; render(); $('#main').scrollTop = sc; },
  more: v => { UI.more = v || null; UI.trainer = null; UI.tab = 'more'; UI.counter = null; render(); $('#main').scrollTop = 0; },
  shopTab: v => { UI.shopTab = v; render(); },
  buySingle: v => { const sc = $('#main').scrollTop; sfx(G.buySingle(v) ? 'buy' : 'click'); render(); $('#main').scrollTop = sc; },
  sell: v => { const sc = $('#main').scrollTop; sfx(G.sell(v) ? 'sell' : 'click'); render(); $('#main').scrollTop = sc; },
  sellDupes: () => { const [n, t] = G.sellAllDupes(); sfx(n ? 'sell' : 'click'); alert(`Sold ${n} card(s) for ${money(t)}.`); render(); },
  accept: v => { const o = G.s.offers.find(x => x.id === v); if (o) G.acceptOffer(o); render(); },
  decline: v => { const o = G.s.offers.find(x => x.id === v); if (o) G.declineOffer(o); render(); },
  counter: v => { UI.counter = v; render(); },
  cancelCounter: () => { UI.counter = null; render(); },
  doCounter: v => { const o = G.s.offers.find(x => x.id === UI.counter); UI.counter = null; if (o) { const ok = G.counter(o, v); alert(ok ? 'Deal! Trade completed.' : 'They turned down your counter.'); } render(); },
  reset: () => { if (confirm(NEW_GAME_WARN)) { UI.more = ''; UI.tab = 'packs'; localStorage.removeItem(SAVE_KEY); G = new E.Game(storage()); hook(); render(); } },
  fight: v => startBattle(v),
  slot: v => { const [s, i] = v.split(':').map(Number); tapSlot(s, i); },
  st: v => { const B = UI.battle, [s, i] = v.split(':').map(Number); if (B.spec || B.busy || B.b.current !== 0 || s !== 0) return;
    if (B.sel?.kind === 'hand') { act({ t: 'setTrap', hand: B.sel.i, slot: i }); return; }
    if (B.b.canUndo(0, 'trap', i)) { B.sel = B.sel?.kind === 'ftrap' && B.sel.i === i ? null : { kind: 'ftrap', i }; render(); } },
  hand: v => { const B = UI.battle; if (B.b.current !== 0 || B.busy) return; const i = +v; B.sel = B.sel?.kind === 'hand' && B.sel.i === i ? null : { kind: 'hand', i }; render(); },
  cast: () => { const B = UI.battle; act({ t: 'spell', hand: B.sel.i, target: null }); },
  hitOne: () => { const B = UI.battle, s = B.sel; if (s?.kind === 'mon2') act({ t: 'attack', from: s.i, to: s.t }); },
  packFlip: v => { UI.packBack = UI.packBack === v ? null : v; sfx('flip'); render(); },
  direct: () => { const B = UI.battle; act({ t: 'attack', from: B.sel.i, to: null }); },
  endTurn: () => { const B = UI.battle; B.sel = null; if (act({ t: 'end' }) && !B.b.over) setTimeout(aiTurn, 500); },
  log: () => { UI.overlay = { kind: 'log', lines: UI.battle.lines }; renderOverlay(); },
  forfeit: () => { const B = UI.battle; if (B.b.over) return; if (!confirm('Forfeit this match? It counts as a loss.')) return; B.b.finish(1); drainEvents(); checkOver(); },
  leaveSpec: () => { const B = UI.battle; if (B?.spec) { clearTimeout(B.spec.timer); settleSpec(B); } UI.battle = null; UI.overlay = null; UI.tab = 'more'; UI.more = 'spectate'; render(); },
  specSpeed: v => { UI.battle.spec.speed = +v; render(); specTick(); },
  specPause: () => { const S = UI.battle.spec; S.paused = !S.paused; render(); specTick(); },
  specStep: () => specStep(),
  watch: v => watch(v),
  setPic: (e, v) => { G.setProfilePic(v === 'default' ? null : v); render(); },
  setCoin: (e, v) => { G.setCoin(v); render(); },
  skipDay: () => { G.skipDay(); banner(`Day ${G.s.day}`); render(); },
  aTab: v => { UI.aTab = v; render(); }, lKind: v => { UI.lKind = v; render(); }, lDays: v => { UI.lDays = +v; render(); },
  bid: v => { const l = G.s.auctions.find(x => x.id === v); if (!l) return; const min = G.minBid(l); const r = SNAP ? min : prompt(`Your bid for ${card(l.card).name} (minimum ${money(min)}). The cash is held until you're outbid or the auction ends.`, min); if (r == null) return; const amt = Math.round(+String(r).replace(/[$,]/g, '')); if (!G.bid(E.ME, v, amt)) alert(amt < min ? `Bid at least ${money(min)}.` : 'Not enough cash.'); render(); },
  buyNow: v => { const l = G.s.auctions.find(x => x.id === v); if (l && confirm(`Buy ${card(l.card).name} for ${money(l.price)}?`)) { if (G.buyNow(E.ME, v)) sfx('buy'); G.checkAchievements(); } render(); },
  cancelListing: v => { G.cancelListing(v); render(); },
  listCard: v => { const kind = UI.lKind || 'auction', days = UI.lDays || 2, def = kind === 'auction' ? Math.round(G.value(v) * 0.7) : G.value(v);
    const r = prompt(`${kind === 'auction' ? 'Starting bid' : 'Price'} for ${card(v).name} (market value ${money(G.value(v))}), ${days} day(s):`, def); if (r == null) return;
    const p = Math.round(+String(r).replace(/[$,]/g, '')); if (!(p > 0)) return; if (G.list(E.ME, v, kind, p, days)) banner('Listed!'); render(); },
  leaveBattle: () => { const m = UI.battle?.mode; UI.overlay = null; UI.battle = null; if (m === 'tour' || m === 'draft') { UI.tab = 'more'; UI.more = m; } else UI.tab = 'battle'; render(); },
  keepHand: () => { const b = UI.battle.b; UI.overlay = null; render(); if (b.current === 1) setTimeout(aiTurn, 600); },
  mulligan: () => { const B = UI.battle, b = B.b; b.redraw(0); sfx('flip'); drainEvents(); UI.overlay = null; render(); banner('Mulligan: new hand'); if (b.current === 1) setTimeout(aiTurn, 600); },
  tourForfeit: () => { if (!confirm('Withdraw from today\'s tournament? Your remaining match is forfeited.')) return; G.finishTour(true); G.save(); render(); },
  draftStart: v => { UI.draftNew = false; if (!G.startDraft(v)) alert('Not enough cash for the entry fee.'); else sfx('buy'); render(); },
  draftPick: v => { const sc = $('#main').scrollTop; if (G.draftPick(v)) sfx('flip'); render(); $('#main').scrollTop = Math.min(sc, 120); },
  draftNew: () => { UI.draftNew = true; render(); },
  trainer: v => { UI.trainer = v === '' || v == null ? null : +v; render(); $('#main').scrollTop = 0; },
  trainerFrom: v => { UI.more = 'trainers'; UI.trainer = +v; render(); $('#main').scrollTop = 0; },
};
// long-press any card (field or hand, yours or theirs) to read it
let lp = null, lpFired = false;
document.addEventListener('pointerdown', ev => { const t = ev.target.closest('[data-card]'); if (!t || UI.overlay) return; lpFired = false; clearTimeout(lp);
  lp = setTimeout(() => { lpFired = true; if (t.id && /^s\d\d$/.test(t.id)) inspectMon(+t.id[1], +t.id[2]); else inspectCard(t.dataset.card); navigator.vibrate?.(10); }, 450); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(n => document.addEventListener(n, () => clearTimeout(lp)));
document.addEventListener('scroll', () => clearTimeout(lp), true);
document.addEventListener('contextmenu', ev => { if (ev.target.closest('[data-card]')) ev.preventDefault(); });
document.addEventListener('click', ev => { if (lpFired) { lpFired = false; ev.stopPropagation(); ev.preventDefault(); return; } const t = ev.target.closest('[data-a]'); if (!t) return; if (t.disabled) return; if (t.tagName === 'BUTTON' && !NOCLICK.has(t.dataset.a)) sfx('click'); const f = A[t.dataset.a]; if (f) f(t.dataset.v, ev); });
const NOCLICK = new Set(['coinCall', 'takeBack', 'audio', 'open', 'buyPack', 'buySingle', 'sell', 'sellDupes', 'buyNow']);
// iOS Safari: audio may only start inside a user gesture, so unlock on every first touch/click until it is running
['pointerdown', 'touchend', 'keydown'].forEach(t => document.addEventListener(t, () => AU.unlock(), { passive: true }));
document.addEventListener('input', ev => { const t = ev.target; if (!t.dataset.vol) return; AU.cfg[t.dataset.vol] = +t.value / 100; AU.saveCfg(); const l = document.getElementById('vl_' + t.dataset.vol); if (l) l.textContent = t.value + '%'; });
document.addEventListener('change', ev => { if (ev.target.dataset.vol === 'sfx') sfx('flip'); });
function revealSfx(c) { const r = c.rarity; sfx('flip'); if (r === 'SSR' || r === 'LGD' || r === 'MYT') setTimeout(() => sfx('fanfare'), 120); else if (r === 'SR') setTimeout(() => sfx('sparkle'), 100); }
function hook() { G.onChange = null; }

// ---------- demo states for screenshots (?snap=...) ----------
function demo() {
  G = new E.Game(null, 12345n); const g = G;
  g.s.money = 4200;
  for (let i = 0; i < 12; i++) { g.s.packs.WW = (g.s.packs.WW || 0) + 1; g.openPack('WW'); }
  for (let i = 0; i < 10; i++) { g.s.packs.FL = (g.s.packs.FL || 0) + 1; g.openPack('FL'); }
  for (let i = 0; i < 12; i++) { g.s.packs.T2 = (g.s.packs.T2 || 0) + 1; g.openPack('T2'); }
  for (let i = 0; i < 8; i++) { g.s.packs.HT = (g.s.packs.HT || 0) + 1; g.openPack('HT'); }
  g.s.owned.fl_seraphink = 1; g.s.owned.ww_badbulb = 2; g.s.owned.t2_peaflora = 1; g.s.owned.t2_blizzbear = 1; g.s.packs = { WW: 3, FL: 2, T2: 4, HT: 2 }; g.s.owned.ht_rampagoone = 1; g.s.owned.ht_emodoom = 1;
  for (let i = 0; i < 4; i++) { g.recordResult(i % 3 !== 2, true, g.nextLeagueOpponent()); g.skipDay(); }
  g.newAchievements = [];
  g.s.decks[1] = DeckRules.autoBuild(g.s.owned, g.rng); g.s.deckNames[1] = 'Deck 2';
  switch (SNAP) {
    case 'binder': UI.tab = 'binder'; UI.binderSet = 'FL'; break;
    case 'binder_t2': UI.tab = 'binder'; UI.binderSet = 'T2'; break;
    case 'packs': UI.tab = 'packs'; break;
    case 'packs_back': UI.tab = 'packs'; UI.packBack = 'T2'; setTimeout(() => { const el = document.querySelector('[data-a="packFlip"]'); if (el) el.scrollIntoView(); }, 50); break;
    case 't2_open': { UI.tab = 'packs'; UI.overlay = { kind: 'pack', set: 'T2', cards: [], fresh: new Set(), phase: 0 }; break; }
    case 't2_chase': { const ch = inSet('T2').filter(c => Rarity.isChase(c.rarity)); UI.overlay = { kind: 'pack', set: 'T2', cards: [...inSet('T2').slice(20, 23), ...ch], fresh: new Set(ch.map(c => c.id)), phase: 2 }; break; }
    case 't2_mythic': { const c = inSet('T2').find(c => c.rarity === 'MYT'); UI.overlay = { kind: 'pack', set: 'T2', cards: [c], fresh: new Set([c.id]), phase: 1, i: 0, flipped: true }; break; }
    case 'split_target': case 'split_pick2': case 'protect': {
      const f = Array(20).fill(card('ww_snarlpup')); const b = new Battle(f, 'You', f, g.s.ai[2].name, 31n, 0);
      const put = (sd, sl, id, o) => { b.sides[sd].mons[sl] = Object.assign(E.newMon(card(id)), { ready: true }, o || {}); };
      put(0, 0, 't2_drakaroo'); put(0, 1, 't2_bonkbob'); put(0, 2, 't2_peaflora'); put(1, 0, 'fl_swirlgon'); put(1, 1, 'ww_gruugy', { hp: 120 }); put(1, 2, 'ww_hootuft');
      if (SNAP === 'protect') b.sides[1].mons[2].protected = true;
      b.sides[0].hand = [card('st_mirror_veil'), card('st_twin_remedy'), card('t2_grinhorn'), card('st_toxic_spray')];
      UI.battle = { b, k: 2, league: true, sel: SNAP === 'split_target' ? { kind: 'mon', i: 0 } : { kind: 'mon2', i: 0, t: 1 }, ei: b.events.length, busy: false, floats: [], lines: [] };
      if (SNAP === 'protect') UI.battle.sel = { kind: 'mon', i: 1 };
      break; }
    case 'decks': UI.tab = 'decks'; UI.deck = 1; break;
    case 'battle_setup': UI.tab = 'battle'; break;
    case 'league': UI.tab = 'more'; UI.more = 'league'; break;
    case 'market': UI.tab = 'more'; UI.more = 'market'; break;
    case 'shop': UI.tab = 'more'; UI.more = 'shop'; UI.shopTab = 'singles'; break;
    case 'trades': UI.tab = 'more'; UI.more = 'trades'; if (!g.s.offers.length) { const k = 0, P = g.s.ai[k]; const give = Object.keys(P.owned).find(id => isMon(card(id)) && P.owned[id] > 1 && !(g.s.owned[id] > 0)) || 'ww_giggleti'; g.s.offers.push({ id: 'demo', aiId: P.id, give, want: 'ww_badbulb', countered: false, note: `${P.name} is building around Badbulb.` }); } break;
    case 'ach': UI.tab = 'more'; UI.more = 'ach'; break;
    case 'stats': UI.tab = 'more'; UI.more = 'stats'; break;
    case 'more': UI.tab = 'more'; break;
    case 'auction': case 'auction_mine': case 'auction_sell': { UI.tab = 'more'; UI.more = 'auction'; UI.aTab = { auction: 'browse', auction_mine: 'mine', auction_sell: 'sell' }[SNAP];
      const spare = Object.keys(g.s.owned).filter(id => g.sellableCount(id) > 0 && isMon(card(id))).sort((a, b) => g.value(b) - g.value(a));
      for (let i = 0; i < 6; i++) g.skipDay();
      if (spare[0]) g.list(E.ME, spare[0], 'auction', Math.round(g.value(spare[0]) * 0.5), 3); if (spare[1]) g.list(E.ME, spare[1], 'fixed', g.value(spare[1]) * 2, 3);
      g.auctionDay();
      const l = g.s.auctions.find(x => x.seller !== E.ME && x.kind === 'auction' && !x.high) || g.s.auctions.find(x => x.seller !== E.ME && x.kind === 'auction'); if (l) g.bid(E.ME, l.id, g.minBid(l)); break; }
    case 'spectate': UI.tab = 'more'; UI.more = 'spectate'; UI.specA = 2; UI.specB = 5; break;
    case 'season': {
      g.s.day = 62; g.s.lastSeasonEnded = 0; g.s.mr = 2200;
      g.s.ai.forEach((a, i) => { a.mr = 2100 - i * 40; });
      g.endSeasonIfNeeded(); UI.tab = 'more'; UI.more = 'league'; break; }
    case 'profile': {
      g.s.seasonPics = [1]; g.s.seasonCoins = [1]; g.s.profilePic = 'season:1'; g.s.coin = 'season:1';
      UI.tab = 'more'; UI.more = 'profile'; break; }
    case 'goldcoin': {
      g.s.coin = 'season:1'; UI.overlay = { kind: 'coin', v: 'L0', phase: 'call', result: 'heads' }; break; }
    case 'speccoin': {
      const w = 9; g.s.ai[w].coin = 'season:1'; g.s.ai[w].profilePic = 'season:1'; g.s.ai[w].seasonPics = [1]; g.s.ai[w].seasonCoins = [1];
      UI.overlay = { kind: 'speccoin', a: w, b: 0, ca: g.coinOf(w), cb: g.coinOf(0), na: g.s.ai[w].name, nb: g.s.ai[0].name, first: 0 }; break; }
    case 'ht_packs': UI.tab = 'packs'; break;
    case 'rules': UI.tab = 'more'; UI.more = 'rules'; break;
    case 'opening': { UI.tab = 'packs'; g.s.packs.FL++; const r = g.openPack('FL'); const fl = inSet('FL'); UI.overlay = { kind: 'pack', set: 'FL', cards: r.cards, fresh: r.fresh, phase: 0 }; break; }
    case 'reveal': { const fl = inSet('FL').filter(c => c.rarity === 'LGD'); UI.overlay = { kind: 'pack', set: 'FL', cards: inSet('FL').slice(-7), fresh: new Set([fl[0].id]), phase: 1, i: 6, flipped: true }; UI.overlay.cards[6] = fl[0]; break; }
    case 'summary': { UI.overlay = { kind: 'pack', set: 'FL', cards: inSet('FL').slice(-7), fresh: new Set(), phase: 2 }; break; }
    case 'inspect': UI.tab = 'binder'; UI.binderSet = 'FL'; UI.overlay = { kind: 'inspect', id: 'fl_spiraquill', back: false }; break;
    case 'battle': case 'battle_target': case 'binspect': {
      g.s.activeDeck = 1;
      const b = new Battle(g.activeDeckCards, 'You', g.aiDeck(2), g.s.ai[2].name, 777n, 0);
      UI.battle = { b, k: 2, league: true, sel: null, ei: 0, busy: false, floats: [], lines: [] };
      // play a few turns with the AI driving both sides to reach a mid-game board
      for (let n = 0; n < 400 && b.turnNumber < 7 && !b.over; n++) { const a = BattleAI.next(b); if (!b.apply(a)) b.apply({ t: 'end' }); }
      while (b.current !== 0 && !b.over) { const a = BattleAI.next(b); if (!b.apply(a)) b.apply({ t: 'end' }); }
      UI.battle.ei = b.events.length; UI.battle.lines = b.events.filter(e => e.e === 'log').map(e => fixG(e.text));
      if (SNAP === 'battle_target') { const i = b.sides[0].mons.findIndex(m => m && canAttack(m)); if (i >= 0) UI.battle.sel = { kind: 'mon', i }; }
      else if (SNAP === 'binspect') { const i = b.sides[1].mons.findIndex(m => m); setTimeout(() => inspectMon(1, i), 50); }
      else { const i = b.sides[0].hand.findIndex(isMon); if (i >= 0) UI.battle.sel = { kind: 'hand', i }; b.sides[1].life = 3; UI.battle.prevLife = [b.sides[0].life, 4]; }
      break; }
    case 'spectate_live': { UI.tab = 'more'; UI.more = 'spectate'; watch('R0'); const B = UI.battle; B.spec.paused = true; clearTimeout(B.spec.timer); B.spec.speed = 2;
      for (let n = 0; n < 400 && B.b.turnNumber < 9 && !B.b.over; n++) specStep(); break; }
    case 'coinflip': UI.tab = 'battle'; UI.overlay = { kind: 'coin', v: 'L' + g.nextLeagueOpponent(), phase: 'choose', result: 'heads', call: 'heads', won: true }; break;
    case 'settings': UI.tab = 'more'; setTimeout(() => { const el = document.getElementById('audiopanel'); if (el) el.scrollIntoView(); }, 50); break;
    case 'takeback': {
      const b = new Battle(g.activeDeckCards, 'You', g.aiDeck(2), g.s.ai[2].name, 778n, 0);
      UI.battle = { b, k: 2, league: true, sel: null, ei: 0, busy: false, floats: [], lines: [] };
      for (let n = 0; n < 400 && b.turnNumber < 5 && !b.over; n++) { const a = BattleAI.next(b); if (!b.apply(a)) b.apply({ t: 'end' }); }
      while (b.current !== 0 && !b.over) { const a = BattleAI.next(b); if (!b.apply(a)) b.apply({ t: 'end' }); }
      const S = b.sides[0]; let h = S.hand.findIndex(isMon); if (h < 0) { S.hand.push(card('fl_swirlgon')); h = S.hand.length - 1; }
      const slot = S.mons.findIndex(m => !m); b.apply({ t: 'playMon', hand: h, slot });
      const t = S.hand.findIndex(isTrap); if (t >= 0) b.apply({ t: 'setTrap', hand: t, slot: S.traps.findIndex(x => !x) });
      UI.battle.ei = b.events.length; UI.battle.lines = b.events.filter(e => e.e === 'log').map(e => fixG(e.text)); UI.battle.sel = { kind: 'fresh', i: slot }; break; }
    // ---- Nov 2 screens ----
    case 'fa_open': UI.tab = 'packs'; UI.overlay = { kind: 'pack', set: 'WW', cards: [], fresh: new Set(), phase: 0 }; break;
    case 'fa_back': UI.tab = 'packs'; UI.packBack = 'WW'; break;
    case 'fl_back': UI.tab = 'packs'; UI.packBack = 'FL'; setTimeout(() => { const el = document.querySelectorAll('[data-a="packFlip"]')[1]; if (el) el.scrollIntoView(); }, 50); break;
    case 'tour': { g.s.mr = 1300; while (!g.isTourDay(g.s.day)) g.s.day++; UI.tab = 'more'; UI.more = 'tour'; const T = g.tour, tm = g.tourMatch(); if (tm) g.tourGame(true); break; }
    case 'trainer': UI.tab = 'more'; UI.more = 'trainers'; UI.trainer = 8; for (let i = 0; i < 6; i++) { const r = g.aiMatch(8, i); const bt = new Battle(r.deckA.map(card), 'a', r.deckB.map(card), 'b', BigInt(r.seed), r.first); g.recordAIMatch(r, BattleAI.simulate(bt), bt); } break;
    case 'trainers': UI.tab = 'more'; UI.more = 'trainers'; break;
    case 'quests': { UI.tab = 'more'; UI.more = 'quests'; const q = g.quests; g.quest(q[0].kind, q[0].need); g.quest(q[1].kind, 1); break; }
    case 'draft': { g.s.money += 500; g.startDraft('FL'); for (let i = 0; i < 4; i++) { const me = g.draftSeat(); const id = [...new Set(g.s.draft.pool)].filter(x => g.draftLegal(me, x)).sort((x, y) => BattleAI.monValue(card(y)) - BattleAI.monValue(card(x)))[0]; g.draftPick(id); } UI.tab = 'more'; UI.more = 'draft'; break; }
    case 'mulligan': { const b = new Battle(g.activeDeckCards, 'You', g.aiDeck(2), g.s.ai[2].name, 4242n, 1); BattleAI.openingMulligans(b, [1]);
      UI.battle = { b, k: 2, league: true, mode: 'league', sel: null, ei: b.events.length, busy: false, floats: [], lines: [] }; UI.overlay = { kind: 'mulligan' }; break; }
    case 'snorwhirl': UI.tab = 'binder'; UI.binderSet = 'T2'; UI.overlay = { kind: 'inspect', id: 't2_snorwhirl', back: false }; break;
    case 'wirltoad': UI.tab = 'binder'; UI.binderSet = 'FL'; UI.overlay = { kind: 'inspect', id: 'fl_wirltoad', back: false }; break;
    case 'result': UI.tab = 'battle'; UI.overlay = { kind: 'result', won: true, bucks: 325, d: 17, league: true, avatar: 'zebrolt', ko: [5, 2] }; break;
  }
  G.newAchievements = [];
}
(async () => {
  try {
    await loadAssets();
    if (SNAP) demo(); else { G = new E.Game(storage()); }
    hook(); if (!SNAP) G.daysDue(); render(); tickDays();
    if (!SNAP && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    document.body.dataset.ready = '1';
  } catch (e) { $('#loadmsg').textContent = 'ERROR: ' + e.message; console.error(e); }
})();
