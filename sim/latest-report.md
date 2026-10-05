# Chainbloom balance report

150 games per pairing, first player alternates. Both sides use the same AI.

## Style vs style (base decks, row = player)

|               | Cherry Bomb  | Main Event   | Velvet Hammer | Brick House  |
|---------------|--------------|--------------|---------------|--------------|
| Cherry Bomb   | 62.0% (3.0r) | 37.3% (3.0r) | 50.7% (3.0r)  | 32.0% (3.0r) |
| Main Event    | 69.3% (3.0r) | 50.7% (3.0r) | 62.7% (3.0r)  | 41.3% (3.0r) |
| Velvet Hammer | 54.7% (3.0r) | 52.7% (3.0r) | 52.0% (3.0r)  | 29.3% (3.0r) |
| Brick House   | 63.3% (3.0r) | 62.0% (3.0r) | 69.3% (3.0r)  | 50.7% (3.0r) |

(r = average rounds per fight)

### Chain behaviour

| Style         | Avg best chain | Cards played as links |
|---------------|----------------|-----------------------|
| Cherry Bomb   | 5.43           | 83.4%                 |
| Main Event    | 5.45           | 83.5%                 |
| Velvet Hammer | 3.97           | 82.6%                 |
| Brick House   | 4.01           | 83.1%                 |

First player won 54.2% of style games.

## Ladder difficulty

"Fresh" = the starting deck. "On curve" = a deck upgraded with the XP from first wins over every earlier opponent, spent by a simple shopper (upgrades first, cheapest first, then new cards). Evolution is bought instead once its requirements are met.

| Opponent                    | Cherry Bomb fresh | Cherry Bomb on curve | Velvet Hammer fresh | Velvet Hammer on curve | XP banked |
|-----------------------------|-------------------|----------------------|---------------------|------------------------|-----------|
| 1. Lola Lux                 | 78.7%             | 79.3%                | 89.3%               | 88.0%                  | 0         |
| 2. Dolores "Dee" Maddox     | 72.0%             | 78.7%                | 70.0%               | 81.3%                  | 30        |
| 3. Vicki "High Score" Starr | 22.7%             | 69.3%                | 28.0%               | 54.7%                  | 70        |
| 4. Ingrid Kessler           | 11.3%             | 79.3%                | 4.7%                | 64.7%                  | 120       |
| 5. Scarlett Delacroix       | 43.3%             | 63.3%                | 28.7%               | 49.3%                  | 180       |
| 6. Madame Ruby              | 17.3%             | 84.0%                | 0.7%                | 57.3%                  | 260       |

Aim for "fresh" falling steadily and "on curve" staying around 50-70%, so upgrades feel necessary but the ladder never stalls.

## Cards (from style-vs-style games)

| Card             | Style       | Plays | Linked | Dmg/play | Win% when played |
|------------------|-------------|-------|--------|----------|------------------|
| Lipstick Jab     | petal_storm | 32137 | 74.2%  | 1.27     | 47.1%            |
| Blow a Kiss      | petal_storm | 23505 | 68.8%  | 0.00     | 47.1%            |
| Velvet Jab       | stone_lotus | 22569 | 79.1%  | 2.44     | 52.9%            |
| Rhinestone Cross | petal_storm | 18924 | 95.7%  | 3.75     | 47.1%            |
| Switchblade Hook | petal_storm | 15318 | 95.9%  | 2.05     | 47.1%            |
| Liver Shot       | stone_lotus | 14182 | 90.5%  | 7.66     | 52.9%            |
| Peek-a-Boo       | petal_storm | 12962 | 95.9%  | 0.00     | 47.1%            |
| Touch Gloves     | stone_lotus | 9313  | 87.7%  | 0.00     | 53.0%            |
| High Guard       | stone_lotus | 8854  | 89.5%  | 0.00     | 52.9%            |
| Smoke Break      | stone_lotus | 8830  | 86.6%  | 0.00     | 52.9%            |
| Last Call        | stone_lotus | 8432  | 62.9%  | 8.03     | 52.9%            |
| Encore           | petal_storm | 3259  | 99.9%  | 9.73     | 48.8%            |

Shop-only cards appear here only when an opponent deck uses them; run with --mode ladder to see those matchups.
## How fights end (all games above)

| K.O. | T.K.O. | Decision | of which unanimous / split / majority / technical | Avg rounds | Knockdowns per fight |
|------|--------|----------|---------------------------------------------------|------------|----------------------|
| 0.0% | 33.3%  | 66.8%    | 52.8% / 2.2% / 4.5% / 7.2%                        | 3.12       | 2.48                 |

