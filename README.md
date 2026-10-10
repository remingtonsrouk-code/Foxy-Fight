# Foxy Fight

A turn-based 1v1 card fighter set in a cabaret-and-speakeasy boxing circuit. Each fighter has a style with a starting deck; you
win ladder fights for XP and spend it on new cards, upgrades to your basics, and
eventually an evolved style. Every number, name and card lives in a spreadsheet.

## Play

Open `index.html` in a browser (double-clicking it works). No install or server needed.
Progress saves in that browser. Use **Sheet & saves → Copy save code** to back it up
or move it to another device.

## Tune it from Google Sheets

1. Upload `dist/Foxy_Fight_Sheet_Template.xlsx` to Google Drive and open it with
   Google Sheets (or File › Import in an empty sheet).
2. Share › General access › **Anyone with the link** › Viewer.
3. In the game: **Sheet & saves**, paste the sheet link, press **Sync from sheet**.

The game checks the data before using it. If a tab has a typo (an unknown effect,
a deck listing a card that doesn't exist, a missing tab) you get the tab, row and
problem, and the game keeps the last good data.

The template stores every cell as plain text on purpose. Google's CSV export
guesses a type for each column and can blank out values in columns that mix
numbers and words (like Config's value column), so keep new columns formatted as
Plain text too (Format › Number › Plain text).

The copy of the game hosted inside Claude can't reach Google (outside connections
are blocked there). In that copy, download each tab as CSV (File › Download ›
CSV) and use **Load CSV files**. Files named `Cards.csv` or `Foxy Fight - Cards.csv`
both work.

### Tabs

| Tab | What it controls |
|---|---|
| Config | Hand size, energy, first-turn penalties, combo bonus, deck limits, XP rules, turn limit |
| Styles | Fighters: HP, energy, hand size, passives, starting deck, evolution path and cost |
| Cards | Every card: tags, what it follows, cost, effects, link bonus, shop price, upgrade path, art |
| Statuses | Bleed, Exposed, Focus and friends, built from reusable behaviors |
| Opponents | The ladder: order, style, deck, HP bonus, AI personality, XP reward, intro line, end-of-fight art (`win_art` when you beat her, `loss_art` when she beats you) |
| CutIns *(optional)* | Cut-in art: one row per fighter + move, with `profile_0..2` and `pov_0..2` image paths (all pre-filled) |
| Fighters *(optional)* | Custom looks a player can pick for a style, with optional evolved outfits (`outfit_of`) |

Sheets without CutIns or Fighters still load, and use the game's built-in copy of those tabs.

The **How to use** tab in the template covers the effect syntax. In short:
`dmg:5`, `dmg:2x3`, `pierce:4`, `dmgchain:2`, `block:5`, `heal:4`, `draw:1`,
`energy:1`, `apply:bleed:2`, `gain:focus:2`, joined with `;`.

Effects use status ids, which stayed the same through the reskin:
`bleed` = Cut, `exposed` = Wide Open, `focus` = Swagger, `stagger` = Winded,
`dazed` = Seeing Stars, `fortify` = Tight Guard, `thorns` = Counterpunch.
Card, style and opponent ids (`ps_jab`, `stone_lotus`, `opp_kiko`) also kept
their original names so every deck list and reference still works.

Every tab has a `source` column. Set it to `mine` on rows you write or edit
and Claude will leave that row's text alone.

## Cut-in art

A picture pops up when a card is played, on a knockdown and on the result
screen. **Sheet & saves → Cut-in art** sets how often (every card, big hits
only, or off) and has a **Check art files** button that lists, per fighter,
any picture the game can't find, with its exact expected path.

**Adding art takes no editing.** Every picture already has its path in the
CutIns tab, and `art/cutins/` has a folder per fighter (`cherry-bomb/`,
`lola-lux/` ...) whose `README.txt` lists the exact file names and what each
one shows. Drop finished files in with those names and upload the art folder
to GitHub. A picture that isn't there yet is skipped and the nearest one is
used instead (a lower fatigue level, then the tag picture, then the style she
evolved from), or a generated cut-in if there's none. Your Google Sheet doesn't
need the CutIns or Fighters tab; without them the game uses its built-in copy.

- **Face rule:** your fighter is always shown in profile, the opponent always in
  POV, coming at you. A card shows the attacker, a knockdown shows the fighter
  going down, the result screen shows the winner.
- **Pictures per fighter:** one set per tag, plus their own sets for every
  Finisher and Elite card (upgrades share their base card's set), plus
  Knockdown and Victory. Ladder opponents only need POV.
- **`_0 _1 _2`:** on moves, the knockdowns that fighter has taken (fresh, worn,
  battered). Knockdown: first, second, T.K.O. Victory: the knockdowns the
  winner took.
- **Format:** PNG in any shape (wide, square or tall): pop-ups and the result
  screen show the whole picture in its own shape, never cropped. About
  1200–1300 px on the long side is plenty. Lowercase names exactly as listed (GitHub
  Pages is case-sensitive). The exceptions are Victory (the win and defeat
  screens) and the T.K.O. picture in POV (`knockdown_pov_2`): those paths end
  in `.*`, so any image type works (`.png`, `.jpg`,
  `.webp`, `.gif`, `.avif`, `.svg`; an animated GIF or WebP plays). Keep the
  name and pick the ending, e.g. `victory_pov_0.gif` or `knockdown_pov_2.gif`. `npm run art-list -- --ext webp`
  switches the other paths to another format.
- **Art problems are warnings, never errors.** A typo won't stop the sheet
  loading; that picture just falls back.

`npm run art-list` keeps it all in step and is safe to rerun: it adds rows for
anything new (a card, style, opponent or custom fighter), fills blank paths,
rewrites each folder's list with ticks for the files already there, and writes
`art/ART_LIST.csv`. It never changes a filled cell or a row marked `mine`.

## Rules in one paragraph

You get energy each turn (3 by default) and draw a hand. Cards cost energy. Each
card has tags and a list of tags it follows. A card **links** if it follows the
card played just before it this turn (START links as the first card; ANY links
after anything; anything links after a Wild card). Linked cards add their Link
bonus, and attacks get a combo bonus that grows with chain length. Block lasts
until your next turn. Unplayed cards are discarded at end of turn. Going first
costs energy on turn one (tunable), because the game otherwise strongly favors
whoever strikes first.

## Rounds, knockdowns and the judges

Set in the Config tab (set `exchanges_per_round` to 0 to turn rounds off).

- A fight is `rounds` rounds (an opponent's `rounds` column can override it; Madame Ruby goes 5) of `exchanges_per_round` exchanges, one turn each.
- Hitting 0 HP is a knockdown: the turn ends at once and the fighter gets up with `knockdown_recover_percent` of max HP. The `knockdowns_for_tko`-th knockdown is a T.K.O. (0 or 1 = the old instant K.O.).
- Between rounds both fighters go to the corner: they recover `corner_heal_percent` of max HP, each status loses `corner_clears_statuses` stacks (TRUE clears all, FALSE keeps all), and decks are reshuffled. With `alternate_round_start` the other fighter leads off the next round.
- Three judges score every round 10-9 (10-10 if even). Judge 1 counts damage, judge 2 damage plus 2 per link, judge 3 damage plus 1 per landed hit. A fighter knocked down more in a round loses it 10-8 (10-7 for two more). After the last round the cards decide: unanimous, majority or split; if the judges split evenly, the fighter in better condition (higher HP %) gets it.

## Versus (player against player, online)

Open **Versus**, pick **Host a fight**, and send the invite link (or the six-letter code) to your opponent. When they open it, pick a fighter and press Ready, the bell rings.

- **Where it works:** the downloaded game folder or any copy you host on the web. The copy hosted inside Claude can't make outside connections, so its Versus screen explains this. The easiest way to share a link is to host the folder for free:
  - **Netlify Drop:** go to app.netlify.com/drop and drag the `foxy-fight` folder onto the page. You get a link straight away.
  - **GitHub Pages:** put the folder in a repository and turn on Pages in its settings.
  - **itch.io:** zip the folder, create an HTML project, and upload the zip.
  The single file `dist/foxy-fight.html` also works on its own, but it can't load images from the `art` folder.
- **How it connects:** the two browsers talk directly (WebRTC). The free PeerJS service only introduces them; no fight data is stored anywhere. To use your own PeerJS server instead, add `?peerhost=your.server:port` to the game's address.
- **Rules:** both players must run the same version of the game. The host's sheet data is used for the fight. The host picks **Bring your build** (saved characters and their upgraded decks) or **Fair fight** (starting styles and decks), and the number of rounds.
- **Turns and drops:** each turn has a `pvp_turn_seconds` clock (Config). If a connection drops, the game reconnects on its own when it can; after `pvp_disconnect_seconds` the player still there wins by forfeit. Reloading the page mid-fight counts as leaving.
- **XP:** `pvp_xp_win` / `pvp_xp_loss` go to the character you fought with.
- **Trust:** each browser knows both decks so it can run the fight, so this is for people you know. A rare network setup (some offices and schools) blocks direct connections; a home or mobile connection usually works.

## Balance tools (needs Node.js 18+)

```
npm test                      # rules tests
npm run sim                   # AI-vs-AI report from data/*.csv
node sim/simulate.js --sheet "<google sheet link>" --games 500
node sim/simulate.js --mode ladder --out report.md
npm run art-list              # cut-in paths, per-folder file lists, progress
```

The report shows style-vs-style win rates, chain statistics, first-player win
rate, per-card stats, how fights end (K.O. / T.K.O. / decision types), and ladder difficulty for a fresh deck and an "on curve"
deck that has spent the XP from earlier wins. `sim/latest-report.md` has the
numbers for the shipped data.

## Files

| Path | Purpose |
|---|---|
| `index.html` | The game |
| `src/data.js` | Sheet/CSV loading, effect parsing, validation (including the optional CutIns and Fighters tabs) |
| `src/engine.js` | Rules engine (pure functions, shared by game, AI and simulator) |
| `src/ai.js` | Opponent AI: searches play orders on a copy of the match |
| `src/progression.js` | Characters, XP, shop, upgrades, deck building, evolution, save codes |
| `src/cutins.js` | Cut-in art lookups: face chains, fallback order, result-screen art, the art plan (the pop-up itself is in `src/ui.js`) |
| `src/net.js`, `src/vendor/peerjs.min.js` | Versus connection (PeerJS, MIT licence) |
| `src/ui.js`, `src/styles.css`, `src/art.js` | Interface, cabaret theme, generated art-deco placeholder art |
| `src/baked-data.js` | Built-in copy of `data/*.csv` (regenerate with `npm run bake`) |
| `data/*.csv` | The sample data, one file per tab |
| `art/` | Drop real art here and reference it from the `art` columns; `art/cutins/<fighter>/` for cut-ins (each folder's README.txt lists its files) |
| `sim/simulate.js` | Balance simulator |
| `tests/run-tests.js` | Rules tests |
| `tools/` | Bake, single-file build, template builder, art list, `reskin_foxy.py` (the theme text pass) |

After editing `data/*.csv` directly, run `npm run bake` so the built-in data matches.
