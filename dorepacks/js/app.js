import * as E from './engine.js';
const { DB, card, inSet, isMon, isSpell, isTrap, spriteId, Rarity, Packs, Battle, BattleAI, DeckRules, ACHIEVEMENTS, STATUS, tier, effectiveness, canAttack, monCount } = E;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const IMG = {}, SIZE = {};
const VERB = { plays: 'play', uses: 'use', sets: 'set', loses: 'lose', reveals: 'reveal', goes: 'go', wins: 'win', attacks: 'attack' };
const fixG = t => t.replace(/\bYou (plays|uses|sets|loses|reveals|goes|wins|attacks)\b/g, (m, v) => 'You ' + VERB[v]);
const RCOL = { MYT: '#cc80ff', LGD: '#ffc73d', SSR: '#ff73f2', SR: '#ffcc40', R: '#d9e0f2', U: '#59d9bf', ITEM: '#80e699', C: '#8cb3ff' };
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
  await Promise.all(Object.keys(IMG).filter(k => k.startsWith('sprites/')).map(k => new Promise(r => { const im = new Image(); im.onload = () => { SIZE[k] = [im.naturalWidth, im.naturalHeight]; r(); }; im.onerror = r; im.src = IMG[k]; })));
  initDB(await (await fetch('cards.json')).json());
}
function initDB(j) { E.initDB(j); }
const cardImg = (id, cls = 'cardimg') => `<img class="${cls}" src="${IMG['cards/' + id] || ''}" alt="" draggable="false">`;
// Pixel-exact sprite: integer up-scale or 1/n down-step, computed in DEVICE pixels, nearest-neighbour.
function sprite(id, maxSide) {
  const k0 = 'sprites/' + id; const [w, h] = SIZE[k0] || [155, 273]; const dpr = window.devicePixelRatio || 1;
  const r = Math.min(maxSide * dpr / w, maxSide * dpr / h);
  const k = r >= 1 ? Math.floor(r) : 1 / Math.ceil(1 / r);
  return `<img class="px" src="${IMG[k0] || ''}" style="width:${w * k / dpr}px;height:${h * k / dpr}px" alt="" draggable="false">`;
}
const rar = r => `<span class="rar" style="background:${RCOL[r] || '#888'}">${r === 'ITEM' ? 'ITEM' : r}</span>`;

// ---------- state ----------
const params = new URLSearchParams(location.search);
const SNAP = params.get('snap');
let G, UI = { tab: 'packs', binderSet: 'WW', deck: 0, more: null, shopTab: 'packs', overlay: null, battle: null };
function storage() { return SNAP ? null : { load: () => localStorage.getItem(SAVE_KEY), save: t => { try { localStorage.setItem(SAVE_KEY, t); } catch (e) {} } }; }

