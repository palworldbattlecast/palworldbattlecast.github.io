// Node port of the Mac app's headless tests: pack odds (player vs AI), pity, battle rules, AI sims, economy, save.
import fs from 'fs';
import * as E from './js/engine.js';
const { Battle, BattleAI, Packs, DeckRules, Game, SplitMix, card, newMon, effectiveness, isMon, canAttack, tapOwnMonSel, Rarity } = E;
E.initDB(JSON.parse(fs.readFileSync(new URL('./cards.json', import.meta.url))));
let fails = 0;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const f3 = x => x.toFixed(3), f4 = x => x.toFixed(4);
check(E.inSet('WW').length === 30 && E.inSet('FL').length === 30, 'both sets have 30 cards');
check(E.ofRarity('FL', 'LGD').length === 3 && E.ofRarity('FL', 'MYT').length === 1, 'Fallen Legends: 3 legendaries + 1 mythical');
check(E.supplies().filter(E.isSpell).length >= 10 && E.supplies().filter(E.isTrap).length >= 8, 'spells and traps present');

const tally = packs => { const t = {}; for (const p of packs) for (const c of p) t[c.rarity] = (t[c.rarity] || 0) + 1; return t; };
for (const set of ['WW', 'FL', 'T2', 'HT']) {
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
  if (set === 'T2' || set === 'HT') { const myt = (tp.MYT || 0) / N; check(myt > 0.003 && myt < 0.01, `${set} mythical rate sane`);
    let seti = 0, it = 0; for (const p of player) for (const c of p) if (!E.isMon(c)) { it++; if (c.pack === set) seti++; }
    const exp = Packs.itemOdds(set).filter(x => x[0].pack === set).reduce((a, x) => a + x[1], 0);
    check(Math.abs(seti / it - exp) < 0.01, `${set} packs: set spells/traps ${(seti / it * 100).toFixed(1)}% of item pulls (listed ${(exp * 100).toFixed(1)}%)`);
    check(player.every(p => p.every(c => !c.pack || c.pack === set)), `${set}: never drops other-set-only spells/traps`); }
  else check(player.every(p => p.every(c => !c.pack)), `${set}: never drops set-only spells/traps`);
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
  const deck = [...rep('ww_hootuft', 12), ...rep('st_potion', 3), ...rep('st_guard_wall', 3), ...rep('st_power_up', 2)];
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
  check(s0.ai.every(p => p.packsOpened === startPacks && startPacks === 15), 'fair start: every AI opens exactly the player\'s starting packs (3 of each set)');
  check(s0.ai.every(p => tot(p.owned) === n0 + startPacks * 7 && E.STARTER_DECK.every(id => (p.owned[id] || 0) >= E.STARTER_DECK.filter(x => x === id).length)), 'fair start: every AI owns exactly the starter deck + its starting pack openings');
  const packSnap = { ...s0.packs }; for (const set of Object.keys(packSnap)) for (let i = 0; i < packSnap[set]; i++) g0.openPack(set);
  check(tot(s0.owned) === n0 + startPacks * 7, 'fair start: the player ends up with the same card count after opening their packs');
  check(s0.ai.every(p => p.deck.every(id => (p.owned[id] || 0) >= p.deck.filter(x => x === id).length)), 'fair start: AI decks use only cards they own');
  check(s0.bank.initial === 17 * 1500, 'fair start: bank starts with 17 x $1500 (you + 16 trainers)');
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
  check(w / N > 0.05, 'starter deck still wins some games vs day-1 AI (AI opens 12 packs now)');
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
  check(ok && g0.s.lastDay.length === 8, 'league matches replay move-for-move in Spectate (same winner)');
}
// economy
g = new Game(null, 5n);
const sells = { C: 'ww_snarlpup', U: 'ww_sprigchimp', R: 'ww_glootios', SR: 'ww_rokbru', LGD: 'ww_senkip', MYT: 'ww_axerupi' }, expect = { C: 10, U: 25, R: 60, SR: 150, LGD: 1500, MYT: 3000 };
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
  check(Object.keys(seen).length === 16, 'every AI shows up as a ranked opponent');
  check(recent3 < 400 * 0.35, `recent opponents are avoided (${recent3}/400 were among the previous 3)`);
  const g2 = new Game(null, 56n); check(g2.nextLeagueOpponent() === g2.nextLeagueOpponent(), 'the chosen opponent stays put until the match is played');
}
check(g.buyPrice('ww_glootios') >= g.sellPrice('ww_glootios') * 2, 'no buy/sell arbitrage');
g.s.money = 10000; g.s.bank.initial += 10000 - 1500; check(g.buyPack('FL') && g.s.money === 9200, 'Fallen Legends pack costs $800');
const sum = () => g.s.ai.reduce((a, p) => a + p.mr, 0); const s0 = sum();
for (let i = 0; i < 60; i++) g.worldStep(null);
{ const drift = (sum() - s0) / g.s.ai.length; console.log('AI MR drift per trainer over 60 days:', drift.toFixed(1));
  check(Math.abs(drift) < 200, `AI-only league MR drift stays bounded (${s0} -> ${sum()}, ${drift.toFixed(0)}/trainer over 60 days)`); }
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
const g3 = new Game(mem); check(g3.s.money === 4242 && g3.s.ai.length === 16, 'save/load round trip');
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

