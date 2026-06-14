import type { Match, MatchPlayerRow, Side } from "../types";

export const csvHeaders = [
  "matchId",
  "playedAt",
  "mode",
  "durationSeconds",
  "blueKills",
  "redKills",
  "winningSide",
  "side",
  "summoner",
  "hero",
  "position",
  "rating",
  "kills",
  "deaths",
  "assists",
  "damageDealt",
  "damageTaken",
  "gold",
  "teamfightRate",
  "isMvp",
  "medal",
  "item1",
  "item2",
  "item3",
  "item4",
  "item5",
  "item6",
  "notes",
] as const;

type CsvHeader = (typeof csvHeaders)[number];

const numericFields = new Set<CsvHeader>([
  "durationSeconds",
  "blueKills",
  "redKills",
  "rating",
  "kills",
  "deaths",
  "assists",
  "damageDealt",
  "damageTaken",
  "gold",
  "teamfightRate",
]);

export function parseCsv(text: string): MatchPlayerRow[] {
  const rows = parseCsvRows(text.trim());
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows
    .slice(1)
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
      return normalizeRow(record);
    });
}

export function rowsToCsv(rows: MatchPlayerRow[]): string {
  const lines = [
    csvHeaders.join(","),
    ...rows.map((row) =>
      csvHeaders
        .map((header) => {
          const value = String(row[header] ?? "");
          return escapeCsv(value);
        })
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function groupMatches(rows: MatchPlayerRow[]): Match[] {
  const map = new Map<string, Match>();
  rows.forEach((row) => {
    if (!map.has(row.matchId)) {
      map.set(row.matchId, {
        matchId: row.matchId,
        playedAt: row.playedAt,
        mode: row.mode,
        durationSeconds: row.durationSeconds,
        blueKills: row.blueKills,
        redKills: row.redKills,
        winningSide: row.winningSide,
        players: [],
      });
    }
    map.get(row.matchId)?.players.push(row);
  });

  return [...map.values()].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

export function normalizeRow(record: Record<string, string>): MatchPlayerRow {
  const base = Object.fromEntries(csvHeaders.map((header) => [header, record[header] ?? ""])) as Record<
    CsvHeader,
    string
  >;

  return {
    matchId: base.matchId.trim(),
    playedAt: base.playedAt.trim(),
    mode: base.mode.trim(),
    durationSeconds: numberValue(base.durationSeconds),
    blueKills: numberValue(base.blueKills),
    redKills: numberValue(base.redKills),
    winningSide: sideValue(base.winningSide),
    side: sideValue(base.side),
    summoner: base.summoner.trim(),
    hero: base.hero.trim(),
    position: base.position.trim(),
    rating: numberValue(base.rating),
    kills: numberValue(base.kills),
    deaths: numberValue(base.deaths),
    assists: numberValue(base.assists),
    damageDealt: numberValue(base.damageDealt),
    damageTaken: numberValue(base.damageTaken),
    gold: numberValue(base.gold),
    teamfightRate: numberValue(base.teamfightRate),
    isMvp: booleanValue(base.isMvp),
    medal: base.medal.trim(),
    item1: base.item1.trim(),
    item2: base.item2.trim(),
    item3: base.item3.trim(),
    item4: base.item4.trim(),
    item5: base.item5.trim(),
    item6: base.item6.trim(),
    notes: base.notes.trim(),
  };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  rows.push(row);
  return rows;
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function numberValue(value: string): number {
  const normalized = value.trim().replace("%", "");
  if (!normalized || normalized === "false") return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function booleanValue(value: string): boolean {
  return ["true", "1", "yes", "y", "是"].includes(value.trim().toLowerCase());
}

function sideValue(value: string): Side {
  return value.trim().toLowerCase() === "red" ? "red" : "blue";
}

export function assertCsvShape(rows: MatchPlayerRow[]): string[] {
  const errors: string[] = [];
  const matchCounts = new Map<string, number>();

  rows.forEach((row, index) => {
    const label = `第 ${index + 2} 行`;
    if (!row.matchId) errors.push(`${label}: 缺少 matchId`);
    if (!row.playedAt) errors.push(`${label}: 缺少 playedAt`);
    if (!row.summoner) errors.push(`${label}: 缺少 summoner`);
    if (!row.hero) errors.push(`${label}: 缺少 hero`);
    if (!numericFields.has("rating") || row.rating < 0) errors.push(`${label}: rating 无效`);
    matchCounts.set(row.matchId, (matchCounts.get(row.matchId) ?? 0) + 1);
  });

  matchCounts.forEach((count, matchId) => {
    if (count !== 5) errors.push(`${matchId}: 当前 ${count} 行，当前口径应记录含鸽一方的 5 名玩家`);
  });

  return errors;
}
