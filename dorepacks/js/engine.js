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
export const SETS = ['WW', 'FL', 'T2'];
export const SET_NAMES = { WW: 'First Adventures', FL: 'Fallen Legends', T2: 'Troublesome 2', ST: 'Supplies' };
/** reprint-safe identity: every printing has its own card id (set_mon), the doremon itself is c.mon */
export const nameKey = c => c.mon || c.id;
/** spells/traps a set's packs can contain: the base supplies, plus (T2 only) the set's own new ones at 3x weight */
export const packSupplies = set => supplies().filter(c => !c.pack || c.pack === set);
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
  copyLimit: c => (c.rarity === 'LGD' || c.rarity === 'MYT') ? 1 : 2,   // max 2 of any doremon (counted by NAME across printings); Legendary/Mythical 1
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
  WW: { set: 'WW', name: 'First Adventures', price: 500, pity: 30, tiers: ['C', 'U', 'R', 'SR', 'SSR', 'ITEM'],
    slots: [[100,0,0,0,0,0],[100,0,0,0,0,0],[70,0,0,0,0,30],[0,0,0,0,0,100],[0,88,10,2,0,0],[0,65,30,5,0,0],[0,0,80,18.5,1.5,0]], chase: ['SSR'], pityOdds: [1] },
  FL: { set: 'FL', name: 'Fallen Legends', price: 800, pity: 40, tiers: ['C', 'U', 'R', 'SR', 'LGD', 'MYT', 'ITEM'],
    slots: [[100,0,0,0,0,0,0],[100,0,0,0,0,0,0],[70,0,0,0,0,0,30],[0,0,0,0,0,0,100],[0,88,10,2,0,0,0],[0,65,30,5,0,0,0],[0,0,78,18,3.5,0.5,0]], chase: ['LGD', 'MYT'], pityOdds: [3.5, 0.5] },
  /** spell/trap pick weight: inverse of shop price (Potion common, Guard Wall rare) */
  itemWeight: c => (c.pack ? 3 : 1) / (c.price || 100),
  itemOdds(set = 'WW') { const sup = packSupplies(set), tot = sup.reduce((a, c) => a + Packs.itemWeight(c), 0); return sup.map(c => [c, Packs.itemWeight(c) / tot]); },
  pickItem(rng, set = 'WW') { const sup = packSupplies(set), tot = sup.reduce((a, c) => a + Packs.itemWeight(c), 0); let r = rng.unit() * tot; for (const c of sup) { r -= Packs.itemWeight(c); if (r < 0) return c; } return sup[sup.length - 1]; },
  T2: { set: 'T2', name: 'Troublesome 2', price: 700, pity: 40, tiers: ['C', 'U', 'R', 'SR', 'LGD', 'MYT', 'ITEM'],
    slots: [[100,0,0,0,0,0,0],[100,0,0,0,0,0,0],[70,0,0,0,0,0,30],[0,0,0,0,0,0,100],[0,88,10,2,0,0,0],[0,65,30,5,0,0,0],[0,0,78,18,3.5,0.5,0]], chase: ['LGD', 'MYT'], pityOdds: [3.5, 0.5] },
  rule: s => s === 'FL' ? Packs.FL : s === 'T2' ? Packs.T2 : Packs.WW,
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
      if (r === 'ITEM') { out.push(Packs.pickItem(rng, set)); continue; }
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
    rows.push(['Each card', set !== 'WW' ? 'Each Legendary ~1.17% · Mythical 0.5% per pack (pity: Mythical 1 in 8)' : 'Each SSR starter 0.375% per pack']);
    const io = Packs.itemOdds(set); const ex = n => io.filter(x => x[0].id === n)[0][1];
    rows.push(['Spells/traps', `1.3 per pack on average. Which one is weighted by shop price: Potion ${(ex('st_potion') * 100).toFixed(1)}%, Super Potion ${(ex('st_super_potion') * 100).toFixed(1)}%, Guard Wall ${(ex('st_guard_wall') * 100).toFixed(1)}% of spell/trap pulls`]);
    if (set === 'T2') { const t2 = io.filter(x => x[0].pack === 'T2').reduce((a, x) => a + x[1], 0); rows.push(['New in T2', `The set's 7 new spells/traps (Mirror Veil, Twin Remedy, Duo Bloom, Twin War Cry, Twin Growl, Double Glare, Toxic Spray) are ${(t2 * 100).toFixed(1)}% of its spell/trap pulls (3x weight); they only come from Troublesome 2 packs or the shop`]); }
    rows.push(['Fairness', 'Every AI opens packs with this exact function and its own pity counter']);
    return rows;
  },
};

// ---------- battle ----------
export const STATUS = { none: ['', ''], psn: ['PSN', 'Poisoned'], brn: ['BRN', 'Burned'], par: ['PAR', 'Paralyzed'], slp: ['SLP', 'Asleep'], cnf: ['CNF', 'Confused'] };
let monUid = 0;
export const newMon = (c) => ({ uid: ++monUid, card: c, hp: c.hp, atk: 0, def: 0, status: 'none', statusTurns: 0, ready: false, attacked: false, protected: false });
/** what tapping your own doremon in slot i selects in the UI (web app.js calls exactly this): attacker beats take-back */
export const tapOwnMonSel = (b, s, i, sel) => { const m = b.sides[s].mons[i]; if (!m) return null;
  if (b.canPickAttacker(s, i)) return (sel?.kind === 'mon' || sel?.kind === 'mon2') && sel.i === i ? null : { kind: 'mon', i };
  if (b.canUndo(s, 'mon', i)) return sel?.kind === 'fresh' && sel.i === i ? null : { kind: 'fresh', i };
  return null; };
export const isDouble = c => c && c.split === 'double', isSpread = c => c && c.split === 'spread';
/** an enemy doremon an attack may target (Mirror Veil = protected until its owner's next turn) */
export const targetable = m => !!m && !m.protected;
export const canAttack = m => m.ready && !m.attacked && m.status !== 'par' && m.status !== 'slp';
const newSide = (name, deck) => ({ name, deck, hand: [], discard: [], mons: Array(6).fill(null), traps: Array(6).fill(null), life: Battle.startLife, monsPlayed: 0, stPlayed: 0, stalled: false, koCount: 0, freshTraps: [] });
export const monCount = s => s.mons.filter(Boolean).length;
const hasAnyMonLeft = s => monCount(s) > 0 || s.hand.some(isMon) || s.deck.some(isMon);
const clamp4 = v => Math.max(-4, Math.min(4, v));