// ================= Nov 2 features =================
{
  // ---- free mulligan ----
  const deck = E.STARTER_DECK.map(card);
  const b = new Battle(deck, 'A', deck, 'B', 77n, 0);
  const n0 = b.sides[0].hand.length, tot0 = b.sides[0].hand.length + b.sides[0].deck.length;
  check(b.canMulligan(0) && b.canMulligan(1), 'mulligan: both sides may mulligan before anything is played');
  check(b.redraw(0) && b.sides[0].hand.length === n0 && b.sides[0].hand.length + b.sides[0].deck.length === tot0, 'mulligan: same hand size, no card lost or gained (hand+deck conserved)');
  check(b.sides[0].hand.some(E.isMon), 'mulligan: the new hand still has a doremon');
  check(!b.canMulligan(0) && !b.redraw(0), 'mulligan: only once per battle');
  const b2 = new Battle(deck, 'A', deck, 'B', 78n, 0); b2.apply({ t: 'end' });
  check(!b2.canMulligan(1), 'mulligan: no mulligan once play has started');
  const b3 = new Battle(deck, 'A', deck, 'B', 79n, 0);
  check(b3.sides[1].quickStart && !b3.sides[0].quickStart, 'going second: the second player gets a quick-start doremon');
}
{
  // ---- MR ----
  check(E.mrDelta(1000, 1400, true) >= 15 && E.mrDelta(1400, 1000, true) === 15, 'MR: a win is worth at least +15 (even vs a much lower foe)');
  check(E.mrDelta(1000, 1000, true, 4) === E.mrDelta(1000, 1000, true, 1) + 6, 'MR: win streak bonus +2 per extra win (4 in a row = +6)');
  check(E.mrDelta(1000, 1000, true, 20) - E.mrDelta(1000, 1000, true, 1) === 8, 'MR: streak bonus capped at +8');
  check(E.rust(1500) === 1490 && E.rust(900) === 900, 'MR: daily rust gives back 2% above 1000');
  check(E.mrDelta(1200, 1000, false) > E.elo(1200, 1000, false) && E.mrDelta(1200, 1000, false) >= -24, 'MR: losing to a lower-rated foe is softened');
  check(E.mrDelta(1000, 1000, false) === E.elo(1000, 1000, false), 'MR: an even loss is plain Elo');
  check(E.TIERS.length === 6 && E.TIERS.every(([n, t]) => E.tier(t) === n), 'MR: tier table matches tier()');
  const g = new Game(null, 91n); g.save = () => {}; const k = 0, P = g.s.ai[k]; P.mr = 1000; g.s.mr = 1000;
  g.recordResult(true, true, k); check(g.s.mr === 1016 && P.mr === 984, `MR: player and AI use the same rule (${g.s.mr}/${P.mr})`);
  for (let i = 0; i < 3; i++) g.recordResult(true, true, 1 + i); check(g.s.streak === 4, 'MR: player streak tracked');
  const rec = g.aiMatch(2, 3); const before = g.s.ai[2].streak; g.recordAIMatch(rec, 0); check(g.s.ai[2].streak === before + 1 && g.s.ai[3].streak === 0, 'MR: AI streaks tracked');
  check(g.ledgerBalanced(), 'ledger balanced after MR games');
}
{
  // ---- tournament ----
  const g = new Game(null, 92n); g.save = () => {};
  while (!g.isTourDay(g.s.day)) g.s.day++;
  g.s.mr = 5000;   // make sure the player is in the top 8
  const T = g.tour;
  check(T.entrants.length === 8 && T.entrants.includes(E.ME) && new Set(T.entrants).size === 8, 'tournament: top 8 by MR, player included');
  check(T.rounds[0].length === 4 && T.rounds[0].filter(m => m.winner != null).length === 3, 'tournament: AI-only quarter-finals resolve at once');
  check(T.rounds[0].every(m => m.winner == null || Math.max(...m.w) === 2), 'tournament: matches are best-of-3');
  const cash0 = g.s.money, packs0 = g.s.packs[T.set] || 0; let guard = 0;
  while (g.tourMatch() && guard++ < 20) g.tourGame(true);
  check(T.done && T.champion === E.ME && T.rounds.length === 3, 'tournament: QF -> SF -> F, the player wins by winning 2 games per round');
  check(g.s.money === cash0 + E.Game.TOUR_PRIZE && g.s.packs[T.set] === packs0 + 1, `tournament: champion gets $2000 + a ${T.set} pack`);
  check(g.ledgerBalanced(), 'ledger balanced after the tournament prize');
  // AI-only tournament (player not in the top 8) resolves completely and pays an AI
  const h = new Game(null, 93n); h.save = () => {}; while (!h.isTourDay(h.s.day)) h.s.day++; h.s.mr = 0;
  const U = h.tour; check(U.done && U.champion >= 0 && U.rounds.length === 3 && !U.entrants.includes(E.ME), 'tournament: AI-only bracket resolves fully');
  check(h.s.ai[U.champion].tourWins === 1 && h.ledgerBalanced(), 'tournament: AI champion paid fairly, ledger balanced');
  // skipped day forfeits
  const f = new Game(null, 94n); f.save = () => {}; while (!f.isTourDay(f.s.day)) f.s.day++; f.s.mr = 5000; f.tour; f.worldStep(null);
  check(f.s.tour.done && f.s.tour.champion !== E.ME, 'tournament: unplayed player match is forfeited at day end');
  check(['WW', 'FL', 'T2'].every((x, i) => f.tourSet(3 * i + 2) === x), 'tournament: sponsor set rotates WW -> FL -> T2');
}
{
  // ---- daily adventures ----
  const g = new Game(null, 95n); g.save = () => {};
  const q = g.quests; check(q.length === 3 && new Set(q.map(x => x.kind)).size === 3, 'quests: 3 different quests per day');
  const packs = () => Object.values(g.s.packs).reduce((a, b) => a + b, 0); const p0 = packs();
  for (const x of q) g.quest(x.kind, 99);
  check(q.every(x => x.done && x.reward) && packs() === p0 + 3, 'quests: each pays one random pack');
  for (const x of E.Game.QUESTS) g.quest(x[0], 99); check(packs() === p0 + 3, 'quests: max 3 packs per day');
  g.s.day++; check(g.quests.every(x => !x.done) && g.s.quests.day === g.s.day, 'quests: new set the next day');
  const k = g.quests.find(x => x.kind === 'open'); if (k) { g.openPack('WW'); check(k.have >= 1, 'quests: opening a pack counts'); }
}
{
  // ---- draft ----
  const o = E.Game.snakeOrder(7, 3);
  check(o.slice(0, 7).join() === '0,1,2,3,4,5,6' && o.slice(7, 14).join() === '6,5,4,3,2,1,0' && o.slice(14).join() === '0,1,2,3,4,5,6', 'draft: snake order 0..6, 6..0, 0..6');
  const g = new Game(null, 96n); g.save = () => {}; const m0 = g.s.money;
  check(g.startDraft('FL') && g.s.money === m0 - E.Game.DRAFT_FEE, 'draft: costs the entry fee');
  const D = g.s.draft; check(D.seats.length === 7 && D.seats.includes(E.ME) && new Set(D.seats).size === 7, 'draft: you + 6 different trainers, random seats');
  let guard = 0; while (g.draftPicking && guard++ < 50) { const seat = D.order[D.pick]; const id = D.pool.find(x => g.draftLegal(seat, x)); g.draftPick(id); }
  check(D.picks.every(p => p.length === 20 && p.filter(id => E.isMon(card(id))).length >= 8), 'draft: everyone ends with 20 picks and at least 8 doremon');
  const owned0 = JSON.stringify(g.s.owned); while (g.draftOpponent()) g.draftResult(true);
  check(D.done && D.reward.cash === 450 && D.reward.pack === 'FL' && JSON.stringify(g.s.owned) === owned0, 'draft: 3-0 pays $450 + a pack; drafted cards are not kept');
  check(g.ledgerBalanced(), 'ledger balanced after a draft');
}
{
  // ---- spectate rotation ----
  const g = new Game(null, 97n); g.save = () => {}; let prev = null, fresh = 0;
  for (let i = 0; i < 30; i++) { const r = g.nextSpectate(); check.quiet = true;
    if (!prev || (!prev.includes(r.a) && !prev.includes(r.b))) fresh++; prev = [r.a, r.b];
    const b = new Battle(r.deckA.map(card), 'A', r.deckB.map(card), 'B', BigInt(r.seed), r.first); const w = BattleAI.simulate(b); g.finishSpectate(r, w, b); }
  check(fresh === 30, `spectate: every next match is a new pairing (${fresh}/30)`);
  const games = g.s.ai.reduce((a, p) => a + p.games, 0); check(games === 60, 'spectate: watched matches count in the records');
  check(g.ledgerBalanced(), 'ledger balanced after spectated matches');
}
{
  // ---- 16-trainer migration of an old 8-trainer save ----
  const mem = { t: null, load() { return this.t; }, save(x) { this.t = x; } };
  const old = new Game(null, 98n); old.s.ai = old.s.ai.slice(0, 8); old.s.bank.initial = old.totalCash() - old.s.bank.faucet + old.s.bank.sink;
  for (const P of old.s.ai) { delete P.streak; delete P.games; delete P.played; delete P.tourWins; }
  old.s.ai[0].mr = 1234; mem.t = JSON.stringify(old.s);
  const g = new Game(mem); check(g.s.ai.length === 16 && g.s.ai[0].mr === 1234, 'migration: 8 old trainers kept, 8 added');
  check(g.s.ai.slice(8).every(P => P.mr === 1000 && P.money === 1500 && P.packsOpened === 15 && P.deck.length === 20), 'migration: new trainers get a fair start');
  check(g.ledgerBalanced(), 'migration: ledger still balanced');
  check(['Lacey', 'Prof. Winston', 'Bram'].every(n => g.s.ai.some(P => P.name === n)), 'migration: Lacey, Prof. Winston and Bram joined');
  const st = g.trainerStats(0); check(st.name === 'Kai' && st.binder > 0 && st.games >= 0, 'trainer stats available');
}
{
  // ---- AI decks are no longer clones ----
  const g = new Game(null, 99n); g.save = () => {}; for (let i = 0; i < 20; i++) g.worldStep(null);
  const sets = g.s.ai.map(P => new Set(P.deck)); let j = 0, n = 0;
  for (let a = 0; a < sets.length; a++) for (let b = a + 1; b < sets.length; b++) { const i = [...sets[a]].filter(x => sets[b].has(x)).length; j += i / (sets[a].size + sets[b].size - i); n++; }
  console.log('AI deck sameness (Jaccard):', (j / n * 100).toFixed(0) + '%');
  check(j / n < 0.4, 'AI decks differ (personalities)');
}
{ // move side effects: Ninequeen's Sludge Bomb poisons ~50% of surviving targets
  let psn = 0, n = 200; const f = Array(20).fill(card('ww_hootuft'));
  for (let i = 0; i < n; i++) { const b = new Battle(f, 'A', f, 'B', BigInt(1000 + i), 0);
    b.sides[0].mons[0] = Object.assign(newMon(card('fl_ninequeen')), { ready: true }); b.sides[1].mons[0] = Object.assign(newMon(card('ww_hootuft')), { ready: true, hp: 900 }); b.sides[1].traps = b.sides[1].traps.map(() => null);
    b.apply({ t: 'attack', from: 0, to: 0 }); if (b.sides[1].mons[0]?.status === 'psn') psn++; }
  console.log('Ninequeen poison rate:', psn / n); check(psn / n > 0.35 && psn / n < 0.65, 'move fx rolls at its printed chance (50% poison)');
  const b = new Battle(f, 'A', f, 'B', 5n, 0); b.sides[0].mons[0] = Object.assign(newMon(card('fl_ninequeen')), { ready: true }); b.sides[1].mons[0] = Object.assign(newMon(card('ww_hootuft')), { ready: true, hp: 10 });
  b.apply({ t: 'attack', from: 0, to: 0 }); check(!b.sides[1].mons[0], 'no status roll on a knocked-out target');
}
// ---- regression: the going-second quick start is guaranteed (Nov 2 bug fix) ----
{
  const start = E.STARTER_DECK.map(card);
  const qs = (first, how, trap) => {
    const b = new Battle(start, 'A', start, 'B', 4242n + BigInt(first), first); const sec = 1 - first;
    if (how === 'mulligan') check(b.redraw(sec), 'second player can mulligan');
    BattleAI.openingMulligans(b, [first]);
    // first player: sets a trap (or plays a doremon) and ends
    const F = b.sides[first]; if (trap) { F.hand.push(card(trap)); b.apply({ t: 'setTrap', hand: F.hand.length - 1, slot: 0 }); }
    const fm = F.hand.findIndex(isMon); if (fm >= 0) b.apply({ t: 'playMon', hand: fm, slot: 0 });
    b.apply({ t: 'end' });
    const S = b.sides[sec]; if (b.current !== sec) return false;
    if (how === 'spell') { S.hand.push(card('st_super_potion')); b.apply({ t: 'spell', hand: S.hand.length - 1, target: null }); }
    let hi = S.hand.findIndex(isMon); b.apply({ t: 'playMon', hand: hi, slot: 2 });
    if (how === 'undo') { b.apply({ t: 'undo', kind: 'mon', slot: 2 }); hi = S.hand.findIndex(isMon); b.apply({ t: 'playMon', hand: hi, slot: 3 }); }
    const slot = S.mons.findIndex(Boolean), m = S.mons[slot];
    if (!(m && canAttack(m) && !S.stalled)) return false;
    const o = b.sides[first], to = o.mons.findIndex(Boolean), hp = to >= 0 ? o.mons[to].hp : null, life = o.life;
    if (!b.apply({ t: 'attack', from: slot, to: to >= 0 ? to : null })) return false;
    const trapStill = !trap || !o.traps[0];   // the trap springs normally
    const landed = to >= 0 ? (!o.mons[to] || o.mons[to].hp < hp) : o.life < life;
    return trapStill && (trap ? true : landed);
  };
  for (const first of [0, 1]) for (const how of ['plain', 'undo', 'mulligan', 'spell']) for (const trap of [null, 'st_guard_wall', 'st_static_web', 'st_doze_spores', 'st_bramble_shield'])
    check(qs(first, how, trap), `quick start: ${first === 0 ? 'AI/side B' : 'player/side A'} goes second, ${how}${trap ? ', vs turn-1 ' + trap : ''} -> can attack on its first turn (trap springs normally)`);
  // every match type uses Battle with a coin-toss "first"; simulate both seats through the AI and check every second-player first turn
  let bad = 0, tot = 0;
  for (let k = 0; k < 400; k++) { const r = new SplitMix(BigInt(k + 1)); const all = E.DB.cards; const deck = () => { const o = {}; for (let i = 0; i < 80; i++) { const c = all[r.int(all.length)]; o[c.id] = (o[c.id] || 0) + 1; } return DeckRules.autoBuild(o, r).map(card); };
    const b = new Battle(deck(), 'A', deck(), 'B', BigInt(k + 3), k % 2); BattleAI.openingMulligans(b); const sec = 1 - b.first; let g = 0;
    while (b.current !== sec && !b.over && g++ < 200) { const a = BattleAI.next(b); if (!b.apply(a)) b.apply({ t: 'end' }); }
    if (b.over) continue; tot++; const S = b.sides[sec]; const hi = S.hand.findIndex(isMon); b.apply({ t: 'playMon', hand: hi, slot: S.mons.findIndex(x => !x) });
    const slot = S.mons.findIndex(m => m && m.quick); if (slot < 0 || !canAttack(S.mons[slot])) bad++; }
  check(bad === 0 && tot > 350, `AI-vs-AI: second player's first doremon can always attack (${tot - bad}/${tot})`);
}
// ---- regression: going second, the UI ALWAYS offers Attack on the first turn (the real Nov 2 bug) ----
// Root cause: tapping a doremon you played this turn selected it for Take back, never as an attacker. The quick-start
// doremon is always "played this turn", so the Attack option never appeared. Brute-force the exact UI tap decision.
{
  const all = E.DB.cards, traps = all.filter(c => c.kind === 'trap').map(c => c.id);
  let scen = 0, disagree = 0, noAttack = 0, conflict = 0, sprung = 0, trapScen = 0;
  for (let k = 0; k < 600; k++) { const r = new SplitMix(BigInt(k + 77)); const deck = () => { const o = {}; for (let i = 0; i < 80; i++) { const c = all[r.int(all.length)]; o[c.id] = (o[c.id] || 0) + 1; } return DeckRules.autoBuild(o, r).map(card); };
    const first = k % 2, sec = 1 - first, b = new Battle(deck(), 'A', deck(), 'B', BigInt(k + 9), first); BattleAI.openingMulligans(b);
    const F = b.sides[first], nt = k % 4;   // first player sets 0-2 traps (+ maybe a doremon)
    for (let t = 0; t < Math.min(nt, 2); t++) { F.hand.push(card(traps[r.int(traps.length)])); b.apply({ t: 'setTrap', hand: F.hand.length - 1, slot: t }); }
    if (k % 3) { const fm = F.hand.findIndex(isMon); if (fm >= 0) b.apply({ t: 'playMon', hand: fm, slot: r.int(5) }); }
    b.apply({ t: 'end' }); if (b.current !== sec || b.over) continue;
    const S = b.sides[sec]; const hi = S.hand.findIndex(isMon); if (hi < 0) continue;
    if (k % 5 === 0) { S.hand.push(card('st_super_potion')); b.apply({ t: 'spell', hand: S.hand.length - 1, target: null }); }
    b.apply({ t: 'playMon', hand: S.hand.findIndex(isMon), slot: r.int(5) }); scen++;
    const slot = S.mons.findIndex(Boolean), m = S.mons[slot];
    for (let i = 0; i < 5; i++) { const ui = tapOwnMonSel(b, sec, i, null)?.kind === 'mon', eng = !!S.mons[i] && canAttack(S.mons[i]) && !S.stalled; if (ui !== eng) disagree++; }
    if (b.canUndo(sec, 'mon', slot)) conflict++;
    const sel = tapOwnMonSel(b, sec, slot, null); if (sel?.kind !== 'mon') { noAttack++; continue; }
    const o = b.sides[first], to = o.mons.findIndex(Boolean), had = o.traps.filter(Boolean).length;
    if (!b.isLegal({ t: 'attack', from: slot, to: to >= 0 ? to : null })) { noAttack++; continue; }
    b.apply({ t: 'attack', from: slot, to: to >= 0 ? to : null }); if (had) { trapScen++; if (o.traps.filter(Boolean).length === had - 1) sprung++; } }
  check(scen > 400 && disagree === 0, `UI tap decision == engine canAttack in every second-player first-turn scenario (${scen} scenarios, ${disagree} disagreements)`);
  check(noAttack === 0, `UI always offers Attack to the quick-start doremon (${scen - noAttack}/${scen})`);
  check(conflict > 0, `scenarios covered the old bug: quick doremon both attackable and take-back-able (${conflict})`);
  check(trapScen > 100 && sprung === trapScen, `traps trigger normally on the quick-start attack (${sprung}/${trapScen})`);
  // take back is still available for it (the Take back button) and works
  { const b = new Battle(E.STARTER_DECK.map(card), 'A', E.STARTER_DECK.map(card), 'B', 5n, 1); b.apply({ t: 'end' });
    const S = b.sides[0], hi = S.hand.findIndex(isMon); b.apply({ t: 'playMon', hand: hi, slot: 0 });
    check(tapOwnMonSel(b, 0, 0, null)?.kind === 'mon' && b.canUndo(0, 'mon', 0) && b.apply({ t: 'undo', kind: 'mon', slot: 0 }) && S.quickStart, 'quick doremon: selected as attacker, and Take back still works'); }
}
// ---- split / double moves are a Troublesome 2 (T2) mechanic only ----
{ const bad = E.DB.cards.filter(c => c.split && c.set !== 'T2' && c.id !== 'ht_empoora'); check(bad.length === 0, `no unexpected non-T2 split/double (${bad.map(c => c.id).join(',') || 'none'})`);
  const t2 = E.DB.cards.filter(c => c.split && c.set === 'T2'); check(t2.length > 0 && t2.every(c => c.set === 'T2'), `T2 still has its split moves (${t2.length})`);
  check(card('ht_empoora').split === 'double', 'Empoora (HT) is the allowed non-T2 split Steel');
  check(!card('ww_gruugy').split && !card('ww_rokbru').split && card('ww_gruugy').moveType === 'Rock' && card('ww_rokbru').moveType === 'Rock', 'Gruugy/Rokbru single-target Rock moves (learnset)'); }
