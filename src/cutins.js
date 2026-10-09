/* Foxy Fight — cut-in art: which picture to show for a card, a knockdown or a win.
 *
 * Face rule: your fighter is always shown in profile, the opponent in POV.
 *   A card shows the attacker's face; a knockdown shows the fighter going down;
 *   the result screen shows the winner.
 *
 * Every picture is looked up in the CutIns tab by (fighter, move, view, slot):
 *   fighter  a style id, an opponent id or a Fighters (custom look) id
 *   move     a card id, a tag, Knockdown, Victory, or blank (any move)
 *   view     profile or pov
 *   slot     0-2: knockdowns already taken (cards), which knockdown with
 *            2 = T.K.O. (Knockdown), knockdowns the winner took (Victory)
 *
 * Fallback: stay on the same face first.
 *   1. faces, in order:  custom outfit for this style -> the custom fighter's
 *      other outfits -> this style -> the style it evolved from -> ...
 *      Ladder opponents: the opponent -> her style -> that style's base style.
 *   2. on each face, moves: the card -> the card it upgrades -> its tags -> any.
 *   3. on each move, slots: the asked-for slot -> lower slots -> higher slots.
 * Nothing found = null, and the screen draws a generated cut-in instead. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.CB = Object.assign(root.CB || {}, mod);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SLOTS = 3;
  const TAG_ORDER = ['opener', 'light', 'heavy', 'finisher', 'guard', 'wild'];

  /* The style and the styles it evolved from, nearest first. */
  function styleChain(data, styleId) {
    const out = [];
    const seen = new Set();
    let s = data.styles[styleId];
    while (s && !seen.has(s.id)) {
      seen.add(s.id); out.push(s.id);
      const prev = data.styleList.find(p => p.evolvesTo === s.id && !seen.has(p.id));
      s = prev || (s.root !== s.id ? data.styles[s.root] : null);
    }
    return out;
  }

  /* Faces to try, in order, for one fighter in a fight.
   *   { styleId }               a player using a style's own look
   *   { styleId, look }         a player using a custom look (Fighters id)
   *   { opponentId }            a ladder opponent */
  function faceChain(data, who) {
    if (who.opponentId) {
      const o = data.opponents.find(x => x.id === who.opponentId);
      return o ? [o.id, ...styleChain(data, o.style)] : [];
    }
    const styles = styleChain(data, who.styleId);
    const fighters = data.fighters || {};
    const look = who.look && fighters[who.look];
    if (!look) return styles;
    const family = (data.fighterList || []).filter(f => f.family === look.family);
    const outfits = [];
    styles.forEach(sid => family.filter(f => f.style === sid).forEach(f => outfits.push(f.id)));
    if (!outfits.length) outfits.push(look.id);
    return [...outfits, ...styles];
  }

  /* Card -> the cards it upgrades -> its tags -> any move. */
  function moveKeys(data, cardId) {
    const keys = [];
    const seen = new Set();
    let c = data.cards[cardId];
    const tags = c ? c.tagKeys.slice() : [];
    while (c && !seen.has(c.id)) {
      seen.add(c.id); keys.push('card:' + c.id);
      c = c.upgradeOf ? data.cards[c.upgradeOf] : null;
    }
    tags.forEach(t => keys.push('tag:' + t));
    keys.push('any');
    return keys;
  }

  function clampSlot(i) { return Math.max(0, Math.min(SLOTS - 1, Math.floor(Number(i) || 0))); }
  function slotOrder(i) {
    i = clampSlot(i);
    const out = [i];
    for (let k = i - 1; k >= 0; k--) out.push(k);
    for (let k = i + 1; k < SLOTS; k++) out.push(k);
    return out;
  }

  /* Knockdown number (1st, 2nd...) to a slot; the fight-ending one is always slot 2. */
  function knockdownSlot(count, final) { return final ? SLOTS - 1 : clampSlot((count || 1) - 1); }

  /* Every path in CutIns is filled in ahead of time, so the art folder can be
   * uploaded half-finished. `missing` (a Set of paths, or a function) lists
   * images the game tried to load and couldn't; those count as blank cells. */
  function isMissing(missing, src) {
    if (!missing) return false;
    return typeof missing === 'function' ? !!missing(src) : missing.has(src);
  }

  /* The lookup itself.
   *   kind  'move' (needs cardId) | 'knockdown' | 'victory'
   *   view  'profile' | 'pov'
   *   slot  0-2 (see the header)
   * Returns { src, fighter, move, view, slot } or null. */
  function resolveCutIn(data, faces, q, missing) {
    const cut = data.cutins || {};
    const keys = q.kind === 'move' ? moveKeys(data, q.cardId) : [q.kind];
    const order = slotOrder(q.slot);
    for (const fighter of faces) {
      const rows = cut[fighter];
      if (!rows) continue;
      for (const k of keys) {
        const row = rows[k];
        if (!row) continue;
        const cells = row[q.view] || [];
        for (const i of order) if (cells[i] && !isMissing(missing, cells[i])) return { src: cells[i], fighter, move: k, view: q.view, slot: i };
      }
    }
    return null;
  }

  /* Every image the next lookups could reach, in the order the lookup tries
   * them, for one face chain and view. The screen loads these before the bell
   * so it already knows which files exist. */
  function candidates(data, faces, view) {
    const out = [];
    const seen = new Set();
    faces.forEach(f => {
      const rows = (data.cutins || {})[f];
      if (!rows) return;
      Object.values(rows).forEach(row => (row[view] || []).forEach(src => {
        if (src && !seen.has(src)) { seen.add(src); out.push(src); }
      }));
    });
    return out;
  }

  /* Result screen. Opponents' win_art / loss_art (ladder) come first, then the
   * winner's Victory art (yours in profile when you win, hers in POV when she
   * wins), then Config default_win_art / default_loss_art. */
  function resultArt(data, r) {
    const o = r.opponent;
    const cfg = data.config || {};
    const m = r.missing;
    if (r.won) {
      if (o && o.winArt && !isMissing(m, o.winArt)) return { src: o.winArt, from: 'win_art' };
      const hit = resolveCutIn(data, r.myFaces || [], { kind: 'victory', view: 'profile', slot: r.winnerKd }, m);
      if (hit) return { src: hit.src, from: 'victory', hit };
      return cfg.default_win_art ? { src: cfg.default_win_art, from: 'default_win_art' } : null;
    }
    if (o && o.lossArt && !isMissing(m, o.lossArt)) return { src: o.lossArt, from: 'loss_art' };
    const hit = resolveCutIn(data, r.theirFaces || [], { kind: 'victory', view: 'pov', slot: r.winnerKd }, m);
    if (hit) return { src: hit.src, from: 'victory', hit };
    return cfg.default_loss_art ? { src: cfg.default_loss_art, from: 'default_loss_art' } : null;
  }

  /* Every image a fight could show for these faces, for preloading. */
  function artFiles(data, faces) {
    const out = new Set();
    faces.forEach(f => {
      const rows = (data.cutins || {})[f];
      if (!rows) return;
      Object.values(rows).forEach(row => ['profile', 'pov'].forEach(v => row[v].forEach(src => { if (src) out.add(src); })));
    });
    return [...out];
  }

  /* ---------- the art plan: every row each face needs ----------
   * Per Owl's decisions: one row per tag, plus its own row for every Finisher
   * and Elite card (upgrades share their base card's row), plus Knockdown and
   * Victory. Styles need profile and POV; ladder opponents only POV; custom
   * fighters use tags only (including Finisher). */
  function baseCard(data, c) {
    const seen = new Set();
    while (c.upgradeOf && data.cards[c.upgradeOf] && !seen.has(c.id)) { seen.add(c.id); c = data.cards[c.upgradeOf]; }
    return c;
  }
  function isSignature(c) { return c.tier === 'Elite' || c.tagKeys.includes('finisher'); }

  function cardsForStyle(data, styleId) {
    const line = new Set(styleChain(data, styleId));
    return data.cardList.filter(c => line.has(c.style) || c.style === 'Neutral');
  }

  function rowsFor(data, cardList, tagsOnly) {
    const tags = new Map(), sig = new Map();
    cardList.forEach(c => {
      if (!tagsOnly && isSignature(c)) {
        const b = baseCard(data, c);
        if (!sig.has(b.id)) sig.set(b.id, { move: b.id, kind: 'card', label: b.name, covers: [] });
        const e = sig.get(b.id);
        if (!e.covers.includes(c.name)) e.covers.push(c.name);
        return;
      }
      const t = c.tagKeys[0];
      if (!t) return;
      if (!tags.has(t)) tags.set(t, { move: c.tags[0], kind: 'tag', tag: t, label: c.tags[0], covers: [] });
      const e = tags.get(t);
      if (!e.covers.includes(c.name)) e.covers.push(c.name);
    });
    if (tagsOnly && !tags.has('finisher')) tags.set('finisher', { move: 'Finisher', kind: 'tag', tag: 'finisher', label: 'Finisher', covers: [] });
    const tagRows = [...tags.values()].sort((a, b) => {
      const ia = TAG_ORDER.indexOf(a.tag), ib = TAG_ORDER.indexOf(b.tag);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const sigRows = [...sig.values()].sort((a, b) => data.cards[a.move].order - data.cards[b.move].order);
    return [...tagRows, ...sigRows,
      { move: 'Knockdown', kind: 'knockdown', label: 'Knockdown', covers: [] },
      { move: 'Victory', kind: 'victory', label: 'Victory', covers: [] }];
  }

  /* ---------- file names ----------
   * art/cutins/<fighter folder>/<move>_<view>_<slot>.<ext>
   * Folders and card rows use readable names (cherry-bomb/encore_pov_0.png).
   * Renaming a fighter or card later breaks nothing: the full path is written
   * into CutIns, and the game only ever reads it from there. */
  const slug = s => String(s).toLowerCase().replace(/["“”'’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  function moveFileSlug(data, row) {
    if (row.kind === 'card') return slug(data.cards[row.move] ? data.cards[row.move].name : row.move).replace(/-/g, '_');
    return slug(row.move).replace(/-/g, '_');
  }
  function assignFolders(plan) {
    const used = new Set();
    plan.forEach(face => {
      let name = slug(face.name);
      if (used.has(name)) name = name + '-' + slug(face.fighter);
      used.add(name);
      face.folder = name;
    });
    return plan;
  }
  function artPath(data, face, row, view, slot, ext) {
    return `art/cutins/${face.folder}/${moveFileSlug(data, row)}_${view}_${slot}.${ext || 'png'}`;
  }

  function artPlan(data) {
    const plan = [];
    data.styleList.forEach(s => plan.push({
      fighter: s.id, name: s.name, kind: 'style', views: ['profile', 'pov'], rows: rowsFor(data, cardsForStyle(data, s.id), false),
    }));
    data.opponents.forEach(o => {
      const st = data.styles[o.style];
      const deck = (o.deck.length ? o.deck : (st ? st.baseDeck : [])).map(id => data.cards[id]).filter(Boolean);
      plan.push({ fighter: o.id, name: o.name, kind: 'opponent', views: ['pov'], rows: rowsFor(data, deck, false) });
    });
    (data.fighterList || []).forEach(f => plan.push({
      fighter: f.id, name: f.name, kind: 'custom', views: ['profile', 'pov'], rows: rowsFor(data, cardsForStyle(data, f.style), true),
    }));
    return assignFolders(plan);
  }

  return { CUTIN_SLOT_COUNT: SLOTS, styleChain, faceChain, moveKeys, slotOrder, knockdownSlot, resolveCutIn, resultArt, artFiles, candidates, artPlan, artPath, slug };
});
