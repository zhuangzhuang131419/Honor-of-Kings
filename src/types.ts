export type Side = "blue" | "red";
export type TimeGranularity = "day" | "week" | "month";
export type SummaryDimension = "summoner" | "hero";

export type MatchPlayerRow = {
  matchId: string;
  playedAt: string;
  mode: string;
  durationSeconds: number;
  blueKills: number;
  redKills: number;
  winningSide: Side;
  side: Side;
  summoner: string;
  hero: string;
  position: string;
  rating: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageTaken: number;
  gold: number;
  teamfightRate: number;
  isMvp: boolean;
  medal: string;
  item1: string;
  item2: string;
  item3: string;
  item4: string;
  item5: string;
  item6: string;
  notes: string;
};

export type Match = {
  matchId: string;
  playedAt: string;
  mode: string;
  durationSeconds: number;
  blueKills: number;
  redKills: number;
  winningSide: Side;
  players: MatchPlayerRow[];
};

export type FilterState = {
  summoner: string;
  hero: string;
  teammates: string[];
  position: string;
  mode: string;
  result: "all" | "win" | "loss";
  startDate: string;
  endDate: string;
};

export type PlayerSummary = {
  summoner: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  avgRating: number;
  kda: number;
  kills: number;
  deaths: number;
  assists: number;
  avgDamageDealt: number;
  avgDamageTaken: number;
  avgGold: number;
  totalGold: number;
  mvpCount: number;
};

export type ComboSummary = {
  size: number;
  members: string[];
  label: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  avgRating: number;
  kda: number;
  totalGold: number;
};

export type TimeBucket = {
  label: string;
  matches: number;
  wins: number;
  winRate: number;
};

export type DraftPlayer = Omit<
  MatchPlayerRow,
  "matchId" | "playedAt" | "mode" | "durationSeconds" | "blueKills" | "redKills" | "winningSide"
>;
