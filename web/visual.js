const monthOrder=(a,b)=>(Number(a.slice(2))*12+Number(a.slice(0,2)))-(Number(b.slice(2))*12+Number(b.slice(0,2)));
const $ = (selector) => document.querySelector(selector);
const colors = { MAIN: "#0e7167", CATBALOGAN: "#d3a940", BASEY: "#d4773d", VILLAREAL: "#71845b" };
const number = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const monthLabel = (value) => new Date(2000 + Number(value.slice(2)), Number(value.slice(0, 2)) - 1).toLocaleDateString("en-PH", { month: "short", year: "numeric" });
const billMonthLabel = (value) => String(value ?? "").padStart(4, "0");
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);
const sumBy = (rows, key, value) => Object.entries(rows.reduce((result, row) => ({ ...result, [row[key]]: (result[row[key]] ?? 0) + row[value] }), {})).map(([label, amount]) => ({ label, value: amount }));
const svg = (width, height, body, label) => `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;

function horizontalBars(target, data, formatter, label) {
  const width = 760, left = 108, right = 105, top = 15, rowHeight = 55, height = top + data.length * rowHeight + 15;
  const max = Math.max(...data.map((item) => item.value), 1), plot = width - left - right;
  const body = data.map((item, index) => {
    const y = top + index * rowHeight, barWidth = item.value / max * plot, color = item.color ?? colors[item.label] ?? "#0e7167";
    return `<text x="${left - 12}" y="${y + 24}" text-anchor="end" class="axis-label">${item.label}</text><rect x="${left}" y="${y + 7}" width="${plot}" height="24" rx="4" class="bar-track"/><rect x="${left}" y="${y + 7}" width="${barWidth}" height="24" rx="4" fill="${color}"/><text x="${Math.min(left + barWidth + 9, width - right + 8)}" y="${y + 24}" class="value-label">${formatter(item.value)}</text>`;
  }).join("");
  $(target).innerHTML = svg(width, height, body, label);
}

function verticalBars(target, data, formatter, label) {
  const width = 620, height = 310, left = 54, right = 20, top = 20, bottom = 55, plotHeight = height - top - bottom, plotWidth = width - left - right;
  const max = Math.max(...data.map((item) => item.value), 1), step = plotWidth / data.length, barWidth = Math.min(72, step * .54);
  let body = `<line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" class="axis-line"/>`;
  body += data.map((item, index) => {
    const barHeight = item.value / max * plotHeight, x = left + step * index + (step - barWidth) / 2, y = top + plotHeight - barHeight;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="#0e7167"/><text x="${x + barWidth / 2}" y="${Math.max(y - 9, 13)}" text-anchor="middle" class="value-label">${formatter(item.value)}</text><text x="${x + barWidth / 2}" y="${height - 25}" text-anchor="middle" class="axis-label">${billMonthLabel(item.label)}</text>`;
  }).join("");
  $(target).innerHTML = svg(width, height, body, label);
}

function groupedBars(target, rows) {
  const months = [...new Set(rows.map((row) => row.month))].sort(monthOrder), databases = Object.keys(colors), values = months.flatMap((month) => databases.map((database) => rows.filter((row) => row.month === month && row.database === database).reduce((sum, row) => sum + row.totalBill, 0)));
  const width = 900, height = 390, left = 70, right = 20, top = 55, bottom = 65, plotHeight = height - top - bottom, plotWidth = width - left - right, max = Math.max(...values, 1), groupWidth = plotWidth / months.length, barWidth = Math.min(42, groupWidth / databases.length * .68);
  const ticks = [0, .25, .5, .75, 1];
  let body = ticks.map((tick) => { const y = top + plotHeight * (1 - tick); return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="grid-line"/><text x="${left - 10}" y="${y + 4}" text-anchor="end" class="tick-label">${compact.format(max * tick)}</text>`; }).join("");
  body += months.map((month, monthIndex) => {
    const groupStart = left + monthIndex * groupWidth + (groupWidth - databases.length * barWidth) / 2;
    const bars = databases.map((database, databaseIndex) => { const value = rows.filter((row) => row.month === month && row.database === database).reduce((sum, row) => sum + row.totalBill, 0), barHeight = value / max * plotHeight, x = groupStart + databaseIndex * barWidth, y = top + plotHeight - barHeight; return `<rect x="${x + 2}" y="${y}" width="${barWidth - 4}" height="${barHeight}" rx="3" fill="${colors[database]}"><title>${database}: ${money.format(value)}</title></rect>`; }).join("");
    return `${bars}<text x="${left + monthIndex * groupWidth + groupWidth / 2}" y="${height - 34}" text-anchor="middle" class="axis-label">${billMonthLabel(month)}</text>`;
  }).join("");
  body += databases.map((database, index) => `<rect x="${left + index * 145}" y="14" width="11" height="11" rx="2" fill="${colors[database]}"/><text x="${left + 17 + index * 145}" y="24" class="legend-label">${database}</text>`).join("");
  $(target).innerHTML = svg(width, height, body, "Total bill by month and database, in Philippine pesos");
}