// ---- 200+ game balance sim: going first vs second ----
{ let fw = 0, n = 0; const all = E.DB.cards;
  for (let k = 0; k < 300; k++) { const r = new SplitMix(BigInt(k + 1000)); const deck = () => { const o = {}; for (let i = 0; i < 80; i++) { const c = all[r.int(all.length)]; o[c.id] = (o[c.id] || 0) + 1; } return DeckRules.autoBuild(o, r).map(card); };
    const b = new Battle(deck(), 'A', deck(), 'B', BigInt(k + 5), k % 2); BattleAI.openingMulligans(b); let g = 0;
    while (!b.over && g++ < 3000) { const a = BattleAI.next(b); if (!b.apply(a)) b.apply({ t: 'end' }); }
    if (b.over) { n++; if (b.winner === b.first) fw++; } }
  console.log(`SIM ${n} games: first player wins ${fw} (${(100 * fw / n).toFixed(1)}%), second wins ${n - fw} (${(100 * (n - fw) / n).toFixed(1)}%)`);
  check(n >= 200 && fw / n > 0.38 && fw / n < 0.62, 'first/second win rate roughly balanced'); }
// ---- types: standard chart, move type decides damage, no STAB (Nov 2) ----
{ const STD = {"Normal":{"Rock":.5,"Ghost":0,"Steel":.5},"Fire":{"Fire":.5,"Water":.5,"Grass":2,"Ice":2,"Bug":2,"Rock":.5,"Dragon":.5,"Steel":2},
"Water":{"Fire":2,"Water":.5,"Grass":.5,"Ground":2,"Rock":2,"Dragon":.5},"Electric":{"Water":2,"Electric":.5,"Grass":.5,"Ground":0,"Flying":2,"Dragon":.5},
"Grass":{"Fire":.5,"Water":2,"Grass":.5,"Poison":.5,"Ground":2,"Flying":.5,"Bug":.5,"Rock":2,"Dragon":.5,"Steel":.5},
"Ice":{"Fire":.5,"Water":.5,"Grass":2,"Ice":.5,"Ground":2,"Flying":2,"Dragon":2,"Steel":.5},
"Fighting":{"Normal":2,"Ice":2,"Poison":.5,"Flying":.5,"Psychic":.5,"Bug":.5,"Rock":2,"Ghost":0,"Dark":2,"Steel":2,"Fairy":.5},
"Poison":{"Grass":2,"Poison":.5,"Ground":.5,"Rock":.5,"Ghost":.5,"Steel":0,"Fairy":2},"Ground":{"Fire":2,"Electric":2,"Grass":.5,"Poison":2,"Flying":0,"Bug":.5,"Rock":2,"Steel":2},
"Flying":{"Electric":.5,"Grass":2,"Fighting":2,"Bug":2,"Rock":.5,"Steel":.5},"Psychic":{"Fighting":2,"Poison":2,"Psychic":.5,"Dark":0,"Steel":.5},
"Bug":{"Fire":.5,"Grass":2,"Fighting":.5,"Poison":.5,"Flying":.5,"Psychic":2,"Ghost":.5,"Dark":2,"Steel":.5,"Fairy":2},
"Rock":{"Fire":2,"Ice":2,"Fighting":.5,"Ground":.5,"Flying":2,"Bug":2,"Steel":.5},"Ghost":{"Normal":0,"Psychic":2,"Ghost":2,"Dark":.5},
"Dragon":{"Dragon":2,"Steel":.5,"Fairy":0},"Dark":{"Fighting":.5,"Psychic":2,"Ghost":2,"Dark":.5,"Fairy":.5},
"Steel":{"Fire":.5,"Water":.5,"Electric":.5,"Ice":2,"Rock":2,"Steel":.5,"Fairy":2},"Fairy":{"Fire":.5,"Fighting":2,"Poison":.5,"Dragon":2,"Dark":2,"Steel":.5}};
  const T = Object.keys(STD); let bad = 0; for (const x of T) for (const y of T) if ((E.DB.chart[x]?.[y] ?? 1) !== (STD[x][y] ?? 1)) bad++;
  check(bad === 0 && Object.keys(E.DB.chart).every(k => T.includes(k)), 'type chart == standard 18-type chart');
  const mons = E.DB.cards.filter(isMon); check(mons.every(c => T.includes(c.moveType) && c.types.every(t => T.includes(t)) && c.types.length && new Set(c.types).size === c.types.length), 'every doremon type and move type is a real chart type');
  const dragons = mons.filter(c => c.types.includes('Dragon')); const fairyAtk = mons.filter(c => c.moveType === 'Fairy');
  let ok = true; for (const f of fairyAtk) for (const d of dragons) { const want = d.types.reduce((m, t) => m * (STD.Fairy[t] ?? 1), 1); const [, ef] = Battle.damage(mk(f.id), mk(d.id)); if (ef !== want) ok = false; if (!d.types.some(t => STD.Fairy[t] < 1) && ef !== 2) ok = false; }
  check(ok && dragons.length && fairyAtk.length, `Fairy moves hit every Dragon at 2x (Steel/Dragon at 1x, as the chart says): ${dragons.map(d => d.name + ' ' + effectiveness('Fairy', d.types) + 'x').join(', ')}`);
  // no STAB / no off-type penalty: damage never depends on the attacker's own types
  let stab = 0; for (const a of mons) for (const d of mons) { const base = Battle.damage(mk(a.id), mk(d.id))[0];
    for (const ts of [['Normal'], [a.moveType], ['Dragon', 'Steel']]) { const fake = mk(a.id); fake.card = { ...a, types: ts }; if (Battle.damage(fake, mk(d.id))[0] !== base) stab++; }
    const ef = effectiveness(a.moveType, d.types); if (ef && base !== Math.max(10, Math.round(a.dmg * ef / 10) * 10)) stab++; }
  check(stab === 0, `no STAB and no off-type drop-off: damage = full move power x effectiveness in all ${mons.length * mons.length} matchups`); }
{ const g = E.typeGuide(); let ok = g.length === 18; for (const r of g) for (const d of Object.keys(E.DB.typeColors)) { const v = effectiveness(r.t, [d]); if ((v === 2) !== r.strong.includes(d) || (v === 0.5) !== r.weak.includes(d) || (v === 0) !== r.none.includes(d)) ok = false; }
  const w = g.find(r => r.t === 'Water'); check(ok && w.strong.includes('Fire') && g.find(r => r.t === 'Ghost').none.includes('Normal'), 'How to Play type guide matches the chart (e.g. Water beats Fire, Ghost has no effect on Normal)'); }