// ---------- render ----------
function render() {
  const app = $('#app');
  if (UI.battle) { app.innerHTML = battleView(); afterBattleRender(); renderOverlay(); return; }
  const s = G.s;
  const tabs = [['packs', '🎴', 'Packs'], ['binder', '📒', 'Binder'], ['decks', '🃏', 'Decks'], ['battle', '⚔️', 'Battle'], ['more', '☰', 'More']];
  app.innerHTML = `<div class="top"><div class="brand">DOREPACKS</div>
    <span class="chip" style="color:#7dfc9f">${money(s.money)}</span><span class="chip">🌬 ${s.packs.WW || 0}</span><span class="chip">🔥 ${s.packs.FL || 0}</span><span class="chip" style="color:var(--yellow)">${s.mr}</span></div>
    <div class="main" id="main">${screen()}</div>
    <div class="tabs">${tabs.map(([k, i, t]) => `<button class="${UI.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}"><span class="i">${i}</span>${t}</button>`).join('')}</div>`;
  renderOverlay(); showAchievements();
}
function screen() {
  switch (UI.tab) {
    case 'packs': return packsView(); case 'binder': return binderView(); case 'decks': return decksView();
    case 'battle': return battleSetupView(); case 'more': return moreView();
  }
}
function packsView() {
  const s = G.s;
  return `<h1>Packs</h1><div class="sub">Rip packs, chase the SSRs and Legends.</div>` + ['WW', 'FL'].map(set => {
    const r = Packs.rule(set), pity = s.pity[set] || 0;
    const chase = inSet(set).filter(c => Rarity.isChase(c.rarity));
    return `<div class="panel"><div class="row"><img src="${IMG['cards/pack_' + set.toLowerCase()]}" style="width:96px;border-radius:8px" alt="">
      <div class="grow col" style="gap:6px"><div class="title" style="font-size:22px;color:var(--yellow)">${r.name}</div>
      <div class="small">7 cards · ${money(r.price)} · you have <b style="color:#fff">${s.packs[set] || 0}</b></div>
      <div class="small">Pity ${pity}/${r.pity - 1}</div><div class="bar"><i style="width:${pity / (r.pity - 1) * 100}%"></i></div>
      <div class="row"><button class="btn y sm grow" data-a="open" data-v="${set}" ${s.packs[set] > 0 ? '' : 'disabled'}>Open</button><button class="btn sm grow" data-a="buyPack" data-v="${set}" ${s.money >= r.price ? '' : 'disabled'}>Buy ${money(r.price)}</button></div></div></div>
      <div class="row wrap" style="margin-top:8px;gap:4px">${chase.map(c => `<span style="opacity:${s.owned[c.id] > 0 ? 1 : .3}">${sprite(spriteId(c), 40)}</span>`).join('')}</div>
      <details style="margin-top:6px"><summary class="small">Odds &amp; pity</summary>${Packs.ratesText(set).map(([a, b]) => `<div class="small" style="margin-top:5px"><b style="color:#fff">${a}:</b> ${esc(b)}</div>`).join('')}</details></div>`;
  }).join('');
}
function binderView() {
  const set = UI.binderSet, list = inSet(set), s = G.s;
  const have = list.filter(c => s.owned[c.id] > 0).length;
  return `<h1>Binder</h1><div class="seg">${[['WW', 'Whispering Winds'], ['FL', 'Fallen Legends'], ['ST', 'Supplies']].map(([k, n]) => `<button class="${set === k ? 'on' : ''}" data-a="bset" data-v="${k}">${n}</button>`).join('')}</div>
   <div class="sub">${have}/${list.length} collected · tap a card to inspect</div>
   <div class="grid3">${list.map(c => `<div class="cell ${s.owned[c.id] > 0 ? '' : 'missing'}" data-a="inspect" data-v="${c.id}">${cardImg(c.id)}${s.owned[c.id] > 0 ? `<span class="cnt">×${s.owned[c.id]}</span>` : ''}</div>`).join('')}</div>`;
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
  return `<h1>Battle</h1><div class="sub">Deck: ${esc(s.deckNames[s.activeDeck])} ${ok ? '✓' : '<span style="color:#ff9b9b">(not legal — fix it in Decks)</span>'}</div>
  <div class="panel" style="text-align:center"><div class="pix" style="color:var(--yellow)">RANKED MATCH</div>
   <div style="margin:10px 0">${sprite(o.avatar, 90)}</div><div class="title" style="font-size:26px">${esc(o.name)}</div>
   <div class="small">${o.mr} MR · ${tier(o.mr)} · ${o.wins}W ${o.losses}L · cash <span style="color:#7dfc9f">${money(o.money)}</span></div>
   <div class="small" style="margin:6px 0">You: ${s.mr} MR · ${tier(s.mr)} · streak ${s.streak}</div>
   <button class="btn y" style="width:100%" data-a="fight" data-v="L${k}" ${ok ? '' : 'disabled'}>Ranked Battle</button></div>
  <div class="sub">Friendly match (no MR)</div>
  <div class="grid3">${s.ai.map((p, i) => `<button class="btn k" style="flex-direction:column;padding:8px 4px" data-a="fight" data-v="F${i}" ${ok ? '' : 'disabled'}>${sprite(p.avatar, 44)}<span style="font-size:13px">${esc(p.name)}</span><span class="small">${p.mr}</span></button>`).join('')}</div>
  <button class="btn k" style="width:100%;margin-top:12px" data-a="more" data-v="rules">How to play</button>`;
}
function moreView() {
  const m = UI.more;
  if (!m) return `<h1>More</h1>` + [['league', '🏆', 'League', 'Leaderboard & results'], ['trades', '🤝', 'Trades', `${G.s.offers.length} offer(s)`], ['shop', '🛒', 'Shop', 'Packs, singles, supplies, sell'], ['auction', '🔨', 'Auction House', `${G.s.auctions.length} listing(s) · bid against the AIs`], ['spectate', '📺', 'Spectate', 'Watch AI vs AI battles'], ['market', '📈', 'Market', `Day ${G.s.day}`], ['stats', '📊', 'Stats', 'Your career numbers'], ['ach', '🏅', 'Achievements', `${G.s.achievements.length}/${ACHIEVEMENTS.length}`], ['rules', '📖', 'How to Play', 'Rules of the mat']]
    .map(([k, i, t, d]) => `<div class="panel row" data-a="more" data-v="${k}"><span style="font-size:28px">${i}</span><div class="grow"><div class="title" style="font-size:22px">${t}</div><div class="small">${d}</div></div><span>›</span></div>`).join('')
    + `<div class="sub" style="margin-top:20px">Settings</div>` + newGameBtn() + `<div class="small" style="margin-top:8px">Progress is saved on this device (localStorage).</div>`;
  const back = `<button class="btn k sm" data-a="more" data-v="" style="margin-bottom:8px">‹ Back</button>`;
  return back + ({ league: leagueView, trades: tradesView, shop: shopView, market: marketView, ach: achView, rules: rulesView, auction: auctionView, spectate: spectateView, stats: statsView })[m]();
}
function leagueView() {
  const lb = G.leaderboard;
  return `<h1>League</h1><div class="sub">Season ladder · K=32 Elo</div><div class="panel list" style="padding:4px 12px">${lb.map((r, i) => `<div class="it" style="${r.me ? 'background:#ffd64022;margin:0 -12px;padding:9px 12px' : ''}"><b style="width:22px">${i + 1}</b><span style="width:40px;text-align:center">${sprite(r.avatar, 34)}</span><div class="grow"><b>${esc(r.name)}</b><div class="small">${tier(r.mr)} · ${r.w}W ${r.l}L · <span style="color:#7dfc9f">${money(r.cash)}</span>${r.escrow ? ` <span title="in bids">(+${money(r.escrow)} bid)</span>` : ''}</div></div><b style="color:var(--yellow)">${r.mr}</b></div>`).join('')}</div>
  <button class="btn k" style="width:100%" data-a="skipDay">Skip a day (AIs play, shop and auction) ›</button>
  <div class="sub">Recent results</div><div class="panel list" style="padding:4px 12px">${G.s.recent.slice(0, 15).map(r => `<div class="it small"><span class="grow" style="color:#fff">${esc(r.a)} vs ${esc(r.b)}</span><span>🏆 ${esc(r.winner)} (±${Math.abs(r.mrChange)})</span></div>`).join('') || '<div class="small">No games yet.</div>'}</div>`;
}
function tradesView() {
  const s = G.s;
  if (UI.counter) { const o = s.offers.find(x => x.id === UI.counter); if (o) { const opts = G.counterOptions(o); return `<h1>Counter</h1><div class="sub">Ask for a different card in exchange for your ${esc(card(o.want).name)} (${money(G.value(o.want))}).</div><div class="panel list" style="padding:4px 12px">${opts.map(id => `<div class="it" data-a="doCounter" data-v="${id}">${sprite(spriteId(card(id)), 30)}<div class="grow">${esc(card(id).name)} ${rar(card(id).rarity)}</div><b>${money(G.value(id))}</b></div>`).join('') || '<div class="small">Nothing they can spare.</div>'}</div><button class="btn k" data-a="cancelCounter">Cancel</button>`; } UI.counter = null; }
  return `<h1>Trades</h1><div class="sub">AI players send offers after each battle day.</div>` + (s.offers.length ? s.offers.map(o => { const p = s.ai.find(a => a.id === o.aiId); return `<div class="panel"><div class="row">${sprite(p.avatar, 34)}<b class="grow">${esc(p.name)}</b><span class="small">${esc(o.note)}</span></div>
   <div class="row" style="margin:10px 0;align-items:flex-start"><div class="grow" style="text-align:center"><div class="small">You get</div>${cardImg(o.give)}<b>${money(G.value(o.give))}</b></div><div style="align-self:center;font-size:24px">⇄</div><div class="grow" style="text-align:center"><div class="small">You give</div>${cardImg(o.want)}<b>${money(G.value(o.want))}</b></div></div>
   <div class="row"><button class="btn g sm grow" data-a="accept" data-v="${o.id}">Accept</button><button class="btn sm grow" data-a="counter" data-v="${o.id}" ${o.countered ? 'disabled' : ''}>Counter</button><button class="btn r sm grow" data-a="decline" data-v="${o.id}">Decline</button></div></div>`; }).join('') : '<div class="panel small">No offers right now. Play a battle to advance the day — AIs who want your cards will reach out.</div>');
}
function shopView() {
  const s = G.s, t = UI.shopTab;
  let body = '';
  if (t === 'packs') body = ['WW', 'FL'].map(set => { const r = Packs.rule(set); return `<div class="panel row"><img src="${IMG['cards/pack_' + set.toLowerCase()]}" style="width:60px" alt=""><div class="grow"><b>${r.name}</b><div class="small">You have ${s.packs[set] || 0}</div></div><button class="btn y sm" data-a="buyPack" data-v="${set}" ${s.money >= r.price ? '' : 'disabled'}>${money(r.price)}</button></div>`; }).join('');
  if (t === 'singles' || t === 'supplies') { const list = t === 'singles' ? DB.cards.filter(isMon).sort((a, b) => G.value(b.id) - G.value(a.id)) : inSet('ST'); body = `<div class="panel list" style="padding:4px 12px">${list.map(c => `<div class="it">${isMon(c) ? sprite(spriteId(c), 30) : '✨'}<div class="grow" data-a="inspect" data-v="${c.id}">${esc(c.name)} ${rar(c.rarity)}<div class="small">own ${s.owned[c.id] || 0}</div></div><button class="btn sm" data-a="buySingle" data-v="${c.id}" ${s.money >= G.buyPrice(c.id) ? '' : 'disabled'}>${money(G.buyPrice(c.id))}</button></div>`).join('')}</div>`; }
  if (t === 'sell') { const list = Object.keys(s.owned).filter(id => G.sellableCount(id) > 0).sort((a, b) => G.sellPrice(b) - G.sellPrice(a)); body = `<button class="btn p" style="width:100%;margin-bottom:10px" data-a="sellDupes">Sell all duplicate doremon</button><div class="panel list" style="padding:4px 12px">${list.map(id => { const c = card(id); return `<div class="it">${isMon(c) ? sprite(spriteId(c), 30) : '✨'}<div class="grow">${esc(c.name)} ${rar(c.rarity)}<div class="small">${G.sellableCount(id)} spare</div></div><button class="btn g sm" data-a="sell" data-v="${id}">+${money(G.sellPrice(id))}</button></div>`; }).join('') || '<div class="small" style="padding:8px 0">Nothing spare to sell (you keep 1 of each doremon and what your decks use).</div>'}</div>`; }
  return `<h1>Shop</h1><div class="seg">${[['packs', 'Packs'], ['singles', 'Singles'], ['supplies', 'Supplies'], ['sell', 'Sell']].map(([k, n]) => `<button class="${t === k ? 'on' : ''}" data-a="shopTab" data-v="${k}">${n}</button>`).join('')}</div>${body}`;
}
function spark(h) { if (!h || h.length < 2) return ''; const mn = Math.min(...h), mx = Math.max(...h), rg = mx - mn || 1; const pts = h.map((v, i) => `${(i / (h.length - 1) * 70).toFixed(1)},${(22 - (v - mn) / rg * 20).toFixed(1)}`).join(' '); const up = h[h.length - 1] >= h[0]; return `<svg class="spark" viewBox="0 0 70 24"><polyline points="${pts}" fill="none" stroke="${up ? '#40c773' : '#f25252'}" stroke-width="2"/></svg>`; }
function marketView() {
  const ids = Object.keys(G.s.market).sort((a, b) => G.value(b) - G.value(a)); const top = G.topCard;
  return `<h1>Market</h1><div class="sub">Day ${G.s.day} · prices move with supply (packs opened) and demand (buys, trades, AI wants)</div>
  ${top ? `<div class="panel row">${sprite(spriteId(card(top)), 56)}<div class="grow"><div class="pix" style="color:var(--yellow)">TOP CARD</div><div class="title" style="font-size:22px">${esc(card(top).name)}</div><b>${money(G.value(top))}</b></div></div>` : ''}
  <div class="panel list" style="padding:4px 12px">${ids.map(id => { const c = card(id), ch = G.change(id); return `<div class="it" data-a="inspect" data-v="${id}">${sprite(spriteId(c), 28)}<div class="grow" style="min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}</div>${rar(c.rarity)}</div>${spark(G.s.market[id].history)}<div style="text-align:right;width:76px"><b>${money(G.value(id))}</b><div class="small" style="color:${ch > 0 ? '#40c773' : ch < 0 ? '#f25252' : 'var(--dim)'}">${ch > 0 ? '+' : ''}${(ch * 100).toFixed(1)}%</div></div></div>`; }).join('')}</div>`;
}
function ends(l) { const d = l.endDay - G.s.day; return d <= 1 ? 'ends after next day' : `ends in ${d} days`; }
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
  return `<h1>Auction House</h1><div class="sub">Day ${s.day} · you ${money(s.money)} · timers count league days (play a battle or skip a day)</div>
  <div class="seg">${[['browse', 'Browse'], ['mine', 'Mine'], ['sell', 'List a card'], ['history', 'Sold']].map(([k, n]) => `<button class="${t === k ? 'on' : ''}" data-a="aTab" data-v="${k}">${n}</button>`).join('')}</div>${body}
  <button class="btn k" style="width:100%;margin-top:10px" data-a="skipDay">Skip a day ›</button>`;
}
function spectateView() {
  const s = G.s, a = UI.specA ?? 0, b = UI.specB ?? 1;
  const pick = (cur, key) => `<div class="grid3">${s.ai.map((p, i) => `<button class="btn ${cur === i ? 'y' : 'k'}" style="flex-direction:column;padding:6px 2px" data-a="${key}" data-v="${i}">${sprite(p.avatar, 36)}<span style="font-size:12px">${esc(p.name)}</span></button>`).join('')}</div>`;
  return `<h1>Spectate</h1><div class="sub">Latest league day (replayed move-for-move)</div>
  <div class="panel list" style="padding:4px 12px">${(s.lastDay || []).map((m, i) => `<div class="it">${sprite(s.ai[m.a].avatar, 30)}<div class="grow"><b>${esc(s.ai[m.a].name)}</b> vs <b>${esc(s.ai[m.b].name)}</b><div class="small">Day ${m.day}</div></div><button class="btn y sm" data-a="watch" data-v="R${i}">Watch</button></div>`).join('') || '<div class="small" style="padding:8px 0">No league matches yet — play or skip a day.</div>'}</div>
  <div class="sub">Exhibition: pick two AIs (no MR or cash at stake)</div>${pick(a, 'specA')}<div style="text-align:center;margin:6px">vs</div>${pick(b, 'specB')}
  <button class="btn y" style="width:100%;margin-top:10px" data-a="watch" data-v="X" ${a === b ? 'disabled' : ''}>Watch ${esc(s.ai[a].name)} vs ${esc(s.ai[b].name)}</button>`;
}
const NEW_GAME_WARN = 'Start a new game?\n\nThis permanently erases ALL your cards, Dorebucks, MR, decks, stats, achievements and league progress on this device.\n\nEveryone (you and all 8 AI players) restarts equal: starter deck, $1500, 1000 MR and 2 WW + 1 FL packs.';
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
  panel('Packs', [kv('Whispering Winds opened', s.packsOpened.WW || 0), kv('Fallen Legends opened', s.packsOpened.FL || 0), kv('Packs bought', sum(t.packsBought)), kv('Cards pulled', t.cardsPulled)]) +
  panel('Pulls by rarity', order.filter(r => t.pulls[r]).map(r => kv(`${rar(r)} ${Rarity.name(r)}`, t.pulls[r]))) +
  panel('Battles', [['Ranked', t.battles.ranked], ['Friendly', t.battles.friendly]].map(([n, b]) => kv(n, `${b.w}W ${b.l}L${b.d ? ' ' + b.d + 'D' : ''} · ${pct(b.w, b.l)}`)).concat([kv('Total', `${s.wins}W ${s.losses}L · ${pct(s.wins, s.losses)}`), kv('MR now / peak', `${s.mr} / ${s.bestMr}`), kv('Win streak now / best', `${s.streak} / ${s.bestStreak}`)])) +
  panel('Dorebucks', [kv('Cash', money(s.money)), kv('Earned', `<span style="color:#7dfc9f">${money(sum(t.earned))}</span>`)].concat(Object.entries(t.earned).map(([k, v]) => kv('&nbsp;&nbsp;' + esc(k), money(v))), [kv('Spent', `<span style="color:#ff9b9b">${money(sum(t.spent))}</span>`)], Object.entries(t.spent).map(([k, v]) => kv('&nbsp;&nbsp;' + esc(k), money(v))))) +
  panel('Trading', [kv('Cards sold (shop + auction)', s.cardsSold), kv('Singles bought', s.singlesBought), kv('Auctions won', t.auctionsWon), kv('Auctions sold', t.auctionsSold), kv('Listings / bids placed', `${t.listings} / ${t.bids}`), kv('Trades done', s.trades), kv('Achievements', `${s.achievements.length}/${ACHIEVEMENTS.length}`)]) + newGameBtn();
}
function achView() {
  return `<h1>Achievements</h1><div class="sub">${G.s.achievements.length}/${ACHIEVEMENTS.length} unlocked</div><div class="panel list" style="padding:4px 12px">${ACHIEVEMENTS.map(a => { const on = G.s.achievements.includes(a.id); return `<div class="it" style="opacity:${on ? 1 : .55}"><span style="font-size:24px">${on ? '🏅' : '🔒'}</span><div class="grow"><b>${esc(a.title)}</b><div class="small">${esc(a.desc)} · ${esc(G.rewardText(a))}</div></div></div>`; }).join('')}</div>`;
}
const RULES = [
  ['Goal', 'Each player starts with 5 life ❤️. Every time one of your doremon is knocked out you lose 1 life. Get your opponent to 0 life to win.'],
  ['Setup', 'Decks are exactly 20 cards with at least 8 doremon (max 10 spells/traps). Copies: 3 of a card, 2 of a Super Rare or SSR, 1 of a Legendary or Mythical. Shuffle and draw 5 (your opening hand always has a doremon). A coin flip picks who goes first.'],
  ['Your turn', 'Draw 1 card. Then in any order: play up to 1 doremon card into an empty DOREMON slot (6 slots), play up to 2 spell/trap cards, and attack. Hand limit is 10. Drawing from an empty deck costs 1 life.'],
  ['Attacking', 'Each of your doremon can attack once per turn, but not on the turn it was played. Tap your doremon (⚡ means ready), then tap an enemy doremon. If your opponent has no doremon on their mat, attack them directly for 1 life.'],
  ['Damage', "Damage = the move's power on the card × type effectiveness (the standard type chart: 2× super effective, ½ not very effective, 0 no effect; dual types multiply, so 4× is possible) × ATK/DEF stages, rounded to 10. Burned doremon deal half damage."],
  ['Stages', 'ATK +1 = +50% damage, +2 = ×2. DEF +1 = take ⅔ damage, +2 = take half. Stages go from −4 to +4 and stay until the doremon leaves the mat.'],
  ['Spells', 'Played from your hand and resolved right away: Potion (heal 50), Super Potion (heal 100), Soothing Song (heal 30 on all), status cures (Antidote, Burn Heal, Paralyze Heal, Awakening, Full Heal) and buffs (Power Up, Iron Guard, Brace Up, Cheer On, Shield Pal).'],
  ['Traps', 'Set face-down in a SPELL/TRAP slot (6 slots). When the enemy declares an attack, your leftmost trap springs: Guard Wall stalls them (no more attacks that turn), Bramble Shield blocks and hits back for 30, debuffs (Menace, Cute Growl, Metal Screech, Glare Down) and status traps (Static Web, Doze Spores stop the attack; Wisp Scorch, Venom Dust, Bewilder Beam).'],
  ['Status', 'Poison: −20 HP at the end of its owner\'s turn. Burn: −10 HP each turn and half damage. Paralysis: can\'t attack for one turn. Sleep: can\'t attack; 50% to wake each turn, always wakes by the 2nd. Confusion: 50% to hit itself for 30 instead, lasts 2 turns.'],
  ['Rewards', 'Friendly win $150 (loss $30). Ranked win $300 + $25 per win streak (loss $60) and MR via Elo (K=32). Tiers: Bronze, Silver 1050, Gold 1150, Platinum 1250, Diamond 1400, Master 1550.'],
  ['Packs', 'Every pack has 7 cards: 2 Commons, a Common-or-spell/trap slot (30% spell/trap), 1 guaranteed spell/trap, then 3 doremon slots where Uncommons, Rares and the chase cards live. Cheaper spells/traps drop more often. Pity guarantees a chase card if you go long enough without one.'],
  ['Auction House', 'List spare cards at a fixed price or as an auction lasting 1–5 league days. Bids are held in escrow and refunded the moment someone outbids you; when the timer ends the seller gets the winning bid and the winner gets the card. AIs list and bid too, using only their own cash.'],
  ['Fair play', 'The AI players open packs with the exact same function, odds and pity as you, shuffle the same way, build decks only from cards they own, and play by the same rules. They never see your hand, your deck order or which traps you set. Each AI has its own wallet: it earns the same battle rewards you do and pays for packs and bids out of it, and it never bids more than a card is worth to it or more than it can afford.'],
];
function rulesView() { return `<h1>How to Play</h1><div class="sub">Doremonsters mat battles</div>` + RULES.map(([a, b]) => `<div class="panel"><div class="title" style="font-size:20px;color:var(--yellow)">${a}</div><div style="font-weight:500;margin-top:4px">${esc(b)}</div></div>`).join(''); }

