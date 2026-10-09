import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "file:///C:/Users/SAMELCO%20II/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const mysqlExe = "mysql";
const tables = ["billhistory", "billhistory_bm"];
const scriptDir = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"));
const defaultConfigPath = `${scriptDir}\\builder.config.json`;
const configPath = process.argv[2] ? process.argv[2] : defaultConfigPath;
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const mysqlConfig = config.mysql ?? {};
const months = config.months ?? ["0726", "0626", "0526"];
const dbConfigs = config.databases ?? [];
if (dbConfigs.length === 0) throw new Error(`No databases configured in ${configPath}`);
const areaLabels = [
  ["001", "Catbalogan"],
  ["002", "Jiabong"],
  ["003", "Motiong"],
  ["004", "Paranas"],
  ["005", "San Sebastian"],
  ["006", "Hinabangan"],
  ["007", "Calbiga"],
  ["008", "Pinabacdao"],
  ["009", "Villareal"],
  ["010", "Sta. Rita"],
  ["011", "Talalora"],
  ["012", "Basey"],
  ["013", "Daram"],
  ["014", "Zumarraga"],
  ["015", "Marabut"],
  ["016", "San Jose De Buan"],
  ["017", "Large Load"],
  ["018", "Coop use"],
  ["019", "CINCORAMA"],
  ["020", "Mombon"],
  ["021", "Basiao BAPA"],
  ["022", "Brgy Boco BAPA"],
];
const rateGroups = [
  ["R", "Residential"],
  ["C", "Commercial"],
  ["P", "Public Building"],
  ["S", "Street Light"],
  ["H", "High Voltage"],
  ["B", "BAPA"],
];

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
    `SELECT COUNT(${table}.entry) AS entry_count, COALESCE(SUM(${table}.KilowattHour),0) AS kilowatt_hour, COALESCE(SUM(${table}.TotalBill),0) AS total_bill, ${table}.ratecode, ${table}.billmonth, ${table}.flag_paid, ${table}.Area, ${table}.Book, tblarea.AreaName AS address`,
    `FROM ${table}`,
    `LEFT JOIN tblarea ON tblarea.AreaCode = ${table}.Area AND tblarea.AreaBook = ${table}.Book`,
    `WHERE billmonth IN (${months.map((m) => `'${m}'`).join(",")})`,
    `GROUP BY ${table}.billmonth, ${table}.ratecode, ${table}.flag_paid, ${table}.Area, ${table}.Book, tblarea.AreaName`,
    `ORDER BY ${table}.billmonth, ${table}.ratecode, ${table}.flag_paid, ${table}.Area, ${table}.Book;`,
  ].join(" ");
  const out = execFileSync(mysqlExe, [...mysqlArgsBase, "-e", sql], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
  if (!out) return [];
  return out.split(/\r?\n/).map((line) => {
    const [entryCount, kilowattHour, totalBill, ratecode, billmonth, flagPaid, area, book, address] = line.split("\t");
    return {
      entryCount: Number(entryCount),
      kilowattHour: Number(kilowattHour),
      totalBill: Number(totalBill),
      ratecode,
      billmonth,
      flagPaid,
      area,
      book,
      address,
    };
  });
}

