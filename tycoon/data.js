/* BDB Tycoon: board, cards and BDB's announcer lines. Plain data, loads in the browser and in Node. */
(function(G){
'use strict';
const TY = G.TY = G.TY || {};

/* 8 colour groups, cheapest to priciest. hc = build cost per house */
const groups = [
  {name:'Bench Seats',  color:'#a08b74', hc:50},
  {name:'Rec League',   color:'#4fc7bd', hc:50},
  {name:'Break Room',   color:'#c08af0', hc:100},
  {name:'Staff Lot',    color:'#7d95ff', hc:100},
  {name:'Casino Floor', color:'#ff6b6b', hc:150},
  {name:'Upstairs',     color:'#ffd166', hc:150},
  {name:'The Arena',    color:'#3fbf6e', hc:200},
  {name:'Florida Dream',color:'#ff7eb6', hc:200}
];

/* k: go | prop | card | tax | transit | util | jail | free | gojail */
const P = (name, sh, g, price, rent) => ({k:'prop', name, sh, g, price, rent});
const spaces = [
  {k:'go', name:'Clock In', sh:'Clock In'},
  P('End of the Bench', 'End of Bench', 0, 60, [2,10,30,90,160,250]),
  {k:'card', deck:'fridge', name:'Break Room Fridge', sh:'Fridge'},
  P('Rec League Gym', 'Rec Gym', 0, 60, [4,20,60,180,320,450]),
  {k:'tax', name:'Union Dues', sh:'Union Dues', amt:200},
  {k:'transit', name:'Night Bus', sh:'Night Bus', price:200},
  P('Driveway Hoop', 'Driveway Hoop', 1, 100, [6,30,90,270,400,550]),
  {k:'card', deck:'scout', name:'Scout Call', sh:'Scout Call'},
  P('Open Gym Night', 'Open Gym', 1, 100, [6,30,90,270,400,550]),
  P('Community Centre Court', 'Community Ct', 1, 120, [8,40,100,300,450,600]),
  {k:'jail', name:'Benched', sh:'Benched'},
  P('Snack Shelf', 'Snack Shelf', 2, 140, [10,50,150,450,625,750]),
  {k:'util', name:'Coffee Machine', sh:'Coffee', price:150},
  P('Microwave Line', 'Microwave', 2, 140, [10,50,150,450,625,750]),
  P('The Good Chair', 'Good Chair', 2, 160, [12,60,180,500,700,900]),
  {k:'transit', name:'Staff Shuttle', sh:'Shuttle', price:200},
  P('Staff Parking Lot', 'Staff Lot', 3, 180, [14,70,200,550,750,950]),
  {k:'card', deck:'fridge', name:'Break Room Fridge', sh:'Fridge'},
  P('Employee Entrance', 'Staff Door', 3, 180, [14,70,200,550,750,950]),
  P('Time Clock Hallway', 'Clock Hall', 3, 200, [16,80,220,600,800,1000]),
  {k:'free', name:'Break Room', sh:'Break Room'},
  P('Slot Row', 'Slot Row', 4, 220, [18,90,250,700,875,1050]),
  {k:'card', deck:'scout', name:'Scout Call', sh:'Scout Call'},
  P('The Buffet Line', 'Buffet Line', 4, 220, [18,90,250,700,875,1050]),
  P('Table Games Pit', 'Tables Pit', 4, 240, [20,100,300,750,925,1100]),
  {k:'transit', name:'Carpool Lane', sh:'Carpool', price:200},
  P('High Limit Lounge', 'High Limit', 5, 260, [22,110,330,800,975,1150]),
  P('Show Lounge Stage', 'Show Lounge', 5, 260, [22,110,330,800,975,1150]),
  {k:'util', name:'Vending Machine', sh:'Vending', price:150},
  P('Penthouse Elevator', 'Penthouse', 5, 280, [24,120,360,850,1025,1200]),
  {k:'gojail', name:'Coach Says Sit Down', sh:'Sit Down'},
  P('Pro Arena Tunnel', 'Arena Tunnel', 6, 300, [26,130,390,900,1100,1275]),
  P('Courtside Seats', 'Courtside', 6, 300, [26,130,390,900,1100,1275]),
  {k:'card', deck:'fridge', name:'Break Room Fridge', sh:'Fridge'},
  P('Centre Court', 'Centre Court', 6, 320, [28,150,450,1000,1200,1400]),
  {k:'transit', name:'Ride Home', sh:'Ride Home', price:200},
  {k:'card', deck:'scout', name:'Scout Call', sh:'Scout Call'},
  P('Recruiting Office', 'Recruiting', 7, 350, [35,175,500,1100,1300,1500]),
  {k:'tax', name:'Jersey Dry Cleaning', sh:'Dry Cleaning', amt:100},
  P('Scholarship Hall', 'Scholarship', 7, 400, [50,200,600,1400,1700,2000])
];
spaces.forEach((s, i) => { s.i = i; if (s.k === 'prop') groups[s.g].sp = (groups[s.g].sp || []).concat(i); });

/* card kinds: goto(to) | near(w) | money(amt) | free | back(n) | jail | repair(h,H) | each(amt: + collect, - pay) */
const cards = {
  scout: [
    {k:'goto', to:0, x:'A scout wants to meet at the time clock. Advance to Clock In and collect $200.'},
    {k:'goto', to:39, x:'A recruiter swears you are a lock. Advance to Scholarship Hall.'},
    {k:'goto', to:24, x:'Free buffet pass. Advance to Table Games Pit. Pass Clock In, collect $200.'},
    {k:'goto', to:11, x:'Break room meeting. Advance to Snack Shelf. Pass Clock In, collect $200.'},
    {k:'near', w:'util', x:'Running on fumes. Go to the nearest machine. If someone owns it, roll and pay 10 times the dice.'},
    {k:'near', w:'transit', x:'Missed your ride. Go to the nearest transit stop. If someone owns it, pay double.'},
    {k:'near', w:'transit', x:'Scout says the gym is across town. Go to the nearest transit stop. Owned? Pay double.'},
    {k:'money', amt:50, x:'Your highlight tape hit 40 views. Collect $50.'},
    {k:'free', x:'Coach owes you one. Get off the bench free. Keep this card until you need it.'},
    {k:'back', n:3, x:'You forgot your lanyard. Go back 3 spaces.'},
    {k:'jail', x:'Coach caught you on your phone during the huddle. Go straight to Benched. No pay.'},
    {k:'repair', h:25, H:100, x:'The gym floor needs refinishing. Pay $25 per house and $100 per hotel.'},
    {k:'money', amt:-15, x:'Late for practice. Pay a $15 fine.'},
    {k:'goto', to:5, x:'Catch the Night Bus to tryouts. Pass Clock In, collect $200.'},
    {k:'each', amt:-50, x:'You got named team captain. Wings are on you. Pay each player $50.'},
    {k:'money', amt:150, x:'Your old rec league jersey sold online. Collect $150.'}
  ],
  fridge: [
    {k:'goto', to:0, x:'Someone set the break room clock forward. Advance to Clock In and collect $200.'},
    {k:'money', amt:200, x:'Payroll error in your favour. Collect $200.'},
    {k:'money', amt:-50, x:'Your sneakers squeak in every meeting. New pair. Pay $50.'},
    {k:'money', amt:50, x:'You sold your spare lanyard. Collect $50.'},
    {k:'free', x:'Coupon taped inside the fridge door: get off the bench free. Keep this card.'},
    {k:'jail', x:'You microwaved fish in the break room. Go straight to Benched. No pay.'},
    {k:'money', amt:100, x:'The holiday bonus came through. Collect $100.'},
    {k:'money', amt:20, x:'Uniform deposit refund. Collect $20.'},
    {k:'each', amt:10, x:'It is your birthday. Everybody chips in for cake. Collect $10 from each player.'},
    {k:'money', amt:100, x:'You won the break room chili cook off. Collect $100.'},
    {k:'money', amt:-100, x:'Court rental for your comeback tour. Pay $100.'},
    {k:'money', amt:-50, x:'Gym membership renewal. Pay $50.'},
    {k:'money', amt:25, x:'You coached a weekend skills camp. Collect $25.'},
    {k:'repair', h:40, H:115, x:'Parking lot pothole repairs. Pay $40 per house and $115 per hotel.'},
    {k:'money', amt:10, x:'Second place in the free throw contest. Collect $10.'},
    {k:'money', amt:100, x:'Found $100 in your old warmup jacket. Collect $100.'}
  ]
};
const deckName = {scout:'Scout Call', fridge:'Break Room Fridge'};

const tokens = [
  {id:'ball', name:'Basketball'}, {id:'lanyard', name:'Lanyard'}, {id:'coffee', name:'Coffee Cup'},
  {id:'clock', name:'Time Clock'}, {id:'sneaker', name:'Sneaker'}, {id:'whistle', name:'Whistle'}
];
const colors = ['#ff8a2b', '#4fb3ff', '#4ade80', '#ff6fae', '#b18cff', '#f2c14e'];
const botNames = ['Bot BDB', 'Bench BDB', 'Night Shift BDB', 'Lanyard BDB', 'Two Point BDB', 'Scout Ready BDB'];
const levels = [null, {name:'Rec League'}, {name:'Varsity'}, {name:'Pro Scout'}];

/* BDB the announcer. {p} player, {o} other player, {sp} space, {g} colour set, {amt} dollars */
const lines = {
  start: [
    "Welcome to BDB Tycoon. BDB owns nothing, as usual. Let's go.",
    "Grab a token. BDB already called dibs on the lanyard.",
    "New game. Same BDB. Different league.",
    "BDB put his whole scholarship fund into this game. It was twelve dollars.",
    "Board's set. BDB says he's the commissioner. Nobody voted."
  ],
  buy: [
    "{p} buys {sp}. BDB tried to put that on layaway.",
    "{sp} sold to {p}. BDB is pretending he wasn't interested.",
    "{p} owns {sp} now. That's more real estate than BDB has ever had.",
    "Done deal. {p} grabs {sp}. BDB is still reading the deed.",
    "{p} picks up {sp}. Smart. BDB would have bought a jersey instead.",
    "{sp} goes to {p}. BDB wanted it for the view of the vending machine."
  ],
  buyBig: [
    "{p} drops ${amt} on {sp}. BDB has never seen that much money outside a dream.",
    "{sp} for ${amt}. BDB just checked his bank app and closed it real quick.",
    "Big spender alert. {p} buys {sp}. BDB is asking if it comes with a parking spot."
  ],
  rent: [
    "{p} pays {o} ${amt}. BDB says rent is a state of mind.",
    "${amt} to {o}. BDB would ask for an extension and a high five.",
    "{p} hands over ${amt}. BDB respects paying on time. He has never done it.",
    "Rent paid. {o} is up ${amt}. BDB wants a finder's fee.",
    "{p} pays up at {sp}. BDB tried paying rent in basketball stories once."
  ],
  rentBig: [
    "{p} just paid ${amt} at {sp}. BDB felt that in his lanyard.",
    "${amt}! {p} got cooked at {sp}. BDB is screaming in the break room.",
    "Ouch. ${amt} for {sp}. That's BDB's whole signing bonus. The imaginary one.",
    "{o} cashes ${amt} from {p}. BDB calls that a fast break.",
    "{p} walked into {sp} and walked out ${amt} lighter. BDB has seen worse. On his own stat sheet."
  ],
  go: [
    "{p} clocks in. ${amt}. BDB's favourite part of any job.",
    "Payday for {p}. BDB clocks in like that, minus the part after.",
    "Another lap, another ${amt}. BDB would already be on break."
  ],
  doubles: [
    "Doubles! {p} goes again. BDB has never had a second chance at anything.",
    "Doubles for {p}. BDB calls that an and-one.",
    "{p} rolls doubles. BDB rolled doubles once and told the story for a year."
  ],
  speeding: [
    "Three doubles in a row. Coach says sit down, {p}. BDB knows that bench well.",
    "Three doubles? Too hot. {p} gets Benched. BDB was never in danger of that."
  ],
  jail: [
    "{p} is Benched. BDB saved you a seat. He's been warming it since tryouts.",
    "Benched! {p} joins BDB in his natural habitat.",
    "{p} gets sat down. BDB says the bench is undefeated.",
    "Benched. {p}, BDB recommends the end seat. Best view of the water jug."
  ],
  jailOut: [
    "{p} is off the bench. BDB is still waiting for his number to get called.",
    "{p} rolls out of Benched. BDB took four seasons to do that.",
    "Back in the game, {p}. BDB is jealous."
  ],
  set: [
    "Full set! {p} owns all of {g}. BDB has never completed anything but a clock-in streak.",
    "{p} locks up {g}. BDB is calling his scout. Straight to voicemail.",
    "That's the whole {g} set for {p}. Houses are coming. BDB is nervous.",
    "{p} runs the table on {g}. BDB averaged 2.0 points. This is worse."
  ],
  build: [
    "{p} builds on {sp}. BDB once built a pillow fort in the break room.",
    "House on {sp}. BDB says it needs a hoop out front.",
    "Construction on {sp}. BDB is asking if they need a forward."
  ],
  hotel: [
    "Hotel on {sp}. BDB is asking about the employee rate.",
    "{p} drops a hotel on {sp}. BDB would sleep through checkout."
  ],
  mortgage: [
    "{p} mortgages {sp}. BDB has been broke with confidence for years. Welcome.",
    "{sp} goes to the bank. BDB calls that a strategic timeout."
  ],
  auction: [
    "Nobody wants {sp}? Auction time. BDB bids one high five.",
    "{sp} hits the auction block. BDB is bidding in snack shelf coupons."
  ],
  won: [
    "{p} wins {sp} for ${amt}. BDB would have bid his whole lanyard.",
    "Sold to {p} for ${amt}. BDB is still raising his hand."
  ],
  nobid: [
    "No bids on {sp}. Even BDB passed, and he buys anything on sale."
  ],
  trade: [
    "Trade done. {p} and {o} shake on it. BDB wants a cut.",
    "{p} and {o} make a deal. BDB calls it a sign and trade.",
    "Deal! BDB hasn't been involved in a trade since his rec league draft. Nobody took him."
  ],
  reject: [
    "Offer declined. BDB knows rejection. Ask any scout.",
    "{o} says no. BDB heard that from every college in Florida."
  ],
  bankrupt: [
    "{p} is bankrupt. BDB says welcome to the club. Meetings are on Tuesday.",
    "That's it for {p}. BDB will hold your lanyard.",
    "{p} is out of cash and out of the game. BDB relates on a spiritual level."
  ],
  card: [
    "{p} takes a Scout Call. BDB has been waiting by the phone for years.",
    "Fridge card for {p}. BDB's leftovers have been in there since spring."
  ],
  tax: [
    "{p} pays ${amt}. BDB just learned what dues are.",
    "Fees for {p}. BDB pays his in basketball stories."
  ],
  jackpot: [
    "{p} cleans out the Break Room jackpot. ${amt}! BDB has never left the break room that happy."
  ],
  rest: [
    "{p} hits the Break Room. BDB's home court. Take a nap.",
    "Break Room for {p}. BDB has his name carved in the good chair."
  ],
  timeup: [
    "Time! Final turn. BDB is already clocking out."
  ],
  win: [
    "{p} wins BDB Tycoon. BDB is already asking for a loan.",
    "Game over. {p} owns the board. BDB owns a lanyard.",
    "{p} takes the title. BDB says he let you win. He did not."
  ],
  youLose: [
    "Tough one. BDB says you played like a true 2.0 points per game guy.",
    "You lost. BDB is printing the box score for the break room."
  ]
};

/* extra deck roasts for BDB.roast() in this game */
const extra = [
  "BDB's net worth is one lanyard and a very confident attitude.",
  "BDB tried to mortgage his highlight tape. The bank said it's worth $2.",
  "BDB once landed on Scholarship Hall and asked if they were still hiring scouts.",
  "BDB says he invests in real estate. He means he sits on the break room couch.",
  "BDB plays property games like he played defence. Mostly watching.",
  "BDB's financial plan is waiting for a scout to call with a signing bonus."
];

TY.data = {groups, spaces, cards, deckName, tokens, colors, botNames, levels, lines, extra};
})(typeof window !== 'undefined' ? window : globalThis);
