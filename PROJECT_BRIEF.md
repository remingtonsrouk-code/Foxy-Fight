# Foxy Fight — project brief

Read this first. It is the hand-off from the original build conversation and is
the source of truth for decisions, voice, rules of collaboration and what's next.
Owner: Owl. Last updated: 2026-10-09.

## 1. What the game is

A turn-based 1v1 card fighter set on a cabaret-and-speakeasy women's boxing
circuit (glamorous, femme-fatale, 80s-arcade-cheesecake and noir). Each fighter
has a style with a starting deck. Players win ladder fights for XP and spend it
deliberately (no random packs) on new cards, upgrades to basics, and evolving
their style. Online Versus lets two people fight browser to browser.

Everything tunable lives in a Google Sheet (or `data/*.csv`): numbers, names,
text, decks, art, ladder, rules settings.

## 2. Current state (all working and tested)

- **Combat:** chain combos only (no meter). Cards have tags (Opener, Light,
  Heavy, Finisher, Guard, Wild) and a "follows" list; a card that follows the
  previous card's tag links, adding its link bonus and combo damage.
- **Rounds:** 3 rounds x 3 exchanges; corner break between rounds; knockdowns at
  0 HP (3rd = T.K.O.); three judges score 10-point must; decisions (unanimous,
  majority, split, technical).
- **Progression:** per-character XP, deterministic shop, upgrades (`upgrade_of`),
  deck editor (12–20 cards), style evolution (XP + beating a set opponent), save
  codes for backup and moving between devices.
- **Content:** 2 style lines (4 styles), 35 cards, 7 statuses, 6-fight ladder.
- **End-of-fight art:** per-opponent `win_art` / `loss_art`, Config defaults,
  generated art-deco fallback.
- **Versus:** client to client via PeerJS/WebRTC, lockstep (both browsers run
  the same deterministic engine; only moves are sent, each with a state
  fingerprint). Host's sheet is used. Modes: Bring your build / Fair fight. Turn
  clock, reconnect after drops, forfeit after a grace period, concede, rematch.
  Works on the downloaded or self-hosted copy (GitHub Pages), not on the copy
  hosted inside Claude.
- **Look:** cabaret/speakeasy — gold and cream on oxblood black, art-deco frames,
  Limelight (display) + Josefin Sans (body). Single dark theme by design.
- **Quality:** 61 rules tests pass (`npm test`); AI-vs-AI simulator
  (`npm run sim`); browser playthroughs of ladder, rounds and two-browser Versus.

Owl has cleared the ladder as Cherry Bomb, evolved to Main Event, and tested
both Versus modes. Feedback so far: everything works; testers ask for more
styles and more cards.

## 3. Content today

### Styles (ids never change; names do)
| id | Name | Archetype | Identity |
|---|---|---|---|
| petal_storm | Cherry Bomb | Swarmer | 6 cards a turn, cheap chains, Cut (bleed). HP 102 |
| sakura_tempest | Main Event | Showboat swarmer (evolution) | +1 Swagger each turn, Elite finishers. HP 102 |
| stone_lotus | Velvet Hammer | Slugger, torch singer | 4 energy, 2 block each turn, heavy hits. HP 74 |
| jade_colossus | Brick House | Counter-puncher (evolution) | 4 energy, 3 block each turn, Elite slams/guards. HP 78 |

### Statuses (id = name shown)
bleed = Cut, exposed = Wide Open, focus = Swagger, stagger = Winded,
dazed = Seeing Stars, fortify = Tight Guard, thorns = Counterpunch.

### Ladder
1 Lola Lux (Ring Card Rebel) · 2 Dolores "Dee" Maddox (The Late Shift) ·
3 Vicki "High Score" Starr (Arcade Champion) · 4 Ingrid Kessler (The Cold
Front) · 5 Scarlett Delacroix (The Velvet Rope) · 6 Madame Ruby (The House,
5 rounds). Rivalry hooks: Lola carried Scarlett's round cards; Dee trained
Ingrid; Vicki vs Scarlett for the marquee; Ruby owns the venue and most
contracts; Cherry Bomb vs Vicki; Velvet Hammer vs Ingrid.

