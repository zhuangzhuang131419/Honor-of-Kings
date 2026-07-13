import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ComboSummary, DraftPlayer, FilterState, Match, MatchPlayerRow, PlayerSummary, Side, SummaryDimension, TimeGranularity } from "./types";
import { assertCsvShape, csvHeaders, groupMatches, parseCsv, rowsToCsv } from "./data/csv";
import {
  applyFilters,
  emptyFilters,
  filterForPk,
  getLinkedOptions,
  getOptions,
  ranking,
  summarizeCombinations,
  summarizeByDimensions,
  summarizePlayers,
  summarizeTarget,
  timeSeries,
} from "./data/stats";

type Tab = "analysis" | "pk" | "ranking" | "entry";
type SummarySortKey = "label" | "matches" | "winRate" | "avgRating" | "kda" | "avgDamageDealt" | "avgDamageTaken" | "avgGold" | "mvpCount";
type ComboSortKey = "size" | "label" | "matches" | "winRate" | "winsLosses" | "avgRating" | "kda" | "avgGold";
type SortDirection = "asc" | "desc";
type CandidateConfig = {
  summoners: string[];
  summonerAliases?: Record<string, string[]>;
  heroes: string[];
};

const positions = ["对抗路", "打野", "中路", "发育路", "游走", "辅助"];

const emptyPlayer = (side: Side, index: number): DraftPlayer => ({
  side,
  summoner: "",
  hero: "",
  position: positions[index % positions.length],
  rating: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  damageDealt: 0,
  damageTaken: 0,
  gold: 0,
  teamfightRate: 0,
  isMvp: false,
  medal: "",
  item1: "",
  item2: "",
  item3: "",
  item4: "",
  item5: "",
  item6: "",
  notes: "",
});

export default function App() {
  const [rows, setRows] = useState<MatchPlayerRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [candidateConfig, setCandidateConfig] = useState<CandidateConfig>({ summoners: [], heroes: [] });
  const [tab, setTab] = useState<Tab>("analysis");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [granularity, setGranularity] = useState<TimeGranularity>("day");
  const [rankingGranularity, setRankingGranularity] = useState<TimeGranularity>("month");
  const [summaryDimensions, setSummaryDimensions] = useState<SummaryDimension[]>(["summoner"]);
  const [comboSizes, setComboSizes] = useState<number[]>([2, 3, 4, 5]);
  const [minMatches, setMinMatches] = useState("1");
  const [pkLeft, setPkLeft] = useState<FilterState>(emptyFilters);
  const [pkRight, setPkRight] = useState<FilterState>(emptyFilters);
  const isMobile = useMediaQuery("(max-width: 720px)");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/matches.csv`)
      .then((response) => {
        if (!response.ok) throw new Error(`CSV 加载失败: ${response.status}`);
        return response.text();
      })
      .then((text) => setRows(parseCsv(text)))
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/candidates.json`)
      .then((response) => {
        if (!response.ok) throw new Error("候选词库加载失败");
        return response.json() as Promise<CandidateConfig>;
      })
      .then((config) => {
        setCandidateConfig({
          summoners: uniqueTextList(config.summoners),
          summonerAliases: config.summonerAliases ?? {},
          heroes: uniqueTextList(config.heroes),
        });
      })
      .catch(() => {
        setCandidateConfig({ summoners: [], heroes: [] });
      });
  }, []);

  const matches = useMemo(() => groupMatches(rows), [rows]);
  const friendRows = useMemo(() => filterFriendRows(rows, candidateConfig.summoners), [rows, candidateConfig.summoners]);
  const options = useMemo(() => getOptions(friendRows), [friendRows]);
  const linkedOptions = useMemo(() => getLinkedOptions(friendRows, matches, filters), [friendRows, matches, filters]);
  const pkLeftOptions = useMemo(() => getLinkedOptions(friendRows, matches, pkLeft), [friendRows, matches, pkLeft]);
  const pkRightOptions = useMemo(() => getLinkedOptions(friendRows, matches, pkRight), [friendRows, matches, pkRight]);
  const filteredRows = useMemo(() => applyFilters(friendRows, matches, filters), [friendRows, matches, filters]);
  const summaries = useMemo(
    () => summarizeByDimensions(filteredRows, summaryDimensions),
    [filteredRows, summaryDimensions],
  );
  const comboSummaries = useMemo(
    () => summarizeCombinations(filteredRows, friendRows, matches, filters, comboSizes, 1),
    [filteredRows, friendRows, matches, filters, comboSizes],
  );
  const buckets = useMemo(() => timeSeries(filteredRows, granularity), [filteredRows, granularity]);
  const pkLeftRows = useMemo(() => filterForPk(friendRows, matches, pkLeft), [friendRows, matches, pkLeft]);
  const pkRightRows = useMemo(() => filterForPk(friendRows, matches, pkRight), [friendRows, matches, pkRight]);
  const pkLeftSummary = useMemo(() => summarizeTarget(pkLeftRows, pkLeft.summoner), [pkLeftRows, pkLeft.summoner]);
  const pkRightSummary = useMemo(() => summarizeTarget(pkRightRows, pkRight.summoner), [pkRightRows, pkRight.summoner]);

  const rankedRows = useMemo(() => {
    const scoped = applyFilters(friendRows, matches, { ...emptyFilters, startDate: rankingStartDate(rankingGranularity) });
    return ranking(scoped, parseMinMatchesInput(minMatches));
  }, [friendRows, matches, rankingGranularity, minMatches]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">K</div>
        <nav aria-label="主导航">
          <button className={tab === "analysis" ? "active" : ""} onClick={() => setTab("analysis")} title="分析">
            分析
          </button>
          <button className={tab === "pk" ? "active" : ""} onClick={() => setTab("pk")} title="PK">
            PK
          </button>
          <button className={tab === "ranking" ? "active" : ""} onClick={() => setTab("ranking")} title="排行榜">
            排行
          </button>
          <button className={tab === "entry" ? "active" : ""} onClick={() => setTab("entry")} title="录入">
            录入
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Honor of Kings Analytics</p>
            <h1>王者荣耀对局分析</h1>
          </div>
          <div className="status-strip">
            <Metric label="对局" value={String(matches.length)} />
            <Metric label="记录" value={String(rows.length)} />
            <Metric label="召唤师" value={String(options.summoners.length)} />
          </div>
        </header>

        {loadError ? <div className="alert">{loadError}</div> : null}

        {tab === "analysis" ? (
          <AnalysisView
            filters={filters}
            setFilters={setFilters}
            options={options}
            linkedOptions={linkedOptions}
            summaryDimensions={summaryDimensions}
            setSummaryDimensions={setSummaryDimensions}
            granularity={granularity}
            setGranularity={setGranularity}
            buckets={buckets}
            summaries={summaries}
            comboSummaries={comboSummaries}
            comboSizes={comboSizes}
            setComboSizes={setComboSizes}
            rows={filteredRows}
            isMobile={isMobile}
          />
        ) : null}
        {tab === "pk" ? (
          <PkView
            left={pkLeft}
            right={pkRight}
            setLeft={setPkLeft}
            setRight={setPkRight}
            options={options}
            leftOptions={pkLeftOptions}
            rightOptions={pkRightOptions}
            leftSummary={pkLeftSummary}
            rightSummary={pkRightSummary}
            isMobile={isMobile}
          />
        ) : null}
        {tab === "ranking" ? (
          <RankingView
            granularity={rankingGranularity}
            setGranularity={setRankingGranularity}
            minMatches={minMatches}
            setMinMatches={setMinMatches}
            rows={rankedRows}
            isMobile={isMobile}
          />
        ) : null}
        {tab === "entry" ? <EntryView existingRows={rows} candidateConfig={candidateConfig} isMobile={isMobile} /> : null}
      </section>
    </main>
  );
}