// ---------- overlays: pack opening, inspector, result ----------
function renderOverlay() {
  document.querySelectorAll('.overlay').forEach(e => e.remove());
  const o = UI.overlay; if (!o) return;
  const d = document.createElement('div'); d.className = 'overlay'; d.dataset.a = 'ovTap';
  if (o.kind === 'pack') {
    if (o.phase === 0) d.innerHTML = `<div class="pix" style="color:var(--yellow);margin-bottom:18px">TAP TO TEAR OPEN</div><img class="packart tear" src="${IMG['cards/pack_' + o.set.toLowerCase()]}" alt="">`;
    else if (o.phase === 1) { const c = o.cards[o.i], chase = Rarity.isChase(c.rarity), flipped = o.flipped;
      d.innerHTML = `<div class="pix" style="margin-bottom:12px">CARD ${o.i + 1} / 7</div><div class="reveal"><div class="flip ${flipped ? '' : 'back'} ${flipped && chase ? 'glow' : ''}" style="border-radius:6%/4.3%">${cardImg(c.id)}${flipped && Rarity.rank(c.rarity) >= 3 ? '<div class="holo"></div>' : ''}<img class="cardimg bk" src="${IMG['cards/card_back']}" alt=""></div></div>
      <div style="height:64px;margin-top:14px;text-align:center">${flipped ? `<div class="title" style="font-size:26px;color:${RCOL[c.rarity]}">${esc(c.name)}</div><div>${rar(c.rarity)} ${o.fresh.has(c.id) ? '<span class="rar" style="background:var(--green)">NEW!</span>' : ''}</div>` : '<div class="small">Tap to flip</div>'}</div>
      <button class="btn k sm" data-a="skipPack" style="margin-top:6px">Skip to summary</button>`; }
    else d.innerHTML = `<h1>${Packs.rule(o.set).name}</h1><div class="grid3" style="width:100%;max-width:420px;margin:8px 0 14px">${o.cards.map(c => `<div class="cell" style="position:relative">${cardImg(c.id)}${Rarity.rank(c.rarity) >= 3 ? '<div class="holo"></div>' : ''}${o.fresh.has(c.id) ? '<span class="badge">NEW</span>' : ''}</div>`).join('')}</div>
      <div class="row" style="width:100%;max-width:420px">${G.s.packs[o.set] > 0 ? `<button class="btn y grow" data-a="open" data-v="${o.set}">Open another (${G.s.packs[o.set]})</button>` : ''}<button class="btn grow" data-a="closeOv">Done</button></div>`;
  } else if (o.kind === 'inspect') {
    const c = card(o.id), owned = G.s.owned[c.id] || 0;
    d.innerHTML = `<div class="reveal" id="tilt" style="width:74vw;max-width:320px"><div class="flip ${o.back ? 'back' : ''}" id="tiltc">${cardImg(c.id)}${Rarity.rank(c.rarity) >= 3 && !o.back ? '<div class="holo"></div>' : ''}<img class="cardimg bk" src="${IMG['cards/card_back']}" alt=""></div></div>
      <div style="text-align:center;margin-top:12px"><div class="title" style="font-size:24px">${esc(c.name)}</div><div class="small">${rar(c.rarity)} · ${c.set} #${c.num} · owned ${owned} · value ${money(G.value(c.id))}${isMon(c) ? ` · ${c.types.join('/')} · HP ${c.hp} · ${esc(c.move)} ${c.dmg} (${c.moveType})` : c.text ? ' · ' + esc(c.text) : ''}</div></div>
      <div class="row" style="margin-top:12px"><button class="btn k sm" data-a="flipInspect">Flip</button><button class="btn sm" data-a="closeOv">Close</button></div>`;
  } else if (o.kind === 'result') {
    d.innerHTML = `<div class="logo" style="font-size:52px;color:${o.won ? 'var(--yellow)' : o.won === false ? 'var(--red)' : '#fff'}">${o.won ? 'VICTORY!' : o.won === false ? 'DEFEAT' : 'DRAW'}</div>
      <div style="margin:10px 0">${sprite(o.won ? 'axerupi' : o.avatar, 100)}</div>
      <div class="panel" style="text-align:center;width:100%;max-width:360px"><div style="font-size:20px;color:#7dfc9f">+${money(o.bucks)}</div>${o.league ? `<div style="margin-top:4px">MR ${o.d >= 0 ? '+' : ''}${o.d} → <b style="color:var(--yellow)">${G.s.mr}</b> (${tier(G.s.mr)})</div>` : '<div class="small">Friendly match</div>'}<div class="small" style="margin-top:4px">KOs: you ${o.ko[0]} · them ${o.ko[1]}</div></div>
      <button class="btn y" data-a="leaveBattle" style="width:100%;max-width:360px">Continue</button>`;
  } else if (o.kind === 'log') {
    d.innerHTML = `<h1>Battle log</h1><div class="panel log" style="max-width:420px">${o.lines.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div><button class="btn" data-a="closeOv">Close</button>`;
  }
  document.body.appendChild(d);
  if (o.kind === 'inspect') { const t = $('#tilt'), c = $('#tiltc'); t.addEventListener('touchmove', ev => { const r = t.getBoundingClientRect(), p = ev.touches[0]; const x = (p.clientX - r.left) / r.width - .5, y = (p.clientY - r.top) / r.height - .5; c.style.transform = `${o.back ? 'rotateY(180deg) ' : ''}rotateX(${-y * 22}deg) rotateY(${x * 22}deg)`; ev.preventDefault(); }, { passive: false }); t.addEventListener('touchend', () => { c.style.transform = ''; }); }
}
function showAchievements() {
  if (!G.newAchievements.length || document.querySelector('.toast')) return;
  const a = G.newAchievements.shift(); const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<div class="row"><span style="font-size:30px">🏅</span><div><div class="pix" style="color:var(--yellow)">ACHIEVEMENT UNLOCKED</div><div class="title" style="font-size:22px">${esc(a.title)}</div><div class="small">${esc(a.desc)} · Reward: ${esc(G.rewardText(a))}</div></div></div>`;
  document.body.appendChild(t); setTimeout(() => { t.remove(); showAchievements(); }, 2800);
}

// ---------- battle ----------
function startBattle(v) {
  const league = v[0] === 'L', k = +v.slice(1), o = G.s.ai[k];
  const b = new Battle(G.activeDeckCards, 'You', G.aiDeck(k), o.name, G.rng.next(), G.rng.int(2));
  UI.battle = { b, k, league, sel: null, ei: b.events.length, busy: false, floats: [], lines: b.events.filter(e => e.e === 'log').map(e => fixG(e.text)) };
  render(); if (b.current === 1) setTimeout(aiTurn, 700);
}
function slotHTML(side, i) {
  const B = UI.battle, b = B.b, S = b.sides[side], m = S.mons[i], me = side === 0, my = b.current === 0 && !B.busy && !b.over;
  let cls = 'slot', extra = '';
  const sel = B.sel;
  if (m) {
    cls += ' mon';
    if (me && sel?.kind === 'mon' && sel.i === i) cls += ' sel';
    if (my && me && sel?.kind === 'hand') { const c = S.hand[sel.i]; if (isSpell(c) && b.isLegal({ t: 'spell', hand: sel.i, target: i })) cls += ' can'; }
    if (my && me && !sel && canAttack(m) && !S.stalled) cls += ' can';
    if (my && !me && sel?.kind === 'mon') { const a = b.sides[0].mons[sel.i]; if (a) { const [dmg, ef] = Battle.damage(a, m); cls += ' tgt'; extra = `<span class="tg" style="color:${ef > 1 ? '#7dfc9f' : ef < 1 ? '#ffb3b3' : '#fff'};background:#000a;border-radius:4px;padding:0 3px">-${dmg}${ef > 1 ? ' ▲' : ef < 1 ? ' ▼' : ''}</span>`; } }
    const pct = m.hp / m.card.hp * 100, col = pct > 50 ? 'var(--green)' : pct > 25 ? 'var(--yellow)' : 'var(--red)';
    const st = m.status !== 'none' ? `<span style="color:#ffb84d">${STATUS[m.status][0]}</span> ` : '';
    const stg = (m.atk ? `A${m.atk > 0 ? '+' : ''}${m.atk} ` : '') + (m.def ? `D${m.def > 0 ? '+' : ''}${m.def}` : '');
    const tag = extra || `<span class="tg">${st}${stg}${me && canAttack(m) && b.current === 0 && !S.stalled ? '⚡' : ''}</span>`;
    return `<div class="${cls}" data-a="slot" data-v="${side}:${i}" id="s${side}${i}"><span class="nm" style="color:${E.DB.typeColors[m.card.types[0]] ? 'rgb(' + E.DB.typeColors[m.card.types[0]].join(',') + ')' : '#fff'}">${esc(m.card.name)}</span>${tag}<span class="sp">${sprite(spriteId(m.card), 62)}</span><div class="hp"><i style="width:${pct}%;background:${col}"></i><span>${m.hp}/${m.card.hp}</span></div></div>`;
  }
  if (my && me && sel?.kind === 'hand' && isMon(S.hand[sel.i]) && b.isLegal({ t: 'playMon', hand: sel.i, slot: i })) cls += ' can';
  return `<div class="${cls}" data-a="slot" data-v="${side}:${i}" id="s${side}${i}"></div>`;
}
function stRow(side) {
  const B = UI.battle, b = B.b, S = b.sides[side], sel = B.sel;
  return `<div class="strow">${S.traps.map((t, i) => { let c = 'st' + (t ? ' set' : ''); if (side === 0 && sel?.kind === 'hand' && isTrap(S.hand[sel.i]) && b.isLegal({ t: 'setTrap', hand: sel.i, slot: i })) c += ' can'; return `<div class="${c}" data-a="st" data-v="${side}:${i}">${t ? (side === 0 ? esc(t.name.split(' ')[0]) : '?') : ''}</div>`; }).join('')}</div>`;
}
function battleView() {
  const B = UI.battle, b = B.b, me = b.sides[0], op = b.sides[1], o = B.spec ? { name: B.spec.nb, avatar: B.spec.ab } : G.s.ai[B.k], my = !B.spec && b.current === 0 && !b.over && !B.busy;
  const nA = B.spec ? esc(B.spec.na) : 'You', avA = B.spec ? B.spec.aa : 'axerupi';
  const hearts = n => '❤️'.repeat(Math.max(0, n)) + '<span style="opacity:.25">' + '❤️'.repeat(Math.max(0, 5 - n)) + '</span>';
  let hint = '';
  if (B.spec) hint = b.over ? `🏆 ${esc(b.winner == null ? 'Draw' : b.winner === 0 ? B.spec.na : B.spec.nb)} wins!` : `Turn ${b.turnNumber} · ${esc(b.current === 0 ? B.spec.na : B.spec.nb)} to move`; else if (!my) hint = b.over ? '' : `${esc(o.name)} is thinking…`;
  else if (B.sel?.kind === 'hand') { const c = me.hand[B.sel.i]; hint = isMon(c) ? (me.monsPlayed ? 'Already played a doremon this turn' : 'Tap an empty slot on your mat') : isTrap(c) ? 'Tap a SPELL/TRAP slot to set it' : b.spellNeedsTarget(c) ? 'Tap one of your doremon' : ''; }
  else if (B.sel?.kind === 'mon') hint = monCount(op) ? 'Tap an enemy to attack' : 'No enemies — attack directly!';
  else hint = `Turn ${b.turnNumber} · doremon ${me.monsPlayed}/1 · spell/trap ${me.stPlayed}/2${me.stalled ? ' · STALLED' : ''}`;
  const selC = B.sel?.kind === 'hand' ? me.hand[B.sel.i] : null;
  const castBtn = my && selC && isSpell(selC) && !b.spellNeedsTarget(selC) ? `<button class="btn y sm" data-a="cast">Cast ${esc(selC.name)}</button>` : '';
  const directBtn = my && B.sel?.kind === 'mon' && b.isLegal({ t: 'attack', from: B.sel.i, to: null }) ? `<button class="btn r sm" data-a="direct">Direct attack!</button>` : '';
  const top = B.spec ? `<div class="top" style="padding-bottom:4px"><button class="btn k sm" data-a="leaveSpec">✕</button><div class="grow" style="text-align:center;font-weight:800">📺 ${B.spec.title}</div><button class="btn k sm" data-a="log">Log</button></div>`
    : `<div class="top" style="padding-bottom:4px"><button class="btn k sm" data-a="forfeit">✕</button><div class="grow" style="text-align:center;font-weight:800">${B.league ? 'Ranked' : 'Friendly'} vs ${esc(o.name)}</div><button class="btn k sm" data-a="log">Log</button></div>`;
  const handA = B.spec ? me.hand.map(() => `<div class="hc dis">${`<img class="cardimg" src="${IMG['cards/card_back']}" alt="">`}</div>`).join('') : null;
  const bar = B.spec ? `<div class="bbar">${[0.5, 1, 2, 4].map(x => `<button class="btn sm ${B.spec.speed === x ? 'y' : 'k'}" data-a="specSpeed" data-v="${x}">${x}×</button>`).join('')}<span class="grow"></span><button class="btn sm" data-a="specPause">${B.spec.paused ? '▶' : '⏸'}</button><button class="btn sm k" data-a="specStep" ${B.spec.paused && !b.over ? '' : 'disabled'}>Step</button></div>
   <div class="panel log" style="max-height:120px;overflow:auto;margin-top:6px;font-size:13px">${B.lines.slice(-8).reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div>` : null;
  return `${top}
  <div class="bt">
   <div class="bhead">${sprite(o.avatar, 26)}<b>${esc(o.name)}</b><span class="life">${hearts(op.life)}</span><span class="grow"></span><span class="small">✋${op.hand.length} 🂠${op.deck.length}</span></div>
   ${stRow(1)}
   <div class="mat op" id="matop"><div class="lbl">DOREMON</div>${[3, 4, 5, 0, 1, 2].map(i => slotHTML(1, i)).join('')}</div>
   <div class="prev">${hint}</div>
   <div class="mat me" id="matme"><div class="lbl">DOREMON</div>${[0, 1, 2, 3, 4, 5].map(i => slotHTML(0, i)).join('')}</div>
   ${stRow(0)}
   <div class="bhead">${sprite(avA, 26)}<b>${nA}</b><span class="life">${hearts(me.life)}</span><span class="grow"></span><span class="small">🂠${me.deck.length}</span></div>
   ${bar ? `<div class="hand">${handA}</div>${bar}` : `<div class="hand">${me.hand.map((c, i) => { const can = my && (isMon(c) ? me.monsPlayed < 1 && monCount(me) < 6 : me.stPlayed < 2); return `<div class="hc ${B.sel?.kind === 'hand' && B.sel.i === i ? 'sel' : ''} ${can ? '' : 'dis'}" data-a="hand" data-v="${i}">${cardImg(c.id)}</div>`; }).join('')}</div>
   <div class="bbar">${castBtn}${directBtn}<span class="grow"></span><button class="btn y" data-a="endTurn" ${my ? '' : 'disabled'}>End turn</button></div>`}
  </div>`;
}
// ---------- spectate ----------
function watch(v) {
  const s = G.s; let A, Bk, da, db, seed, first, title;
  if (v[0] === 'R') { const m = s.lastDay[+v.slice(1)]; A = m.a; Bk = m.b; da = m.deckA.map(card); db = m.deckB.map(card); seed = BigInt(m.seed); first = m.first; title = `League day ${m.day}`; }
  else { A = UI.specA ?? 0; Bk = UI.specB ?? 1; da = s.ai[A].deck.map(card); db = s.ai[Bk].deck.map(card); seed = BigInt(Date.now()) ^ 0x5eedn; first = Date.now() % 2; title = 'Exhibition'; }
  if (DeckRules.problems(da.map(c => c.id)).length) da = G.aiDeck(A); if (DeckRules.problems(db.map(c => c.id)).length) db = G.aiDeck(Bk);
  const b = new Battle(da, s.ai[A].name, db, s.ai[Bk].name, seed, first);
  UI.battle = { b, k: Bk, league: false, sel: null, ei: b.events.length, busy: true, floats: [], lines: b.events.filter(e => e.e === 'log').map(e => e.text),
    spec: { na: s.ai[A].name, nb: s.ai[Bk].name, aa: s.ai[A].avatar, ab: s.ai[Bk].avatar, speed: 1, paused: false, title, timer: null } };
  render(); specTick();
}
function specStep() { const B = UI.battle; if (!B?.spec || B.b.over) return; const a = BattleAI.next(B.b); if (!B.b.apply(a)) B.b.apply({ t: 'end' }); drainEvents(); render(); return a; }
function specTick() { const B = UI.battle; if (!B?.spec) return; clearTimeout(B.spec.timer); if (B.spec.paused || B.b.over) return; const a = specStep(); B.spec.timer = setTimeout(specTick, (a && a.t === 'end' ? 350 : 800) / B.spec.speed); }
function afterBattleRender() {
  const B = UI.battle; if (!B) return;
  for (const f of B.floats) { const el = document.getElementById(`s${f.side}${f.slot}`); if (!el) continue; const d = document.createElement('div'); d.className = 'float' + (f.heal ? ' heal' : ''); d.textContent = f.text; el.appendChild(d); if (!f.heal) el.classList.add('shake'); }
  B.floats = [];
}
function drainEvents() {
  const B = UI.battle, ev = B.b.events;
  for (; B.ei < ev.length; B.ei++) {
    const e = ev[B.ei];
    if (e.e === 'log') B.lines.push(fixG(e.text));
    else if (e.e === 'damage') B.floats.push({ side: e.side, slot: e.slot, text: `-${e.amount}${e.eff > 1 ? '!' : ''}` });
    else if (e.e === 'heal') B.floats.push({ side: e.side, slot: e.slot, text: `+${e.amount}`, heal: true });
    else if (e.e === 'stat') B.floats.push({ side: e.side, slot: e.slot, text: e.text, heal: true });
    else if (e.e === 'ko') B.floats.push({ side: e.side, slot: e.slot, text: 'KO!' });
    else if (e.e === 'direct') B.floats.push({ side: e.side, slot: 1, text: '-1 ❤️' });
    else if (e.e === 'trap') banner(`TRAP! ${e.card.name}`);
  }
}
function banner(t) { if (SNAP) return; const d = document.createElement('div'); d.className = 'banner'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 1400); }
function act(a) { const B = UI.battle; if (!B.b.apply(a)) return false; B.sel = null; drainEvents(); render(); checkOver(); return true; }
function checkOver() {
  const B = UI.battle; if (!B || !B.b.over || UI.overlay) return;
  const w = B.b.winner, won = w == null ? null : w === 0;
  const [bucks, d] = G.recordResult(won, B.league, B.k);
  setTimeout(() => { UI.overlay = { kind: 'result', won, bucks, d, league: B.league, avatar: G.s.ai[B.k].avatar, ko: [B.b.sides[0].koCount, B.b.sides[1].koCount] }; render(); }, 900);
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
  const B = UI.battle, b = B.b; if (b.current !== 0 || B.busy || b.over) return;
  const me = b.sides[0], sel = B.sel;
  if (side === 0) {
    if (sel?.kind === 'hand') { const c = me.hand[sel.i];
      if (isMon(c) && act({ t: 'playMon', hand: sel.i, slot: i })) return;
      if (isSpell(c) && act({ t: 'spell', hand: sel.i, target: i })) return; }
    const m = me.mons[i];
    B.sel = m && canAttack(m) && !me.stalled && !(sel?.kind === 'mon' && sel.i === i) ? { kind: 'mon', i } : null; render(); return;
  }
  if (sel?.kind === 'mon' && b.sides[1].mons[i]) act({ t: 'attack', from: sel.i, to: i });
}

// ---------- actions ----------
const A = {
  tab: v => { UI.tab = v; if (v !== 'more') UI.more = null; render(); $('#main').scrollTop = 0; },
  bset: v => { UI.binderSet = v; render(); },
  open: v => { const r = G.openPack(v); if (!r) return; UI.overlay = { kind: 'pack', set: v, cards: r.cards, fresh: r.fresh, phase: 0, i: 0, flipped: false }; render(); },
  buyPack: v => { G.buyPack(v); render(); },
  ovTap: (v, ev) => { const o = UI.overlay; if (!o || ev.target.closest('button')) return;
    if (o.kind === 'pack') { if (o.phase === 0) { o.phase = 1; } else if (o.phase === 1) { if (!o.flipped) o.flipped = true; else if (o.i < 6) { o.i++; o.flipped = false; } else o.phase = 2; } else return; renderOverlay(); }
    else if (o.kind === 'inspect' && ev.target === ev.currentTarget) { UI.overlay = null; renderOverlay(); } },
  skipPack: () => { UI.overlay.phase = 2; renderOverlay(); },
  closeOv: () => { UI.overlay = null; render(); },
  inspect: v => { UI.overlay = { kind: 'inspect', id: v, back: false }; renderOverlay(); },
  flipInspect: () => { UI.overlay.back = !UI.overlay.back; renderOverlay(); },
  deck: v => { UI.deck = +v; render(); },
  setActive: () => { G.s.activeDeck = UI.deck; G.save(); render(); },
  autoBuild: () => { G.s.decks[UI.deck] = DeckRules.autoBuild(G.s.owned, G.rng); G.checkAchievements(); G.save(); render(); },
  clearDeck: () => { G.s.decks[UI.deck] = []; G.save(); render(); },
  rm: v => { const d = G.s.decks[UI.deck], i = d.lastIndexOf(v); if (i >= 0) d.splice(i, 1); G.save(); render(); },
  add: v => { const d = G.s.decks[UI.deck], n = d.filter(x => x === v).length, c = card(v); if (d.length >= 20 || n >= (G.s.owned[v] || 0) || n >= Rarity.copyLimit(c)) return; d.push(v); G.checkAchievements(); G.save(); const sc = $('#main').scrollTop; render(); $('#main').scrollTop = sc; },
  more: v => { UI.more = v || null; UI.tab = 'more'; UI.counter = null; render(); $('#main').scrollTop = 0; },
  shopTab: v => { UI.shopTab = v; render(); },
  buySingle: v => { const sc = $('#main').scrollTop; G.buySingle(v); render(); $('#main').scrollTop = sc; },
  sell: v => { const sc = $('#main').scrollTop; G.sell(v); render(); $('#main').scrollTop = sc; },
  sellDupes: () => { const [n, t] = G.sellAllDupes(); alert(`Sold ${n} card(s) for ${money(t)}.`); render(); },
  accept: v => { const o = G.s.offers.find(x => x.id === v); if (o) G.acceptOffer(o); render(); },
  decline: v => { const o = G.s.offers.find(x => x.id === v); if (o) G.declineOffer(o); render(); },
  counter: v => { UI.counter = v; render(); },
  cancelCounter: () => { UI.counter = null; render(); },
  doCounter: v => { const o = G.s.offers.find(x => x.id === UI.counter); UI.counter = null; if (o) { const ok = G.counter(o, v); alert(ok ? 'Deal! Trade completed.' : 'They turned down your counter.'); } render(); },
  reset: () => { if (confirm(NEW_GAME_WARN)) { UI.more = ''; UI.tab = 'packs'; localStorage.removeItem(SAVE_KEY); G = new E.Game(storage()); hook(); render(); } },
  fight: v => startBattle(v),
  slot: v => { const [s, i] = v.split(':').map(Number); tapSlot(s, i); },
  st: v => { const B = UI.battle, [s, i] = v.split(':').map(Number); if (s === 0 && B.sel?.kind === 'hand') act({ t: 'setTrap', hand: B.sel.i, slot: i }); },
  hand: v => { const B = UI.battle; if (B.b.current !== 0 || B.busy) return; const i = +v; B.sel = B.sel?.kind === 'hand' && B.sel.i === i ? null : { kind: 'hand', i }; render(); },
  cast: () => { const B = UI.battle; act({ t: 'spell', hand: B.sel.i, target: null }); },
  direct: () => { const B = UI.battle; act({ t: 'attack', from: B.sel.i, to: null }); },
  endTurn: () => { const B = UI.battle; B.sel = null; if (act({ t: 'end' }) && !B.b.over) setTimeout(aiTurn, 500); },
  log: () => { UI.overlay = { kind: 'log', lines: UI.battle.lines }; renderOverlay(); },
  forfeit: () => { const B = UI.battle; if (B.b.over) return; if (!confirm('Forfeit this match? It counts as a loss.')) return; B.b.finish(1); drainEvents(); checkOver(); },
  leaveSpec: () => { const B = UI.battle; if (B?.spec) clearTimeout(B.spec.timer); UI.battle = null; UI.overlay = null; UI.tab = 'more'; UI.more = 'spectate'; render(); },
  specSpeed: v => { UI.battle.spec.speed = +v; render(); specTick(); },
  specPause: () => { const S = UI.battle.spec; S.paused = !S.paused; render(); specTick(); },
  specStep: () => specStep(),
  specA: v => { UI.specA = +v; render(); }, specB: v => { UI.specB = +v; render(); },
  watch: v => watch(v),
  skipDay: () => { G.skipDay(); banner(`Day ${G.s.day}`); render(); },
  aTab: v => { UI.aTab = v; render(); }, lKind: v => { UI.lKind = v; render(); }, lDays: v => { UI.lDays = +v; render(); },
  bid: v => { const l = G.s.auctions.find(x => x.id === v); if (!l) return; const min = G.minBid(l); const r = SNAP ? min : prompt(`Your bid for ${card(l.card).name} (minimum ${money(min)}). The cash is held until you're outbid or the auction ends.`, min); if (r == null) return; const amt = Math.round(+String(r).replace(/[$,]/g, '')); if (!G.bid(E.ME, v, amt)) alert(amt < min ? `Bid at least ${money(min)}.` : 'Not enough cash.'); render(); },
  buyNow: v => { const l = G.s.auctions.find(x => x.id === v); if (l && confirm(`Buy ${card(l.card).name} for ${money(l.price)}?`)) { G.buyNow(E.ME, v); G.checkAchievements(); } render(); },
  cancelListing: v => { G.cancelListing(v); render(); },
  listCard: v => { const kind = UI.lKind || 'auction', days = UI.lDays || 2, def = kind === 'auction' ? Math.round(G.value(v) * 0.7) : G.value(v);
    const r = prompt(`${kind === 'auction' ? 'Starting bid' : 'Price'} for ${card(v).name} (market value ${money(G.value(v))}), ${days} day(s):`, def); if (r == null) return;
    const p = Math.round(+String(r).replace(/[$,]/g, '')); if (!(p > 0)) return; if (G.list(E.ME, v, kind, p, days)) banner('Listed!'); render(); },
  leaveBattle: () => { UI.overlay = null; UI.battle = null; UI.tab = 'battle'; render(); },
};
document.addEventListener('click', ev => { const t = ev.target.closest('[data-a]'); if (!t) return; if (t.disabled) return; const f = A[t.dataset.a]; if (f) f(t.dataset.v, ev); });
function hook() { G.onChange = null; }

// ---------- demo states for screenshots (?snap=...) ----------
function demo() {
  G = new E.Game(null, 12345n); const g = G;
  g.s.money = 4200;
  for (let i = 0; i < 12; i++) { g.s.packs.WW = (g.s.packs.WW || 0) + 1; g.openPack('WW'); }
  for (let i = 0; i < 10; i++) { g.s.packs.FL = (g.s.packs.FL || 0) + 1; g.openPack('FL'); }
  g.s.owned.fl_seraphink = 1; g.s.owned.ww_badbulb = 2; g.s.packs = { WW: 3, FL: 2 };
  for (let i = 0; i < 4; i++) g.recordResult(i % 3 !== 2, true, g.nextLeagueOpponent());
  g.newAchievements = [];
  g.s.decks[1] = DeckRules.autoBuild(g.s.owned, g.rng); g.s.deckNames[1] = 'Deck 2';
  switch (SNAP) {
    case 'binder': UI.tab = 'binder'; UI.binderSet = 'FL'; break;
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
    case 'rules': UI.tab = 'more'; UI.more = 'rules'; break;
    case 'opening': { UI.tab = 'packs'; g.s.packs.FL++; const r = g.openPack('FL'); const fl = inSet('FL'); UI.overlay = { kind: 'pack', set: 'FL', cards: r.cards, fresh: r.fresh, phase: 0 }; break; }
    case 'reveal': { const fl = inSet('FL').filter(c => c.rarity === 'LGD'); UI.overlay = { kind: 'pack', set: 'FL', cards: inSet('FL').slice(-7), fresh: new Set([fl[0].id]), phase: 1, i: 6, flipped: true }; UI.overlay.cards[6] = fl[0]; break; }
    case 'summary': { UI.overlay = { kind: 'pack', set: 'FL', cards: inSet('FL').slice(-7), fresh: new Set(), phase: 2 }; break; }
    case 'inspect': UI.tab = 'binder'; UI.binderSet = 'FL'; UI.overlay = { kind: 'inspect', id: 'fl_spiraquill', back: false }; break;
    case 'battle': case 'battle_target': {
      g.s.activeDeck = 1;
      const b = new Battle(g.activeDeckCards, 'You', g.aiDeck(2), g.s.ai[2].name, 777n, 0);
      UI.battle = { b, k: 2, league: true, sel: null, ei: 0, busy: false, floats: [], lines: [] };
      // play a few turns with the AI driving both sides to reach a mid-game board
      for (let n = 0; n < 400 && b.turnNumber < 7 && !b.over; n++) { const a = BattleAI.next(b); if (!b.apply(a)) b.apply({ t: 'end' }); }
      while (b.current !== 0 && !b.over) { const a = BattleAI.next(b); if (!b.apply(a)) b.apply({ t: 'end' }); }
      UI.battle.ei = b.events.length; UI.battle.lines = b.events.filter(e => e.e === 'log').map(e => fixG(e.text));
      if (SNAP === 'battle_target') { const i = b.sides[0].mons.findIndex(m => m && canAttack(m)); if (i >= 0) UI.battle.sel = { kind: 'mon', i }; }
      else { const i = b.sides[0].hand.findIndex(isMon); if (i >= 0) UI.battle.sel = { kind: 'hand', i }; }
      break; }
    case 'spectate_live': { UI.tab = 'more'; UI.more = 'spectate'; watch('R0'); const B = UI.battle; B.spec.paused = true; clearTimeout(B.spec.timer); B.spec.speed = 2;
      for (let n = 0; n < 400 && B.b.turnNumber < 9 && !B.b.over; n++) specStep(); break; }
    case 'result': UI.tab = 'battle'; UI.overlay = { kind: 'result', won: true, bucks: 325, d: 17, league: true, avatar: 'zebrolt', ko: [5, 2] }; break;
  }
  G.newAchievements = [];
}
(async () => {
  try {
    await loadAssets();
    if (SNAP) demo(); else { G = new E.Game(storage()); }
    hook(); render();
    if (!SNAP && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    document.body.dataset.ready = '1';
  } catch (e) { $('#loadmsg').textContent = 'ERROR: ' + e.message; console.error(e); }
})();
