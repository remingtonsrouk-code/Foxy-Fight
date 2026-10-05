"""One-off reskin to the Foxy Fight theme.
Changes only text and color columns. IDs, numbers, tags, follows, effects,
decks and every reference column are left exactly as they were.
Adds a `source` column (Claude) to every tab; rows marked `mine` are skipped."""
import csv, io, os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'data')

STATUSES = {
    'bleed':   dict(name='Cut', color='#d0566f', description='Lose HP equal to stacks at the start of your turn (ignores block). Loses 1 stack each turn.'),
    'exposed': dict(name='Wide Open', color='#e3a256', description='Each hit against you deals +1 damage per stack. Loses 1 stack each turn.'),
    'focus':   dict(name='Swagger', color='#d8b45c', description='Your next attack card deals +1 damage per stack to its first hit. Then it is spent.'),
    'stagger': dict(name='Winded', color='#6fa6b6', description='Start your next turn with 1 less energy per stack.'),
    'dazed':   dict(name='Seeing Stars', color='#b39ad3', description='Draw 1 fewer card per stack next turn.'),
    'fortify': dict(name='Tight Guard', color='#5fa898', description='Gain +1 extra block per stack whenever you gain block. Loses 1 stack each turn.'),
    'thorns':  dict(name='Counterpunch', color='#cf7d58', description='When an enemy hits you, they take damage equal to stacks. Clears at the start of your turn.'),
}

STYLES = {
    'petal_storm': dict(name='Cherry Bomb', color='#c8374f', description=
        "Swarmer. A loud, fast, bubblegum-punk brawler who never stops throwing and opens Cuts by sheer volume. "
        "She and Vicki Starr have been trading insults since the arcade days. Draws 6 cards a turn."),
    'sakura_tempest': dict(name='Main Event', color='#dba542', description=
        "Showboat swarmer. Cherry Bomb with top billing, a spotlight, and the timing to match. "
        "Starts every turn with 1 Swagger and draws 6 cards. Unlocks the Elite finishers."),
    'stone_lotus': dict(name='Velvet Hammer', color='#7a3358', description=
        "Slugger. A torch singer who fights the late show: slow, smoky, and devastating. She lets you spend yourself, then ends the evening in one swing. "
        "Ingrid Kessler wants her spot on the bill. 4 energy a turn and 2 block at the start of every turn."),
    'jade_colossus': dict(name='Brick House', color='#9a5338', description=
        "Counter-puncher. Velvet Hammer fully built: harder to get into than the venue and twice as unforgiving. "
        "4 energy and 3 block at the start of every turn. Unlocks the Elite slams and guards."),
}