// actions: {t:'playMon',hand,slot} {t:'spell',hand,target} {t:'setTrap',hand,slot} {t:'attack',from,to,to2} {t:'end'}
//          to2: optional 2nd target of a SPREAD move (must differ from to)
//          {t:'undo',kind:'mon'|'trap',slot}  take back a doremon/trap played this turn (nothing resolved from it yet)
export class Battle {
  /** going-second compensation (playtests: first player won 61-64% without it) */
  static SECOND = { extra: 0, quick: true };
  static startLife = 5; static handStart = 5; static handMax = 10; static turnCap = 80;
  constructor(deckA, nameA, deckB, nameB, seed, first = 0) {
    this.rng = new SplitMix(seed); this.splitKOs = [0, 0]; this.current = 0; this.turnNumber = 1; this.winner = null; this.over = false; this.events = [];
    const a = deckA.slice(), b = deckB.slice();
    Battle.shuffle(a, this.rng); Battle.shuffle(b, this.rng);
    this.sides = [newSide(nameA, a), newSide(nameB, b)];
    for (let s = 0; s < 2; s++) { Battle.mulligan(this.sides[s]); for (let i = 0; i < Battle.handStart; i++) this.draw(s, true); }
    this.current = first; this.first = first; this.acted = false; this.mulled = [false, false];
    // Nov 2: the player going second starts with 1 extra card and its first doremon can attack the turn it is played
    if (Battle.SECOND.extra) this.draw(1 - first, true); this.sides[1 - first].quickStart = Battle.SECOND.quick;
    this.events.push({ e: 'turn', side: first }); this.log(`${this.sides[first].name} goes first.`);
  }
  static shuffle(d, rng) { if (d.length < 2) return; for (let i = d.length - 1; i > 0; i--) { const j = rng.int(i + 1); [d[i], d[j]] = [d[j], d[i]]; } }
  static mulligan(s) {
    const n = Math.min(Battle.handStart, s.deck.length);
    if (n === 0 || s.deck.slice(0, n).some(isMon)) return;
    const j = s.deck.findIndex((c, i) => i >= n && isMon(c)); if (j >= 0) [s.deck[0], s.deck[j]] = [s.deck[j], s.deck[0]];
  }
  log(s) { this.events.push({ e: 'log', text: s }); }
  /** FREE MULLIGAN: once per battle, before anything has been played, a side may shuffle its whole opening hand back
   *  into its deck, reshuffle, and draw the same number of cards again (the "at least one doremon" rule still applies). */
  canMulligan(s) { return !this.over && !this.acted && !this.mulled[s]; }
  redraw(s) {
    if (!this.canMulligan(s)) return false;
    const S = this.sides[s], n = S.hand.length;
    S.deck.push(...S.hand); S.hand = []; Battle.shuffle(S.deck, this.rng);
    const keep = Battle.handStart; Battle.mulligan(S);
    for (let i = 0; i < n; i++) this.draw(s, true);
    this.mulled[s] = true; this.events.push({ e: 'mulligan', side: s }); this.log(`${S.name} shuffles their hand back and redraws ${n} cards.`);
    return true;
  }
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
  spellNeedsTarget(c) { return eff(c, 'heal') > 0 || effS(c, 'cure') != null || eff(c, 'atk') !== 0 || eff(c, 'def') !== 0 || eff(c, 'protect') > 0; }
  spellValid(c, s, target) {
    const st = this.sides[s];
    if (!this.spellNeedsTarget(c)) {
      if (eff(c, 'healAll') > 0 || eff(c, 'heal2') > 0) return st.mons.some(m => m && m.hp < m.card.hp);
      return monCount(st) > 0;
    }
    if (target == null || target < 0 || target >= 6) return false; const m = st.mons[target]; if (!m) return false;
    if (eff(c, 'heal') > 0) return m.hp < m.card.hp;
    if (eff(c, 'protect') > 0) return !m.protected;
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
        if (a.to != null) {
          if (!(a.to >= 0 && a.to < 6 && targetable(o.mons[a.to]))) return false;
          if (a.to2 == null) return true;
          return isSpread(m.card) && a.to2 !== a.to && a.to2 >= 0 && a.to2 < 6 && targetable(o.mons[a.to2]);
        }
        return monCount(o) === 0 && a.to2 == null;
      }
    }
    return false;
  }
  apply(a) {
    if (!this.isLegal(a)) return false;
    this.acted = true;
    const me = this.current, S = this.sides[me];
    switch (a.t) {
      case 'end': this.endTurn(); break;
      case 'undo': {
        const c = a.kind === 'mon' ? S.mons[a.slot].card : S.traps[a.slot];
        if (a.kind === 'mon') { if (S.mons[a.slot].quick) S.quickStart = true; S.mons[a.slot] = null; S.monsPlayed--; } else { S.traps[a.slot] = null; S.stPlayed--; S.freshTraps = S.freshTraps.filter(x => x !== a.slot); }
        S.hand.push(c); this.events.push({ e: 'undo', side: me, card: c, kind: a.kind, slot: a.slot });
        this.log(a.kind === 'mon' ? `${S.name} takes back ${c.name}.` : `${S.name} picks a set trap back up.`); break;
      }
      case 'playMon': { const c = S.hand.splice(a.hand, 1)[0]; S.mons[a.slot] = newMon(c); S.mons[a.slot].fresh = true; S.monsPlayed++;
        if (S.quickStart) { S.quickStart = false; S.mons[a.slot].ready = true; S.mons[a.slot].quick = true; this.log(`${c.name} gets a quick start and can attack right away!`); } this.events.push({ e: 'played', side: me, card: c }); this.log(`${S.name} plays ${c.name} (HP ${c.hp}).`); break; }
      case 'setTrap': { const c = S.hand.splice(a.hand, 1)[0]; S.traps[a.slot] = c; S.freshTraps.push(a.slot); S.stPlayed++; this.events.push({ e: 'set', side: me, slot: a.slot }); this.log(`${S.name} sets a trap face-down.`); break; }
      case 'spell': { const c = S.hand.splice(a.hand, 1)[0]; S.stPlayed++; this.events.push({ e: 'played', side: me, card: c }); this.castSpell(c, me, a.target); S.discard.push(c); break; }
      case 'attack': this.attack(a.from, a.to, a.to2); break;
    }
    this.checkBoardLoss();
    return true;
  }
  /** take-back rule: only on your own turn, only something placed THIS turn, and only while nothing has resolved from or onto it */
  /** the UI's "can I pick this doremon as an attacker?" decision (shared by web + Mac so it can't drift from the rules) */
  canPickAttacker(s, i) { const S = this.sides[s], m = S.mons[i]; return !this.over && this.current === s && !!m && canAttack(m) && !S.stalled; }
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
    if (eff(c, 'healAll') > 0 || eff(c, 'atkAll') !== 0 || eff(c, 'defAll') !== 0 || eff(c, 'heal2') > 0 || eff(c, 'atk2') !== 0) for (const m of S.mons) if (m) m.fresh = false;
    if (eff(c, 'protect') > 0 && t != null && S.mons[t]) { const m = S.mons[t]; m.protected = true; this.events.push({ e: 'stat', side: s, slot: t, text: 'PROTECTED' }); this.log(`${who} uses ${c.name}: ${m.card.name} can't be targeted until ${who}'s next turn.`); }
    if (eff(c, 'heal2') > 0) {
      const hurt = Battle.mostHurt(S, 2);
      for (const i of hurt) { const m = S.mons[i]; const amt = Math.min(eff(c, 'heal2'), m.card.hp - m.hp); m.hp += amt; this.events.push({ e: 'heal', side: s, slot: i, amount: amt }); }
      this.log(`${who} uses ${c.name}: ${hurt.map(i => S.mons[i].card.name).join(' and ')} heal.`);
    }
    if (eff(c, 'atk2') !== 0) {
      const top = Battle.strongest(S, 2, -1);
      for (const i of top) { const m = S.mons[i]; m.atk = clamp4(m.atk + eff(c, 'atk2')); this.events.push({ e: 'stat', side: s, slot: i, text: `ATK +${eff(c, 'atk2')}` }); }
      this.log(`${who} uses ${c.name}: ${top.map(i => S.mons[i].card.name).join(' and ')} get ATK +${eff(c, 'atk2')}.`);
    }
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
  /** slots of the n most damaged doremon (missing HP desc, then slot) */
  static mostHurt(S, n) { return S.mons.map((m, i) => [i, m]).filter(x => x[1] && x[1].hp < x[1].card.hp).sort((a, b) => (b[1].card.hp - b[1].hp) - (a[1].card.hp - a[1].hp) || a[0] - b[0]).slice(0, n).map(x => x[0]); }
  /** slots of the n strongest doremon (printed damage x hits, then HP, then slot), excluding slot `skip` */
  static strongest(S, n, skip) { const pw = c => c.dmg * (c.split ? 2 : 1); return S.mons.map((m, i) => [i, m]).filter(x => x[1] && x[0] !== skip).sort((a, b) => pw(b[1].card) - pw(a[1].card) || b[1].hp - a[1].hp || a[0] - b[0]).slice(0, n).map(x => x[0]); }
  /** a trap's effect on one attacking-side doremon */
  trapHit(trap, me, slot, k) {
    const m = this.sides[me].mons[slot]; if (!m) return;
    const da = eff(trap, 'atk') + eff(trap, 'atk2'), dd = eff(trap, 'def') + eff(trap, 'def2');
    if (k > 0 && !eff(trap, 'atk2') && !eff(trap, 'def2') && !effS(trap, 'status2')) return;
    if (da !== 0 || dd !== 0) {
      m.atk = clamp4(m.atk + da); m.def = clamp4(m.def + dd);
      const txt = da !== 0 ? `ATK ${da}` : `DEF ${dd}`;
      this.events.push({ e: 'stat', side: me, slot, text: txt }); this.log(`${m.card.name} gets ${txt}.`);
    }
    const st = effS(trap, 'status') || effS(trap, 'status2');
    if (st && STATUS[st] && m.status === 'none') { m.status = st; m.statusTurns = 0; this.events.push({ e: 'status', side: me, slot, status: st }); this.log(`${m.card.name} is ${STATUS[st][1].toLowerCase()}!`); }
  }
  attack(f, t, t2 = null) {
    const me = this.current, o = this.opp; const a = this.sides[me].mons[f]; if (!a) return;
    a.attacked = true;
    this.events.push({ e: 'attack', side: me, from: f, to: t, to2: t2 });
    const O = this.sides[o];
    const ti = O.traps.findIndex(Boolean);
    if (ti >= 0) {
      const trap = O.traps[ti]; O.traps[ti] = null; O.discard.push(trap);
      this.events.push({ e: 'trap', side: o, card: trap }); this.log(`TRAP! ${O.name} reveals ${trap.name}!`);
      if (eff(trap, 'stall') > 0) { this.sides[me].stalled = true; this.log(`${a.card.name}'s attack is blocked and ${this.sides[me].name} is stalled for the rest of the turn.`); return; }
      if (eff(trap, 'block') > 0) { this.log(`${a.card.name}'s attack is blocked!`); this.hurt(me, f, eff(trap, 'recoil'), 1, 'is pricked by thorns'); return; }
      this.trapHit(trap, me, f, 0);
      // multi-target traps (Twin Growl / Double Glare / Toxic Spray): also the attacker's strongest teammate
      if (eff(trap, 'atk2') || eff(trap, 'def2') || effS(trap, 'status2')) for (const j of Battle.strongest(this.sides[me], 1, f)) this.trapHit(trap, me, j, 1);
      if (a.status === 'par' || a.status === 'slp') { this.log(`${a.card.name} can't attack!`); return; }
    }
    if (a.status === 'cnf' && this.rng.chance(0.5)) { this.log(`${a.card.name} is confused and hurts itself!`); this.hurt(me, f, 30, 1, 'hits itself'); return; }
    if (t == null) { this.events.push({ e: 'direct', side: o }); this.log(`${a.card.name} attacks ${O.name} directly! (-1 life)`); this.loseLife(o); return; }
    const hit = (slot, tag) => {
      const d = O.mons[slot]; if (!d) return false;
      const [dmg, ef] = Battle.damage(a, d);
      const note = ef === 0 ? ' It has no effect...' : ef > 1 ? " It's super effective!" : ef < 1 ? " It's not very effective." : '';
      this.log(`${a.card.name} uses ${a.card.move} (${a.card.moveType})${tag} on ${d.card.name} (${d.card.types.join('/')}) for ${dmg}.${note}`);
      this.hurt(o, slot, dmg, ef, null);
      // move side effect (Nov 2 balance): e.g. Sludge Bomb may poison. One roll per hit that lands on a survivor with no status.
      const t2 = O.mons[slot];
      if (a.card.fx && dmg > 0 && t2 && t2.status === 'none' && STATUS[a.card.fx] && this.rng.chance((a.card.fxChance || 0) / 100)) {
        t2.status = a.card.fx; t2.statusTurns = 0; this.events.push({ e: 'status', side: o, slot, status: a.card.fx }); this.log(`${t2.card.name} is ${STATUS[a.card.fx][1].toLowerCase()}!`);
      }
      return true;
    };
    const ko0 = this.sides[me].koCount;
    const done = () => { if (this.sides[me].koCount - ko0 >= 2) { this.splitKOs[me]++; this.events.push({ e: 'splitKO', side: me }); } };
    if (isDouble(a.card)) {          // DOUBLE HIT: two hits on one target; if the first knocks it out, the second has nothing to hit
      hit(t, ' (hit 1)');
      if (this.over) return;
      if (O.mons[t]) hit(t, ' (hit 2)'); else this.log(`The second hit has no target.`);
      return;
    }
    if (isSpread(a.card) && t2 != null) { hit(t, ' (split)'); if (!this.over) hit(t2, ' (split)'); done(); return; }
    hit(t, '');
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
      if (m.protected) { m.protected = false; this.events.push({ e: 'stat', side: n, slot: i, text: 'UNPROTECTED' }); }
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
  /** printed damage per attack, counting both hits of a split move */
  effDmg: c => c.split === 'double' ? c.dmg * 1.7 : c.split === 'spread' ? c.dmg * 1.6 : c.dmg,
  monValue: c => c.hp + BattleAI.effDmg(c) * 1.6 + Rarity.rank(c.rarity) * 8 + (c.fx ? 10 : 0),
  /** AI mulligan rule: redraw a hand with fewer than 2 doremon, or one with no spell/trap at all */
  openingMulligans(b, sides = [0, 1]) { for (const s of sides) if (b.canMulligan(s) && BattleAI.wantsMulligan(b, s)) b.redraw(s); },
  wantsMulligan(b, s) { const h = b.sides[s].hand, m = h.filter(isMon).length; return m < 2 || m === h.length; },
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
        if (eff(c, 'heal2') > 0) { const miss = Battle.mostHurt(s, 2).map(t => Math.min(eff(c, 'heal2'), s.mons[t].card.hp - s.mons[t].hp)).reduce((x, y) => x + y, 0); consider({ t: 'spell', hand: i, target: null }, miss * 0.55 - (eff(c, 'heal2') > 60 ? 30 : 12)); }
        if (eff(c, 'atk2') > 0 && monCount(os) > 0) consider({ t: 'spell', hand: i, target: null }, Math.min(2, monCount(s)) * 16 - 8);
        if (eff(c, 'protect') > 0 && monCount(os) > 0) s.mons.forEach((m, t) => { if (m && !m.protected) consider({ t: 'spell', hand: i, target: t }, MV(m.card) * 0.12 * (m.hp < m.card.hp * 0.6 ? 1.6 : 0.7) - 10); });
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
        const hits = isDouble(a.card) ? 2 : 1;
        const score = (d, skip) => { const [dmg] = Battle.damage(a, d); const tot = dmg * hits; if (dmg === 0) return -1;
          return tot >= d.hp ? 1000 + MV(d.card) - (tot - d.hp) * 0.1 : tot + MV(d.card) * 0.15 + (d.card.hp - d.hp) * 0.2; };
        let best = null;
        os.mons.forEach((d, t) => { if (!targetable(d)) return; const v = score(d); if (!best || v > best[1]) best = [t, v]; });
        if (best && best[1] > 0) {
          if (isSpread(a.card)) {   // spread: add the best second target
            let b2 = null; os.mons.forEach((d, t) => { if (t === best[0] || !targetable(d)) return; const v = score(d); if (v > 0 && (!b2 || v > b2[1])) b2 = [t, v]; });
            if (b2) return { t: 'attack', from: i, to: best[0], to2: b2[0] };
          }
          return { t: 'attack', from: i, to: best[0] };
        }
      }
    }
    return { t: 'end' };
  },
  /** coin-flip winner's choice. Playtests show the first player wins ~60% of decided games, so the sensible pick is to go first. */
  chooseFirst() { return true; },
  simulate(b, maxActions = 4000) {
    let n = 0;
    BattleAI.openingMulligans(b);
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
    // copy limit counts by doremon NAME across printings (like real TCGs): 2 total, 1 if any printing in the deck is Legendary/Mythical
    const cnt = {}, lim = {}, nm = {}; for (const c of cards) { const k = nameKey(c); cnt[k] = (cnt[k] || 0) + 1; lim[k] = Math.min(lim[k] ?? 9, Rarity.copyLimit(c)); nm[k] = c.name; }
    for (const k in cnt) if (cnt[k] > lim[k]) p.push(`Too many ${nm[k]} (max ${lim[k]}${DB.cards.filter(c => nameKey(c) === k).length > 1 ? ', all printings together' : ''}).`);
    return p;
  },
  pref: { st_super_potion: 60, st_guard_wall: 58, st_static_web: 57, st_power_up: 56, st_doze_spores: 55, st_menace: 50, st_cheer_on: 48, st_iron_guard: 47, st_potion: 46, st_bramble_shield: 45, st_full_heal: 44, st_shield_pal: 42, st_wisp_scorch: 40, st_soothing_song: 38, st_metal_screech: 36, st_venom_dust: 34, st_bewilder_beam: 33, st_brace_up: 30, st_mirror_veil: 50, st_duo_bloom: 54, st_twin_remedy: 43, st_twin_war_cry: 46, st_twin_growl: 47, st_double_glare: 39, st_toxic_spray: 49, st_cute_growl: 28, st_glare_down: 26, st_paralyze_heal: 22, st_awakening: 20, st_antidote: 18, st_burn_heal: 18 },
  /** Deck building for every AI (and the "auto-build" button). pers = a trainer personality {fav:[types], style}:
   *  favourite types score higher, and each extra doremon attacking with the SAME type as ones already picked scores lower,
   *  so decks spread over several types instead of every trainer running the same top-8 cards. */
  STYLE: {
    aggro: { st_power_up: 25, st_cheer_on: 25, st_twin_war_cry: 25, st_menace: -10, st_super_potion: -15, st_metal_screech: 15, st_double_glare: 15 },
    control: { st_guard_wall: 10, st_static_web: 10, st_doze_spores: 15, st_bramble_shield: 20, st_venom_dust: 20, st_wisp_scorch: 20, st_bewilder_beam: 20, st_twin_growl: 20, st_toxic_spray: 15, st_power_up: -15, st_super_potion: -10 },
    sustain: { st_super_potion: 5, st_soothing_song: 30, st_twin_remedy: 30, st_duo_bloom: 20, st_iron_guard: 20, st_shield_pal: 25, st_mirror_veil: 15, st_brace_up: 15, st_power_up: -15 },
    balanced: {},
  },
  autoBuild(owned, rng, pers = null) {
    const fav = (pers && pers.fav) || [], style = DeckRules.STYLE[(pers && pers.style) || 'balanced'] || {};
    const mons = [];
    for (const id of Object.keys(owned).sort()) { const n = owned[id]; if (!(n > 0)) continue; const c = card(id); if (c && isMon(c)) for (let k = 0; k < Math.min(n, Rarity.copyLimit(c)); k++) {
      let v = BattleAI.monValue(c) - k * 6 + rng.unit() * (pers ? 14 : 4);
      if (fav.length && (fav.includes(c.moveType) || c.types.some(t => fav.includes(t)))) v += 40;
      mons.push([c, v]); } }
    mons.sort((a, b) => b[1] - a[1]);
    const sup = [];
    for (const id of Object.keys(owned).sort()) { const n = owned[id]; if (!(n > 0)) continue; const c = card(id); if (c && !isMon(c)) for (let k = 0; k < Math.min(n, Rarity.copyLimit(c)); k++) sup.push([c, (DeckRules.pref[id] ?? 20) + (style[id] || 0) - k * 12 + rng.unit() * (pers ? 10 : 3)]); }
    sup.sort((a, b) => b[1] - a[1]);
    const nSup = Math.min(7, sup.length);
    let deck = sup.slice(0, nSup).map(x => x[0].id);
    const used = {}, lim = {}, byType = {};   // name-based limit across printings
    const pool = mons.slice();
    while (deck.length < 20 && pool.length) {
      // greedy with a variety penalty: -14 per doremon already picked that attacks with the same type (only when a personality is set)
      let bi = -1, bv = -Infinity;
      for (let i = 0; i < pool.length; i++) { const [c, v] = pool[i]; const k = nameKey(c); const L = Math.min(lim[k] ?? 9, Rarity.copyLimit(c)); if ((used[k] || 0) >= L) continue;
        const sc = v - (pers ? 14 * (byType[c.moveType] || 0) : 0); if (sc > bv) { bv = sc; bi = i; } }
      if (bi < 0) break;
      const [c] = pool.splice(bi, 1)[0]; const k = nameKey(c); used[k] = (used[k] || 0) + 1; lim[k] = Math.min(lim[k] ?? 9, Rarity.copyLimit(c)); byType[c.moveType] = (byType[c.moveType] || 0) + 1; deck.push(c.id);
    }
    if (deck.length < 20) deck = deck.concat(sup.slice(nSup, nSup + Math.min(20 - deck.length, 10 - nSup)).map(x => x[0].id));
    return deck;
  },
};

