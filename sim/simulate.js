#!/usr/bin/env node
/* Chainbloom balance simulator.
 * Runs AI-vs-AI matches on the current sheet data and reports win rates.
 *
 *   node sim/simulate.js                      # styles + ladder + card report, 300 games per pairing
 *   node sim/simulate.js --games 1000
 *   node sim/simulate.js --mode styles        # styles | ladder | all
 *   node sim/simulate.js --data path/to/csvs  # a folder with Config.csv, Cards.csv ...
 *   node sim/simulate.js --sheet <google sheet id or url>   # pull live from Google Sheets
 *   node sim/simulate.js --out report.md
 */
const fs = require('fs');
const E = require('../src/engine.js');
const AI = require('../src/ai.js');
const D = require('../src/data.js');
const P = require('../src/progression.js');
const loadLocal = require('../tools/load-local.js');

function args() {
  const a = process.argv.slice(2), o = { games: 300, mode: 'all', seed: 1 };
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
  o.games = +o.games; o.seed = +o.seed;
  return o;
}

const BALANCED = { aggression: 1, caution: 1 };

const endings = { ko: 0, tko: 0, decision: 0, time: 0, unanimous: 0, split: 0, majority: 0, technical: 0, games: 0, rounds: 0, knockdowns: 0 };
function runMatch(data, specA, specB, seed, firstPlayer, profA, profB, rounds) {
  const s = E.createMatch(data, specA, specB, { seed, firstPlayer, noEvents: true, rounds });
  let guard = 0;
  while (!s.over && guard++ < 500) {
    AI.playTurn(s, data, s.active === 0 ? profA : profB, { budget: 300 });
  }
  endings.games++; endings[s.endReason] = (endings[s.endReason] || 0) + 1;
  if (s.decision) endings[s.decision.type]++;
  endings.rounds += s.round; endings.knockdowns += s.fighters[0].knockdowns + s.fighters[1].knockdowns;
  return s;
}

const pct = x => (100 * x).toFixed(1) + '%';
function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(String(h).length, ...rows.map(r => String(r[i]).length)));
  const line = r => '| ' + r.map((c, i) => String(c).padEnd(w[i])).join(' | ') + ' |';
  return [line(headers), '|' + w.map(n => '-'.repeat(n + 2)).join('|') + '|', ...rows.map(line)].join('\n');
}

