// Dorepacks engine - a faithful port of the Mac app's Model.swift / Engine.swift / Game.swift (pure logic, no DOM).
// Works in the browser (ES module) and in Node (tests).

// ---------- card DB ----------
export const DB = { cards: [], byId: {}, chart: {}, typeColors: {} };
export function initDB(file) {
  DB.cards = file.cards; DB.chart = file.chart; DB.typeColors = file.typeColors; DB.byId = {};
  for (const c of DB.cards) DB.byId[c.id] = c;
}
export const card = (id) => DB.byId[id];
export const inSet = (s) => DB.cards.filter(c => c.set === s).sort((a, b) => a.num - b.num);
export const ofRarity = (s, r) => DB.cards.filter(c => c.set === s && c.rarity === r).sort((a, b) => a.num - b.num);
export const supplies = () => inSet('ST');
export const isMon = c => c.kind === 'mon', isSpell = c => c.kind === 'spell', isTrap = c => c.kind === 'trap';
export const spriteId = c => c.mon || c.artMon || '';
export const eff = (c, k) => (c.effect && typeof c.effect[k] === 'number') ? c.effect[k] : 0;
export const effS = (c, k) => (c.effect && typeof c.effect[k] === 'string') ? c.effect[k] : null;
/** The game's standard type chart. Multiplies over every defending type. */
export function effectiveness(atk, defTypes) { let m = 1; for (const d of defTypes) { const v = DB.chart[atk]?.[d]; m *= (v === undefined ? 1 : v); } return m; }

export const Rarity = {
  order: ['C', 'U', 'R', 'SR', 'SSR', 'LGD', 'MYT', 'ITEM'],
  rank: r => Math.max(0, Rarity.order.indexOf(r)),
  name: r => ({ C: 'Common', U: 'Uncommon', R: 'Rare', SR: 'Super Rare', SSR: 'SSR', LGD: 'Legendary', MYT: 'Mythical', ITEM: 'Spell/Trap' }[r] || 'Supply'),
  isChase: r => r === 'SSR' || r === 'LGD' || r === 'MYT',
  baseValue: r => ({ C: 30, U: 75, R: 180, SR: 450, SSR: 3000, LGD: 4500, MYT: 9000 }[r] ?? 100),
  copyLimit: c => (c.rarity === 'LGD' || c.rarity === 'MYT') ? 1 : 2,   // max 2 of any card in a deck; Legendary/Mythical 1
  keepCopies: 3,   // a card is a dupe (sellable) only beyond 3 owned copies: 2 for a deck + 1 to trade
};

// ---------- RNG: SplitMix64, bit-identical to the Swift version ----------
const M64 = (1n << 64n) - 1n;
export class SplitMix {
  constructor(seed) { this.state = BigInt.asUintN(64, BigInt(seed)); }
  next() {
    this.state = (this.state + 0x9E3779B97F4A7C15n) & M64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M64;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & M64;
    return z ^ (z >> 31n);
  }
  unit() { return Number(this.next() >> 11n) / 9007199254740992; }
  chance(p) { return this.unit() < p; }
  int(n) { return n <= 1 ? 0 : Number(this.next() % BigInt(n)); }
}
export const randomSeed = () => { const a = new Uint32Array(2); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a); return (BigInt(a[0]) << 32n) | BigInt(a[1]) | 1n; };

// ---------- packs: ONE function for the player and every AI ----------
export const Packs = {
  size: 7,
  // ITEM = a spell/trap card (Supplies). Slot 3: 30% spell/trap, slot 4: always a spell/trap. Slots 5-7 (and every chase rate + pity) unchanged.
  WW: { set: 'WW', name: 'Whispering Winds', price: 500, pity: 30, tiers: ['C', 'U', 'R', 'SR', 'SSR', 'ITEM'],
    slots: [[100,0,0,0,0,0],[100,0,0,0,0,0],[70,0,0,0,0,30],[0,0,0,0,0,100],[0,88,10,2,0,0],[0,65,30,5,0,0],[0,0,80,18.5,1.5,0]], chase: ['SSR'], pityOdds: [1] },
  FL: { set: 'FL', name: 'Fallen Legends', price: 800, pity: 40, tiers: ['C', 'U', 'R', 'SR', 'LGD', 'MYT', 'ITEM'],
    slots: [[100,0,0,0,0,0,0],[100,0,0,0,0,0,0],[70,0,0,0,0,0,30],[0,0,0,0,0,0,100],[0,88,10,2,0,0,0],[0,65,30,5,0,0,0],[0,0,78,18,3.5,0.5,0]], chase: ['LGD', 'MYT'], pityOdds: [3.5, 0.5] },
  /** spell/trap pick weight: inverse of shop price (Potion common, Guard Wall rare) */
  itemWeight: c => 1 / (c.price || 100),
  itemOdds() { const sup = supplies(), tot = sup.reduce((a, c) => a + Packs.itemWeight(c), 0); return sup.map(c => [c, Packs.itemWeight(c) / tot]); },
  pickItem(rng) { const sup = supplies(), tot = sup.reduce((a, c) => a + Packs.itemWeight(c), 0); let r = rng.unit() * tot; for (const c of sup) { r -= Packs.itemWeight(c); if (r < 0) return c; } return sup[sup.length - 1]; },
  rule: s => s === 'FL' ? Packs.FL : Packs.WW,
  rollRarity(rule, slot, forceChase, rng) {
    if (forceChase && slot === Packs.size - 1) {
      const tot = rule.pityOdds.reduce((a, b) => a + b, 0); let r = rng.unit() * tot;
      for (let i = 0; i < rule.pityOdds.length; i++) { if (r < rule.pityOdds[i]) return rule.chase[i]; r -= rule.pityOdds[i]; }
      return rule.chase[0];
    }
    const o = rule.slots[slot]; const r = rng.unit() * 100; let acc = 0;
    for (let i = 0; i < o.length; i++) { if (o[i] <= 0) continue; acc += o[i]; if (r < acc) return rule.tiers[i]; }
    let last = 0; o.forEach((p, i) => { if (p > 0) last = i; }); return rule.tiers[last];
  },
  /** Opens one pack. pityRef = {v}: packs of this set since the owner's last chase card. */
  open(set, pityRef, owned, rng) {
    const rule = Packs.rule(set); const force = pityRef.v >= rule.pity - 1; const out = [];
    for (let s = 0; s < Packs.size; s++) {
      const r = Packs.rollRarity(rule, s, force, rng);
      if (r === 'ITEM') { out.push(Packs.pickItem(rng)); continue; }
      let pool = ofRarity(set, r);
      if (Rarity.isChase(r)) { const fresh = pool.filter(c => !(owned[c.id] > 0)); if (fresh.length) pool = fresh; }
      out.push(pool[rng.int(pool.length)]);
    }
    pityRef.v = out.some(c => rule.chase.includes(c.rarity)) ? 0 : pityRef.v + 1;
    return out;
  },
  fmt: d => d === Math.round(d) ? String(d) : d.toFixed(1),
  effectiveChase(set) {
    const r = Packs.rule(set); const p = r.chase.map(c => r.slots[6][r.tiers.indexOf(c)]).reduce((a, b) => a + b, 0) / 100;
    let e = 0; for (let k = 0; k < r.pity; k++) e += Math.pow(1 - p, k); return 1 / e;
  },
  ratesText(set) {
    const r = Packs.rule(set); const rows = [['Slots 1-2', 'Common 100%']];
    for (let s = 2; s < 7; s++) rows.push([`Slot ${s + 1}`, r.tiers.map((t, i) => [t, r.slots[s][i]]).filter(x => x[1] > 0).map(x => `${Rarity.name(x[0])} ${Packs.fmt(x[1])}%`).join(' · ')]);
    const chaseP = r.chase.map(c => r.slots[6][r.tiers.indexOf(c)]).reduce((a, b) => a + b, 0);
    const names = r.chase.map(Rarity.name).join(' / ');
    rows.push(['Chase', `${names}: ${Packs.fmt(chaseP)}% per pack`]);
    rows.push(['Pity', `Guaranteed ${names} in slot 7 on pack ${r.pity} if you haven't hit one in the ${r.pity - 1} before`]);
    const ec = Packs.effectiveChase(set);
    rows.push(['With pity', `Real long-run rate ≈ ${(ec * 100).toFixed(1)}% per pack (about 1 every ${Math.round(1 / ec)} packs)`]);
    rows.push(['Each card', set === 'FL' ? 'Each Legendary ~1.17% · Mythical 0.5% per pack (pity: Mythical 1 in 8)' : 'Each SSR starter 0.375% per pack']);
    const io = Packs.itemOdds(); const ex = n => io.filter(x => x[0].id === n)[0][1];
    rows.push(['Spells/traps', `1.3 per pack on average. Which one is weighted by shop price: Potion ${(ex('st_potion') * 100).toFixed(1)}%, Super Potion ${(ex('st_super_potion') * 100).toFixed(1)}%, Guard Wall ${(ex('st_guard_wall') * 100).toFixed(1)}% of spell/trap pulls`]);
    rows.push(['Fairness', 'Every AI opens packs with this exact function and its own pity counter']);
    return rows;
  },
};

