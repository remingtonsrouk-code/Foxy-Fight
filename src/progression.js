/* Foxy Fight — characters, XP, shop, deck building, evolution, saves.
 * No randomness anywhere: every card is bought deliberately with XP.
 * Each character (one per root style) keeps its own XP, collection, deck and
 * ladder progress. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.CB = Object.assign(root.CB || {}, mod);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SAVE_VERSION = 1;

  function newSave() { return { version: SAVE_VERSION, characters: {}, activeRoot: null }; }

  function countList(ids) { const m = {}; ids.forEach(id => { m[id] = (m[id] || 0) + 1; }); return m; }
  function sum(m) { let n = 0; for (const k in m) n += m[k]; return n; }

  function newCharacter(data, rootId) {
    const style = data.styles[rootId];
    const owned = countList(style.baseDeck);
    return {
      root: rootId, styleId: rootId, xp: data.config.starting_xp, totalXp: data.config.starting_xp,
      owned, deck: { ...owned }, beaten: {}, wins: 0, losses: 0,
    };
  }

  function getCharacter(save, data, rootId) {
    if (!save.characters[rootId]) save.characters[rootId] = newCharacter(data, rootId);
    return sanitize(data, save.characters[rootId]);
  }

  /* If the sheet changed (cards renamed or removed), keep the save usable. */
  function sanitize(data, ch) {
    if (!data.styles[ch.styleId]) ch.styleId = ch.root;
    for (const m of [ch.owned, ch.deck]) for (const id of Object.keys(m)) if (!data.cards[id] || m[id] <= 0) delete m[id];
    for (const id of Object.keys(ch.deck)) ch.deck[id] = Math.min(ch.deck[id], ch.owned[id] || 0);
    return ch;
  }

  /* The styles a character has passed through, root first. */
  function lineage(data, ch) {
    const out = [];
    let s = data.styles[ch.root];
    const guard = new Set();
    while (s && !guard.has(s.id)) {
      guard.add(s.id); out.push(s.id);
      if (s.id === ch.styleId) break;
      s = data.styles[s.evolvesTo];
    }
    return out;
  }
  function futureStyles(data, ch) {
    const out = [];
    let s = data.styles[data.styles[ch.styleId].evolvesTo];
    const guard = new Set();
    while (s && !guard.has(s.id)) { guard.add(s.id); out.push(s.id); s = data.styles[s.evolvesTo]; }
    return out;
  }

  function deckSize(ch) { return sum(ch.deck); }
  function deckIds(ch) { const ids = []; for (const id in ch.deck) for (let k = 0; k < ch.deck[id]; k++) ids.push(id); return ids; }
  function copyLimit(data, card) { return card.maxCopies || data.config.max_copies; }

  /* Shop listing for a character. Locked cards (from a future evolution) are
   * included so players can see what they're working toward. */
  function shopFor(data, ch) {
    const usable = new Set([...lineage(data, ch), 'Neutral']);
    const future = new Set(futureStyles(data, ch));
    const items = [];
    data.cardList.forEach(card => {
      if (!(card.xpPrice > 0)) return;
      const inLine = usable.has(card.style), locked = future.has(card.style);
      if (!inLine && !locked) return;
      const owned = ch.owned[card.id] || 0;
      const item = { card, price: card.xpPrice, owned, isUpgrade: !!card.upgradeOf, locked, canBuy: false, reason: '' };
      if (locked) item.reason = `Unlocks with ${data.styles[card.style].name}`;
      else if (card.upgradeOf) {
        const baseOwned = ch.owned[card.upgradeOf] || 0;
        item.baseOwned = baseOwned;
        if (!baseOwned) item.reason = `Needs a ${data.cards[card.upgradeOf].name} to upgrade`;
        else if (ch.xp < card.xpPrice) item.reason = 'Not enough XP';
        else item.canBuy = true;
      } else {
        const limit = copyLimit(data, card);
        item.limit = limit;
        if (owned >= limit) item.reason = 'Owned the maximum';
        else if (ch.xp < card.xpPrice) item.reason = 'Not enough XP';
        else item.canBuy = true;
      }
      items.push(item);
    });
    return items;
  }

  function buy(data, ch, cardId) {
    const item = shopFor(data, ch).find(i => i.card.id === cardId);
    if (!item) return { ok: false, reason: 'Not sold to this character' };
    if (!item.canBuy) return { ok: false, reason: item.reason };
    const card = item.card;
    ch.xp -= item.price;
    if (card.upgradeOf) {
      const base = card.upgradeOf;
      ch.owned[base]--; if (!ch.owned[base]) delete ch.owned[base];
      ch.owned[card.id] = (ch.owned[card.id] || 0) + 1;
      if (ch.deck[base]) {
        ch.deck[base]--; if (!ch.deck[base]) delete ch.deck[base];
        ch.deck[card.id] = (ch.deck[card.id] || 0) + 1;
      }
      return { ok: true, upgraded: base, addedToDeck: true };
    }
    ch.owned[card.id] = (ch.owned[card.id] || 0) + 1;
    let added = false;
    if (deckSize(ch) < data.config.deck_max) { ch.deck[card.id] = (ch.deck[card.id] || 0) + 1; added = true; }
    return { ok: true, addedToDeck: added };
  }

  function setDeckCount(data, ch, cardId, n) {
    const owned = ch.owned[cardId] || 0;
    n = Math.max(0, Math.min(n, owned));
    const others = deckSize(ch) - (ch.deck[cardId] || 0);
    if (others + n > data.config.deck_max) n = Math.max(0, data.config.deck_max - others);
    if (n) ch.deck[cardId] = n; else delete ch.deck[cardId];
    return n;
  }

  function deckProblems(data, ch) {
    const n = deckSize(ch), out = [];
    if (n < data.config.deck_min) out.push(`Your deck needs at least ${data.config.deck_min} cards (it has ${n}).`);
    if (n > data.config.deck_max) out.push(`Your deck can hold at most ${data.config.deck_max} cards (it has ${n}).`);
    return out;
  }

  function evolveInfo(data, ch) {
    const cur = data.styles[ch.styleId];
    const next = data.styles[cur.evolvesTo];
    if (!next) return null;
    const req = cur.evolveRequires ? data.opponents.find(o => o.id === cur.evolveRequires) : null;
    const reqMet = !req || !!ch.beaten[req.id];
    const xpMet = ch.xp >= cur.evolveXp;
    return {
      from: cur, to: next, cost: cur.evolveXp, requires: req, reqMet, xpMet, canEvolve: reqMet && xpMet,
      reason: !reqMet ? `Beat ${req.name} first` : (!xpMet ? 'Not enough XP' : ''),
    };
  }

  function evolve(data, ch) {
    const info = evolveInfo(data, ch);
    if (!info || !info.canEvolve) return { ok: false, reason: info ? info.reason : 'This style is fully evolved' };
    ch.xp -= info.cost;
    ch.styleId = info.to.id;
    return { ok: true, style: info.to };
  }

  function ladderStatus(data, ch) {
    return data.opponents.map((o, i) => ({
      opp: o, beaten: !!ch.beaten[o.id],
      unlocked: i === 0 || !!ch.beaten[data.opponents[i - 1].id] || !!ch.beaten[o.id],
    }));
  }

  function xpFor(data, ch, opp, won) {
    if (!won) return data.config.xp_on_loss;
    return Math.round(opp.xpReward * (ch.beaten[opp.id] ? data.config.replay_xp_multiplier : 1));
  }

  function recordResult(data, ch, opp, won) {
    const gained = xpFor(data, ch, opp, won);
    const firstWin = won && !ch.beaten[opp.id];
    ch.xp += gained; ch.totalXp += gained;
    if (won) { ch.wins++; ch.beaten[opp.id] = true; } else ch.losses++;
    return { gained, firstWin };
  }

  /* Save codes: base64 of the JSON, safe for any characters. */
  function exportSave(save) {
    const json = JSON.stringify(save);
    const b64 = typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, 'utf8').toString('base64');
    return 'CB1.' + b64;
  }
  function importSave(code) {
    const s = String(code || '').trim().replace(/^CB1\./, '');
    const json = typeof atob === 'function'
      ? decodeURIComponent(escape(atob(s)))
      : Buffer.from(s, 'base64').toString('utf8');
    const save = JSON.parse(json);
    if (!save || typeof save !== 'object' || !save.characters) throw new Error('That code is not a Foxy Fight save.');
    return save;
  }

  return {
    newSave, newCharacter, getCharacter, lineage, futureStyles, deckSize, deckIds, shopFor, buy,
    setDeckCount, deckProblems, evolveInfo, evolve, ladderStatus, xpFor, recordResult, exportSave, importSave,
  };
});