// ---------- game: save, economy, market, league, trades, achievements ----------
/** 16 league trainers: [name, avatar, favourite types, deck style]. The first 8 are the originals (save order kept). */
export const AI_NAMES = [['Kai', 'zebrolt', ['Electric', 'Psychic'], 'aggro'], ['Mira', 'pinkit', ['Fairy', 'Normal'], 'sustain'], ['Rook', 'rokbru', ['Rock', 'Ground'], 'control'],
  ['Juno', 'pearlgill', ['Water', 'Fairy'], 'sustain'], ['Ezra', 'wispeacock', ['Ghost', 'Dark'], 'control'], ['Lumi', 'solpuff', ['Fairy', 'Psychic'], 'balanced'],
  ['Dax', 'magmaberry', ['Fire', 'Rock'], 'aggro'], ['Nova', 'verdaconda', ['Dragon', 'Grass'], 'balanced'],
  ['Lacey', 'limantis', ['Fairy', 'Bug'], 'sustain'], ['Prof. Winston', 'egmil', ['Psychic', 'Steel'], 'control'], ['Bram', 'boulderbear', ['Ground', 'Fighting'], 'aggro'],
  ['Sable', 'nightpurr', ['Dark', 'Flying'], 'aggro'], ['Pip', 'teddimple', ['Bug', 'Grass'], 'balanced'], ['Coral', 'octoflit', ['Water', 'Flying'], 'balanced'],
  ['Rex', 'galefang', ['Dragon', 'Ice'], 'aggro'], ['Ivy', 'acornix', ['Grass', 'Poison'], 'control']];
