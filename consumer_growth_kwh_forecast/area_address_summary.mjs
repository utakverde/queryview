import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "file:///C:/Users/SAMELCO%20II/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const mysqlExe = "mysql";
const scriptDir = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"));
const configPath = `${scriptDir}\\builder.config.json`;
const config = JSON.parse(await fs.readFile(configPath, "utf8"));

const mysqlConfig = config.mysql ?? {};
const dbConfigs = config.databases ?? [];
if (dbConfigs.length === 0) throw new Error(`No databases configured in ${configPath}`);

const mysqlArgsBase = [
  "-h",
  mysqlConfig.host ?? "localhost",
  "-u",
  mysqlConfig.user ?? "root",
  `-p${mysqlConfig.password ?? ""}`,
  "-N",
  "-B",
];

function runQuery(database) {
  const sql = [
    `USE ${database};`,
    `SELECT`,
    `  COALESCE(NULLIF(TRIM(Area), ''), 'UNKNOWN') AS area,`,
    `  COUNT(*) AS consumer_count,`,
    `  COUNT(DISTINCT NULLIF(TRIM(Address), '')) AS address_count`,
    `FROM master`,
    `GROUP BY COALESCE(NULLIF(TRIM(Area), ''), 'UNKNOWN')`,
    `ORDER BY consumer_count DESC, area ASC;`,
  ].join(" ");
  const out = execFileSync(mysqlExe, [...mysqlArgsBase, "-e", sql], { encoding: "utf8", windowsHide: true }).trim();
  if (!out) return [];
  return out.split(/\r?\n/).map((line) => {
    const [area, consumerCount, addressCount] = line.split("\t");
    return {
      area,
      consumerCount: Number(consumerCount),
      addressCount: Number(addressCount),
    };
  });
}

const allRows = [];
for (const cfg of dbConfigs) {
  const rows = runQuery(cfg.database);
  for (const row of rows) {
    allRows.push({
      database: cfg.database,
      sheetName: cfg.sheetName ?? cfg.database,
      ...row,
    });
  }
}

const totalsByDb = new Map();
for (const row of allRows) {
  const current = totalsByDb.get(row.database) ?? { consumerCount: 0, addressCount: 0 };
  current.consumerCount += row.consumerCount;
  current.addressCount += row.addressCount;
  totalsByDb.set(row.database, current);
}

const totalsByArea = new Map();
for (const row of allRows) {
  const current = totalsByArea.get(row.area) ?? { consumerCount: 0, addressCount: 0 };
  current.consumerCount += row.consumerCount;
  current.addressCount += row.addressCount;
  totalsByArea.set(row.area, current);
}

const workbook = Workbook.create();
const summarySheet = workbook.worksheets.add("Summary");

summarySheet.showGridLines = false;
summarySheet.freezePanes.freezeRows(3);
summarySheet.getRange("A1:F1").merge();
summarySheet.getRange("A1").values = [["CONSUMERS BY AREA WITH ADDRESS SUMMARY"]];
summarySheet.getRange("A1").format = { fill: "#1F2937", font: { bold: true, color: "#FFFFFF", fontSize: 11 }, horizontalAlignment: "center" };
summarySheet.getRange("A2:F2").merge();
summarySheet.getRange("A2").values = [["Grouped by Area from the master table address records across all configured databases"]];
summarySheet.getRange("A2").format = { fill: "#E5E7EB", font: { italic: true, color: "#374151" }, horizontalAlignment: "center" };

const summaryRows = [["Database", "Area", "Consumer Count", "Distinct Addresses", "Address Coverage %", "Share of DB %"]];
for (const cfg of dbConfigs) {
  const rows = allRows.filter((r) => r.database === cfg.database).sort((a, b) => b.consumerCount - a.consumerCount || a.area.localeCompare(b.area));
  const totals = totalsByDb.get(cfg.database) ?? { consumerCount: 0, addressCount: 0 };
  for (const row of rows) {
    summaryRows.push([
      cfg.database,
      row.area,
      row.consumerCount,
      row.addressCount,
      row.consumerCount ? row.addressCount / row.consumerCount : null,
      totals.consumerCount ? row.consumerCount / totals.consumerCount : null,
    ]);
  }
  summaryRows.push([cfg.database, "TOTAL", totals.consumerCount, totals.addressCount, totals.consumerCount ? totals.addressCount / totals.consumerCount : null, 1]);
  summaryRows.push(["", "", "", "", "", ""]);
}

summarySheet.getRangeByIndexes(2, 0, summaryRows.length, summaryRows[0].length).values = summaryRows;
summarySheet.getRange("A4:F4").format = { fill: "#0F766E", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
summarySheet.getUsedRange().format.borders = { preset: "all", style: "thin", color: "#CBD5E1" };
summarySheet.getRange("A:A").format.columnWidth = 20;
summarySheet.getRange("B:B").format.columnWidth = 12;
summarySheet.getRange("C:D").format.columnWidth = 18;
summarySheet.getRange("E:F").format.columnWidth = 16;
summarySheet.getUsedRange().format.autofitRows();

const outputDir = `${scriptDir}\\outputs`;
await fs.mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19).replace("T", "_");
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}\\consumer_area_address_summary_${stamp}.xlsx`);