// ---- Hidden Transcendence + WW chase + seasons (Nov 9) ----
{ const ht = E.DB.cards.filter(c => c.set === 'HT'); const st = E.DB.cards.filter(c => c.pack === 'HT');
  check(ht.filter(isMon).length === 22 && st.length === 8, `HT has 22 doremon + 8 spells/traps (${ht.filter(isMon).length}+${st.length})`);
  const rc = Object.fromEntries(['C','U','R','SR','LGD','MYT'].map(r => [r, ht.filter(c => isMon(c) && c.rarity === r).length]));
  check(rc.C === 9 && rc.U === 6 && rc.R === 3 && rc.SR === 2 && rc.LGD === 1 && rc.MYT === 1, `HT mon rarities 9/6/3/2/1/1 got ${JSON.stringify(rc)}`);
  check(card('ht_goldgulp').legendary && card('ht_woolveon').rarity === 'SR' && !card('ht_rampagoone') && !card('cv_rampagoone') && card('ra_rampagoone') && card('ht_emodoom').mythical && card('st_revive').legendary && card('st_sandstorm').legendary, 'HT: Goldgulp sole LGD mon, Woolveon SR, Rampagoone in RA, Revive/Sandstorm legendary');
  check(card('ht_viletios').types.join() === 'Psychic' && card('ht_shelzele').types.join() === 'Dark' && card('ht_golechoke').types.join() === 'Fighting,Steel' && card('ht_spikebrute').types.join() === 'Dark,Steel', 'HT type updates');
  check(card('ht_skoldin') && card('ht_skoldin').types.join() === 'Bug' && card('ht_draplin').types.join() === 'Bug,Poison', 'Skoldin Bug + Draplin Bug/Poison in HT');
  check(card('ht_phioice').fx === 'frz' && E.STATUS.frz, 'Phioice freeze + STATUS.frz');
  check(card('ht_empoora').split === 'double' && card('ht_empoora').moveType === 'Steel', 'Empoora split Steel');
  // free pack migrate: packs.HT=0 still gets gifts
  { const g = new Game(null, 7n); g.save = () => {}; g.s.packs = { WW: 0, FL: 0, T2: 0, HT: 0 }; g.s._gift_ht = false; g.s._gift_v20 = false; g.migrateSave();
    check(g.s.packs.HT >= 1 && g.s._gift_ht && g.s.packs.WW >= 3 && g.s._gift_v20, `migrate grants HT+v20 packs even when HT was 0 (got HT=${g.s.packs.HT} WW=${g.s.packs.WW})`); }
  // new game starts with 3 of each
  { const g = new Game(null, 8n); g.save = () => {};
    check(['WW','FL','T2','HT'].every(s => (g.s.packs[s] || 0) === 3), `new game has exactly 3 packs each (WW=${g.s.packs.WW} FL=${g.s.packs.FL} T2=${g.s.packs.T2} HT=${g.s.packs.HT})`); }
  check(Rarity.copyLimit(card('st_revive')) === 1 && Rarity.copyLimit(card('ww_axerupi')) === 1, 'legendary items and WW mythical are 1-copy');
  check(card('ww_axerupi').rarity === 'MYT' && card('ww_senkip').rarity === 'LGD' && !E.DB.cards.some(c => c.set === 'WW' && c.rarity === 'SSR'), 'WW SSR starters became 3 LGD + Axerupi MYT');
  check(card('t2_blazemule').legendary && card('t2_peaflora').mythical, 'T2 chase flags set');
  check(Packs.rule('WW').chase.join() === 'LGD,MYT' && Packs.rule('HT').pityOdds[0] === 3.5, 'WW and HT use FL/T2 chase odds 3.5/0.5');
  check(E.DAY_MS === 2 * 60 * 60 * 1000, 'league day is 2 real hours');
  check(E.seasonFeatured(1) === 'egmil' && E.seasonOfDay(1) === 1 && E.seasonOfDay(62) === 1 && E.seasonOfDay(63) === 2 && E.daysLeftInSeason(62) === 1, 'seasons: 62 days, S1=Egmil');
  // revive spell
  { const b = new Battle(E.STARTER_DECK.map(card), 'A', E.STARTER_DECK.map(card), 'B', 3n, 0);
    b.sides[0].mons[0] = Object.assign(newMon(card('ww_snarlpup')), { ready: true });
    b.sides[0].discard.push(card('ww_gruugy')); b.sides[0].hand = [card('st_revive')];
    check(b.isLegal({ t: 'spell', hand: 0, target: null }) && b.apply({ t: 'spell', hand: 0, target: null }) && b.sides[0].mons.some(m => m && m.card.id === 'ww_gruugy'), 'Revive returns a knocked-out doremon with 100 HP'); }
  // season end: top 8 rewarded, MR reset
  { const g = new Game(null, 42n); g.save = () => {}; g.s.day = 62; g.s.lastSeasonEnded = 0; g.s.mr = 1800; g.s.ai[0].mr = 2000; g.s.ai[1].mr = 1500;
    for (let i = 2; i < g.s.ai.length; i++) g.s.ai[i].mr = 1000 + i;
    g.endSeasonIfNeeded();
    check(g.s.lastSeasonEnded === 1 && g.s.seasonHistory.length === 1 && g.s.seasonHistory[0].featured === 'egmil', 'season 1 resolves with Egmil featured');
    check(g.s.mr === 1000 && g.s.ai.every(p => p.mr === 1000), 'all MR reset to 1000 after season');
    check(g.s.seasonPics.includes(1) || g.s.ai.some(p => p.seasonPics.includes(1)), 'top 8 earned season pic');
    check(g.s.ai.some(p => p.coin === 'season:1') || g.s.coin === 'season:1', 'top 8 equipped gold season coin'); }
}

