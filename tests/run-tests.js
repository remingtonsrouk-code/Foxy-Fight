#!/usr/bin/env node
/* Chainbloom rules tests. Run: node tests/run-tests.js */
const assert = require('assert');
const D = require('../src/data.js');
const E = require('../src/engine.js');
const AI = require('../src/ai.js');
const P = require('../src/progression.js');
const loadLocal = require('../tools/load-local.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n       ')); }
}

/* A tiny rules sandbox: one style, hand-picked cards, no randomness in the hand. */
const MINI = {
  Config: 'key,value\nhand_size,5\nenergy_per_turn,3\nfirst_turn_energy_penalty,0\ncombo_damage_per_link,1\ncombo_damage_cap,2\nblock_resets_each_turn,TRUE\ndiscard_hand_end_of_turn,TRUE\nturn_limit,30\nmax_cards_per_turn,10\nexchanges_per_round,0\nknockdowns_for_tko,0',
  Statuses: 'id,name,behavior,decay,ai_value\nbleed,Bleed,dot,turn,1\nexposed,Exposed,damage_taken_up,turn,1\nfocus,Focus,damage_dealt_up,consume,1\nstagger,Stagger,energy_down,clear,1\ndazed,Dazed,draw_down,clear,1\nfortify,Fortify,block_gain_up,turn,1\nthorns,Thorns,thorns,clear,1',
  Styles: 'id,name,root,hp,base_deck\nt,Tester,t,50,"op x4, li x4, hv x4"',
  Cards: [
    'id,name,style,tags,follows,cost,effects,link_bonus,xp_price,upgrade_of,max_copies',
    'op,Open,t,Opener,START,0,dmg:1,gain:focus:2,10,,',
    'li,Light,t,Light,"Opener, Light",1,dmg:2,dmg:1,10,,',
    'hv,Heavy,t,Heavy,Light,1,dmg:5,apply:bleed:2,10,,',
    'wi,Wild,t,Wild,ANY,0,block:1,,10,,',
    'gu,Guard,t,Guard,ANY,1,block:5,,10,,',
    'ch,Chainer,t,Finisher,Heavy,1,dmgchain:2,,10,,',
    'th,Thorny,t,Guard,ANY,0,gain:thorns:3,,10,,',
    'ex,Expose,t,Opener,START,0,apply:exposed:2,,10,,',
    'pi,Pierce,t,Heavy,ANY,0,pierce:4,,10,,',
    'mh,Multi,t,Light,ANY,0,dmg:1x3,,10,,',
    'li2,Light+,t,Light,"Opener, Light",1,dmg:3,dmg:1,20,li,',
    'zz,Zero draw,t,Light,ANY,0,draw:1,,10,,',
  ].join('\n'),
  Opponents: 'id,order,name,style,xp_reward\no1,1,One,t,30\no2,2,Two,t,40',
};
function mini(overrides) {
  const r = D.compileData(Object.assign({}, MINI, overrides || {}));
  if (r.errors.length) throw new Error(r.errors.join('; '));
  return r.data;
}
/* Build a match and then force a specific hand for the active player. */
function setup(data, hand, opts) {
  const s = E.createMatch(data, { styleId: 't' }, { styleId: 't' }, { seed: 1, firstPlayer: 0, noEvents: true });
  const me = s.fighters[0];
  me.hand = hand.map((id, i) => ({ uid: 1000 + i, id }));
  me.energy = (opts && opts.energy) != null ? opts.energy : 3;
  return s;
}
const play = (s, data, id) => {
  const i = s.fighters[s.active].hand.findIndex(c => c.id === id);
  assert(i >= 0, 'card ' + id + ' not in hand');
  return E.playCard(s, data, i);
};

