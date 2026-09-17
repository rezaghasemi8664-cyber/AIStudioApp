export interface WatchlistQuote {
  symbol: string;
  name: string;
  lastPrice: number | null;
  changePercent: number | null;
  volume: number | null;
  value: number | null;
  updatedAt: string | null;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: string;
  note: string;
  pinned: boolean;
  quote: WatchlistQuote | null;
}

export interface WatchlistGroup {
  id: string;
  name: string;
  items: WatchlistItem[];
  createdAt: string;
}

export interface WatchlistState {
  version: 1;
  activeGroupId: string;
  groups: WatchlistGroup[];
}
