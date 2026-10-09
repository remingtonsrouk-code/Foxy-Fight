#!/usr/bin/env node
/* Cut-in art: one command keeps the CutIns tab and the art folder in step.
 *
 *   npm run art-list                    (re)builds everything below
 *   npm run art-list -- --ext webp      use .webp instead of .png for the
 *                                       paths this tool writes
 *
 * What it does, every time (safe to rerun):
 *   1. adds a CutIns row for anything new (card, style, opponent, fighter)
 *   2. fills every blank art cell with its path. Never changes a cell that
 *      already has a value, and never touches a row whose source is "mine"
 *   3. writes art/cutins/<fighter>/README.txt: the exact file names to drop in
 *      and what each one shows, ticking the ones already there
 *   4. writes art/cutins/README.txt (the overview) and art/ART_LIST.csv
 *
 * A path whose file isn't there yet is fine: the game treats it as blank and
 * uses the nearest picture it has. So the art folder can go up half-done. */
const fs = require('fs'), path = require('path');
const D = require('../src/data.js');
const C = require('../src/cutins.js');
const loadLocal = require('./load-local.js');

const ROOT = path.join(__dirname, '..');
const CUT = path.join(ROOT, 'data', 'CutIns.csv');
const ART = path.join(ROOT, 'art');
const HEADER = ['fighter', 'move', 'profile_0', 'profile_1', 'profile_2', 'pov_0', 'pov_1', 'pov_2', 'source'];

const FATIGUE = ['Fresh.', 'Worn: sweat sheen, hair coming loose, breathing hard.', 'Battered: swelling, smudged makeup, taped hands, heavy shoulders.'];
const KD = ['First knockdown.', 'Second knockdown.', 'T.K.O., down for good.'];
const WIN = ['A clean win, no knockdowns taken.', 'A win after one knockdown.', 'A hard-won win after two knockdowns.'];
const ACTION = {
  opener: ['teasing her opponent before the exchange', 'teasing the viewer before the exchange'],
  light: ['throwing a quick jab', 'throwing a quick jab straight at the viewer'],
  heavy: ['throwing a power punch', 'throwing a power punch straight at the viewer'],
  finisher: ['throwing her finisher', 'throwing her finisher straight at the viewer'],
  guard: ['shelled up behind her guard', 'shelled up behind her guard, facing the viewer'],
  wild: ['slipping and weaving on her feet', 'slipping and weaving in front of the viewer'],
};

