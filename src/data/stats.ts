import type { ComboSummary, FilterState, Match, MatchPlayerRow, PlayerSummary, SummaryDimension, TimeBucket, TimeGranularity } from "../types";

export const emptyFilters: FilterState = {
  summoner: "",
  hero: "",
  teammates: [],
  position: "",
  mode: "",
  result: "all",
  startDate: "",
  endDate: "",
};

export function getOptions(rows: MatchPlayerRow[]) {
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  return {
    summoners: unique(rows.map((row) => row.summoner)),
    heroes: unique(rows.map((row) => row.hero)),
    positions: unique(rows.map((row) => row.position)),
    modes: unique(rows.map((row) => row.mode)),
  };
}

export function getLinkedOptions(rows: MatchPlayerRow[], matches: Match[], filters: FilterState) {
  return {
    summoners: unique(applyFiltersExcept(rows, matches, filters, "summoner").map((row) => row.summoner)),
    heroes: unique(applyFiltersExcept(rows, matches, filters, "hero").map((row) => row.hero)),
    teammates: unique(getPossibleTeammates(rows, matches, filters)),
    positions: unique(applyFiltersExcept(rows, matches, filters, "position").map((row) => row.position)),
    modes: unique(applyFiltersExcept(rows, matches, filters, "mode").map((row) => row.mode)),
  };
}

export function applyFilters(rows: MatchPlayerRow[], matches: Match[], filters: FilterState): MatchPlayerRow[] {
  return rows.filter((row) => {
    if (filters.summoner && row.summoner !== filters.summoner) return false;
    if (filters.hero && row.hero !== filters.hero) return false;
    if (filters.position && row.position !== filters.position) return false;
    if (filters.mode && row.mode !== filters.mode) return false;
    if (filters.startDate && dateOnly(row.playedAt) < filters.startDate) return false;
    if (filters.endDate && dateOnly(row.playedAt) > filters.endDate) return false;
    if (filters.result !== "all") {
      const won = row.side === row.winningSide;
      if (filters.result === "win" && !won) return false;
      if (filters.result === "loss" && won) return false;
    }
    if (filters.teammates.length && !hasAllTeammates(matches, row, filters.teammates)) return false;
    return true;
  });
}

export function summarizePlayers(rows: MatchPlayerRow[]): PlayerSummary[] {
  return summarizeBy(rows, (row) => row.summoner);
}

export function summarizeHeroes(rows: MatchPlayerRow[]): PlayerSummary[] {
  return summarizeBy(rows, (row) => row.hero || "未填写英雄");
}

export function summarizeByDimensions(rows: MatchPlayerRow[], dimensions: SummaryDimension[]): PlayerSummary[] {
  if (!dimensions.length || (dimensions.length === 1 && dimensions[0] === "summoner")) return summarizePlayers(rows);
  if (dimensions.length === 1 && dimensions[0] === "hero") return summarizeHeroes(rows);

  return summarizeBy(rows, (row) =>
    dimensions
      .map((dimension) => {
        if (dimension === "summoner") return row.summoner || "未填写召唤师";
        return row.hero || "未填写英雄";
      })
      .join(" / "),
  );
}

function summarizeBy(rows: MatchPlayerRow[], getLabel: (row: MatchPlayerRow) => string): PlayerSummary[] {
  const grouped = new Map<string, MatchPlayerRow[]>();
  rows.forEach((row) => {
    const label = getLabel(row);
    const list = grouped.get(label) ?? [];
    list.push(row);
    grouped.set(label, list);
  });

  return [...grouped.entries()]
    .map(([label, playerRows]) => summarize(label, playerRows))
    .sort((a, b) => b.winRate - a.winRate || b.matches - a.matches || b.avgRating - a.avgRating);
}

export function summarizeTarget(rows: MatchPlayerRow[], summoner: string): PlayerSummary {
  const targetRows = summoner ? rows.filter((row) => row.summoner === summoner) : [];
  return summarize(summoner || "未选择", targetRows);
}