// ---------- battle ----------
export const STATUS = { none: ['', ''], psn: ['PSN', 'Poisoned'], brn: ['BRN', 'Burned'], par: ['PAR', 'Paralyzed'], slp: ['SLP', 'Asleep'], cnf: ['CNF', 'Confused'] };
let monUid = 0;
export const newMon = (c) => ({ uid: ++monUid, card: c, hp: c.hp, atk: 0, def: 0, status: 'none', statusTurns: 0, ready: false, attacked: false });
export const canAttack = m => m.ready && !m.attacked && m.status !== 'par' && m.status !== 'slp';
const newSide = (name, deck) => ({ name, deck, hand: [], discard: [], mons: Array(6).fill(null), traps: Array(6).fill(null), life: Battle.startLife, monsPlayed: 0, stPlayed: 0, stalled: false, koCount: 0, freshTraps: [] });
export const monCount = s => s.mons.filter(Boolean).length;
const hasAnyMonLeft = s => monCount(s) > 0 || s.hand.some(isMon) || s.deck.some(isMon);
const clamp4 = v => Math.max(-4, Math.min(4, v));

// actions: {t:'playMon',hand,slot} {t:'spell',hand,target} {t:'setTrap',hand,slot} {t:'attack',from,to} {t:'end'}
//          {t:'undo',kind:'mon'|'trap',slot}  take back a doremon/trap played this turn (nothing resolved from it yet)
export class Battle {
  static startLife = 5; static handStart = 5; static handMax = 10; static turnCap = 80;
  constructor(deckA, nameA, deckB, nameB, seed, first = 0) {
    this.rng = new SplitMix(seed); this.current = 0; this.turnNumber = 1; this.winner = null; this.over = false; this.events = [];
    const a = deckA.slice(), b = deckB.slice();
    Battle.shuffle(a, this.rng); Battle.shuffle(b, this.rng);
    this.sides = [newSide(nameA, a), newSide(nameB, b)];
    for (let s = 0; s < 2; s++) { Battle.mulligan(this.sides[s]); for (let i = 0; i < Battle.handStart; i++) this.draw(s, true); }
    this.current = first;
    this.events.push({ e: 'turn', side: first }); this.log(`${this.sides[first].name} goes first.`);
  }
  static shuffle(d, rng) { if (d.length < 2) return; for (let i = d.length - 1; i > 0; i--) { const j = rng.int(i + 1); [d[i], d[j]] = [d[j], d[i]]; } }
  static mulligan(s) {
    const n = Math.min(Battle.handStart, s.deck.length);
    if (n === 0 || s.deck.slice(0, n).some(isMon)) return;
    const j = s.deck.findIndex((c, i) => i >= n && isMon(c)); if (j >= 0) [s.deck[0], s.deck[j]] = [s.deck[j], s.deck[0]];
  }
  log(s) { this.events.push({ e: 'log', text: s }); }
  get opp() { return 1 - this.current; }
  draw(s, silent = false) {
    const S = this.sides[s];
    if (!S.deck.length) { if (!silent) { this.log(`${S.name}'s deck is empty - loses 1 life!`); this.loseLife(s); } return; }
    const c = S.deck.shift();
    if (S.hand.length >= Battle.handMax) { S.discard.push(c); if (!silent) this.log(`${S.name}'s hand is full - ${c.name} is discarded.`); }
    else S.hand.push(c);
  }
  loseLife(s) { this.sides[s].life -= 1; if (this.sides[s].life <= 0) this.finish(1 - s); }
  finish(w) {
    if (this.over) return; this.over = true; this.winner = w;
    this.log(w == null ? 'The battle ends in a draw.' : `${this.sides[w].name} wins!`);
    this.events.push({ e: 'gameOver', winner: w });
  }
  static stageMul(s) { return s >= 0 ? (2 + s) / 2 : 2 / (2 - s); }
  /** returns [damage, effectiveness] */
  static damage(a, d) {
    const ef = effectiveness(a.card.moveType, d.card.types);
    if (ef === 0) return [0, 0];
    let x = a.card.dmg * ef * Battle.stageMul(a.atk) / Battle.stageMul(d.def);
    if (a.status === 'brn') x *= 0.5;
    return [Math.max(10, swiftRound(x / 10) * 10), ef];
  }
  spellNeedsTarget(c) { return eff(c, 'heal') > 0 || effS(c, 'cure') != null || eff(c, 'atk') !== 0 || eff(c, 'def') !== 0; }
  spellValid(c, s, target) {
    const st = this.sides[s];
    if (!this.spellNeedsTarget(c)) {
      if (eff(c, 'healAll') > 0) return st.mons.some(m => m && m.hp < m.card.hp);
      return monCount(st) > 0;
    }
    if (target == null || target < 0 || target >= 6) return false; const m = st.mons[target]; if (!m) return false;
    if (eff(c, 'heal') > 0) return m.hp < m.card.hp;
    const cu = effS(c, 'cure'); if (cu != null) return m.status !== 'none' && (cu === 'all' || cu === m.status);
    return true;
  }
  isLegal(a) {
    if (this.over) return false;
    const s = this.sides[this.current];
    switch (a.t) {
      case 'end': return true;
      case 'undo': return this.canUndo(this.current, a.kind, a.slot);
      case 'playMon': return a.hand >= 0 && a.hand < s.hand.length && isMon(s.hand[a.hand]) && s.monsPlayed < 1 && a.slot >= 0 && a.slot < 6 && !s.mons[a.slot];
      case 'setTrap': return a.hand >= 0 && a.hand < s.hand.length && isTrap(s.hand[a.hand]) && s.stPlayed < 2 && a.slot >= 0 && a.slot < 6 && !s.traps[a.slot];
      case 'spell': return a.hand >= 0 && a.hand < s.hand.length && isSpell(s.hand[a.hand]) && s.stPlayed < 2 && this.spellValid(s.hand[a.hand], this.current, a.target);
      case 'attack': {
        if (a.from < 0 || a.from >= 6) return false; const m = s.mons[a.from]; if (!m || !canAttack(m) || s.stalled) return false;
        const o = this.sides[this.opp];
        if (a.to != null) return a.to >= 0 && a.to < 6 && !!o.mons[a.to];
        return monCount(o) === 0;
      }
    }
    return false;
  }
  apply(a) {
    if (!this.isLegal(a)) return false;
    const me = this.current, S = this.sides[me];
    switch (a.t) {
      case 'end': this.endTurn(); break;
      case 'undo': {
        const c = a.kind === 'mon' ? S.mons[a.slot].card : S.traps[a.slot];
        if (a.kind === 'mon') { S.mons[a.slot] = null; S.monsPlayed--; } else { S.traps[a.slot] = null; S.stPlayed--; S.freshTraps = S.freshTraps.filter(x => x !== a.slot); }
        S.hand.push(c); this.events.push({ e: 'undo', side: me, card: c, kind: a.kind, slot: a.slot });
        this.log(a.kind === 'mon' ? `${S.name} takes back ${c.name}.` : `${S.name} picks a set trap back up.`); break;
      }
      case 'playMon': { const c = S.hand.splice(a.hand, 1)[0]; S.mons[a.slot] = newMon(c); S.mons[a.slot].fresh = true; S.monsPlayed++; this.events.push({ e: 'played', side: me, card: c }); this.log(`${S.name} plays ${c.name} (HP ${c.hp}).`); break; }
      case 'setTrap': { const c = S.hand.splice(a.hand, 1)[0]; S.traps[a.slot] = c; S.freshTraps.push(a.slot); S.stPlayed++; this.events.push({ e: 'set', side: me, slot: a.slot }); this.log(`${S.name} sets a trap face-down.`); break; }
      case 'spell': { const c = S.hand.splice(a.hand, 1)[0]; S.stPlayed++; this.events.push({ e: 'played', side: me, card: c }); this.castSpell(c, me, a.target); S.discard.push(c); break; }
      case 'attack': this.attack(a.from, a.to); break;
    }
    this.checkBoardLoss();
    return true;
  }
  /** take-back rule: only on your own turn, only something placed THIS turn, and only while nothing has resolved from or onto it */
  canUndo(s, kind, slot) {
    if (this.over || s !== this.current || slot == null || slot < 0 || slot >= 6) return false;
    const S = this.sides[s];
    if (kind === 'mon') { const m = S.mons[slot]; return !!m && m.fresh === true && !m.attacked && m.hp === m.card.hp && m.atk === 0 && m.def === 0 && m.status === 'none' && S.hand.length < Battle.handMax; }
    if (kind === 'trap') return !!S.traps[slot] && S.freshTraps.includes(slot) && S.hand.length < Battle.handMax;
    return false;
  }
  castSpell(c, s, t) {
    const S = this.sides[s], who = S.name;
    if (t != null && S.mons[t]) S.mons[t].fresh = false;                                 // a spell resolved onto it: locked in
    if (eff(c, 'healAll') > 0 || eff(c, 'atkAll') !== 0 || eff(c, 'defAll') !== 0) for (const m of S.mons) if (m) m.fresh = false;
    if (eff(c, 'heal') > 0 && t != null && S.mons[t]) { const m = S.mons[t]; const amt = Math.min(eff(c, 'heal'), m.card.hp - m.hp); m.hp += amt; this.events.push({ e: 'heal', side: s, slot: t, amount: amt }); this.log(`${who} uses ${c.name}: ${m.card.name} heals ${amt}.`); }
    if (eff(c, 'healAll') > 0) {
      for (let i = 0; i < 6; i++) { const m = S.mons[i]; if (m && m.hp < m.card.hp) { const amt = Math.min(eff(c, 'healAll'), m.card.hp - m.hp); m.hp += amt; this.events.push({ e: 'heal', side: s, slot: i, amount: amt }); } }
      this.log(`${who} uses ${c.name}: the whole team heals.`);
    }
    if (effS(c, 'cure') != null && t != null && S.mons[t]) { const m = S.mons[t]; this.log(`${who} uses ${c.name}: ${m.card.name} is no longer ${STATUS[m.status][1].toLowerCase()}.`); m.status = 'none'; m.statusTurns = 0; this.events.push({ e: 'status', side: s, slot: t, status: 'none' }); }
    if ((eff(c, 'atk') !== 0 || eff(c, 'def') !== 0) && t != null && S.mons[t]) {
      const m = S.mons[t]; m.atk = clamp4(m.atk + eff(c, 'atk')); m.def = clamp4(m.def + eff(c, 'def'));
      const txt = eff(c, 'atk') !== 0 ? `ATK +${eff(c, 'atk')}` : `DEF +${eff(c, 'def')}`;
      this.events.push({ e: 'stat', side: s, slot: t, text: txt }); this.log(`${who} uses ${c.name}: ${m.card.name} ${txt}.`);
    }
    if (eff(c, 'atkAll') !== 0 || eff(c, 'defAll') !== 0) {
      const txt = eff(c, 'atkAll') !== 0 ? `ATK +${eff(c, 'atkAll')}` : `DEF +${eff(c, 'defAll')}`;
      for (let i = 0; i < 6; i++) { const m = S.mons[i]; if (m) { m.atk = clamp4(m.atk + eff(c, 'atkAll')); m.def = clamp4(m.def + eff(c, 'defAll')); this.events.push({ e: 'stat', side: s, slot: i, text: txt }); } }
      this.log(`${who} uses ${c.name}: the whole team gets ${txt}.`);
    }
  }
  attack(f, t) {
    const me = this.current, o = this.opp; const a = this.sides[me].mons[f]; if (!a) return;
    a.attacked = true;
    this.events.push({ e: 'attack', side: me, from: f, to: t });
    const O = this.sides[o];
    const ti = O.traps.findIndex(Boolean);
    if (ti >= 0) {
      const trap = O.traps[ti]; O.traps[ti] = null; O.discard.push(trap);
      this.events.push({ e: 'trap', side: o, card: trap }); this.log(`TRAP! ${O.name} reveals ${trap.name}!`);
      if (eff(trap, 'stall') > 0) { this.sides[me].stalled = true; this.log(`${a.card.name}'s attack is blocked and ${this.sides[me].name} is stalled for the rest of the turn.`); return; }
      if (eff(trap, 'block') > 0) { this.log(`${a.card.name}'s attack is blocked!`); this.hurt(me, f, eff(trap, 'recoil'), 1, 'is pricked by thorns'); return; }
      if (eff(trap, 'atk') !== 0 || eff(trap, 'def') !== 0) {
        a.atk = clamp4(a.atk + eff(trap, 'atk')); a.def = clamp4(a.def + eff(trap, 'def'));
        const txt = eff(trap, 'atk') !== 0 ? `ATK ${eff(trap, 'atk')}` : `DEF ${eff(trap, 'def')}`;
        this.events.push({ e: 'stat', side: me, slot: f, text: txt }); this.log(`${a.card.name} gets ${txt}.`);
      }
      const st = effS(trap, 'status');
      if (st && STATUS[st] && a.status === 'none') { a.status = st; a.statusTurns = 0; this.events.push({ e: 'status', side: me, slot: f, status: st }); this.log(`${a.card.name} is ${STATUS[st][1].toLowerCase()}!`); }
      if (a.status === 'par' || a.status === 'slp') { this.log(`${a.card.name} can't attack!`); return; }
    }
    if (a.status === 'cnf' && this.rng.chance(0.5)) { this.log(`${a.card.name} is confused and hurts itself!`); this.hurt(me, f, 30, 1, 'hits itself'); return; }
    if (t == null) { this.events.push({ e: 'direct', side: o }); this.log(`${a.card.name} attacks ${O.name} directly! (-1 life)`); this.loseLife(o); return; }
    const d = O.mons[t]; if (!d) return;
    const [dmg, ef] = Battle.damage(a, d);
    const note = ef === 0 ? ' It has no effect...' : ef > 1 ? " It's super effective!" : ef < 1 ? " It's not very effective." : '';
    this.log(`${a.card.name} uses ${a.card.move} on ${d.card.name} for ${dmg}.${note}`);
    this.hurt(o, t, dmg, ef, null);
  }
  hurt(s, slot, amt, ef, why) {
    const S = this.sides[s]; const m = S.mons[slot]; if (!m) return;
    m.hp = Math.max(0, m.hp - amt);
    this.events.push({ e: 'damage', side: s, slot, amount: amt, eff: ef });
    if (why) this.log(`${m.card.name} ${why} (-${amt}).`);
    if (m.hp <= 0) {
      S.mons[slot] = null; S.discard.push(m.card); this.sides[1 - s].koCount++;
      this.events.push({ e: 'ko', side: s, slot, name: m.card.name }); this.log(`${m.card.name} is knocked out! ${S.name} loses 1 life.`);
      this.loseLife(s);
    }
  }
  checkBoardLoss() {
    if (this.over) return;
    if (!hasAnyMonLeft(this.sides[0]) && !hasAnyMonLeft(this.sides[1])) { const a = this.sides[0].life, b = this.sides[1].life; this.finish(a === b ? null : a > b ? 0 : 1); }
  }
  endTurn() {
    const me = this.current, S = this.sides[me];
    for (let i = 0; i < 6; i++) {
      const m = S.mons[i]; if (!m) continue;
      switch (m.status) {
        case 'psn': this.hurt(me, i, 20, 1, 'is hurt by poison'); break;
        case 'brn': this.hurt(me, i, 10, 1, 'is hurt by its burn'); break;
        case 'par': m.status = 'none'; this.events.push({ e: 'status', side: me, slot: i, status: 'none' }); this.log(`${m.card.name} is no longer paralyzed.`); break;
        case 'cnf': m.statusTurns++; if (m.statusTurns >= 2) { m.status = 'none'; m.statusTurns = 0; this.events.push({ e: 'status', side: me, slot: i, status: 'none' }); this.log(`${m.card.name} snapped out of confusion.`); } break;
      }
      if (this.over) return;
    }
    if (this.over) return;
    this.turnNumber++;
    if (this.turnNumber > Battle.turnCap) { const a = this.sides[0].life, b = this.sides[1].life; this.finish(a === b ? null : a > b ? 0 : 1); return; }
    this.current = 1 - me; const n = this.current, N = this.sides[n];
    N.monsPlayed = 0; N.stPlayed = 0; N.stalled = false; S.freshTraps = []; N.freshTraps = [];
    for (const m of S.mons) if (m) m.fresh = false;
    for (let i = 0; i < 6; i++) {
      const m = N.mons[i]; if (!m) continue;
      m.ready = true; m.attacked = false;
      if (m.status === 'slp') { m.statusTurns++; if (m.statusTurns >= 2 || this.rng.chance(0.5)) { m.status = 'none'; m.statusTurns = 0; this.events.push({ e: 'status', side: n, slot: i, status: 'none' }); this.log(`${m.card.name} woke up!`); } }
    }
    this.events.push({ e: 'turn', side: n });
    this.log(`— Turn ${this.turnNumber}: ${N.name} —`);
    this.draw(n);
  }
}
// Swift's .rounded() = schoolbook rounding (half away from zero)
export const swiftRound = x => x < 0 ? -Math.round(-x) : Math.round(x);