function arg(name, d) { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';

function describe(face, row, view, slot) {
  const pov = view === 'pov' ? 1 : 0;
  const who = face.name;
  if (row.kind === 'knockdown') return pov ? `${who} crumpling to the canvas in front of the viewer. ${KD[slot]}` : `${who} hitting the canvas, side view. ${KD[slot]}`;
  if (row.kind === 'victory') return pov ? `${who} standing over the viewer, victorious (the viewer lost). ${WIN[slot]}` : `${who} triumphant, side or three-quarter view. ${WIN[slot]}`;
  const act = row.kind === 'card' ? (pov ? `landing ${row.label} on the viewer` : `throwing ${row.label}`)
    : ACTION[row.tag] ? ACTION[row.tag][pov] : `doing a ${row.label} move${pov ? ' at the viewer' : ''}`;
  return `${who} ${act}${pov ? '' : ', side view'}. ${FATIGUE[slot]}`;
}

function main() {
  const ext = String(arg('ext', 'png')).replace(/^\./, '').toLowerCase();
  const r = loadLocal();
  if (r.errors.length) { console.error('Data errors:\n- ' + r.errors.join('\n- ')); process.exit(1); }
  const data = r.data;
  const plan = C.artPlan(data);

  // ---- 1 + 2: CutIns rows and paths ----
  let text = fs.existsSync(CUT) ? fs.readFileSync(CUT, 'utf8') : '';
  const raw = text.trim() ? D.parseCSV(text) : [HEADER.slice()];
  const head = raw[0].map(h => h.trim().toLowerCase());
  HEADER.forEach(h => { if (!head.includes(h)) { head.push(h); raw[0].push(h); } });
  const col = h => head.indexOf(h);
  const keyOf = (fighter, move) => {
    const m = String(move || '').trim();
    if (!m) return fighter + '|any';
    if (data.cards[m]) return fighter + '|card:' + m;
    return fighter + '|' + m.toLowerCase();
  };
  const planKey = (face, row) => face.fighter + '|' + (row.kind === 'card' ? 'card:' + row.move : String(row.move).toLowerCase());
  const at = {};
  raw.forEach((cells, i) => {
    if (!i || String(cells[0] || '').trim().startsWith('#')) return;
    const k = keyOf(String(cells[col('fighter')] || '').trim(), cells[col('move')]);
    if (!(k in at)) at[k] = i;
  });

  let added = 0, filled = 0, repathed = 0, skippedMine = 0;
  plan.forEach(face => face.rows.forEach(row => {
    let i = at[planKey(face, row)];
    if (i == null) {
      const cells = head.map(h => (h === 'fighter' ? face.fighter : h === 'move' ? row.move : h === 'source' ? 'Claude' : ''));
      raw.push(cells); i = raw.length - 1; at[planKey(face, row)] = i; added++;
    }
    const cells = raw[i];
    while (cells.length < head.length) cells.push('');
    if (String(cells[col('source')] || '').trim().toLowerCase() === 'mine') { skippedMine++; return; }
    face.views.forEach(view => {
      for (let s = 0; s < C.CUTIN_SLOT_COUNT; s++) {
        const c = col(`${view}_${s}`);
        const want = C.artPath(data, face, row, view, s, ext);
        const base = want.slice(0, want.lastIndexOf('.') + 1);
        const cur = String(cells[c] || '').trim();
        if (!cur) { cells[c] = want; filled++; }
        else if (cur !== want && cur.startsWith(base) && !cur.slice(base.length).includes('/')) { cells[c] = want; repathed++; }
      }
    });
  }));
  const out = toCsv(raw);
  if (out !== text) fs.writeFileSync(CUT, out);

  // ---- 3 + 4: folders, lists ----
  const cellOf = (face, row, view, s) => String(raw[at[planKey(face, row)]][col(`${view}_${s}`)] || '').trim();
  const exists = p => p && !/^https?:/.test(p) && fs.existsSync(path.join(ROOT, p));
  const listRows = [['done', 'face', 'type', 'folder', 'move', 'covers', 'view', 'slot', 'what_to_draw', 'file']];
  const summary = [];
  let total = 0, have = 0;
  const overview = [];
  plan.forEach(face => {
    const dir = path.join(ART, 'cutins', face.folder);
    fs.mkdirSync(dir, { recursive: true });
    let fTotal = 0, fHave = 0;
    const body = [];
    face.rows.forEach(row => {
      const covers = row.covers.length ? `  ·  covers ${row.covers.join(', ')}` : '';
      body.push('', `${row.kind === 'card' ? row.label.toUpperCase() + ' (' + row.move + ')' : String(row.move).toUpperCase()}${covers}`);
      face.views.forEach(view => {
        for (let s = 0; s < C.CUTIN_SLOT_COUNT; s++) {
          const file = cellOf(face, row, view, s);
          const ok = exists(file);
          const what = describe(face, row, view, s);
          const inFolder = file.startsWith(`art/cutins/${face.folder}/`) ? file.slice(`art/cutins/${face.folder}/`.length) : file;
          body.push(`  [${ok ? 'x' : ' '}] ${inFolder.padEnd(34)} ${what}`);
          listRows.push([ok ? '✓' : '', face.name, face.kind, face.folder, row.move, row.covers.join(' · '), view, s, what, file]);
          total++; fTotal++; if (ok) { have++; fHave++; }
        }
      });
    });
    const kindLine = face.kind === 'style' ? `style ${face.fighter}` : face.kind === 'opponent' ? `ladder opponent ${face.fighter}` : `custom fighter ${face.fighter}`;
    const views = face.views.length > 1
      ? 'profile = her throwing it, side view (what her own player sees)\npov     = it coming straight at the viewer (what her opponent sees)'
      : 'pov only = it coming straight at the viewer. You never see ladder opponents in profile.';
    fs.writeFileSync(path.join(dir, 'README.txt'), [
      `${face.name.toUpperCase()}  (${kindLine})`,
      `${fTotal} pictures, ${fHave} in place. [x] = already in this folder.`,
      '',
      'Drop each picture into this folder with exactly the name below (lowercase).',
      views,
      '_0 _1 _2 on a move = knockdowns she has taken: fresh / worn / battered.',
      'Knockdown _0 _1 _2  = first knockdown / second / T.K.O.',
      'Victory   _0 _1 _2  = she won after taking 0 / 1 / 2 knockdowns.',
      'Missing pictures are fine: the game uses the nearest one it has.',
      ...body, '',
    ].join('\n'));
    overview.push(`  ${(face.folder + '/').padEnd(28)} ${face.name}${face.kind === 'opponent' ? ' (ladder, POV only)' : face.kind === 'custom' ? ' (custom fighter)' : ''}  ·  ${fHave} of ${fTotal}`);
    summary.push(`${face.name.padEnd(28)} ${String(fHave).padStart(3)} / ${fTotal}`);
  });

  fs.writeFileSync(path.join(ART, 'cutins', 'README.txt'), [
    'FOXY FIGHT CUT-IN ART',
    `${have} of ${total} pictures in place.`,
    '',
    'Every picture already has its path in the CutIns tab. To add art, drop the',
    'file into its fighter folder with the exact name listed in that folder\'s',
    'README.txt, then upload the art folder to GitHub. Nothing else to edit.',
    'Pictures that are not there yet are fine: the game falls back to the nearest',
    'one it has (a lower fatigue level, the tag picture, the style she evolved',
    'from), and draws a generated cut-in if there is none.',
    '',
    'Format',
    `  .${ext}, 16:9, 1280 x 720. Lowercase names, exactly as listed (GitHub Pages`,
    '  is case-sensitive). Smaller files load faster: aim for under 500 KB each.',
    '  To switch every listed path to another format: npm run art-list -- --ext webp',
    '',
    'Who is who',
    '  Your fighter is always shown in profile; the opponent always in POV, coming',
    '  at you. A card shows the attacker, a knockdown shows the fighter going down,',
    '  the result screen shows the winner.',
    '',
    'Fatigue shows through sweat, hair, smudged makeup, swelling, tape and posture,',
    'never through clothing damage.',
    '',
    'Uploading on github.com: Add file > Upload files, then drag folders in.',
    'GitHub takes up to 100 files per upload, so send a few fighter folders at a time.',
    '',
    'Folders',
    ...overview, '',
  ].join('\n'));

  fs.writeFileSync(path.join(ART, 'ART_LIST.csv'), toCsv(listRows));
  console.log(summary.join('\n'));
  console.log(`\n${have} of ${total} pictures in place.`);
  console.log(`CutIns: ${added} rows added, ${filled} paths filled${repathed ? `, ${repathed} switched to .${ext}` : ''}${skippedMine ? `, ${skippedMine} rows marked mine left alone` : ''}.`);
}

main();