export function summarizeCombinations(
  scopedRows: MatchPlayerRow[],
  allFriendRows: MatchPlayerRow[],
  matches: Match[],
  filters: FilterState,
  sizes: number[],
  minMatches: number,
): ComboSummary[] {
  const normalizedSizes = [...new Set(sizes)].filter((size) => size >= 2 && size <= 5).sort((a, b) => a - b);
  if (!scopedRows.length || !normalizedSizes.length) return [];

  const scopedSides = new Set(scopedRows.map((row) => sideKey(row.matchId, row.side)));
  const matchMap = new Map(matches.map((match) => [match.matchId, match]));
  const rowsBySide = new Map<string, MatchPlayerRow[]>();

  allFriendRows.forEach((row) => {
    const key = sideKey(row.matchId, row.side);
    if (!scopedSides.has(key)) return;
    const list = rowsBySide.get(key) ?? [];
    list.push(row);
    rowsBySide.set(key, list);
  });

  const comboMap = new Map<
    string,
    {
      size: number;
      members: string[];
      matches: number;
      wins: number;
      rows: MatchPlayerRow[];
    }
  >();

  rowsBySide.forEach((sideRows) => {
    const uniqueRows = uniqueBySummoner(sideRows).sort((a, b) => a.summoner.localeCompare(b.summoner, "zh-CN"));
    if (uniqueRows.length < 2) return;
    const match = matchMap.get(uniqueRows[0].matchId);
    if (!match) return;

    normalizedSizes
      .filter((size) => size <= uniqueRows.length)
      .forEach((size) => {
        combinations(uniqueRows, size).forEach((comboRows) => {
          const members = comboRows.map((row) => row.summoner);
          if (filters.summoner && !members.includes(filters.summoner)) return;
          if (filters.teammates.some((teammate) => !members.includes(teammate))) return;

          const key = `${size}:${members.join("|")}`;
          const current = comboMap.get(key) ?? {
            size,
            members,
            matches: 0,
            wins: 0,
            rows: [],
          };
          current.matches += 1;
          if (uniqueRows[0].side === match.winningSide) current.wins += 1;
          current.rows.push(...comboRows);
          comboMap.set(key, current);
        });
      });
  });

  return [...comboMap.values()]
    .map((combo) => {
      const kills = sum(combo.rows, "kills");
      const deaths = sum(combo.rows, "deaths");
      const assists = sum(combo.rows, "assists");
      return {
        size: combo.size,
        members: combo.members,
        label: combo.members.join(" / "),
        matches: combo.matches,
        wins: combo.wins,
        losses: combo.matches - combo.wins,
        winRate: combo.matches ? combo.wins / combo.matches : 0,
        avgRating: average(combo.rows, "rating"),
        kda: (kills + assists) / Math.max(1, deaths),
        avgGold: combo.matches ? sum(combo.rows, "gold") / combo.matches : 0,
        totalGold: sum(combo.rows, "gold"),
      };
    })
    .filter((combo) => combo.matches >= minMatches)
    .sort((a, b) => b.winRate - a.winRate || b.matches - a.matches || b.avgRating - a.avgRating);
}