// ---------- AI ----------
export const BattleAI = {
  monValue: c => c.hp + c.dmg * 1.6 + Rarity.rank(c.rarity) * 8,
  next(b) {
    const me = b.current, o = 1 - me, s = b.sides[me], os = b.sides[o];
    const MV = BattleAI.monValue;
    if (s.monsPlayed === 0) {
      const slot = s.mons.findIndex(m => !m);
      if (slot >= 0) {
        let best = null;
        s.hand.forEach((c, i) => {
          if (!isMon(c)) return; let v = MV(c);
          for (const e of os.mons) { if (!e) continue;
            const ef = effectiveness(c.moveType, e.card.types); v += ef > 1 ? 45 : ef < 1 ? -25 : 0;
            const back = effectiveness(e.card.moveType, c.types); v += back > 1 ? -30 : back < 1 ? 20 : 0; }
          if (!best || v > best[1]) best = [i, v];
        });
        if (best) return { t: 'playMon', hand: best[0], slot };
      }
    }
    if (s.stPlayed < 2) {
      let best = null;
      const consider = (a, v) => { if (v > 0 && b.isLegal(a) && (!best || v > best[1])) best = [a, v]; };
      s.hand.forEach((c, i) => {
        if (isTrap(c)) {
          const slot = s.traps.findIndex(x => !x);
          if (slot >= 0) { const setCount = s.traps.filter(Boolean).length; consider({ t: 'setTrap', hand: i, slot }, (monCount(os) > 0 || monCount(s) > 0 ? 30 : 10) - setCount * 8); }
          return;
        }
        if (!isSpell(c)) return;
        s.mons.forEach((m, t) => {
          if (!m) return; const worth = MV(m.card) / 100; const maxHp = m.card.hp;
          if (eff(c, 'heal') > 0) { const missing = maxHp - m.hp; if (missing >= Math.min(eff(c, 'heal'), Math.trunc(maxHp / 3))) consider({ t: 'spell', hand: i, target: t }, Math.min(missing, eff(c, 'heal')) * 0.6 * worth - (eff(c, 'heal') > 60 && missing < 70 ? 25 : 0)); }
          const cu = effS(c, 'cure');
          if (cu && m.status !== 'none' && (cu === 'all' || cu === m.status)) consider({ t: 'spell', hand: i, target: t }, (m.status === 'par' || m.status === 'slp' ? 50 : m.status === 'psn' ? 40 : 30) * worth - (cu === 'all' ? 5 : 0));
          if (eff(c, 'atk') > 0 && monCount(os) > 0 && m.atk < 3) consider({ t: 'spell', hand: i, target: t }, m.card.dmg * 0.35 * eff(c, 'atk') * (m.ready ? 1.2 : 0.9) * m.hp / maxHp);
          if (eff(c, 'def') > 0 && m.def < 3) consider({ t: 'spell', hand: i, target: t }, m.hp * 0.12 * eff(c, 'def') * (monCount(os) > 0 ? 1 : 0.4));
        });
        if (eff(c, 'healAll') > 0) { const miss = s.mons.filter(Boolean).map(m => Math.min(eff(c, 'healAll'), m.card.hp - m.hp)).reduce((x, y) => x + y, 0); consider({ t: 'spell', hand: i, target: null }, miss * 0.5 - 10); }
        if (eff(c, 'atkAll') > 0 && monCount(os) > 0) consider({ t: 'spell', hand: i, target: null }, monCount(s) * 14 - 8);
        if (eff(c, 'defAll') > 0) consider({ t: 'spell', hand: i, target: null }, monCount(s) * 12 - 8);
      });
      if (best) return best[0];
    }
    if (!s.stalled) {
      const trapsUp = os.traps.some(Boolean);
      const attackers = s.mons.map((m, i) => [i, m]).filter(x => x[1] && canAttack(x[1]))
        .sort((x, y) => trapsUp ? MV(x[1].card) - MV(y[1].card) : y[1].card.dmg - x[1].card.dmg);
      for (const [i, a] of attackers) {
        if (monCount(os) === 0) return { t: 'attack', from: i, to: null };
        let best = null;
        os.mons.forEach((d, t) => {
          if (!d) return; const [dmg] = Battle.damage(a, d); let v;
          if (dmg >= d.hp) v = 1000 + MV(d.card) - (dmg - d.hp) * 0.1; else v = dmg + MV(d.card) * 0.15 + (d.card.hp - d.hp) * 0.2;
          if (dmg === 0) v = -1;
          if (!best || v > best[1]) best = [t, v];
        });
        if (best && best[1] > 0) return { t: 'attack', from: i, to: best[0] };
      }
    }
    return { t: 'end' };
  },
  /** coin-flip winner's choice. Playtests show the first player wins ~60% of decided games, so the sensible pick is to go first. */
  chooseFirst() { return true; },
  simulate(b, maxActions = 4000) {
    let n = 0;
    while (!b.over && n < maxActions) { const a = BattleAI.next(b); if (!b.apply(a)) b.apply({ t: 'end' }); n++; }
    if (!b.over) b.finish(null);
    return b.winner;
  },
};

