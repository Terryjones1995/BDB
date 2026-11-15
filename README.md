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
- `fleet/` Sink BDB: hide your fleet and hunt his, vs BDB at 3 levels or online 1v1 with a fair-play check
- `brawl/` Break Room Brawl: 3D lane battles in three.js. 1,152 generated cards (24 characters x 12 styles x 4 rarities), 15-card decks, coin upgrades, 8 CPU BDBs, 5 maps, device saves with a save code (`store.js` is the one place to plug in real accounts), online 1v1 with emotes and pause (host-authoritative over the chess transport). Rigged characters are KayKit Adventurers and KayKit Skeletons by Kay Lousberg (CC0, licences in `brawl/models/`), trimmed to the clips used; scenery in `brawl/props/` is bundled from KayKit Medieval Hexagon, City Builder, Furniture, Restaurant and Dungeon packs (all CC0); 2v2 co-op vs two CPUs; pan/zoom camera, tap-to-inspect, bloom on desktop

New games start from `assets/TEMPLATE.html`, which uses the shared `assets/kit.css` and `assets/kit.js`.

## Credits
- Chess engine: [Stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL, see `chess/engine/LICENSE.txt`)
- Chess rules: [chess.js](https://github.com/jhlywa/chess.js) (BSD, see `chess/vendor/chess.js.LICENSE.txt`)
- 3D: [three.js](https://threejs.org) (MIT, see `chess/vendor/three.LICENSE.txt`)
- Online play: [Trystero](https://github.com/dmotz/trystero) (MIT, see `chess/vendor/trystero.LICENSE.txt`). Add `?net=local` to test two tabs without internet.
