export interface User {
  id: string;
  email: string;
  name: string;
  wallet: { balance: number; locked: number };
  token: string;
}

export interface Table {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxPlayers: number;
  status: string;
  seats: Seat[];
}

export interface Seat {
  id: string;
  position: number;
  userId: string | null;
  stack: number;
  isSitting: boolean;
  isSitOut: boolean;
  user?: User;
}

export interface BlindLevel {
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
}