// ---------- decks ----------
export const DeckRules = {
  size: 20, minMons: 8, maxSupplies: 10,
  problems(ids) {
    const p = []; const cards = ids.map(card).filter(Boolean);
    if (cards.length !== 20) p.push(`A deck needs exactly 20 cards (has ${cards.length}).`);
    const mons = cards.filter(isMon).length;
    if (mons < 8) p.push(`At least 8 doremon cards (has ${mons}).`);
    if (cards.length - mons > 10) p.push('At most 10 spell/trap cards.');
    const cnt = {}; for (const c of cards) cnt[c.id] = (cnt[c.id] || 0) + 1;
    for (const id in cnt) { const c = card(id); if (cnt[id] > Rarity.copyLimit(c)) p.push(`Too many ${c.name} (max ${Rarity.copyLimit(c)}).`); }
    return p;
  },
  pref: { st_super_potion: 60, st_guard_wall: 58, st_static_web: 57, st_power_up: 56, st_doze_spores: 55, st_menace: 50, st_cheer_on: 48, st_iron_guard: 47, st_potion: 46, st_bramble_shield: 45, st_full_heal: 44, st_shield_pal: 42, st_wisp_scorch: 40, st_soothing_song: 38, st_metal_screech: 36, st_venom_dust: 34, st_bewilder_beam: 33, st_brace_up: 30, st_cute_growl: 28, st_glare_down: 26, st_paralyze_heal: 22, st_awakening: 20, st_antidote: 18, st_burn_heal: 18 },
  autoBuild(owned, rng) {
    const mons = [];
    for (const id of Object.keys(owned).sort()) { const n = owned[id]; if (!(n > 0)) continue; const c = card(id); if (c && isMon(c)) for (let k = 0; k < Math.min(n, Rarity.copyLimit(c)); k++) mons.push([c, BattleAI.monValue(c) - k * 6 + rng.unit() * 4]); }
    mons.sort((a, b) => b[1] - a[1]);
    const sup = [];
    for (const id of Object.keys(owned).sort()) { const n = owned[id]; if (!(n > 0)) continue; const c = card(id); if (c && !isMon(c)) for (let k = 0; k < Math.min(n, Rarity.copyLimit(c)); k++) sup.push([c, (DeckRules.pref[id] ?? 20) - k * 12 + rng.unit() * 3]); }
    sup.sort((a, b) => b[1] - a[1]);
    const nSup = Math.min(7, sup.length);
    let deck = sup.slice(0, nSup).map(x => x[0].id);
    deck = deck.concat(mons.slice(0, 20 - deck.length).map(x => x[0].id));
    if (deck.length < 20) deck = deck.concat(sup.slice(nSup, nSup + Math.min(20 - deck.length, 10 - nSup)).map(x => x[0].id));
    return deck;
  },
};

// ---------- game: save, economy, market, league, trades, achievements ----------
export const AI_NAMES = [['Kai', 'zebrolt'], ['Mira', 'pinkit'], ['Rook', 'rokbru'], ['Juno', 'pearlgill'], ['Ezra', 'wispeacock'], ['Lumi', 'solpuff'], ['Dax', 'magmaberry'], ['Nova', 'verdaconda']];
export const STARTER = ['ww_snarlpup', 'ww_acornix', 'ww_zapwing', 'ww_spydo', 'ww_gruugy', 'ww_hootuft'];
// Phase 3 starter buff: 1 Zapwing -> Giggleti, 1 Hootuft -> Embertail, Potion -> Super Potion, Cute Growl -> Menace
const STARTER_MONS = ['ww_snarlpup', 'ww_snarlpup', 'ww_acornix', 'ww_acornix', 'ww_giggleti', 'ww_zapwing', 'ww_spydo', 'ww_spydo', 'ww_gruugy', 'ww_gruugy', 'ww_embertail', 'ww_hootuft'];
const STARTER_SUP = ['st_potion', 'st_super_potion', 'st_super_potion', 'st_power_up', 'st_guard_wall', 'st_menace', 'st_static_web', 'st_full_heal'];
export const STARTER_DECK = STARTER_MONS.concat(STARTER_SUP);
const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

