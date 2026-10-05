/* Foxy Fight — sheet data loading, parsing and validation.
 * Works in the browser (attaches to window.CB) and in Node (module.exports).
 * Every tab of the Google Sheet arrives as CSV text; compileData() turns the
 * tabs into one validated game-data object the engine reads. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.CB = Object.assign(root.CB || {}, mod);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TABS = ['Config', 'Styles', 'Cards', 'Statuses', 'Opponents'];
  const STATUS_BEHAVIORS = ['dot', 'damage_taken_up', 'damage_dealt_up', 'energy_down', 'draw_down', 'block_gain_up', 'thorns'];
  const STATUS_DECAYS = ['turn', 'clear', 'consume', 'none'];
  const BENEFICIAL = ['damage_dealt_up', 'block_gain_up', 'thorns'];
  const EFFECT_OPS = {
    dmg: 'Deal damage. dmg:5 or dmg:2x3 (3 hits of 2)',
    pierce: 'Deal damage that ignores block. pierce:4',
    dmgchain: 'Deal N damage per card in the current chain, as one hit. dmgchain:2',
    block: 'Gain block. block:5',
    heal: 'Restore HP (up to max). heal:4',
    draw: 'Draw cards. draw:1',
    energy: 'Gain energy this turn. energy:1',
    apply: 'Give the opponent a status. apply:bleed:2',
    gain: 'Give yourself a status. gain:focus:2',
  };

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    if (text == null) return [];
    text = String(text).replace(/^﻿/, '');
    const rows = [];
    let row = [], field = '', i = 0, inQuotes = false;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const header = rows[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      if (!cells.some(c => String(c).trim() !== '')) continue;          // blank row
      if (String(cells[0] || '').trim().startsWith('#')) continue;      // comment row
      const obj = { _row: r + 1 };
      if (cells.slice(header.length).some(c => String(c).trim() !== '')) obj._extra = true;
      header.forEach((h, idx) => { if (h) obj[h] = String(cells[idx] == null ? '' : cells[idx]).trim(); });
      out.push(obj);
    }
    return out;
  }

  /* ---------- small value parsers ---------- */
  const num = (v, d) => { if (v === '' || v == null) return d; const n = Number(v); return Number.isFinite(n) ? n : d; };
  const bool = (v, d) => { if (v === '' || v == null) return d; return /^(true|yes|y|1)$/i.test(String(v).trim()); };
  const list = v => String(v || '').split(/[,|]/).map(s => s.trim()).filter(Boolean);
  const key = s => String(s).trim().toLowerCase();

  function parseDeckList(str) {
    const ids = [], errors = [];
    list(str).forEach(part => {
      const m = part.match(/^([\w-]+)(?:\s*[x×*]\s*(\d+))?$/i);
      if (!m) { errors.push(`can't read "${part}" (use card_id x2)`); return; }
      const n = m[2] ? parseInt(m[2], 10) : 1;
      for (let k = 0; k < n; k++) ids.push(m[1]);
    });
    return { ids, errors };
  }

  function parseEffects(str, statuses) {
    const effects = [], errors = [];
    String(str || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean).forEach(part => {
      const bits = part.split(':').map(s => s.trim());
      const op = key(bits[0]);
      if (!EFFECT_OPS[op]) { errors.push(`unknown effect "${bits[0]}"`); return; }
      if (op === 'apply' || op === 'gain') {
        const status = key(bits[1] || '');
        const n = num(bits[2], 1);
        if (statuses && !statuses[status]) errors.push(`unknown status "${bits[1]}" in "${part}"`);
        effects.push({ op, status, n });
        return;
      }
      if (op === 'dmg') {
        const m = String(bits[1] || '').match(/^(\d+)\s*(?:[x×*]\s*(\d+))?$/i);
        if (!m) { errors.push(`can't read "${part}" (use dmg:5 or dmg:2x3)`); return; }
        effects.push({ op, n: +m[1], hits: m[2] ? +m[2] : 1 });
        return;
      }
      const n = Number(bits[1]);
      if (!Number.isFinite(n)) { errors.push(`"${part}" needs a number`); return; }
      effects.push({ op, n });
    });
    return { effects, errors };
  }

  function describeEffects(effects, data) {
    return effects.map(e => {
      const sName = e.status && data && data.statuses[e.status] ? data.statuses[e.status].name : e.status;
      switch (e.op) {
        case 'dmg': return e.hits > 1 ? `Deal ${e.n} damage ${e.hits} times.` : `Deal ${e.n} damage.`;
        case 'pierce': return `Deal ${e.n} piercing damage.`;
        case 'dmgchain': return `Deal ${e.n} damage per card in the chain.`;
        case 'block': return `Gain ${e.n} block.`;
        case 'heal': return `Heal ${e.n}.`;
        case 'draw': return `Draw ${e.n}.`;
        case 'energy': return `Gain ${e.n} energy.`;
        case 'apply': return `Apply ${e.n} ${sName}.`;
        case 'gain': return `Gain ${e.n} ${sName}.`;
      }
      return '';
    }).join(' ');
  }

  /* ---------- compile ---------- */
  function compileData(tables, meta) {
    const errors = [], warnings = [];
    const T = {};
    TABS.forEach(t => {
      const raw = tables[t];
      if (raw == null) { errors.push(`Missing tab "${t}".`); T[t] = []; return; }
      T[t] = Array.isArray(raw) ? raw : rowsToObjects(parseCSV(raw));
    });

    TABS.forEach(t => T[t].forEach(r => {
      if (r._extra) warnings.push(`${t} row ${r._row} has more cells than column headers. A value containing a comma probably needs quotes.`);
    }));

    // Config
    const config = {};
    T.Config.forEach(r => {
      if (!r.key) return;
      const v = r.value;
      config[key(r.key)] = /^(true|false)$/i.test(v) ? bool(v) : (Number.isFinite(Number(v)) && v !== '' ? Number(v) : v);
    });
    const defaults = {
      hand_size: 5, energy_per_turn: 3, first_turn_energy_penalty: 1, first_turn_draw_penalty: 0, discard_hand_end_of_turn: true,
      block_resets_each_turn: true, combo_damage_per_link: 1, combo_damage_cap: 4, turn_limit: 30,
      deck_min: 12, deck_max: 20, max_copies: 3, xp_on_loss: 5, replay_xp_multiplier: 0.5, starting_xp: 0,
      ai_threat_estimate: 10, max_cards_per_turn: 10, default_win_art: '', default_loss_art: '',
      exchanges_per_round: 3, rounds: 3, corner_heal_percent: 10, corner_clears_statuses: 2, corner_reshuffle: true,
      pvp_turn_seconds: 90, pvp_disconnect_seconds: 60, pvp_xp_win: 10, pvp_xp_loss: 5,
      alternate_round_start: true, knockdowns_for_tko: 3, knockdown_recover_percent: 15, knockdown_clears_statuses: true,
    };
    Object.keys(defaults).forEach(k => { if (config[k] === undefined) config[k] = defaults[k]; });

    // Statuses
    const statuses = {};
    T.Statuses.forEach(r => {
      const id = key(r.id || '');
      if (!id) return;
      if (statuses[id]) errors.push(`Statuses row ${r._row}: duplicate id "${id}".`);
      const behavior = key(r.behavior || '');
      const decay = key(r.decay || 'turn');
      if (!STATUS_BEHAVIORS.includes(behavior)) errors.push(`Statuses row ${r._row} (${id}): behavior must be one of ${STATUS_BEHAVIORS.join(', ')}.`);
      if (!STATUS_DECAYS.includes(decay)) errors.push(`Statuses row ${r._row} (${id}): decay must be one of ${STATUS_DECAYS.join(', ')}.`);
      statuses[id] = {
        id, name: r.name || id, behavior, decay, aiValue: num(r.ai_value, 1),
        color: r.color || '#cccccc', description: r.description || '', beneficial: BENEFICIAL.includes(behavior),
      };
    });

    // Cards
    const cards = {}, cardList = [];
    T.Cards.forEach(r => {
      const id = (r.id || '').trim();
      if (!id) return;
      if (cards[id]) errors.push(`Cards row ${r._row}: duplicate id "${id}".`);
      const fx = parseEffects(r.effects, statuses);
      const lb = parseEffects(r.link_bonus, statuses);
      fx.errors.forEach(e => errors.push(`Cards row ${r._row} (${id}) effects: ${e}.`));
      lb.errors.forEach(e => errors.push(`Cards row ${r._row} (${id}) link_bonus: ${e}.`));
      const tags = list(r.tags);
      const follows = list(r.follows);
      if (!tags.length) warnings.push(`Card ${id} has no tags, so nothing can link after it.`);
      if (!follows.length) warnings.push(`Card ${id} has an empty "follows", so it can never link.`);
      const c = {
        id, name: r.name || id, style: r.style || 'Neutral', tier: r.tier || 'Base',
        tags, tagKeys: tags.map(key), follows, followKeys: follows.map(key),
        cost: num(r.cost, 0), effects: fx.effects, linkBonus: lb.effects,
        text: r.text || '', xpPrice: num(r.xp_price, 0), upgradeOf: r.upgrade_of || '',
        maxCopies: num(r.max_copies, 0), art: r.art || '', flavor: r.flavor || '', order: cardList.length,
      };
      cards[id] = c; cardList.push(c);
    });

    // Styles
    const styles = {}, styleList = [];
    T.Styles.forEach(r => {
      const id = (r.id || '').trim();
      if (!id) return;
      if (styles[id]) errors.push(`Styles row ${r._row}: duplicate id "${id}".`);
      const ts = parseEffects(r.on_turn_start, statuses);
      const ol = parseEffects(r.on_link, statuses);
      ts.errors.forEach(e => errors.push(`Styles row ${r._row} (${id}) on_turn_start: ${e}.`));
      ol.errors.forEach(e => errors.push(`Styles row ${r._row} (${id}) on_link: ${e}.`));
      const deck = parseDeckList(r.base_deck);
      deck.errors.forEach(e => errors.push(`Styles row ${r._row} (${id}) base_deck: ${e}.`));
      const s = {
        id, name: r.name || id, root: r.root || id, description: r.description || '',
        hp: num(r.hp, 40), energy: num(r.energy, null), handSize: num(r.hand_size, null),
        onTurnStart: ts.effects, onLink: ol.effects, baseDeck: deck.ids,
        evolvesTo: r.evolves_to || '', evolveXp: num(r.evolve_xp, 0), evolveRequires: r.evolve_requires || '',
        color: r.color || '#c9c3ef', art: r.art || '',
      };
      styles[id] = s; styleList.push(s);
    });

    // Opponents
    const opponents = [];
    T.Opponents.forEach(r => {
      const id = (r.id || '').trim();
      if (!id) return;
      const deck = parseDeckList(r.deck);
      deck.errors.forEach(e => errors.push(`Opponents row ${r._row} (${id}) deck: ${e}.`));
      opponents.push({
        id, order: num(r.order, opponents.length + 1), name: r.name || id, title: r.title || '',
        style: r.style || '', deck: deck.ids, hpBonus: num(r.hp_bonus, 0),
        aggression: num(r.aggression, 1), caution: num(r.caution, 1), xpReward: num(r.xp_reward, 20),
        color: r.color || '', art: r.art || '', intro: r.intro || '',
        winArt: r.win_art || '', lossArt: r.loss_art || '',
        rounds: num(r.rounds, 0),
      });
    });
    opponents.sort((a, b) => a.order - b.order);

    // Cross-reference validation
    const allTags = new Set();
    cardList.forEach(c => c.tagKeys.forEach(t => allTags.add(t)));
    cardList.forEach(c => {
      if (c.style !== 'Neutral' && !styles[c.style]) errors.push(`Card ${c.id}: style "${c.style}" is not in the Styles tab (use Neutral for shared cards).`);
      if (c.upgradeOf && !cards[c.upgradeOf]) errors.push(`Card ${c.id}: upgrade_of "${c.upgradeOf}" doesn't exist.`);
      c.followKeys.forEach(f => {
        if (f !== 'start' && f !== 'any' && !allTags.has(f)) warnings.push(`Card ${c.id} follows "${f}", but no card has that tag.`);
      });
    });
    const checkDeck = (ids, where) => ids.forEach(id => { if (!cards[id]) errors.push(`${where}: card "${id}" doesn't exist.`); });
    styleList.forEach(s => {
      checkDeck(s.baseDeck, `Style ${s.id} base_deck`);
      if (s.evolvesTo && !styles[s.evolvesTo]) errors.push(`Style ${s.id}: evolves_to "${s.evolvesTo}" doesn't exist.`);
      if (!styles[s.root]) errors.push(`Style ${s.id}: root "${s.root}" doesn't exist.`);
      if (s.evolveRequires && !opponents.find(o => o.id === s.evolveRequires)) errors.push(`Style ${s.id}: evolve_requires "${s.evolveRequires}" is not an opponent id.`);
      if (s.baseDeck.length < config.deck_min) warnings.push(`Style ${s.id}: base deck has ${s.baseDeck.length} cards, below deck_min ${config.deck_min}.`);
    });
    opponents.forEach(o => {
      if (!styles[o.style]) errors.push(`Opponent ${o.id}: style "${o.style}" doesn't exist.`);
      checkDeck(o.deck, `Opponent ${o.id} deck`);
    });
    if (!styleList.length) errors.push('The Styles tab has no styles.');
    if (!cardList.length) errors.push('The Cards tab has no cards.');

    // Card text: use the sheet's text if given, otherwise generate from effects.
    const data = { config, statuses, statusList: Object.values(statuses), cards, cardList, styles, styleList, opponents, meta: meta || {} };
    cardList.forEach(c => {
      c.autoText = describeEffects(c.effects, data);
      c.linkText = describeEffects(c.linkBonus, data);
      c.displayText = c.text || c.autoText;
    });
    styleList.forEach(s => {
      s.passiveText = [
        s.onTurnStart.length ? `Turn start: ${describeEffects(s.onTurnStart, data)}` : '',
        s.onLink.length ? `On every link: ${describeEffects(s.onLink, data)}` : '',
      ].filter(Boolean).join(' ');
    });
    return { data, errors, warnings };
  }

  /* ---------- Google Sheets ---------- */
  function extractSheetId(input) {
    const s = String(input || '').trim();
    const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : s;
  }
  function sheetCsvUrl(sheetId, tab) {
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
  }
  async function fetchSheetTables(sheetIdOrUrl, fetchFn) {
    const f = fetchFn || fetch;
    const id = extractSheetId(sheetIdOrUrl);
    const tables = {};
    await Promise.all(TABS.map(async tab => {
      const res = await f(sheetCsvUrl(id, tab));
      if (!res.ok) throw new Error(`Couldn't read the "${tab}" tab (HTTP ${res.status}). Is the sheet shared as "Anyone with the link can view"?`);
      const text = await res.text();
      if (/^\s*</.test(text)) throw new Error(`The "${tab}" tab came back as a web page, not data. Check the sheet is shared publicly and the tab name is exactly "${tab}".`);
      tables[tab] = text;
    }));
    return tables;
  }

  return {
    TABS, EFFECT_OPS, STATUS_BEHAVIORS, STATUS_DECAYS,
    parseCSV, rowsToObjects, parseEffects, parseDeckList, describeEffects, compileData,
    extractSheetId, sheetCsvUrl, fetchSheetTables,
  };
});
