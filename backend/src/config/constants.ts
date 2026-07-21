export const TABLE_CONFIGS = [
  { name: 'Micro Stakes', stakes: 50, buyIn: 500, maxPlayers: 9, minBuyIn: 200, maxBuyIn: 1000 },
  { name: 'Small Stakes', stakes: 100, buyIn: 1000, maxPlayers: 9, minBuyIn: 400, maxBuyIn: 2000 },
  { name: 'Medium Stakes', stakes: 200, buyIn: 2000, maxPlayers: 9, minBuyIn: 800, maxBuyIn: 4000 },
  { name: 'High Stakes', stakes: 500, buyIn: 5000, maxPlayers: 9, minBuyIn: 2000, maxBuyIn: 10000 },
  { name: 'Pro Stakes', stakes: 1000, buyIn: 10000, maxPlayers: 9, minBuyIn: 4000, maxBuyIn: 20000 },
];

export const SYSTEM_CONFIG = {
  rakePercent: 10,
  rakeCap: 500,
  actionTimeout: 30000,
  autoRebuyThreshold: 200,
  autoRebuyAmount: 500,
  maxPlayersPerTable: 9,
  startingBalance: 10000,
  seatReservationTimeout: 120000,
  reconnectTimeout: 60000,
  maxWaitingListSize: 20,
};

export const CARD_SUITS = ['♠', '♥', '♦', '♣'] as const;
export const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export const HAND_RANK_ORDER = [
  'HIGH_CARD',
  'ONE_PAIR',
  'TWO_PAIR',
  'THREE_OF_A_KIND',
  'STRAIGHT',
  'FLUSH',
  'FULL_HOUSE',
  'FOUR_OF_A_KIND',
  'STRAIGHT_FLUSH',
  'ROYAL_FLUSH'
] as const;

export const HAND_RANK_NAMES = {
  HIGH_CARD: 'High Card',
  ONE_PAIR: 'One Pair',
  TWO_PAIR: 'Two Pair',
  THREE_OF_A_KIND: 'Three of a Kind',
  STRAIGHT: 'Straight',
  FLUSH: 'Flush',
  FULL_HOUSE: 'Full House',
  FOUR_OF_A_KIND: 'Four of a Kind',
  STRAIGHT_FLUSH: 'Straight Flush',
  ROYAL_FLUSH: 'Royal Flush'
};