console.log('Data');
test('CSV parser handles quotes, commas and blank rows', () => {
  const rows = D.rowsToObjects(D.parseCSV('a,b\n"x, y","say ""hi"""\n,\n1,2\n'));
  assert.deepStrictEqual(rows.map(r => [r.a, r.b]), [['x, y', 'say "hi"'], ['1', '2']]);
});
test('effects parse: multi-hit, statuses, unknowns reported', () => {
  const st = { bleed: {} };
  assert.deepStrictEqual(D.parseEffects('dmg:2x3; apply:bleed:2', st).effects, [{ op: 'dmg', n: 2, hits: 3 }, { op: 'apply', status: 'bleed', n: 2 }]);
  assert.strictEqual(D.parseEffects('zap:3', st).errors.length, 1);
  assert.strictEqual(D.parseEffects('apply:poison:1', st).errors.length, 1);
});
test('deck lists expand counts', () => {
  assert.deepStrictEqual(D.parseDeckList('a x2, b, c×3').ids, ['a', 'a', 'b', 'c', 'c', 'c']);
});
test('the shipped sheet data compiles with no errors or warnings', () => {
  const r = loadLocal();
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, []);
});
test('validation catches bad references', () => {
  const r = D.compileData(Object.assign({}, MINI, { Styles: 'id,name,root,hp,base_deck,evolves_to\nt,T,t,50,"nope x2",ghost' }));
  assert(r.errors.some(e => e.includes('nope')));
  assert(r.errors.some(e => e.includes('ghost')));
});
test('end-of-fight art columns load per opponent, with Config fallbacks', () => {
  const r = D.compileData(Object.assign({}, MINI, {
    Opponents: 'id,order,name,style,xp_reward,win_art,loss_art\no1,1,One,t,30,win1.png,\no2,2,Two,t,40,,',
    Config: MINI.Config + '\ndefault_loss_art,sad.png',
  }));
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.data.opponents[0].winArt, 'win1.png');
  assert.strictEqual(r.data.opponents[0].lossArt, '');
  assert.strictEqual(r.data.config.default_loss_art, 'sad.png');
  assert.strictEqual(r.data.config.default_win_art, '');
});
test('sheet id is extracted from a full URL', () => {
  assert.strictEqual(D.extractSheetId('https://docs.google.com/spreadsheets/d/abc_DEF-123/edit#gid=0'), 'abc_DEF-123');
});

console.log('Chains');
test('first card links only if it follows START', () => {
  const data = mini();
  let s = setup(data, ['op', 'li']);
  assert.strictEqual(play(s, data, 'op').linked, true);
  s = setup(data, ['li']);
  assert.strictEqual(play(s, data, 'li').linked, false);
});
test('chain follows tags; a break restarts at length 1', () => {
  const data = mini();
  const s = setup(data, ['op', 'li', 'hv', 'li']);
  play(s, data, 'op'); play(s, data, 'li');
  const r3 = play(s, data, 'hv');
  assert.strictEqual(r3.chain, 3);
  const r4 = play(s, data, 'li');           // Light does not follow Heavy
  assert.strictEqual(r4.linked, false);
  assert.strictEqual(r4.chain, 1);
});
test('Wild lets anything link after it; ANY links after anything', () => {
  const data = mini();
  const s = setup(data, ['gu', 'wi', 'hv']);
  play(s, data, 'gu');                       // not START: chain 1, unlinked
  assert.strictEqual(play(s, data, 'wi').linked, true);   // follows ANY
  assert.strictEqual(play(s, data, 'hv').linked, true);   // after Wild
});
test('link bonus, combo bonus and focus apply to the first hit', () => {
  const data = mini();
  const s = setup(data, ['op', 'li', 'hv']);
  const opp = s.fighters[1];
  play(s, data, 'op');                       // 1 dmg, link: gain 2 focus
  assert.strictEqual(opp.hp, 49);
  play(s, data, 'li');                       // 2 + combo 1 + focus 2, link +1 => 6
  assert.strictEqual(opp.hp, 43);
  assert.strictEqual(s.fighters[0].statuses.focus, undefined, 'focus is spent');
  play(s, data, 'hv');                       // 5 + combo 2 (cap 2) => 7, link bleed 2
  assert.strictEqual(opp.hp, 36);
  assert.strictEqual(opp.statuses.bleed, 2);
});
test('dmgchain scales with chain length', () => {
  const data = mini();
  const s = setup(data, ['op', 'li', 'hv', 'ch'], { energy: 5 });
  play(s, data, 'op'); play(s, data, 'li'); play(s, data, 'hv');
  const before = s.fighters[1].hp;
  play(s, data, 'ch');                       // 2 x 4 cards = 8, + combo cap 2
  assert.strictEqual(before - s.fighters[1].hp, 10);
});