function groupedCategoryBars(target, rows, categoryKey, seriesKey, valueKey, categories, series, label) {
  const palette = ["#0e7167", "#d3a940", "#d4773d", "#3f6f9f", "#71845b", "#b55a7a", "#765a9e", "#28959a", "#9a673c", "#43546f", "#b07325", "#65736d"], totals = new Map();
  for (const row of rows) totals.set(`${row[categoryKey]}|${row[seriesKey]}`, (totals.get(`${row[categoryKey]}|${row[seriesKey]}`) ?? 0) + row[valueKey]);
  const values = [...totals.values()], width = 900, legendColumns = Math.min(6, series.length), legendRows = Math.ceil(series.length / legendColumns), legendItemWidth = (width - 90) / legendColumns, top = 24 + legendRows * 25, height = 390 + Math.max(0, legendRows - 1) * 16, left = 70, right = 20, bottom = 72, plotHeight = height - top - bottom, plotWidth = width - left - right, max = Math.max(...values, 1), groupWidth = plotWidth / categories.length, barWidth = Math.min(38, groupWidth / series.length * .72);
  let body = [0, .25, .5, .75, 1].map((tick) => { const y = top + plotHeight * (1 - tick); return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="grid-line"/><text x="${left-10}" y="${y+4}" text-anchor="end" class="tick-label">₱${compact.format(max*tick)}</text>`; }).join("");
  body += categories.map((category, categoryIndex) => {
    const start = left + categoryIndex * groupWidth + (groupWidth - series.length * barWidth) / 2;
    const bars = series.map((seriesValue, seriesIndex) => { const value = totals.get(`${category}|${seriesValue}`) ?? 0, barHeight = value / max * plotHeight, x = start + seriesIndex * barWidth, y = top + plotHeight - barHeight, color = palette[seriesIndex % palette.length]; return `<rect x="${x+2}" y="${y}" width="${barWidth-4}" height="${barHeight}" rx="3" fill="${color}"><title>${billMonthLabel(seriesValue)} · ${category}: ${money.format(value)}</title></rect>`; }).join("");
    return `${bars}<text x="${left+categoryIndex*groupWidth+groupWidth/2}" y="${height-35}" text-anchor="middle" class="axis-label">${category}</text>`;
  }).join("");
  body += series.map((value,index)=>{const column=index%legendColumns,row=Math.floor(index/legendColumns),x=left+column*legendItemWidth,y=14+row*25;return `<rect x="${x}" y="${y}" width="11" height="11" rx="2" fill="${palette[index%palette.length]}"/><text x="${x+17}" y="${y+10}" class="legend-label">${billMonthLabel(value)}</text>`}).join("");
  $(target).innerHTML = svg(width, height, body, label);
}

function billMonthDate(value) {
  return new Date(2000 + Number(value.slice(2)), Number(value.slice(0, 2)) - 1, 24);
}
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const readableDate = (date) => date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
const drillState = { database: "", table: "", area: "", book: "", metric: "records" };
let supplierSaveTimer;

function renderDrill(details, selectedMonth) {
  const monthRows = details.rows.filter((row)=>row.billMonth===selectedMonth), databaseNames = ["CATBALOGAN","BASEY","VILLAREAL"].filter((database)=>monthRows.some((row)=>row.database===database));
  $("#database-drill").innerHTML = databaseNames.map((database) => { const count=monthRows.filter((row)=>row.database===database).reduce((sum,row)=>sum+row.totalCount,0); return `<button class="drill-option ${drillState.database===database?"active":""}" data-database="${escapeHtml(database)}"><strong>${escapeHtml(database)}</strong><span>${number.format(count)} bill records</span></button>`; }).join("");
  $("#database-drill").querySelectorAll("button").forEach((button)=>button.addEventListener("click",()=>{Object.assign(drillState,{database:button.dataset.database,table:"",area:"",book:""});$("#breakdown-content").hidden=true;renderDrill(details,selectedMonth)}));
  const groupContainer = $("#group-drill");
  const areaContainer = $("#area-drill"), bookContainer = $("#book-drill");
  if (!drillState.database) { groupContainer.hidden=true;areaContainer.hidden=true;bookContainer.hidden=true;$("#drill-path").textContent="Choose a database";return; }
  const groups = [{table:"billhistory",label:"Non-BAPA",className:""},{table:"billhistory_bi",label:"BAPA",className:"bapa"}];
  groupContainer.hidden=false;
  groupContainer.innerHTML=groups.map((group)=>{const rows=monthRows.filter((row)=>row.database===drillState.database&&row.table===group.table),count=rows.reduce((sum,row)=>sum+row.totalCount,0),amount=rows.reduce((sum,row)=>sum+row.totalAmount,0);return `<button class="drill-option ${group.className} ${drillState.table===group.table?"active":""}" data-table="${group.table}"><strong>${group.label}</strong><span>${number.format(count)} bills · ${money.format(amount)}</span></button>`}).join("");
  groupContainer.querySelectorAll("button").forEach((button)=>button.addEventListener("click",()=>{Object.assign(drillState,{table:button.dataset.table,area:"",book:""});$("#breakdown-content").hidden=true;renderDrill(details,selectedMonth)}));
  const groupLabel = groups.find((group)=>group.table===drillState.table)?.label;
  if (!drillState.table) { areaContainer.hidden=true;bookContainer.hidden=true;$("#drill-path").textContent=`${monthLabel(selectedMonth)} / ${drillState.database} / Choose BAPA or Non-BAPA`;return; }
  const branchRows=monthRows.filter((row)=>row.database===drillState.database&&row.table===drillState.table),areas=[...new Set(branchRows.map((row)=>row.area))].sort();
  areaContainer.hidden=false;areaContainer.innerHTML=areas.map((area)=>`<button class="tree-link ${drillState.area===area?"active":""}" data-area="${escapeHtml(area)}">Area ${escapeHtml(area)}</button>`).join("");
  areaContainer.querySelectorAll("button").forEach((button)=>button.addEventListener("click",()=>{Object.assign(drillState,{area:button.dataset.area,book:""});$("#breakdown-content").hidden=false;renderDrill(details,selectedMonth);renderBreakdown(details,selectedMonth)}));
  if (drillState.area) { const books=[...new Set(branchRows.filter((row)=>row.area===drillState.area).map((row)=>row.book))].sort();bookContainer.hidden=false;bookContainer.innerHTML=`<button class="tree-link ${!drillState.book?"active":""}" data-book="">All books</button>${books.map((book)=>`<button class="tree-link ${drillState.book===book?"active":""}" data-book="${escapeHtml(book)}">Book ${escapeHtml(book)}</button>`).join("")}`;bookContainer.querySelectorAll("button").forEach((button)=>button.addEventListener("click",()=>{drillState.book=button.dataset.book;renderDrill(details,selectedMonth);renderBreakdown(details,selectedMonth)}));} else bookContainer.hidden=true;
  $("#drill-path").textContent = `${monthLabel(selectedMonth)} / ${drillState.database} / ${groupLabel}${drillState.area?` / Area ${drillState.area}`:""}${drillState.book?` / Book ${drillState.book}`:""}`;
}

function renderBreakdown(details, selectedMonth) {
  const areaSelect = $("#breakdown-area"), bookSelect = $("#breakdown-book");
  const grouped = new Map();
  for (const row of details.rows.filter((item)=>item.billMonth===selectedMonth&&item.database===drillState.database&&item.table===drillState.table)) {
    const key = `${row.database}|${row.area}|${row.book}`, current = grouped.get(key) ?? { database:row.database, area:row.area, book:row.book, dueCount:0, dueAmount:0, lateCount:0, lateAmount:0, unpaidCount:0, unpaidAmount:0 };
    for (const field of ["dueCount","dueAmount","lateCount","lateAmount","unpaidCount","unpaidAmount"]) current[field] += row[field];
    grouped.set(key,current);
  }
  const allRows = [...grouped.values()].sort((a,b)=>a.database.localeCompare(b.database)||a.area.localeCompare(b.area)||a.book.localeCompare(b.book));
  const areaOptions = [...new Set(allRows.map((row)=>row.area))].sort();
  areaSelect.innerHTML = `<option value="">All areas</option>${areaOptions.map((value)=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  areaSelect.value = areaOptions.includes(drillState.area) ? drillState.area : "";
  const bookOptions=[...new Set(allRows.filter((row)=>!areaSelect.value||row.area===areaSelect.value).map((row)=>row.book))].sort();
  bookSelect.innerHTML=`<option value="">All books</option>${bookOptions.map((value)=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;bookSelect.value=bookOptions.includes(drillState.book)?drillState.book:"";
  const visible = allRows.filter((row)=>(!areaSelect.value||row.area===areaSelect.value)&&(!bookSelect.value||row.book===bookSelect.value));
  $("#breakdown-rows").innerHTML = visible.length ? visible.map((row)=>`<tr><td>${escapeHtml(row.database)}</td><td>${escapeHtml(row.area)}</td><td>${escapeHtml(row.book)}</td><td>${number.format(row.dueCount)}</td><td>${money.format(row.dueAmount)}</td><td>${number.format(row.lateCount)}</td><td>${money.format(row.lateAmount)}</td><td>${number.format(row.unpaidCount)}</td><td>${money.format(row.unpaidAmount)}</td></tr>`).join("") : `<tr><td colspan="9" class="empty">No Area/Book records found.</td></tr>`;
  const total = (field) => visible.reduce((sum,row)=>sum+row[field],0);
  $("#breakdown-total").innerHTML = `<tr><td colspan="3">FILTERED TOTAL · ${number.format(visible.length)} Area/Book rows</td><td>${number.format(total("dueCount"))}</td><td>${money.format(total("dueAmount"))}</td><td>${number.format(total("lateCount"))}</td><td>${money.format(total("lateAmount"))}</td><td>${number.format(total("unpaidCount"))}</td><td>${money.format(total("unpaidAmount"))}</td></tr>`;
  const groupLabel = drillState.table === "billhistory_bi" ? "BAPA" : drillState.table === "billhistory" ? "Non-BAPA" : "All consumers";
  $("#breakdown-title").textContent = `${drillState.database} · ${groupLabel}${areaSelect.value?` · Area ${areaSelect.value}`:""}${bookSelect.value?` · Book ${bookSelect.value}`:""}`;
}

function renderCycle(report, payments, details, selectedMonth) {
  const readingDate = billMonthDate(selectedMonth), dueDate = addDays(readingDate, 10), candidateDate = addDays(dueDate, 1), dueIso = isoDate(dueDate);
  const totalRows = report.rows.filter((row) => row.month === selectedMonth), paidRows = payments.rows.filter((row) => row.billMonth === selectedMonth);
  const totalCount = totalRows.reduce((sum,row)=>sum+row.consumers,0), totalAmount = totalRows.reduce((sum,row)=>sum+row.totalBill,0);
  const byDue = paidRows.filter((row)=>row.paymentDate<=dueIso), late = paidRows.filter((row)=>row.paymentDate>dueIso);
  const summarize = (rows) => ({ count: rows.reduce((sum,row)=>sum+row.paidCount,0), amount: rows.reduce((sum,row)=>sum+row.paymentAmount,0) });
  const onTime = summarize(byDue), paidLate = summarize(late), unpaid = { count: Math.max(0,totalCount-onTime.count-paidLate.count), amount: Math.max(0,totalAmount-onTime.amount-paidLate.amount) };
  const isCandidate = new Date() >= candidateDate, candidateLabel = isCandidate ? "Unpaid candidates" : "Unpaid / pending";
  $("#cycle-milestones").innerHTML = [["Reading period",readingDate,""],["Due date",dueDate,""],["Disconnection candidate",candidateDate,"candidate"]].map(([label,date,className])=>`<article class="milestone ${className}"><span>${label}</span><strong>${readableDate(date)}</strong></article>`).join("");
  const countData = [{label:"Paid by due",value:onTime.count,color:"#0e7167"},{label:"Paid after due",value:paidLate.count,color:"#d3a940"},{label:candidateLabel,value:unpaid.count,color:"#d4773d"}];
  const amountData = [{label:"Paid by due",value:onTime.amount,color:"#0e7167"},{label:"Paid after due",value:paidLate.amount,color:"#d3a940"},{label:candidateLabel,value:unpaid.amount,color:"#d4773d"}];
  horizontalBars("#cycle-count", countData, number.format, `Bill records by payment timing for ${monthLabel(selectedMonth)}`);
  horizontalBars("#cycle-amount", amountData, money.format, `TotalBill by payment timing for ${monthLabel(selectedMonth)}`);
  $("#cycle-note").textContent = `${monthLabel(selectedMonth)} includes ${number.format(totalCount)} bill records totaling ${money.format(totalAmount)}. “${candidateLabel}” is the balance without a valid paid date in billhistory or billhistory_bi. Candidate status is based on the derived ${readableDate(candidateDate)} milestone.`;
  renderBreakdown(details, selectedMonth);
  if (!$("#detail-drill").hidden) renderDrill(details, selectedMonth);
}

function loadSupplierPlan(collectionMonth) {
  try { return JSON.parse(localStorage.getItem(`supplier-plan:${collectionMonth}`) ?? "{}"); } catch { return {}; }
}
function renderCashflow(report, payments) {
  const collectionMonth=$("#cashflow-month").value,currentBillMonth=$("#cashflow-billmonth").value;
  if (!collectionMonth||!currentBillMonth) return;
  const eligible=payments.rows.filter((row)=>row.paymentDate.startsWith(collectionMonth)&&(row.billMonth===currentBillMonth||row.billMonth<currentBillMonth));
  const daysInMonth=new Date(Number(collectionMonth.slice(0,4)),Number(collectionMonth.slice(5,7)),0).getDate(), dayMap=new Map();
  for (const row of eligible) { const day=Number(row.paymentDate.slice(8,10)),bucket=dayMap.get(day)??{current:0,arrears:0,records:0};bucket[row.billMonth===currentBillMonth?"current":"arrears"]+=row.paymentAmount;bucket.records+=row.paidCount;dayMap.set(day,bucket); }
  const totals=[...dayMap.entries()].map(([day,value])=>({day,total:value.current+value.arrears,...value})),peak=totals.sort((a,b)=>b.total-a.total)[0]??{day:0,total:0,current:0,arrears:0},currentCollected=totals.reduce((sum,item)=>sum+item.current,0),arrearsCollected=totals.reduce((sum,item)=>sum+item.arrears,0),totalCollected=currentCollected+arrearsCollected;
  const billedCredit=report.rows.filter((row)=>row.month===currentBillMonth).reduce((sum,row)=>sum+row.totalBill,0),collectionRate=billedCredit?currentCollected/billedCredit:0;
  $("#cashflow-metrics").innerHTML=[["Peak payment day",peak.day?`${collectionMonth}‑${String(peak.day).padStart(2,"0")}`:"No payments"],["Current collected",money.format(currentCollected)],["Arrears collected",money.format(arrearsCollected)],["Collected vs billed credit",`${(collectionRate*100).toFixed(1)}%`]].map(([label,value])=>`<article><span>${label}</span><strong>${value}</strong></article>`).join("");
  const firstOffset=new Date(`${collectionMonth}-01T00:00:00`).getDay(),max=Math.max(...totals.map((item)=>item.total),1),weekdays=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  let calendar=weekdays.map((day)=>`<div class="calendar-weekday">${day}</div>`).join("")+Array.from({length:firstOffset},()=>`<div class="calendar-day empty-day"></div>`).join("");
  for(let day=1;day<=daysInMonth;day++){const value=dayMap.get(day)??{current:0,arrears:0,records:0},total=value.current+value.arrears,currentShare=total?value.current/total*100:0,intensity=Math.round(total/max*38);calendar+=`<article class="calendar-day ${[10,18,22].includes(day)?"supplier-day":""}" style="--intensity:${intensity}"><span class="calendar-number">${day}</span><strong class="calendar-total">${total?`₱${compact.format(total)}`:"—"}</strong><div class="calendar-split"><span class="current" style="width:${currentShare}%"></span><span class="arrears" style="width:${100-currentShare}%"></span></div><small class="calendar-detail">Current ₱${compact.format(value.current)}<br>Arrears ₱${compact.format(value.arrears)}<br>${number.format(value.records)} records</small></article>`;}
  $("#payment-calendar").innerHTML=calendar;
  const plan=loadSupplierPlan(collectionMonth),planningDays=[10,18,22];let cumulativePlan=0;
  $("#supplier-rows").innerHTML=planningDays.map((day)=>{const amount=Number(plan[day]??0);cumulativePlan+=amount;const available=[...dayMap.entries()].filter(([paymentDay])=>paymentDay<=day).reduce((sum,[,value])=>sum+value.current+value.arrears,0),coverage=cumulativePlan?available/cumulativePlan:0,balance=available-cumulativePlan;return `<tr><td>${collectionMonth}-${String(day).padStart(2,"0")}</td><td><input class="supplier-input" type="number" min="0" step="0.01" data-day="${day}" value="${amount||""}" placeholder="0.00" aria-label="Supplier amount due on day ${day}"></td><td>${money.format(cumulativePlan)}</td><td>${money.format(available)}</td><td class="${coverage>=1?"good":"gap"}">${cumulativePlan?`${(coverage*100).toFixed(1)}%`:"Enter amount"}</td><td class="${balance>=0?"good":"gap"}">${cumulativePlan?(balance>=0?`Surplus ${money.format(balance)}`:`Gap ${money.format(Math.abs(balance))}`):"—"}</td></tr>`}).join("");
  document.querySelectorAll(".supplier-input").forEach((input)=>{const save=()=>{clearTimeout(supplierSaveTimer);const updated=loadSupplierPlan(collectionMonth);updated[input.dataset.day]=Number(input.value||0);localStorage.setItem(`supplier-plan:${collectionMonth}`,JSON.stringify(updated));renderCashflow(report,payments)};input.addEventListener("input",()=>{clearTimeout(supplierSaveTimer);supplierSaveTimer=setTimeout(save,500)});input.addEventListener("change",save);input.addEventListener("blur",save)});
}

try {
  const [historyResponse, paymentResponse, detailResponse, monthResponse] = await Promise.all([fetch("/api/reports/combined-history"), fetch("/api/reports/payment-insights"), fetch("/api/reports/billing-cycle-detail"),fetch("/api/bill-months")]);
  const [report, payments, details,monthCatalog] = await Promise.all([historyResponse.json(), paymentResponse.json(), detailResponse.json(),monthResponse.json()]);
  if (!historyResponse.ok) throw new Error(report.error ?? "Unable to load bill-history chart data");
  if (!paymentResponse.ok) throw new Error(payments.error ?? "Unable to load payment chart data");
  if (!detailResponse.ok) throw new Error(details.error ?? "Unable to load Area/Book breakdown");
  if (!monthResponse.ok) throw new Error(monthCatalog.error ?? "Unable to load available bill months");
  function renderComparisons(report,payments){
  const databaseBill = sumBy(report.rows, "database", "totalBill").sort((a, b) => b.value - a.value);
  const monthKwh = sumBy(report.rows, "month", "kwh").sort((a, b) => monthOrder(a.label,b.label));
  const tableRecords = sumBy(report.rows, "table", "consumers").sort((a, b) => b.value - a.value);
  const totalConsumers = report.rows.reduce((sum, row) => sum + row.consumers, 0), totalKwh = report.rows.reduce((sum, row) => sum + row.kwh, 0), totalBill = report.rows.reduce((sum, row) => sum + row.totalBill, 0);
  $("#metrics").innerHTML = [["Databases", 4], ["Consumer records", number.format(totalConsumers)], ["Total kWh", number.format(totalKwh)], ["Total billed", money.format(totalBill)]].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("");
  horizontalBars("#bill-db", databaseBill, money.format, "Total bill by database, in Philippine pesos");
  verticalBars("#kwh-month", monthKwh, compact.format, "Total kilowatt-hours by bill month");
  horizontalBars("#records-table", tableRecords, number.format, "Consumer records by source table");
  groupedBars("#bill-month-db", report.rows);
  const rateLabels = { R: "R · Residential", C: "C · Commercial", P: "P · Public Building", S: "S · Street Light", H: "H · High Voltage", B: "B · BAPA", UNKNOWN: "Unknown" };
  const paymentByMonth = sumBy(payments.rows, "billMonth", "paymentAmount").sort((a,b)=>monthOrder(a.label,b.label));
  const recordsByMonth = sumBy(payments.rows, "billMonth", "paidCount").sort((a,b)=>monthOrder(a.label,b.label));
  const paymentByDate = sumBy(payments.rows, "paymentDate", "paymentAmount");
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekdayMap = Object.fromEntries(weekdayNames.map((day) => [day, 0]));
  for (const item of paymentByDate) weekdayMap[weekdayNames[new Date(`${item.label}T00:00:00`).getDay()]] += item.value;
  const paymentByWeekday = weekdayNames.slice(1).concat("Sunday").map((label) => ({ label, value: weekdayMap[label] }));
  const highestWeekday = Math.max(...paymentByWeekday.map((item) => item.value));
  paymentByWeekday.forEach((item) => item.color = item.value === highestWeekday ? "#d3a940" : "#0e7167");
  const topPaymentDates = paymentByDate.sort((a, b) => b.value - a.value).slice(0, 10).map((item, index) => ({ ...item, label: new Date(`${item.label}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }), color: index === 0 ? "#d3a940" : "#0e7167" }));
  verticalBars("#payment-month", paymentByMonth, (value)=>`₱${compact.format(value)}`, "Paid TotalBill by bill month");
  verticalBars("#records-month", recordsByMonth, compact.format, "Paid consumer records by bill month");
  const comparedMonths = [...new Set(payments.rows.map((row)=>row.billMonth))].sort(monthOrder);
  const selectedMonthCount=comparedMonths.length,comparisonLabel=`${selectedMonthCount}-month comparison`;
  $("#payment-month").closest(".chart-card").querySelector(".eyebrow").textContent=comparisonLabel;
  $("#records-month").closest(".chart-card").querySelector(".eyebrow").textContent=`${selectedMonthCount}-month volume`;
  $("#payment-month").closest(".chart-card").querySelector(".chart-copy>p:last-child").innerHTML=`Paid records measured using <code>TotalBill</code> for ${selectedMonthCount} selected BillMonth${selectedMonthCount===1?'':'s'}.`;
  $("#payment-rate-month").closest(".chart-card").querySelector(".chart-copy>p:last-child").textContent=`Grouped comparison across ${selectedMonthCount} selected BillMonth${selectedMonthCount===1?'':'s'}.`;
  const comparedRates = [...new Set(payments.rows.map((row)=>row.rateCode))].sort((a,b)=>(sumBy(payments.rows.filter((row)=>row.rateCode===b),"rateCode","paymentAmount")[0]?.value??0)-(sumBy(payments.rows.filter((row)=>row.rateCode===a),"rateCode","paymentAmount")[0]?.value??0));
  groupedCategoryBars("#payment-rate-month", payments.rows, "rateCode", "billMonth", "paymentAmount", comparedRates, comparedMonths, "Paid TotalBill by rate code and bill month");
  horizontalBars("#payment-weekday", paymentByWeekday, money.format, "Paid TotalBill by weekday; the highest weekday is highlighted");
  horizontalBars("#payment-days", topPaymentDates, money.format, "Top 10 exact payment dates by paid TotalBill");
  const newestSource = [report.generatedAt, payments.generatedAt].sort().at(-1);
  $("#freshness").textContent = `Updated ${new Date(newestSource).toLocaleString("en-PH")}${report.cached && payments.cached ? " · cached" : ""}`;
  }
  renderComparisons(report,payments);
  const comparedMonths=[...new Set(report.rows.map(row=>row.month))].sort((a,b)=>(Number(a.slice(2))*12+Number(a.slice(0,2)))-(Number(b.slice(2))*12+Number(b.slice(0,2))));
  const cycleSelect = $("#cycle-month");
  let cycleReport=report,cyclePayments=payments,cycleDetails=details;
  cycleSelect.innerHTML = monthCatalog.months.map((value)=>`<option value="${value}">${monthLabel(value)}</option>`).join("");
  cycleSelect.value = comparedMonths.at(-1)??monthCatalog.months[0];
  const loadCycleMonth=async()=>{
    const selectedMonth=cycleSelect.value,alreadyLoaded=cycleReport.rows.some(row=>row.month===selectedMonth)&&cyclePayments.rows.some(row=>row.billMonth===selectedMonth)&&cycleDetails.rows.some(row=>row.billMonth===selectedMonth);
    cycleSelect.disabled=true;$("#cycle-note").textContent=`Loading ${monthLabel(selectedMonth)}...`;$("#error").hidden=true;
    try{
      if(!alreadyLoaded){const query=`?billMonth=${encodeURIComponent(selectedMonth)}`,[history,payment,detail]=await Promise.all([fetch(`/api/reports/combined-history${query}`),fetch(`/api/reports/payment-insights${query}`),fetch(`/api/reports/billing-cycle-detail${query}`)]),data=await Promise.all([history.json(),payment.json(),detail.json()]);if(!history.ok||!payment.ok||!detail.ok)throw new Error(data.find(item=>item.error)?.error??'Unable to load the selected bill month');[cycleReport,cyclePayments,cycleDetails]=data}
      Object.assign(drillState,{database:"",table:"",area:"",book:""});$("#detail-drill").hidden=true;$("#breakdown-content").hidden=true;renderCycle(cycleReport,cyclePayments,cycleDetails,selectedMonth);
    }catch(error){$("#error").textContent=error.message;$("#error").hidden=false}finally{cycleSelect.disabled=false}
  };
  cycleSelect.addEventListener("change",loadCycleMonth);
  document.querySelectorAll(".chart-detail-link").forEach((link)=>link.addEventListener("click",()=>{Object.assign(drillState,{database:"",table:"",area:"",book:"",metric:link.dataset.detailMetric});$("#detail-drill").hidden=false;$("#breakdown-content").hidden=true;renderDrill(cycleDetails,cycleSelect.value);$("#detail-drill").scrollIntoView({behavior:"smooth",block:"start"})}));
  $("#breakdown-area").addEventListener("change",()=>{drillState.area=$("#breakdown-area").value;drillState.book="";renderDrill(cycleDetails,cycleSelect.value);renderBreakdown(cycleDetails,cycleSelect.value)});
  $("#breakdown-book").addEventListener("change",()=>{drillState.book=$("#breakdown-book").value;renderDrill(cycleDetails,cycleSelect.value);renderBreakdown(cycleDetails,cycleSelect.value)});
  renderCycle(cycleReport,cyclePayments,cycleDetails,cycleSelect.value);

  const graphCache=new Map();
  const graphMonths=[...new Set(monthCatalog.months)].filter(m=>/^(0[1-9]|1[0-2])\d{2}$/.test(m)).sort((a,b)=>monthOrder(b,a));
  const graphYears=[...new Set(graphMonths.map(m=>String(2000+Number(m.slice(2)))))];
  for(const year of graphYears)$("#graph-year").add(new Option(year,year));
  const loadGraphs=async()=>{
    const button=$("#apply-graph-months"),count=Number($("#graph-months").value);
    button.disabled=true;button.textContent="Loading...";$("#error").hidden=true;
    try{
      const year=$("#graph-year").value;
      const selected=graphMonths.filter(m=>year==='all'||String(2000+Number(m.slice(2)))===year).slice(0,count),history=[],paid=[];
      if(!selected.length)throw new Error('No available bill months for the selected year.');
      for(const month of selected){
        if(!graphCache.has(month)){
          const responses=await Promise.all([fetch(`/api/reports/combined-history?billMonth=${month}`),fetch(`/api/reports/payment-insights?billMonth=${month}`)]);
          const payload=await Promise.all(responses.map(r=>r.json()));
          if(responses.some(r=>!r.ok))throw new Error(payload.find(p=>p.error)?.error??"Unable to load graph months");
          graphCache.set(month,payload);
        }
        const [h,p]=graphCache.get(month);history.push(h);paid.push(p);
      }
      const merge=items=>({rows:items.flatMap(i=>i.rows),generatedAt:items.map(i=>i.generatedAt).sort().at(-1),cached:items.every(i=>i.cached)});
      renderComparisons(merge(history),merge(paid));
      $("#graph-period").textContent=`${selected.length} available bill month(s): ${selected.map(monthLabel).join(", ")}. Billing-cycle selection is independent.`;
    }catch(e){$("#error").textContent=e.message;$("#error").hidden=false}finally{button.disabled=false;button.textContent="Apply"}
  };
  $("#apply-graph-months").addEventListener("click",loadGraphs);
  $("#graph-period").textContent=`Showing ${comparedMonths.map(monthLabel).join(", ")}. Select a year and Apply to show its latest available bill months (up to the selected period).`;

} catch (error) {
  $("#error").textContent = error.message;
  $("#error").hidden = false;
}