function runConsumerQuery(database) {
  const sql = [
    `USE ${database};`,
    `SELECT billmonth, area, book, address, SUM(entry_count) AS entry_count, SUM(kilowatt_hour) AS kilowatt_hour, SUM(total_bill) AS total_bill`,
    `FROM (`,
    `  SELECT ${database}.billhistory.billmonth AS billmonth, ${database}.billhistory.Area AS area, ${database}.billhistory.Book AS book, tblarea.AreaName AS address, COUNT(${database}.billhistory.entry) AS entry_count, COALESCE(SUM(${database}.billhistory.KilowattHour),0) AS kilowatt_hour, COALESCE(SUM(${database}.billhistory.TotalBill),0) AS total_bill`,
    `  FROM ${database}.billhistory`,
    `  LEFT JOIN tblarea ON tblarea.AreaCode = ${database}.billhistory.Area AND tblarea.AreaBook = ${database}.billhistory.Book`,
    `  WHERE ${database}.billhistory.billmonth IN (${months.map((m) => `'${m}'`).join(",")})`,
    `    AND COALESCE(${database}.billhistory.ratecode,'') <> 'B'`,
    `  GROUP BY ${database}.billhistory.billmonth, ${database}.billhistory.Area, ${database}.billhistory.Book, tblarea.AreaName`,
    `  UNION ALL`,
    `  SELECT ${database}.billhistory_bi.billmonth AS billmonth, ${database}.billhistory_bi.Area AS area, ${database}.billhistory_bi.Book AS book, tblarea.AreaName AS address, COUNT(${database}.billhistory_bi.entry) AS entry_count, COALESCE(SUM(${database}.billhistory_bi.KilowattHour),0) AS kilowatt_hour, COALESCE(SUM(${database}.billhistory_bi.TotalBill),0) AS total_bill`,
    `  FROM ${database}.billhistory_bi`,
    `  LEFT JOIN tblarea ON tblarea.AreaCode = ${database}.billhistory_bi.Area AND tblarea.AreaBook = ${database}.billhistory_bi.Book`,
    `  WHERE ${database}.billhistory_bi.billmonth IN (${months.map((m) => `'${m}'`).join(",")})`,
    `    AND COALESCE(${database}.billhistory_bi.ratecode,'') = 'B'`,
    `  GROUP BY ${database}.billhistory_bi.billmonth, ${database}.billhistory_bi.Area, ${database}.billhistory_bi.Book, tblarea.AreaName`,
    `) x`,
    `GROUP BY billmonth, area, book, address`,
    `ORDER BY billmonth, area, book, address;`,
  ].join(" ");
  const out = execFileSync(mysqlExe, [...mysqlArgsBase, "-e", sql], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
  if (!out) return [];
  return out.split(/\r?\n/).map((line) => {
    const [billmonth, area, book, address, entryCount, kilowattHour, totalBill] = line.split("\t");
    return {
      billmonth,
      area,
      book,
      address,
      entryCount: Number(entryCount),
      kilowattHour: Number(kilowattHour),
      totalBill: Number(totalBill),
    };
  });
}

function groupRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.billmonth}|${row.ratecode}`;
    const current = grouped.get(key) ?? { N: 0, Y: 0, kwhN: 0, kwhY: 0, billN: 0, billY: 0 };
    current[row.flagPaid] = (current[row.flagPaid] ?? 0) + row.entryCount;
    current[`kwh${row.flagPaid}`] = (current[`kwh${row.flagPaid}`] ?? 0) + row.kilowattHour;
    current[`bill${row.flagPaid}`] = (current[`bill${row.flagPaid}`] ?? 0) + row.totalBill;
    grouped.set(key, current);
  }
  return grouped;
}

function buildAreaSummaryRows(rows, modeLabel) {
  const byArea = new Map();
  for (const row of rows) {
    const area = String(row.area ?? "").trim();
    if (!area) continue;
    const current = byArea.get(area) ?? {};
    const ratecode = String(row.ratecode ?? "").trim().toUpperCase();
    const group = rateGroups.find(([code]) => code === ratecode)?.[1] ?? null;
    if (!group) continue;
    const bucket = current[group] ?? { count: 0, kwh: 0, amount: 0 };
    bucket.count += Number(row.entryCount ?? 0);
    bucket.kwh += Number(row.kilowattHour ?? 0);
    bucket.amount += Number(row.totalBill ?? 0);
    current[group] = bucket;
    const total = current.TOTAL ?? { count: 0, kwh: 0, amount: 0 };
    total.count += Number(row.entryCount ?? 0);
    total.kwh += Number(row.kilowattHour ?? 0);
    total.amount += Number(row.totalBill ?? 0);
    current.TOTAL = total;
    byArea.set(area, current);
  }

  const rowsOut = [];
  rowsOut.push([modeLabel, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
  rowsOut.push(["Areacode", "Area", "Count", "Residential - R", "", "", "Commercial - C", "", "", "Public Building - P", "", "", "Street Light - S", "", "", "High Voltage - H", "", "", "BAPA - B", "", "", "TOTAL", "", ""]);
  rowsOut.push(["", "", "", "kwh", "Totalbill", "", "kwh", "Totalbill", "", "kwh", "Totalbill", "", "kwh", "Totalbill", "", "kwh", "Totalbill", "", "kwh", "Totalbill", "", "kwh", "Totalbill"]);
  for (const [code, label] of areaLabels) {
    const data = byArea.get(code) ?? {};
    const pick = (name) => data[name] ?? { count: 0, kwh: 0, amount: 0 };
    const residential = pick("Residential");
    const commercial = pick("Commercial");
    const publicBuilding = pick("Public Building");
    const street = pick("Street Lights");
    const highVoltage = pick("High Voltage");
    const bapa = pick("BAPA");
    const total = data.TOTAL ?? { count: 0, kwh: 0, amount: 0 };
    rowsOut.push([
      code,
      label,
      total.count || "",
      residential.kwh || "",
      residential.amount || "",
      "",
      commercial.kwh || "",
      commercial.amount || "",
      "",
      publicBuilding.kwh || "",
      publicBuilding.amount || "",
      "",
      street.kwh || "",
      street.amount || "",
      "",
      highVoltage.kwh || "",
      highVoltage.amount || "",
      "",
      bapa.kwh || "",
      bapa.amount || "",
      "",
      total.kwh || "",
      total.amount || "",
    ]);
  }
  return rowsOut;
}

function buildAreaBlock(rows, title, flagFilter = null) {
  const byMonthArea = new Map();
  for (const row of rows) {
    const area = String(row.area ?? "").trim();
    const billmonth = String(row.billmonth ?? "").trim();
    if (!area) continue;
    if (!billmonth) continue;
    if (flagFilter && String(row.flagPaid ?? "").trim().toUpperCase() !== flagFilter) continue;
    const ratecode = String(row.ratecode ?? "").trim().toUpperCase();
    const groupName = rateGroups.find(([code]) => code === ratecode)?.[1] ?? null;
    if (!groupName) continue;
    const monthKey = `${billmonth}|${area}`;
    const current = byMonthArea.get(monthKey) ?? {};
    const bucket = current[groupName] ?? { count: 0, kwh: 0, totalbill: 0 };
    bucket.count += Number(row.entryCount ?? 0);
    bucket.kwh += Number(row.kilowattHour ?? 0);
    bucket.totalbill += Number(row.totalBill ?? 0);
    current[groupName] = bucket;
    const total = current.TOTAL ?? { count: 0, kwh: 0, totalbill: 0 };
    total.count += Number(row.entryCount ?? 0);
    total.kwh += Number(row.kilowattHour ?? 0);
    total.totalbill += Number(row.totalBill ?? 0);
    current.TOTAL = total;
    current.billmonth = billmonth;
    current.area = area;
    byMonthArea.set(monthKey, current);
  }

  const block = [];
  block.push([title, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
  block.push(["Areacode", "Area", "Residential - R", "", "", "Commercial - C", "", "", "Public Building - P", "", "", "Street Light - S", "", "", "High Voltage - H", "", "", "BAPA - B", "", "", "TOTAL", "", "", ""]);
  block.push(["", "", "Count", "kwh", "Totalbill", "Count", "kwh", "Totalbill", "Count", "kwh", "Totalbill", "Count", "kwh", "Totalbill", "Count", "kwh", "Totalbill", "Count", "kwh", "Totalbill", "Count", "kwh", "Totalbill", ""]);
  for (const month of months) {
    const monthRows = [...byMonthArea.entries()].filter(([key]) => key.startsWith(`${month}|`));
    if (!monthRows.length) continue;
    block.push([month, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    for (const [code, label] of areaLabels) {
      const data = byMonthArea.get(`${month}|${code}`) ?? {};
      const pick = (name) => data[name] ?? { count: 0, kwh: 0, totalbill: 0 };
      const residential = pick("Residential");
      const commercial = pick("Commercial");
      const publicBuilding = pick("Public Building");
      const streetLight = pick("Street Light");
      const highVoltage = pick("High Voltage");
      const bapa = pick("BAPA");
      const total = data.TOTAL ?? { count: 0, kwh: 0, totalbill: 0 };
      block.push([
        code,
        label,
        residential.count || "",
        residential.kwh || "",
        residential.totalbill || "",
        commercial.count || "",
        commercial.kwh || "",
        commercial.totalbill || "",
        publicBuilding.count || "",
        publicBuilding.kwh || "",
        publicBuilding.totalbill || "",
        streetLight.count || "",
        streetLight.kwh || "",
        streetLight.totalbill || "",
        highVoltage.count || "",
        highVoltage.kwh || "",
        highVoltage.totalbill || "",
        bapa.count || "",
        bapa.kwh || "",
        bapa.totalbill || "",
        total.count || "",
        total.kwh || "",
        total.totalbill || "",
        "",
      ]);
    }
  }
  return block;
}

function buildBlockRows(title, rows) {
  const grouped = groupRows(rows);
  const block = [];
  block.push([title, "", "", "", "", "", "", "", "", "", "", "", "", ""]);
  block.push(["billmonth", "ratecode", "TOTAL", "", "", "Paid", "", "", "Unpaid", "", "", "DIFF", "", ""]);
  block.push(["", "", "count", "kwh", "total", "count", "kwh", "total", "count", "kwh", "total", "", "", ""]);
  for (const month of months) {
    const monthRatecodes = [...new Set([...grouped.keys()].filter((key) => key.startsWith(`${month}|`)).map((key) => key.split("|")[1]))].sort();
    if (!monthRatecodes.length) continue;
    block.push([month, "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    let monthTotalCount = 0;
    let monthPaidCount = 0;
    let monthUnpaidCount = 0;
    let monthTotalKwh = 0;
    let monthPaidKwh = 0;
    let monthUnpaidKwh = 0;
    let monthTotalBill = 0;
    let monthPaidBill = 0;
    let monthUnpaidBill = 0;
    for (const ratecode of monthRatecodes) {
      const val = grouped.get(`${month}|${ratecode}`) ?? { N: 0, Y: 0, kwhN: 0, kwhY: 0, billN: 0, billY: 0 };
      const unpaid = val.N ?? 0;
      const paid = val.Y ?? 0;
      const total = unpaid + paid;
      const unpaidKwh = val.kwhN ?? 0;
      const paidKwh = val.kwhY ?? 0;
      const totalKwh = unpaidKwh + paidKwh;
      const unpaidBill = val.billN ?? 0;
      const paidBill = val.billY ?? 0;
      const totalBill = unpaidBill + paidBill;
      const diff = totalBill ? paidBill / totalBill : null;
      monthTotalCount += total;
      monthPaidCount += paid;
      monthUnpaidCount += unpaid;
      monthTotalKwh += totalKwh;
      monthPaidKwh += paidKwh;
      monthUnpaidKwh += unpaidKwh;
      monthTotalBill += totalBill;
      monthPaidBill += paidBill;
      monthUnpaidBill += unpaidBill;
      block.push(["", ratecode, total || "", totalKwh || "", totalBill || "", paid || "", paidKwh || "", paidBill || "", unpaid || "", unpaidKwh || "", unpaidBill || "", diff, "", ""]);
    }
    const diff = monthTotalBill ? monthPaidBill / monthTotalBill : null;
    block.push(["", "TOTAL", monthTotalCount, monthTotalKwh, monthTotalBill, monthPaidCount, monthPaidKwh, monthPaidBill, monthUnpaidCount, monthUnpaidKwh, monthUnpaidBill, diff, "", ""]);
  }
  return block;
}

function styleBlock(sheet, startRow, startCol, blockRows) {
  const rowCount = blockRows.length;
  const colCount = blockRows[0]?.length ?? 14;
  const range = sheet.getRangeByIndexes(startRow, startCol, rowCount, colCount);
  range.format.borders = { preset: "all", style: "thin", color: "#CBD5E1" };
  sheet.getRangeByIndexes(startRow, startCol, 1, colCount).format = { fill: "#0F766E", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
  sheet.getRangeByIndexes(startRow + 1, startCol, 1, colCount).format = { fill: "#D1FAE5", font: { bold: true } };
  sheet.getRangeByIndexes(startRow + 2, startCol, 1, colCount).format = { fill: "#F8FAFC", font: { bold: true } };
  for (let i = 2; i < rowCount; i++) {
    const row = blockRows[i];
    const absoluteRow = startRow + i;
    if (row[0] && !row[1]) {
      sheet.getRangeByIndexes(absoluteRow, startCol, 1, colCount).format = { fill: "#E0F2FE", font: { bold: true } };
    }
    if (row[1] === "TOTAL") {
      sheet.getRangeByIndexes(absoluteRow, startCol, 1, colCount).format = { fill: "#FEF3C7", font: { bold: true } };
    }
  }
  for (let col = 2; col < colCount - 1; col++) {
    sheet.getRangeByIndexes(startRow, startCol + col, rowCount, 1).format.numberFormat = "#,##0.00";
  }
}

const outputDir = "C:/Users/SAMELCO II/Documents/query views/outputs/query_summary";
await fs.mkdir(outputDir, { recursive: true });
const runStamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19).replace("T", "_");

const workbook = Workbook.create();
const summarySheet = workbook.worksheets.add("Summary");
const areaSheet = workbook.worksheets.add("Area Summary");
const consumerSheet = workbook.worksheets.add("Consumer Summary");
const rawSheet = workbook.worksheets.add("Raw Data");

const allRows = [];
const perDbRows = new Map();
for (const cfg of dbConfigs) {
  for (const table of tables) {
    const rows = runQuery(cfg.database, table);
    const items = rows.map((r) => ({ database: cfg.database, table, ...r }));
    allRows.push(...items);
    perDbRows.set(`${cfg.database}|${table}`, items);
  }
}

summarySheet.showGridLines = false;
summarySheet.freezePanes.freezeRows(3);
summarySheet.getRange("A1:N1").merge();
summarySheet.getRange("A1").values = [["COLLECTION MONITORING SUMMARY"]];
summarySheet.getRange("A1").format = { fill: "#1F2937", font: { bold: true, color: "#FFFFFF", fontSize: 16 }, horizontalAlignment: "center" };
summarySheet.getRange("A2:N2").merge();
summarySheet.getRange("A2").values = [["Grouped by billmonth, ratecode, with TOTAL, Paid, Unpaid, and DIFF sections"]];
summarySheet.getRange("A2").format = { fill: "#E5E7EB", font: { italic: true, color: "#374151" }, horizontalAlignment: "center" };

const combinedGrouped = groupRows(allRows);
const combinedRows = [];
combinedRows.push(["ALL DATABASES", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
combinedRows.push(["billmonth", "ratecode", "TOTAL", "", "", "Paid", "", "", "Unpaid", "", "", "DIFF", "", ""]);
combinedRows.push(["", "", "count", "kwh", "total", "count", "kwh", "total", "count", "kwh", "total", "", "", ""]);
for (const month of months) {
  const ratecodes = [...new Set([...combinedGrouped.keys()].filter((k) => k.startsWith(`${month}|`)).map((k) => k.split("|")[1]))].sort();
  if (!ratecodes.length) continue;
  combinedRows.push([month, "", "", "", "", "", "", "", "", "", "", "", "", ""]);
  let monthTotalCount = 0;
  let monthPaidCount = 0;
  let monthUnpaidCount = 0;
  let monthTotalKwh = 0;
  let monthPaidKwh = 0;
  let monthUnpaidKwh = 0;
  let monthTotalBill = 0;
  let monthPaidBill = 0;
  let monthUnpaidBill = 0;
  for (const ratecode of ratecodes) {
    const val = combinedGrouped.get(`${month}|${ratecode}`) ?? { N: 0, Y: 0, kwhN: 0, kwhY: 0, billN: 0, billY: 0 };
    const unpaid = val.N ?? 0;
    const paid = val.Y ?? 0;
    const total = unpaid + paid;
    const unpaidKwh = val.kwhN ?? 0;
    const paidKwh = val.kwhY ?? 0;
    const totalKwh = unpaidKwh + paidKwh;
    const unpaidBill = val.billN ?? 0;
    const paidBill = val.billY ?? 0;
    const totalBill = unpaidBill + paidBill;
    const diff = totalBill ? paidBill / totalBill : null;
    monthTotalCount += total;
    monthPaidCount += paid;
    monthUnpaidCount += unpaid;
    monthTotalKwh += totalKwh;
    monthPaidKwh += paidKwh;
    monthUnpaidKwh += unpaidKwh;
    monthTotalBill += totalBill;
    monthPaidBill += paidBill;
    monthUnpaidBill += unpaidBill;
    combinedRows.push(["", ratecode, total || "", totalKwh || "", totalBill || "", paid || "", paidKwh || "", paidBill || "", unpaid || "", unpaidKwh || "", unpaidBill || "", diff, "", ""]);
  }
  const diff = monthTotalBill ? monthPaidBill / monthTotalBill : null;
  combinedRows.push(["", "TOTAL", monthTotalCount, monthTotalKwh, monthTotalBill, monthPaidCount, monthPaidKwh, monthPaidBill, monthUnpaidCount, monthUnpaidKwh, monthUnpaidBill, diff, "", ""]);
}
summarySheet.getRangeByIndexes(3, 0, combinedRows.length, 14).values = combinedRows;
styleBlock(summarySheet, 3, 0, combinedRows);
summarySheet.getRange("A:A").format.columnWidth = 18;
summarySheet.getRange("B:B").format.columnWidth = 12;
summarySheet.getRange("C:N").format.columnWidth = 11;
summarySheet.getUsedRange().format.autofitRows();

areaSheet.showGridLines = false;
areaSheet.freezePanes.freezeRows(3);

const totalBillAreaRows = buildAreaBlock(allRows, "TOTAL BILL");
const paidAreaRows = buildAreaBlock(allRows, "PAID", "Y");
const unpaidAreaRows = buildAreaBlock(allRows, "UNPAID", "N");
let areaStart = 0;
for (const blockRows of [totalBillAreaRows, paidAreaRows, unpaidAreaRows]) {
  areaSheet.getRangeByIndexes(areaStart, 0, blockRows.length, blockRows[0].length).values = blockRows;
  areaSheet.getRangeByIndexes(areaStart, 0, 1, blockRows[0].length).merge();
  areaSheet.getRangeByIndexes(areaStart, 0, 1, blockRows[0].length).format = { fill: "#D4D4D4", font: { bold: true }, horizontalAlignment: "center" };
  areaSheet.getRangeByIndexes(areaStart + 1, 0, 1, blockRows[0].length).format = { fill: "#E5E7EB", font: { bold: true } };
  areaSheet.getRangeByIndexes(areaStart + 2, 0, 1, blockRows[0].length).format = { fill: "#F3F4F6", font: { bold: true } };
  areaSheet.getRangeByIndexes(areaStart, 0, blockRows.length, blockRows[0].length).format.borders = { preset: "all", style: "thin", color: "#000000" };
  areaStart += blockRows.length + 2;
}
areaSheet.getRange("A:A").format.columnWidth = 10;
areaSheet.getRange("B:B").format.columnWidth = 18;
areaSheet.getRange("C:X").format.columnWidth = 11;
areaSheet.getUsedRange().format.autofitRows();

consumerSheet.showGridLines = false;
consumerSheet.freezePanes.freezeRows(2);
consumerSheet.getRange("A1:H1").merge();
consumerSheet.getRange("A1").values = [["CONSUMER SUMMARY"]];
consumerSheet.getRange("A1").format = { fill: "#1F2937", font: { bold: true, color: "#FFFFFF", fontSize: 15 }, horizontalAlignment: "center" };
consumerSheet.getRange("A2:H2").values = [["billmonth", "areacode", "area", "book", "address", "count", "kwh", "totalbill"]];
consumerSheet.getRange("A2:H2").format = { fill: "#D1FAE5", font: { bold: true } };
const consumerGrouped = new Map();
for (const cfg of dbConfigs) {
  for (const row of runConsumerQuery(cfg.database)) {
    const billmonth = String(row.billmonth ?? "").trim();
    const area = String(row.area ?? "").trim();
    const book = String(row.book ?? "").trim();
    const address = String(row.address ?? row.book ?? "").trim();
    if (!billmonth || !area || !address) continue;
    const key = `${billmonth}|${area}|${book}|${address}`;
    const current = consumerGrouped.get(key) ?? { count: 0, kwh: 0, totalbill: 0 };
    current.count += Number(row.entryCount ?? 0);
    current.kwh += Number(row.kilowattHour ?? 0);
    current.totalbill += Number(row.totalBill ?? 0);
    consumerGrouped.set(key, current);
  }
}
const consumerRows = [];
for (const month of months) {
  const monthItems = [...consumerGrouped.entries()].filter(([key]) => key.startsWith(`${month}|`)).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, values] of monthItems) {
    const [, area, book, address] = key.split("|");
    const areaCode = areaLabels.find(([code, label]) => label.toLowerCase() === area.toLowerCase())?.[0] ?? "";
    consumerRows.push([month, areaCode, area, book, address, values.count || "", values.kwh || "", values.totalbill || ""]);
  }
}
if (consumerRows.length) {
  consumerSheet.getRangeByIndexes(2, 0, consumerRows.length, 8).values = consumerRows;
}
consumerSheet.getRange("A:A").format.columnWidth = 10;
consumerSheet.getRange("B:B").format.columnWidth = 10;
consumerSheet.getRange("C:C").format.columnWidth = 20;
consumerSheet.getRange("D:D").format.columnWidth = 10;
consumerSheet.getRange("E:E").format.columnWidth = 24;
consumerSheet.getRange("F:H").format.columnWidth = 12;
consumerSheet.getUsedRange().format.borders = { preset: "all", style: "thin", color: "#D9D9D9" };
consumerSheet.getUsedRange().format.autofitRows();

for (const cfg of dbConfigs) {
  const sheet = workbook.worksheets.add(cfg.sheetName);
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);
  sheet.getRange("A1:AA1").merge();
  sheet.getRange("A1").values = [[`${cfg.database} by table`]];
  sheet.getRange("A1").format = { fill: "#111827", font: { bold: true, color: "#FFFFFF", fontSize: 15 }, horizontalAlignment: "center" };

  const leftRows = buildBlockRows(cfg.leftLabel, perDbRows.get(`${cfg.database}|billhistory`) ?? []);
  const rightRows = buildBlockRows(cfg.rightLabel, perDbRows.get(`${cfg.database}|billhistory_bm`) ?? []);

  sheet.getRangeByIndexes(2, 0, leftRows.length, 14).values = leftRows;
  sheet.getRangeByIndexes(2, 15, rightRows.length, 14).values = rightRows;
  styleBlock(sheet, 2, 0, leftRows);
  styleBlock(sheet, 2, 15, rightRows);
  sheet.getRange("A:A").format.columnWidth = 12;
  sheet.getRange("B:B").format.columnWidth = 12;
  sheet.getRange("C:N").format.columnWidth = 11;
  sheet.getRange("P:P").format.columnWidth = 12;
  sheet.getRange("Q:Q").format.columnWidth = 12;
  sheet.getRange("R:AC").format.columnWidth = 11;
  sheet.getUsedRange().format.autofitRows();
}

rawSheet.getRange("A1:K1").values = [["database", "table", "entry_count", "kilowatt_hour", "total_bill", "ratecode", "billmonth", "flag_paid", "area", "book", "address"]];
rawSheet.getRangeByIndexes(1, 0, allRows.length, 11).values = allRows.map((r) => [r.database, r.table, r.entryCount, r.kilowattHour, r.totalBill, r.ratecode, r.billmonth, r.flagPaid, r.area, r.book, r.address]);
rawSheet.getRange("A1:K1").format = { fill: "#1D4ED8", font: { bold: true, color: "#FFFFFF" } };
rawSheet.getRangeByIndexes(1, 2, allRows.length, 3).format.numberFormat = "#,##0.00";
rawSheet.getUsedRange().format.borders = { preset: "all", style: "thin", color: "#D9D9D9" };
rawSheet.getUsedRange().format.autofitColumns();
rawSheet.getUsedRange().format.autofitRows();
rawSheet.freezePanes.freezeRows(1);
rawSheet.showGridLines = false;

const preview = await workbook.render({ sheetName: "MAIN", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/summary_preview_${runStamp}.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/query_summary_${runStamp}.xlsx`);
