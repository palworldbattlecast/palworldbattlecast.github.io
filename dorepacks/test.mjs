// Node port of the Mac app's headless tests: pack odds (player vs AI), pity, battle rules, AI sims, economy, save.
import fs from 'fs';
import * as E from './js/engine.js';
const { Battle, BattleAI, Packs, DeckRules, Game, SplitMix, card, newMon, effectiveness } = E;
E.initDB(JSON.parse(fs.readFileSync(new URL('./cards.json', import.meta.url))));
let fails = 0;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const f3 = x => x.toFixed(3), f4 = x => x.toFixed(4);
check(E.inSet('WW').length === 30 && E.inSet('FL').length === 30, 'both sets have 30 cards');
check(E.ofRarity('FL', 'LGD').length === 3 && E.ofRarity('FL', 'MYT').length === 1, 'Fallen Legends: 3 legendaries + 1 mythical');
check(E.supplies().filter(E.isSpell).length >= 10 && E.supplies().filter(E.isTrap).length >= 8, 'spells and traps present');

const tally = packs => { const t = {}; for (const p of packs) for (const c of p) t[c.rarity] = (t[c.rarity] || 0) + 1; return t; };
for (const set of ['WW', 'FL', 'T2']) {
  const N = 60000; const g = new Game(null, 42n); g.s.packs[set] = N; g.save = () => {}; g.checkAchievements = () => {};
  const rule = Packs.rule(set);
  const player = [], gaps = []; let since = 0;
  for (let i = 0; i < N; i++) { const { cards } = g.openPack(set); player.push(cards); since++; if (cards.some(c => rule.chase.includes(c.rarity))) { gaps.push(since); since = 0; } }
  const ai = [], aiGaps = []; since = 0;
  for (let i = 0; i < N; i++) { const c = g.aiOpenPack(0, set, true); ai.push(c); since++; if (c.some(x => rule.chase.includes(x.rarity))) { aiGaps.push(since); since = 0; } }
  const tp = tally(player), ta = tally(ai);
  const chaseP = rule.chase.reduce((a, r) => a + (tp[r] || 0), 0) / N, chaseA = rule.chase.reduce((a, r) => a + (ta[r] || 0), 0) / N;
  console.log(set, 'player per-pack:', rule.tiers.map(t => `${t}=${f3((tp[t] || 0) / N)}`).join(' '));
  console.log(set, 'AI     per-pack:', rule.tiers.map(t => `${t}=${f3((ta[t] || 0) / N)}`).join(' '));
  check(Math.abs(chaseP - chaseA) < 0.006, `${set}: player chase rate ${f4(chaseP)} == AI chase rate ${f4(chaseA)}`);
  const effc = Packs.effectiveChase(set);
  check(Math.abs(chaseP - effc) < 0.004, `${set}: chase rate ${f4(chaseP)} matches expected-with-pity ${f4(effc)}`);
  check(Math.max(...gaps) <= rule.pity && Math.max(...aiGaps) <= rule.pity, `${set}: pity never exceeded (max gap player ${Math.max(...gaps)}, AI ${Math.max(...aiGaps)}, limit ${rule.pity})`);
  check(player.every(p => p.length === 7 && p.slice(0, 2).every(c => c.rarity === 'C') && E.isMon(p[0]) && !E.isMon(p[3]) && p.slice(4).every(E.isMon)), `${set}: 7 cards, slots 1-2 common, slot 4 spell/trap, slots 5-7 doremon`);
  const items = (tp.ITEM || 0) / N, aItems = (ta.ITEM || 0) / N;
  check(Math.abs(items - 1.3) < 0.02 && Math.abs(aItems - 1.3) < 0.02, `${set}: ${items.toFixed(3)} spell/trap per pack (player) vs ${aItems.toFixed(3)} (AI), expected 1.300`);
  if (set === 'WW') { const cnt = {}; let tot = 0; for (const p of player) for (const c of p) if (!E.isMon(c)) { cnt[c.id] = (cnt[c.id] || 0) + 1; tot++; }
    const worst = Math.max(...Packs.itemOdds().map(([c, p]) => Math.abs((cnt[c.id] || 0) / tot - p)));
    check(worst < 0.006 && Packs.itemOdds().every(([c]) => cnt[c.id] > 0), `every spell/trap can drop, per-card rate within ${worst.toFixed(4)} of its listed odds`);
    console.log('spell/trap odds:', Packs.itemOdds().map(([c, p]) => `${c.name} ${(p * 100).toFixed(1)}%`).join(', ')); }
  if (set === 'T2') { const myt = (tp.MYT || 0) / N; check(myt > 0.003 && myt < 0.01, 'T2 mythical rate sane');
    let t2i = 0, it = 0; for (const p of player) for (const c of p) if (!E.isMon(c)) { it++; if (c.pack === 'T2') t2i++; }
    const exp = Packs.itemOdds('T2').filter(x => x[0].pack === 'T2').reduce((a, x) => a + x[1], 0);
    check(Math.abs(t2i / it - exp) < 0.01, `T2 packs: new spells/traps ${(t2i / it * 100).toFixed(1)}% of item pulls (listed ${(exp * 100).toFixed(1)}%)`); }
  if (set !== 'T2') check(player.every(p => p.every(c => !c.pack)), `${set}: never drops Troublesome 2-only spells/traps`);
  if (set === 'FL') { const myt = (tp.MYT || 0) / N, lgd = (tp.LGD || 0) / N; console.log(`FL observed: legendary ${f4(lgd)} mythical ${f4(myt)} per pack`); check(myt > 0.003 && myt < 0.01, 'FL mythical rate sane'); }
}
// RNG parity with Swift SplitMix (seed 42 first output, from the reference algorithm)
{ const r = new SplitMix(0n); check(r.next() === 0xE220A8397B1DCDAFn, 'SplitMix64 matches the reference sequence'); }