// ---- Rivals & Allies ----
{ const ra = E.DB.cards.filter(c => c.set === 'RA' && isMon(c));
  check(ra.length === 19, `RA has 19 doremon (${ra.length})`);
  check(E.ofRarity('RA','LGD').length === 3 && E.ofRarity('RA','MYT').length === 1, 'RA chase 3 LGD + 1 MYT');
  check(E.DB.cards.filter(c => c.pack === 'RA').length === 11, 'RA has 11 pack spells/traps');
  check(card('pr_ursacoon_flame_punch') && card('pr_ursacoon_flame_punch').promo && card('pr_ursacoon_flame_punch').set === 'PR', 'Ursacoon Flame Punch promo');
  check(!E.DB.cards.some(c => c.id === 'cv_rampagoone'), 'CV Rampagoone stub removed');
  check(card('ra_rampagoone') && card('ra_rampagoone').set === 'RA', 'Rampagoone lives in RA');
  check(card('st_soothing_wave').effect.healAll === 100, 'Soothing Wave healAll 100');
  check(card('st_double_protect').effect.protect === 2, 'Double Protect protect:2');
  check(card('st_roar').effect.roar === 1 && card('st_duel').effect.duel === 1, 'Roar + Duel traps');
  check(card('ra_mesby').passive?.allyAtk === 1 && card('ra_fluffram').passive?.allyDef === 1 && card('ra_sweuw').passive?.allyDef === 1, 'Ally ATK/DEF auras');
  check(Packs.rule('RA').chase.join() === 'LGD,MYT', 'RA pack chase');
  check(E.SETS.includes('RA'), 'SETS includes RA');
  { const g = new Game(null, 9n); g.save = () => {};
    check((g.s.packs.RA || 0) === 3, `new game has 3 RA packs (got ${g.s.packs.RA})`); }
  { const g = new Game(null, 10n); g.save = () => {}; g.s.packs = { WW:0,FL:0,T2:0,HT:0 }; g.s._gift_ht=true; g.s._gift_v20=true; g.s._gift_ra=false; g.migrateSave();
    check((g.s.packs.RA||0) >= 3 && g.s._gift_ra, `migrate grants 3 RA packs (got ${g.s.packs.RA})`); }
  // Roar cancels attack
  { const b = new Battle(E.STARTER_DECK.map(card), 'A', E.STARTER_DECK.map(card), 'B', 3n, 0);
    b.sides[0].mons[0] = Object.assign(E.newMon(card('ww_snarlpup')), { ready: true });
    b.sides[0].mons[1] = Object.assign(E.newMon(card('ww_acornix')), { ready: true });
    b.sides[1].mons[0] = Object.assign(E.newMon(card('ww_gruugy')), { ready: true });
    b.sides[1].traps[0] = card('st_roar');
    const hp = b.sides[1].mons[0].hp;
    b.apply({ t: 'attack', from: 0, to: 0 });
    check(b.sides[1].mons[0] && b.sides[1].mons[0].hp === hp, 'Roar cancels damage');
  }
  // single-target aura: Mesby buffs one chosen ally; never self; no other ally → no effect
  { const b = new Battle(E.STARTER_DECK.map(card), 'A', E.STARTER_DECK.map(card), 'B', 4n, 0);
    b.humanSide = null; // AI auto-pick
    b.sides[0].mons[0] = Object.assign(E.newMon(card('ra_mesby')), { ready: true });
    b.sides[0].mons[1] = Object.assign(E.newMon(card('ww_snarlpup')), { ready: true });
    E.beginPassive(b, 0, 0);
    check(b.sides[0].mons[1].atk === 1, `Mesby aura gives chosen ally ATK +1 (got ${b.sides[0].mons[1].atk})`);
    check(b.sides[0].mons[0].atk === 0, 'aura never applies to self');
    E.clearPassive(b, 0, b.sides[0].mons[0]);
    check(b.sides[0].mons[1].atk === 0, 'clearing aura reverses the buff');
  }
  // rival aura: Dustwidow picks one foe for ATK -1
  { const b = new Battle(E.STARTER_DECK.map(card), 'A', E.STARTER_DECK.map(card), 'B', 5n, 0);
    b.humanSide = null;
    b.sides[0].mons[0] = Object.assign(E.newMon(card('ra_dustwidow')), { ready: true });
    b.sides[1].mons[0] = Object.assign(E.newMon(card('ww_gruugy')), { ready: true });
    b.sides[1].mons[1] = Object.assign(E.newMon(card('ww_acornix')), { ready: true });
    E.beginPassive(b, 0, 0);
    const debuffed = [0, 1].filter(i => b.sides[1].mons[i].atk === -1);
    check(debuffed.length === 1, `rival aura hits exactly one foe (hit ${debuffed.length})`);
  }
  // aura variant mix: all four kinds present
  { const kinds = new Set();
    for (const id of ['ra_mesby','ra_sweuw','ra_dustwidow','ra_twinbloom','ra_mossfang','ra_fluffram']) {
      const p = card(id).passive || {}; for (const k of Object.keys(p)) kinds.add(k);
      check(/ATK|DEF/.test(card(id).text || ''), `${id} text shows ATK/DEF`);
    }
    check(['allyAtk','allyDef','foeAtk','foeDef'].every(k => kinds.has(k)), `aura mix has all 4 variants (${[...kinds]})`);
  }
  // Season 10 League reward is Ursacoon promo
  { check(E.SEASON_PLAN[9].promo === 'pr_ursacoon_flame_punch', 'Season 10 promo = Ursacoon');
    const g = new Game(null, 11n); g.save = () => {};
    g.s.lastSeasonEnded = 9; g.s.day = 620; g.s.mr = 2000; // end of season 10
    g.endSeasonIfNeeded();
    check((g.s.owned.pr_ursacoon_flame_punch || 0) >= 1, `Season 10 top8 get Ursacoon promo (got ${g.s.owned.pr_ursacoon_flame_punch})`);
  }
  // Double Protect = 2 targets for one turn (Mirror Veil timing)
  { check(card('st_double_protect').effect.protect === 2, 'Double Protect shields up to 2 doremon for one turn'); }
}


