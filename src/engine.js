/* Foxy Fight — rules engine.
 * Pure functions over a plain-object match state, so the same code runs the
 * GUI, the AI's look-ahead, and the headless balance simulator.
 *
 * Turn flow
 *   startTurn: block resets, start-of-turn statuses (Bleed) tick, energy refills
 *              (minus Stagger), cards are drawn (minus Dazed), statuses decay,
 *              the style's on_turn_start effects fire.
 *   playCard:  pay energy, check the chain, resolve effects, then the link bonus
 *              and the style's on_link effects if the card linked.
 *   endTurn:   discard hand, hand the turn to the other fighter.
 *
 * Rounds (Config exchanges_per_round > 0)
 *   An exchange is one turn each. After exchanges_per_round exchanges the round
 *   ends: three judges score it (10-point must), then both fighters go to the
 *   corner (heal, clear statuses, reshuffle) and the next round starts with the
 *   other fighter leading. After the last round the judges' cards decide it.
 *   Judges: #1 scores damage, #2 damage + 2 per link, #3 damage + 1 per landed hit.
 *   A fighter knocked down in a round loses it 10-8 (10-7 for two knockdowns...).
 *
 * Knockdowns (Config knockdowns_for_tko > 0)
 *   Hitting 0 HP is a knockdown: the fighter gets back up with
 *   knockdown_recover_percent of max HP and the current turn ends at once.
 *   The knockdowns_for_tko-th knockdown ends the fight (T.K.O.).
 *   With knockdowns_for_tko = 0, 0 HP is an immediate K.O.
 *
 * Chain rule
 *   The first card of a turn links if its "follows" list contains START.
 *   Any later card links if its "follows" contains ANY, or one of the previous
 *   card's tags, or the previous card has the Wild tag. A card that doesn't
 *   link starts a new chain of length 1. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.CB = Object.assign(root.CB || {}, mod);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- RNG (mulberry32, state kept in the match so clones stay deterministic) ---------- */
  function rand(state) {
    let t = (state.seed = (state.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(state) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function emit(state, ev) { if (state.events) state.events.push(ev); }

  /* ---------- setup ---------- */
  function createFighter(state, data, spec, index) {
    const style = data.styles[spec.styleId];
    if (!style) throw new Error(`Unknown style "${spec.styleId}"`);
    const deckIds = (spec.deck && spec.deck.length ? spec.deck : style.baseDeck).filter(id => data.cards[id]);
    const deck = deckIds.map(id => ({ uid: ++state.uid, id }));
    shuffle(state, deck);
    const maxHp = Math.max(1, style.hp + (spec.hpBonus || 0));
    return {
      index, name: spec.name || style.name, styleId: style.id, isAI: !!spec.isAI,
      hp: maxHp, maxHp, block: 0, energy: 0,
      maxEnergy: style.energy != null ? style.energy : data.config.energy_per_turn,
      handSize: style.handSize != null ? style.handSize : data.config.hand_size,
      deck, hand: [], discard: [], statuses: {},
      taken: 0, knockdowns: 0,
      chain: { length: 0, tags: [], links: 0, played: 0 },
      stats: { played: 0, links: 0, bestChain: 0, damageDealt: 0, turns: 0, cardPlays: {}, cardLinks: {}, cardDamage: {} },
    };
  }

  function createMatch(data, specA, specB, opts) {
    opts = opts || {};
    const cfg = data.config;
    const state = {
      seed: (opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31)) | 0,
      uid: 0, active: 0, first: 0, over: false, winner: null, endReason: '',
      events: opts.noEvents ? null : [], turnCount: 0, halt: false,
      // rounds
      roundsMode: cfg.exchanges_per_round > 0,
      maxRounds: Math.max(1, opts.rounds || cfg.rounds || 1),
      round: 1, exchange: 1, exchangeInRound: 1, turnInRound: 0, roundStarter: 0,
      roundStats: freshRoundStats(), scorecards: [], decision: null,
    };
    state.fighters = [createFighter(state, data, specA, 0), createFighter(state, data, specB, 1)];
    state.first = opts.firstPlayer != null ? opts.firstPlayer : (rand(state) < 0.5 ? 0 : 1);
    state.active = state.first;
    state.roundStarter = state.first;
    startTurn(state, data);
    return state;
  }

  function cloneState(state) {
    const cf = f => ({
      ...f,
      deck: f.deck.slice(), hand: f.hand.slice(), discard: f.discard.slice(),
      statuses: { ...f.statuses }, chain: { ...f.chain, tags: f.chain.tags.slice() },
      stats: { played: 0, links: 0, bestChain: 0, damageDealt: 0, turns: 0, cardPlays: {}, cardLinks: {}, cardDamage: {} },
    });
    return {
      ...state, fighters: [cf(state.fighters[0]), cf(state.fighters[1])], events: null,
      roundStats: { dmg: state.roundStats.dmg.slice(), links: state.roundStats.links.slice(), hits: state.roundStats.hits.slice(), kd: state.roundStats.kd.slice() },
      scorecards: state.scorecards.slice(),
    };
  }

  function freshRoundStats() { return { dmg: [0, 0], links: [0, 0], hits: [0, 0], kd: [0, 0] }; }

  /* ---------- helpers ---------- */
  const st = (f, id) => f.statuses[id] || 0;
  function stacksByBehavior(data, f, behavior) {
    let n = 0;
    for (const id in f.statuses) {
      const s = data.statuses[id];
      if (s && s.behavior === behavior) n += f.statuses[id];
    }
    return n;
  }

  function draw(state, data, f, n) {
    let drawn = 0;
    for (let k = 0; k < n; k++) {
      if (!f.deck.length) {
        if (!f.discard.length) break;
        f.deck = shuffle(state, f.discard);
        f.discard = [];
        emit(state, { type: 'reshuffle', who: f.index });
      }
      f.hand.push(f.deck.pop());
      drawn++;
    }
    if (drawn) emit(state, { type: 'draw', who: f.index, n: drawn });
    return drawn;
  }

  function loseHp(state, data, f, amount, source) {
    if (amount <= 0) return;
    f.taken += Math.min(f.hp, amount);
    f.hp = Math.max(0, f.hp - amount);
    emit(state, { type: 'hp', who: f.index, amount: -amount, source });
    checkKO(state, data);
  }

  function finish(state, winner, reason) {
    state.over = true;
    state.winner = winner;
    state.endReason = reason;
    emit(state, { type: 'end', winner, reason, decision: state.decision });
  }

  function checkKO(state, data) {
    if (state.over) return;
    const cfg = data.config;
    // the active fighter's opponent is checked first, so a double knockout favours the attacker
    for (const f of [state.fighters[1 - state.active], state.fighters[state.active]]) {
      if (f.hp > 0 || state.over) continue;
      const tko = cfg.knockdowns_for_tko;
      if (!(tko > 1)) { finish(state, 1 - f.index, 'ko'); return; }
      f.knockdowns++;
      state.roundStats.kd[f.index]++;
      if (f.knockdowns >= tko) {
        emit(state, { type: 'knockdown', who: f.index, count: f.knockdowns, final: true });
        finish(state, 1 - f.index, 'tko');
        return;
      }
      f.hp = Math.max(1, Math.ceil(f.maxHp * cfg.knockdown_recover_percent / 100));
      f.block = 0;
      if (cfg.knockdown_clears_statuses) f.statuses = {};
      state.halt = true; // the count stops the current turn
      emit(state, { type: 'knockdown', who: f.index, count: f.knockdowns, hp: f.hp });
    }
  }

  function dealHit(state, data, attacker, target, amount, opts) {
    if (state.over) return 0;
    amount += stacksByBehavior(data, target, 'damage_taken_up');
    amount = Math.max(0, amount);
    let blocked = 0;
    if (!opts.pierce && target.block > 0) {
      blocked = Math.min(target.block, amount);
      target.block -= blocked;
      amount -= blocked;
    }
    target.taken += Math.min(target.hp, amount);
    state.roundStats.dmg[attacker.index] += Math.min(target.hp, amount);
    if (amount > 0) state.roundStats.hits[attacker.index]++;
    target.hp = Math.max(0, target.hp - amount);
    attacker.stats.damageDealt += amount;
    if (opts.cardId) attacker.stats.cardDamage[opts.cardId] = (attacker.stats.cardDamage[opts.cardId] || 0) + amount;
    emit(state, { type: 'hit', from: attacker.index, who: target.index, amount, blocked, pierce: !!opts.pierce });
    checkKO(state, data);
    const thorns = stacksByBehavior(data, target, 'thorns');
    if (thorns > 0 && !state.over && !state.halt) {
      attacker.taken += Math.min(attacker.hp, thorns);
      state.roundStats.dmg[target.index] += Math.min(attacker.hp, thorns);
      attacker.hp = Math.max(0, attacker.hp - thorns);
      emit(state, { type: 'hp', who: attacker.index, amount: -thorns, source: 'thorns' });
      checkKO(state, data);
    }
    return amount;
  }

  function addStatus(state, data, f, id, n) {
    if (!data.statuses[id] || n === 0) return;
    f.statuses[id] = Math.max(0, (f.statuses[id] || 0) + n);
    if (!f.statuses[id]) delete f.statuses[id];
    emit(state, { type: 'status', who: f.index, status: id, n });
  }

  /* ctx: { me, opp, cardId, comboBonus, firstHit, attacked } */
  function resolveEffects(state, data, effects, ctx) {
    const { me, opp } = ctx;
    for (const e of effects) {
      if (state.over || state.halt) return;
      switch (e.op) {
        case 'dmg':
        case 'pierce':
        case 'dmgchain': {
          const hits = e.op === 'dmg' ? e.hits : 1;
          const base = e.op === 'dmgchain' ? e.n * Math.max(1, me.chain.length) : e.n;
          for (let h = 0; h < hits && !state.over && !state.halt; h++) {
            let amount = base;
            if (ctx.firstHit) {
              amount += ctx.comboBonus;
              // damage_dealt_up statuses (Focus) boost the first hit; 'consume' ones are used up
              for (const id in me.statuses) {
                const sd = data.statuses[id];
                if (!sd || sd.behavior !== 'damage_dealt_up') continue;
                amount += me.statuses[id];
                if (sd.decay === 'consume') { ctx.spent = ctx.spent || {}; ctx.spent[id] = me.statuses[id]; }
              }
              ctx.firstHit = false;
            }
            ctx.attacked = true;
            dealHit(state, data, me, opp, amount, { pierce: e.op === 'pierce', cardId: ctx.cardId });
          }
          break;
        }
        case 'block': {
          const amt = e.n + stacksByBehavior(data, me, 'block_gain_up');
          me.block += amt;
          emit(state, { type: 'block', who: me.index, n: amt });
          break;
        }
        case 'heal': {
          const before = me.hp;
          me.hp = Math.min(me.maxHp, me.hp + e.n);
          emit(state, { type: 'hp', who: me.index, amount: me.hp - before, source: 'heal' });
          break;
        }
        case 'draw': draw(state, data, me, e.n); break;
        case 'energy':
          me.energy += e.n;
          emit(state, { type: 'energy', who: me.index, n: e.n });
          break;
        case 'apply': addStatus(state, data, opp, e.status, e.n); break;
        case 'gain': addStatus(state, data, me, e.status, e.n); break;
      }
    }
  }

  /* ---------- turn flow ---------- */
  function startTurn(state, data) {
    const me = state.fighters[state.active];
    const opp = state.fighters[1 - state.active];
    me.chain = { length: 0, tags: [], links: 0, played: 0 };
    me.stats.turns++;
    state.turnCount++;
    const firstTurnOfMatch = state.turnCount === 1;
    if (data.config.block_resets_each_turn) me.block = 0;
    emit(state, { type: 'turn', who: me.index, round: state.round, exchange: state.exchangeInRound, roundsMode: state.roundsMode });

    // damage-over-time ticks first
    for (const id of Object.keys(me.statuses)) {
      const s = data.statuses[id];
      if (s && s.behavior === 'dot') loseHp(state, data, me, me.statuses[id], id);
    }
    if (state.over) return;
    if (state.halt) { endTurn(state, data); return; } // knocked down by a Cut before acting

    let energy = me.maxEnergy - stacksByBehavior(data, me, 'energy_down');
    if (firstTurnOfMatch) energy -= data.config.first_turn_energy_penalty;
    me.energy = Math.max(0, energy);
    let drawN = me.handSize - stacksByBehavior(data, me, 'draw_down');
    if (firstTurnOfMatch) drawN -= (data.config.first_turn_draw_penalty || 0);
    drawN = Math.max(0, drawN);

    // decay
    for (const id of Object.keys(me.statuses)) {
      const s = data.statuses[id];
      if (!s) continue;
      if (s.decay === 'turn') me.statuses[id] -= 1;
      else if (s.decay === 'clear') me.statuses[id] = 0;
      if (me.statuses[id] <= 0) delete me.statuses[id];
    }

    draw(state, data, me, drawN);
    const style = data.styles[me.styleId];
    if (style.onTurnStart.length) resolveEffects(state, data, style.onTurnStart, { me, opp, comboBonus: 0, firstHit: false });
  }

  /* ---------- rounds ---------- */
  function scoreRound(state) {
    const r = state.roundStats;
    const criteria = [
      i => r.dmg[i],                    // judge 1: damage
      i => r.dmg[i] + 2 * r.links[i],   // judge 2: likes combinations
      i => r.dmg[i] + r.hits[i],        // judge 3: likes activity
    ];
    return criteria.map(c => {
      if (r.kd[0] !== r.kd[1]) {
        const down = r.kd[0] > r.kd[1] ? 0 : 1, diff = Math.abs(r.kd[0] - r.kd[1]);
        const card = [10, 10]; card[down] = Math.max(6, 9 - diff);
        return card;
      }
      const a = c(0), b = c(1);
      return a === b ? [10, 10] : (a > b ? [10, 9] : [9, 10]);
    });
  }

  function decide(state) {
    const totals = [0, 1, 2].map(j => state.scorecards.reduce((t, sc) => [t[0] + sc.judges[j][0], t[1] + sc.judges[j][1]], [0, 0]));
    let v0 = 0, v1 = 0;
    totals.forEach(t => { if (t[0] > t[1]) v0++; else if (t[1] > t[0]) v1++; });
    let winner, type;
    if (v0 === v1) {
      const [a, b] = state.fighters;
      const pa = a.hp / a.maxHp, pb = b.hp / b.maxHp;
      winner = pa === pb ? (a.taken <= b.taken ? 0 : 1) : (pa > pb ? 0 : 1);
      type = 'technical';
    } else {
      winner = v0 > v1 ? 0 : 1;
      const w = Math.max(v0, v1), l = Math.min(v0, v1);
      type = w === 3 ? 'unanimous' : (l === 1 ? 'split' : 'majority');
    }
    state.decision = { type, totals, winner };
    finish(state, winner, 'decision');
  }

  function endRound(state, data) {
    const cfg = data.config;
    const judges = scoreRound(state);
    const sc = { round: state.round, judges, dmg: state.roundStats.dmg.slice(), kd: state.roundStats.kd.slice() };
    state.scorecards.push(sc);
    emit(state, { type: 'roundEnd', round: state.round, judges, dmg: sc.dmg, kd: sc.kd, last: state.round >= state.maxRounds });
    if (state.round >= state.maxRounds) { decide(state); return; }
    // the corner
    for (const f of state.fighters) {
      const heal = Math.ceil(f.maxHp * (cfg.corner_heal_percent || 0) / 100);
      const before = f.hp;
      f.hp = Math.min(f.maxHp, f.hp + heal);
      f.block = 0;
      // TRUE clears every status; a number removes that many stacks of each
      if (cfg.corner_clears_statuses === true) f.statuses = {};
      else if (cfg.corner_clears_statuses > 0) {
        for (const id of Object.keys(f.statuses)) {
          f.statuses[id] -= cfg.corner_clears_statuses;
          if (f.statuses[id] <= 0) delete f.statuses[id];
        }
      }
      if (cfg.corner_reshuffle) {
        f.deck.push(...f.hand, ...f.discard); f.hand = []; f.discard = [];
        shuffle(state, f.deck);
      }
      emit(state, { type: 'corner', who: f.index, healed: f.hp - before });
    }
    state.round++;
    state.exchange++;
    state.exchangeInRound = 1;
    state.turnInRound = 0;
    state.roundStats = freshRoundStats();
    if (cfg.alternate_round_start) state.roundStarter = 1 - state.roundStarter;
    state.active = state.roundStarter;
    emit(state, { type: 'roundStart', round: state.round, starter: state.active });
  }

  function wouldLink(f, card) {
    if (f.chain.length === 0) return card.followKeys.includes('start');
    if (card.followKeys.includes('any')) return true;
    if (f.chain.tags.includes('wild')) return true;
    return card.followKeys.some(t => f.chain.tags.includes(t));
  }

  function canPlay(state, data, handIndex) {
    if (state.over) return false;
    const f = state.fighters[state.active];
    const inst = f.hand[handIndex];
    if (!inst) return false;
    if (data.config.max_cards_per_turn > 0 && f.chain.played >= data.config.max_cards_per_turn) return false;
    return data.cards[inst.id].cost <= f.energy;
  }

  function playCard(state, data, handIndex) {
    if (!canPlay(state, data, handIndex)) return { ok: false };
    const me = state.fighters[state.active];
    const opp = state.fighters[1 - state.active];
    const inst = me.hand.splice(handIndex, 1)[0];
    const card = data.cards[inst.id];
    me.energy -= card.cost;

    const linked = wouldLink(me, card);
    me.chain.length = linked ? me.chain.length + 1 : 1;
    me.chain.links = linked ? me.chain.links + 1 : 0;
    me.chain.tags = card.tagKeys.slice();
    me.chain.played = (me.chain.played || 0) + 1;
    me.stats.played++;
    me.stats.cardPlays[card.id] = (me.stats.cardPlays[card.id] || 0) + 1;
    if (linked) { me.stats.links++; me.stats.cardLinks[card.id] = (me.stats.cardLinks[card.id] || 0) + 1; }
    me.stats.bestChain = Math.max(me.stats.bestChain, me.chain.length);
    if (linked) state.roundStats.links[me.index]++;

    const cfg = data.config;
    const comboBonus = linked ? Math.min(cfg.combo_damage_cap, Math.floor(Math.max(0, me.chain.length - 1) * cfg.combo_damage_per_link)) : 0;
    // kd = the attacker's knockdowns before this card resolves. The screen reads
    // events only after the whole card is done, and Counterpunch can drop the
    // attacker mid-card, so the cut-in art needs the count from this moment.
    emit(state, { type: 'play', who: me.index, uid: inst.uid, cardId: card.id, linked, chain: me.chain.length, comboBonus, kd: me.knockdowns });

    const ctx = { me, opp, cardId: card.id, comboBonus, firstHit: true, attacked: false };
    resolveEffects(state, data, card.effects, ctx);
    if (linked && !state.over) {
      resolveEffects(state, data, card.linkBonus, ctx);
      const style = data.styles[me.styleId];
      if (style.onLink.length && !state.over) resolveEffects(state, data, style.onLink, { me, opp, comboBonus: 0, firstHit: false, cardId: card.id });
    }
    // Spend only the Focus that this card's first hit actually used (Focus gained by this card stays)
    if (ctx.spent) for (const id in ctx.spent) addStatus(state, data, me, id, -ctx.spent[id]);
    me.discard.push(inst);
    const knockdown = state.halt;
    if (state.halt && !state.over) endTurn(state, data); // a knockdown ends the turn
    return { ok: true, linked, chain: me.chain.length, knockdown };
  }

  function endTurn(state, data) {
    if (state.over) return;
    const cfg = data.config;
    state.halt = false;
    const me = state.fighters[state.active];
    if (cfg.discard_hand_end_of_turn) { me.discard.push(...me.hand); me.hand = []; }
    emit(state, { type: 'endTurn', who: me.index });
    state.turnInRound++;
    if (state.roundsMode && state.turnInRound >= 2 * cfg.exchanges_per_round) {
      endRound(state, data);
      if (!state.over) startTurn(state, data);
      return;
    }
    state.active = 1 - state.active;
    if (state.active === state.roundStarter) { state.exchange++; state.exchangeInRound++; }
    if (state.exchange > cfg.turn_limit * (state.roundsMode ? state.maxRounds : 1)) {
      const [a, b] = state.fighters;
      const pa = a.hp / a.maxHp, pb = b.hp / b.maxHp;
      finish(state, pa === pb ? (a.hp >= b.hp ? 0 : 1) : (pa > pb ? 0 : 1), 'time');
      return;
    }
    startTurn(state, data);
  }

  /* Preview of what a card would do right now — used for UI hints. */
  function previewCard(state, data, handIndex) {
    const f = state.fighters[state.active];
    const inst = f.hand[handIndex];
    if (!inst) return null;
    const card = data.cards[inst.id];
    const linked = wouldLink(f, card);
    const capped = data.config.max_cards_per_turn > 0 && f.chain.played >= data.config.max_cards_per_turn;
    const chainAfter = linked ? f.chain.length + 1 : 1;
    const cfg = data.config;
    const comboBonus = linked ? Math.min(cfg.combo_damage_cap, Math.floor((chainAfter - 1) * cfg.combo_damage_per_link)) : 0;
    return { linked, chainAfter, comboBonus, affordable: card.cost <= f.energy && !capped };
  }

  return {
    rand, shuffle, createMatch, cloneState, startTurn, endTurn, playCard, canPlay, wouldLink, previewCard,
    stacksByBehavior, statusStacks: st,
  };
});