## 4. Voice, naming and content boundaries

- **Tone:** glamorous, sultry, femme-fatale, 80s-arcade-cheesecake or noir, mixed
  per character. Flirtatious banter, innuendo-level humor, swagger. Light R at
  most: suggestive and playful, some swearing allowed, never explicit. The fight
  is the focus; charm comes through the fighting.
- **Distinct voices:** e.g. bubbly showgirl (Lola), tired noir veteran (Dee),
  cocky arcade champ (Vicki), ice-cold heavy hitter (Ingrid), sultry nightclub
  femme fatale (Scarlett), polite menace (Ruby).
- **Boundaries:** no sexually explicit content or graphic sexual description; no
  nudity or undressing as mechanic or reward; every character clearly adult, no
  school-age or youthful-coded framing; no real people. If a request goes past
  these, say so plainly, skip that piece, offer a tamer version, keep working.
- **Move naming:** the name signals the tag and effect.
  Opener = entrance/tease (Blow a Kiss, Touch Gloves) · Light = jab words
  (Lipstick Jab) · Heavy = power punches (Rhinestone Cross, Liver Shot) ·
  Finisher = showstoppers (Encore, Last Call, Ten Count) · Guard = shells (High
  Guard, Peek-a-Boo, Cover Up) · Wild = footwork (Bob & Weave).
  Effect words: Cut = edges/sparkle; Wide Open = openings; Swagger = showing
  off; Winded = body shots; Seeing Stars = bells/lights; Counterpunch = make
  them pay. Upgrades keep the `+` suffix. Flavor: one or two lines.
- **Owl's choices on record:** Thornshell became "Cover Up" (not "Don't Touch the
  Merchandise"); title is "Foxy Fight"; look is cabaret/speakeasy.

## 5. How Owl wants to work

- Work in batches and show before/after tables for approval.
- Every tab has a `source` column (`Claude` / `mine`). Never rewrite or strip
  rows marked `mine`; flag them if they're outside the boundaries and leave them.
  Balance, formatting and cost-curve help on Owl's rows is fine without
  rewriting the text.
- Flag uncertain names or lines instead of silently softening them.
- Keep ids stable; if a rename would break a reference, update it and say so.
- Owl prefers principled, clearly reasoned guidance and structured output
  organized by function.
- Owl tests on GitHub Pages and the Claude-hosted copy; ship a rebuilt zip and
  sheet template after changes.

## 6. Balance targets and current numbers

Targets: base styles 45–55% against each other; an evolution 60–70% against its
own base; first player 45–55%; ladder "fresh" deck falls off from opponent 3,
"on curve" (upgraded with earlier XP) stays roughly 50–80%.
Current (`sim/latest-report.md`): base vs base about even (51/55), first player
54%, evolutions 60–70% over their base, ladder on curve ~50–88%. Weakest spot:
Velvet Hammer vs Scarlett on curve (~49%). Fights end ~1/3 T.K.O., ~2/3
decisions, ~2.5 knockdowns per fight.

Tuning history worth remembering:
- Zero-cost draw cards can loop forever → `max_cards_per_turn` cap (10); Petal
  Jab+ lost its draw.
- Going first is a big edge in a race; penalty is 1 energy on the very first
  turn (it was 2 before rounds).
- With rounds: corner removes 2 stacks of each status (clearing all killed the
  swarmer; keeping all let Cut snowball); knockdowns clear statuses and restore
  15% HP; Cherry Bomb/Main Event HP raised to 102; Lola −26 and Scarlett −30 HP.

## 7. Architecture (for code work)

Plain HTML/JS, no build step needed to play (`index.html`). Engine is pure and
deterministic (seeded RNG in the state) so the same code drives the GUI, the AI
look-ahead, the simulator and Versus lockstep.