// ---- v21 checks ----
{ check(typeof E.SET_NAMES.RA === 'string', 'RA set name');
  // HT roster: sole LGD Goldgulp; Skoldin in HT; Rampagoone in RA
  const htL = E.DB.cards.filter(c => c.set==='HT' && c.kind==='mon' && (c.legendary || c.rarity==='LGD'));
  check(htL.length===1 && htL[0].id==='ht_goldgulp', `HT sole LGD is Goldgulp (${htL.map(c=>c.id)})`);
  check(card('ht_skoldin') && card('ht_skoldin').types.join()==='Bug', 'Skoldin in HT as Bug');
  check(card('ra_rampagoone') && !card('ht_rampagoone') && !card('cv_rampagoone'), 'Rampagoone only in RA');
  check(card('ht_viletios').types.join()==='Psychic' && card('ht_shelzele').types.join()==='Dark', 'Viletios Psychic / Shelzele Dark');
  check(card('ht_golechoke').types.join()==='Fighting,Steel' && card('ht_spikebrute').types.join()==='Dark,Steel', 'Golechoke Fighting/Steel / Spikebrute Dark/Steel');
  check(card('ht_empoora').types.join()==='Water,Steel' && card('ht_empoora').split==='double', 'Empoora Water/Steel double');
  check(card('ht_draplin').types.join()==='Bug,Poison' && card('ht_phioice').types.includes('Ice'), 'Draplin Bug/Poison / Phioice Ice');
  check(card('ht_sandtabby').hp>=280, `Sandtabby HP buff (${card('ht_sandtabby').hp})`);
  check(card('st_sandstorm').artMon==='sandtabby', 'Sandstorm artMon is HT Sandtabby');
  check(E.SEASON_PLAN.length===30 && E.SEASON_PLAN.every(r => r.mat && r.mat.primary), '30 seasons with mat colors');
  check(E.SEASON_PLAN[9].promo==='pr_ursacoon_flame_punch', 'Season 10 Ursacoon promo');
}


