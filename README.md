# BDB Games

Two games starring BDB. Made for laughs, all roasts are fictional.

Play: https://terryjones1995.github.io/BDB/

## Charleston Solitaire (`/solitaire`)
Klondike with BDB on all 52 cards. Draw 1 or 3, drag or tap to move, undo, hints, auto-finish,
best time, and a roast every time you deal a card (525 lines in the deck). Win and BDB shows up as a paper cutout to celebrate.

## Charleston Chess (`/chess`)
3D chess against BDB on a parquet court.
- Play BDB: five levels, from Rec League up to Pro (full-strength Stockfish)
- Play friends online: lobby of everyone on the chess page, challenges, invite links, clocks,
  chat and taunts, draw offers, rematches. Peer-to-peer (no server), so a few strict networks may block it
- 500+ trash-talk lines shared across both games (`assets/roasts.js`)
- Every piece has its own kill move: Pawn Shiv, Horse Kick, Diagonal Slice, Tower Slam, Royal Blast, King's Stomp
- BDB trash talks every capture and calls out forced mates ("Mate in 4. Trash can.")
- Undo, hints, promotion picker, and the full rules (castling, en passant, draws)

## More games
Each lives in its own folder and saves a top 5 on the device.
- `freethrow/` Free Throw Frenzy: 60-second arcade hoops with real ball physics
- `whack/` Whack-a-BDB: bonk him around the break room, spare the scout
- `clockin/` Clock-In Rush: endless runner to the time clock
- `snake/` Lanyard Snake: classic snake, 3 speeds, solid or wrap walls
- `fish/` Big Fish BDB: eat smaller fish, grow, avoid sharks
- `pingpong/` Break Room Ping Pong: table tennis vs BDB, 3 levels
- `blackjack/` BDB Blackjack: BDB deals, fake chips only
- `connect4/` Charleston Four: four in a row vs BDB, pass-and-play, or online
- `blocks/` Break Room Blocks: falling-blocks puzzle
- `tycoon/` BDB Tycoon: property-trading board game for 2–6 (bots, pass-and-play, online tables; host-authoritative, bots cover dropped seats)
- `city/` BDB City (working title): a 3D city builder in three.js r185. Draw roads, zone land and a city grows along them, with traffic, weather, day and night. An early build: no saving yet, and it wants a computer rather than a phone. Built on Fable Cities by raw (MIT, CC0 art; what was changed is in `city/NOTICE.md`), with no build step. What comes next (saving, crime and fire crews, an airport, deals between cities, friends) is in `city/PLAN.md`, and the models being made for it in `city/ASSETS.md`
- `fleet/` Sink BDB: hide your fleet and hunt his, vs BDB at 3 levels or online 1v1 with a fair-play check
- `brawl/` Break Room Brawl: 3D lane battles in three.js. 248 characters, buildings, spells and traps in 10 builds each (2,480 cards). Every card has one fixed rarity and one of 12 types, and stacking a type in a deck makes it fight harder. Above Legendary sits a God tier (Thor, Death and Zeus so far: powers that reach the whole map, one God to a deck, found in the Divine Chest). Mana comes in half as fast again every two minutes of a match. A deck holds at most 7 Rare, 5 Epic, 3 Legendary and 1 God. Card levels add 3% each and change the card's colour every two levels. A daily reward, three jobs a day (an easy one, a middling one and a hard one, with a chest for doing all three), a win streak and a tower bounty sit on the hub, and BDB brings his cards up to within two levels of a deck that has outgrown its place on the ladder. Abilities live in the rules (`sim.js`): landing blasts, charges, stealth, chain lightning, summons, Mana farms, tower shields. A 1,000-level ladder in ten tiers, quick battles at five skill levels (Easy to Legend), raised odds that pay more (one against two or three BDBs), a win that pays more for every tower taken, two minutes of overtime at four times the Mana, chests with stated odds, 43 ready-made decks, player upgrades bought with tokens from the ladder, a deck builder for new players, three deck slots that can sit part-built, four graphics settings that step down by themselves on a slow device, 15 arenas (five built in 3D, ten painted floors in `brawl/maps/` that each ladder tier calls home, with the river and bridges read off the painting), device saves with a save code (`store.js` brings old saves up to date), online 1v1 and co-op for two against two or three BDBs at a chosen level, with emotes, pause and a rematch from the result screen (host-authoritative over the chess transport). Models: KayKit character packs by Kay Lousberg and Ultimate Monsters by Quaternius (all CC0, see `brawl/models/SOURCES.txt`), sharing clip libraries (`am.glb`, `al.glb`) and a weapon rack (`wp.glb`); the forty-odd hero characters (the rigs marked `R` in `brawl/rigs.js`) were generated, rigged and animated with Hyper3D Rodin for this game; the hundred-odd `T_` characters were generated with Tripo and rigged for this game by a fitter of its own (a 20-joint skeleton found from the shape of each T-pose model, or taken from the model's own skeleton when it came with one, and skin weights by bone heat through a voxel copy of it), and all of them play one shared clip library, `aG.glb`. Two are different: the horse (`BlackHorse.glb`) is a Tripo model rigged and animated with Rodin, and the Headless Horseman (`T_Horseman.glb`) is one solid model that is rocked by code. Model files are meshopt-compressed and loaded per match; card pictures in `brawl/art/` are rendered from the models. Scenery in `brawl/props/` is bundled from KayKit Medieval Hexagon, City Builder, Furniture, Restaurant and Dungeon packs (all CC0). Pan/zoom camera, tap-to-inspect, bloom on desktop. A player's first match waits for their first card and shows four tips as they come to matter. The game can be added to a phone's home screen (`brawl/manifest.webmanifest`), where it opens without the browser around it. Sound is in `brawl/audio.js`: one file of effects and one looping battle theme in `brawl/snd/` (where each came from is in `brawl/snd/CREDITS.md`), balanced against each other by measured loudness; in the menus the music is muffled, as if the match were next door. Coins, crowns, chests, the trophy and the Mana crystal in `brawl/ui/` are pictures of Tripo models. Accounts, cloud saves, the online list, invites and trading go through the SQL functions in `brawl/supabase.sql` (run it once in the Supabase SQL editor; the project URL and anon key are in `brawl/config.js`). Without it the game falls back to saves on the device

New games start from `assets/TEMPLATE.html`, which uses the shared `assets/kit.css` and `assets/kit.js`.

## Credits
- Chess engine: [Stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL, see `chess/engine/LICENSE.txt`)
- Chess rules: [chess.js](https://github.com/jhlywa/chess.js) (BSD, see `chess/vendor/chess.js.LICENSE.txt`)
- 3D: [three.js](https://threejs.org) (MIT, see `chess/vendor/three.LICENSE.txt`)
- City builder: [Fable Cities](https://github.com/rawprogress/fable-cities) by raw (MIT, see `city/LICENSE-fable-cities.txt`), its art CC0 from ambientCG, Poly Haven and Kenney (see `city/assets/CREDITS.md`)
- Online play: [Trystero](https://github.com/dmotz/trystero) (MIT, see `chess/vendor/trystero.LICENSE.txt`). Add `?net=local` to test two tabs without internet.
