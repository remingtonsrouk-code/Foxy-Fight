#!/usr/bin/env node
/* Chainbloom rules tests. Run: node tests/run-tests.js */
const assert = require('assert');
const D = require('../src/data.js');
const E = require('../src/engine.js');
const AI = require('../src/ai.js');
const P = require('../src/progression.js');
const C = require('../src/cutins.js');
const loadLocal = require('../tools/load-local.js');

let passed = 0, failed = 0;
const pending = [];
function test(name, fn) {
  const ok = () => { passed++; console.log('  ok  ' + name); };
  const fail = e => { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n       ')); };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') pending.push(r.then(ok, fail));
    else ok();
  } catch (e) { fail(e); }
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

console.log('Cut-in art');
/* Two-style line (t evolves into t2) plus an opponent, for the art lookups. */
const ART = {
  Styles: 'id,name,root,hp,base_deck,evolves_to\nt,Tester,t,50,"op x4, li x4, hv x4",t2\nt2,Tester Two,t,50,"op x4, li x4, hv x4",',
  Opponents: 'id,order,name,style,xp_reward,win_art,loss_art\no1,1,One,t,30,,\no2,2,Two,t2,40,o2_win.png,',
};
const CUT_HEAD = 'fighter,move,profile_0,profile_1,profile_2,pov_0,pov_1,pov_2,source';
function art(cutRows, fighterRows, extra) {
  const r = D.compileData(Object.assign({}, MINI, ART, {
    CutIns: [CUT_HEAD, ...(cutRows || [])].join('\n'),
    Fighters: ['id,name,style,outfit_of,art,source', ...(fighterRows || [])].join('\n'),
  }, extra || {}));
  if (r.errors.length) throw new Error(r.errors.join('; '));
  return r;
}
test('sheets without CutIns or Fighters tabs still load cleanly', () => {
  const r = D.compileData(MINI);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, []);
  assert.deepStrictEqual(r.data.cutins, {});
});
test('a play event records the attacker\'s knockdowns from before the card', () => {
  const data = mini({ Config: ROUNDS });
  const s = E.createMatch(data, { styleId: 't' }, { styleId: 't' }, { seed: 1, firstPlayer: 0 });
  const me = s.fighters[0];
  me.hand = [{ uid: 900, id: 'mh' }]; me.energy = 3; me.knockdowns = 1;
  s.events = [];
  E.playCard(s, data, 0);
  assert.strictEqual(s.events.find(e => e.type === 'play').kd, 1);
});
test('Counterpunch can drop the attacker mid-card; the play event keeps the earlier count', () => {
  const data = mini({ Config: ROUNDS });
  const s = E.createMatch(data, { styleId: 't' }, { styleId: 't' }, { seed: 1, firstPlayer: 0 });
  const me = s.fighters[0];
  me.hand = [{ uid: 900, id: 'mh' }]; me.energy = 3; me.hp = 2;
  s.fighters[1].statuses.thorns = 3;
  s.events = [];
  E.playCard(s, data, 0);
  assert.strictEqual(me.knockdowns, 1, 'attacker went down');
  assert.strictEqual(s.events.find(e => e.type === 'play').kd, 0);
});
test('CutIns moves read as card ids, tags (any case), Knockdown, Victory or blank', () => {
  const { data, warnings } = art(['t,hv,a,,,,,,mine', 't,LIGHT,b,,,,,,mine', 't,Knockdown,c,,,,,,mine', 't,victory,d,,,,,,mine', 't,,e,,,,,,mine']);
  assert.deepStrictEqual(warnings, []);
  assert.deepStrictEqual(Object.keys(data.cutins.t).sort(), ['any', 'card:hv', 'knockdown', 'tag:light', 'victory']);
});
test('art problems are warnings, never errors', () => {
  const r = art(['ghost,Light,a.png,,,,,,mine', 't,Uppercut,a.png,,,,,,mine', 't,Light,a.png,,,,,,mine', 't,light,b.png,,,,,,mine', 'o1,Light,x.png,,,y.png,,,mine'],
    ['c1,Cee,nope,,,mine', 'c2,Cee,t,missing,,mine', 't,Clash,t,,,mine']);
  assert.deepStrictEqual(r.errors, []);
  const w = r.warnings.join('\n');
  ['"ghost" is not a style', '"Uppercut" is not a card id', 'repeats row', 'only ever seen in POV', 'style "nope"', 'outfit_of "missing"', 'already used by a style'].forEach(s => assert(w.includes(s), 'missing warning: ' + s));
});
test('a tab without its key columns is ignored with a warning (Google can return the wrong tab)', () => {
  const r = D.compileData(Object.assign({}, MINI, { CutIns: 'key,value\nhand_size,5' }));
  assert.deepStrictEqual(r.errors, []);
  assert(r.warnings[0].includes('CutIns tab is missing'));
  assert.deepStrictEqual(r.data.cutins, {});
});
test('face chains: evolution -> base style; opponent -> her style -> base style', () => {
  const { data } = art();
  assert.deepStrictEqual(C.faceChain(data, { styleId: 't2' }), ['t2', 't']);
  assert.deepStrictEqual(C.faceChain(data, { opponentId: 'o2' }), ['o2', 't2', 't']);
});
test('custom fighters: the outfit for this style first, then her other outfits, then the style', () => {
  const { data } = art([], ['roxy,Roxy,t,,,mine', 'roxy2,Roxy,t2,roxy,,mine']);
  assert.deepStrictEqual(C.faceChain(data, { styleId: 't2', look: 'roxy' }), ['roxy2', 'roxy', 't2', 't']);
  assert.deepStrictEqual(C.faceChain(data, { styleId: 't', look: 'roxy2' }), ['roxy', 't']);
});
test('lookup stays on the same face: card -> upgraded card -> tag -> any, before the next face', () => {
  const { data } = art(['t2,,t2_any.png,,,,,,mine', 't,li,t_li.png,,,,,,mine', 't2,Light,t2_light.png,,,,,,mine', 't2,li,t2_li.png,,,,,,mine']);
  const faces = C.faceChain(data, { styleId: 't2' });
  const q = id => C.resolveCutIn(data, faces, { kind: 'move', cardId: id, view: 'profile', slot: 0 }).src;
  assert.strictEqual(q('li2'), 't2_li.png', 'upgrade uses its base card row');
  assert.strictEqual(q('mh'), 't2_light.png', 'tag row on the same face beats the card row on the base style');
  assert.strictEqual(q('hv'), 't2_any.png', 'any-move row on the same face');
});
test('slots fall back to the nearest lower slot, then higher', () => {
  const { data } = art(['t,Light,l0.png,,l2.png,,p1.png,,mine']);
  const q = (view, slot) => (C.resolveCutIn(data, ['t'], { kind: 'move', cardId: 'li', view, slot }) || {}).src;
  assert.strictEqual(q('profile', 1), 'l0.png');
  assert.strictEqual(q('profile', 2), 'l2.png');
  assert.strictEqual(q('pov', 0), 'p1.png', 'higher slot when nothing lower exists');
  assert.strictEqual(q('pov', 2), 'p1.png');
});
test('knockdown and victory rows only match their own event, never a move row', () => {
  const { data } = art(['t,,any.png,,,,,,mine', 't,Knockdown,kd1.png,kd2.png,tko.png,,,,mine']);
  assert.strictEqual(C.resolveCutIn(data, ['t'], { kind: 'knockdown', view: 'profile', slot: C.knockdownSlot(3, true) }).src, 'tko.png');
  assert.strictEqual(C.resolveCutIn(data, ['t'], { kind: 'knockdown', view: 'profile', slot: C.knockdownSlot(2, false) }).src, 'kd2.png');
  assert.strictEqual(C.resolveCutIn(data, ['t'], { kind: 'victory', view: 'profile', slot: 0 }), null);
});
test('result art: opponent win_art/loss_art, then the winner\'s Victory art, then Config defaults', () => {
  const { data } = art(['t,Victory,me_win.png,,,,,,mine', 'o1,Victory,,,,her_win.png,,,mine'], [], { Config: MINI.Config + '\ndefault_win_art,dw.png\ndefault_loss_art,dl.png' });
  const o1 = data.opponents[0], o2 = data.opponents[1];
  const mine = C.faceChain(data, { styleId: 't' });
  assert.strictEqual(C.resultArt(data, { won: true, opponent: o2, myFaces: mine, winnerKd: 0 }).src, 'o2_win.png');
  assert.strictEqual(C.resultArt(data, { won: true, opponent: o1, myFaces: mine, winnerKd: 1 }).src, 'me_win.png');
  assert.strictEqual(C.resultArt(data, { won: false, opponent: o1, theirFaces: C.faceChain(data, { opponentId: 'o1' }), winnerKd: 0 }).src, 'her_win.png');
  assert.strictEqual(C.resultArt(data, { won: false, opponent: o2, theirFaces: C.faceChain(data, { opponentId: 'o2' }), winnerKd: 0 }).src, 'dl.png');
});
test('Google sync: optional tabs that are missing or come back as another tab are skipped', async () => {
  const bodies = { Config: 'key,value\nhand_size,5', Styles: 'id', Cards: 'id', Statuses: 'id', Opponents: 'id', CutIns: 'key,value\nhand_size,5' };
  const fake = async url => {
    const tab = decodeURIComponent(url.split('sheet=')[1]);
    if (tab === 'Fighters') return { ok: false, status: 400, text: async () => '' };
    return { ok: true, text: async () => bodies[tab] };
  };
  const tables = await D.fetchSheetTables('abc', fake);
  assert.deepStrictEqual(Object.keys(tables).sort(), ['Cards', 'Config', 'Opponents', 'Statuses', 'Styles']);
});
test('a path whose file is missing counts as blank, so the lookup keeps falling back', () => {
  const { data } = art(['t,Light,l0.png,l1.png,l2.png,,,,mine', 't2,Light,m0.png,m1.png,m2.png,,,,mine']);
  const faces = C.faceChain(data, { styleId: 't2' });
  const q = (slot, missing) => C.resolveCutIn(data, faces, { kind: 'move', cardId: 'li', view: 'profile', slot }, missing).src;
  assert.strictEqual(q(2, new Set(['m2.png'])), 'm1.png', 'same face, lower slot first');
  assert.strictEqual(q(2, new Set(['m0.png', 'm1.png', 'm2.png'])), 'l2.png', 'then the style she evolved from');
  assert.strictEqual(q(0, src => src.startsWith('m')), 'l0.png', 'a function works too');
  assert.deepStrictEqual(C.candidates(data, faces, 'profile'), ['m0.png', 'm1.png', 'm2.png', 'l0.png', 'l1.png', 'l2.png']);
});
test('result art skips a missing win_art file too', () => {
  const { data } = art(['t2,Victory,me_win.png,,,,,,mine']);
  const r = C.resultArt(data, { won: true, opponent: data.opponents[1], myFaces: ['t2'], winnerKd: 0, missing: new Set(['o2_win.png']) });
  assert.strictEqual(r.src, 'me_win.png');
});
test('a synced sheet without CutIns or Fighters borrows the built-in tabs; its own tabs win', () => {
  const builtIn = { CutIns: CUT_HEAD + '\nt,Light,built.png,,,,,,Claude', Fighters: 'id,name,style,outfit_of,art,source' };
  const borrowed = D.fillOptionalTabs(Object.assign({}, MINI, ART), builtIn);
  assert.strictEqual(D.compileData(borrowed).data.cutins.t['tag:light'].profile[0], 'built.png');
  const own = D.fillOptionalTabs(Object.assign({}, MINI, ART, { CutIns: CUT_HEAD + '\nt,Light,mine.png,,,,,,mine' }), builtIn);
  assert.strictEqual(D.compileData(own).data.cutins.t['tag:light'].profile[0], 'mine.png');
  const wrongTab = D.fillOptionalTabs(Object.assign({}, MINI, ART, { CutIns: 'key,value\nhand_size,5' }), builtIn);
  assert.strictEqual(D.compileData(wrongTab).data.cutins.t['tag:light'].profile[0], 'built.png', 'a tab Google swapped in does not count');
});
test('shipped CutIns: every picture has a path in a readable fighter folder; opponents have no profile paths', () => {
  const r = loadLocal();
  const plan = C.artPlan(r.data);
  assert.strictEqual(new Set(plan.map(f => f.folder)).size, plan.length, 'folder names are unique');
  assert.strictEqual(plan.find(f => f.fighter === 'petal_storm').folder, 'cherry-bomb');
  plan.forEach(f => f.rows.forEach(row => {
    const k = row.kind === 'card' ? 'card:' + row.move : row.kind === 'tag' ? 'tag:' + row.tag : row.kind;
    const cells = r.data.cutins[f.fighter][k];
    ['profile', 'pov'].forEach(view => [0, 1, 2].forEach(s => {
      if (f.views.includes(view)) assert.strictEqual(cells[view][s], C.artPath(r.data, f, row, view, s, 'png'));
      else assert.strictEqual(cells[view][s], '', `${f.fighter} ${row.move} has a ${view} path`);
    }));
  }));
});
test('the shipped art plan: 345 images, and CutIns has a row for every one', () => {
  const r = loadLocal();
  const plan = C.artPlan(r.data);
  const total = plan.reduce((n, f) => n + f.rows.length * f.views.length * C.CUTIN_SLOT_COUNT, 0);
  assert.strictEqual(total, 345);
  plan.forEach(f => f.rows.forEach(row => {
    const k = row.kind === 'card' ? 'card:' + row.move : row.kind === 'tag' ? 'tag:' + row.tag : row.kind;
    assert(r.data.cutins[f.fighter] && r.data.cutins[f.fighter][k], `no CutIns row for ${f.fighter} ${row.move}`);
  }));
  const ruby = plan.find(f => f.fighter === 'opp_jade');
  assert.deepStrictEqual(ruby.views, ['pov']);
  assert(ruby.rows.some(x => x.move === 'sl_monolith'), 'Monolith (Elite Guard) gets its own row');
});

Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
