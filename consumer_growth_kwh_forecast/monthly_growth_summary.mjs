import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "file:///C:/Users/SAMELCO%20II/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const mysqlExe = "mysql";
const tables = ["billhistory", "billhistory_bm"];
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

function runQuery(database, table) {
  const sql = [
    `USE ${database};`,
    `SELECT COUNT(entry) AS consumer_count, COALESCE(SUM(KilowattHour),0) AS kilowatt_hour, COALESCE(SUM(TotalBill),0) AS total_bill, billmonth, ratecode, flag_paid, Area`,
    `FROM ${table}`,
    `GROUP BY billmonth, ratecode, flag_paid, Area`,
    `ORDER BY billmonth, ratecode, flag_paid, Area;`,
  ].join(" ");
  const out = execFileSync(mysqlExe, [...mysqlArgsBase, "-e", sql], { encoding: "utf8", windowsHide: true }).trim();
  if (!out) return [];
  return out.split(/\r?\n/).map((line) => {
    const [consumerCount, kilowattHour, totalBill, billmonth, ratecode, flagPaid, area] = line.split("\t");
    return {
      consumerCount: Number(consumerCount),
      kilowattHour: Number(kilowattHour),
      totalBill: Number(totalBill),
      billmonth,
      ratecode,
      flagPaid,
      area,
    };
  });
}

function normalizeMonth(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}$/.test(text)) return text;
  if (/^\d{6}$/.test(text)) return text.slice(2);
  return text;
}

const allRows = [];
for (const cfg of dbConfigs) {
  for (const table of tables) {
    const rows = runQuery(cfg.database, table);
    for (const row of rows) {
      allRows.push({
        database: cfg.database,
        sheetName: cfg.sheetName ?? cfg.database,
        table,
        ...row,
      });
    }
  }
}

const grouped = new Map();
for (const row of allRows) {
  const month = normalizeMonth(row.billmonth);
  if (!month) continue;
  const key = `${row.database}|${month}`;
  const current = grouped.get(key) ?? { consumerCount: 0, kilowattHour: 0, totalBill: 0 };
  current.consumerCount += row.consumerCount;
  current.kilowattHour += row.kilowattHour;
  current.totalBill += row.totalBill;
  grouped.set(key, current);
}

const byMonth = new Map();
for (const row of allRows) {
  const month = normalizeMonth(row.billmonth);
  if (!month) continue;
  const key = `${month}`;
  const current = byMonth.get(key) ?? { consumerCount: 0, kilowattHour: 0, totalBill: 0 };
  current.consumerCount += row.consumerCount;
  current.kilowattHour += row.kilowattHour;
  current.totalBill += row.totalBill;
  byMonth.set(key, current);
}

const workbook = Workbook.create();
const summarySheet = workbook.worksheets.add("Monthly Growth");
const rawSheet = workbook.worksheets.add("Raw Data");

summarySheet.showGridLines = false;
summarySheet.freezePanes.freezeRows(3);
summarySheet.getRange("A1:G1").merge();
summarySheet.getRange("A1").values = [["MONTHLY CONSUMER GROWTH AND KWH SALES SUMMARY"]];
summarySheet.getRange("A1").format = { fill: "#111827", font: { bold: true, color: "#FFFFFF", fontSize: 16 }, horizontalAlignment: "center" };
summarySheet.getRange("A2:G2").merge();
summarySheet.getRange("A2").values = [["Combined totals from billhistory and billhistory_bm across all configured databases"]];
summarySheet.getRange("A2").format = { fill: "#E5E7EB", font: { italic: true, color: "#374151" }, horizontalAlignment: "center" };

const summaryRows = [["Month", "Consumer Count", "kWh Sales", "Total Bill", "Consumer Growth %", "kWh Growth %", "Bill Growth %"]];
const months = [...byMonth.keys()].sort();
let prev = null;
for (const month of months) {
  const current = byMonth.get(month);
  const growth = (value, previous) => (previous && previous !== 0 ? (value - previous) / previous : null);
  summaryRows.push([
    month,
    current.consumerCount,
    current.kilowattHour,
    current.totalBill,
    growth(current.consumerCount, prev?.consumerCount),
    growth(current.kilowattHour, prev?.kilowattHour),
    growth(current.totalBill, prev?.totalBill),
  ]);
  prev = current;
}

summarySheet.getRangeByIndexes(2, 0, summaryRows.length, summaryRows[0].length).values = summaryRows;
summarySheet.getRange("A3:G3").format = { fill: "#D1FAE5", font: { bold: true } };
summarySheet.getUsedRange().format.borders = { preset: "all", style: "thin", color: "#CBD5E1" };
summarySheet.getRange("A:A").format.columnWidth = 14;
summarySheet.getRange("B:D").format.columnWidth = 16;
summarySheet.getRange("E:G").format.columnWidth = 16;
summarySheet.getUsedRange().format.autofitRows();

const dbMonthRows = [["Database", "Month", "Consumer Count", "kWh Sales", "Total Bill"]];
for (const cfg of dbConfigs) {
  const monthsForDb = [...new Set(allRows.filter((r) => r.database === cfg.database).map((r) => normalizeMonth(r.billmonth)).filter(Boolean))].sort();
  for (const month of monthsForDb) {
    const current = grouped.get(`${cfg.database}|${month}`) ?? { consumerCount: 0, kilowattHour: 0, totalBill: 0 };
    dbMonthRows.push([cfg.database, month, current.consumerCount, current.kilowattHour, current.totalBill]);
  }
}
rawSheet.getRangeByIndexes(0, 0, dbMonthRows.length, dbMonthRows[0].length).values = dbMonthRows;
rawSheet.getRange("A1:E1").format = { fill: "#1D4ED8", font: { bold: true, color: "#FFFFFF" } };
rawSheet.getUsedRange().format.borders = { preset: "all", style: "thin", color: "#D9D9D9" };
rawSheet.getUsedRange().format.autofitColumns();
rawSheet.getUsedRange().format.autofitRows();
rawSheet.freezePanes.freezeRows(1);
rawSheet.showGridLines = false;

const outputDir = `${scriptDir}\\outputs`;
await fs.mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19).replace("T", "_");
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}\\consumer_growth_monthly_summary_${stamp}.xlsx`);