console.log('Combat');
test('block absorbs damage, pierce ignores it', () => {
  const data = mini();
  const s = setup(data, ['pi', 'mh']);
  s.fighters[1].block = 3;
  play(s, data, 'pi');
  assert.strictEqual(s.fighters[1].hp, 46);
  assert.strictEqual(s.fighters[1].block, 3);
  play(s, data, 'mh');                       // links (ANY): hits of 2,1,1 into 3 block
  assert.strictEqual(s.fighters[1].hp, 45);
  assert.strictEqual(s.fighters[1].block, 0);
});
test('exposed adds damage to every hit', () => {
  const data = mini();
  const s = setup(data, ['ex', 'mh']);
  play(s, data, 'ex');
  play(s, data, 'mh');                       // ANY link => combo +1 on first hit; 3 hits of 1+2
  assert.strictEqual(s.fighters[1].hp, 50 - (3 + 3 + 3 + 1));
});
test('thorns hurt the attacker per hit', () => {
  const data = mini();
  const s = setup(data, ['mh']);
  s.fighters[1].statuses.thorns = 2;
  play(s, data, 'mh');
  assert.strictEqual(s.fighters[0].hp, 44);
});
test('bleed ticks at the owner\'s turn start and decays', () => {
  const data = mini();
  const s = setup(data, []);
  s.fighters[1].statuses.bleed = 3;
  E.endTurn(s, data);
  assert.strictEqual(s.fighters[1].hp, 47);
  assert.strictEqual(s.fighters[1].statuses.bleed, 2);
});
test('stagger and dazed reduce next turn energy and draw, then clear', () => {
  const data = mini();
  const s = setup(data, []);
  s.fighters[1].statuses.stagger = 1; s.fighters[1].statuses.dazed = 2;
  E.endTurn(s, data);
  assert.strictEqual(s.fighters[1].energy, 2);
  assert.strictEqual(s.fighters[1].hand.length, 3);
  assert.deepStrictEqual(s.fighters[1].statuses, {});
});
test('block resets at the start of your own turn', () => {
  const data = mini();
  const s = setup(data, ['gu']);
  play(s, data, 'gu');
  E.endTurn(s, data);
  assert.strictEqual(s.fighters[0].block, 5, 'block persists through the enemy turn');
  E.endTurn(s, data);
  assert.strictEqual(s.fighters[0].block, 0);
});
test('energy limits plays; deck reshuffles discard when empty', () => {
  const data = mini();
  const s = setup(data, ['li'], { energy: 0 });
  assert.strictEqual(E.playCard(s, data, 0).ok, false);
  const f = s.fighters[0];
  f.discard = f.deck.splice(0); f.hand = [];
  s.events = [];
  E.endTurn(s, data); E.endTurn(s, data);
  assert.strictEqual(f.hand.length, 5);
});
test('max_cards_per_turn stops zero-cost loops', () => {
  const data = mini();
  const s = setup(data, Array(14).fill('zz'), { energy: 0 });
  let n = 0;
  while (E.playCard(s, data, 0).ok) n++;
  assert.strictEqual(n, 10);
});
test('KO ends the match and later actions do nothing', () => {
  const data = mini();
  const s = setup(data, ['pi', 'pi']);
  s.fighters[1].hp = 4;
  play(s, data, 'pi');
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.winner, 0);
  assert.strictEqual(E.playCard(s, data, 0).ok, false);
});
test('first-turn penalties apply only to the first player', () => {
  const data = mini({ Config: MINI.Config.replace('first_turn_energy_penalty,0', 'first_turn_energy_penalty,2') + '\nfirst_turn_draw_penalty,1' });
  const s = E.createMatch(data, { styleId: 't' }, { styleId: 't' }, { seed: 3, firstPlayer: 1, noEvents: true });
  assert.strictEqual(s.fighters[1].energy, 1);
  assert.strictEqual(s.fighters[1].hand.length, 4);
  E.endTurn(s, data);
  assert.strictEqual(s.fighters[0].energy, 3);
  assert.strictEqual(s.fighters[0].hand.length, 5);
});

console.log('Rounds and knockdowns');
const ROUNDS = MINI.Config.replace('exchanges_per_round,0', 'exchanges_per_round,2').replace('knockdowns_for_tko,0', 'knockdowns_for_tko,3')
  + '\nrounds,3\ncorner_heal_percent,10\ncorner_clears_statuses,TRUE\ncorner_reshuffle,TRUE\nalternate_round_start,TRUE\nknockdown_recover_percent,25\nknockdown_clears_statuses,TRUE';