# id: (name, flavor)
CARDS = {
    # Cherry Bomb (Petal Storm)
    'ps_step':        ('Blow a Kiss', "Pucker up. It's the last free thing you get tonight."),
    'ps_jab':         ('Lipstick Jab', 'Leaves a mark. Usually a red one.'),
    'ps_kick':        ('Switchblade Hook', "Fast, thin, and gone before you feel it."),
    'ps_slash':       ('Rhinestone Cross', "Sequins are a girl's best friend. Ask your eyebrow."),
    'ps_flurry':      ('Encore', 'The crowd wanted more. So did she.'),
    'ps_guard':       ('Peek-a-Boo', 'Hands up, eyes open, smile on.'),
    'ps_jab_plus':    ('Lipstick Jab+', 'Fresh coat. Same bad news.'),
    'ps_kick_plus':   ('Switchblade Hook+', 'Sharper on the second pass.'),
    'ps_slash_plus':  ('Rhinestone Cross+', 'More sparkle. More stitches.'),
    'ps_flurry_plus': ('Encore+', 'By popular demand.'),
    'ps_guard_plus':  ('Peek-a-Boo+', "Now you see her. Now you're on the canvas."),
    'ps_feint':       ('Cherry Feint', 'She telegraphs the left. On purpose.'),
    'ps_cyclone':     ('Rat-a-Tat', 'Three to the jaw and a wink for the cheap seats.'),
    'ps_leaf':        ('Bob & Weave', "You can't hit a girl who's already somewhere else."),
    # Main Event (Sakura Tempest) elites
    'ps_bloom':       ('Curtain Call', 'Take a bow, darling. Someone will help you up.'),
    'ps_hurricane':   ('Standing Ovation', 'The whole house is on its feet. Except you.'),
    # Velvet Hammer (Stone Lotus)
    'sl_stance':      ('Touch Gloves', 'Manners first. It makes the rest so much more personal.'),
    'sl_palm':        ('Velvet Jab', 'Soft on the outside.'),
    'sl_slam':        ('Liver Shot', 'Somewhere south of the ribs, a whole evening ends.'),
    'sl_wall':        ('High Guard', 'Elbows in, chin down, one eyebrow up.'),
    'sl_throw':       ('Last Call', "Bar's closed, sugar. Somebody get her a cab."),
    'sl_breath':      ('Smoke Break', 'One drag, one breath, one long look at the damage.'),
    'sl_palm_plus':   ('Velvet Jab+', 'Plusher glove. Same brick inside.'),
    'sl_slam_plus':   ('Liver Shot+', "She found the spot. She'll find it again."),
    'sl_wall_plus':   ('High Guard+', 'Higher, tighter, ruder.'),
    'sl_throw_plus':  ('Last Call+', 'Closing time comes early.'),
    'sl_thornshell':  ('Cover Up', 'Go ahead, swing. I bill by the hit.'),
    'sl_quake':       ('Shoulder Bump', 'Excuse me. I said excuse me.'),
    'sl_moss':        ('Lean on the Ropes', "Let her punch herself out. Then dance."),
    # Brick House (Jade Colossus) elites
    'sl_avalanche':   ('Ten Count', "She's never needed to count past ten."),
    'sl_monolith':    ("Bouncer's Guard", "You're not on the list, honey."),
    # Neutral
    'n_wind':         ('Second Wind', 'Smelling salts and spite.'),
    'n_clear':        ('Strike a Pose', 'One for the cameras. One for her.'),
    'n_haymaker':     ('Haymaker', 'No subtlety. No refunds.'),
    'n_rush':         ('Rushdown', 'Corner her. Keep her there.'),
}

OPPONENTS = {
    'opp_mochi':   dict(name='Lola Lux', title='Ring Card Rebel', color='#e79ab0',
                        intro="Honey, I've walked this ring a thousand times. Tonight I'm staying."),
    'opp_juniper': dict(name='Dolores "Dee" Maddox', title='The Late Shift', color='#7d6a92',
                        intro="Twenty years of three a.m. fights. You're not the worst thing I'll see tonight."),
    'opp_kiko':    dict(name='Vicki "High Score" Starr', title='Arcade Champion', color='#e0577a',
                        intro="Insert coin, sweetheart. I'll make it quick."),
    'opp_marlowe': dict(name='Ingrid Kessler', title='The Cold Front', color='#7aa5b8',
                        intro='Hold still. This only takes one.'),
    'opp_sora':    dict(name='Scarlett Delacroix', title='The Velvet Rope', color='#a8243c',
                        intro="Everyone gets one dance with me, darling. Make it count."),
    'opp_jade':    dict(name='Madame Ruby', title='The House', color='#b8862f',
                        intro="The house always wins, dear. I simply prefer to collect in person."),
}

def edit(tab, fn):
    path = os.path.join(ROOT, tab + '.csv')
    rows = list(csv.reader(open(path, newline='', encoding='utf-8')))
    head = rows[0]
    if 'source' not in head:
        head.append('source')
        for r in rows[1:]:
            r.extend([''] * (len(head) - 1 - len(r)))
            r.append('Claude')
    out = [head]
    skipped = []
    for r in rows[1:]:
        d = dict(zip(head, r))
        if d.get('source', '').strip().lower() == 'mine':
            skipped.append(d.get(head[0]))
        else:
            fn(d)
        out.append([d.get(k, '') for k in head])
    buf = io.StringIO()
    csv.writer(buf, lineterminator='\n').writerows(out)
    open(path, 'w', encoding='utf-8').write(buf.getvalue())
    if skipped:
        print(f'{tab}: left your rows alone: {skipped}')

def statuses(d):
    d.update(STATUSES.get(d['id'], {}))
def styles(d):
    d.update(STYLES.get(d['id'], {}))
def cards(d):
    if d['id'] in CARDS:
        d['name'], d['flavor'] = CARDS[d['id']]
def opponents(d):
    d.update(OPPONENTS.get(d['id'], {}))

edit('Config', lambda d: None)
edit('Statuses', statuses)
edit('Styles', styles)
edit('Cards', cards)
edit('Opponents', opponents)
print('Reskin applied.')