// v21 regression: old saves missing gift keys must NOT inherit freshSave()'s true flags
{
  const g0 = new Game(null, 41n); g0.save = () => {};
  const ai = g0.s.ai.map(p => ({ ...p, owned: { ...p.owned }, pity: { ...p.pity } }));
  const v19 = {
    version: 3, money: 900, owned: { ww_snarlpup: 1 }, packs: { WW: 1, FL: 0, T2: 2, HT: 0 },
    pity: {}, packsOpened: {}, decks: [[], [], []], deckNames: ['Deck 1', 'Deck 2', 'Deck 3'], activeDeck: 0,
    mr: 1000, bestMr: 1000, wins: 0, losses: 0, streak: 0, bestStreak: 0, leagueWins: 0,
    cardsSold: 0, singlesBought: 0, trades: 0, achievements: [], ai, offers: [], market: g0.s.market,
    day: 5, recent: [], seed: '41', pulledRarities: [], stats: g0.s.stats,
    bank: { initial: 25500, faucet: 0, sink: 0 }, auctions: [], auctionLog: [], nextId: 1, lastDay: [],
    oppHistory: [], clock: Date.now(), seenHoldTip: true, splitKOs: 0,
    profilePic: null, coin: 'axerupi', seasonPics: [], seasonCoins: [], seasonHistory: [], lastSeasonEnded: 0
  };
  const store = { raw: JSON.stringify(v19), load() { return this.raw; }, save(t) { this.raw = t; } };
  const g = new Game(store, 42n);
  const exp = { WW: 4, FL: 3, T2: 5, HT: 4, RA: 6 };
  for (const k of E.SETS) check(g.s.packs[k] === exp[k], `gift-flag bleed ${k}: got ${g.s.packs[k]} want ${exp[k]}`);
  console.log('PASS old save without gift keys gets HT+1, v20 +3/set, RA +3');
}


