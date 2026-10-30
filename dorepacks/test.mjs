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
for (const set of ['WW', 'FL']) {
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
  check(player.every(p => p.length === 7 && p.slice(0, 4).every(c => c.rarity === 'C')), `${set}: 7 cards, slots 1-4 common`);
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
// economy
g = new Game(null, 5n);
const sells = { C: 'ww_snarlpup', U: 'ww_sprigchimp', R: 'ww_glootios', SR: 'ww_rokbru', SSR: 'ww_axerupi' }, expect = { C: 10, U: 25, R: 60, SR: 150, SSR: 1000 };
for (const r in sells) { g.s.market[sells[r]].factor = 1; check(g.sellPrice(sells[r]) === expect[r], `sell ${r} = $${expect[r]} at neutral market (got ${g.sellPrice(sells[r])})`); }
g.s.owned.ww_axerupi = 1; check(!g.sell('ww_axerupi'), "can't sell your last copy");
g.s.owned.ww_axerupi = 3; const m0 = g.s.money; check(g.sell('ww_axerupi') && g.s.money > m0 && g.s.owned.ww_axerupi === 2, 'selling a dupe pays');
check(g.buyPrice('ww_glootios') >= g.sellPrice('ww_glootios') * 2, 'no buy/sell arbitrage');
g.s.money = 10000; check(g.buyPack('FL') && g.s.money === 9200, 'Fallen Legends pack costs $800');
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
console.log(fails === 0 ? 'ALL TESTS PASSED' : `${fails} FAILURES`); process.exit(fails ? 1 : 0);