async function main() {
  const o = args();
  let compiled;
  if (o.sheet) compiled = D.compileData(await D.fetchSheetTables(o.sheet), { source: 'google sheet' });
  else compiled = loadLocal(o.data);
  if (compiled.errors.length) { console.error('Data errors:\n- ' + compiled.errors.join('\n- ')); process.exit(1); }
  const data = compiled.data;
  const out = [];
  const log = s => { out.push(s); console.log(s); };
  const cardAgg = {};
  const addCardStats = (f, won) => {
    for (const id in f.stats.cardPlays) {
      const a = cardAgg[id] || (cardAgg[id] = { plays: 0, links: 0, dmg: 0, games: 0, wins: 0 });
      a.plays += f.stats.cardPlays[id]; a.links += f.stats.cardLinks[id] || 0; a.dmg += f.stats.cardDamage[id] || 0;
      a.games++; if (won) a.wins++;
    }
  };

  log(`# Foxy Fight balance report\n\n${o.games} games per pairing, first player alternates. Both sides use the same AI.\n`);
  let seed = o.seed * 100003;
  let firstWins = 0, totalGames = 0;

  if (o.mode === 'all' || o.mode === 'styles') {
    log('## Style vs style (base decks, row = player)\n');
    const styles = data.styleList;
    const rows = [];
    const chainStats = [];
    styles.forEach(a => {
      const row = [a.name];
      let chainSum = 0, chainN = 0, linkSum = 0, playSum = 0;
      styles.forEach(b => {
        let wins = 0, rounds = 0;
        for (let g = 0; g < o.games; g++) {
          const s = runMatch(data, { styleId: a.id }, { styleId: b.id }, seed++, g % 2, BALANCED, BALANCED);
          if (s.winner === 0) wins++;
          if (s.winner === s.first) firstWins++;
          totalGames++;
          rounds += s.roundsMode ? s.round : s.exchange;
          const f = s.fighters[0];
          chainSum += f.stats.bestChain; chainN++; linkSum += f.stats.links; playSum += f.stats.played;
          addCardStats(f, s.winner === 0); addCardStats(s.fighters[1], s.winner === 1);
        }
        row.push(`${pct(wins / o.games)} (${(rounds / o.games).toFixed(1)}r)`);
      });
      rows.push(row);
      chainStats.push([a.name, (chainSum / chainN).toFixed(2), pct(linkSum / Math.max(1, playSum))]);
    });
    log(table(['', ...styles.map(s => s.name)], rows));
    log(`\n(r = average ${data.config.exchanges_per_round > 0 ? 'rounds' : 'exchanges'} per fight)\n`);
    log('### Chain behaviour\n');
    log(table(['Style', 'Avg best chain', 'Cards played as links'], chainStats));
    log(`\nFirst player won ${pct(firstWins / Math.max(1, totalGames))} of style games.\n`);
  }

  if (o.mode === 'all' || o.mode === 'ladder') {
    log('## Ladder difficulty\n');
    log('"Fresh" = the starting deck. "On curve" = a deck upgraded with the XP from first wins over every earlier opponent, spent by a simple shopper (upgrades first, cheapest first, then new cards). Evolution is bought instead once its requirements are met.\n');
    const roots = data.styleList.filter(s => s.root === s.id);
    const curveDeck = (rootId, budget, beatenIds) => {
      const ch = P.newCharacter(data, rootId);
      ch.xp = budget; beatenIds.forEach(id => { ch.beaten[id] = true; });
      const ev = P.evolveInfo(data, ch);
      if (ev && ev.canEvolve) P.evolve(data, ch);
      for (let guard = 0; guard < 100; guard++) {
        const items = P.shopFor(data, ch).filter(i => i.canBuy)
          .sort((a, b) => (b.isUpgrade - a.isUpgrade) || (a.price - b.price));
        if (!items.length) break;
        P.buy(data, ch, items[0].card.id);
      }
      return { styleId: ch.styleId, deck: P.deckIds(ch) };
    };
    const rows = data.opponents.map((opp, k) => {
      const row = [`${opp.order}. ${opp.name}`];
      const earlier = data.opponents.slice(0, k);
      const budget = earlier.reduce((a, x) => a + x.xpReward, 0);
      roots.forEach(r => {
        const curve = curveDeck(r.id, budget, earlier.map(x => x.id));
        for (const spec of [{ styleId: r.id }, curve]) {
          let wins = 0;
          for (let g = 0; g < o.games; g++) {
            const s = runMatch(data, spec, { styleId: opp.style, deck: opp.deck, hpBonus: opp.hpBonus }, seed++, g % 2, BALANCED,
              { aggression: opp.aggression, caution: opp.caution }, opp.rounds);
            if (s.winner === 0) wins++;
          }
          row.push(pct(wins / o.games));
        }
      });
      row.push(budget);
      return row;
    });
    log(table(['Opponent', ...roots.flatMap(r => [r.name + ' fresh', r.name + ' on curve']), 'XP banked'], rows));
    log('\nAim for "fresh" falling steadily and "on curve" staying around 50-70%, so upgrades feel necessary but the ladder never stalls.\n');
  }

  if (Object.keys(cardAgg).length) {
    log('## Cards (from style-vs-style games)\n');
    const rows = Object.entries(cardAgg)
      .sort((a, b) => b[1].plays - a[1].plays)
      .map(([id, a]) => [data.cards[id].name, data.cards[id].style, a.plays, pct(a.links / a.plays), (a.dmg / a.plays).toFixed(2), pct(a.wins / a.games)]);
    log(table(['Card', 'Style', 'Plays', 'Linked', 'Dmg/play', 'Win% when played'], rows));
    log('\nShop-only cards appear here only when an opponent deck uses them; run with --mode ladder to see those matchups.');
  }

  if (endings.games) {
    const e = endings, p2 = n => pct(n / e.games);
    log('## How fights end (all games above)\n');
    log(table(['K.O.', 'T.K.O.', 'Decision', 'of which unanimous / split / majority / technical', 'Avg rounds', 'Knockdowns per fight'],
      [[p2(e.ko), p2(e.tko), p2(e.decision), `${p2(e.unanimous)} / ${p2(e.split)} / ${p2(e.majority)} / ${p2(e.technical)}`, (e.rounds / e.games).toFixed(2), (e.knockdowns / e.games).toFixed(2)]]));
    log('');
  }

  if (o.out) { fs.writeFileSync(o.out, out.join('\n') + '\n'); console.log(`\nSaved ${o.out}`); }
}

main().catch(e => { console.error(e); process.exit(1); });