export const ACHIEVEMENTS = [
  ['first_pack', 'Rip It!', 'Open your first Dorepack', { WW: 1 }, 0], ['packs_10', 'Pack Rat', 'Open 10 packs', { WW: 1 }, 0],
  ['packs_50', 'Pack Hoarder', 'Open 50 packs', { FL: 2 }, 0], ['first_sr', 'Shiny!', 'Pull a Super Rare', {}, 300],
  ['first_ssr', 'Starter Chase', 'Pull an SSR starter', { FL: 1 }, 0], ['first_lgd', 'Fallen No More', 'Pull a Legendary', { FL: 1 }, 0],
  ['mythic', 'Myth Made Real', 'Pull the Mythical', { FL: 2 }, 0], ['ww_half', 'Half a Breeze', 'Collect 15 Whispering Winds cards', { WW: 1 }, 0],
  ['ww_all', 'Whirlwind Master', 'Complete Whispering Winds (30/30)', { FL: 2 }, 0], ['fl_half', 'Legend Hunter', 'Collect 15 Fallen Legends cards', { FL: 1 }, 0],
  ['fl_all', 'Keeper of Legends', 'Complete Fallen Legends (30/30)', { FL: 3 }, 0], ['first_deck', 'Deck Builder', 'Build your own legal 20-card deck', { WW: 1 }, 0],
  ['first_win', 'First Victory', 'Win a mat battle', { WW: 1 }, 0], ['wins_10', 'Mat Veteran', 'Win 10 battles', { FL: 1 }, 0],
  ['streak_5', 'On Fire', 'Win 5 battles in a row', { FL: 1 }, 0], ['silver', 'Silver League', 'Reach 1050 MR', { WW: 1 }, 0],
  ['gold', 'Gold League', 'Reach 1150 MR', { FL: 1 }, 500], ['platinum', 'Platinum League', 'Reach 1250 MR', { FL: 2 }, 0],
  ['number_one', 'Top of the Ladder', 'Be #1 on the league leaderboard', { FL: 2 }, 1000], ['first_trade', 'Fair Trade', 'Complete a trade', { WW: 1 }, 0],
  ['sell_10', 'Card Shark', 'Sell 10 cards', {}, 200], ['buy_single', 'Window Shopper', 'Buy a single card', { WW: 1 }, 0],
].map(([id, title, desc, packs, money]) => ({ id, title, desc, packs, money }));

export const tier = mr => mr < 1050 ? 'Bronze' : mr < 1150 ? 'Silver' : mr < 1250 ? 'Gold' : mr < 1400 ? 'Platinum' : mr < 1550 ? 'Diamond' : 'Master';
export const elo = (a, b, aWon) => swiftRound(32 * ((aWon ? 1 : 0) - 1 / (1 + Math.pow(10, (b - a) / 400))));

const freshStats = () => ({ pulls: {}, bestPull: null, packsBought: {}, battles: { ranked: { w: 0, l: 0, d: 0 }, friendly: { w: 0, l: 0, d: 0 } }, earned: {}, spent: {}, auctionsWon: 0, auctionsSold: 0, listings: 0, bids: 0, cardsBought: 0, cardsPulled: 0 });
const freshSave = () => ({ version: 2, oppHistory: [], nextOpp: null, money: 1500, owned: {}, packs: { WW: 2, FL: 1 }, pity: {}, packsOpened: {}, decks: [[], [], []], deckNames: ['Deck 1', 'Deck 2', 'Deck 3'], activeDeck: 0,
  mr: 1000, bestMr: 1000, wins: 0, losses: 0, streak: 0, bestStreak: 0, leagueWins: 0, cardsSold: 0, singlesBought: 0, trades: 0, achievements: [], ai: [], offers: [], market: {}, day: 0, recent: [], seed: '0', pulledRarities: [],
  stats: freshStats(), bank: { initial: 0, faucet: 0, sink: 0 }, auctions: [], auctionLog: [], nextId: 1, lastDay: [] });
export const ME = -1;   // "who" id for the player in the ledger / auctions; AIs are 0..7

export const DAY_MS = 10 * 60 * 1000, MAX_CATCHUP = 7 * 24 * 6;   // a league day every 10 real minutes; at most 1 week caught up
export class Game {
  /** storage: {load():string|null, save(string)} or null */
  constructor(storage = null, seed = null) {
    this.storage = storage; this.newAchievements = []; this.onChange = null;
    let loaded = null;
    try { const t = storage && storage.load(); if (t) loaded = JSON.parse(t); } catch (e) { loaded = null; }
    if (loaded && loaded.ai && loaded.ai.length === 8) {
      this.s = Object.assign(freshSave(), loaded);
      this.s.stats = Object.assign(freshStats(), this.s.stats || {});
      for (const P of this.s.ai) { P.earned ??= 0; P.spent ??= 0; P.auctionsWon ??= 0; P.auctionsSold ??= 0; }
      if (!loaded.bank) this.s.bank = { initial: this.totalCash(), faucet: 0, sink: 0 };   // migrate v1 saves: start the ledger now
      this.rng = new SplitMix(BigInt.asUintN(64, BigInt(this.s.seed || '1') + BigInt(Math.floor(Date.now() / 1000))));
    } else { this.s = freshSave(); this.rng = new SplitMix(seed ?? randomSeed()); this.newGame(); }
  }
  newGame() {
    const s = this.s = freshSave();
    for (const id of STARTER_DECK) inc(s.owned, id);
    s.decks[0] = STARTER_DECK.slice(); s.deckNames[0] = 'Starter Deck';
    for (const c of DB.cards) if (isMon(c)) s.market[c.id] = { factor: 1, history: [Rarity.baseValue(c.rarity)] };
    // Fair start: every AI begins exactly like the player — same starter deck, MR, Dorebucks and starting packs,
    // opened with the same pack function. After that they build/rebuild only from their own collections.
    AI_NAMES.forEach(([n, av], k) => {
      const p = { id: `ai${k}`, name: n, avatar: av, mr: s.mr, money: s.money, owned: {}, deck: [], pity: {}, wins: 0, losses: 0, packsOpened: 0, wants: [], earned: 0, spent: 0, auctionsWon: 0, auctionsSold: 0 };
      for (const id of STARTER_DECK) inc(p.owned, id);
      s.ai.push(p);
      for (const set of ['WW', 'FL']) for (let i = 0; i < (s.packs[set] || 0); i++) this.aiOpenPack(k, set, true);
      s.ai[k].deck = DeckRules.autoBuild(s.ai[k].owned, this.rng);
    });
    s.seed = this.rng.next().toString();
    s.bank = { initial: this.totalCash(), faucet: 0, sink: 0 };
    this.save();
  }
  save() { if (this.storage) this.storage.save(JSON.stringify(this.s)); if (this.onChange) this.onChange(); }

  // ---------- ledger: every Dorebuck moves through here ----------
  // faucet = the game pays someone (battle rewards, selling to the shop, achievements)
  // sink   = someone pays the game (packs, shop singles)
  // transfer between players (auction sales, buy-now) creates nothing. Escrowed bids are still counted as cash in totalCash().
  cash(who) { return who === ME ? this.s.money : this.s.ai[who].money; }
  setCash(who, v) { if (who === ME) this.s.money = v; else this.s.ai[who].money = v; }
  earn(who, amt, why) {
    if (amt <= 0) return; this.setCash(who, this.cash(who) + amt); this.s.bank.faucet += amt;
    if (who === ME) inc(this.s.stats.earned, why, amt); else this.s.ai[who].earned += amt;
  }
  spend(who, amt, why) {
    if (amt <= 0) return true; if (this.cash(who) < amt) return false;
    this.setCash(who, this.cash(who) - amt); this.s.bank.sink += amt;
    if (who === ME) inc(this.s.stats.spent, why, amt); else this.s.ai[who].spent += amt;
    return true;
  }
  /** move cash between two parties (or into/out of auction escrow when one side is 'escrow') */
  move(from, to, amt, why) {
    if (amt <= 0) return true;
    if (from !== 'escrow') { if (this.cash(from) < amt) return false; this.setCash(from, this.cash(from) - amt); if (from === ME && why) inc(this.s.stats.spent, why, amt); }
    if (to !== 'escrow') { this.setCash(to, this.cash(to) + amt); if (to === ME && why) inc(this.s.stats.earned, why, amt); }
    return true;
  }
  escrowTotal() { return this.s.auctions.reduce((a, l) => a + (l.high ? l.high.amt : 0), 0); }
  totalCash() { return this.s.money + this.s.ai.reduce((a, p) => a + p.money, 0) + this.escrowTotal(); }
  /** conservation check: cash + escrow == initial + everything the game paid out - everything paid in */
  ledgerBalanced() { const b = this.s.bank; return Math.abs(this.totalCash() - (b.initial + b.faucet - b.sink)) < 1e-6; }
  committed(who) { return this.s.auctions.filter(l => l.high && l.high.who === who).reduce((a, l) => a + l.high.amt, 0); }
  ownedOf(who) { return who === ME ? this.s.owned : this.s.ai[who].owned; }
  nameOf(who) { return who === ME ? 'You' : this.s.ai[who].name; }