export function timeSeries(rows: MatchPlayerRow[], granularity: TimeGranularity): TimeBucket[] {
  const grouped = new Map<string, MatchPlayerRow[]>();
  rows.forEach((row) => {
    const label = bucketLabel(row.playedAt, granularity);
    const list = grouped.get(label) ?? [];
    list.push(row);
    grouped.set(label, list);
  });

  return [...grouped.entries()]
    .map(([label, bucketRows]) => {
      const matches = bucketRows.length;
      const wins = bucketRows.filter((row) => row.side === row.winningSide).length;
      return {
        label,
        matches,
        wins,
        winRate: matches ? wins / matches : 0,
        avgRating: average(bucketRows, "rating"),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function ranking(rows: MatchPlayerRow[], minMatches: number): PlayerSummary[] {
  return summarizePlayers(rows)
    .filter((summary) => summary.matches >= minMatches)
    .sort((a, b) => b.winRate - a.winRate || b.avgRating - a.avgRating || b.matches - a.matches);
}

export function filterForPk(rows: MatchPlayerRow[], matches: Match[], filters: FilterState): MatchPlayerRow[] {
  if (!filters.summoner) return [];
  return applyFilters(rows, matches, filters).filter((row) => row.summoner === filters.summoner);
}

export function getMatchDetail(matches: Match[], matchId: string): Match | undefined {
  return matches.find((match) => match.matchId === matchId);
}

function summarize(summoner: string, rows: MatchPlayerRow[]): PlayerSummary {
  const matches = rows.length;
  const wins = rows.filter((row) => row.side === row.winningSide).length;
  const kills = sum(rows, "kills");
  const deaths = sum(rows, "deaths");
  const assists = sum(rows, "assists");

  return {
    summoner,
    matches,
    wins,
    losses: matches - wins,
    winRate: matches ? wins / matches : 0,
    avgRating: average(rows, "rating"),
    kda: (kills + assists) / Math.max(1, deaths),
    kills,
    deaths,
    assists,
    avgDamageDealt: average(rows, "damageDealt"),
    avgDamageTaken: average(rows, "damageTaken"),
    avgGold: average(rows, "gold"),
    totalGold: sum(rows, "gold"),
    mvpCount: rows.filter((row) => row.isMvp).length,
  };
}

function applyFiltersExcept(
  rows: MatchPlayerRow[],
  matches: Match[],
  filters: FilterState,
  ignoredField: keyof FilterState,
): MatchPlayerRow[] {
  const nextFilters = {
    ...filters,
    [ignoredField]: ignoredField === "teammates" ? [] : "",
  } as FilterState;
  return applyFilters(rows, matches, nextFilters);
}

function getPossibleTeammates(rows: MatchPlayerRow[], matches: Match[], filters: FilterState): string[] {
  const targetRows = filters.summoner ? rows.filter((row) => row.summoner === filters.summoner) : applyFiltersExcept(rows, matches, filters, "teammates");
  const candidates = new Set<string>();

  targetRows.forEach((row) => {
    rows
      .filter((player) => player.matchId === row.matchId)
      .filter((player) => player.side === row.side && player.summoner !== row.summoner)
      .forEach((player) => candidates.add(player.summoner));
  });

  filters.teammates.forEach((teammate) => candidates.add(teammate));
  return [...candidates];
}

function hasAllTeammates(matches: Match[], row: MatchPlayerRow, teammates: string[]): boolean {
  const match = matches.find((item) => item.matchId === row.matchId);
  if (!match) return false;
  const sameSideNames = new Set(
    match.players
      .filter((player) => player.side === row.side && player.summoner !== row.summoner)
      .map((player) => player.summoner),
  );
  return teammates.every((teammate) => sameSideNames.has(teammate));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function sideKey(matchId: string, side: string): string {
  return `${matchId}::${side}`;
}

function uniqueBySummoner(rows: MatchPlayerRow[]): MatchPlayerRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.summoner)) return false;
    seen.add(row.summoner);
    return true;
  });
}

function combinations<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  const current: T[] = [];

  function walk(start: number) {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      current.push(values[index]);
      walk(index + 1);
      current.pop();
    }
  }

  walk(0);
  return result;
}

function bucketLabel(value: string, granularity: TimeGranularity): string {
  const date = parseLocalDate(value);
  if (granularity === "month") {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }
  if (granularity === "week") {
    const start = startOfWeek(date);
    return `${start.getFullYear()}-W${pad(weekNumber(start))}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocalDate(value: string): Date {
  const normalized = value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateOnly(value: string): string {
  return bucketLabel(value, "day");
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function weekNumber(date: Date): number {
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
  return Math.ceil((days + firstDay.getDay() + 1) / 7);
}

function average(rows: MatchPlayerRow[], key: keyof MatchPlayerRow): number {
  if (!rows.length) return 0;
  return sum(rows, key) / rows.length;
}

function sum(rows: MatchPlayerRow[], key: keyof MatchPlayerRow): number {
  return rows.reduce((total, row) => {
    const value = row[key];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