export const persOf = k => ({ fav: AI_NAMES[k][2], style: AI_NAMES[k][3] });
export const N_AI = AI_NAMES.length;
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
  ['mythic', 'Myth Made Real', 'Pull the Mythical', { FL: 2 }, 0], ['ww_half', 'Half a Breeze', 'Collect 15 First Adventures cards', { WW: 1 }, 0],
  ['ww_all', 'Whirlwind Master', 'Complete First Adventures (30/30)', { FL: 2 }, 0], ['fl_half', 'Legend Hunter', 'Collect 15 Fallen Legends cards', { FL: 1 }, 0],
  ['fl_all', 'Keeper of Legends', 'Complete Fallen Legends (30/30)', { FL: 3 }, 0], ['first_deck', 'Deck Builder', 'Build your own legal 20-card deck', { WW: 1 }, 0],
  ['first_win', 'First Victory', 'Win a mat battle', { WW: 1 }, 0], ['wins_10', 'Mat Veteran', 'Win 10 battles', { FL: 1 }, 0],
  ['streak_5', 'On Fire', 'Win 5 battles in a row', { FL: 1 }, 0], ['silver', 'Silver League', 'Reach 1050 MR', { WW: 1 }, 0],
  ['gold', 'Gold League', 'Reach 1150 MR', { FL: 1 }, 500], ['platinum', 'Platinum League', 'Reach 1250 MR', { FL: 2 }, 0],
  ['number_one', 'Top of the Ladder', 'Be #1 on the league leaderboard', { FL: 2 }, 1000], ['first_trade', 'Fair Trade', 'Complete a trade', { WW: 1 }, 0],
  ['t2_half', 'Split Decision', 'Collect 15 Troublesome 2 cards', { T2: 1 }, 0], ['t2_all', 'Double Trouble', 'Complete Troublesome 2 (30/30)', { T2: 3 }, 0],
  ['t2_chase', 'Twice the Trouble', 'Pull a Troublesome 2 Legendary or Mythical', { T2: 1 }, 0], ['t2_split', 'Split Second', 'Knock out 2 doremon with one split attack', { T2: 1 }, 300],
  ['sell_10', 'Card Shark', 'Sell 10 cards', {}, 200], ['buy_single', 'Window Shopper', 'Buy a single card', { WW: 1 }, 0],
].map(([id, title, desc, packs, money]) => ({ id, title, desc, packs, money }));