function AnalysisView(props: {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  options: ReturnType<typeof getOptions>;
  linkedOptions: ReturnType<typeof getLinkedOptions>;
  summaryDimensions: SummaryDimension[];
  setSummaryDimensions: (dimensions: SummaryDimension[]) => void;
  granularity: TimeGranularity;
  setGranularity: (granularity: TimeGranularity) => void;
  buckets: ReturnType<typeof timeSeries>;
  summaries: PlayerSummary[];
  comboSummaries: ComboSummary[];
  comboSizes: number[];
  setComboSizes: (sizes: number[]) => void;
  rows: MatchPlayerRow[];
  isMobile: boolean;
}) {
  const [summaryMinMatchesInput, setSummaryMinMatchesInput] = useState("1");
  const [summaryMinWinRateInput, setSummaryMinWinRateInput] = useState("0");
  const [comboMinMatchesInput, setComboMinMatchesInput] = useState("1");
  const [comboMinWinRateInput, setComboMinWinRateInput] = useState("0");
  const summaryMinMatches = parseMinMatchesInput(summaryMinMatchesInput);
  const summaryMinWinRate = parseWinRateInput(summaryMinWinRateInput);
  const comboMinMatches = parseMinMatchesInput(comboMinMatchesInput);
  const comboMinWinRate = parseWinRateInput(comboMinWinRateInput);

  return (
    <div className="view-grid">
      <section className="panel span-12 allow-overflow">
        <div className="panel-title">
          <h2>筛选条件</h2>
          <Segmented
            value={props.granularity}
            onChange={(value) => props.setGranularity(value as TimeGranularity)}
            options={[
              ["day", "日"],
              ["week", "周"],
              ["month", "月"],
            ]}
          />
        </div>
        <FilterBar
          filters={props.filters}
          setFilters={props.setFilters}
          options={props.linkedOptions}
          includeResult
          mobile={props.isMobile}
        />
      </section>

      <section className="panel span-8">
        <div className="panel-title">
          <h2>胜率趋势</h2>
          <span>{props.rows.length} 条记录</span>
        </div>
        <WinRateChart buckets={props.buckets} />
      </section>

      <section className="panel span-4">
        <div className="panel-title">
          <h2>概览</h2>
        </div>
        <SummaryGrid summaries={props.summaries} />
      </section>

      <section className="panel span-7">
        <div className="panel-title">
          <h2>召唤师表现</h2>
          <div className="summary-controls">
            <label className="inline-number">
              <span>场次 ≥</span>
              <input
                min="1"
                type="number"
                value={summaryMinMatchesInput}
                onBlur={() => setSummaryMinMatchesInput(String(summaryMinMatches))}
                onChange={(event) => setSummaryMinMatchesInput(event.target.value)}
              />
            </label>
            <label className="inline-number">
              <span>胜率 ≥</span>
              <input
                max="100"
                min="0"
                type="number"
                value={summaryMinWinRateInput}
                onBlur={() => setSummaryMinWinRateInput(String(summaryMinWinRate))}
                onChange={(event) => setSummaryMinWinRateInput(event.target.value)}
              />
              <span>%</span>
            </label>
            <DimensionPicker dimensions={props.summaryDimensions} setDimensions={props.setSummaryDimensions} />
          </div>
        </div>
        <SummaryTable
          rows={props.summaries}
          dimensions={props.summaryDimensions}
          minMatches={summaryMinMatches}
          minWinRate={summaryMinWinRate}
          isMobile={props.isMobile}
        />
      </section>

      <section className="panel span-12">
        <div className="panel-title combo-title">
          <h2>组合表现</h2>
          <ComboControls
            sizes={props.comboSizes}
            setSizes={props.setComboSizes}
            minMatches={comboMinMatchesInput}
            setMinMatches={setComboMinMatchesInput}
            minWinRate={comboMinWinRateInput}
            setMinWinRate={setComboMinWinRateInput}
          />
        </div>
        <ComboTable rows={props.comboSummaries} minMatches={comboMinMatches} minWinRate={comboMinWinRate} isMobile={props.isMobile} />
      </section>
    </div>
  );
}

function PkView(props: {
  left: FilterState;
  right: FilterState;
  setLeft: (filters: FilterState) => void;
  setRight: (filters: FilterState) => void;
  options: ReturnType<typeof getOptions>;
  leftOptions: ReturnType<typeof getLinkedOptions>;
  rightOptions: ReturnType<typeof getLinkedOptions>;
  leftSummary: PlayerSummary;
  rightSummary: PlayerSummary;
  isMobile: boolean;
}) {
  return (
    <div className="view-grid">
      <section className="panel span-12">
        <div className="panel-title">
          <h2>召唤师 PK</h2>
          <span>前端独立过滤与聚合，双方条件互不影响</span>
        </div>
      </section>
      <section className="panel span-6 blue-edge allow-overflow">
        <h2>蓝方条件</h2>
        <FilterBar filters={props.left} setFilters={props.setLeft} options={props.leftOptions} compact mobile={props.isMobile} />
        <PkCard summary={props.leftSummary} rival={props.rightSummary} />
      </section>
      <section className="panel span-6 red-edge allow-overflow">
        <h2>红方条件</h2>
        <FilterBar filters={props.right} setFilters={props.setRight} options={props.rightOptions} compact mobile={props.isMobile} />
        <PkCard summary={props.rightSummary} rival={props.leftSummary} />
      </section>
    </div>
  );
}