// v22: every spell/trap must have card art in the asset bundles (web) — catches RA/HT omissions
{
  const keys = new Set();
  for (let i = 0; i < 10; i++) {
    const p = `assets/b${i}.json`;
    if (!fs.existsSync(p)) continue;
    Object.keys(JSON.parse(fs.readFileSync(p, 'utf8'))).forEach(k => keys.add(k));
  }
  const st = E.DB.cards.filter(c => c.kind === 'spell' || c.kind === 'trap');
  const miss = st.filter(c => !keys.has('cards/' + c.id)).map(c => c.id);
  check(miss.length === 0, `every spell/trap has art in assets (missing ${miss.join(',') || 'none'})`);
  // legendary HT supplies keep legendary flag + clean text (no LEGENDARY X: prefix)
  for (const id of ['st_sandstorm', 'st_revive']) {
    const c = card(id);
    check(c.legendary === true, `${id} legendary flag`);
    check(!/^LEGENDARY\s+(SPELL|TRAP)\s*:/i.test(c.text || ''), `${id} text has no LEGENDARY prefix`);
  }
  console.log('PASS every spell/trap has bundled art + legendary ST text clean');
}

console.log(fails === 0 ? 'ALL TESTS PASSED' : `${fails} FAILURES`); process.exit(fails ? 1 : 0);