export const TIERS = [['Bronze', 0], ['Silver', 1050], ['Gold', 1150], ['Platinum', 1250], ['Diamond', 1400], ['Master', 1550]];
export const tier = mr => mr < 1050 ? 'Bronze' : mr < 1150 ? 'Silver' : mr < 1250 ? 'Gold' : mr < 1400 ? 'Platinum' : mr < 1550 ? 'Diamond' : 'Master';
export const elo = (a, b, aWon) => swiftRound(32 * ((aWon ? 1 : 0) - 1 / (1 + Math.pow(10, (b - a) / 400))));
/** Nov 2 MR rules, the same for the player and every AI (each side is computed on its own, so it is not zero-sum):
 *  win  = Elo K=32 but at least +15, plus a streak bonus of +2 per win in a row after the first (max +8);
 *  loss = Elo K=32, softened to 60% when the winner was rated BELOW you (an upset costs less), never more than -24.
 *  streakAfter = the winner's streak INCLUDING this win.
 *  Because wins have a floor and upsets are softened, MR would inflate forever; so at the end of every league day
 *  everyone (player and AI alike) gives back 2% of whatever they hold above 1000 ("rust"). */
export const MR = { minWin: 15, streakStep: 2, streakMax: 8, upsetSoft: 0.6, maxLoss: 24, rust: 0.02 };
export const rust = mr => mr > 1000 ? mr - swiftRound((mr - 1000) * MR.rust) : mr;
export function mrDelta(me, opp, won, streakAfter = 0) {
  if (won) return Math.max(MR.minWin, elo(me, opp, true)) + Math.min(MR.streakMax, Math.max(0, streakAfter - 1) * MR.streakStep);
  let d = elo(me, opp, false); if (opp < me) d = swiftRound(d * MR.upsetSoft); return Math.max(-MR.maxLoss, d);
}

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
    if (loaded && loaded.ai && loaded.ai.length >= 8 && loaded.ai.length <= N_AI) {
      this.s = Object.assign(freshSave(), loaded);
      this.s.stats = Object.assign(freshStats(), this.s.stats || {});
      for (const P of this.s.ai) { P.earned ??= 0; P.spent ??= 0; P.auctionsWon ??= 0; P.auctionsSold ??= 0; }
      for (const c of DB.cards) if (isMon(c) && !this.s.market[c.id]) this.s.market[c.id] = { factor: 1, history: [Rarity.baseValue(c.rarity)] };   // new sets (T2) in old saves
      if (!loaded.bank) this.s.bank = { initial: this.totalCash(), faucet: 0, sink: 0 };   // migrate v1 saves: start the ledger now
      this.rng = new SplitMix(BigInt.asUintN(64, BigInt(this.s.seed || '1') + BigInt(Math.floor(Date.now() / 1000))));
      this.migrateTrainers();
    } else { this.s = freshSave(); this.rng = new SplitMix(seed ?? randomSeed()); this.newGame(); }
  }
  newGame() {
    const s = this.s = freshSave();
    for (const id of STARTER_DECK) inc(s.owned, id);
    s.decks[0] = STARTER_DECK.slice(); s.deckNames[0] = 'Starter Deck';
    for (const c of DB.cards) if (isMon(c)) s.market[c.id] = { factor: 1, history: [Rarity.baseValue(c.rarity)] };
    // Fair start: every AI begins exactly like the player — same starter deck, MR, Dorebucks and starting packs,
    // opened with the same pack function. After that they build/rebuild only from their own collections.
    AI_NAMES.forEach((_, k) => this.addTrainer(k));
    s.seed = this.rng.next().toString();
    s.bank = { initial: this.totalCash(), faucet: 0, sink: 0 };
    this.save();
  }
  /** a brand-new trainer with exactly the player's starting kit: starter deck, 1000 MR, $1500, the starting packs (opened free) */
  addTrainer(k) {
    const s = this.s, [n, av] = AI_NAMES[k], f = freshSave();
    const p = { id: `ai${k}`, name: n, avatar: av, mr: f.mr, money: f.money, owned: {}, deck: [], pity: {}, wins: 0, losses: 0, packsOpened: 0, wants: [], earned: 0, spent: 0, auctionsWon: 0, auctionsSold: 0, streak: 0, games: 0, played: {}, tourWins: 0 };
    for (const id of STARTER_DECK) inc(p.owned, id);
    s.ai[k] = p;
    for (const set of SETS) for (let i = 0; i < (f.packs[set] || 0); i++) this.aiOpenPack(k, set, true);
    p.deck = DeckRules.autoBuild(p.owned, this.rng, persOf(k));
    return p;
  }
  /** saves from the 8-trainer league get the 8 new trainers (fair start). Their starting cash is added to the
   *  ledger's initial balance, so conservation still holds. Existing trainers keep everything. */
  migrateTrainers() {
    const s = this.s;
    for (const P of s.ai) { P.streak ??= 0; P.games ??= (P.wins || 0) + (P.losses || 0); P.played ??= {}; P.tourWins ??= 0; }
    s.stats.played ??= {}; s.stats.tourWins ??= 0; s.stats.drafts ??= 0;
    for (let k = s.ai.length; k < N_AI; k++) { const P = this.addTrainer(k); s.bank.initial += P.money; }
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
    inc(s.packsOpened, set); this.quest('open');
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
  buySingle(id) { const p = this.buyPrice(id); if (!this.spend(ME, p, 'shop')) return false; inc(this.s.owned, id); this.s.singlesBought++; this.quest('buy'); this.s.stats.cardsBought++; if (isMon(card(id))) this.demand(id, 1.04); this.checkAchievements(); this.save(); return true; }
  inDecks(id) { return Math.max(0, ...this.s.decks.map(d => d.filter(x => x === id).length)); }
  sell(id) {
    const n = this.s.owned[id] || 0; const c = card(id); if (!c) return false;
    if (!(n > Math.max(Rarity.keepCopies, this.inDecks(id)))) return false;
    this.s.owned[id] = n - 1; this.earn(ME, this.sellPrice(id), 'shop sales'); this.s.cardsSold++; this.quest('sell');
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
  aiDeck(k) { if (DeckRules.problems(this.s.ai[k].deck).length || !this.aiOwnsDeck(k)) this.s.ai[k].deck = DeckRules.autoBuild(this.s.ai[k].owned, this.rng, persOf(k)); return this.s.ai[k].deck.map(card); }
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
  recordResult(won, league, k, splitKOs = 0, played = []) {
    const s = this.s; s.stats.played ??= {}; for (const id of played) inc(s.stats.played, id);
    if (league && k != null && s.ai[k]) { const P = s.ai[k]; P.games = (P.games || 0) + 1; }
    if (league) this.quest('play'); if (won && league) this.quest('win'); if (won && !league) this.quest('friendly'); if (splitKOs) this.quest('splitko', splitKOs); s.splitKOs = (s.splitKOs || 0) + splitKOs; const st = s.stats.battles[league ? 'ranked' : 'friendly']; let bucks = 0, d = 0;
    if (won != null) {
      if (won) { s.wins++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); st.w++; } else { s.losses++; s.streak = 0; st.l++; }
      if (league) {
        const P = s.ai[k], before = [s.mr, P.mr];
        if (won) { P.streak = 0; } else { P.streak = (P.streak || 0) + 1; }
        d = mrDelta(before[0], before[1], won, s.streak); s.mr = Math.max(0, s.mr + d); s.bestMr = Math.max(s.bestMr, s.mr);
        P.mr = Math.max(0, P.mr + mrDelta(before[1], before[0], !won, P.streak));
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
    if (s.tour && !s.tour.done) this.finishTour(true);      // the day is over: unplayed player matches are forfeited
    const pool = s.ai.map((_, i) => i).filter(i => i !== skip);
    for (let i = pool.length - 1; i > 0; i--) { const j = this.rng.int(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    s.lastDay = [];
    while (pool.length >= 2) {
      const a = pool.pop(), b = pool.pop();
      // coin flip: the winner of the toss chooses, and (like the AI vs you) chooses to go first
      const rec = this.aiMatch(a, b);
      const bt = new Battle(rec.deckA.map(card), s.ai[a].name, rec.deckB.map(card), s.ai[b].name, BigInt(rec.seed), rec.first);
      const w = BattleAI.simulate(bt);
      rec.winner = w; rec.day = s.day + 1; s.lastDay.push(rec);
      this.recordAIMatch(rec, w, bt);
    }
    if (s.recent.length > 30) s.recent.length = 30;
    s.ai.forEach((P, k) => {
      // packs are bought only from the AI's own cash, keeping a reserve for the auction house
      while (P.money >= 1300) { const set = this.aiMissing(k, 'FL') > 0 && this.rng.chance(0.55) ? 'FL' : this.aiMissing(k, 'T2') > 0 && this.rng.chance(0.5) ? 'T2' : 'WW'; if (!this.aiOpenPack(k, set).length) break; }
      P.wants = this.aiWants(k);
      const w = P.wants[0];
      if (w && P.money > this.value(w) * 2 + 600 && this.rng.chance(0.3)) { if (this.spend(k, this.value(w), 'shop')) { inc(P.owned, w); this.demand(w, 1.05); P.wants = this.aiWants(k); } }
    });
    this.auctionDay();
    s.ai.forEach((P, k) => { P.deck = DeckRules.autoBuild(this.availableOwned(k), this.rng, persOf(k)); });
    this.generateOffers();
    s.mr = rust(s.mr); for (const P of s.ai) P.mr = rust(P.mr);
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
  /** a ready-to-play AI-vs-AI pairing (decks, seed, coin toss) */
  aiMatch(a, b) {
    const da = this.aiDeck(a), db = this.aiDeck(b), seed = this.rng.next(), toss = this.rng.int(2), first = BattleAI.chooseFirst() ? toss : 1 - toss;
    return { a, b, deckA: da.map(c => c.id), deckB: db.map(c => c.id), seed: seed.toString(), first };
  }
  /** counts the cards each side played, for trainer stats */
  static playedIds(bt, side) { return bt.events.filter(e => e.e === 'played' && e.side === side).map(e => e.card.id); }
  /** applies an AI-vs-AI ranked result: MR (same rules as the player), W/L, streaks, purse, card-play stats */
  recordAIMatch(rec, w, bt = null) {
    const s = this.s, A = s.ai[rec.a], B = s.ai[rec.b];
    A.games = (A.games || 0) + 1; B.games = (B.games || 0) + 1;
    if (bt) { A.played ??= {}; B.played ??= {}; for (const id of Game.playedIds(bt, 0)) inc(A.played, id); for (const id of Game.playedIds(bt, 1)) inc(B.played, id); }
    if (w == null) return 0;
    const [win, lose] = w === 0 ? [rec.a, rec.b] : [rec.b, rec.a], W = s.ai[win], L = s.ai[lose];
    W.streak = (W.streak || 0) + 1; L.streak = 0;
    const dw = mrDelta(W.mr, L.mr, true, W.streak), dl = mrDelta(L.mr, W.mr, false, 0);
    W.mr += dw; L.mr = Math.max(0, L.mr + dl); W.wins++; L.losses++;
    this.earn(win, 300, 'league'); this.earn(lose, 60, 'league');      // same purse as the player's ranked games
    s.recent.unshift({ id: uuid(), a: A.name, b: B.name, winner: W.name, mrChange: dw, mrLoss: dl });
    if (s.recent.length > 30) s.recent.length = 30;
    return dw;
  }

  // ---------- Spectate: every "next match" is a fresh random pairing that really counts ----------
  nextSpectate() {
    const s = this.s, n = s.ai.length, last = s.specLast || [];
    let a, b, tries = 0;
    do { a = this.rng.int(n); b = this.rng.int(n - 1); if (b >= a) b++; tries++; }
    while (tries < 50 && last.length === 2 && (last.includes(a) && last.includes(b) || last.includes(a) || last.includes(b)));
    s.specLast = [a, b];
    const rec = this.aiMatch(a, b); rec.day = s.day; rec.live = true;
    return rec;
  }
  /** call when a spectated live match ends; records it like a league match */
  finishSpectate(rec, w, bt = null) {
    if (rec.counted) return 0; rec.counted = true;
    const d = this.recordAIMatch(rec, w, bt); this.quest('watch'); this.save(); return d;
  }

  // ---------- trainer stats ("Verified" card) ----------
  trainerStats(who) {
    const s = this.s, P = who === ME ? null : s.ai[who];
    const owned = who === ME ? s.owned : P.owned, played = (who === ME ? s.stats.played : P.played) || {};
    let most = null; for (const id of Object.keys(played).sort()) if (card(id) && (most == null || played[id] > played[most])) most = id;
    const w = who === ME ? s.wins : P.wins, l = who === ME ? s.losses : P.losses;
    return { name: who === ME ? 'You' : P.name, avatar: who === ME ? 'axerupi' : P.avatar, money: this.cash(who), mr: who === ME ? s.mr : P.mr, tier: tier(who === ME ? s.mr : P.mr),
      binder: DB.cards.filter(c => owned[c.id] > 0).length, binderTotal: DB.cards.length, copies: Object.values(owned).reduce((a, b) => a + b, 0),
      mostPlayed: most, mostPlayedN: most ? played[most] : 0, games: who === ME ? (s.stats.battles.ranked.w + s.stats.battles.ranked.l + s.stats.battles.ranked.d) : (P.games || w + l), wins: w, losses: l,
      tourWins: who === ME ? (s.stats.tourWins || 0) : (P.tourWins || 0), streak: who === ME ? s.streak : (P.streak || 0) };
  }

  // ---------- Daily Adventures: 3 quests per league day, each pays a random pack ----------
  static QUESTS = [['play', 3, 'Play 3 ranked battles'], ['win', 2, 'Win 2 ranked battles'], ['open', 2, 'Open 2 packs'], ['sell', 3, 'Sell 3 cards to the shop'],
    ['buy', 1, 'Buy a single card from the shop'], ['watch', 1, 'Watch a live match in Spectate'], ['bid', 1, 'Place a bid in the auction house'],
    ['splitko', 1, 'Knock out a doremon with a split move'], ['friendly', 1, 'Win a friendly battle'], ['tourgame', 1, 'Win a tournament game'], ['draft', 1, 'Finish a draft']];
  static QUESTS_PER_DAY = 3;
  get quests() {
    const s = this.s;
    if (!s.quests || s.quests.day !== s.day) {
      const pool = Game.QUESTS.filter(q => q[0] !== 'tourgame' || this.isTourDay(s.day)).slice(), list = [];
      while (list.length < Game.QUESTS_PER_DAY && pool.length) { const q = pool.splice(this.rng.int(pool.length), 1)[0]; list.push({ kind: q[0], need: q[1], text: q[2], have: 0, done: false, reward: null }); }
      s.quests = { day: s.day, list, claimed: 0 };
    }
    return s.quests.list;
  }
  quest(kind, n = 1) {
    const s = this.s; const list = this.quests; let paid = null;
    for (const q of list) {
      if (q.kind !== kind || q.done) continue;
      q.have = Math.min(q.need, q.have + n);
      if (q.have >= q.need && s.quests.claimed < Game.QUESTS_PER_DAY) { q.done = true; s.quests.claimed++; q.reward = SETS[this.rng.int(SETS.length)]; inc(s.packs, q.reward); paid = q; this.newQuestDone = q; }
    }
    return paid;
  }

  // ---------- one-day tournament: top 8 by MR, best-of-3, sponsored by a rotating set ----------
  static TOUR_PRIZE = 2000;
  isTourDay(day) { return day % 3 === 2; }
  tourSet(day) { return SETS[Math.floor(day / 3) % SETS.length]; }
  /** the current day's tournament (created on first look), or null on a non-tournament day */
  get tour() {
    const s = this.s; if (!this.isTourDay(s.day)) return null;
    if (!s.tour || s.tour.day !== s.day) {
      const top = this.leaderboard.slice(0, 8).map(r => r.k);
      const seeds = [[0, 7], [3, 4], [1, 6], [2, 5]];
      s.tour = { day: s.day, set: this.tourSet(s.day), entrants: top, rounds: [seeds.map(([x, y]) => ({ p: [top[x], top[y]], w: [0, 0], winner: null }))], champion: null, done: false };
      this.resolveTourAI(); this.save();
    }
    return s.tour;
  }
  /** simulated best-of-3 between two AIs (fresh seed and coin toss each game) */
  aiSeries(a, b) {
    const w = [0, 0]; let g = 0;
    while (w[0] < 2 && w[1] < 2 && g < 7) { g++; const rec = this.aiMatch(a, b); const bt = new Battle(rec.deckA.map(card), this.s.ai[a].name, rec.deckB.map(card), this.s.ai[b].name, BigInt(rec.seed), rec.first);
      const r = BattleAI.simulate(bt); if (r != null) w[r]++; }
    if (w[0] === w[1]) w[this.rng.int(2)]++;      // pathological draws: coin flip
    return w;
  }
  resolveTourAI() {
    const T = this.s.tour; if (!T || T.done) return;
    for (;;) {
      const R = T.rounds[T.rounds.length - 1];
      for (const m of R) if (m.winner == null && !m.p.includes(ME)) { m.w = this.aiSeries(m.p[0], m.p[1]); m.winner = m.p[m.w[0] > m.w[1] ? 0 : 1]; }
      if (R.some(m => m.winner == null)) return;
      if (R.length === 1) { this.awardTour(R[0].winner); return; }
      const next = []; for (let i = 0; i < R.length; i += 2) next.push({ p: [R[i].winner, R[i + 1].winner], w: [0, 0], winner: null });
      T.rounds.push(next);
    }
  }
  awardTour(who) {
    const T = this.s.tour; T.champion = who; T.done = true;
    if (who === ME) { inc(this.s.packs, T.set); this.s.stats.tourWins = (this.s.stats.tourWins || 0) + 1; }
    else { this.aiOpenPack(who, T.set, true); this.s.ai[who].tourWins = (this.s.ai[who].tourWins || 0) + 1; }
    this.earn(who, Game.TOUR_PRIZE, 'tournament');
    this.s.recent.unshift({ id: uuid(), a: 'Tournament', b: SET_NAMES[T.set], winner: this.nameOf(who), mrChange: 0 });
  }
  /** the player's pending match, if any: {m, opp, round} */
  tourMatch() {
    const T = this.tour; if (!T || T.done) return null;
    const ri = T.rounds.length - 1, m = T.rounds[ri].find(x => x.winner == null && x.p.includes(ME));
    return m ? { m, opp: m.p[0] === ME ? m.p[1] : m.p[0], round: ['Quarter-final', 'Semi-final', 'Final'][ri] || 'Round ' + (ri + 1) } : null;
  }
  /** record one game of the player's best-of-3 (won null = draw, replay) */
  tourGame(won) {
    const tm = this.tourMatch(); if (!tm || won == null) return null; const m = tm.m, me = m.p[0] === ME ? 0 : 1;
    m.w[won ? me : 1 - me]++; if (won) this.quest('tourgame');
    if (m.w[0] >= 2 || m.w[1] >= 2) { m.winner = m.p[m.w[0] >= 2 ? 0 : 1]; this.resolveTourAI(); }
    this.save(); return m;
  }
  finishTour(forfeit) {
    const T = this.s.tour; if (!T || T.done) return;
    for (;;) { const tm = this.tourMatch(); if (!tm) break; const me = tm.m.p[0] === ME ? 0 : 1; tm.m.w[1 - me] = 2; tm.m.winner = tm.opp; tm.m.forfeit = forfeit; this.resolveTourAI(); }
    this.resolveTourAI();
  }

  // ---------- Draft: you + 6 trainers, a shared pool, snake picks ----------
  static DRAFT_FEE = 300; static DRAFT_SEATS = 7; static DRAFT_PICKS = 20; static DRAFT_GAMES = 3;
  /** seat order of every pick: round 1 seats 0..n-1, round 2 back n-1..0, ... */
  static snakeOrder(n, rounds) { const o = []; for (let r = 0; r < rounds; r++) for (let i = 0; i < n; i++) o.push(r % 2 === 0 ? i : n - 1 - i); return o; }
  startDraft(set) {
    const s = this.s; if (s.draft && !s.draft.done) return false;
    if (!this.spend(ME, Game.DRAFT_FEE, 'draft')) return false;
    const others = s.ai.map((_, i) => i); for (let i = others.length - 1; i > 0; i--) { const j = this.rng.int(i + 1); [others[i], others[j]] = [others[j], others[i]]; }
    const seats = [ME].concat(others.slice(0, Game.DRAFT_SEATS - 1)); for (let i = seats.length - 1; i > 0; i--) { const j = this.rng.int(i + 1); [seats[i], seats[j]] = [seats[j], seats[i]]; }
    const pool = []; const nPacks = Math.ceil(Game.DRAFT_SEATS * Game.DRAFT_PICKS / 7);
    for (let i = 0; i < nPacks; i++) for (const c of Packs.open(set, { v: 0 }, {}, this.rng)) pool.push(c.id);   // draft packs belong to nobody
    s.draft = { set, seats, pool, order: Game.snakeOrder(seats.length, Game.DRAFT_PICKS), pick: 0, picks: seats.map(() => []), games: [], done: false, reward: null };
    this.draftRun(); this.save(); return true;
  }
  draftSeat() { const D = this.s.draft; return D.seats.indexOf(ME); }
  /** must this seat take a doremon now to reach 8? */
  draftNeedsMon(seat) { const D = this.s.draft, have = D.picks[seat].filter(id => isMon(card(id))).length, left = Game.DRAFT_PICKS - D.picks[seat].length; return have + left <= 8 && have < 8; }
  draftLegal(seat, id) { const D = this.s.draft; return D.pool.includes(id) && (!this.draftNeedsMon(seat) || isMon(card(id)) || !D.pool.some(x => isMon(card(x)))); }
  draftRun() {
    const D = this.s.draft;
    while (D.pick < D.order.length) {
      const seat = D.order[D.pick], who = D.seats[seat]; if (who === ME) return;
      const pers = persOf(who); let best = null;
      for (const id of new Set(D.pool)) { if (!this.draftLegal(seat, id)) continue; const c = card(id); const mine = D.picks[seat];
        let v = isMon(c) ? BattleAI.monValue(c) + (pers.fav.includes(c.moveType) || c.types.some(t => pers.fav.includes(t)) ? 40 : 0) - 14 * mine.filter(x => card(x).moveType === c.moveType && isMon(card(x))).length
                         : 200 + (DeckRules.pref[id] ?? 20) * 2 - 60 * mine.filter(x => !isMon(card(x))).length;
        v += this.rng.unit() * 10; if (!best || v > best[1]) best = [id, v]; }
      this.draftTake(seat, best[0]);
    }
  }
  draftTake(seat, id) { const D = this.s.draft; D.pool.splice(D.pool.indexOf(id), 1); D.picks[seat].push(id); D.pick++; }
  draftPick(id) {
    const D = this.s.draft; if (!D || D.pick >= D.order.length) return false; const seat = D.order[D.pick];
    if (D.seats[seat] !== ME || !this.draftLegal(seat, id)) return false;
    this.draftTake(seat, id); this.draftRun(); this.save(); return true;
  }
  get draftPicking() { const D = this.s.draft; return !!D && !D.done && D.pick < D.order.length; }
  /** the next draft opponent: the drafters sitting after you, in seat order */
  draftOpponent() { const D = this.s.draft; if (!D || D.done || this.draftPicking) return null; const me = this.draftSeat(), g = D.games.length; if (g >= Game.DRAFT_GAMES) return null; const seat = (me + 1 + g) % D.seats.length; return { seat, who: D.seats[seat], deck: D.picks[seat] }; }
  draftResult(won) {
    const D = this.s.draft; if (!this.draftOpponent() || won == null) return null; D.games.push(!!won);
    if (D.games.length >= Game.DRAFT_GAMES) {
      const w = D.games.filter(Boolean).length; D.done = true; D.reward = { cash: w * 150, pack: w === Game.DRAFT_GAMES ? D.set : null };
      this.earn(ME, D.reward.cash, 'draft'); if (D.reward.pack) inc(this.s.packs, D.reward.pack); this.s.stats.drafts = (this.s.stats.drafts || 0) + 1; this.quest('draft');
    }
    this.save(); return D;
  }
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
    if (who === ME) { this.s.stats.bids++; this.quest('bid'); }
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
      case 't2_half': return this.distinct('T2') >= 15; case 't2_all': return this.distinct('T2') >= 30;
      case 't2_chase': return inSet('T2').some(c => Rarity.isChase(c.rarity) && this.s.owned[c.id] > 0);
      case 't2_split': return (s.splitKOs || 0) >= 1;
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
