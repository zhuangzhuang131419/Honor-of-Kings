# 王者荣耀对局分析

一个用于记录朋友《王者荣耀》对局并分析胜率、表现、PK 和排行榜的静态前端项目。

## 功能

- 读取 `public/data/matches.csv` 作为正式数据源。
- 分析页支持召唤师、英雄、队友、位置、模式、胜负和日期筛选。
- 胜率趋势支持日、周、月维度。
- PK 页在前端独立过滤两名召唤师的数据，支持带英雄、队友、位置等条件对比。
- 排行榜支持日、周、月范围和最低场次门槛。
- 录入页支持导入 CSV、校验 CSV、手动录入双方 10 人数据，并导出/合并导出 CSV。
- 筛选下拉框支持联动，队友筛选支持多选。

## 数据维护

正式数据文件是：

```text
public/data/matches.csv
```

朋友白名单与英雄字典文件是：

```text
public/data/candidates.json
```

`summoners` 是朋友 ID 白名单，分析页、PK 页和排行榜只统计这些玩家；`heroes` 可用于录入时保持英雄命名统一。

CSV 使用“一名玩家一行”的结构。一局完整对局应包含双方 10 名玩家，因此同一个 `matchId` 应有 10 行。

网页录入页导出的 `matches.csv` 可以替换仓库中的正式 CSV。截图 OCR 录入暂缓，当前数据维护统一以 CSV 为准。

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`。

## GitHub Pages

仓库包含 `.github/workflows/deploy-pages.yml`。推送到 `main` 后，GitHub Actions 会构建静态站点并发布到 GitHub Pages。