  openPack(set) {
    const s = this.s; if (!(s.packs[set] > 0)) return null;
    s.packs[set]--;
    const pity = { v: s.pity[set] || 0 };
    const cards = Packs.open(set, pity, s.owned, this.rng);
    s.pity[set] = pity.v;
    const fresh = new Set();
    for (const c of cards) { if (!(s.owned[c.id] > 0)) fresh.add(c.id); inc(s.owned, c.id); this.supply(c.id, 0.996); inc(s.stats.pulls, c.rarity); s.stats.cardsPulled++;
      const bp = s.stats.bestPull; if (!bp || this.value(c.id) > this.value(bp)) s.stats.bestPull = c.id; }
    inc(s.packsOpened, set);
    for (const c of cards) if (Rarity.rank(c.rarity) >= Rarity.rank('SR') && c.rarity !== 'ITEM') s.pulledRarities.push(c.rarity);
    this.checkAchievements(); this.save();
    return { cards, fresh };
  }
  buyPack(set) { const p = Packs.rule(set).price; if (!this.spend(ME, p, 'packs')) return false; inc(this.s.packs, set); inc(this.s.stats.packsBought, set); this.save(); return true; }
  aiOpenPack(k, set, free = false) {
    const price = Packs.rule(set).price, P = this.s.ai[k];
    if (!free && !this.spend(k, price, 'packs')) return [];
    const pity = { v: P.pity[set] || 0 };
    const cards = Packs.open(set, pity, P.owned, this.rng);   // same function as the player
    P.pity[set] = pity.v; P.packsOpened++;
    const hasMarket = Object.keys(this.s.market).length > 0;
    for (const c of cards) { inc(P.owned, c.id); if (hasMarket) this.supply(c.id, 0.996); }
    return cards;
  }
  // market
  value(id) { const c = card(id); if (!c) return 0; if (!isMon(c)) return c.price ?? 100; return Math.max(1, swiftRound(Rarity.baseValue(c.rarity) * (this.s.market[id]?.factor ?? 1))); }
  buyPrice(id) { return this.value(id); }
  sellPrice(id) { const c = card(id); if (!c) return 0; if (!isMon(c)) return Math.max(5, Math.trunc((c.price ?? 60) / 3)); return Math.max(1, swiftRound(this.value(id) / 3)); }
  supply(id, k) { const e = this.s.market[id]; if (e) e.factor = Math.max(0.4, Math.min(2.5, e.factor * k)); }
  demand(id, k = 1.03) { this.supply(id, k); }
  marketTick() {
    const s = this.s; s.day++;
    for (const id of Object.keys(s.market).sort()) { const e = s.market[id]; e.factor += 0.08 * (1 - e.factor) + (this.rng.unit() - 0.5) * 0.04; e.factor = Math.max(0.4, Math.min(2.5, e.factor)); }
    // AI wish-lists add demand once per card per day (not once per AI), so the one Mythical everyone wants no longer pins at the cap
    const wantCount = {}; for (const p of s.ai) if (p.wants && p.wants[0]) inc(wantCount, p.wants[0]);
    for (const id of Object.keys(wantCount).sort()) this.demand(id, 1 + 0.004 * Math.min(3, wantCount[id]));
    for (const id of Object.keys(s.market)) { const e = s.market[id]; e.history.push(this.value(id)); if (e.history.length > 40) e.history.splice(0, e.history.length - 40); }
  }
  /** a real sale (auction / buy-now) pulls the market price toward what was actually paid */
  recordSale(id, price) {
    const e = this.s.market[id]; if (!e) return;
    const f = price / Rarity.baseValue(card(id).rarity);
    e.factor = Math.max(0.4, Math.min(2.5, e.factor * 0.6 + f * 0.4));
    e.sales = (e.sales || []).concat([[this.s.day, price]]).slice(-10);
  }
  change(id, n = 5) { const h = this.s.market[id]?.history; if (!h || h.length < 2) return 0; const old = h[Math.max(0, h.length - 1 - n)]; return old === 0 ? 0 : (h[h.length - 1] - old) / old; }
  get topCard() { let best = null; for (const id in this.s.market) if (best == null || this.value(id) > this.value(best)) best = id; return best; }
  // shop
  buySingle(id) { const p = this.buyPrice(id); if (!this.spend(ME, p, 'shop')) return false; inc(this.s.owned, id); this.s.singlesBought++; this.s.stats.cardsBought++; if (isMon(card(id))) this.demand(id, 1.04); this.checkAchievements(); this.save(); return true; }
  inDecks(id) { return Math.max(0, ...this.s.decks.map(d => d.filter(x => x === id).length)); }
  sell(id) {
    const n = this.s.owned[id] || 0; const c = card(id); if (!c) return false;
    if (!(n > Math.max(Rarity.keepCopies, this.inDecks(id)))) return false;
    this.s.owned[id] = n - 1; this.earn(ME, this.sellPrice(id), 'shop sales'); this.s.cardsSold++;
    if (isMon(c)) this.supply(id, 0.985);
    this.checkAchievements(); this.save(); return true;
  }
  sellableCount(id) { const c = card(id); if (!c) return 0; return Math.max(0, (this.s.owned[id] || 0) - Math.max(Rarity.keepCopies, this.inDecks(id))); }
  sellAllDupes() { let n = 0, total = 0; for (const id of Object.keys(this.s.owned).sort()) { if (!card(id)) continue; while (this.sellableCount(id) > 0) { const p = this.sellPrice(id); if (this.sell(id)) { n++; total += p; } else break; } } return [n, total]; }
  // decks
  get activeDeckCards() { return this.s.decks[this.s.activeDeck].map(card).filter(Boolean); }
  ownsDeck(d) { const c = {}; for (const id of d) inc(c, id); return Object.entries(c).every(([k, v]) => (this.s.owned[k] || 0) >= v); }
  get activeDeckValid() { const d = this.s.decks[this.s.activeDeck]; return DeckRules.problems(d).length === 0 && this.ownsDeck(d); }
  // league
  aiDeck(k) { if (DeckRules.problems(this.s.ai[k].deck).length || !this.aiOwnsDeck(k)) this.s.ai[k].deck = DeckRules.autoBuild(this.s.ai[k].owned, this.rng); return this.s.ai[k].deck.map(card); }
  aiOwnsDeck(k) { const c = {}, o = this.s.ai[k].owned; for (const id of this.s.ai[k].deck) inc(c, id); return Object.entries(c).every(([id, v]) => (o[id] || 0) >= v); }
  /** Ranked matchmaking: a random AI, weighted toward similar MR, never the previous opponent, recent ones (last 3) much less likely.
   *  The pick is stored so the League screen shows the same opponent until that match is played. */
  matchWeights() {
    const s = this.s, hist = s.oppHistory || [], last = hist[0];
    return s.ai.map((p, i) => { if (i === last) return 0; let w = Math.exp(-Math.abs(p.mr - s.mr) / 150); const r = hist.indexOf(i); if (r > 0 && r < 3) w *= 0.25; return w; });
  }
  nextLeagueOpponent() {
    const s = this.s;
    if (s.nextOpp != null && s.nextOpp >= 0 && s.nextOpp < s.ai.length && s.nextOpp !== (s.oppHistory || [])[0]) return s.nextOpp;
    const w = this.matchWeights(), tot = w.reduce((a, b) => a + b, 0); let r = this.rng.unit() * tot, k = 0;
    for (; k < w.length - 1; k++) { r -= w[k]; if (r < 0) break; }
    while (w[k] === 0) k = (k + 1) % w.length;
    s.nextOpp = k; return k;
  }
  /** won: true/false/null(draw). The AI opponent is paid exactly what the player would be paid in its place. */
  recordResult(won, league, k) {
    const s = this.s, st = s.stats.battles[league ? 'ranked' : 'friendly']; let bucks = 0, d = 0;
    if (won != null) {
      if (won) { s.wins++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); st.w++; } else { s.losses++; s.streak = 0; st.l++; }
      if (league) {
        d = elo(s.mr, s.ai[k].mr, won); s.mr = Math.max(0, s.mr + d); s.bestMr = Math.max(s.bestMr, s.mr); s.ai[k].mr -= d;
        if (won) { s.ai[k].losses++; s.leagueWins++; this.earn(k, 60, 'league'); } else { s.ai[k].wins++; this.earn(k, 300, 'league'); }
        bucks = won ? 300 + Math.max(0, s.streak - 1) * 25 : 60;
        s.oppHistory = [k].concat((s.oppHistory || []).filter(x => x !== k)).slice(0, 4); s.nextOpp = null;
        s.recent.unshift({ id: uuid(), a: 'You', b: s.ai[k].name, winner: won ? 'You' : s.ai[k].name, mrChange: d });
      } else bucks = won ? 150 : 30;
    } else { bucks = 40; st.d++; }
    this.earn(ME, bucks, league ? 'ranked battles' : 'friendly battles');
    this.checkAchievements(); this.save();     // league days now run on the real-time clock (see tickClock)
    return [bucks, d];
  }
  /** one league day: AI matches (stored so they can be replayed in Spectate), AI shopping, auctions, trades, market */
  worldStep(skip) {
    const s = this.s;
    const pool = s.ai.map((_, i) => i).filter(i => i !== skip);
    for (let i = pool.length - 1; i > 0; i--) { const j = this.rng.int(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    s.lastDay = [];
    while (pool.length >= 2) {
      const a = pool.pop(), b = pool.pop();
      // coin flip: the winner of the toss chooses, and (like the AI vs you) chooses to go first
      const da = this.aiDeck(a), db = this.aiDeck(b), seed = this.rng.next(), toss = this.rng.int(2), first = BattleAI.chooseFirst() ? toss : 1 - toss;
      const bt = new Battle(da, s.ai[a].name, db, s.ai[b].name, seed, first);
      const w = BattleAI.simulate(bt);
      s.lastDay.push({ a, b, deckA: da.map(c => c.id), deckB: db.map(c => c.id), seed: seed.toString(), first, winner: w, day: s.day + 1 });
      if (w != null) {
        const [win, lose] = w === 0 ? [a, b] : [b, a];
        const dd = elo(s.ai[win].mr, s.ai[lose].mr, true);
        s.ai[win].mr += dd; s.ai[lose].mr -= dd; s.ai[win].wins++; s.ai[lose].losses++;
        this.earn(win, 300, 'league'); this.earn(lose, 60, 'league');      // same purse as the player's ranked games
        s.recent.unshift({ id: uuid(), a: s.ai[a].name, b: s.ai[b].name, winner: s.ai[win].name, mrChange: dd });
      }
    }
    if (s.recent.length > 30) s.recent.length = 30;
    s.ai.forEach((P, k) => {
      // packs are bought only from the AI's own cash, keeping a reserve for the auction house
      while (P.money >= 1300) { const set = this.aiMissing(k, 'FL') > 0 && this.rng.chance(0.55) ? 'FL' : 'WW'; if (!this.aiOpenPack(k, set).length) break; }
      P.wants = this.aiWants(k);
      const w = P.wants[0];
      if (w && P.money > this.value(w) * 2 + 600 && this.rng.chance(0.3)) { if (this.spend(k, this.value(w), 'shop')) { inc(P.owned, w); this.demand(w, 1.05); P.wants = this.aiWants(k); } }
    });
    this.auctionDay();
    s.ai.forEach((P, k) => { P.deck = DeckRules.autoBuild(this.availableOwned(k), this.rng); });
    this.generateOffers();
    this.marketTick();
    this.settleAuctions();
  }
  /** real-time league days: one every DAY_MS of wall-clock time, caught up (capped) when the app reopens.
   *  Returns how many days are due; call advanceDays to process them (in chunks if you like). */
  daysDue(now = Date.now()) {
    const s = this.s; if (!s.clock) { s.clock = now; return 0; }
    if (now < s.clock) { s.clock = now; return 0; }      // clock went backwards: re-anchor, never lose days
    return Math.floor((now - s.clock) / DAY_MS);
  }
  /** processes up to n due days; days beyond MAX_CATCHUP are dropped (the clock still moves on) */
  advanceDays(n, now = Date.now()) {
    const s = this.s; const due = this.daysDue(now); n = Math.min(n, due); if (n <= 0) return 0;
    if (due > MAX_CATCHUP) { s.clock += (due - MAX_CATCHUP) * DAY_MS; n = Math.min(n, MAX_CATCHUP); }
    for (let i = 0; i < n; i++) this.worldStep(null);
    s.clock += n * DAY_MS; this.checkAchievements(); this.save();
    return n;
  }
  msToNextDay(now = Date.now()) { const c = this.s.clock || now; return Math.max(0, DAY_MS - ((now - c) % DAY_MS)); }
  /** advance a league day without the player battling (auctions tick, AIs play each other) */
  skipDay() { this.worldStep(null); this.checkAchievements(); this.save(); }
  availableOwned(k) { return this.s.ai[k].owned; }
  aiMissing(k, set) { return inSet(set).filter(c => !(this.s.ai[k].owned[c.id] > 0)).length; }
  aiWants(k) {
    const sc = c => BattleAI.monValue(c) + Rarity.rank(c.rarity) * 20;
    return DB.cards.filter(c => isMon(c) && !(this.s.ai[k].owned[c.id] > 0)).sort((a, b) => sc(b) - sc(a)).slice(0, 4).map(c => c.id);
  }

  // ---------- auction house ----------
  // A listing holds the card in escrow (taken out of the seller's collection). A bid takes the bidder's cash into escrow;
  // being outbid refunds it in full. At the end of the listing's last league day the card goes to the high bidder and the
  // escrowed cash goes to the seller. Nothing is created: it's a straight transfer between two players.
  static AUCTION_FEE = 0;
  canList(who, id) { if (who === ME) return this.sellableCount(id) > 0; return this.aiSpare(who, id) > 0; }
  list(who, id, kind, price, days) {
    price = Math.max(1, Math.round(price)); days = Math.max(1, Math.min(5, days | 0));
    if (!card(id) || !this.canList(who, id) || (kind !== 'auction' && kind !== 'fixed')) return null;
    const o = this.ownedOf(who); o[id]--;
    const l = { id: 'L' + (this.s.nextId++), seller: who, card: id, kind, price, endDay: this.s.day + days, high: null, bids: 0, listedDay: this.s.day };
    this.s.auctions.push(l);
    if (who === ME) { this.s.stats.listings++; this.s.decks = this.s.decks.map(d => this.fixDeck(d)); }
    this.save(); return l;
  }
  cancelListing(lid) {
    const l = this.s.auctions.find(x => x.id === lid); if (!l || l.seller !== ME || l.high) return false;
    inc(this.s.owned, l.card); this.s.auctions = this.s.auctions.filter(x => x !== l); this.save(); return true;
  }
  minBid(l) { return l.high ? l.high.amt + Math.max(5, Math.ceil(l.high.amt * 0.05)) : l.price; }
  bid(who, lid, amt) {
    const l = this.s.auctions.find(x => x.id === lid);
    if (!l || l.kind !== 'auction' || l.seller === who || amt < this.minBid(l)) return false;
    const prev = l.high;
    // a bidder who already leads only adds the difference
    const need = prev && prev.who === who ? amt - prev.amt : amt;
    if (this.cash(who) < need) return false;
    if (prev && prev.who !== who) this.move('escrow', prev.who, prev.amt, null);      // refund the outbid player
    this.move(who, 'escrow', need, null);
    l.high = { who, amt }; l.bids++;
    if (who === ME) this.s.stats.bids++;
    this.save(); return true;
  }
  buyNow(who, lid) {
    const l = this.s.auctions.find(x => x.id === lid);
    if (!l || l.kind !== 'fixed' || l.seller === who || this.cash(who) < l.price) return false;
    this.move(who, l.seller, l.price, who === ME ? 'auction buys' : 'auction sales');
    this.finishSale(l, who, l.price); this.save(); return true;
  }
  finishSale(l, buyer, price) {
    inc(this.ownedOf(buyer), l.card);
    this.s.auctions = this.s.auctions.filter(x => x !== l);
    this.recordSale(l.card, price);
    if (buyer === ME) { this.s.stats.auctionsWon++; inc(this.s.stats.spent, 'auction buys', l.kind === 'auction' ? price : 0); } else this.s.ai[buyer].auctionsWon++;
    if (l.seller === ME) { this.s.stats.auctionsSold++; this.s.cardsSold++; } else this.s.ai[l.seller].auctionsSold++;
    this.s.auctionLog.unshift({ day: this.s.day, card: l.card, seller: l.seller, buyer, price, kind: l.kind });
    if (this.s.auctionLog.length > 40) this.s.auctionLog.length = 40;
  }
  settleAuctions() {
    for (const l of this.s.auctions.slice()) {
      if (this.s.day < l.endDay) continue;
      if (l.kind === 'auction' && l.high) {
        const { who, amt } = l.high; l.high = null;                 // leave escrow…
        this.move('escrow', l.seller, amt, l.seller === ME ? 'auction sales' : null);   // …straight to the seller
        this.finishSale(l, who, amt);
      } else { inc(this.ownedOf(l.seller), l.card); this.s.auctions = this.s.auctions.filter(x => x !== l); }   // unsold: card goes back
    }
    this.checkAchievements();
  }
  /** copies an AI can part with: above its deck needs and copy limit */
  aiSpare(k, id) {
    const P = this.s.ai[k], c = card(id); if (!c) return 0;
    const inDeck = P.deck.filter(x => x === id).length;
    return Math.max(0, (P.owned[id] || 0) - Math.max(inDeck, Rarity.keepCopies));
  }
  /** what card `id` is worth to AI k (it never bids above this). Based on market value and need, with a small per-AI taste. */
  aiValuation(k, id) {
    const P = this.s.ai[k], c = card(id); if (!c) return 0;
    const n = P.owned[id] || 0, v = this.value(id), taste = 0.92 + 0.04 * (k % 4);
    let m;
    if (isMon(c)) m = P.wants.includes(id) ? 1.1 : n === 0 ? 0.85 : n < Rarity.copyLimit(c) ? 0.55 : 0;
    else m = n < Rarity.copyLimit(c) && (DeckRules.pref[id] ?? 0) >= 40 ? 0.8 : 0;
    return Math.floor(v * m * taste);
  }
  /** the most AI k will commit to one listing: limited by valuation, its spare cash (after a reserve) and a share of its wealth */
  aiBudget(k) { const P = this.s.ai[k]; return Math.max(0, Math.min(P.money - 200, Math.floor((P.money + this.committed(k)) * 0.6))); }
  auctionDay() {
    const s = this.s;
    // 1) AIs bid / buy. Two passes so AIs can outbid each other (and the player) within a day.
    for (let pass = 0; pass < 2; pass++) {
      const order = s.ai.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = this.rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
      for (const k of order) {
        let actions = 0;
        for (const l of s.auctions.slice()) {
          if (actions >= 2 || l.seller === k || !s.auctions.includes(l)) continue;
          if (!this.rng.chance(0.6)) continue;
          const worth = this.aiValuation(k, l.card); if (worth <= 0) continue;
          if (l.kind === 'fixed') { if (worth >= l.price && l.price <= this.aiBudget(k)) { this.buyNow(k, l.id); actions++; } continue; }
          if (l.high && l.high.who === k) continue;
          const leading = s.auctions.filter(x => x.high && x.high.who === k).length; if (leading >= 3) continue;
          const bidAmt = this.minBid(l);
          if (bidAmt <= worth && bidAmt <= this.aiBudget(k)) { this.bid(k, l.id, bidAmt); actions++; }
        }
      }
    }
    // 2) AIs list spare cards (at most 3 open listings each)
    s.ai.forEach((P, k) => {
      if (s.auctions.filter(l => l.seller === k).length >= 3 || !this.rng.chance(0.5)) return;
      const spare = Object.keys(P.owned).sort().filter(id => this.aiSpare(k, id) > 0 && this.value(id) >= 40);
      if (!spare.length) return;
      const id = spare[this.rng.int(spare.length)], v = this.value(id);
      if (this.rng.chance(0.65)) this.list(k, id, 'auction', Math.max(5, Math.round(v * 0.6)), 2 + this.rng.int(2));
      else this.list(k, id, 'fixed', Math.max(5, Math.round(v * 1.05)), 3);
    });
  }
  // trades
  generateOffers() {
    const s = this.s;
    s.offers = s.offers.filter(o => (s.owned[o.want] || 0) > 0 && (s.ai.find(p => p.id === o.aiId)?.owned[o.give] || 0) > 0);
    if (s.offers.length >= 4) return;
    const order = s.ai.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = this.rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    for (const k of order) {
      if (!this.rng.chance(0.3)) continue;
      if (s.offers.length >= 4) break;
      if (s.offers.some(o => o.aiId === s.ai[k].id)) continue;
      const theirs = s.ai[k].owned;
      const cands = Object.keys(s.owned).filter(id => s.owned[id] >= 2 && !(theirs[id] > 0) && isMon(card(id) || {}));
      if (!cands.length) continue;
      const want = cands.reduce((a, b) => this.value(b) > this.value(a) ? b : a);
      const v = this.value(want);
      const spares = Object.keys(theirs).filter(id => theirs[id] >= 2 && isMon(card(id) || {}));
      const lack = spares.filter(id => !(s.owned[id] > 0));
      const pool = lack.length ? lack : spares;
      if (!pool.length) continue;
      const give = pool.reduce((a, b) => Math.abs(this.value(b) - v) < Math.abs(this.value(a) - v) ? b : a);
      const gv = this.value(give);
      if (gv < v * 0.6 || gv > v * 1.5) continue;
      s.offers.push({ id: uuid(), aiId: s.ai[k].id, give, want, countered: false, note: `${s.ai[k].name} is building around ${card(want).name}.` });
      this.demand(want, 1.01);
    }
  }
  aiIndex(id) { const i = this.s.ai.findIndex(p => p.id === id); return i < 0 ? null : i; }
  acceptOffer(o) {
    const s = this.s, k = this.aiIndex(o.aiId);
    if (k == null || !(s.owned[o.want] > 0) || !(s.ai[k].owned[o.give] > 0)) { s.offers = s.offers.filter(x => x.id !== o.id); return false; }
    s.owned[o.want]--; inc(s.owned, o.give); s.ai[k].owned[o.give]--; inc(s.ai[k].owned, o.want);
    s.decks = s.decks.map(d => this.fixDeck(d));
    s.trades++; s.offers = s.offers.filter(x => x.id !== o.id);
    s.ai[k].deck = DeckRules.autoBuild(s.ai[k].owned, this.rng);
    this.checkAchievements(); this.save(); return true;
  }
  declineOffer(o) { this.s.offers = this.s.offers.filter(x => x.id !== o.id); this.save(); }
  counterOptions(o) {
    const k = this.aiIndex(o.aiId); if (k == null) return []; const P = this.s.ai[k];
    return Object.keys(P.owned).filter(id => P.owned[id] >= 2 || (P.owned[id] === 1 && !P.deck.includes(id))).filter(id => isMon(card(id) || {}) && id !== o.want).sort((a, b) => this.value(b) - this.value(a));
  }
  counter(o, ask) {
    const s = this.s, i = s.offers.findIndex(x => x.id === o.id), k = this.aiIndex(o.aiId); if (i < 0 || k == null) return false;
    const ok = (this.value(ask) <= this.value(o.want) * 1.2 && (s.ai[k].owned[ask] || 0) > 0 && !Rarity.isChase(card(ask).rarity)) || (this.value(ask) <= this.value(o.want) * 0.9);
    if (ok) { const n = Object.assign({}, o, { give: ask }); s.offers[i] = n; return this.acceptOffer(n); }
    s.offers[i].countered = true; s.offers[i].note = `${s.ai[k].name} turned down your counter.`; this.save(); return false;
  }
  fixDeck(d) { const c = {}; const out = []; for (const id of d) { inc(c, id); if (c[id] <= (this.s.owned[id] || 0)) out.push(id); } return out; }
  // achievements
  distinct(set) { return inSet(set).filter(c => this.s.owned[c.id] > 0).length; }
  achieved(id) {
    const s = this.s, opened = Object.values(s.packsOpened).reduce((a, b) => a + b, 0);
    switch (id) {
      case 'first_pack': return opened >= 1; case 'packs_10': return opened >= 10; case 'packs_50': return opened >= 50;
      case 'first_sr': return s.pulledRarities.includes('SR'); case 'first_ssr': return s.pulledRarities.includes('SSR');
      case 'first_lgd': return s.pulledRarities.includes('LGD'); case 'mythic': return s.pulledRarities.includes('MYT');
      case 'ww_half': return this.distinct('WW') >= 15; case 'ww_all': return this.distinct('WW') >= 30;
      case 'fl_half': return this.distinct('FL') >= 15; case 'fl_all': return this.distinct('FL') >= 30;
      case 'first_deck': { const st = STARTER_DECK.slice().sort().join(); return s.decks.some(d => DeckRules.problems(d).length === 0 && d.slice().sort().join() !== st); }
      case 'first_win': return s.wins >= 1; case 'wins_10': return s.wins >= 10; case 'streak_5': return s.bestStreak >= 5;
      case 'silver': return s.bestMr >= 1050; case 'gold': return s.bestMr >= 1150; case 'platinum': return s.bestMr >= 1250;
      case 'number_one': return s.leagueWins > 0 && s.ai.every(p => p.mr < s.mr);
      case 'first_trade': return s.trades >= 1; case 'sell_10': return s.cardsSold >= 10; case 'buy_single': return s.singlesBought >= 1;
    }
    return false;
  }
  checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (this.s.achievements.includes(a.id) || !this.achieved(a.id)) continue;
      this.s.achievements.push(a.id);
      for (const k in a.packs) inc(this.s.packs, k, a.packs[k]);
      this.earn(ME, a.money, 'achievements'); this.newAchievements.push(a);
    }
  }
  rewardText(a) {
    const p = Object.keys(a.packs).sort().reverse().map(k => `${a.packs[k]} free ${Packs.rule(k).name} pack${a.packs[k] > 1 ? 's' : ''}`);
    if (a.money > 0) p.push(`$${a.money}`); return p.join(' + ');
  }
  get leaderboard() {
    const r = this.s.ai.map((p, k) => ({ name: p.name, mr: p.mr, me: false, avatar: p.avatar, w: p.wins, l: p.losses, cash: p.money, escrow: this.committed(k), k }));
    r.push({ name: 'You', mr: this.s.mr, me: true, avatar: 'axerupi', w: this.s.wins, l: this.s.losses, cash: this.s.money, escrow: this.committed(ME), k: ME });
    return r.sort((a, b) => b.mr - a.mr);
  }
}