test('hitting 0 HP is a knockdown: get up with 25%, statuses clear, the turn ends', () => {
  const data = mini({ Config: ROUNDS });
  const s = setup(data, ['pi', 'pi']);
  s.fighters[1].hp = 3; s.fighters[1].statuses.bleed = 2;
  const r = play(s, data, 'pi');
  assert.strictEqual(r.knockdown, true);
  assert.strictEqual(s.over, false);
  assert.strictEqual(s.fighters[1].knockdowns, 1);
  assert.strictEqual(s.fighters[1].hp, 13);
  assert.deepStrictEqual(s.fighters[1].statuses, {});
  assert.strictEqual(s.active, 1, 'turn passed to the downed fighter');
});
test('the third knockdown is a T.K.O.', () => {
  const data = mini({ Config: ROUNDS });
  const s = setup(data, ['pi']);
  s.fighters[1].knockdowns = 2; s.fighters[1].hp = 2;
  play(s, data, 'pi');
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.endReason, 'tko');
  assert.strictEqual(s.winner, 0);
});
test('knockdowns_for_tko 0 keeps the old instant K.O.', () => {
  const data = mini();
  const s = setup(data, ['pi']);
  s.fighters[1].hp = 2;
  play(s, data, 'pi');
  assert.strictEqual(s.endReason, 'ko');
});
test('a Cut that drops you at turn start costs you that turn', () => {
  const data = mini({ Config: ROUNDS });
  const s = setup(data, []);
  s.fighters[1].hp = 2; s.fighters[1].statuses.bleed = 3;
  E.endTurn(s, data);
  assert.strictEqual(s.fighters[1].knockdowns, 1);
  assert.strictEqual(s.active, 0, 'straight back to the attacker');
});
test('a round ends after its exchanges: corner heal, clear, reshuffle, other fighter leads', () => {
  const data = mini({ Config: ROUNDS });
  const s = E.createMatch(data, { styleId: 't' }, { styleId: 't' }, { seed: 4, firstPlayer: 0, noEvents: true });
  s.fighters[0].hp = 20; s.fighters[1].statuses.exposed = 3;
  for (let k = 0; k < 4; k++) E.endTurn(s, data);           // 2 exchanges = round 1
  assert.strictEqual(s.round, 2);
  assert.strictEqual(s.scorecards.length, 1);
  assert.strictEqual(s.fighters[0].hp, 25);                  // +10% of 50
  assert.strictEqual(s.fighters[1].statuses.exposed, undefined);
  assert.strictEqual(s.active, 1, 'round 2 led by the other fighter');
  assert.strictEqual(s.fighters[0].deck.length + s.fighters[0].hand.length, 12);
});
test('judges: damage wins a round 10-9; a knockdown round is 10-8', () => {
  const data = mini({ Config: ROUNDS.replace('rounds,3', 'rounds,2') });
  const s = E.createMatch(data, { styleId: 't' }, { styleId: 't' }, { seed: 5, firstPlayer: 0, noEvents: true });
  s.roundStats.dmg = [12, 5];
  for (let k = 0; k < 4; k++) E.endTurn(s, data);
  assert.deepStrictEqual(s.scorecards[0].judges, [[10, 9], [10, 9], [10, 9]]);
  s.roundStats.dmg = [30, 5]; s.roundStats.kd = [1, 0];
  for (let k = 0; k < 4; k++) E.endTurn(s, data);
  assert.deepStrictEqual(s.scorecards[1].judges[0], [8, 10]);
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.endReason, 'decision');
  assert.strictEqual(s.decision.type, 'unanimous');   // 18-19 on every card
  assert.strictEqual(s.winner, 1);
});
test('split decisions happen when judges disagree', () => {
  const data = mini({ Config: ROUNDS.replace('rounds,3', 'rounds,1') });
  const s = E.createMatch(data, { styleId: 't' }, { styleId: 't' }, { seed: 6, firstPlayer: 0, noEvents: true });
  s.roundStats = { dmg: [10, 9], links: [0, 3], hits: [1, 1], kd: [0, 0] }; // J1: A, J2: B, J3: A
  for (let k = 0; k < 4; k++) E.endTurn(s, data);
  assert.strictEqual(s.decision.type, 'split');
  assert.strictEqual(s.winner, 0);
});

console.log('AI');
test('AI only picks legal cards and finds lethal', () => {
  const data = mini();
  const s = setup(data, ['gu', 'pi']);
  s.fighters[1].hp = 4; s.fighters[1].block = 10;
  const i = AI.chooseAction(s, data, { aggression: 1, caution: 1 });
  assert.strictEqual(s.fighters[0].hand[i].id, 'pi');
});
test('AI-vs-AI matches on the real data always finish', () => {
  const data = loadLocal().data;
  for (let k = 0; k < 20; k++) {
    const st = data.styleList[k % data.styleList.length].id, st2 = data.styleList[(k + 1) % data.styleList.length].id;
    const s = E.createMatch(data, { styleId: st }, { styleId: st2 }, { seed: k, noEvents: true });
    let guard = 0;
    while (!s.over && guard++ < 200) AI.playTurn(s, data);
    assert(s.over, 'match did not finish');
  }
});