| File | Role |
|---|---|
| `src/data.js` | CSV/Sheet loading, effect parsing (`dmg:4; apply:bleed:1`), validation with tab/row errors, Config defaults |
| `src/engine.js` | Rules: turns, chains, effects, statuses, rounds, corner, knockdowns, judges, decisions |
| `src/ai.js` | Opponent AI: searches play orders on a cloned state; personality from Opponents `aggression`/`caution` |
| `src/progression.js` | Characters, XP, shop, upgrades, deck rules, evolution, ladder unlocks, save codes |
| `src/ui.js` | All screens; battle view uses `b.me` so the local player is always at the bottom (needed for Versus) |
| `src/net.js` + `src/vendor/peerjs.min.js` | Versus transport (PeerJS, MIT) |
| `src/art.js`, `src/styles.css` | Generated art-deco art; theme |
| `src/cutins.js` | Cut-in art lookups: face chains, fallback order, result art, art plan; the pop-up layer, file checks and Art check live in `src/ui.js` |
| `tools/art-list.js` | Keeps CutIns paths, `art/cutins/` folder lists and `art/ART_LIST.csv` in step |
| `data/*.csv` | Sample data = the sheet's tabs: Config, Styles, Cards, Statuses, Opponents, plus optional CutIns and Fighters |
| `src/baked-data.js` | Built-in copy of the CSVs (`npm run bake`) |
| `sim/simulate.js` | Balance report; `--games N`, `--mode styles|ladder`, `--sheet <link>`, `--out file` |
| `tests/run-tests.js` | Rules tests |
| `tools/build.js` | `dist/foxy-fight.html` (single file with Versus) and `dist/foxy-fight-fragment.html` (Claude-hosted copy, no PeerJS) |
| `tools/make_template.py` | Builds `dist/Foxy_Fight_Sheet_Template.xlsx` (all cells plain text so Google's CSV export keeps mixed columns) |

Effect vocabulary: `dmg:N`, `dmg:NxM`, `pierce:N`, `dmgchain:N`, `block:N`,
`heal:N`, `draw:N`, `energy:N`, `apply:status:N`, `gain:status:N`.
Status behaviors: dot, damage_taken_up, damage_dealt_up, energy_down,
draw_down, block_gain_up, thorns. Decays: turn, clear, consume, none.
Follows tokens: `START` (first card of turn), `ANY`; tag `Wild` lets anything
link after it. New mechanics need code; once added they're usable from the sheet.

After editing CSVs: `npm run bake`, `npm test`, `npm run sim`, then
`node tools/build.js && python3 tools/make_template.py`.

## 8. Agreed next steps (roadmap)

Recommended plan, awaiting Owl's pick of where to start:
1. **Infrastructure for replay value:** a `circuit` column on Opponents so the
   ladder becomes multiple circuits; an XP sink once the shop is bought out
   (titles, alternate art, prestige); achievements/mastery goals; optional
   challenge fights with modifiers; Versus win/loss records per friend.
2. **Content "drops":** each drop = one new style line (base + evolution, ~16
   cards: 6 starter, 8 shop, 2 Elite) + 2–3 neutral cards + a 3–4 fight circuit
   + one new mechanic, checked with the simulator before release.
   Proposed order: **Dirty fighter** (low blows that cost judges' points via a
   referee-warning mechanic; uses rounds) → **Outboxer** (stick and move,
   "Footwork" status that reduces the next hit; wins on the cards) → **true
   Counter-puncher** (trap statuses that trigger on the opponent's attack).
3. Design aim within each style: two viable builds so deck choice matters.
4. **Fight cut-ins** (spec locked 2026-10-08; **Batch 1 built**, Batch 2 next).
   Art pop-ups for card plays, knockdowns/T.K.O. and the result screen.
   - *Batch 1 (done 2026-10-08):* `kd` on the play event; optional `CutIns`
     and `Fighters` tabs (parsed in `src/data.js`; art problems are warnings,
     never errors; Google sync skips them if absent or if Google returns
     another tab); `src/cutins.js` (face chains, fallback resolver,
     result-screen art, preload candidates, art plan, file naming).
   - *Batch 1b, drop-in art (done 2026-10-08, Owl's ask: no sheet editing):*
     every one of the 345 paths is pre-filled in CutIns
     (`art/cutins/<readable fighter folder>/<tag or card name>_<view>_<n>.png`;
     opponents have no profile paths). `art/cutins/<folder>/README.txt` lists
     each folder's file names and what to draw, ticking files already there.
     A path whose file is missing counts as blank (resolver takes a
     `missing` set/function), so art can be uploaded half-done. A sheet
     without CutIns/Fighters borrows the built-in tabs (`fillOptionalTabs`).
     `npm run art-list` (`-- --ext webp` to switch format) adds rows, fills
     blank paths, rewrites folder lists and `art/ART_LIST.csv`; never changes
     a filled cell or a `mine` row. Template: Art List tab dropped (folder
     lists replace it). 58 tests. Sim identical to the shipped report.
   - *Victory any-type (done 2026-10-09, Owl's ask):* Victory paths (win and
     defeat screens) end in `.*` and accept any image type (`expandSrc`:
     png, jpg, jpeg, webp, gif, avif, svg, then uppercase PNG/JPG/JPEG; first
     found wins; animated GIF/WebP plays). Every other path stays exact
     `.png`; `--ext` never touches Victory. `pickSrc` also covers
     win_art/loss_art and Config defaults. 60 tests.
   - *T.K.O. POV any-type (done 2026-10-09, Owl's ask):* Knockdown `pov_2`
     (the opponent going down for good, seen by the winner) also ends in
     `.*` (10 cells; `anyType()` in `src/cutins.js`). Other knockdown
     pictures stay `.png`. 61 tests.
   - *Batch 2 (built 2026-10-09, Owl tests it):* `index.html` and
     `tools/build.js` load `src/cutins.js`; `ui.js` fills missing optional
     tabs from the built-in copy at every compile (raw tables stay unfilled,
     so updated built-in paths win over a stale cache); at fight start
     `prepCutIns` checks every file both faces could show (HEAD on a hosted
     copy, image load on file://; `.*` cells try types in order) and only
     confirmed files are used; `preloadCutIns` downloads each deck card at
     current fatigue plus the next knockdown, refreshed after knockdowns;
     `runCutIns` shows card cut-ins (~1 s, a new card replaces the old),
     knockdowns (1.7 s) and the T.K.O. (held until the result card, which
     waits 3 s instead of 0.9 s); AI pause after a knockdown 2.3 s when
     cut-ins are on; result screen uses `CB.resultArt` (win_art/loss_art →
     Victory cut-in → Config default → generated). Sheet & saves gets a
     Cut-in art panel: All / Big hits (Heavy, Finisher, Elite) / Off, which
     CutIns source is in use, and Check art files (per-fighter found/total
     and missing paths). Missing art = no pop-up (no generated card
     cut-ins: 345 placeholders would be noise; the result screen keeps its
     generated fallback). Not browser-tested by Claude at Owl's request.
     Pre-existing, untouched: `render()` calls an undefined `renderBattle()`
     if it ever runs mid-fight (nothing calls it there today).
   - *Batch 2 original plan, for reference:* load `src/cutins.js` in `index.html` and
     `tools/build.js`; wire `fillOptionalTabs` into sheet sync, CSV load and
     cached data (defaults = `CB_BAKED_TABLES`); at fight start load
     `candidates` for the slots in play and record failures as `missing`
     (for `.*` cells, try `expandSrc` in order and stop at the first that
     loads; probe Victory lazily or in the background);
     cut-in layer in `ui.js` driven by `drain()` events (`play` with `kd`,
     `knockdown`, result screen via `resultArt`); settings toggle;
     generated placeholder; longer pause after a T.K.O.; an "Art check" list
     in Sheet & saves showing which pictures are missing (progress without
     npm); browser check.
   - *Batch 3:* look picker (Style screen), save field, Versus spec field,
     rebuilt zip and template.
   - *Owl's decisions:* ladder art keyed by opponent; each style (base and
     evolution) has its own face, evolution = same face, new outfit; custom
     fighters can override the style face (tag-level art); per-tag art, with
     card-specific art for Finishers and Elites; fatigue = unique art sets per
     knockdown count, not an overlay; Openers, Guards and Wilds each share one
     set per style; knockdown/T.K.O. and victory/defeat get character art that
     differs by side; tab name `CutIns`.
   - *Face rule (proposed):* your fighter is always shown in profile, the
     opponent always in POV. Card = attacker's face; knockdown = the fighter
     going down; result = the winner.
   - *CutIns tab (proposed):* `fighter` (style, opponent or custom id),
     `move` (card id, tag, `Knockdown`, `Victory`, or blank = any),
     `profile_0..2`, `pov_0..2`, `source`. Index = knockdowns already taken
     (moves), which knockdown with 2 = T.K.O. (Knockdown row), knockdowns the
     winner took (Victory row). Opponents need POV columns only. Upgrades reuse
     the base card's art. Opponents' `win_art`/`loss_art` stay as ladder
     overrides. Missing tab = no error.
   - *Fallback:* exhaust the same face first (card → base card → tag → any),
     then next face (custom → current style → base style; opponent → her
     style), then a generated deco cut-in.
   - *Custom fighters (proposed):* `Fighters` tab — `id`, `name`, `style`,
     `outfit_of` (optional evolved outfit, like `upgrade_of`), `art`,
     `source`. Picked per character on the Style screen; saved with the
     character; sent in the Versus spec (cosmetic, can't desync).
   - *Engine:* add `kd` to the `play` event (cosmetic; Counterpunch can drop
     the attacker mid-card).
   - *UI:* non-modal layer (not `.overlay`, which pauses the Versus clock and
     blocks keys); ~0.9 s; new play replaces current; preload at fight start;
     settings toggle All / Big hits / Off; reduced-motion fade; slightly longer
     pause before the result screen after a T.K.O.
   - *Art volume:* full set ≈ 345 (styles 216, ladder opponents 129, POV only);
     minimum to see it working 24 + 18.
   - *Settled:* defeat screen shows the winner in POV (Owl provides the art);
     Monolith (Elite Guard) gets its own art; names `CutIns`, `Fighters`,
     `outfit_of`, `Knockdown`, `Victory` approved.
   - *File naming:* `art/cutins/<fighter folder>/<tag or card name>_<view>_<n>.png`,
     16:9 (1280×720), lowercase. Victory files: any image type
     (`victory_<view>_<n>.<any>`). Paths are pre-filled; Owl only drops files in.
   - *Boundary note:* fatigue reads through sweat, hair, smudged makeup,
     swelling, tape and posture, not clothing damage (no undressing as
     mechanic).

## 9. Known limits

- Versus trusts both browsers (each knows both decks) — fine for friends.
- Both Versus players need the same game version; refresh after updates.
- Claude-hosted copy can't reach Google Sheets, outside images or Versus; use
  Load CSV files there, or the GitHub Pages copy.
- Saves live per browser per web address; move them with save codes.
- AI is a heuristic search; balance numbers come from AI play, not people.

## 10. Session log

- **2026-10-08:** Feasibility discussion for card-play cut-in art (roadmap
  item 4). No code or data changed, so tests and simulator weren't rerun.
  Note: a `CLAUDE.md` was asked for but isn't in the project; this brief and
  the README are the references. Later the same day Owl made the cut-in
  decisions (roadmap item 4) and added knockdown/T.K.O. and result-screen art
  to the scope. Then settled the last three points and Batch 1 was built:
  engine `kd` field, CutIns/Fighters tabs, `src/cutins.js`, art-list tool,
  template with Art List tab, 14 new tests (54 pass). Simulator output is
  byte-identical to `sim/latest-report.md` (no rules change). Existing data
  tabs untouched. The rebuilt template is in `dist/` but `dist/foxy-fight.html`
  was not rebuilt (nothing visible changes until Batch 2). Owl found the
  fill-in-the-sheet flow too many steps, so Batch 1b pre-filled every path,
  built the per-fighter art folders with file lists, made missing files fall
  back like blanks, and let sheets without the new tabs use the built-in copy.
  Owl now only drops files into `art/cutins/` and uploads.
- **2026-10-09:** GitHub update steps given. Owl chose: Victory (win and
  defeat) cut-ins accept any image type; all other cut-ins stay PNG. Victory
  paths switched to `.*` (42 cells), folder lists and README updated.
  Then the T.K.O. POV picture (Knockdown pov_2) got the same rule (10 cells).
  Owl uploaded all the art and saw no pop-ups (expected: Batch 2 wasn't built
  yet). Batch 2 built and delivered for Owl to test on GitHub Pages.