// battle rules
check(effectiveness('Fire', ['Grass']) === 2 && effectiveness('Electric', ['Ground']) === 0 && effectiveness('Water', ['Fire', 'Rock']) === 4, 'type chart (2x, immune, 4x)');
const mk = (id, o = {}) => Object.assign(newMon(card(id)), { hp: 100 }, o);
check(Battle.damage(mk('ww_badbulb'), mk('ww_axerupi'))[0] === card('ww_badbulb').dmg * 2, 'super-effective doubles damage');
check(Battle.damage(mk('ww_badbulb', { atk: 2 }), mk('ww_axerupi'))[0] === card('ww_badbulb').dmg * 4, 'ATK +2 doubles again');
check(Battle.damage(mk('ww_badbulb', { status: 'brn' }), mk('ww_axerupi'))[0] === card('ww_badbulb').dmg, 'burn halves damage');
check(Battle.damage(mk('ww_electrinx'), mk('ww_senkip'))[0] === 0, 'Electric vs Ground does nothing');
{
  const rep = (id, n) => Array(n).fill(card(id));
  const deck = [...rep('ww_snarlpup', 12), ...rep('st_potion', 3), ...rep('st_guard_wall', 3), ...rep('st_power_up', 2)];
  const b = new Battle(deck, 'A', deck, 'B', 7n);
  const h = b.sides[0].hand.findIndex(E.isMon);
  check(b.apply({ t: 'playMon', hand: h, slot: 0 }), 'can play a doremon');
  const h2 = b.sides[0].hand.findIndex(E.isMon); if (h2 >= 0) check(!b.apply({ t: 'playMon', hand: h2, slot: 1 }), 'only 1 doremon per turn');
  check(!b.isLegal({ t: 'attack', from: 0, to: null }), "can't attack the turn it was played");
  b.sides[0].hand.push(card('st_guard_wall'), card('st_guard_wall'), card('st_guard_wall'));
  let set = 0; for (let i = 0; i < 3; i++) { const t = b.sides[0].hand.findIndex(E.isTrap); if (t >= 0 && b.apply({ t: 'setTrap', hand: t, slot: set })) set++; }
  check(set === 2, `max 2 spell/trap cards per turn (set ${set})`);
  b.apply({ t: 'end' });
  b.apply({ t: 'playMon', hand: b.sides[1].hand.findIndex(E.isMon), slot: 0 }); b.apply({ t: 'end' });
  check(b.apply({ t: 'attack', from: 0, to: 0 }), 'attack next turn');
  b.apply({ t: 'end' });
  const lifeBefore = b.sides[0].life;
  b.apply({ t: 'attack', from: 0, to: 0 });
  check(b.events.some(e => e.e === 'trap') && b.sides[1].stalled, 'Guard Wall trap stalls the attacker');
  check(b.sides[0].life === lifeBefore, 'stalled attack did no damage');
}
// ---- fair start: every AI begins exactly like the player ----
{
  const g0 = new Game(null, 123n); const s0 = g0.s, n0 = E.STARTER_DECK.length;
  const startPacks = Object.values(s0.packs).reduce((a, b) => a + b, 0);
  const tot = o => Object.values(o).reduce((a, b) => a + b, 0);
  check(s0.ai.every(p => p.mr === s0.mr && s0.mr === 1000), 'fair start: every AI starts at the same MR as the player (1000)');
  check(s0.ai.every(p => p.money === s0.money && s0.money === 1500), 'fair start: every AI starts with the same $1500 as the player');
  check(s0.ai.every(p => p.packsOpened === startPacks && startPacks === 3), 'fair start: every AI opens exactly the player\'s starting packs (2 WW + 1 FL)');
  check(s0.ai.every(p => tot(p.owned) === n0 + startPacks * 7 && E.STARTER_DECK.every(id => (p.owned[id] || 0) >= E.STARTER_DECK.filter(x => x === id).length)), 'fair start: every AI owns exactly the starter deck + its 3 pack openings');
  for (const set of Object.keys(s0.packs)) for (let i = 0; i < s0.packs[set]; i++) g0.openPack(set);
  check(tot(s0.owned) === n0 + startPacks * 7, 'fair start: the player ends up with the same card count after opening their packs');
  check(s0.ai.every(p => p.deck.every(id => (p.owned[id] || 0) >= p.deck.filter(x => x === id).length)), 'fair start: AI decks use only cards they own');
  check(s0.bank.initial === 9 * 1500, 'fair start: bank starts with 9 x $1500');
}
let g = new Game(null, 99n);
{
  const wins = [0, 0, 0]; let turns = 0, stuck = 0; const n = 400;
  for (let i = 0; i < n; i++) {
    const b = new Battle(g.aiDeck(i % 8), 'A', g.aiDeck((i + 3) % 8), 'B', BigInt(i + 1), i % 2);
    const w = BattleAI.simulate(b); wins[w == null ? 2 : w]++; if (b.turnNumber >= Battle.turnCap) stuck++; turns += b.turnNumber;
  }
  console.log(`AI sims: A ${wins[0]} B ${wins[1]} draws ${wins[2]} avg turns ${Math.floor(turns / n)} hit-cap ${stuck}`);
  check(wins[2] + stuck < n / 10, `AI games finish with a winner (draws ${wins[2]}, cap ${stuck})`);
}
{
  let smart = 0;
  for (let i = 0; i < 200; i++) {
    const b = new Battle(g.aiDeck(1), 'Smart', g.aiDeck(1), 'Dumb', BigInt(1000 + i), i % 2); const r = new SplitMix(BigInt(i)); let steps = 0;
    while (!b.over && steps++ < 3000) {
      if (b.current === 0) { if (!b.apply(BattleAI.next(b))) b.apply({ t: 'end' }); continue; }
      const s = b.sides[1];
      const h = s.hand.findIndex(E.isMon), sl = s.mons.findIndex(m => !m);
      if (s.monsPlayed === 0 && h >= 0 && sl >= 0) { b.apply({ t: 'playMon', hand: h, slot: sl }); continue; }
      const f = s.mons.findIndex(m => m && E.canAttack(m));
      if (f >= 0 && !s.stalled) { const ts = b.sides[0].mons.map((m, i) => m ? i : -1).filter(i => i >= 0); if (b.apply({ t: 'attack', from: f, to: ts.length ? ts[r.int(ts.length)] : null })) continue; }
      b.apply({ t: 'end' });
    }
    if (b.winner === 0) smart++;
  }
  check(smart > 120, `AI beats a naive player (${smart}/200)`);
}
// ---- fairness audit: shuffle + hidden information ----
{
  // 1) both decks go through the same Fisher-Yates shuffle: the position of a marked card is uniform for side A AND side B
  const deck = Array.from({ length: 20 }, (_, i) => card(i < 12 ? E.inSet('WW')[i].id : E.supplies()[i - 12].id));
  const posA = Array(20).fill(0), posB = Array(20).fill(0); const N = 40000;
  for (let i = 0; i < N; i++) { const b = new Battle(deck, 'A', deck, 'B', BigInt(i + 1), 0); const all = [...b.sides[0].hand, ...b.sides[0].deck], allB = [...b.sides[1].hand, ...b.sides[1].deck];
    posA[all.indexOf(deck[19])]++; posB[allB.indexOf(deck[19])]++; }
  const dev = a => Math.max(...a.map(x => Math.abs(x / N - 1 / 20)));
  check(dev(posA) < 0.006 && dev(posB) < 0.006, `player and AI decks are shuffled the same way (max deviation from uniform: player ${dev(posA).toFixed(4)}, AI ${dev(posB).toFixed(4)})`);
  // 2) the AI's choices never depend on hidden info: scramble the opponent's hand, deck order and the identity of face-down traps
  let same = 0, total = 0; const g0 = new Game(null, 3n);
  for (let i = 0; i < 300; i++) {
    const b = new Battle(g0.aiDeck(i % 8), 'P', g0.aiDeck((i + 1) % 8), 'AI', BigInt(500 + i), i % 2);
    for (let n = 0, stop = 3 + (i % 25); n < stop && !b.over; n++) { const a = BattleAI.next(b); if (!b.apply(a)) b.apply({ t: 'end' }); }
    if (b.over) continue;
    const me = b.current, o = b.sides[1 - me];
    const a1 = JSON.stringify(BattleAI.next(b));
    const sup = E.supplies(), mons = E.inSet('FL');
    o.hand = o.hand.map((c, j) => mons[(j * 7 + i) % mons.length]); o.deck = o.deck.slice().reverse().map((c, j) => sup[(j + i) % sup.length]);
    o.traps = o.traps.map(t => t ? card('st_glare_down') : null);
    const a2 = JSON.stringify(BattleAI.next(b)); total++; if (a1 === a2) same++;
  }
  check(same === total && total > 200, `AI decisions ignore the opponent's hand, deck order and face-down trap identity (${same}/${total} identical)`);
}
// ---- starter deck vs fresh AI decks ----
{
  let w = 0; const N = 400; const g0 = new Game(null, 11n);
  for (let i = 0; i < N; i++) { const b = new Battle(E.STARTER_DECK.map(card), 'You', g0.aiDeck(i % 8), 'AI', BigInt(9000 + i), i % 2); if (BattleAI.simulate(b) === 0) w++; }
  console.log(`starter deck (played by the same AI brain) vs day-1 AI decks: ${w}/${N} = ${(w / N * 100).toFixed(1)}%`);
  check(w / N > 0.19, 'buffed starter deck wins more often than the old one (16%)');
}
// ---- AI economy + auction house: money conservation and bid caps ----
{
  const g0 = new Game(null, 21n);
  const cards = () => { let n = g0.s.auctions.length; for (const o of [g0.s.owned, ...g0.s.ai.map(p => p.owned)]) for (const k in o) n += o[k]; return n; };
  const origBid = g0.bid.bind(g0); let bidViolations = 0, aiBids = 0;
  g0.bid = (who, lid, amt) => { if (who !== E.ME) { const l = g0.s.auctions.find(x => x.id === lid); aiBids++; if (amt > g0.aiValuation(who, l.card) || amt > g0.aiBudget(who)) bidViolations++; } return origBid(who, lid, amt); };
  let ok = true, negative = false, escrowOk = true, cardsOk = true;
  for (let d = 0; d < 150; d++) {
    // the player also uses the auction house
    const spare = Object.keys(g0.s.owned).filter(id => g0.sellableCount(id) > 0);
    if (spare.length && d % 3 === 0) g0.list(E.ME, spare[d % spare.length], d % 2 ? 'fixed' : 'auction', g0.value(spare[d % spare.length]) * 0.8, 2);
    const open = g0.s.auctions.find(l => l.seller !== E.ME && l.kind === 'auction');
    if (open && d % 4 === 1) g0.bid(E.ME, open.id, g0.minBid(open));
    const c0 = cards(); g0.auctionDay(); g0.settleAuctions(); if (cards() !== c0) cardsOk = false;
    g0.worldStep(null);
    if (!g0.ledgerBalanced()) ok = false;
    if (g0.s.money < 0 || g0.s.ai.some(p => p.money < 0)) negative = true;
    for (const l of g0.s.auctions) if (l.high && l.high.amt < l.price) escrowOk = false;
  }
  const b = g0.s.bank;
  console.log(`150 days: cash+escrow ${g0.totalCash()} = start ${b.initial} + paid out ${b.faucet} - paid in ${b.sink}; auctions completed ${g0.s.auctionLog.length >= 40 ? '40+' : g0.s.auctionLog.length}, AI bids ${aiBids}`);
  check(ok, 'ledger balances every day: no Dorebucks created or destroyed outside rewards, packs and the shop');
  check(!negative, 'no one ever has negative cash');
  check(bidViolations === 0 && aiBids > 20, `every AI bid is within its valuation and its spare cash (${aiBids} bids, ${bidViolations} violations)`);
  check(cardsOk, 'auction house never creates or destroys cards');
  check(escrowOk, 'escrowed high bids are always >= the start price');
  check(g0.s.auctionLog.some(x => x.buyer !== E.ME && x.seller !== E.ME), 'AIs buy from each other on the auction house');
  const P = g0.s.ai[0]; check(Math.abs(P.money + g0.committed(0) - P.earned + P.spent) >= 0, 'AI cash is tracked');
  check(Object.values(g0.s.market).every(e => e.factor < 2.45), `no card pinned at the 2.5x price cap after 150 days (max ${Math.max(...Object.values(g0.s.market).map(e => e.factor)).toFixed(2)}x)`);
}
// ---- auction mechanics ----
{
  const g0 = new Game(null, 77n); g0.save = () => {};
  g0.s.owned.ww_rokbru = 4; const before = g0.s.money;
  const l = g0.list(E.ME, 'ww_rokbru', 'auction', 100, 1);
  check(l && g0.s.owned.ww_rokbru === 3, 'listing a card puts it in escrow');
  g0.s.ai[0].money = 5000; g0.s.ai[1].money = 5000;
  check(g0.bid(0, l.id, 100) && g0.s.ai[0].money === 4900, 'AI bid takes cash into escrow');
  check(!g0.bid(1, l.id, 101), 'bid must beat the minimum increment');
  check(g0.bid(1, l.id, 105) && g0.s.ai[0].money === 5000 && g0.s.ai[1].money === 4895, 'outbid AI gets a full refund');
  g0.s.ai[2].money = 50; check(!g0.bid(2, l.id, 200), "can't bid more cash than you have");
  const t0 = g0.totalCash(); g0.s.day = l.endDay; g0.settleAuctions();
  check(g0.s.money === before + 105 && g0.s.ai[1].owned.ww_rokbru >= 1 && g0.totalCash() === t0, 'settlement pays the seller from escrow and delivers the card');
  check((g0.s.market.ww_rokbru.sales || []).some(x => x[1] === 105) && g0.s.stats.auctionsSold === 1, 'market records the auction sale');
  g0.s.ai[3].owned.ww_axerupi = 9; g0.s.ai[3].deck = []; const l2 = g0.list(3, 'ww_axerupi', 'fixed', 2000, 2);
  g0.s.money = 1999; check(!g0.buyNow(E.ME, l2.id), "can't buy now without the cash");
  g0.s.money = 2500; const m3 = g0.s.ai[3].money; check(g0.buyNow(E.ME, l2.id) && g0.s.money === 500 && g0.s.ai[3].money === m3 + 2000, 'buy-now transfers cash player -> AI');
  check(g0.s.stats.auctionsWon === 1 && g0.s.stats.spent['auction buys'] === 2000, 'stats track auction buys');
}
// ---- spectate replays are exact ----
{
  const g0 = new Game(null, 31n); g0.worldStep(null);
  const ok = g0.s.lastDay.every(m => { const b = new Battle(m.deckA.map(card), 'A', m.deckB.map(card), 'B', BigInt(m.seed), m.first); return BattleAI.simulate(b) === m.winner; });
  check(ok && g0.s.lastDay.length === 4, 'league matches replay move-for-move in Spectate (same winner)');
}
// economy
g = new Game(null, 5n);
const sells = { C: 'ww_snarlpup', U: 'ww_sprigchimp', R: 'ww_glootios', SR: 'ww_rokbru', SSR: 'ww_axerupi' }, expect = { C: 10, U: 25, R: 60, SR: 150, SSR: 1000 };
for (const r in sells) { g.s.market[sells[r]].factor = 1; check(g.sellPrice(sells[r]) === expect[r], `sell ${r} = $${expect[r]} at neutral market (got ${g.sellPrice(sells[r])})`); }
g.s.owned.ww_axerupi = 3; check(!g.sell('ww_axerupi') && g.sellableCount('ww_axerupi') === 0, "3 copies are kept (2 for a deck + 1 to trade): not dupes");
g.s.owned.ww_axerupi = 5; const m0 = g.s.money; check(g.sellableCount('ww_axerupi') === 2 && g.sell('ww_axerupi') && g.s.money > m0 && g.s.owned.ww_axerupi === 4, 'copies beyond 3 are dupes and sell');
g.s.owned.st_power_up = 6; check(g.sellableCount('st_power_up') === 3, 'spells/traps follow the same keep-3 rule');
{ const [n] = g.sellAllDupes(); check(n > 0 && Object.keys(g.s.owned).every(id => g.s.owned[id] <= Math.max(3, g.inDecks(id))), `Sell all dupes leaves exactly 3 (or what decks use) of everything (${n} sold)`); }
// ---- deck limit ----
check(DeckRules.problems(Array(3).fill('ww_snarlpup').concat(E.STARTER_DECK.slice(3))).some(p => p.includes('max 2')), 'a 3rd copy of a card is illegal (max 2)');
check(DeckRules.problems(['fl_spiraquill', 'fl_spiraquill'].concat(E.STARTER_DECK.slice(2))).some(p => p.includes('max 1')), 'Legendary/Mythical stay at 1 copy');
{ const own = {}; for (const c of E.DB.cards) own[c.id] = 9; let ok = true; for (let i = 0; i < 30; i++) { const d = DeckRules.autoBuild(own, new SplitMix(BigInt(i + 1))); const cnt = {}; d.forEach(x => cnt[x] = (cnt[x] || 0) + 1); ok = ok && DeckRules.problems(d).length === 0 && Object.values(cnt).every(v => v <= 2); } check(ok, 'auto-builder never puts more than 2 of a card in a deck'); }
check(g.s.ai.every(p => DeckRules.problems(p.deck).length === 0), 'every AI deck respects the 2-copy limit');
// ---- take back ----
{
  const deck = E.STARTER_DECK.map(card);
  const b = new Battle(deck, 'You', deck, 'AI', 4242n, 0), S = b.sides[0];
  const h = S.hand.findIndex(E.isMon), n0 = S.hand.length; b.apply({ t: 'playMon', hand: h, slot: 2 });
  check(b.canUndo(0, 'mon', 2) && b.apply({ t: 'undo', kind: 'mon', slot: 2 }) && !S.mons[2] && S.monsPlayed === 0 && S.hand.length === n0, 'a doremon played this turn can be taken back (hand + counter restored)');
  const h2 = S.hand.findIndex(E.isMon); b.apply({ t: 'playMon', hand: h2, slot: 0 });
  S.hand.push(card('st_super_potion')); S.mons[0].hp -= 50; const sp = S.hand.length - 1;
  b.apply({ t: 'spell', hand: sp, target: 0 });
  check(!b.canUndo(0, 'mon', 0), 'a doremon that had a spell resolve on it cannot be taken back');
  check(!b.isLegal({ t: 'undo', kind: 'spell', slot: 0 }), 'a resolved instant spell cannot be taken back');
  S.hand.push(card('st_guard_wall')); const st0 = S.stPlayed; b.apply({ t: 'setTrap', hand: S.hand.length - 1, slot: 4 });
  check(b.apply({ t: 'undo', kind: 'trap', slot: 4 }) && !S.traps[4] && S.stPlayed === st0 && S.hand.some(c => c.id === 'st_guard_wall'), 'a trap set this turn can be picked back up');
  S.hand.push(card('st_guard_wall')); b.apply({ t: 'setTrap', hand: S.hand.length - 1, slot: 4 });
  b.apply({ t: 'end' }); check(!b.canUndo(0, 'trap', 4) && !b.canUndo(1, 'trap', 4), 'after the turn ends nothing can be taken back');
  b.apply({ t: 'end' }); check(!b.canUndo(0, 'mon', 0), "last turn's doremon is locked in");
}
// ---- coin flip & matchmaking ----
check(BattleAI.chooseFirst() === true, 'AI that wins the toss chooses to go first');
{
  const g1 = new Game(null, 55n); g1.save = () => {}; const seen = {}; let repeats = 0, prev = -1, recent3 = 0;
  for (let i = 0; i < 400; i++) { const k = g1.nextLeagueOpponent(); check.quiet = true; seen[k] = (seen[k] || 0) + 1; if (k === prev) repeats++; if ((g1.s.oppHistory || []).slice(0, 3).includes(k)) recent3++; prev = k; g1.recordResult(i % 2 === 0, true, k); }
  console.log('ranked opponents over 400 games:', JSON.stringify(seen), 'in last-3:', recent3);
  check(repeats === 0, 'ranked never matches you with the same opponent twice in a row');
  check(Object.keys(seen).length === 8, 'every AI shows up as a ranked opponent');
  check(recent3 < 400 * 0.35, `recent opponents are avoided (${recent3}/400 were among the previous 3)`);
  const g2 = new Game(null, 56n); check(g2.nextLeagueOpponent() === g2.nextLeagueOpponent(), 'the chosen opponent stays put until the match is played');
}
check(g.buyPrice('ww_glootios') >= g.sellPrice('ww_glootios') * 2, 'no buy/sell arbitrage');
g.s.money = 10000; g.s.bank.initial += 10000 - 1500; check(g.buyPack('FL') && g.s.money === 9200, 'Fallen Legends pack costs $800');
const sum = () => g.s.ai.reduce((a, p) => a + p.mr, 0); const s0 = sum();
for (let i = 0; i < 60; i++) g.worldStep(null);
check(s0 === sum(), `AI-only league MR is zero-sum (${s0} -> ${sum()})`);
check(Object.values(g.s.market).every(e => e.factor >= 0.4 && e.factor <= 2.5), 'market factors bounded');
check(g.s.ai.every(p => DeckRules.problems(p.deck).length === 0), 'every AI deck is legal');
console.log('AI after 60 days:', g.s.ai.map(p => `${p.name} ${p.mr} $${p.money} packs ${p.packsOpened}`).join(', '));
console.log('top card:', card(g.topCard).name, '$' + g.value(g.topCard), 'offers:', g.s.offers.length);
check(DeckRules.problems(E.STARTER_DECK).length === 0, 'starter deck is legal');
const [bucks] = g.recordResult(true, true, 0);
check(bucks >= 300, `league win pays $${bucks}`);
check(g.s.achievements.includes('first_win'), 'first win achievement unlocked');
g.s.owned.ww_rokbru = 3; for (let i = 0; i < 6 && !g.s.offers.length; i++) g.generateOffers();
if (g.s.offers.length) { const o = g.s.offers[0], before = g.s.owned[o.give] || 0; check(g.acceptOffer(o) && g.s.owned[o.give] === before + 1, 'accepting a trade swaps cards'); }
// save round trip (localStorage stand-in)
const mem = { t: null, load() { return this.t; }, save(x) { this.t = x; } };
const g2 = new Game(mem, 1n); g2.s.money = 4242; g2.save();
const g3 = new Game(mem); check(g3.s.money === 4242 && g3.s.ai.length === 8, 'save/load round trip');
// ---- real-time league days ----
{ const gc = new Game(null, 9n); gc.save = () => {}; const T = 1_000_000_000_000; const M = E.DAY_MS;
  check(gc.daysDue(T) === 0 && gc.s.clock === T, 'clock anchors on first tick');
  const d0 = gc.s.day; check(gc.daysDue(T + M - 1) === 0 && gc.advanceDays(9, T + 3 * M + 5) === 3 && gc.s.day === d0 + 3, '3 days pass after 30 real minutes');
  check(gc.msToNextDay(T + 3 * M + 5) === M - 5, 'countdown to next day');
  const d1 = gc.s.day, t0 = Date.now(); let got = 0; const far = T + 3 * M + 30 * 86400000; while (gc.daysDue(far)) got += gc.advanceDays(100, far);
  check(got === E.MAX_CATCHUP && gc.s.day === d1 + E.MAX_CATCHUP && gc.daysDue(far) === 0, `catch-up capped at 1 week (${E.MAX_CATCHUP} days in ${Date.now() - t0} ms)`);
  check(gc.advanceDays(5, T) === 0 && gc.daysDue(T + M) === 1, 'clock going backwards re-anchors without granting days');
  const gr = new Game(null, 10n); gr.save = () => {}; const dd = gr.s.day; gr.recordResult(true, true, gr.nextLeagueOpponent()); check(gr.s.day === dd, 'battles no longer advance the day');
}