console.log('Versus (lockstep)');
test('replaying the same moves on the same seed gives the identical fight', () => {
  const data = loadLocal().data;
  const specs = [{ name: 'A', styleId: 'petal_storm' }, { name: 'B', styleId: 'stone_lotus' }];
  for (let seed = 1; seed <= 5; seed++) {
    const live = E.createMatch(data, specs[0], specs[1], { seed, firstPlayer: seed % 2, noEvents: true, rounds: 3 });
    const moves = [];
    let guard = 0;
    while (!live.over && guard++ < 600) {
      const i = AI.chooseAction(live, data, { aggression: 1, caution: 1 }, { budget: 120 });
      if (i < 0) { moves.push(-1); E.endTurn(live, data); } else { moves.push(i); E.playCard(live, data, i); }
    }
    const copy = E.createMatch(data, specs[0], specs[1], { seed, firstPlayer: seed % 2, noEvents: true, rounds: 3 });
    moves.forEach(m => (m < 0 ? E.endTurn(copy, data) : E.playCard(copy, data, m)));
    const sig = s => JSON.stringify([s.winner, s.endReason, s.seed, s.turnCount, s.fighters.map(f => [f.hp, f.knockdowns, f.hand.map(c => c.id)]), s.scorecards]);
    assert.strictEqual(sig(copy), sig(live));
  }
});

console.log('Progression');
test('new character owns and fields the base deck', () => {
  const data = mini();
  const ch = P.newCharacter(data, 't');
  assert.strictEqual(P.deckSize(ch), 12);
  assert.strictEqual(ch.owned.op, 4);
});
test('upgrades convert a base copy in collection and deck', () => {
  const data = mini();
  const ch = P.newCharacter(data, 't'); ch.xp = 100;
  const r = P.buy(data, ch, 'li2');
  assert(r.ok);
  assert.strictEqual(ch.owned.li, 3); assert.strictEqual(ch.owned.li2, 1);
  assert.strictEqual(ch.deck.li, 3); assert.strictEqual(ch.deck.li2, 1);
  assert.strictEqual(ch.xp, 80);
});
test('cannot buy without XP or past the copy limit', () => {
  const data = mini();
  const ch = P.newCharacter(data, 't'); ch.xp = 5;
  assert.strictEqual(P.buy(data, ch, 'gu').ok, false);
  ch.xp = 1000;
  for (let k = 0; k < 3; k++) assert(P.buy(data, ch, 'gu').ok);
  assert.strictEqual(P.buy(data, ch, 'gu').ok, false);
});
test('deck editing respects owned copies and deck_max', () => {
  const data = mini();
  const ch = P.newCharacter(data, 't');
  assert.strictEqual(P.setDeckCount(data, ch, 'op', 9), 4);
  assert.strictEqual(P.setDeckCount(data, ch, 'op', 1), 1);
  assert.strictEqual(P.deckProblems(data, ch).length, 1);
});
test('ladder unlocks in order; replays pay less', () => {
  const data = mini();
  const ch = P.newCharacter(data, 't');
  assert.deepStrictEqual(P.ladderStatus(data, ch).map(x => x.unlocked), [true, false]);
  assert.strictEqual(P.recordResult(data, ch, data.opponents[0], true).gained, 30);
  assert.deepStrictEqual(P.ladderStatus(data, ch).map(x => x.unlocked), [true, true]);
  assert.strictEqual(P.recordResult(data, ch, data.opponents[0], true).gained, 15);
});
test('evolution needs XP and the required win, and unlocks new cards', () => {
  const data = loadLocal().data;
  const ch = P.newCharacter(data, 'petal_storm');
  assert(P.shopFor(data, ch).find(i => i.card.id === 'ps_bloom').locked);
  ch.xp = 500;
  assert.strictEqual(P.evolve(data, ch).ok, false);
  ch.beaten.opp_kiko = true;
  assert(P.evolve(data, ch).ok);
  assert.strictEqual(ch.styleId, 'sakura_tempest');
  const bloom = P.shopFor(data, ch).find(i => i.card.id === 'ps_bloom');
  assert(!bloom.locked && bloom.canBuy);
});
test('save codes round-trip, including non-ASCII text', () => {
  const save = P.newSave(); save.characters.x = { root: 'x', note: 'Café ✿' };
  assert.deepStrictEqual(P.importSave(P.exportSave(save)), save);
});
test('saves survive cards being removed from the sheet', () => {
  const data = mini();
  const save = P.newSave();
  const ch = P.getCharacter(save, data, 't');
  ch.owned.gone = 2; ch.deck.gone = 2;
  P.getCharacter(save, data, 't');
  assert.strictEqual(ch.owned.gone, undefined);
  assert.strictEqual(ch.deck.gone, undefined);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
