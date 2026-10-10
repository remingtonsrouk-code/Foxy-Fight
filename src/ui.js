/* Foxy Fight — the GUI. Plain DOM, no framework.
 * Screens: select (pick a fighter), ladder, shop, deck, style, settings, battle. */
(function () {
  'use strict';
  const CB = window.CB;
  const esc = CB.esc;
  const root = document.getElementById('app');

  /* ---------- storage (always guarded) ---------- */
  const KEYS = { save: 'chainbloom.save.v1', data: 'chainbloom.data.v1', sheet: 'chainbloom.sheet.v1' };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  /* ---------- app state ---------- */
  const app = {
    data: null, rawTables: null, dataInfo: { source: '', errors: [], warnings: [], at: null },
    save: null, view: 'select', battle: null, shopFilter: 'all', settingsReport: null, sheetInput: store.get(KEYS.sheet) || '',
  };

  /* A sheet without the optional CutIns / Fighters tabs uses the built-in copy,
   * so the art paths shipped with the game work with any sheet. The raw tables
   * are kept unfilled, so a later game update's paths are picked up too. */
  const withBuiltInTabs = tables => CB.fillOptionalTabs(tables, window.CB_BAKED_TABLES);

  function loadData() {
    const baked = window.CB_BAKED_TABLES;
    const cachedRaw = store.get(KEYS.data);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        const r = CB.compileData(withBuiltInTabs(cached.tables), { source: cached.source });
        if (!r.errors.length) {
          app.data = r.data; app.rawTables = cached.tables;
          app.dataInfo = { source: cached.source, errors: [], warnings: r.warnings, at: cached.at };
          return;
        }
      } catch (e) { /* fall back to built-in data */ }
    }
    const r = CB.compileData(baked, { source: 'Built-in sample data' });
    app.data = r.data; app.rawTables = { ...baked };
    app.dataInfo = { source: 'Built-in sample data', errors: r.errors, warnings: r.warnings, at: null };
  }

  function loadSave() {
    const raw = store.get(KEYS.save);
    try { app.save = raw ? JSON.parse(raw) : CB.newSave(); } catch (e) { app.save = CB.newSave(); }
    if (!app.save.characters) app.save = CB.newSave();
    if (app.save.activeRoot && !app.data.styles[app.save.activeRoot]) app.save.activeRoot = null;
    app.view = app.save.activeRoot ? 'ladder' : 'select';
  }
  function persist() { store.set(KEYS.save, JSON.stringify(app.save)); }
  function char() { return app.save.activeRoot ? CB.getCharacter(app.save, app.data, app.save.activeRoot) : null; }

  /* ---------- small helpers ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let toastTimer;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
  }
  function styleColor(styleId) { const s = app.data.styles[styleId]; return s ? s.color : '#5b3a52'; }
  function tagClass(card) { return 'tag-' + (card.tagKeys[0] || 'none'); }
  function emblem(id, name, color, art, size) {
    const svg = CB.emblemSVG(id, name, color, size);
    if (!art) return svg;
    return `<span style="position:relative;display:block;width:${size}px;height:${size}px">${svg}<img src="${esc(CB.artSrc(art))}" alt="" style="position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover" onerror="this.remove()"></span>`;
  }
  function followsText(card) {
    return card.follows.map(f => f.toUpperCase() === 'START' ? 'Start of turn' : (f.toUpperCase() === 'ANY' ? 'Anything' : f)).join(' · ');
  }

  function cardHTML(card, opts) {
    opts = opts || {};
    const art = card.art
      ? `${CB.cardArtSVG(card, styleColor(card.style))}<img src="${esc(CB.artSrc(card.art))}" alt="" loading="lazy" onerror="this.remove()">`
      : CB.cardArtSVG(card, styleColor(card.style));
    const tierChip = card.tier && card.tier !== 'Base' ? `<span class="chip tier">${esc(card.tier)}</span>` : '';
    const tags = card.tags.map(t => `<span class="chip tag-chip tag-${esc(t.toLowerCase())}">${esc(t)}</span>`).join(' ');
    const link = card.linkBonus.length ? `<div class="link"><b>Link</b>${esc(card.linkText)}</div>` : '';
    const tagName = opts.tag || 'div';
    const attrs = opts.attrs || '';
    return `<${tagName} class="card ${tagClass(card)} ${opts.cls || ''}" ${attrs}>
      <div class="art">${art}<span class="cost" title="Energy cost">${card.cost}</span>${tierChip ? `<span class="tier">${tierChip}</span>` : ''}</div>
      <div class="body">
        <div class="name">${esc(card.name)}</div>
        <div class="row" style="gap:4px">${tags}</div>
        <div class="text">${esc(card.displayText)}</div>
        ${link}
        ${card.flavor && !opts.noFlavor ? `<div class="flavor">${esc(card.flavor)}</div>` : ''}
        <div class="follows">Follows <strong>${esc(followsText(card))}</strong></div>
      </div>
      ${opts.key ? `<span class="key">${esc(opts.key)}</span>` : ''}
    </${tagName}>`;
  }

  /* ---------- top bar ---------- */
  function topbar() {
    const ch = app.battle && app.battle.pvp ? null : char();
    const inBattle = app.view === 'battle';
    const nav = ch && !inBattle ? `<nav class="nav" aria-label="Main">
      ${[['ladder', 'Ladder'], ['shop', 'Shop'], ['deck', 'Deck'], ['style', 'Style'], ['versus', 'Versus'], ['settings', 'Sheet & saves']].map(([v, l]) =>
        `<button data-act="go" data-view="${v}" ${app.view === v ? 'aria-current="page"' : ''}>${l}</button>`).join('')}
    </nav>` : `<div class="nav"></div>`;
    const who = ch ? `<div class="who">
        <button class="style-chip" data-act="go" data-view="select" ${inBattle ? 'disabled' : ''} title="Switch fighter">
          ${CB.emblemSVG(ch.styleId, app.data.styles[ch.styleId].name, styleColor(ch.styleId), 26)}${esc(app.data.styles[ch.styleId].name)}
        </button>
        <span class="xp-pill num" title="Experience to spend">${ch.xp} XP</span>
      </div>` : (inBattle ? '' : `<div class="row">${app.view !== 'versus' ? `<button class="btn soft small" data-act="go" data-view="versus">Versus</button>` : ''}${app.view !== 'settings' ? `<button class="btn soft small" data-act="go" data-view="settings">Sheet & saves</button>` : ''}${app.view !== 'select' ? `<button class="btn soft small" data-act="go" data-view="select">Fighters</button>` : ''}</div>`);
    return `<header class="topbar"><div class="brand">${CB.brandSVG()}<span class="brand-name">Foxy Fight</span></div>${nav}${who}</header>`;
  }

  /* ---------- views ---------- */
  function viewSelect() {
    const d = app.data;
    const roots = d.styleList.filter(s => s.root === s.id);
    const fighters = roots.map(s => {
      const existing = app.save.characters[s.id];
      const ch = existing ? CB.getCharacter(app.save, d, s.id) : null;
      const cur = ch ? d.styles[ch.styleId] : s;
      const energy = cur.energy != null ? cur.energy : d.config.energy_per_turn;
      const hand = cur.handSize != null ? cur.handSize : d.config.hand_size;
      const progress = ch ? `<p class="muted" style="font-size:.85rem">${ch.wins} wins · ${ch.xp} XP banked${ch.styleId !== s.id ? ` · evolved into <b>${esc(cur.name)}</b>` : ''}</p>` : '';
      return `<article class="panel fighter-card">
        ${emblem(cur.id, cur.name, cur.color, cur.art, 96)}
        <div class="stack" style="gap:8px;min-width:0">
          <h2>${esc(cur.name)}</h2>
          <p style="color:var(--ink-2)">${esc(cur.description)}</p>
          <div class="meta"><span><b class="num">${cur.hp}</b> HP</span><span><b class="num">${energy}</b> energy</span><span><b class="num">${hand}</b> cards a turn</span><span><b class="num">${cur.baseDeck.length}</b>-card deck</span></div>
          ${cur.passiveText ? `<p style="font-size:.85rem"><span class="chip">Passive</span> ${esc(cur.passiveText)}</p>` : ''}
          ${progress}
          <div><button class="btn" data-act="pick" data-root="${esc(s.id)}">${ch ? 'Continue' : 'Choose'} ${esc(cur.name)}</button></div>
        </div>
      </article>`;
    }).join('');
    return `<section class="hero-select">
      <div class="stack" style="gap:10px">
        <span class="eyebrow">Fight night · a turn-based card fighter</span>
        <h1>Pick your fighter. Build her deck one card at a time.</h1>
        <p class="lede">Win bouts on the ladder to earn XP, then spend it on new moves, sharper versions of your basics, and eventually a new act with top billing. Nothing is random: you pick every card.</p>
      </div>
      <div class="fighters">${fighters}</div>
      ${howToPlay()}
    </section>`;
  }

  function howToPlay() {
    const d = app.data;
    const ex = ['Opener', 'Light', 'Heavy', 'Finisher'];
    return `<div class="panel">
      <h2 style="margin-bottom:10px">How chains work</h2>
      <div class="how">
        <div class="step"><h3>Every card has a tag</h3>Opener, Light, Heavy, Finisher, Guard or Wild. The tag says what kind of move it is.</div>
        <div class="step"><h3>…and a list it follows</h3>A card <b>links</b> when the card before it this turn has a tag on its "Follows" list. Openers link when played first.</div>
        <div class="step"><h3>Links pay off</h3>A linked card adds its <b>Link</b> bonus, and attacks deal +1 damage for every ${d.config.combo_damage_per_link < 1 ? Math.round(1 / d.config.combo_damage_per_link) + ' links' : 'link'} already in the chain (up to +${d.config.combo_damage_cap}).</div>
        ${d.config.exchanges_per_round > 0 ? `<div class="step"><h3>Rounds and the cards</h3>Fights are ${d.config.rounds} rounds of ${d.config.exchanges_per_round} exchanges. Hitting 0 HP is a knockdown; ${d.config.knockdowns_for_tko > 1 ? `the ${d.config.knockdowns_for_tko === 3 ? 'third' : 'last'} one is a T.K.O.` : 'it ends the fight.'} If both fighters last, three judges decide.</div>` : ''}
        <div class="step"><h3>Energy is the limit</h3>You get ${d.config.energy_per_turn} energy a turn (some styles get more). Block lasts until your next turn. Unplayed cards are discarded.</div>
      </div>
      <div class="chain-demo" aria-label="Example chain">${ex.map((t, i) => `<span class="chip tag-chip tag-${t.toLowerCase()}">${t}</span>${i < ex.length - 1 ? '<span class="arrow">→</span>' : ''}`).join('')}<span class="muted" style="font-size:.85rem;margin-left:6px">a typical four-card chain</span></div>
    </div>`;
  }

  function viewLadder() {
    const d = app.data, ch = char();
    const rungs = CB.ladderStatus(d, ch);
    const nextIdx = rungs.findIndex(r => r.unlocked && !r.beaten);
    const evo = CB.evolveInfo(d, ch);
    const evoNote = evo && evo.canEvolve ? `<div class="panel row" style="justify-content:space-between"><p><b>${esc(evo.to.name)}</b> is ready. Evolving costs ${evo.cost} XP.</p><button class="btn lav small" data-act="go" data-view="style">See evolution</button></div>` : '';
    return `<section class="stack" style="gap:16px">
      <div class="section-head"><div><span class="eyebrow">${ch.wins} wins · ${ch.losses} losses</span><h1>Ladder</h1></div>
        <p class="muted" style="max-width:46ch">Beat each fighter to unlock the next. Rematches pay ${Math.round(d.config.replay_xp_multiplier * 100)}% XP. A loss still pays ${d.config.xp_on_loss} XP.</p></div>
      ${evoNote}
      <div class="ladder">
        ${rungs.map((r, i) => {
          const o = r.opp, st = d.styles[o.style];
          const state = r.beaten ? 'beaten' : (i === nextIdx ? 'next' : (r.unlocked ? 'next' : 'locked'));
          const label = r.beaten ? 'Beaten' : (r.unlocked ? 'Up next' : 'Locked');
          const xp = CB.xpFor(d, ch, o, true);
          return `<article class="rung ${!r.unlocked ? 'locked' : ''} ${i === nextIdx ? 'next' : ''}">
            <span class="order num">${o.order}</span>
            ${emblem(o.id, o.name, o.color || st.color, o.art, 64)}
            <div class="info">
              <div class="row" style="gap:8px"><h2>${esc(o.name)}</h2><span class="muted" style="font-size:.85rem">${esc(o.title)}</span></div>
              <div class="row" style="gap:6px;margin-top:4px"><span class="chip style-tag"><i style="background:${esc(st.color)}"></i>Fights ${esc(st.name)} style</span><span class="chip num">${st.hp + o.hpBonus} HP</span></div>
              ${o.intro ? `<p class="quote">“${esc(o.intro)}”</p>` : ''}
            </div>
            <div class="side">
              <span class="chip state-chip ${state}">${label}</span>
              <span class="num" style="font-weight:700">+${xp} XP</span>
              <button class="btn small" data-act="fight" data-opp="${esc(o.id)}" ${r.unlocked ? '' : 'disabled'}>${r.beaten ? 'Rematch' : 'Fight'}</button>
            </div>
          </article>`;
        }).join('')}
      </div>
    </section>`;
  }

  function viewShop() {
    const d = app.data, ch = char();
    let items = CB.shopFor(d, ch);
    const f = app.shopFilter;
    if (f === 'upgrades') items = items.filter(i => i.isUpgrade);
    if (f === 'new') items = items.filter(i => !i.isUpgrade && i.card.tier !== 'Base');
    if (f === 'base') items = items.filter(i => i.card.tier === 'Base');
    if (f === 'affordable') items = items.filter(i => i.canBuy);
    const btn = (k, l) => `<button data-act="shop-filter" data-f="${k}" aria-pressed="${f === k}">${l}</button>`;
    return `<section class="stack" style="gap:16px">
      <div class="section-head"><div><span class="eyebrow">Spend XP · ${ch.xp} available</span><h1>Shop</h1></div>
        <div class="filters">${btn('all', 'All')}${btn('upgrades', 'Upgrades')}${btn('new', 'New cards')}${btn('base', 'Extra basics')}${btn('affordable', 'Can buy now')}</div></div>
      <p class="muted">Upgrades replace one copy of the basic card in your collection and deck. New cards go into your deck while it has room.</p>
      <div class="shop-grid">
        ${items.map(i => {
          const c = i.card;
          const note = i.isUpgrade
            ? `<div class="upgrade-note">Upgrades <b>${esc(d.cards[c.upgradeOf].name)}</b> · you own ${i.baseOwned || 0}</div>`
            : `<div class="upgrade-note">Owned ${i.owned}${i.limit ? ` of ${i.limit}` : ''}</div>`;
          return `<div class="shop-item ${i.locked ? 'locked' : ''}">
            ${cardHTML(c, {})}
            ${note}
            <div class="buy-row"><span>${esc(i.reason)}</span>
              <button class="btn small ${i.canBuy ? '' : 'soft'}" data-act="buy" data-card="${esc(c.id)}" ${i.canBuy ? '' : 'disabled'}><span class="num">${i.price}</span> XP</button></div>
          </div>`;
        }).join('') || '<p class="muted">Nothing here with this filter.</p>'}
      </div>
    </section>`;
  }

  function viewDeck() {
    const d = app.data, ch = char();
    const size = CB.deckSize(ch);
    const problems = CB.deckProblems(d, ch);
    const ownedIds = Object.keys(ch.owned).sort((a, b) => {
      const ca = d.cards[a], cb = d.cards[b];
      return (ca.cost - cb.cost) || (ca.order - cb.order);
    });
    const rows = ownedIds.map(id => {
      const c = d.cards[id], n = ch.deck[id] || 0, own = ch.owned[id];
      return `<div class="deck-row ${tagClass(c)}">
        <span class="c num" title="Energy cost">${c.cost}</span>
        <div style="min-width:0"><div class="nm">${esc(c.name)} <span class="chip tag-chip ${tagClass(c)}" style="margin-left:4px">${esc(c.tags.join(' / '))}</span></div>
          <div class="tx">${esc(c.displayText)}${c.linkBonus.length ? ` <b style="color:var(--lav-ink)">Link:</b> ${esc(c.linkText)}` : ''} <span class="muted">· follows ${esc(followsText(c))}</span></div></div>
        <div class="stepper" role="group" aria-label="Copies of ${esc(c.name)} in deck">
          <button data-act="deck" data-card="${esc(id)}" data-d="-1" ${n <= 0 ? 'disabled' : ''} aria-label="Remove one">−</button>
          <span class="num">${n} / ${own}</span>
          <button data-act="deck" data-card="${esc(id)}" data-d="1" ${n >= own || size >= d.config.deck_max ? 'disabled' : ''} aria-label="Add one">+</button>
        </div>
      </div>`;
    }).join('');
    // summary
    const ids = CB.deckIds(ch);
    const tagCount = {};
    let costSum = 0, openers = 0;
    ids.forEach(id => {
      const c = d.cards[id]; costSum += c.cost;
      if (c.followKeys.includes('start')) openers++;
      c.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
    });
    const avgCost = ids.length ? (costSum / ids.length).toFixed(2) : '0';
    const pct = Math.min(100, (size / d.config.deck_max) * 100);
    return `<section class="stack" style="gap:16px">
      <div class="section-head"><div><span class="eyebrow">${esc(d.styles[ch.styleId].name)}</span><h1>Deck</h1></div>
        <p class="muted" style="max-width:48ch">Choose how many of each owned card to bring. Decks hold ${d.config.deck_min}–${d.config.deck_max} cards.</p></div>
      <div class="deck-layout">
        <div class="panel stack"><h2>Your collection</h2><div class="deck-list">${rows}</div></div>
        <div class="panel stack" style="position:sticky;top:84px">
          <h2>Deck at a glance</h2>
          <div><div class="row" style="justify-content:space-between"><span class="num"><b>${size}</b> cards</span><span class="muted num">${d.config.deck_min}–${d.config.deck_max}</span></div>
            <div class="meter" style="margin-top:6px"><i style="width:${pct}%"></i></div></div>
          ${problems.map(p => `<p class="warn">${esc(p)}</p>`).join('')}
          <div class="stats">
            <div class="stat"><span class="eyebrow">Avg cost</span><b class="num">${avgCost}</b></div>
            <div class="stat"><span class="eyebrow">Chain starters</span><b class="num">${openers}</b></div>
          </div>
          <div><span class="eyebrow">Tag mix</span><div class="tag-mix" style="margin-top:6px">${Object.entries(tagCount).map(([t, n]) => `<span class="chip tag-chip tag-${esc(t.toLowerCase())}">${esc(t)} ×${n}</span>`).join('')}</div></div>
          <p class="muted" style="font-size:.85rem">Chain starters are cards that link when played first. With fewer than about one per hand, many turns will start unlinked.</p>
        </div>
      </div>
    </section>`;
  }

  function viewStyle() {
    const d = app.data, ch = char();
    const cur = d.styles[ch.styleId];
    const info = CB.evolveInfo(d, ch);
    const styleBlock = s => `<div class="panel">
      ${emblem(s.id, s.name, s.color, s.art, 84)}
      <h2>${esc(s.name)}</h2><p style="color:var(--ink-2)">${esc(s.description)}</p>
      <div class="row" style="gap:6px"><span class="chip num">${s.hp} HP</span><span class="chip num">${s.energy != null ? s.energy : d.config.energy_per_turn} energy</span><span class="chip num">${s.handSize != null ? s.handSize : d.config.hand_size} cards a turn</span></div>
      ${s.passiveText ? `<p style="font-size:.88rem"><span class="chip">Passive</span> ${esc(s.passiveText)}</p>` : ''}
      ${s.id !== cur.id ? `<p class="muted" style="font-size:.85rem">Unlocks ${d.cardList.filter(c => c.style === s.id).length} new cards in the shop.</p>` : ''}
    </div>`;
    const evo = info ? `<div class="evo">${styleBlock(cur)}<span class="arrow" aria-hidden="true">→</span>${styleBlock(info.to)}</div>
      <div class="panel row" style="justify-content:space-between">
        <div><p><b>Evolve for ${info.cost} XP</b>${info.requires ? ` · requires beating ${esc(info.requires.name)}` : ''}</p>
        <p class="muted" style="font-size:.88rem">Your collection and deck carry over. ${info.reason ? esc(info.reason) + '.' : 'Ready when you are.'}</p></div>
        <button class="btn lav" data-act="evolve" ${info.canEvolve ? '' : 'disabled'}>Evolve to ${esc(info.to.name)}</button>
      </div>` : `<div class="evo" style="grid-template-columns:1fr">${styleBlock(cur)}</div><p class="muted">This style is fully evolved.</p>`;
    return `<section class="stack" style="gap:16px">
      <div class="section-head"><div><span class="eyebrow">Style</span><h1>${esc(cur.name)}</h1></div></div>
      ${evo}
      <div class="stats">
        <div class="stat"><span class="eyebrow">Wins</span><b class="num">${ch.wins}</b></div>
        <div class="stat"><span class="eyebrow">Losses</span><b class="num">${ch.losses}</b></div>
        <div class="stat"><span class="eyebrow">XP earned</span><b class="num">${ch.totalXp}</b></div>
        <div class="stat"><span class="eyebrow">Cards owned</span><b class="num">${Object.values(ch.owned).reduce((a, b) => a + b, 0)}</b></div>
      </div>
    </section>`;
  }

  function viewSettings() {
    const d = app.data, info = app.dataInfo, rep = app.settingsReport;
    const reportHTML = r => r ? `<div class="report">
        ${r.ok ? `<p class="ok-line">${esc(r.ok)}</p>` : ''}
        ${r.errors.map(e => `<div class="err">✕ ${esc(e)}</div>`).join('')}
        ${r.warnings.map(e => `<div class="wrn">• ${esc(e)}</div>`).join('')}
      </div>` : '';
    const effRows = Object.entries(CB.EFFECT_OPS).map(([k, v]) => `<tr><td><code>${k}</code></td><td>${esc(v)}</td></tr>`).join('');
    const stRows = d.statusList.map(s => `<tr><td><code>${esc(s.id)}</code></td><td>${esc(s.name)}</td><td>${esc(s.description)}</td></tr>`).join('');
    const ch = char();
    return `<section class="stack" style="gap:16px">
      <div class="section-head"><div><span class="eyebrow">Tuning</span><h1>Sheet & saves</h1></div></div>
      <div class="settings">
        <div class="panel stack">
          <h2>Game data</h2>
          <p class="muted" style="font-size:.88rem">Currently using <b>${esc(info.source)}</b>${info.at ? `, synced ${esc(new Date(info.at).toLocaleString())}` : ''}. ${d.cardList.length} cards, ${d.styleList.length} styles, ${d.opponents.length} opponents.</p>
          <div class="field"><label for="sheet-url">Google Sheet link or ID</label>
            <input id="sheet-url" type="text" placeholder="https://docs.google.com/spreadsheets/d/…" value="${esc(app.sheetInput)}"></div>
          <div class="row"><button class="btn" data-act="sync">Sync from sheet</button>
            <label class="btn soft" for="csv-files" style="cursor:pointer">Load CSV files</label>
            <input id="csv-files" type="file" accept=".csv,text/csv" multiple hidden>
            <button class="btn danger small" data-act="reset-data">Use built-in data</button></div>
          ${reportHTML(rep)}
          ${!rep && info.warnings.length ? reportHTML({ errors: [], warnings: info.warnings }) : ''}
          <details><summary style="cursor:pointer;font-weight:700">Setting up your sheet</summary>
            <ol class="steps" style="margin-top:10px">
              <li>Import the template workbook into Google Sheets (File › Import › Upload). Keep the tab names: ${CB.REQUIRED_TABS.map(t => `<code>${t}</code>`).join(', ')}. ${CB.OPTIONAL_TABS.map(t => `<code>${t}</code>`).join(' and ')} are optional; without them the game uses its built-in copy.</li>
              <li>Share › General access › <b>Anyone with the link</b> › Viewer.</li>
              <li>Paste the sheet's link above and press <b>Sync from sheet</b>. Errors are listed here and nothing changes until the data is valid.</li>
              <li>Pages hosted inside Claude can't reach Google. Use the downloaded game folder (open <code>index.html</code>) or host it on GitHub Pages or itch.io for live syncing. Here, export each tab as CSV and use <b>Load CSV files</b>.</li>
            </ol></details>
        </div>
        <div class="panel stack">
          <h2>Progress</h2>
          <p class="muted" style="font-size:.88rem">Progress saves in this browser automatically. Copy a save code to move it to another device or keep a backup.</p>
          <div class="field"><label for="save-code">Save code</label><textarea id="save-code" spellcheck="false" placeholder="Press Copy save code, or paste a code here to load it"></textarea></div>
          <div class="row"><button class="btn soft" data-act="export">Copy save code</button><button class="btn soft" data-act="import">Load this code</button>
            <button class="btn danger small" data-act="reset-save">${app.confirmReset ? 'Press again to erase all progress' : 'Erase progress'}</button></div>
          ${ch ? '' : '<p class="muted" style="font-size:.85rem">No fighter chosen yet.</p>'}
        </div>
        ${cutinPanel()}
      </div>
      <div class="panel stack ref">
        <h2>Sheet reference</h2>
        <p class="muted" style="font-size:.88rem">Effects go in a card's <code>effects</code> and <code>link_bonus</code> columns, and a style's <code>on_turn_start</code> and <code>on_link</code>. Separate several with <code>;</code> e.g. <code>dmg:4; apply:bleed:1</code>. In <code>follows</code>, <code>START</code> means "first card of the turn" and <code>ANY</code> means "after any card". A card tagged <code>Wild</code> lets any card link after it.</p>
        <table><thead><tr><th>Effect</th><th>What it does</th></tr></thead><tbody>${effRows}</tbody></table>
        <table><thead><tr><th>Status id</th><th>Name</th><th>Rule</th></tr></thead><tbody>${stRows}</tbody></table>
      </div>
    </section>`;
  }

  /* Cut-in settings and the art check (Sheet & saves). */
  function cutinPanel() {
    const mode = cutinMode();
    const opt = (k, l, note) => `<label class="radio"><input type="radio" name="cutin-mode" value="${k}" ${mode === k ? 'checked' : ''}> <span><b>${l}</b> · ${note}</span></label>`;
    const own = app.rawTables && app.rawTables.CutIns && window.CB_BAKED_TABLES && app.rawTables.CutIns !== window.CB_BAKED_TABLES.CutIns;
    return `<div class="panel stack">
      <h2>Cut-in art</h2>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:700;font-size:.85rem;margin-bottom:6px">Show cut-ins</legend>
        ${opt('all', 'Every card', 'plus knockdowns')}
        ${opt('big', 'Big hits', 'Heavy, Finisher and Elite cards, plus knockdowns')}
        ${opt('off', 'Off', 'the result screen still shows its picture')}
      </fieldset>
      <p class="muted" style="font-size:.85rem">Paths come from ${own ? 'your sheet\'s own <b>CutIns</b> tab' : 'the game\'s built-in CutIns list'}. Pictures not uploaded yet are skipped and the nearest one is used.</p>
      <div class="row"><button class="btn soft" data-act="art-check">Check art files</button></div>
      <div id="art-report">${artReportHTML()}</div>
    </div>`;
  }

  function artReportHTML() {
    const r = app.artReport;
    if (!r) return '';
    const rows = r.faces.map(f => `<details class="art-face"><summary><b>${esc(f.name)}</b> <span class="num ${f.found === f.total ? 'ok-line' : 'muted'}">${f.found} of ${f.total}</span></summary>
      ${f.missing.length ? `<ul class="art-missing">${f.missing.map(m => `<li><code>${esc(m)}</code></li>`).join('')}</ul>` : '<p class="ok-line">All pictures found.</p>'}</details>`).join('');
    return `<p class="${r.done && r.found === r.total ? 'ok-line' : ''}" style="font-size:.88rem">${r.done ? '' : 'Checking… '}${r.found} of ${r.total} pictures found${r.done ? '.' : ` (${r.checked} checked)`}</p>${rows}`;
  }

  async function runArtCheck() {
    const d = app.data;
    const plan = CB.artPlan(d);
    const jobs = [];
    const report = app.artReport = { faces: [], total: 0, found: 0, checked: 0, done: false };
    plan.forEach(face => {
      const f = { name: face.name, total: 0, found: 0, missing: [] };
      report.faces.push(f);
      const rows = (d.cutins || {})[face.fighter] || {};
      face.rows.forEach(row => {
        const key = row.kind === 'card' ? 'card:' + row.move : row.kind === 'tag' ? 'tag:' + row.tag : row.kind;
        face.views.forEach(view => {
          for (let s = 0; s < CB.CUTIN_SLOT_COUNT; s++) {
            const cell = rows[key] ? rows[key][view][s] : '';
            f.total++; report.total++;
            jobs.push({ f, cell: cell || '', label: cell || `(no path: ${face.fighter} ${row.move} ${view}_${s})` });
          }
        });
      });
    });
    const paint = () => { const el = document.getElementById('art-report'); if (el) el.innerHTML = artReportHTML(); };
    paint();
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        const hit = j.cell ? await probeCell(j.cell, true) : '';
        report.checked++;
        if (hit) { j.f.found++; report.found++; } else j.f.missing.push(j.label);
        if (report.checked % 20 === 0) paint();
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    report.done = true;
    paint();
  }

  /* ---------- render ---------- */
  function render() {
    if (app.view === 'battle' && app.battle) { renderBattle(); return; }
    const ch = char();
    if (!ch && !['select', 'settings', 'versus'].includes(app.view)) app.view = 'select';
    const views = { select: viewSelect, ladder: viewLadder, shop: viewShop, deck: viewDeck, style: viewStyle, settings: viewSettings, versus: viewVersus };
    root.innerHTML = topbar() + `<main>${(views[app.view] || viewSelect)()}</main>`;
  }

  /* ---------- battle ---------- */
  /* The engine numbers fighters 0 and 1. The screen always shows "you" at the
   * bottom: b.me is your engine index (0 against the AI and as Versus host,
   * 1 as Versus guest). V(i) turns an engine index into a screen index
   * (0 = you, 1 = them); F(v) gets the fighter for a screen index. */
  const V = (b, i) => (b.me === 0 ? i : 1 - i);
  const F = (b, v) => b.state.fighters[v === 0 ? b.me : 1 - b.me];
  const mine = (b, pair) => (b.me === 0 ? pair : [pair[1], pair[0]]);

  function startBattle(oppId) {
    const d = app.data, ch = char();
    const problems = CB.deckProblems(d, ch);
    if (problems.length) { toast(problems[0]); app.view = 'deck'; render(); return; }
    const opp = d.opponents.find(o => o.id === oppId);
    const me = d.styles[ch.styleId];
    const state = CB.createMatch(d,
      { name: 'You', styleId: ch.styleId, deck: CB.deckIds(ch) },
      { name: opp.name, styleId: opp.style, deck: opp.deck, hpBonus: opp.hpBonus, isAI: true },
      { seed: (Math.random() * 2 ** 31) | 0, rounds: opp.rounds || 0 });
    app.battle = { state, opp, me: 0, pvp: false, busy: false, played: [], log: [], done: false, leaveArmed: false, styleName: me.name };
    openBattleScreen();
  }

  function openBattleScreen() {
    const b = app.battle;
    app.view = 'battle';
    root.innerHTML = topbar() + `<main id="battle-root"></main>`;
    hideCutIn();
    b.tkoCutIn = false;
    prepCutIns(b);
    buildBattle();
    afterAction();
  }

  function buildBattle() {
    const b = app.battle, d = app.data;
    const band = (f, who) => {
      const st = d.styles[f.styleId];
      const art = who === 'opp' ? b.opp.art || st.art : st.art;
      const color = who === 'opp' ? (b.opp.color || st.color) : st.color;
      return `<section class="fighter-band" id="band-${who}" aria-label="${who === 'me' ? 'You' : esc(f.name)}">
        <div class="portrait" id="portrait-${who}">${emblem(who === 'opp' ? b.opp.id : f.styleId, who === 'opp' ? f.name : st.name, color, art, 72)}</div>
        <div style="min-width:0">
          <div class="name-row"><h2>${who === 'me' ? 'You' : esc(f.name)}</h2><span class="muted" style="font-size:.85rem">${who === 'me' ? esc(st.name) : esc(b.opp.title || st.name)}</span></div>
          <div class="bars">
            <div class="hpbar" id="hp-${who}" role="meter" aria-label="Health" aria-valuemin="0" aria-valuemax="${f.maxHp}"><div class="ghost"></div><div class="fill"></div><div class="label num"></div></div>
            <div class="status-row" id="status-${who}"></div>
          </div>
        </div>
        <div class="band-side">
          <div class="kd" id="kd-${who}"></div>
          <div class="energy" id="energy-${who}" aria-label="Energy"></div>
          <div class="pile-counts num" id="piles-${who}"></div>
        </div>
      </section>`;
    };
    document.getElementById('battle-root').innerHTML = `<div class="battle">
      <div class="round-strip" id="round-strip" ${b.state.roundsMode ? '' : 'hidden'}></div>
      ${b.pvp ? `<div class="net-bar" id="net-bar"></div>` : ''}
      ${band(F(b, 1), 'opp')}
      <section class="lane" aria-live="polite">
        <div class="flash" id="flash" hidden></div>
        <div class="combo"><span class="count num" id="combo-count">0</span><span class="lbl" id="combo-lbl">chain</span><div class="bonus" id="combo-bonus"></div></div>
        <div class="stack" style="gap:6px;min-width:0"><div class="played" id="played"></div><p class="recap" id="recap"></p></div>
      </section>
      ${band(F(b, 0), 'me')}
      <section class="hand-tray">
        <div class="hand-head"><p class="hint" id="hint"></p>
          <div class="row"><span class="timer num" id="turn-timer" hidden></span><button class="btn soft small" data-act="leave" id="leave-btn">${b.pvp ? 'Concede' : 'Leave match'}</button><button class="btn" data-act="end-turn" id="end-turn">End turn <span class="muted" style="font:600 .7rem var(--font-mono)">E</span></button></div></div>
        <div class="hand" id="hand" aria-label="Your hand"></div>
        <details class="log-wrap"><summary>Match log</summary><div class="log" id="log"></div></details>
      </section>
    </div>`;
  }

  function fighterKey(v) { return v === 0 ? 'me' : 'opp'; }

  function floater(v, text, cls) {
    const p = document.getElementById('band-' + fighterKey(v));
    if (!p) return;
    const el = document.createElement('div');
    el.className = 'floater ' + (cls || '');
    el.textContent = text;
    const n = p.querySelectorAll('.floater').length;
    el.style.left = (50 + (n % 3 - 1) * 9) + '%';
    p.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  function logLine(t) { app.battle.log.push(t); }

  function flash(title, text) {
    const el = document.getElementById('flash');
    if (!el) return;
    el.innerHTML = `<b>${esc(title)}</b><span>${esc(text)}</span>`;
    el.hidden = false;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    clearTimeout(flash.t); flash.t = setTimeout(() => { el.hidden = true; }, 1900);
  }

  /* ---------- cut-in art ----------
   * Paths come from the CutIns tab (src/cutins.js picks which one). Before a
   * fight, the game checks which of those files exist (a quick HEAD request on
   * a hosted copy, an image load otherwise) and only ever shows confirmed ones,
   * so a half-filled art folder just falls back. Face rule: your fighter in
   * profile, the opponent in POV. Cards show the attacker, knockdowns the one
   * going down, the result screen the winner. */
  const CUTIN_MODES = ['all', 'big', 'off'];
  function cutinMode() { const m = store.get('foxyfight.cutins'); return CUTIN_MODES.includes(m) ? m : 'all'; }
  const artStatus = new Map();   // file -> 'ok' | 'missing'
  /* Animated pictures (.gif / .webp) are kept as downloaded data and shown from
   * a fresh copy each time, so the animation always starts at its first frame
   * (browsers otherwise share one running animation per file). */
  const animBlobs = new Map();   // file -> Blob (null while downloading)
  const isAnimFile = src => /\.(gif|webp)$/i.test(src) && /^https?:$/.test(location.protocol) && !/^https?:/i.test(src);
  function fetchAnim(src) {
    if (animBlobs.has(src) || !isAnimFile(src)) return;
    animBlobs.set(src, null);
    fetch(CB.artSrc(src)).then(r => (r.ok ? r.blob() : null))
      .then(bl => { if (bl) animBlobs.set(src, bl); else animBlobs.delete(src); }, () => animBlobs.delete(src));
  }
  const artWaiting = new Map();  // file -> Promise<boolean>

  function probeArt(src, fresh) {
    if (!fresh && artStatus.has(src)) return Promise.resolve(artStatus.get(src) === 'ok');
    if (!fresh && artWaiting.has(src)) return artWaiting.get(src);
    const url = CB.artSrc(String(src));
    const viaImage = () => new Promise(res => {
      const im = new Image();
      im.onload = () => res(true); im.onerror = () => res(false);
      im.src = url;
    });
    const hosted = /^https?:$/.test(location.protocol) && !/^https?:/i.test(src);
    const p = (hosted
      ? fetch(url, { method: 'HEAD', cache: fresh ? 'no-cache' : 'default' })
        .then(r => (r.ok ? true : (r.status === 404 || r.status === 410) ? false : viaImage()), viaImage)
      : viaImage())
      .then(ok => { artStatus.set(src, ok ? 'ok' : 'missing'); artWaiting.delete(src); return ok; });
    artWaiting.set(src, p);
    return p;
  }
  /* One CutIns cell. A ".*" cell tries each image type in order and stops at the first that exists. */
  async function probeCell(cell, fresh) {
    for (const c of CB.expandSrc(cell)) if (await probeArt(c, fresh)) return c;
    return '';
  }

  function cutinFaces(b) {
    const d = app.data;
    return {
      mine: CB.faceChain(d, { styleId: F(b, 0).styleId }),
      theirs: b.pvp ? CB.faceChain(d, { styleId: F(b, 1).styleId }) : CB.faceChain(d, { opponentId: b.opp.id }),
    };
  }

  /* Called when the fight screen opens: check every file this fight could show. */
  function prepCutIns(b) {
    const d = app.data;
    const faces = cutinFaces(b);
    const cells = [...CB.candidates(d, faces.mine, 'profile'), ...CB.candidates(d, faces.theirs, 'pov')];
    const tracked = new Set();
    cells.forEach(c => CB.expandSrc(c).forEach(x => tracked.add(x)));
    const deckIds = v => { const f = F(b, v); return [...new Set([...f.deck, ...f.hand, ...f.discard].map(c => c.id))]; };
    b.cut = {
      mine: faces.mine, theirs: faces.theirs, tracked, ready: false, timers: [], preloaded: new Set(), keep: [],
      decks: [deckIds(0), deckIds(1)],
      // a file this fight could use counts as missing until it is confirmed
      missing: src => artStatus.get(src) === 'missing' || (tracked.has(src) && artStatus.get(src) !== 'ok'),
    };
    Promise.all(cells.map(c => probeCell(c))).then(() => {
      if (app.battle !== b) return;
      b.cut.ready = true;
      preloadCutIns(b);
    });
  }

  function cutinHit(b, side, q) {
    const c = b.cut;
    if (!c) return null;
    return CB.resolveCutIn(app.data, side === 0 ? c.mine : c.theirs, Object.assign({ view: side === 0 ? 'profile' : 'pov' }, q), c.missing);
  }

  /* Download the pictures the next turns are most likely to need: every card in
   * both decks at each fighter's current fatigue, and her next knockdown. */
  function preloadCutIns(b) {
    const c = b.cut;
    if (!c || !c.ready) return;
    const tko = app.data.config.knockdowns_for_tko;
    [0, 1].forEach(v => {
      const f = F(b, v);
      const hits = c.decks[v].map(id => cutinHit(b, v, { kind: 'move', cardId: id, slot: f.knockdowns }));
      const next = f.knockdowns + 1;
      hits.push(cutinHit(b, v, { kind: 'knockdown', slot: CB.knockdownSlot(next, tko > 1 && next >= tko) }));
      hits.forEach(h => {
        if (!h || c.preloaded.has(h.src)) return;
        c.preloaded.add(h.src);
        if (isAnimFile(h.src)) { fetchAnim(h.src); return; }
        const im = new Image(); im.src = CB.artSrc(h.src); c.keep.push(im);
      });
    });
  }

  function cutinEl() {
    let el = document.getElementById('cutin');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cutin'; el.className = 'cutin'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="cutin-frame"><img alt=""></div><div class="cutin-cap"></div>';
      document.body.appendChild(el);
    }
    return el;
  }
  function hideCutIn() {
    const b = app.battle;
    if (b && b.cut) { b.cut.timers.forEach(clearTimeout); b.cut.timers = []; }
    const el = document.getElementById('cutin');
    if (el) { el.hidden = true; el.classList.remove('go'); }
  }
  function showCutIn(item) {
    const el = cutinEl();
    const img = el.querySelector('img');
    el.className = `cutin ${item.side === 0 ? 'mine' : 'theirs'} kind-${item.kind}`;
    const old = showCutIn.url;
    const bl = animBlobs.get(item.src);
    showCutIn.url = bl ? URL.createObjectURL(bl) : '';
    img.src = showCutIn.url || CB.artSrc(item.src);
    if (old) URL.revokeObjectURL(old);
    el.querySelector('.cutin-cap').textContent = item.caption || '';
    el.hidden = false;
    void el.offsetWidth; el.classList.add('go');
  }

  /* Plays the cut-ins one drain of engine events produced (a card, maybe a
   * knockdown after it). A new card replaces whatever is showing. */
  function runCutIns(b, reqs) {
    const c = b.cut;
    const mode = cutinMode();
    if (!c || !reqs.length) return;
    let knocked = false;
    const items = [];
    reqs.forEach(r => {
      if (r.kind !== 'move') knocked = true;
      if (mode === 'off') return;
      if (r.kind === 'move' && mode === 'big') {
        const card = app.data.cards[r.cardId];
        if (!card || !(card.tier === 'Elite' || card.tagKeys.includes('heavy') || card.tagKeys.includes('finisher'))) return;
      }
      const hit = cutinHit(b, r.side, r.kind === 'move' ? { kind: 'move', cardId: r.cardId, slot: r.slot } : { kind: 'knockdown', slot: r.slot });
      if (hit) items.push(Object.assign({ src: hit.src }, r));
    });
    if (knocked) preloadCutIns(b);
    if (!items.length) return;
    c.timers.forEach(clearTimeout); c.timers = [];
    let t = 0;
    items.forEach((it, i) => {
      const last = i === items.length - 1;
      const hold = it.kind === 'tko' ? 0 : it.kind === 'knockdown' ? 1700 : (last ? 950 : 650);
      c.timers.push(setTimeout(() => { if (app.battle === b) showCutIn(it); }, t));
      if (it.kind === 'tko') { b.tkoCutIn = { at: t, pov: it.side === 1 }; return; }   // stays up until the result screen
      t += hold;
      if (last) c.timers.push(setTimeout(() => { const el = document.getElementById('cutin'); if (el && app.battle === b) { el.hidden = true; el.classList.remove('go'); } }, t));
    });
  }

  function drain() {
    const b = app.battle, s = b.state, d = app.data;
    const evs = s.events.splice(0);
    const them = F(b, 1).name;
    const nm = v => v === 0 ? 'You' : them;
    const verb = (v, you, she) => v === 0 ? you : she;
    const cutReqs = [];
    for (const raw of evs) {
      // translate engine indices to screen indices (0 = you)
      const e = { ...raw };
      if ('who' in e) e.who = V(b, e.who);
      if ('from' in e) e.from = V(b, e.from);
      switch (e.type) {
        case 'turn':
          if (b.played.length) {
            const who = b.played[0].who;
            b.recap = { who, cards: b.played.length, best: Math.max(...b.played.map(p => p.chain)), dmg: b.turnDmg || 0 };
          }
          b.played = []; b.turnDmg = 0;
          logLine(`— ${e.who === 0 ? 'Your' : them + "'s"} turn${e.roundsMode ? ` (round ${e.round}, exchange ${e.exchange})` : ''} —`);
          break;
        case 'play': {
          const c = d.cards[e.cardId];
          b.played.push({ card: c, linked: e.linked, chain: e.chain, who: e.who });
          cutReqs.push({ kind: 'move', side: e.who, cardId: e.cardId, slot: e.kd || 0, caption: c.name });
          logLine(`${nm(e.who)} ${verb(e.who, 'play', 'plays')} ${c.name}${e.linked ? ` (link, chain ${e.chain}${e.comboBonus ? `, +${e.comboBonus} combo` : ''})` : ''}`);
          const cc = document.getElementById('combo-count');
          if (cc) { cc.classList.remove('pop'); void cc.offsetWidth; if (e.linked && e.chain > 1) cc.classList.add('pop'); }
          break;
        }
        case 'hit': {
          b.turnDmg = (b.turnDmg || 0) + (e.who !== V(b, s.active) ? e.amount : 0);
          floater(e.who, e.amount > 0 ? `−${e.amount}` : (e.blocked ? 'Blocked' : '0'), e.amount > 0 ? '' : 'block small');
          if (e.blocked && e.amount > 0) floater(e.who, `${e.blocked} blocked`, 'block small');
          const p = document.getElementById('portrait-' + fighterKey(e.who));
          if (p && e.amount > 0) { p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit'); }
          logLine(`  ${nm(e.who)} ${verb(e.who, 'take', 'takes')} ${e.amount}${e.blocked ? ` (${e.blocked} blocked)` : ''}${e.pierce ? ' piercing' : ''}`);
          break;
        }
        case 'hp':
          if (e.amount < 0) { floater(e.who, `−${-e.amount}`, 'small'); logLine(`  ${nm(e.who)} ${verb(e.who, 'lose', 'loses')} ${-e.amount} to ${d.statuses[e.source] ? d.statuses[e.source].name : e.source}`); }
          else if (e.amount > 0) { floater(e.who, `+${e.amount}`, 'heal'); logLine(`  ${nm(e.who)} ${verb(e.who, 'heal', 'heals')} ${e.amount}`); }
          break;
        case 'block': floater(e.who, `+${e.n} block`, 'block small'); break;
        case 'status':
          if (e.n > 0 && d.statuses[e.status]) { floater(e.who, `+${e.n} ${d.statuses[e.status].name}`, 'small'); logLine(`  ${nm(e.who)} ${verb(e.who, 'gain', 'gains')} ${e.n} ${d.statuses[e.status].name}`); }
          break;
        case 'knockdown': {
          const tko = d.config.knockdowns_for_tko;
          const subj = e.who === 0 ? "You're" : them + ' is';
          const msg = e.final ? `${subj} down for good` : `Knockdown! ${subj} down (${e.count} of ${tko})`;
          flash(e.final ? 'T.K.O.' : 'Knockdown!', msg);
          cutReqs.push({ kind: e.final ? 'tko' : 'knockdown', side: e.who, slot: CB.knockdownSlot(e.count, e.final), caption: e.final ? 'T.K.O.' : 'Knockdown!' });
          floater(e.who, 'DOWN', '');
          logLine(`  ${msg}${e.final ? '' : `, back up with ${e.hp} HP`}`);
          b.justKnocked = true;
          break;
        }
        case 'roundEnd':
          b.pendingCorner = { round: e.round, judges: e.judges.map(j => mine(b, j)), dmg: mine(b, e.dmg), kd: mine(b, e.kd), last: e.last, healed: [0, 0] };
          logLine(`— End of round ${e.round} —`);
          break;
        case 'corner':
          if (b.pendingCorner) b.pendingCorner.healed[e.who] = e.healed;
          break;
        case 'roundStart':
          b.played = []; b.recap = null;
          logLine(`— Round ${e.round} —`);
          break;
        case 'draw': break;
        case 'reshuffle': logLine(`  ${nm(e.who)} ${verb(e.who, 'reshuffle', 'reshuffles')} the discard pile`); break;
        case 'end': break;
      }
    }
    runCutIns(b, cutReqs);
  }

  function updateBattle() {
    const b = app.battle, s = b.state, d = app.data;
    if (!document.getElementById('battle-root')) return;
    const A = V(b, s.active);   // whose turn, on screen
    [0, 1].forEach(v => {
      const f = F(b, v), k = fighterKey(v);
      const hp = document.getElementById('hp-' + k);
      const pct = Math.max(0, (f.hp / f.maxHp) * 100);
      hp.querySelector('.fill').style.width = pct + '%';
      hp.querySelector('.ghost').style.width = pct + '%';
      hp.querySelector('.label').textContent = `${f.hp} / ${f.maxHp}`;
      hp.setAttribute('aria-valuenow', f.hp);
      hp.classList.toggle('low', pct <= 30);
      const statuses = Object.entries(f.statuses).filter(([, n]) => n > 0).map(([id, n]) => {
        const sd = d.statuses[id];
        return `<span class="status" style="--sc:${esc(sd.color)}" title="${esc(sd.name)}: ${esc(sd.description)}"><i></i>${esc(sd.name)} ${n}</span>`;
      }).join('');
      document.getElementById('status-' + k).innerHTML = (f.block ? `<span class="shield num" title="Block absorbs damage until your next turn">◆ ${f.block} block</span>` : '') + statuses;
      const isActive = A === v && !s.over;
      const pips = [];
      const maxShown = Math.max(f.maxEnergy, f.energy);
      for (let i = 0; i < maxShown; i++) pips.push(`<span class="pip ${isActive && i < f.energy ? (i >= f.maxEnergy ? 'extra' : 'on') : ''}"></span>`);
      const en = document.getElementById('energy-' + k);
      en.innerHTML = pips.join('');
      en.setAttribute('aria-label', `Energy ${isActive ? f.energy : 0} of ${f.maxEnergy}`);
      document.getElementById('piles-' + k).textContent = `Deck ${f.deck.length} · Hand ${f.hand.length} · Discard ${f.discard.length}`;
      document.getElementById('band-' + k).classList.toggle('active', isActive);
    });

    // rounds and knockdowns
    const strip = document.getElementById('round-strip');
    const themShort = esc(F(b, 1).name.replace(/["“”][^"”]*["”]\s*/g, '').split(' ')[0]);
    if (s.roundsMode) {
      const per = d.config.exchanges_per_round;
      const pips = Array.from({ length: per }, (_, i) => `<i class="${i < s.exchangeInRound - 1 ? 'done' : (i === s.exchangeInRound - 1 ? 'now' : '')}"></i>`).join('');
      const cards = s.scorecards.map(sc => {
        const v = sc.judges.reduce((a, j0) => { const j = mine(b, j0); return a + (j[0] > j[1] ? 1 : j[1] > j[0] ? -1 : 0); }, 0);
        return `<span class="chip rd ${v > 0 ? 'you' : v < 0 ? 'them' : ''}" title="Round ${sc.round}: ${sc.judges.map(j => mine(b, j).join('-')).join(', ')} (you first)">R${sc.round} ${v > 0 ? 'You' : v < 0 ? themShort : 'Even'}</span>`;
      }).join('');
      strip.innerHTML = `<span class="rnum">Round ${s.round} <small>of ${s.maxRounds}</small></span>
        <span class="pips" aria-label="Exchange ${s.exchangeInRound} of ${per}">${pips}</span>
        <span class="muted">Exchange ${s.exchangeInRound} of ${per}</span>
        <span class="cards-so-far">${cards}</span>`;
    }
    const tko = d.config.knockdowns_for_tko;
    [0, 1].forEach(v => {
      const f = F(b, v);
      const el = document.getElementById('kd-' + fighterKey(v));
      if (!el) return;
      if (!(tko > 1)) { el.innerHTML = ''; return; }
      el.innerHTML = `<span>Knockdowns</span>${Array.from({ length: tko - 1 }, (_, i) => `<i class="${i < f.knockdowns ? 'on' : ''}"></i>`).join('')}`;
      el.title = `${f.knockdowns} knockdown${f.knockdowns === 1 ? '' : 's'}. The ${tko === 3 ? 'third' : 'next after these'} ends the fight.`;
    });

    const act = s.fighters[s.active];
    document.getElementById('combo-count').textContent = act.chain.length;
    document.getElementById('combo-lbl').textContent = A === 0 ? 'your chain' : 'their chain';
    const nextBonus = Math.min(d.config.combo_damage_cap, Math.floor(act.chain.length * d.config.combo_damage_per_link));
    document.getElementById('combo-bonus').textContent = act.chain.length ? (nextBonus ? `next link +${nextBonus} dmg` : 'link again for bonus') : '';

    const played = document.getElementById('played');
    played.innerHTML = b.played.length ? b.played.map((p, i) => `${i ? `<span class="joiner ${p.linked ? '' : 'broken'}" aria-hidden="true">${p.linked ? '→' : '·'}</span>` : ''}
      <div class="mini ${tagClass(p.card)} ${p.linked ? 'linked' : ''}"><b>${esc(p.card.name)}</b><span class="lk">${p.linked ? `LINK ${p.chain}` : 'NEW CHAIN'}</span></div>`).join('')
      : `<span class="empty">${A === 0 ? 'Play a card to start your chain.' : esc(F(b, 1).name) + ' is thinking…'}</span>`;
    played.scrollLeft = played.scrollWidth;
    const rc = b.recap;
    document.getElementById('recap').textContent = rc
      ? `${rc.who === 0 ? 'Your' : F(b, 1).name + "'s"} last turn: ${rc.cards} card${rc.cards > 1 ? 's' : ''}, best chain ${rc.best}, ${rc.dmg} damage.`
      : '';

    // hand
    const me = F(b, 0);
    const myTurn = A === 0 && !s.over && !b.busy && !b.netDown;
    document.getElementById('hand').innerHTML = me.hand.map((inst, i) => {
      const c = d.cards[inst.id];
      const pv = A === 0 ? CB.previewCard(s, d, i) : null;
      const playable = myTurn && pv && pv.affordable;
      const cls = [!playable ? 'unaffordable' : '', playable && pv.linked ? 'linkable' : ''].join(' ');
      return cardHTML(c, { tag: 'button', cls, key: i < 9 ? String(i + 1) : '', attrs: `data-act="play" data-i="${i}" ${playable ? '' : 'aria-disabled="true"'} aria-label="${esc(c.name)}, cost ${c.cost}${pv && pv.linked ? ', links' : ''}"` });
    }).join('') || `<p class="muted" style="padding:20px">${A === 0 ? 'No cards left in hand.' : 'Waiting for your turn.'}</p>`;

    const linkable = myTurn ? me.hand.filter((inst, i) => { const pv = CB.previewCard(s, d, i); return pv.linked && pv.affordable; }).length : 0;
    const firstTurnNote = s.turnCount === 1 && V(b, s.first) === 0 && A === 0 && d.config.first_turn_energy_penalty
      ? `You go first, so this turn has ${d.config.first_turn_energy_penalty} less energy. ` : '';
    document.getElementById('hint').innerHTML = s.over ? '' : (b.netDown ? `<b>Connection lost.</b> Waiting for ${esc(F(b, 1).name)} to come back…` : firstTurnNote + (A === 0
      ? (linkable ? `<b>${linkable}</b> glowing card${linkable > 1 ? 's' : ''} will link. Keys 1–9 play cards.` : (me.hand.length ? 'Nothing links right now. Play something to start a new chain, or end your turn.' : 'End your turn when ready.'))
      : `${esc(F(b, 1).name)} is taking their turn…`));
    document.getElementById('end-turn').disabled = !myTurn;
    document.getElementById('log').innerHTML = b.log.slice(-60).reverse().map(l => `<div>${esc(l)}</div>`).join('');
    const lb = document.getElementById('leave-btn');
    lb.textContent = b.leaveArmed ? (b.pvp ? 'Press again to concede' : 'Press again to forfeit') : (b.pvp ? 'Concede' : 'Leave match');
    if (b.pvp) updateNetBar();
  }

  /* Single place that decides what happens next after any engine call. */
  function afterAction() {
    const b = app.battle;
    if (!b) return;
    drain(); updateBattle();
    if (b.state.over) { finishBattle(); return; }
    if (b.pendingCorner) { showCorner(); return; }
    if (!b.pvp && V(b, b.state.active) === 1 && !b.busy) runAI();
  }

  function playerPlay(i) {
    const b = app.battle;
    if (!b || b.busy || b.netDown || V(b, b.state.active) !== 0 || b.state.over) return;
    if (!CB.canPlay(b.state, app.data, i)) return;
    CB.playCard(b.state, app.data, i);
    b.leaveArmed = false;
    if (b.pvp) vsSendAction('play', i);
    afterAction();
  }

  function playerEnd() {
    const b = app.battle;
    if (!b || b.busy || b.netDown || V(b, b.state.active) !== 0 || b.state.over) return;
    CB.endTurn(b.state, app.data);
    if (b.pvp) vsSendAction('end');
    afterAction();
  }

  async function runAI() {
    const b = app.battle, s = b.state, d = app.data;
    if (b.pvp || b.busy || b.pendingCorner || s.over || s.active !== 1) return;
    b.busy = true; updateBattle();
    const profile = { aggression: b.opp.aggression, caution: b.opp.caution };
    const kdPause = cutinMode() === 'off' ? 1500 : 2300;   // room for the knockdown cut-in
    await sleep(b.justKnocked ? kdPause : 650);
    b.justKnocked = false;
    const turn = s.turnCount;
    let guard = 0;
    while (app.battle === b && !s.over && s.active === 1 && s.turnCount === turn && guard++ < 40) {
      const i = CB.chooseAction(s, d, profile);
      if (i < 0) break;
      CB.playCard(s, d, i);
      drain(); updateBattle();
      await sleep(b.justKnocked ? kdPause : 720);
    }
    if (app.battle !== b) return;
    // a knockdown already ended the turn inside the engine
    if (!s.over && s.active === 1 && s.turnCount === turn) CB.endTurn(s, d);
    b.busy = false;
    afterAction();
  }

  /* Between rounds: the judges' cards for the round and the corner recovery. */
  function showCorner() {
    const b = app.battle, s = b.state;
    const c = b.pendingCorner;
    if (!c || document.querySelector('.overlay')) return;
    const opp = F(b, 1).name;
    const oppShort = opp.replace(/["“”][^"”]*["”]\s*/g, '').split(' ')[0];
    const v = c.judges.reduce((a, j) => a + (j[0] > j[1] ? 1 : j[1] > j[0] ? -1 : 0), 0);
    const totals = [0, 1, 2].map(j => mine(b, s.scorecards.reduce((t, sc) => [t[0] + sc.judges[j][0], t[1] + sc.judges[j][1]], [0, 0])));
    const statusNote = d => d.config.corner_clears_statuses === true ? 'Statuses are cleared.'
      : (d.config.corner_clears_statuses > 0 ? `Each status loses ${d.config.corner_clears_statuses} stack${d.config.corner_clears_statuses > 1 ? 's' : ''}.` : 'Statuses carry over.');
    b.cornerOpenedAt = Date.now();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal corner" role="dialog" aria-modal="true" aria-labelledby="corner-title">
      <span class="eyebrow">End of round ${c.round}</span>
      <div class="big" id="corner-title">${v > 0 ? 'Your round' : v < 0 ? `${esc(oppShort)}'s round` : 'Even round'}</div>
      <table class="scorecard"><thead><tr><th>Judge</th><th>You</th><th>${esc(opp)}</th><th>Total</th></tr></thead><tbody>
        ${c.judges.map((j, k) => `<tr><td>${['Damage', 'Combinations', 'Activity'][k]}</td><td class="num ${j[0] > j[1] ? 'win' : ''}">${j[0]}</td><td class="num ${j[1] > j[0] ? 'win' : ''}">${j[1]}</td><td class="num">${totals[k][0]}–${totals[k][1]}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted">Damage this round: you ${c.dmg[0]}, ${esc(opp)} ${c.dmg[1]}.${c.kd[0] || c.kd[1] ? ` Knockdowns: you ${c.kd[0]}, ${esc(opp)} ${c.kd[1]}.` : ''}</p>
      <p>In the corner you recover <b class="num">${c.healed[0]}</b> HP and ${esc(opp)} recovers <b class="num">${c.healed[1]}</b>. ${statusNote(app.data)} Decks are reshuffled.</p>
      <div class="row"><button class="btn" data-act="bell">Ring the bell for round ${s.round}</button></div>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelector('.btn').focus();
  }

  function ringBell() {
    const b = app.battle;
    document.querySelectorAll('.overlay').forEach(o => o.remove());
    if (!b) return;
    b.pendingCorner = null;
    b.timerTurn = null; // the turn clock starts when the bell rings
    updateBattle();
    flash(`Round ${b.state.round}`, V(b, b.state.active) === 0 ? 'You lead off.' : `${F(b, 1).name} leads off.`);
    if (!b.pvp && b.state.active === 1) runAI();
  }

  function finishBattle() {
    const b = app.battle;
    if (b.done) return;
    b.done = true;
    if (b.pvp) { vsFinish(); return; }
    const d = app.data, ch = char();
    const won = V(b, b.state.winner) === 0;
    const res = CB.recordResult(d, ch, b.opp, won);
    persist();
    const evo = CB.evolveInfo(d, ch);
    const nextUnlocked = won && res.firstWin ? d.opponents[d.opponents.indexOf(b.opp) + 1] : null;
    showResult(b, won, `
        <div class="xp-gain num">+${res.gained} XP</div>
        <p class="muted">${won ? (res.firstWin ? `First win against ${esc(b.opp.name)}.` : 'Rematch win.') : 'Losses still earn a little XP.'} You have ${ch.xp} XP to spend.</p>
        ${nextUnlocked ? `<p><b>${esc(nextUnlocked.name)}</b> is now unlocked.</p>` : ''}
        ${evo && evo.canEvolve ? `<p><b>${esc(evo.to.name)}</b> evolution is ready.</p>` : ''}`, `
          <button class="btn" data-act="result" data-to="ladder">Back to ladder</button>
          <button class="btn soft" data-act="result" data-to="shop">Shop</button>
          <button class="btn soft" data-act="result" data-to="rematch">${won ? 'Fight again' : 'Try again'}</button>`);
  }

  function showResult(b, won, middle, buttons) {
    // After a T.K.O. cut-in, give it time on screen before the result card covers
    // it: Config tko_cutin_seconds for the T.K.O. you land (POV, default 10),
    // about 2.4 s for the one you take. Clicking or pressing a key skips ahead.
    const tk = b.tkoCutIn;
    const secs = Number(app.data.config.tko_cutin_seconds);
    const delay = tk ? tk.at + (tk.pov ? Math.max(1, Number.isFinite(secs) && secs > 0 ? secs : 10) * 1000 : 2400) : 900;
    let shown = false;
    const handle = setTimeout(() => show(), delay);
    if (tk) b.showResultNow = () => { clearTimeout(handle); show(); };
    function show() {
      if (shown) return;
      shown = true; b.showResultNow = null;
      if (app.battle !== b) return;
      hideCutIn();
      document.querySelectorAll('.overlay').forEach(o => o.remove());
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="res-title">
        ${resultArt(b, won)}
        <span class="eyebrow">${resultReason(b.state)}</span>
        <div class="big" id="res-title">${won ? 'You win' : 'You lose'}</div>
        ${b.state.decision ? `<p class="judges num">Judges: ${b.state.decision.totals.map(t => mine(b, t).join('–')).join(' · ')} <span class="muted">(you first)</span></p>` : ''}
        ${middle}
        <div class="row">${buttons}</div>
      </div>`;
      document.body.appendChild(ov);
      ov.querySelector('.btn').focus();
    }
  }

  function resultReason(s) {
    if (s.endReason === 'decision' && s.decision) {
      const t = s.decision.type;
      return t === 'technical' ? 'Even on the cards · decided on condition' : `${t[0].toUpperCase() + t.slice(1)} decision`;
    }
    return { ko: 'K.O.', tko: 'T.K.O.', time: 'Time up', forfeit: 'Forfeit', concede: 'Conceded' }[s.endReason] || 'Fight over';
  }

  /* End-of-fight image, in this order: the Opponents tab's win_art (you won) /
   * loss_art (she won); then the winner's Victory cut-in (yours in profile when
   * you win, hers in POV when she wins), picked by the knockdowns she took;
   * then Config default_win_art / default_loss_art. With no image, or if it
   * fails to load, a generated spotlight of the winner's medallion shows. */
  function resultArt(b, won) {
    const d = app.data;
    const winner = F(b, won ? 0 : 1);
    const cut = b.cut || Object.assign(cutinFaces(b), { missing: null });
    const pick = CB.resultArt(d, { won, opponent: b.opp, myFaces: cut.mine, theirFaces: cut.theirs, winnerKd: winner.knockdowns, missing: cut.missing });
    const src = pick ? pick.src : '';
    const wStyle = d.styles[winner.styleId];
    const id = won ? winner.styleId : b.opp.id;
    const name = won ? wStyle.name : b.opp.name;
    const color = won ? wStyle.color : (b.opp.color || wStyle.color);
    const placeholder = CB.resultArtSVG(id, name, color, won);
    const img = src ? `<img src="${esc(CB.artSrc(String(src)))}" alt="${won ? 'You win' : esc(b.opp.name) + ' wins'}" onerror="this.remove()">` : '';
    return `<div class="result-art ${won ? 'won' : 'lost'}">${placeholder}${img}</div>`;
  }

  function closeBattle(to) {
    const b = app.battle;
    const opp = b && b.opp;
    hideCutIn();
    document.querySelectorAll('.overlay').forEach(o => o.remove());
    if (b && b.pvp) { vsLeave(); }
    app.battle = null;
    if (to === 'rematch' && opp && !b.pvp) { startBattle(opp.id); return; }
    app.view = to || 'ladder';
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- versus (client to client) ----------
   * Lockstep: both browsers run the same engine with the same seed and data,
   * and only send each other their moves ("play card 3", "end turn"). Every
   * move carries a fingerprint of the resulting match so a mismatch is caught.
   * The host's sheet data is used for the match, so both sides agree. */
  const VS_PROTOCOL = 1;
  const vs = app.vs = { status: 'idle', role: '', code: '', link: null, error: '', mode: 'build', rounds: 0, fighter: '', guestName: '', hostName: '', lobby: null, myPick: '', token: '' };

  function ringName() { return (store.get('foxyfight.name') || '').trim() || 'Challenger'; }
  function stateHash(s) {
    const f = s.fighters;
    return [s.turnCount, s.seed, f[0].hp, f[1].hp, f[0].energy, f[1].energy, f[0].hand.length, f[1].hand.length, f[0].knockdowns, f[1].knockdowns].join('.');
  }

  /* Fighters a player can bring. build = their saved characters; fair = every starting style. */
  function fighterChoices(data, mode) {
    if (mode === 'fair') {
      return data.styleList.filter(s => s.root === s.id).map(s => ({ key: s.id, label: s.name, styleId: s.id, deck: s.baseDeck.slice(), root: s.id, note: 'Starting deck' }));
    }
    return Object.keys(app.save.characters).map(rootId => {
      const ch = app.save.characters[rootId];
      const styleId = data.styles[ch.styleId] ? ch.styleId : (data.styles[rootId] ? rootId : null);
      if (!styleId) return null;
      const all = [];
      for (const id in ch.deck) for (let k = 0; k < ch.deck[id]; k++) all.push(id);
      const deck = all.filter(id => data.cards[id]);
      const dropped = all.length - deck.length;
      return { key: rootId, label: data.styles[styleId].name, styleId, deck, root: rootId, note: `${deck.length}-card deck${dropped ? ` (${dropped} card${dropped > 1 ? 's' : ''} not in this sheet left out)` : ''}` };
    }).filter(Boolean);
  }

  function vsReset(keepError) {
    if (vs.link) { vs.link.destroy(); vs.link = null; }
    if (vs.timer) { clearInterval(vs.timer); vs.timer = null; }
    if (vs.savedData) { app.data = vs.savedData; vs.savedData = null; }
    Object.assign(vs, { status: 'idle', role: '', code: '', lobby: null, guestName: '', hostName: '', token: '', start: null, rematch: null, matchTables: null });
    if (!keepError) vs.error = '';
  }

  function vsLink() {
    const link = new CB.Net.Link();
    link.on('message', vsOnMessage);
    link.on('error', err => {
      if (err && err.type === 'unavailable-id' && vs.role === 'host' && vs.status === 'hosting') { vs.link.destroy(); vsHost(true); return; }
      if (app.battle && app.battle.pvp && !app.battle.done) return; // drops mid-fight are handled by 'close'
      vs.error = CB.Net.friendlyError(err);
      vsReset(true); render();
    });
    link.on('close', () => {
      const b = app.battle;
      if (b && b.pvp && !b.done) { b.netDown = Date.now(); if (vs.role === 'guest') vs.link.reconnectLoop(); updateBattle(); return; }
      if (vs.status !== 'idle') { vs.error = 'The other player left.'; vsReset(true); render(); }
    });
    return link;
  }

  function vsHost(retrying) {
    if (!retrying) {
      vs.mode = (document.querySelector('input[name="vs-mode"]:checked') || {}).value || 'build';
      const r = document.getElementById('vs-rounds');
      vs.rounds = r ? Number(r.value) : 0;
      const f = document.getElementById('vs-fighter');
      vs.myPick = f ? f.value : '';
    }
    const choices = fighterChoices(app.data, vs.mode);
    if (!choices.find(c => c.key === vs.myPick)) { toast('Choose your fighter first.'); return; }
    vs.role = 'host'; vs.code = CB.Net.makeCode(); vs.status = 'opening'; vs.error = '';
    vs.link = vsLink();
    vs.link.on('ready', () => { vs.status = 'hosting'; render(); });
    vs.link.on('open', () => { if (vs.status === 'hosting') { vs.status = 'greeting'; render(); } });
    try { vs.link.host(vs.code); } catch (e) { vs.error = CB.Net.friendlyError(e); vsReset(true); }
    render();
  }

  function vsJoin() {
    const input = document.getElementById('vs-code');
    const code = CB.Net.cleanCode(input ? input.value : '');
    if (code.length < 4) { toast('Enter the ring code your opponent sent you.'); return; }
    vs.role = 'guest'; vs.code = code; vs.status = 'connecting'; vs.error = '';
    vs.token = CB.Net.makeCode() + CB.Net.makeCode();
    vs.link = vsLink();
    vs.link.on('open', () => {
      const b = app.battle;
      if (b && b.pvp && !b.done) { vs.link.send({ t: 'hello', v: VS_PROTOCOL, name: ringName(), token: vs.token, resume: b.seq }); return; }
      vs.link.send({ t: 'hello', v: VS_PROTOCOL, name: ringName(), token: vs.token });
    });
    try { vs.link.join(code); } catch (e) { vs.error = CB.Net.friendlyError(e); vsReset(true); }
    render();
  }

  function vsOnMessage(m) {
    if (!m || typeof m !== 'object') return;
    const b = app.battle;
    switch (m.t) {
      /* host side */
      case 'hello': {
        if (vs.role !== 'host') return;
        if (m.v !== VS_PROTOCOL) { vs.link.send({ t: 'bye', reason: 'Your copy of the game is a different version. Both players need the same version.' }); return; }
        if (b && b.pvp && !b.done) {               // a guest coming back mid-fight
          if (m.token !== vs.token) { vs.link.send({ t: 'bye', reason: 'This fight is already under way.' }); return; }
          b.netDown = 0;
          vs.link.send({ t: 'resume', seq: b.seq });
          vsResend(m.resume);
          updateBattle();
          return;
        }
        vs.token = m.token; vs.guestName = String(m.name || 'Challenger').slice(0, 40);
        vs.status = 'choosing';
        vs.link.send({ t: 'lobby', v: VS_PROTOCOL, mode: vs.mode, rounds: vs.rounds, hostName: ringName(), tables: app.rawTables, source: app.dataInfo.source });
        render();
        return;
      }
      case 'ready': {
        if (vs.role !== 'host' || vs.status !== 'choosing') return;
        const d = app.data;
        const mine0 = fighterChoices(d, vs.mode).find(c => c.key === vs.myPick);
        const spec = m.spec || {};
        if (!d.styles[spec.styleId]) { vs.link.send({ t: 'bye', reason: 'That fighter is not in the host’s sheet.' }); return; }
        const guestDeck = (Array.isArray(spec.deck) ? spec.deck : []).filter(id => d.cards[id]).slice(0, d.config.deck_max);
        const start = {
          t: 'start', seed: (Math.random() * 2 ** 31) | 0, first: Math.random() < 0.5 ? 0 : 1, rounds: vs.rounds,
          specs: [
            { name: ringName(), styleId: mine0.styleId, deck: vs.mode === 'fair' ? d.styles[mine0.styleId].baseDeck : mine0.deck },
            { name: vs.guestName, styleId: spec.styleId, deck: vs.mode === 'fair' ? d.styles[spec.styleId].baseDeck : guestDeck },
          ],
          roots: [mine0.root, spec.root || ''],
        };
        vs.link.send(start);
        vsStartMatch(start, 0, app.rawTables);
        return;
      }
      /* guest side */
      case 'lobby': {
        if (vs.role !== 'guest') return;
        const r = CB.compileData(m.tables || {}, { source: 'host sheet' });
        if (r.errors.length) { vs.error = 'The host’s sheet has errors, so the fight can’t start: ' + r.errors[0]; vsReset(true); render(); return; }
        vs.lobby = { mode: m.mode === 'fair' ? 'fair' : 'build', rounds: m.rounds || 0, hostName: String(m.hostName || 'Host').slice(0, 40), data: r.data, tables: m.tables };
        vs.status = 'choosing';
        render();
        return;
      }
      case 'start': {
        if (vs.role !== 'guest' || !vs.lobby) return;
        vsStartMatch(m, 1, vs.lobby.tables);
        return;
      }
      case 'resume': {
        if (!b || !b.pvp) return;
        b.netDown = 0;
        vsResend(m.seq);
        updateBattle();
        return;
      }
      /* both */
      case 'act': return vsApplyRemote(m);
      case 'resend': return vsResend(m.from);
      case 'concede': {
        if (!b || !b.pvp || b.state.over) return;
        vsEnd(b.me, 'concede');
        return;
      }
      case 'rematch': {
        if (!b || !b.pvp || !vs.rematch) return;
        vs.rematch.them = true;
        vsMaybeRematch();
        const el = document.getElementById('rematch-note');
        if (el) el.textContent = `${F(b, 1).name} wants a rematch.`;
        return;
      }
      case 'bye': {
        vs.error = String(m.reason || 'The other player closed the connection.');
        if (b && b.pvp && b.done) {
          const note = document.getElementById('rematch-note');
          if (note) note.textContent = vs.error;
          const btn = document.querySelector('.overlay [data-act="vs-rematch"]');
          if (btn) btn.disabled = true;
          if (vs.link) { vs.link.destroy(); vs.link = null; }
          return;
        }
        if (b && b.pvp) closeBattle('versus'); else { vsReset(true); render(); }
        return;
      }
    }
  }

  function vsStartMatch(start, me, tables) {
    document.querySelectorAll('.overlay').forEach(o => o.remove());
    // the match runs on the host's data; keep the player's own data to restore afterwards
    if (!vs.savedData) vs.savedData = app.data;
    const r = CB.compileData(withBuiltInTabs(tables), { source: 'host sheet' });
    app.data = r.data;
    const d = app.data;
    const state = CB.createMatch(d, start.specs[0], start.specs[1], { seed: start.seed, firstPlayer: start.first, rounds: start.rounds || 0 });
    const oppSpec = start.specs[1 - me];
    const oppStyle = d.styles[oppSpec.styleId];
    vs.start = start; vs.matchTables = tables; vs.status = 'fighting'; vs.rematch = null;
    app.battle = {
      state, me, pvp: true, busy: false, played: [], log: [], done: false, leaveArmed: false,
      seq: 0, actions: [], netDown: 0, myRoot: start.roots ? start.roots[me] : '',
      opp: { id: 'pvp-' + oppSpec.name, name: oppSpec.name, title: oppStyle.name, color: oppStyle.color, art: oppStyle.art, winArt: '', lossArt: '' },
    };
    if (vs.timer) clearInterval(vs.timer);
    vs.timer = setInterval(vsTick, 500);
    openBattleScreen();
  }

  function vsSendAction(a, i) {
    const b = app.battle;
    const act = { t: 'act', n: b.seq, by: b.me, a, i: a === 'play' ? i : undefined, h: stateHash(b.state) };
    b.actions.push(act);
    b.seq++;
    vs.link && vs.link.send(act);
  }

  function vsResend(from) {
    const b = app.battle;
    if (!b || !b.pvp) return;
    b.actions.filter(a => a.by === b.me && a.n >= (from || 0)).forEach(a => vs.link.send(a));
  }

  function vsApplyRemote(m) {
    const b = app.battle;
    if (!b || !b.pvp || b.done) return;
    if (m.n < b.seq) return;                                   // already have it
    if (m.n > b.seq) { vs.link.send({ t: 'resend', from: b.seq }); return; }
    const s = b.state, d = app.data;
    if (m.by !== 1 - b.me || s.active !== m.by) return vsDesync();
    if (m.a === 'play') { if (!CB.playCard(s, d, m.i).ok) return vsDesync(); }
    else if (m.a === 'end') CB.endTurn(s, d);
    else return;
    b.actions.push(m);
    b.seq++;
    if (stateHash(s) !== m.h) return vsDesync();
    afterAction();
  }

  function vsDesync() {
    const b = app.battle;
    if (!b || b.done) return;
    b.done = true;
    document.querySelectorAll('.overlay').forEach(o => o.remove());
    vs.error = 'The two games fell out of sync, so the fight was stopped with no result. This usually means the two copies of the game are different versions.';
    vs.link && vs.link.send({ t: 'bye', reason: vs.error });
    closeBattle('versus');
  }

  function vsEnd(winnerEngineIdx, reason) {
    const b = app.battle, s = b.state;
    s.over = true; s.winner = winnerEngineIdx; s.endReason = reason;
    afterAction();
  }

  /* Turn clock and connection grace period */
  function vsTick() {
    const b = app.battle;
    if (!b || !b.pvp || b.done) return;
    const d = app.data, s = b.state;
    const limit = d.config.pvp_turn_seconds;
    if (b.netDown) {
      const left = d.config.pvp_disconnect_seconds - (Date.now() - b.netDown) / 1000;
      if (left <= 0) { vsEnd(b.me, 'forfeit'); return; }
      updateNetBar(); return;
    }
    if (b.pendingCorner || document.querySelector('.overlay')) { b.timerTurn = null; return; }
    if (b.timerTurn !== s.turnCount) { b.timerTurn = s.turnCount; b.turnStarted = Date.now(); }
    const left = Math.max(0, Math.ceil(limit - (Date.now() - b.turnStarted) / 1000));
    const el = document.getElementById('turn-timer');
    if (el && limit > 0) { el.hidden = false; el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; el.classList.toggle('low', left <= 10); }
    if (limit > 0 && left <= 0 && V(b, s.active) === 0) playerEnd();
  }

  function updateNetBar() {
    const b = app.battle, el = document.getElementById('net-bar');
    if (!el || !b) return;
    if (b.netDown) {
      const left = Math.max(0, Math.ceil(app.data.config.pvp_disconnect_seconds - (Date.now() - b.netDown) / 1000));
      el.className = 'net-bar down';
      el.textContent = `Connection lost. If ${F(b, 1).name} isn't back in ${left}s, you win by forfeit.`;
    } else {
      el.className = 'net-bar';
      el.innerHTML = `<span class="dot"></span>Versus · connected to <b>${esc(F(b, 1).name)}</b> · ring ${esc(vs.code)}`;
    }
  }

  function vsFinish() {
    const b = app.battle, s = b.state;
    const won = V(b, s.winner) === 0;
    if (vs.timer) { clearInterval(vs.timer); vs.timer = null; }
    // XP goes to your own character for the style you fought with, using your own data
    const own = vs.savedData || app.data;
    let xpNote = '';
    const ch = b.myRoot && app.save.characters[b.myRoot];
    if (ch && own.styles[ch.root]) {
      const gained = won ? own.config.pvp_xp_win : own.config.pvp_xp_loss;
      if (gained > 0) { ch.xp += gained; ch.totalXp += gained; persist(); xpNote = `<div class="xp-gain num">+${gained} XP</div><p class="muted">Added to your ${esc(own.styles[ch.styleId] ? own.styles[ch.styleId].name : ch.root)}.</p>`; }
    }
    vs.rematch = { me: false, them: false };
    showResult(b, won, `${xpNote}<p class="muted" id="rematch-note"></p>`, `
          <button class="btn" data-act="vs-rematch">Rematch</button>
          <button class="btn soft" data-act="result" data-to="versus">Leave the ring</button>`);
  }

  function vsMaybeRematch() {
    const b = app.battle;
    if (!vs.rematch || !vs.rematch.me || !vs.rematch.them || vs.role !== 'host') return;
    const prev = vs.start;
    const start = { ...prev, seed: (Math.random() * 2 ** 31) | 0, first: Math.random() < 0.5 ? 0 : 1 };
    vs.link.send(start);
    document.querySelectorAll('.overlay').forEach(o => o.remove());
    vsStartMatch(start, 0, vs.matchTables);
  }

  function vsLeave() {
    const b = app.battle;
    if (vs.link) vs.link.send({ t: 'bye', reason: `${ringName()} left the ring.` });
    vsReset(true);
    if (b && !b.done) b.done = true;
  }

  function viewVersus() {
    const d = app.data;
    const name = store.get('foxyfight.name') || '';
    const err = vs.error ? `<p class="warn">${esc(vs.error)}</p>` : '';
    const available = CB.Net.available();
    const roundsSel = d.config.exchanges_per_round > 0
      ? `<div class="field"><label for="vs-rounds">Rounds</label><select id="vs-rounds">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === (vs.rounds || d.config.rounds) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : '';
    const choiceSelect = (mode, sel, id) => {
      const list = fighterChoices(mode === 'fair' ? d : (vs.lobby ? vs.lobby.data : d), mode);
      if (!list.length) return `<p class="muted">You don't have a fighter yet. Pick one on the main screen first, or choose a Fair fight.</p>`;
      return `<div class="field"><label for="${id}">Your fighter</label><select id="${id}">${list.map(c => `<option value="${esc(c.key)}" ${c.key === sel ? 'selected' : ''}>${esc(c.label)} · ${esc(c.note)}</option>`).join('')}</select></div>`;
    };
    let body;
    if (vs.status === 'idle') {
      body = `<div class="settings">
        <div class="panel stack">
          <h2>Host a fight</h2>
          <p class="muted" style="font-size:.9rem">Open a ring and send your opponent the link or code.</p>
          <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:700;font-size:.85rem;margin-bottom:6px">Decks</legend>
            <label class="radio"><input type="radio" name="vs-mode" value="build" ${vs.mode !== 'fair' ? 'checked' : ''}> <span><b>Bring your build</b> · each player fights with a saved character and their upgraded deck</span></label>
            <label class="radio"><input type="radio" name="vs-mode" value="fair" ${vs.mode === 'fair' ? 'checked' : ''}> <span><b>Fair fight</b> · everyone uses a starting style and its starting deck</span></label>
          </fieldset>
          <div id="vs-fighter-wrap">${choiceSelect(vs.mode, vs.myPick, 'vs-fighter')}</div>
          ${roundsSel}
          <div><button class="btn" data-act="vs-host" ${available ? '' : 'disabled'}>Open the ring</button></div>
        </div>
        <div class="panel stack">
          <h2>Join a fight</h2>
          <p class="muted" style="font-size:.9rem">Paste the link or the six-letter code you were sent.</p>
          <div class="field"><label for="vs-code">Ring code</label><input id="vs-code" type="text" autocomplete="off" placeholder="e.g. K7QF2M" value="${esc(app.joinCode || '')}"></div>
          <div><button class="btn" data-act="vs-join" ${available ? '' : 'disabled'}>Join</button></div>
        </div>
      </div>`;
    } else if (vs.role === 'host' && (vs.status === 'opening' || vs.status === 'hosting' || vs.status === 'greeting')) {
      const link = inviteLink(vs.code);
      body = `<div class="panel stack ring-open">
        <span class="eyebrow">${vs.status === 'opening' ? 'Opening the ring…' : 'Ring open · waiting for a challenger'}</span>
        <div class="ring-code num" aria-label="Ring code">${esc(vs.code)}</div>
        ${link ? `<div class="field"><label for="vs-link">Invite link</label><input id="vs-link" type="text" readonly value="${esc(link)}"></div>` : ''}
        <div class="row"><button class="btn" data-act="vs-copy" data-text="${esc(link || vs.code)}">Copy ${link ? 'invite link' : 'code'}</button><button class="btn soft" data-act="vs-cancel">Close the ring</button></div>
        <p class="muted" style="font-size:.88rem">${esc(vs.mode === 'fair' ? 'Fair fight' : 'Bring your build')}${d.config.exchanges_per_round > 0 ? ` · ${vs.rounds || d.config.rounds} rounds` : ''}. Keep this page open; the fight starts when they pick a fighter.</p>
      </div>`;
    } else if (vs.role === 'host' && vs.status === 'choosing') {
      body = `<div class="panel stack ring-open"><span class="eyebrow">Challenger in the ring</span><h2>${esc(vs.guestName)} is choosing a fighter…</h2><div><button class="btn soft" data-act="vs-cancel">Close the ring</button></div></div>`;
    } else if (vs.role === 'guest' && vs.status === 'connecting') {
      body = `<div class="panel stack ring-open"><span class="eyebrow">Connecting</span><h2>Looking for ring ${esc(vs.code)}…</h2><div><button class="btn soft" data-act="vs-cancel">Cancel</button></div></div>`;
    } else if (vs.role === 'guest' && vs.status === 'choosing') {
      const L = vs.lobby;
      body = `<div class="panel stack ring-open">
        <span class="eyebrow">Ring ${esc(vs.code)} · hosted by ${esc(L.hostName)}</span>
        <h2>${esc(L.mode === 'fair' ? 'Fair fight' : 'Bring your build')}${L.data.config.exchanges_per_round > 0 ? ` · ${L.rounds || L.data.config.rounds} rounds` : ''}</h2>
        <p class="muted" style="font-size:.9rem">The fight uses ${esc(L.hostName)}'s card sheet.</p>
        ${choiceSelect(L.mode, vs.myPick, 'vs-pick')}
        <div class="row"><button class="btn" data-act="vs-ready">Ready</button><button class="btn soft" data-act="vs-cancel">Leave</button></div>
      </div>`;
    } else if (vs.status === 'waiting') {
      body = `<div class="panel stack ring-open"><span class="eyebrow">Ready</span><h2>Waiting for the bell…</h2></div>`;
    } else body = '';
    return `<section class="stack" style="gap:16px">
      <div class="section-head"><div><span class="eyebrow">Player versus player</span><h1>Versus</h1></div>
        <div class="field" style="min-width:220px"><label for="vs-name">Your ring name</label><input id="vs-name" type="text" maxlength="40" placeholder="Challenger" value="${esc(name)}"></div></div>
      ${available ? '' : `<p class="warn">Online Versus isn't available in this copy of the game. It works in the downloaded game folder or a copy you host online (for example on GitHub Pages, Netlify or itch.io).</p>`}
      ${err}
      ${body}
      <details class="panel"><summary style="cursor:pointer;font-weight:700">How Versus works</summary>
        <ol class="steps" style="margin-top:10px">
          <li>The two browsers connect directly. A free public service (PeerJS) only introduces them; nothing about the fight is stored online.</li>
          <li>Both players need the same version of the game. The host's card sheet is used for the fight.</li>
          <li>Each turn has a ${d.config.pvp_turn_seconds}-second clock. If a connection drops, the other player waits ${d.config.pvp_disconnect_seconds} seconds before winning by forfeit. A short drop reconnects on its own.</li>
          <li>Wins pay ${d.config.pvp_xp_win} XP and losses ${d.config.pvp_xp_loss} XP to the character you fought with.</li>
          <li>Some strict office or school networks block direct connections. If two players can't connect, try a home or mobile connection.</li>
        </ol>
      </details>
    </section>`;
  }

  function inviteLink(code) {
    try {
      const u = new URL(window.location.href);
      if (!/^https?:$/.test(u.protocol)) return '';
      u.search = ''; u.hash = '';
      const keep = new URLSearchParams(window.location.search);
      const q = new URLSearchParams();
      ['peerhost', 'peerpath', 'peersecure'].forEach(k => { if (keep.get(k)) q.set(k, keep.get(k)); });
      q.set('join', code);
      return u.toString() + '?' + q.toString();
    } catch (e) { return ''; }
  }

  /* ---------- settings actions ---------- */
  function applyTables(tables, source) {
    const r = CB.compileData(withBuiltInTabs(tables), { source });
    if (r.errors.length) {
      app.settingsReport = { errors: r.errors, warnings: r.warnings, ok: '' };
      render(); toast('The sheet has errors. Nothing was changed.');
      return false;
    }
    app.data = r.data; app.rawTables = tables;
    app.dataInfo = { source, errors: [], warnings: r.warnings, at: Date.now() };
    store.set(KEYS.data, JSON.stringify({ tables, source, at: app.dataInfo.at }));
    Object.keys(app.save.characters).forEach(k => { if (!app.data.styles[k]) delete app.save.characters[k]; else CB.getCharacter(app.save, app.data, k); });
    if (app.save.activeRoot && !app.data.styles[app.save.activeRoot]) app.save.activeRoot = null;
    persist();
    app.settingsReport = { errors: [], warnings: r.warnings, ok: `Loaded ${r.data.cardList.length} cards, ${r.data.styleList.length} styles and ${r.data.opponents.length} opponents.` };
    render(); toast('Game data updated');
    return true;
  }

  async function syncSheet() {
    const input = document.getElementById('sheet-url');
    const val = input ? input.value.trim() : '';
    app.sheetInput = val;
    store.set(KEYS.sheet, val);
    if (!val) { toast('Paste your Google Sheet link first.'); return; }
    toast('Reading your sheet…');
    try {
      const tables = await CB.fetchSheetTables(val);
      applyTables(tables, 'Google Sheet');
    } catch (e) {
      const msg = /Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message))
        ? 'Couldn\'t reach Google Sheets. Check the sheet is shared as "Anyone with the link can view". If you\'re playing the copy hosted inside Claude, outside connections are blocked there: download each tab as CSV and use Load CSV files, or play the downloaded game folder to sync live.'
        : String(e && e.message || e);
      app.settingsReport = { errors: [msg], warnings: [], ok: '' };
      render();
    }
  }

  function loadCsvFiles(files) {
    const tables = { ...app.rawTables };
    const loaded = [];
    Promise.all([...files].map(f => f.text().then(text => {
      const base = f.name.replace(/\.csv$/i, '');
      const tab = CB.TABS.find(t => base.toLowerCase() === t.toLowerCase() || base.toLowerCase().endsWith(' - ' + t.toLowerCase()));
      if (tab) { tables[tab] = text; loaded.push(tab); }
    }))).then(() => {
      if (!loaded.length) { toast(`Name the files after the tabs: ${CB.TABS.join(', ')}.`); return; }
      applyTables(tables, `CSV files (${loaded.join(', ')})`);
    });
  }

  /* ---------- events ---------- */
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const act = t.dataset.act, d = app.data;
    switch (act) {
      case 'go':
        if (app.view === 'battle') return;
        app.view = t.dataset.view; app.settingsReport = null; app.confirmReset = false; render(); window.scrollTo(0, 0); break;
      case 'pick':
        app.save.activeRoot = t.dataset.root; CB.getCharacter(app.save, d, t.dataset.root); persist();
        app.view = 'ladder'; render(); window.scrollTo(0, 0); break;
      case 'fight': startBattle(t.dataset.opp); break;
      case 'shop-filter': app.shopFilter = t.dataset.f; render(); break;
      case 'buy': {
        const ch = char(), card = d.cards[t.dataset.card];
        const r = CB.buy(d, ch, card.id);
        if (r.ok) {
          persist();
          toast(r.upgraded ? `${d.cards[r.upgraded].name} upgraded to ${card.name}` : `${card.name} added to your ${r.addedToDeck ? 'deck' : 'collection (deck is full)'}`);
        } else toast(r.reason);
        render(); break;
      }
      case 'deck': {
        const ch = char(), id = t.dataset.card;
        CB.setDeckCount(d, ch, id, (ch.deck[id] || 0) + Number(t.dataset.d));
        persist(); render(); break;
      }
      case 'evolve': {
        const r = CB.evolve(d, char());
        if (r.ok) { persist(); toast(`Evolved into ${r.style.name}. New cards are in the shop.`); } else toast(r.reason);
        render(); break;
      }
      case 'play': playerPlay(Number(t.dataset.i)); break;
      case 'end-turn': playerEnd(); break;
      case 'leave': {
        const b = app.battle;
        if (!b) return;
        if (!b.leaveArmed) { b.leaveArmed = true; updateBattle(); return; }
        if (b.pvp) { if (!b.state.over) { vs.link && vs.link.send({ t: 'concede' }); vsEnd(1 - b.me, 'concede'); } break; }
        if (!b.done) { b.done = true; CB.recordResult(d, char(), b.opp, false); persist(); }
        closeBattle('ladder'); break;
      }
      case 'vs-host': vsHost(); break;
      case 'vs-join': vsJoin(); break;
      case 'vs-cancel': vsLeave(); vs.error = ''; render(); break;
      case 'vs-copy': {
        const text = t.dataset.text;
        const done = () => toast('Copied. Send it to your opponent.');
        const fallback = () => { const i = document.getElementById('vs-link'); if (i) { i.select(); } toast('Select the link and copy it'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
        break;
      }
      case 'vs-ready': {
        const sel = document.getElementById('vs-pick');
        const L = vs.lobby;
        const c = sel && fighterChoices(L.mode === 'fair' ? L.data : L.data, L.mode).find(x => x.key === sel.value);
        if (!c) { toast('Choose your fighter first.'); return; }
        vs.myPick = c.key;
        vs.link.send({ t: 'ready', spec: { styleId: c.styleId, deck: c.deck, root: c.root } });
        vs.status = 'waiting'; render(); break;
      }
      case 'sync': syncSheet(); break;
      case 'art-check':
        if (app.artReport && !app.artReport.done) return;
        t.disabled = true;
        runArtCheck().then(() => { t.disabled = false; });
        break;
      case 'reset-data':
        store.del(KEYS.data);
        applyTables({ ...window.CB_BAKED_TABLES }, 'Built-in sample data');
        store.del(KEYS.data);
        app.dataInfo.at = null;
        render(); break;
      case 'export': {
        const code = CB.exportSave(app.save);
        const ta = document.getElementById('save-code');
        ta.value = code;
        const done = () => toast('Save code copied');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { ta.select(); toast('Select the code and copy it'); });
        else { ta.select(); toast('Select the code and copy it'); }
        break;
      }
      case 'import': {
        const ta = document.getElementById('save-code');
        try {
          app.save = CB.importSave(ta.value);
          if (app.save.activeRoot && !d.styles[app.save.activeRoot]) app.save.activeRoot = null;
          persist(); toast('Save loaded'); app.view = app.save.activeRoot ? 'ladder' : 'select'; render();
        } catch (err) { toast('That code could not be read. Check it was copied in full.'); }
        break;
      }
      case 'reset-save':
        if (!app.confirmReset) { app.confirmReset = true; render(); break; }
        app.confirmReset = false; app.save = CB.newSave(); persist(); toast('Progress erased'); app.view = 'select'; render(); break;
    }
  });
  document.body.addEventListener('click', e => {
    const t = e.target.closest('.overlay [data-act="result"]');
    if (t) closeBattle(t.dataset.to);
    if (e.target.closest('.overlay [data-act="bell"]')) ringBell();
    const rm = e.target.closest('.overlay [data-act="vs-rematch"]');
    if (rm && vs.rematch && !rm.disabled) {
      vs.rematch.me = true; rm.disabled = true;
      vs.link && vs.link.send({ t: 'rematch' });
      const note = document.getElementById('rematch-note');
      if (note && !vs.rematch.them) note.textContent = `Waiting for ${F(app.battle, 1).name}…`;
      vsMaybeRematch();
    }
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'csv-files' && e.target.files.length) loadCsvFiles(e.target.files);
  });
  root.addEventListener('input', e => {
    if (e.target.id === 'sheet-url') app.sheetInput = e.target.value;
    if (e.target.id === 'vs-name') store.set('foxyfight.name', e.target.value.slice(0, 40));
  });
  root.addEventListener('change', e => {
    if (e.target.name === 'cutin-mode') { store.set('foxyfight.cutins', e.target.value); toast('Cut-in setting saved'); }
    if (e.target.name === 'vs-mode') {
      vs.mode = e.target.value;
      const wrap = document.getElementById('vs-fighter-wrap');
      const list = fighterChoices(app.data, vs.mode);
      if (wrap) wrap.innerHTML = list.length ? `<div class="field"><label for="vs-fighter">Your fighter</label><select id="vs-fighter">${list.map(c => `<option value="${esc(c.key)}">${esc(c.label)} · ${esc(c.note)}</option>`).join('')}</select></div>`
        : `<p class="muted">You don't have a fighter yet. Pick one on the main screen first, or choose a Fair fight.</p>`;
    }
  });
  // Skip the end-of-fight T.K.O. cut-in straight to the result screen. Uses
  // click and keyup (not pointerdown/keydown) so the same press can't also hit
  // a button on the result card that appears under it.
  document.addEventListener('click', () => { if (app.battle && app.battle.showResultNow) app.battle.showResultNow(); }, true);
  document.addEventListener('keyup', () => { if (app.battle && app.battle.showResultNow) app.battle.showResultNow(); });
  document.addEventListener('keydown', e => {
    if (app.view !== 'battle' || !app.battle || e.target.closest('input, textarea')) return;
    if (document.querySelector('.overlay')) return;
    if (/^[1-9]$/.test(e.key)) { playerPlay(Number(e.key) - 1); e.preventDefault(); }
    else if (e.key === 'e' || e.key === 'E') { playerEnd(); e.preventDefault(); }
  });

  /* ---------- boot ---------- */
  loadData();
  loadSave();
  try {
    const j = new URLSearchParams(window.location.search).get('join');
    if (j) { app.joinCode = CB.Net.cleanCode(j); app.view = 'versus'; }
  } catch (e) { /* ignore */ }
  render();
  window.ChainbloomApp = window.FoxyFightApp = app; // handy for debugging in the console
})();