function RankingView(props: {
  granularity: TimeGranularity;
  setGranularity: (granularity: TimeGranularity) => void;
  minMatches: string;
  setMinMatches: (value: string) => void;
  rows: PlayerSummary[];
  isMobile: boolean;
}) {
  return (
    <div className="view-grid">
      <section className="panel span-12">
        <div className="panel-title">
          <h2>排行榜</h2>
          <Segmented
            value={props.granularity}
            onChange={(value) => props.setGranularity(value as TimeGranularity)}
            options={[
              ["day", "日"],
              ["week", "周"],
              ["month", "月"],
            ]}
          />
        </div>
        <label className="field narrow">
          <span>最低场次</span>
          <input
            type="number"
            min="1"
            value={props.minMatches}
            onBlur={() => props.setMinMatches(String(parseMinMatchesInput(props.minMatches)))}
            onChange={(event) => props.setMinMatches(event.target.value)}
          />
        </label>
      </section>
      <section className="panel span-12">
        {props.isMobile ? (
          <MobileRankingCards rows={props.rows} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>排名</th>
                <th>召唤师</th>
                <th>场次</th>
                <th>胜率</th>
                <th>评分</th>
                <th>KDA</th>
                <th>MVP</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => (
                <tr className={rankClass(index)} key={row.summoner}>
                  <td>
                    <RankBadge index={index} fallback={String(index + 1)} />
                  </td>
                  <td>{row.summoner}</td>
                  <td>{row.matches}</td>
                  <td>{percent(row.winRate)}</td>
                  <td>{fixed(row.avgRating)}</td>
                  <td>{fixed(row.kda)}</td>
                  <td>{row.mvpCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function EntryView({ existingRows, candidateConfig, isMobile }: { existingRows: MatchPlayerRow[]; candidateConfig: CandidateConfig; isMobile: boolean }) {
  const [matchId, setMatchId] = useState(`M${new Date().toISOString().slice(0, 16).replace(/\D/g, "")}`);
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 16));
  const [mode, setMode] = useState("5v5排位");
  const [durationSeconds, setDurationSeconds] = useState(1200);
  const [blueKills, setBlueKills] = useState(0);
  const [redKills, setRedKills] = useState(0);
  const [winningSide, setWinningSide] = useState<Side>("blue");
  const [players, setPlayers] = useState<DraftPlayer[]>([
    ...Array.from({ length: 5 }, (_, index) => emptyPlayer("blue", index)),
    ...Array.from({ length: 5 }, (_, index) => emptyPlayer("red", index)),
  ]);
  const [importFileName, setImportFileName] = useState("");
  const [importedRows, setImportedRows] = useState<MatchPlayerRow[]>([]);
  const [importIssues, setImportIssues] = useState<string[]>([]);
  const draftRows = useMemo(
    () =>
      players.map((player) => ({
        matchId,
        playedAt: playedAt.replace("T", " "),
        mode,
        durationSeconds,
        blueKills,
        redKills,
        winningSide,
        ...player,
      })),
    [players, matchId, playedAt, mode, durationSeconds, blueKills, redKills, winningSide],
  );

  function updatePlayer(index: number, patch: Partial<DraftPlayer>) {
    setPlayers((current) => current.map((player, playerIndex) => (playerIndex === index ? { ...player, ...patch } : player)));
  }

  function downloadRows(rows: MatchPlayerRow[], filename: string) {
    const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadDraft(mergeExisting: boolean) {
    downloadRows(mergeExisting ? [...existingRows, ...draftRows] : draftRows, mergeExisting ? "matches.csv" : `${matchId}.csv`);
  }

  function downloadImported(mergeExisting: boolean) {
    if (!importedRows.length) return;
    downloadRows(mergeExisting ? [...existingRows, ...importedRows] : importedRows, mergeExisting ? "matches.csv" : importFileName || "imported-matches.csv");
  }

  async function handleCsvImport(file: File) {
    const text = await file.text();
    const parsedRows = parseCsv(text);
    setImportFileName(file.name || "imported-matches.csv");
    setImportedRows(parsedRows);
    setImportIssues(assertCsvShape(parsedRows));
  }

  return (
    <div className="view-grid">
      <section className="panel span-12">
        <div className="panel-title">
          <h2>对局录入</h2>
          <span>草稿确认后导出 CSV，再提交到仓库</span>
        </div>
        <div className="form-grid">
          <Field label="对局 ID" value={matchId} onChange={setMatchId} />
          <Field label="时间" type="datetime-local" value={playedAt} onChange={setPlayedAt} />
          <Field label="模式" value={mode} onChange={setMode} />
          <Field label="时长秒" type="number" value={durationSeconds} onChange={(value) => setDurationSeconds(Number(value))} />
          <Field label="蓝方击杀" type="number" value={blueKills} onChange={(value) => setBlueKills(Number(value))} />
          <Field label="红方击杀" type="number" value={redKills} onChange={(value) => setRedKills(Number(value))} />
          <label className="field">
            <span>胜方</span>
            <select value={winningSide} onChange={(event) => setWinningSide(event.target.value as Side)}>
              <option value="blue">蓝方</option>
              <option value="red">红方</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel span-5">
        <div className="panel-title">
          <h2>CSV 导入</h2>
        </div>
        <p className="hint csv-note">当前先统一走 CSV。截图识别暂不放在网页录入流程里，避免乱码和错位污染正式数据。</p>
        <label className="field">
          <span>选择 CSV</span>
          <input
            className="file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleCsvImport(file);
            }}
          />
        </label>
        <div className="import-summary">
          <Metric label="导入记录" value={String(importedRows.length)} />
          <Metric label="导入对局" value={String(groupMatches(importedRows).length)} />
          <Metric label="校验提示" value={String(importIssues.length)} accent={!importIssues.length && importedRows.length > 0} />
        </div>
        {importIssues.length ? (
          <details className="alert compact-alert" open>
            <summary>导入 CSV 有 {importIssues.length} 个需要检查的地方</summary>
            <ul>
              {importIssues.slice(0, 8).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="button-row vertical">
          <button disabled={!importedRows.length} onClick={() => downloadImported(false)}>
            导出导入 CSV
          </button>
          <button className="primary" disabled={!importedRows.length} onClick={() => downloadImported(true)}>
            合并导出 matches.csv
          </button>
        </div>
        <CandidateSummary config={candidateConfig} />
      </section>

      <section className="panel span-7">
        <div className="panel-title">
          <h2>玩家草稿</h2>
          <div className="button-row">
            <button onClick={() => downloadDraft(false)}>导出本局</button>
            <button className="primary" onClick={() => downloadDraft(true)}>
              合并导出 matches.csv
            </button>
          </div>
        </div>
        <DraftTable players={players} updatePlayer={updatePlayer} isMobile={isMobile} />
      </section>
    </div>
  );
}

function FilterBar(props: {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  options: ReturnType<typeof getLinkedOptions>;
  includeResult?: boolean;
  compact?: boolean;
  mobile?: boolean;
}) {
  const update = (patch: Partial<FilterState>) => props.setFilters({ ...props.filters, ...patch });
  if (props.mobile) {
    return (
      <div className={props.compact ? "filter-grid mobile-filter-grid compact" : "filter-grid mobile-filter-grid"}>
        <SelectField label="召唤师" value={props.filters.summoner} options={props.options.summoners} onChange={(value) => update({ summoner: value })} />
        <SearchableSelectField label="英雄" value={props.filters.hero} options={props.options.heroes} onChange={(value) => update({ hero: value })} />
        {props.includeResult ? (
          <label className="field">
            <span>胜负</span>
            <select value={props.filters.result} onChange={(event) => update({ result: event.target.value as FilterState["result"] })}>
              <option value="all">全部</option>
              <option value="win">胜利</option>
              <option value="loss">失败</option>
            </select>
          </label>
        ) : null}
        <details className="mobile-filter-more">
          <summary>更多筛选</summary>
          <div>
            <MultiSelectField
              label="队友"
              values={props.filters.teammates}
              options={props.options.teammates}
              onChange={(values) => update({ teammates: values })}
            />
            <SelectField label="位置" value={props.filters.position} options={props.options.positions} onChange={(value) => update({ position: value })} />
            <Field label="开始" type="date" value={props.filters.startDate} onChange={(value) => update({ startDate: value })} />
            <Field label="结束" type="date" value={props.filters.endDate} onChange={(value) => update({ endDate: value })} />
            <button className="full" type="button" onClick={() => props.setFilters(emptyFilters)}>
              重置
            </button>
          </div>
        </details>
      </div>
    );
  }
  return (
    <div className={props.compact ? "filter-grid compact" : "filter-grid"}>
      <SelectField label="召唤师" value={props.filters.summoner} options={props.options.summoners} onChange={(value) => update({ summoner: value })} />
      <SearchableSelectField label="英雄" value={props.filters.hero} options={props.options.heroes} onChange={(value) => update({ hero: value })} />
      <MultiSelectField
        label="队友"
        values={props.filters.teammates}
        options={props.options.teammates}
        onChange={(values) => update({ teammates: values })}
      />
      <SelectField label="位置" value={props.filters.position} options={props.options.positions} onChange={(value) => update({ position: value })} />
      {props.includeResult ? (
        <label className="field">
          <span>胜负</span>
          <select value={props.filters.result} onChange={(event) => update({ result: event.target.value as FilterState["result"] })}>
            <option value="all">全部</option>
            <option value="win">胜利</option>
            <option value="loss">失败</option>
          </select>
        </label>
      ) : null}
      <Field label="开始" type="date" value={props.filters.startDate} onChange={(value) => update({ startDate: value })} />
      <Field label="结束" type="date" value={props.filters.endDate} onChange={(value) => update({ endDate: value })} />
      <button onClick={() => props.setFilters(emptyFilters)}>重置</button>
    </div>
  );
}

function WinRateChart({ buckets }: { buckets: ReturnType<typeof timeSeries> }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartSize = useElementSize(chartRef);
  if (!buckets.length) return <div className="empty">暂无符合条件的数据</div>;
  const height = Math.max(220, Math.round(chartSize.height || 310));
  const compact = height < 270;
  const width = Math.max(compact ? 520 : 760, Math.round(chartSize.width || 960));
  const padding = compact
    ? { top: 44, right: 32, bottom: 44, left: 32 }
    : { top: 58, right: 42, bottom: 56, left: 42 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const points = buckets.map((bucket, index) => {
    const x = padding.left + (buckets.length === 1 ? innerWidth / 2 : (index / (buckets.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - bucket.winRate * innerHeight;
    return { ...bucket, x, y };
  });
  const linePath = smoothLinePath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const baselineY = padding.top + innerHeight;
  const ratingMax = Math.max(10, Math.ceil(Math.max(...points.map((point) => point.avgRating))));
  const barSlot = buckets.length === 1 ? innerWidth : innerWidth / Math.max(1, buckets.length - 1);
  const barWidth = Math.max(8, Math.min(compact ? 18 : 26, barSlot * 0.38));

  return (
    <div className="chart line-chart" ref={chartRef} role="img" aria-label="胜率折线图">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="lineArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(76, 215, 255, 0.28)" />
            <stop offset="100%" stopColor="rgba(76, 215, 255, 0.02)" />
          </linearGradient>
          <linearGradient id="ratingBar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255, 218, 111, 0.9)" />
            <stop offset="55%" stopColor="rgba(255, 188, 72, 0.34)" />
            <stop offset="100%" stopColor="rgba(255, 188, 72, 0.08)" />
          </linearGradient>
        </defs>
        <line className="axis-line" x1={padding.left} x2={padding.left + innerWidth} y1={baselineY} y2={baselineY} />
        <line className="axis-line muted" x1={padding.left} x2={padding.left + innerWidth} y1={padding.top} y2={padding.top} />
        <g className="rating-bars" aria-label="平均评分柱状图">
          {points.map((point, index) => {
            const showLabel = index === 0 || index === points.length - 1 || index % labelStep === 0;
            const barHeight = Math.max(2, (point.avgRating / ratingMax) * innerHeight);
            const barY = baselineY - barHeight;
            return (
              <g className="rating-bar-group" key={`${point.label}-rating`}>
                <rect className="rating-bar" x={point.x - barWidth / 2} y={barY} width={barWidth} height={barHeight} rx="5" />
                {showLabel ? (
                  <text className="rating-value" x={point.x} y={Math.max(padding.top + 12, barY - 7)}>
                    {fixed(point.avgRating)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
        <path className="line-area" d={areaPath} />
        <path className="line-path" d={linePath} />
        {points.map((point, index) => {
          const showLabel = index === 0 || index === points.length - 1 || index % labelStep === 0;
          const valueY = Math.max(26, point.y - 20);
          return (
          <g className="line-point" key={point.label}>
            <title>
              {point.label} · 胜率 {percent(point.winRate)} · 平均评分 {fixed(point.avgRating)}
            </title>
            <circle className="line-dot" cx={point.x} cy={point.y} r="4.5" />
            <text className="line-value" x={point.x} y={valueY}>
              {percent(point.winRate)}
            </text>
            {showLabel ? (
              <text className="line-label" x={point.x} y={height - 17}>
                {shortBucketLabel(point.label)}
              </text>
            ) : null}
          </g>
          );
        })}
      </svg>
    </div>
  );
}

function smoothLinePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const prev = points[index - 1];
    const midX = (prev.x + point.x) / 2;
    return `${path} C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize((current) => {
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (current.width === width && current.height === height) return current;
        return { width, height };
      });
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function SummaryGrid({ summaries }: { summaries: PlayerSummary[] }) {
  const totalMatches = summaries.reduce((total, summary) => total + summary.matches, 0);
  const totalWins = summaries.reduce((total, summary) => total + summary.wins, 0);
  const best = summaries[0];
  return (
    <div className="metric-grid">
      <Metric label="筛选记录" value={String(totalMatches)} />
      <Metric label="整体胜率" value={percent(totalMatches ? totalWins / totalMatches : 0)} />
      <Metric label="最佳召唤师" value={best?.summoner ?? "-"} />
      <Metric label="最佳评分" value={best ? fixed(best.avgRating) : "-"} />
    </div>
  );
}

function DimensionPicker(props: { dimensions: SummaryDimension[]; setDimensions: (dimensions: SummaryDimension[]) => void }) {
  function toggle(dimension: SummaryDimension) {
    const next = props.dimensions.includes(dimension)
      ? props.dimensions.filter((item) => item !== dimension)
      : [...props.dimensions, dimension];
    props.setDimensions(next.length ? next : [dimension]);
  }

  return (
    <div className="dimension-picker" aria-label="下钻字段">
      <span>下钻</span>
      {([
        ["summoner", "召唤师"],
        ["hero", "英雄"],
        ["position", "位置"],
      ] as const).map(([dimension, label]) => (
        <label key={dimension}>
          <input type="checkbox" checked={props.dimensions.includes(dimension)} onChange={() => toggle(dimension)} />
          {label}
        </label>
      ))}
    </div>
  );
}

function summaryLabelForRow(row: MatchPlayerRow, dimensions: SummaryDimension[]): string {
  if (!dimensions.length || (dimensions.length === 1 && dimensions[0] === "summoner")) {
    return row.summoner || "未填写召唤师";
  }
  if (dimensions.length === 1 && dimensions[0] === "hero") {
    return row.hero || "未填写英雄";
  }
  if (dimensions.length === 1 && dimensions[0] === "position") {
    return row.position || "未填写位置";
  }
  return dimensions
    .map((dimension) => {
      if (dimension === "summoner") return row.summoner || "未填写召唤师";
      if (dimension === "hero") return row.hero || "未填写英雄";
      return row.position || "未填写位置";
    })
    .join(" / ");
}

function summaryDimensionLabel(dimension: SummaryDimension): string {
  if (dimension === "summoner") return "召唤师";
  if (dimension === "hero") return "英雄";
  return "位置";
}

function SummaryTable({
  rows,
  dimensions,
  minMatches,
  minWinRate,
  isMobile,
}: {
  rows: PlayerSummary[];
  dimensions: SummaryDimension[];
  minMatches: number;
  minWinRate: number;
  isMobile: boolean;
}) {
  const pageSize = 8;
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SummarySortKey>("winRate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const label = dimensions.map(summaryDimensionLabel).join(" / ");
  const visibleRows = useMemo(
    () => rows.filter((row) => row.matches >= minMatches && row.winRate * 100 >= minWinRate),
    [rows, minMatches, minWinRate],
  );
  const sortedRows = useMemo(
    () => [...visibleRows].sort((a, b) => compareSummaries(a, b, sortKey, sortDirection)),
    [visibleRows, sortKey, sortDirection],
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedRows = sortedRows.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [dimensions, minMatches, minWinRate, sortDirection, sortKey]);

  function updateSort(key: SummarySortKey) {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection(key === "label" ? "asc" : "desc");
  }

  function SortHeader({ column, children }: { column: SummarySortKey; children: string }) {
    const active = sortKey === column;
    return (
      <th>
        <button className={active ? "sort-button active" : "sort-button"} onClick={() => updateSort(column)}>
          {children}
          <span>{active ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
        </button>
      </th>
    );
  }

  if (!visibleRows.length) {
    return (
      <div className="empty compact-empty">暂无场次达到 {minMatches} 且胜率达到 {minWinRate}% 的{label}数据</div>
    );
  }

  return (
    <div className="summary-table-shell">
      {isMobile ? (
        <MobileSummaryCards
          label={label}
          rows={pagedRows}
          pageStart={pageStart}
          sortKey={sortKey}
          sortDirection={sortDirection}
          updateSort={updateSort}
        />
      ) : (
        <div className="summary-table-scroll">
          <table>
            <thead>
              <tr>
                <SortHeader column="label">{label}</SortHeader>
                <SortHeader column="matches">场次</SortHeader>
                <SortHeader column="winRate">胜率</SortHeader>
                <SortHeader column="avgRating">评分</SortHeader>
                <SortHeader column="kda">KDA</SortHeader>
                <SortHeader column="avgDamageDealt">输出</SortHeader>
                <SortHeader column="avgDamageTaken">承伤</SortHeader>
                <SortHeader column="avgGold">平均经济</SortHeader>
                <SortHeader column="mvpCount">MVP</SortHeader>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, index) => {
                const rankIndex = pageStart + index;
                return (
                  <tr className={rankClass(rankIndex)} key={row.summoner}>
                    <td>
                      <RankBadge index={rankIndex} />
                      {row.summoner}
                    </td>
                    <td>{row.matches}</td>
                    <td>{percent(row.winRate)}</td>
                    <td>{fixed(row.avgRating)}</td>
                    <td>{fixed(row.kda)}</td>
                    <td>{compactNumber(row.avgDamageDealt)}</td>
                    <td>{compactNumber(row.avgDamageTaken)}</td>
                    <td>{compactNumber(row.avgGold)}</td>
                    <td>{row.mvpCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination-bar">
        <span>
          {pageStart + 1}-{Math.min(pageStart + pageSize, sortedRows.length)} / {sortedRows.length}
        </span>
        <div>
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            上一页
          </button>
          <strong>{currentPage} / {totalPages}</strong>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

function ComboControls(props: {
  sizes: number[];
  setSizes: (sizes: number[]) => void;
  minMatches: string;
  setMinMatches: (value: string) => void;
  minWinRate: string;
  setMinWinRate: (value: string) => void;
}) {
  function toggleSize(size: number) {
    const next = props.sizes.includes(size) ? props.sizes.filter((item) => item !== size) : [...props.sizes, size].sort((a, b) => a - b);
    props.setSizes(next.length ? next : [size]);
  }

  return (
    <div className="combo-controls">
      <label className="inline-number">
        <span>场次 ≥</span>
        <input
          min="1"
          type="number"
          value={props.minMatches}
          onBlur={() => props.setMinMatches(String(parseMinMatchesInput(props.minMatches)))}
          onChange={(event) => props.setMinMatches(event.target.value)}
        />
      </label>
      <label className="inline-number">
        <span>胜率 ≥</span>
        <input
          max="100"
          min="0"
          type="number"
          value={props.minWinRate}
          onBlur={() => props.setMinWinRate(String(parseWinRateInput(props.minWinRate)))}
          onChange={(event) => props.setMinWinRate(event.target.value)}
        />
        <span>%</span>
      </label>
      <div className="dimension-picker" aria-label="组合人数">
        <span>组合人数</span>
        {[2, 3, 4, 5].map((size) => (
          <label key={size}>
            <input type="checkbox" checked={props.sizes.includes(size)} onChange={() => toggleSize(size)} />
            {size}人
          </label>
        ))}
      </div>
    </div>
  );
}

function ComboTable({ rows, minMatches, minWinRate, isMobile }: { rows: ComboSummary[]; minMatches: number; minWinRate: number; isMobile: boolean }) {
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<ComboSortKey>("winRate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const visibleRows = useMemo(
    () => rows.filter((row) => row.matches >= minMatches && row.winRate * 100 >= minWinRate),
    [rows, minMatches, minWinRate],
  );
  const sortedRows = useMemo(
    () => [...visibleRows].sort((a, b) => compareCombos(a, b, sortKey, sortDirection)),
    [visibleRows, sortKey, sortDirection],
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedRows = sortedRows.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [minMatches, minWinRate, sortDirection, sortKey]);

  function updateSort(key: ComboSortKey) {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection(key === "label" || key === "size" ? "asc" : "desc");
  }

  function SortHeader({ column, children }: { column: ComboSortKey; children: string }) {
    const active = sortKey === column;
    return (
      <th>
        <button className={active ? "sort-button active" : "sort-button"} onClick={() => updateSort(column)}>
          {children}
          <span>{active ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
        </button>
      </th>
    );
  }

  if (!visibleRows.length) return <div className="empty compact-empty">暂无场次达到 {minMatches} 且胜率达到 {minWinRate}% 的组合</div>;

  return (
    <div className="summary-table-shell combo-table-shell">
      {isMobile ? (
        <MobileComboCards
          rows={pagedRows}
          pageStart={pageStart}
          sortKey={sortKey}
          sortDirection={sortDirection}
          updateSort={updateSort}
        />
      ) : (
        <div className="summary-table-scroll combo-table-scroll">
          <table>
            <thead>
              <tr>
                <SortHeader column="size">组合人数</SortHeader>
                <SortHeader column="label">召唤师组合</SortHeader>
                <SortHeader column="matches">场次</SortHeader>
                <SortHeader column="winRate">胜率</SortHeader>
                <SortHeader column="winsLosses">胜-负</SortHeader>
                <SortHeader column="avgRating">平均评分</SortHeader>
                <SortHeader column="kda">KDA</SortHeader>
                <SortHeader column="avgGold">平均经济</SortHeader>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, index) => {
                const rankIndex = pageStart + index;
                return (
                  <tr className={rankClass(rankIndex)} key={`${row.size}-${row.label}`}>
                    <td>{row.size}人</td>
                    <td>
                      <RankBadge index={rankIndex} />
                      {row.label}
                    </td>
                    <td>{row.matches}</td>
                    <td>{percent(row.winRate)}</td>
                    <td>
                      {row.wins}-{row.losses}
                    </td>
                    <td>{fixed(row.avgRating)}</td>
                    <td>{fixed(row.kda)}</td>
                    <td>{compactNumber(row.avgGold)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination-bar">
        <span>
          {pageStart + 1}-{Math.min(pageStart + pageSize, sortedRows.length)} / {sortedRows.length}
        </span>
        <div>
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            上一页
          </button>
          <strong>{currentPage} / {totalPages}</strong>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileSummaryCards({
  label,
  rows,
  pageStart,
  sortKey,
  sortDirection,
  updateSort,
}: {
  label: string;
  rows: PlayerSummary[];
  pageStart: number;
  sortKey: SummarySortKey;
  sortDirection: SortDirection;
  updateSort: (key: SummarySortKey) => void;
}) {
  const options: [SummarySortKey, string][] = [
    ["winRate", "胜率"],
    ["matches", "场次"],
    ["avgRating", "评分"],
    ["kda", "KDA"],
    ["avgDamageDealt", "输出"],
    ["avgDamageTaken", "承伤"],
    ["avgGold", "平均经济"],
    ["mvpCount", "MVP"],
    ["label", label],
  ];
  return (
    <div className="mobile-card-list">
      <MobileSortBar
        value={sortKey}
        direction={sortDirection}
        options={options}
        onSelect={(value) => {
          if (value !== sortKey) updateSort(value);
        }}
        onToggleDirection={() => updateSort(sortKey)}
      />
      {rows.map((row, index) => {
        const rankIndex = pageStart + index;
        return (
          <article className={`mobile-result-card ${rankClass(rankIndex)}`} key={row.summoner}>
            <div className="mobile-card-head">
              <div>
                <RankBadge index={rankIndex} fallback={String(rankIndex + 1)} />
                <strong>{row.summoner}</strong>
              </div>
              <b>{percent(row.winRate)}</b>
            </div>
            <div className="mobile-stat-grid">
              <MobileStat label="场次" value={String(row.matches)} />
              <MobileStat label="评分" value={fixed(row.avgRating)} />
              <MobileStat label="KDA" value={fixed(row.kda)} />
              <MobileStat label="MVP" value={String(row.mvpCount)} />
              <MobileStat label="输出" value={compactNumber(row.avgDamageDealt)} />
              <MobileStat label="承伤" value={compactNumber(row.avgDamageTaken)} />
              <MobileStat label="平均经济" value={compactNumber(row.avgGold)} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MobileComboCards({
  rows,
  pageStart,
  sortKey,
  sortDirection,
  updateSort,
}: {
  rows: ComboSummary[];
  pageStart: number;
  sortKey: ComboSortKey;
  sortDirection: SortDirection;
  updateSort: (key: ComboSortKey) => void;
}) {
  const options: [ComboSortKey, string][] = [
    ["winRate", "胜率"],
    ["matches", "场次"],
    ["winsLosses", "胜-负"],
    ["avgRating", "评分"],
    ["kda", "KDA"],
    ["avgGold", "经济"],
    ["size", "人数"],
    ["label", "组合"],
  ];
  return (
    <div className="mobile-card-list">
      <MobileSortBar
        value={sortKey}
        direction={sortDirection}
        options={options}
        onSelect={(value) => {
          if (value !== sortKey) updateSort(value);
        }}
        onToggleDirection={() => updateSort(sortKey)}
      />
      {rows.map((row, index) => {
        const rankIndex = pageStart + index;
        return (
          <article className={`mobile-result-card ${rankClass(rankIndex)}`} key={`${row.size}-${row.label}`}>
            <div className="mobile-card-head">
              <div>
                <RankBadge index={rankIndex} fallback={String(rankIndex + 1)} />
                <strong>{row.label}</strong>
              </div>
              <b>{percent(row.winRate)}</b>
            </div>
            <div className="mobile-stat-grid">
              <MobileStat label="人数" value={`${row.size}人`} />
              <MobileStat label="场次" value={String(row.matches)} />
              <MobileStat label="胜-负" value={`${row.wins}-${row.losses}`} />
              <MobileStat label="评分" value={fixed(row.avgRating)} />
              <MobileStat label="KDA" value={fixed(row.kda)} />
              <MobileStat label="经济" value={compactNumber(row.avgGold)} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MobileRankingCards({ rows }: { rows: PlayerSummary[] }) {
  if (!rows.length) return <div className="empty compact-empty">暂无符合最低场次的排行</div>;
  return (
    <div className="mobile-card-list">
      {rows.map((row, index) => (
        <article className={`mobile-result-card ${rankClass(index)}`} key={row.summoner}>
          <div className="mobile-card-head">
            <div>
              <RankBadge index={index} fallback={String(index + 1)} />
              <strong>{row.summoner}</strong>
            </div>
            <b>{percent(row.winRate)}</b>
          </div>
          <div className="mobile-stat-grid">
            <MobileStat label="场次" value={String(row.matches)} />
            <MobileStat label="评分" value={fixed(row.avgRating)} />
            <MobileStat label="KDA" value={fixed(row.kda)} />
            <MobileStat label="MVP" value={String(row.mvpCount)} />
          </div>
        </article>
      ))}
    </div>
  );
}

function MobileSortBar<T extends string>({
  value,
  direction,
  options,
  onSelect,
  onToggleDirection,
}: {
  value: T;
  direction: SortDirection;
  options: [T, string][];
  onSelect: (value: T) => void;
  onToggleDirection: () => void;
}) {
  return (
    <div className="mobile-sort-bar">
      <label className="field">
        <span>排序</span>
        <select value={value} onChange={(event) => onSelect(event.target.value as T)}>
          {options.map(([optionValue, optionLabel]) => (
            <option value={optionValue} key={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onToggleDirection}>
        {direction === "asc" ? "升序" : "降序"}
      </button>
    </div>
  );
}

function MobileStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="mobile-stat">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function PkCard({ summary, rival }: { summary: PlayerSummary; rival: PlayerSummary }) {
  return (
    <div className="pk-card">
      <div>
        <p className="eyebrow">Summoner</p>
        <h3>{summary.summoner}</h3>
      </div>
      <Metric label="胜率" value={percent(summary.winRate)} accent={summary.winRate >= rival.winRate} />
      <Metric label="场次" value={String(summary.matches)} accent={summary.matches >= rival.matches} />
      <Metric label="评分" value={fixed(summary.avgRating)} accent={summary.avgRating >= rival.avgRating} />
      <Metric label="KDA" value={fixed(summary.kda)} accent={summary.kda >= rival.kda} />
      <Metric label="输出" value={compactNumber(summary.avgDamageDealt)} accent={summary.avgDamageDealt >= rival.avgDamageDealt} />
      <Metric label="承伤" value={compactNumber(summary.avgDamageTaken)} accent={summary.avgDamageTaken >= rival.avgDamageTaken} />
    </div>
  );
}

function MobileDraftCards({
  players,
  updatePlayer,
}: {
  players: DraftPlayer[];
  updatePlayer: (index: number, patch: Partial<DraftPlayer>) => void;
}) {
  return (
    <div className="mobile-draft-list">
      {players.map((player, index) => (
        <article className={`mobile-draft-card ${player.side}`} key={index}>
          <div className="mobile-draft-head">
            <span className="side-pill">{player.side === "blue" ? "蓝方" : "红方"}</span>
            <strong>{index % 5 + 1} 号位</strong>
            <label className="check-field">
              <input type="checkbox" checked={player.isMvp} onChange={(event) => updatePlayer(index, { isMvp: event.target.checked })} />
              MVP
            </label>
          </div>
          <div className="mobile-draft-section identity">
            <label className="field">
              <span>召唤师</span>
              <input value={player.summoner} placeholder="召唤师" onChange={(event) => updatePlayer(index, { summoner: event.target.value })} />
            </label>
            <label className="field">
              <span>英雄</span>
              <input value={player.hero} placeholder="英雄" onChange={(event) => updatePlayer(index, { hero: event.target.value })} />
            </label>
            <label className="field">
              <span>位置</span>
              <select value={player.position} onChange={(event) => updatePlayer(index, { position: event.target.value })}>
                {positions.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mobile-draft-section kda">
            <label className="field">
              <span>评分</span>
              <NumberInput value={player.rating} onChange={(value) => updatePlayer(index, { rating: value })} placeholder="评分" />
            </label>
            <label className="field">
              <span>K</span>
              <NumberInput value={player.kills} onChange={(value) => updatePlayer(index, { kills: value })} placeholder="K" />
            </label>
            <label className="field">
              <span>D</span>
              <NumberInput value={player.deaths} onChange={(value) => updatePlayer(index, { deaths: value })} placeholder="D" />
            </label>
            <label className="field">
              <span>A</span>
              <NumberInput value={player.assists} onChange={(value) => updatePlayer(index, { assists: value })} placeholder="A" />
            </label>
          </div>
          <div className="mobile-draft-section economy">
            <label className="field">
              <span>输出</span>
              <NumberInput value={player.damageDealt} onChange={(value) => updatePlayer(index, { damageDealt: value })} placeholder="输出" />
            </label>
            <label className="field">
              <span>承伤</span>
              <NumberInput value={player.damageTaken} onChange={(value) => updatePlayer(index, { damageTaken: value })} placeholder="承伤" />
            </label>
            <label className="field">
              <span>经济</span>
              <NumberInput value={player.gold} onChange={(value) => updatePlayer(index, { gold: value })} placeholder="经济" />
            </label>
            <label className="field">
              <span>参团</span>
              <NumberInput value={player.teamfightRate} onChange={(value) => updatePlayer(index, { teamfightRate: value })} placeholder="参团" />
            </label>
          </div>
        </article>
      ))}
    </div>
  );
}

function DraftTable({
  players,
  updatePlayer,
  isMobile,
}: {
  players: DraftPlayer[];
  updatePlayer: (index: number, patch: Partial<DraftPlayer>) => void;
  isMobile: boolean;
}) {
  if (isMobile) {
    return <MobileDraftCards players={players} updatePlayer={updatePlayer} />;
  }

  return (
    <div className="draft-table">
      <div className="draft-row draft-header">
        <span>阵营</span>
        <span>召唤师</span>
        <span>英雄</span>
        <span>位置</span>
        <span>评分</span>
        <span>K</span>
        <span>D</span>
        <span>A</span>
        <span>输出</span>
        <span>承伤</span>
        <span>经济</span>
        <span>参团</span>
        <span>MVP</span>
      </div>
      {players.map((player, index) => (
        <div className={`draft-row ${player.side}`} key={index}>
          <span className="side-pill">{player.side === "blue" ? "蓝" : "红"}</span>
          <input value={player.summoner} placeholder="召唤师" onChange={(event) => updatePlayer(index, { summoner: event.target.value })} />
          <input value={player.hero} placeholder="英雄" onChange={(event) => updatePlayer(index, { hero: event.target.value })} />
          <select value={player.position} onChange={(event) => updatePlayer(index, { position: event.target.value })}>
            {positions.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
          <NumberInput value={player.rating} onChange={(value) => updatePlayer(index, { rating: value })} placeholder="评分" />
          <NumberInput value={player.kills} onChange={(value) => updatePlayer(index, { kills: value })} placeholder="K" />
          <NumberInput value={player.deaths} onChange={(value) => updatePlayer(index, { deaths: value })} placeholder="D" />
          <NumberInput value={player.assists} onChange={(value) => updatePlayer(index, { assists: value })} placeholder="A" />
          <NumberInput value={player.damageDealt} onChange={(value) => updatePlayer(index, { damageDealt: value })} placeholder="输出" />
          <NumberInput value={player.damageTaken} onChange={(value) => updatePlayer(index, { damageTaken: value })} placeholder="承伤" />
          <NumberInput value={player.gold} onChange={(value) => updatePlayer(index, { gold: value })} placeholder="经济" />
          <NumberInput value={player.teamfightRate} onChange={(value) => updatePlayer(index, { teamfightRate: value })} placeholder="参团" />
          <label className="check-field">
            <input type="checkbox" checked={player.isMvp} onChange={(event) => updatePlayer(index, { isMvp: event.target.checked })} />
            MVP
          </label>
        </div>
      ))}
    </div>
  );
}

function CandidateSummary({ config }: { config: CandidateConfig }) {
  return (
    <details className="candidate-panel">
      <summary>数据字典：{config.summoners.length} 个朋友 ID，{config.heroes.length} 个英雄</summary>
      <p className="hint">候选项来自 `public/data/candidates.json`。`summoners` 是朋友白名单，分析、PK 和排行榜只统计这些 ID。</p>
      <div className="candidate-tags">
        {[...config.summoners.slice(0, 8), ...config.heroes.slice(0, 8)].map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </details>
  );
}

function Field(props: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input type={props.type ?? "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function NumberInput(props: { value: number; onChange: (value: number) => void; placeholder: string }) {
  return <input type="number" value={props.value} placeholder={props.placeholder} onChange={(event) => props.onChange(Number(event.target.value))} />;
}

function SelectField(props: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">全部</option>
        {props.options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SearchableSelectField(props: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const [query, setQuery] = useState(props.value);
  const [open, setOpen] = useState(false);
  const options = useMemo(() => [...new Set([...(props.value ? [props.value] : []), ...props.options])], [props.options, props.value]);
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) => option.toLocaleLowerCase("zh-CN").includes(normalizedQuery));
  }, [normalizedQuery, options]);

  useEffect(() => {
    setQuery(props.value);
  }, [props.value]);

  function selectOption(value: string) {
    props.onChange(value);
    setQuery(value);
    setOpen(false);
  }

  function updateQuery(value: string) {
    setQuery(value);
    setOpen(true);
    if (!value) props.onChange("");
    else if (props.value && value !== props.value) props.onChange("");
  }

  return (
    <div className="field searchable-field">
      <span>{props.label}</span>
      <div className="searchable-select" onBlur={() => window.setTimeout(() => setOpen(false), 120)}>
        <input
          aria-autocomplete="list"
          aria-expanded={open}
          role="combobox"
          value={query}
          placeholder={options.length ? `全部，可搜 ${options.length} 个英雄` : "暂无可选英雄"}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && visibleOptions[0]) {
              event.preventDefault();
              selectOption(visibleOptions[0]);
            }
            if (event.key === "Escape") setOpen(false);
          }}
        />
        {props.value ? (
          <button
            aria-label="清空英雄筛选"
            className="search-clear"
            type="button"
            onClick={() => {
              props.onChange("");
              setQuery("");
              setOpen(false);
            }}
          >
            ×
          </button>
        ) : null}
        {open ? (
          <div className="searchable-menu" role="listbox">
            {visibleOptions.length ? (
              visibleOptions.slice(0, 12).map((option) => (
                <button
                  className={option === props.value ? "active" : ""}
                  key={option}
                  role="option"
                  type="button"
                  aria-selected={option === props.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  {option}
                </button>
              ))
            ) : (
              <span>没有匹配英雄</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MultiSelectField(props: { label: string; values: string[]; options: string[]; onChange: (values: string[]) => void }) {
  const options = [...new Set([...props.values, ...props.options])];
  const summary = props.values.length ? props.values.join("、") : options.length ? `全部，可选 ${options.length} 人` : "暂无可选队友";
  return (
    <div className="field">
      <span>{props.label}</span>
      <details className="multi-select">
        <summary>{summary}</summary>
        <div className="multi-menu">
          {options.length ? (
            options.map((option) => {
              const checked = props.values.includes(option);
              return (
                <label key={option} className="multi-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      if (event.target.checked) props.onChange([...props.values, option]);
                      else props.onChange(props.values.filter((value) => value !== option));
                    }}
                  />
                  {option}
                </label>
              );
            })
          ) : (
            <span className="multi-empty">暂无可选队友</span>
          )}
          {props.values.length ? (
            <button type="button" onClick={() => props.onChange([])}>
              清空队友
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function Segmented(props: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <div className="segmented">
      {props.options.map(([value, label]) => (
        <button className={props.value === value ? "active" : ""} key={value} onClick={() => props.onChange(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={accent ? "metric accent" : "metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RankBadge({ index, fallback }: { index: number; fallback?: string }) {
  const labels = ["冠军", "亚军", "季军"];
  const label = labels[index];
  if (!label) return fallback ? <span className="rank-number">{fallback}</span> : null;
  return <span className={`rank-badge rank-badge-${index + 1}`}>{label}</span>;
}

function rankClass(index: number): string {
  return index < 3 ? `rank-row rank-${index + 1}` : "";
}

function fixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return String(Math.round(value));
}

function parseMinMatchesInput(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

function parseWinRateInput(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.floor(parsed)));
}

function shortBucketLabel(label: string): string {
  const day = label.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (day) return `${day[1]}-${day[2]}`;
  const month = label.match(/^\d{4}-(\d{2})$/);
  if (month) return `${month[1]}月`;
  return label.replace(/^\d{4}-/, "");
}

function compareSummaries(a: PlayerSummary, b: PlayerSummary, key: SummarySortKey, direction: SortDirection): number {
  const modifier = direction === "asc" ? 1 : -1;
  if (key === "label") {
    return a.summoner.localeCompare(b.summoner, "zh-CN") * modifier;
  }
  const left = a[key];
  const right = b[key];
  const primary = ((typeof left === "number" ? left : 0) - (typeof right === "number" ? right : 0)) * modifier;
  if (primary !== 0) return primary;
  if (key === "winRate") {
    return b.avgRating - a.avgRating || b.matches - a.matches || a.summoner.localeCompare(b.summoner, "zh-CN");
  }
  return 0;
}

function compareCombos(a: ComboSummary, b: ComboSummary, key: ComboSortKey, direction: SortDirection): number {
  const modifier = direction === "asc" ? 1 : -1;
  if (key === "label") return a.label.localeCompare(b.label, "zh-CN") * modifier;
  if (key === "winsLosses") return ((a.wins - a.losses) - (b.wins - b.losses)) * modifier;
  const left = a[key];
  const right = b[key];
  return ((typeof left === "number" ? left : 0) - (typeof right === "number" ? right : 0)) * modifier;
}

function rankingStartDate(granularity: TimeGranularity): string {
  const date = new Date();
  if (granularity === "day") date.setDate(date.getDate() - 1);
  if (granularity === "week") date.setDate(date.getDate() - 7);
  if (granularity === "month") date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 10);
}

function filterFriendRows(rows: MatchPlayerRow[], friendSummoners: string[]): MatchPlayerRow[] {
  if (!friendSummoners.length) return rows;
  const friends = new Set(friendSummoners);
  return rows.filter((row) => friends.has(row.summoner));
}

function uniqueTextList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === "undefined" ? false : window.matchMedia(query).matches));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}
