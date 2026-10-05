/* Foxy Fight — AI opponent.
 * Searches the orders it could play its current hand in (on a copy of the match
 * with its own draw pile reshuffled, so it can't peek at upcoming cards), scores
 * each end point, and plays the first card of the best line. It re-plans after
 * every card, so draws mid-turn are handled naturally.
 *
 * Personality comes from the Opponents tab:
 *   aggression scales the value of damage and harmful statuses on the enemy
 *   caution    scales the value of block, healing and defensive statuses */
(function (root, factory) {
  const E = (typeof module === 'object' && module.exports) ? require('./engine.js') : root.CB;
  const mod = factory(E);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.CB = Object.assign(root.CB || {}, mod);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  function statusScore(data, f) {
    let good = 0, bad = 0;
    for (const id in f.statuses) {
      const s = data.statuses[id];
      if (!s) continue;
      if (s.beneficial) good += s.aiValue * f.statuses[id];
      else bad += s.aiValue * f.statuses[id];
    }
    return { good, bad };
  }

  function evaluate(data, root, node, meIdx, profile) {
    const me0 = root.fighters[meIdx], opp0 = root.fighters[1 - meIdx];
    const me = node.fighters[meIdx], opp = node.fighters[1 - meIdx];
    if (node.over) return node.winner === meIdx ? 10000 - (me.chain.played || 0) : -10000;
    const threat = data.config.ai_threat_estimate;
    const agg = profile.aggression, cau = profile.caution;
    let s = 0;
    const oppDowns = opp.knockdowns - opp0.knockdowns, myDowns = me.knockdowns - me0.knockdowns;
    s += agg * (opp.taken - opp0.taken);                        // damage dealt (survives knockdown resets)
    s -= 1.2 * (me.taken - me0.taken);                          // self-damage (Counterpunch)
    s += agg * 30 * oppDowns;                                   // knockdowns win rounds and end fights
    s -= 60 * myDowns;
    if (!myDowns) s += cau * 0.9 * Math.max(0, me.hp - me0.hp); // healing
    s += cau * (0.8 * Math.min(me.block, threat) + 0.1 * Math.max(0, me.block - threat));
    const so = statusScore(data, opp), sm = statusScore(data, me);
    const so0 = statusScore(data, opp0), sm0 = statusScore(data, me0);
    if (!oppDowns) s += agg * ((so.bad - so0.bad) - (so.good - so0.good));
    if (!myDowns) s += cau * ((sm.good - sm0.good) - (sm.bad - sm0.bad));
    // Killing blow pressure: closer to a knockdown is worth a bit more
    if (!oppDowns && opp.hp < opp0.hp) s += agg * 4 * (1 - opp.hp / opp.maxHp);
    s += 0.05 * me.energy; // tiny tie-breaker: don't waste plays that do nothing
    return s;
  }

  function chooseAction(state, data, profile, opts) {
    profile = profile || { aggression: 1, caution: 1 };
    const budget = (opts && opts.budget) || 500;
    const meIdx = state.active;
    const root = E.cloneState(state);
    // hide information: reshuffle own draw pile with a separate seed
    root.seed = (state.seed ^ 0x5bd1e995) | 0;
    E.shuffle(root, root.fighters[meIdx].deck);

    let nodes = 0;
    let best = { score: evaluate(data, root, root, meIdx, profile), first: -1 };

    function dfs(node, first) {
      if (nodes >= budget || node.over) return;
      const f = node.fighters[meIdx];
      const seen = new Set();
      // try linking cards first: they usually lead to the best lines
      const order = f.hand.map((c, i) => i).sort((a, b) => {
        const la = E.wouldLink(f, data.cards[f.hand[a].id]) ? 0 : 1;
        const lb = E.wouldLink(f, data.cards[f.hand[b].id]) ? 0 : 1;
        return la - lb;
      });
      for (const i of order) {
        const id = f.hand[i].id;
        if (seen.has(id)) continue;
        seen.add(id);
        if (data.cards[id].cost > f.energy) continue;
        if (nodes >= budget) return;
        nodes++;
        const child = E.cloneState(node);
        E.playCard(child, data, i);
        const f0 = first === -1 ? i : first;
        const sc = evaluate(data, root, child, meIdx, profile);
        if (sc > best.score + 1e-9) best = { score: sc, first: f0 };
        if (child.active === meIdx) dfs(child, f0); // a knockdown ends the turn
      }
    }
    dfs(root, -1);
    return best.first;
  }

  /* Plays a whole turn instantly (used by the simulator). */
  function playTurn(state, data, profile, opts) {
    const me = state.active;
    const turn = state.turnCount;
    let guard = 0;
    while (!state.over && state.active === me && state.turnCount === turn && guard++ < 40) {
      const i = chooseAction(state, data, profile, opts);
      if (i < 0) break;
      E.playCard(state, data, i);
    }
    // a knockdown already ended the turn inside playCard
    if (!state.over && state.active === me && state.turnCount === turn) E.endTurn(state, data);
  }

  return { chooseAction, playTurn, evaluate };
});
