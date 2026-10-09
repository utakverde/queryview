const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const xml = (value) => clean(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);

function cell(value, style = "") {
  const text = clean(value), plain = text.replace(/[₱,%]/g, "").replaceAll(",", "").trim();
  const numeric = text !== "" && !/^0\d+$/.test(plain) && /^-?\d+(\.\d+)?$/.test(plain), percent = text.endsWith("%") && numeric, currency = text.startsWith("₱") && numeric;
  const output = numeric ? Number(plain) / (percent ? 100 : 1) : text;
  const styleId = style || (percent ? "Percent" : currency ? "Currency" : numeric ? "Number" : "Text");
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${numeric ? "Number" : "String"}">${xml(output)}</Data></Cell>`;
}

function uniqueSheetName(name, used) {
  const base = clean(name).replace(/[\\/?*:[\]]/g, " ").slice(0, 31) || "Report";
  let result = base, suffix = 2;
  while (used.has(result)) result = `${base.slice(0, 27)} ${suffix++}`;
  used.add(result);
  return result;
}

function worksheet(name, rows, used) {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const columns = Array.from({ length: width }, (_, index) => {
    const longest = Math.max(10, ...rows.map((row) => clean(row[index]?.value).length));
    return `<Column ss:AutoFitWidth="0" ss:Width="${Math.min(240, longest * 6.5 + 18)}"/>`;
  }).join("");
  const body = rows.map((row) => `<Row>${row.map((item) => cell(item.value, item.header ? "Header" : "")).join("")}</Row>`).join("");
  return `<Worksheet ss:Name="${xml(uniqueSheetName(name, used))}"><Table>${columns}${body}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`;
}

function summaryRows() {
  const rows = [[{ value: clean(document.querySelector("main h2, main h1")?.innerText || document.title), header: true }], [{ value: clean(document.querySelector("main h3:not([hidden])")?.innerText) }], [{ value: `Exported ${new Date().toLocaleString("en-PH")}` }], []];
  const controls = [...document.querySelectorAll("main label")].filter((label) => label.offsetParent !== null).map((label) => {
    const input = label.querySelector("input, select");
    const labelText = clean([...label.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(" "));
    return input ? [{ value: labelText, header: true }, { value: input.selectedOptions?.[0]?.textContent || input.value }] : null;
  }).filter(Boolean);
  if (controls.length) rows.push([{ value: "Selected filters", header: true }], ...controls, []);
  const metrics = [...document.querySelectorAll("main article")].filter((item) => item.offsetParent !== null && item.querySelector(":scope > span") && item.querySelector(":scope > strong")).map((item) => [{ value: item.querySelector(":scope > span").innerText, header: true }, { value: item.querySelector(":scope > strong").innerText }]);
  if (metrics.length) rows.push([{ value: "Summary values", header: true }], ...metrics);
  return rows;
}

function buildWorkbook() {
  const used = new Set(), sheets = [worksheet("Summary", summaryRows(), used)];
  const tables = [...document.querySelectorAll("main table")].filter((table) => table.offsetParent !== null && table.rows.length);
  tables.forEach((table, index) => {
    const container = table.closest("article, section, .report"), heading = container?.querySelector("h3, h4, .center-heading span")?.innerText || `Report table ${index + 1}`;
    const rows = [...table.rows].filter((row) => row.offsetParent !== null).map((row) => [...row.cells].map((item) => ({ value: item.innerText, header: item.tagName === "TH" || row.parentElement?.tagName === "THEAD" })));
    sheets.push(worksheet(heading, rows, used));
  });
  if (!tables.length) {
    const chartRows = [...document.querySelectorAll("main svg")].filter((chart) => chart.offsetParent !== null).map((chart, index) => [{ value: `Chart ${index + 1}`, header: true }, { value: chart.getAttribute("aria-label") || "Visual report" }, { value: [...chart.querySelectorAll("text")].map((item) => clean(item.textContent)).filter(Boolean).join(" | ") }]);
    if (chartRows.length) sheets.push(worksheet("Chart values", [[{ value: "Chart", header: true }, { value: "Description", header: true }, { value: "Visible labels", header: true }], ...chartRows], used));
  }
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Aptos" ss:Size="11"/></Style><Style ss:ID="Text"/><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0E7167" ss:Pattern="Solid"/><Alignment ss:WrapText="1"/></Style><Style ss:ID="Number"><NumberFormat ss:Format="#,##0.00"/></Style><Style ss:ID="Currency"><NumberFormat ss:Format="₱#,##0.00"/></Style><Style ss:ID="Percent"><NumberFormat ss:Format="0.00%"/></Style></Styles>${sheets.join("")}</Workbook>`;
}

async function exportExcel() {
  if (typeof window.customExcelExport === "function") return window.customExcelExport();
  const link = document.createElement("a"), report = location.pathname.split("/").filter(Boolean).pop() || "reports", date = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(new Blob([buildWorkbook()], { type: "application/vnd.ms-excel;charset=utf-8" }));
  link.download = `samelco-${report}-${date}.xls`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

if (!document.body.classList.contains("lifeline-page")) {
  const button = document.createElement("button");
  button.id = "export-excel";
  button.className = "export-excel";
  button.type = "button";
  button.textContent = "Export to Excel";
  Object.assign(button.style, { position: "fixed", right: "22px", bottom: "22px", zIndex: "50", height: "46px", padding: "0 19px", border: "1px solid rgba(255,255,255,.35)", borderRadius: "999px", background: "#0e7167", color: "#fff", fontWeight: "700", boxShadow: "0 10px 28px rgba(14,40,34,.22)", cursor: "pointer" });
  button.addEventListener("click", exportExcel);
  document.body.append(button);
}
