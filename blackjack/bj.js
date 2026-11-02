/* BDB Blackjack: pure rules, no DOM. Browser: window.BJ. Node: require('./bj.js').
   Rules: 6-deck shoe, cut card at 75%, dealer stands on soft 17, blackjack pays 3:2, double on any first two cards
   (also after a split), split pairs once, split aces get one card each, push returns the bet,
   dealer peeks for blackjack under an ace or a ten. Bets live on hands; payout = total returned (stake included). */
(function(root){
  const DECKS = 6, CUT = 0.75;

  const value = r => r === 1 ? 1 : r >= 10 ? 10 : r;

  // best total for a set of cards; soft = an ace is currently counted as 11
  function total(cards){
    let hard = 0, aces = 0;
    for (const c of cards){ hard += value(c.r); if (c.r === 1) aces++; }
    const soft = aces > 0 && hard + 10 <= 21;
    return {total: soft ? hard + 10 : hard, soft, hard};
  }
  const isBust = cards => total(cards).total > 21;
  const isNatural = cards => cards.length === 2 && total(cards).total === 21;
  // a split hand that makes 21 in two cards is just 21, not blackjack
  const isBlackjack = hand => !hand.fromSplit && isNatural(hand.cards);
  const dealerPeeks = up => !!up && (up.r === 1 || value(up.r) === 10);
  const dealerHits = cards => total(cards).total < 17;            // S17: stands on every 17, soft or hard

  const newHand = bet => ({cards: [], bet, doubled: false, fromSplit: false, splitAces: false, done: false});

  const canHit = hand => !hand.done && !hand.doubled && !hand.splitAces && total(hand.cards).total < 21;
  const canDouble = (hand, bank) => !hand.done && !hand.doubled && !hand.splitAces && hand.cards.length === 2 &&
    total(hand.cards).total < 21 && bank >= hand.bet;
  // pairs = same rank, or any two ten-value cards (10, J, Q, K). One split per round.
  const canSplit = (hands, i, bank) => {
    const h = hands[i];
    return !!h && hands.length === 1 && !h.done && h.cards.length === 2 && value(h.cards[0].r) === value(h.cards[1].r) && bank >= h.bet;
  };
  // returns a new hands array; each half keeps one card, the caller deals the second cards
  function split(hands, i){
    const h = hands[i], aces = h.cards[0].r === 1;
    const half = c => Object.assign(newHand(h.bet), {cards: [c], fromSplit: true, splitAces: aces});
    return hands.slice(0, i).concat([half(h.cards[0]), half(h.cards[1])], hands.slice(i + 1));
  }

  function settle(hand, dealer){
    const p = total(hand.cards).total, d = total(dealer).total;
    const pBJ = isBlackjack(hand), dBJ = isNatural(dealer);
    if (p > 21) return {result: 'bust', payout: 0};
    if (pBJ && dBJ) return {result: 'push', payout: hand.bet};
    if (pBJ) return {result: 'blackjack', payout: hand.bet * 2.5};
    if (dBJ) return {result: 'lose', payout: 0};
    if (d > 21) return {result: 'win', payout: hand.bet * 2};
    if (p > d) return {result: 'win', payout: hand.bet * 2};
    if (p === d) return {result: 'push', payout: hand.bet};
    return {result: 'lose', payout: 0};
  }

  function shuffle(a, rng = Math.random){
    for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function makeShoe(decks = DECKS, rng = Math.random){
    const cards = []; let id = 0;
    for (let d = 0; d < decks; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({r, s, id: id++});
    shuffle(cards, rng);
    return {cards, pos: 0, cut: Math.floor(cards.length * CUT)};
  }
  const draw = shoe => shoe.cards[shoe.pos++];
  const needsShuffle = shoe => shoe.pos >= shoe.cut;
  const remaining = shoe => shoe.cards.length - shoe.pos;

  function playDealer(dealer, drawFn){ while (dealerHits(dealer)) dealer.push(drawFn()); return dealer; }

  // short label for the total badge: "7 / 17" when soft, "Blackjack", "Bust"
  function label(cards, fromSplit){
    if (!cards.length) return '';
    const t = total(cards);
    if (t.total > 21) return 'Bust ' + t.total;
    if (!fromSplit && isNatural(cards)) return 'Blackjack';
    return t.soft && t.total < 21 ? (t.total - 10) + ' / ' + t.total : String(t.total);
  }

  // chips to draw for an amount, biggest first (1s cover odd 3:2 change; halves are not drawn)
  function chipsFor(amount, denoms = [500, 100, 25, 5, 1]){
    const out = []; let left = Math.floor(amount + 1e-9);
    for (const d of denoms) while (left >= d){ out.push(d); left -= d; }
    return out;
  }

  const BJ = {DECKS, CUT, value, total, isBust, isNatural, isBlackjack, dealerPeeks, dealerHits, newHand, canHit, canDouble, canSplit,
    split, settle, shuffle, makeShoe, draw, needsShuffle, remaining, playDealer, label, chipsFor};
  if (typeof module !== 'undefined' && module.exports) module.exports = BJ; else root.BJ = BJ;
})(typeof window !== 'undefined' ? window : this);