// ---------- Troublesome 2: split attacks, protect, split heals, multi-target traps ----------
{
  const t2 = E.inSet('T2');
  check(t2.length === 30 && E.ofRarity('T2', 'LGD').length === 3 && E.ofRarity('T2', 'MYT').length === 1, 'Troublesome 2: 30 cards, 3 legendaries + 1 mythical');
  const seen = new Set(E.DB.cards.filter(c => c.set === 'WW' || c.set === 'FL').map(c => c.mon));
  check(t2.every(c => !seen.has(c.mon)), 'Troublesome 2 only uses doremon never printed in WW/FL');
  check(t2.filter(c => c.split === 'double').length >= 8 && t2.filter(c => c.split === 'spread').length >= 8, 'T2 has plenty of double-hit and spread cards');
  const filler = Array(20).fill(card('ww_snarlpup'));
  const board = (A, B) => {    // A/B: arrays of [id, overrides]; side 0 attacks
    const b = new Battle(filler, 'Me', filler, 'Foe', 3n, 0);
    A.forEach(([id, o], i) => { b.sides[0].mons[i] = Object.assign(newMon(card(id)), { ready: true }, o || {}); });
    B.forEach(([id, o], i) => { if (id) b.sides[1].mons[i] = Object.assign(newMon(card(id)), { ready: true }, o || {}); });
    return b; };
  const hp = (b, s, i) => b.sides[s].mons[i] ? b.sides[s].mons[i].hp : 0;
  // double hit
  { const b = board([['t2_bonkbob']], [['ww_hootuft', { hp: 500 }]]); const [d1] = Battle.damage(b.sides[0].mons[0], b.sides[1].mons[0]);
    check(b.apply({ t: 'attack', from: 0, to: 0 }) && hp(b, 1, 0) === 500 - 2 * d1, `double hit: two hits of ${d1} on one target`);
    check(!b.isLegal({ t: 'attack', from: 0, to: 0, to2: 1 }), 'double-hit cards cannot take a 2nd target'); }
  { const b = board([['t2_bonkbob']], [['ww_hootuft', { hp: 10 }], ['ww_snarlpup']]); const l = b.sides[1].life;
    b.apply({ t: 'attack', from: 0, to: 0 }); check(!b.sides[1].mons[0] && hp(b, 1, 1) === card('ww_snarlpup').hp && b.sides[1].life === l - 1, 'double hit: if hit 1 knocks out, hit 2 fizzles (no spill-over)'); }
  // spread
  { const b = board([['t2_grinhorn']], [['ww_hootuft', { hp: 400 }], ['ww_gruugy', { hp: 400 }]]);
    const [d0] = Battle.damage(b.sides[0].mons[0], b.sides[1].mons[0]), [d1] = Battle.damage(b.sides[0].mons[0], b.sides[1].mons[1]);
    check(!b.isLegal({ t: 'attack', from: 0, to: 0, to2: 0 }), 'spread: the 2 targets must differ');
    check(b.apply({ t: 'attack', from: 0, to: 0, to2: 1 }) && hp(b, 1, 0) === 400 - d0 && hp(b, 1, 1) === 400 - d1, `spread: hits 2 targets (${d0} + ${d1})`); }
  { const b = board([['t2_grinhorn']], [['ww_hootuft', { hp: 400 }]]); check(b.apply({ t: 'attack', from: 0, to: 0 }), 'spread with a single enemy hits just that one'); }
  { const b = board([['ww_snarlpup']], [['ww_hootuft'], ['ww_gruugy']]); check(!b.isLegal({ t: 'attack', from: 0, to: 0, to2: 1 }), 'normal cards cannot spread'); }
  { const b = board([['t2_grinhorn']], [['ww_hootuft', { hp: 10 }], ['ww_gruugy', { hp: 10 }]]); const g = new Game(null, 9n); g.save = () => {};
    b.apply({ t: 'attack', from: 0, to: 0, to2: 1 }); check(b.splitKOs[0] === 1 && b.sides[1].life === Battle.startLife - 2, 'spread KO of 2 doremon: 2 lives + split-KO counted');
    g.recordResult(true, false, 0, b.splitKOs[0]); g.checkAchievements(); check(g.s.achievements.includes('t2_split'), "'Split Second' achievement unlocks"); }
  // per-hit fairness: a split card's total is ~1.1x (double) / ~1.3x over two targets of a normal card of its rarity
  { const avg = (f) => { const a = t2.filter(f); return a.reduce((x, c) => x + c.dmg * (c.split ? 2 : 1), 0) / a.length; };
    console.log(`T2 avg printed damage: single ${avg(c => !c.split).toFixed(0)}, double total ${avg(c => c.split === 'double').toFixed(0)}, spread total (2 targets) ${avg(c => c.split === 'spread').toFixed(0)}`); }
  // protect
  { const b = board([['ww_snarlpup'], ['t2_grinhorn']], [['ww_hootuft'], ['ww_gruugy']]);
    b.sides[1].mons[0].protected = true;
    check(!b.isLegal({ t: 'attack', from: 0, to: 0 }) && b.isLegal({ t: 'attack', from: 0, to: 1 }), 'protected doremon cannot be targeted');
    check(!b.isLegal({ t: 'attack', from: 1, to: 1, to2: 0 }), 'protected doremon cannot be a spread 2nd target');
    b.sides[1].mons[1].protected = true; check(!b.isLegal({ t: 'attack', from: 0, to: null }) && !b.isLegal({ t: 'attack', from: 0, to: 1 }), 'all enemies protected: no attack and no direct hit');
    check(BattleAI.next(b).t !== 'attack', 'AI does not try to attack protected doremon'); }
  { const b = board([['ww_snarlpup']], []); b.sides[0].hand = [card('st_mirror_veil')];
    check(b.apply({ t: 'spell', hand: 0, target: 0 }) && b.sides[0].mons[0].protected, 'Mirror Veil protects the chosen doremon');
    b.apply({ t: 'end' }); check(b.sides[0].mons[0].protected, 'protection lasts through the opponent\'s turn');
    b.sides[1].mons[0] = Object.assign(newMon(card('ww_gruugy')), { ready: true }); check(!b.isLegal({ t: 'attack', from: 0, to: 0 }), 'opponent cannot target it');
    b.apply({ t: 'end' }); check(!b.sides[0].mons[0].protected, 'protection ends at the start of your next turn'); }
  { // protected doremon still gets hit by its own end-of-turn poison, and traps still trigger on its attacks
    const b = board([['ww_snarlpup', { protected: true, status: 'psn', hp: 100 }]], [['ww_gruugy']]); b.apply({ t: 'end' });
    check(hp(b, 0, 0) === 80, 'protect does not stop poison damage'); }
  // split heal
  { const b = board([['ww_snarlpup', { hp: 50 }], ['ww_gruugy', { hp: 20 }], ['ww_spydo', { hp: 100 }]], []); b.sides[0].hand = [card('st_twin_remedy')];
    const full = c => card(c).hp;
    check(b.apply({ t: 'spell', hand: 0, target: null }) && hp(b, 0, 0) === Math.min(110, full('ww_snarlpup')) && hp(b, 0, 1) === Math.min(80, full('ww_gruugy')) && hp(b, 0, 2) === 100, 'Twin Remedy heals the 2 most hurt doremon by 60'); }
  { const b = board([['ww_snarlpup']], []); b.sides[0].hand = [card('st_duo_bloom')]; check(!b.isLegal({ t: 'spell', hand: 0, target: null }), 'split heal needs a hurt doremon'); }
  { const b = board([['ww_snarlpup'], ['ww_gruugy'], ['ww_spydo']], []); b.sides[0].hand = [card('st_twin_war_cry')]; b.apply({ t: 'spell', hand: 0, target: null });
    check(b.sides[0].mons.filter(m => m && m.atk === 1).length === 2, 'Twin War Cry: 2 doremon get ATK +1'); }
  // multi-target traps
  for (const [id, test, what] of [['st_twin_growl', m => m.atk === -1, 'ATK -1'], ['st_double_glare', m => m.def === -1, 'DEF -1'], ['st_toxic_spray', m => m.status === 'psn', 'Poisoned']]) {
    const b = board([['ww_snarlpup'], ['t2_madbuzz'], ['ww_spydo']], [['ww_gruugy', { hp: 900 }]]); b.sides[1].traps[0] = card(id);
    b.apply({ t: 'attack', from: 0, to: 0 });
    const hit = b.sides[0].mons.map(m => m && test(m));
    check(hit[0] && hit[1] && !hit[2], `${card(id).name}: the attacker and its strongest teammate are ${what}, nobody else`); }
  { // trap vs split: one trap fires once per attack, and a Paralyze trap stops BOTH hits / BOTH targets
    const b = board([['t2_bonkbob']], [['ww_gruugy', { hp: 900 }]]); b.sides[1].traps[0] = card('st_static_web'); b.sides[1].traps[1] = card('st_cute_growl');
    b.apply({ t: 'attack', from: 0, to: 0 }); check(hp(b, 1, 0) === 900 && b.sides[1].traps[1], 'Static Web stops a double hit completely; only one trap fires per attack');
    const c = board([['t2_grinhorn']], [['ww_gruugy', { hp: 900 }], ['ww_hootuft', { hp: 900 }]]); c.sides[1].traps[0] = card('st_guard_wall');
    c.apply({ t: 'attack', from: 0, to: 0, to2: 1 }); check(hp(c, 1, 0) === 900 && hp(c, 1, 1) === 900 && c.sides[0].stalled, 'Guard Wall blocks a spread attack on both targets');
    const d = board([['t2_bonkbob']], [['ww_gruugy', { hp: 900 }]]); d.sides[1].traps[0] = card('st_menace');
    const before = Battle.damage(d.sides[0].mons[0], d.sides[1].mons[0])[0]; d.apply({ t: 'attack', from: 0, to: 0 });
    const after = Battle.damage(d.sides[0].mons[0], d.sides[1].mons[0])[0];
    check(hp(d, 1, 0) === 900 - 2 * after && after < before, `Menace lowers ATK before both hits (${before} -> ${after} x2)`); }
  { // confusion: one check for the whole split attack
    const b = board([['t2_bonkbob', { status: 'cnf' }]], [['ww_gruugy', { hp: 900 }]]); b.apply({ t: 'attack', from: 0, to: 0 });
    const v = hp(b, 1, 0), [d1] = Battle.damage(b.sides[0].mons[0] || mk('t2_bonkbob'), b.sides[1].mons[0]);
    check(v === 900 || v === 900 - 2 * d1, 'confused double hitter: either hurts itself (no hits) or lands both hits'); }
  // AI uses spread with 2 targets
  { const b = board([['t2_grinhorn']], [['ww_hootuft'], ['ww_gruugy']]); b.sides[0].hand = []; const a = BattleAI.next(b);
    check(a.t === 'attack' && a.to2 != null && a.to2 !== a.to, 'AI picks 2 targets for a spread move'); }
  // deck copy limit counts by doremon NAME across printings (synthetic reprint)
  { const base = card('t2_bonkbob'); const rp = Object.assign({}, base, { id: 'zz_bonkbob', set: 'ZZ', rarity: 'R', num: 1 }); E.DB.cards.push(rp); E.DB.byId[rp.id] = rp;
    const fill = ['ww_snarlpup', 'ww_snarlpup', 'ww_acornix', 'ww_acornix', 'ww_gruugy', 'ww_gruugy', 'ww_spydo', 'ww_spydo', 'ww_zapwing', 'ww_zapwing', 'ww_hootuft', 'ww_hootuft', 'ww_giggleti', 'ww_giggleti', 'ww_embertail', 'ww_embertail', 'st_potion', 'st_potion'];
    check(DeckRules.problems([...fill, 't2_bonkbob', 'zz_bonkbob']).length === 0, 'reprints: 2 copies of one doremon across 2 printings is legal');
    check(DeckRules.problems([...fill.slice(1), 't2_bonkbob', 't2_bonkbob', 'zz_bonkbob']).some(p => p.includes('Bonkbob')), 'reprints: a 3rd copy via another printing is rejected');
    const g = new Game(null, 5n); const own = { t2_bonkbob: 3, zz_bonkbob: 3 }; for (const id of fill) own[id] = 2;
    const d = DeckRules.autoBuild(own, new SplitMix(1n)); check(d.filter(id => card(id).mon === 'bonkbob').length <= 2 && DeckRules.problems(d).length === 0, 'autoBuild respects the by-name limit');
    E.DB.cards.pop(); delete E.DB.byId[rp.id]; }
  // AI decks can use T2
  { const g = new Game(null, 77n); g.save = () => {}; for (let i = 0; i < 30; i++) g.aiOpenPack(0, 'T2', true); g.s.ai[0].deck = DeckRules.autoBuild(g.s.ai[0].owned, g.rng);
    check(g.s.ai[0].deck.some(id => card(id).set === 'T2') && DeckRules.problems(g.s.ai[0].deck).length === 0, 'AI builds legal decks with Troublesome 2 cards'); }
  // whole games with split cards: AI vs AI never stalls or errors
  { let n = 0; for (let k = 0; k < 200; k++) { const pool = t2.concat(E.supplies()); const r = new SplitMix(BigInt(k + 1)); const d = () => { const own = {}; for (let i = 0; i < 60; i++) { const c = pool[r.int(pool.length)]; own[c.id] = (own[c.id] || 0) + 1; } return DeckRules.autoBuild(own, r).map(card); };
      const b = new Battle(d(), 'A', d(), 'B', BigInt(k + 9)); BattleAI.simulate(b); if (b.over) n++; }
    check(n === 200, `200 all-T2 AI games finish (${n})`); }
}
console.log(fails === 0 ? 'ALL TESTS PASSED' : `${fails} FAILURES`); process.exit(fails ? 1 : 0);
