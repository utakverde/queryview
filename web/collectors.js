const $ = selector => document.querySelector(selector);
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 });
const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = value => `${(Number(value || 0) * 100).toFixed(2)}%`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const officeColors = ['#d9604c', '#14a08a', '#8b6fd1', '#9bbd4a', '#cd6b9b', '#4e9caf', '#bd8750', '#66736f'];
const officeColorByName = { catbalogan: '#d9604c', main: '#14a08a', basey: '#8b6fd1', villareal: '#9bbd4a' };
const bankColor = '#4d7fd6', ecpayColor = '#f0a23b', svgNamespace = 'http://www.w3.org/2000/svg';
let reportData = null, sourceFilter = 'all', sourceItems = [], sourceTotal = 0;

function officeColor(name, index) { return officeColorByName[String(name).trim().toLowerCase()] || officeColors[index % officeColors.length]; }
function collectionSources(data) {
  const byOffice = new Map(); let bank = 0, ecpay = 0;
  for (const row of data.rows || []) {
    const amount = Number(row.amount || 0), bankName = String(row.bankName || '').trim().toUpperCase();
    if (bankName === 'ECPAY') ecpay += amount;
    else if (row.bankName) bank += amount;
    else byOffice.set(row.database, (byOffice.get(row.database) || 0) + amount);
  }
  const offices = [...byOffice].sort((a, b) => b[1] - a[1]).map(([name, value], index) => ({ name, type: 'office', value, color: officeColor(name, index), icon: 'office' }));
  const channels = [{ name: 'Bank', type: 'channel', value: bank, color: bankColor, icon: 'bank' }, { name: 'ECPay', type: 'channel', value: ecpay, color: ecpayColor, icon: 'ecpay' }];
  return { items: [...offices, ...channels].filter(item => item.value > 0), officeTotal: offices.reduce((sum, item) => sum + item.value, 0), channelTotal: bank + ecpay };
}
function sourceIcon(kind) {
  if (kind === 'office') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V5h10v15M14 10h6v10M2 20h20M7 8h4M7 11h4M7 14h4M7 17h4M17 13h1M17 16h1"/></svg>';
  if (kind === 'bank') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-5 9 5M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18M2 22h20M4 9h16"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M10 5h4M10 18.5h4M9 11h6M12 8v6M10 9.5h4"/></svg>';
}
function setDonutCenter(item) {
  $('#source-chart').classList.toggle('dim', Boolean(item));
  sourceItems.forEach(source => {
    const active = source === item;
    source.circle?.classList.toggle('on', active);
    source.button?.classList.toggle('on', active);
    source.button?.setAttribute('aria-pressed', String(active));
  });
  $('#source-center-label').textContent = item ? item.name : (sourceFilter === 'all' ? 'Total collected' : sourceFilter === 'office' ? 'Office collections' : 'Channel collections');
  $('#source-center-amount').textContent = money.format(item ? item.value : sourceTotal);
  $('#source-center-percent').textContent = percent(item ? item.value / sourceTotal : 1);
}
function renderSourceBreakdown(data) {
  const grouped = collectionSources(data), allTotal = Number(data.totals.amount || 0);
  sourceItems = grouped.items.filter(item => sourceFilter === 'all' || item.type === sourceFilter).sort((a, b) => b.value - a.value);
  sourceTotal = sourceItems.reduce((sum, item) => sum + item.value, 0);
  const top = sourceItems[0];
  const officeShare = sourceFilter === 'channel' ? 0 : sourceFilter === 'office' ? 1 : (allTotal ? grouped.officeTotal / allTotal : 0);
  const channelShare = sourceFilter === 'office' ? 0 : sourceFilter === 'channel' ? 1 : (allTotal ? grouped.channelTotal / allTotal : 0);
  $('#collector-metrics').innerHTML = [
    [sourceFilter === 'all' ? 'Total collected' : 'Selected total', money.format(sourceTotal), `${sourceItems.length} sources`],
    ['Top source', top?.name || '—', top ? `${percent(top.value / (sourceTotal || 1))} · ${money.format(top.value)}` : 'No collections'],
    ['Offices vs. channels', `${(officeShare * 100).toFixed(1)}% / ${(channelShare * 100).toFixed(1)}%`, 'Office collection share / payment channels']
  ].map(([label, value, detail]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join('');

  const svg = $('#source-svg'), radius = 82, circumference = 2 * Math.PI * radius;
  svg.innerHTML = `<circle class="source-track" cx="100" cy="100" r="${radius}"></circle>`;
  const total = sourceTotal; let offset = 0;
  sourceItems.forEach(item => {
    item.share = total ? item.value / total : 0;
    const length = item.share * circumference, visibleLength = sourceItems.length > 1 ? Math.max(length - 2.5, 0.8) : length;
    const circle = document.createElementNS(svgNamespace, 'circle');
    circle.setAttribute('cx', '100'); circle.setAttribute('cy', '100'); circle.setAttribute('r', String(radius));
    circle.setAttribute('stroke', item.color); circle.setAttribute('transform', 'rotate(-90 100 100)');
    circle.setAttribute('class', 'source-segment'); circle.setAttribute('stroke-dasharray', `0 ${circumference}`);
    circle.setAttribute('stroke-dashoffset', String(-offset)); circle.setAttribute('tabindex', '0'); circle.setAttribute('role', 'button');
    circle.setAttribute('aria-label', `${item.name}, ${money.format(item.value)}, ${percent(item.share)}`);
    svg.appendChild(circle); item.circle = circle;
    requestAnimationFrame(() => requestAnimationFrame(() => circle.setAttribute('stroke-dasharray', `${visibleLength} ${circumference}`)));
    offset += length;
    circle.addEventListener('mouseenter', () => setDonutCenter(item)); circle.addEventListener('mouseleave', () => setDonutCenter(null));
    circle.addEventListener('focus', () => setDonutCenter(item)); circle.addEventListener('blur', () => setDonutCenter(null));
  });
  svg.setAttribute('aria-label', `Collections by source. ${money.format(total)}, ${percent(total ? 1 : 0)} of the selected total.`);
  $('#source-list').innerHTML = sourceItems.map(item => `<button class="source-row" type="button" aria-pressed="false"><span class="source-icon" data-icon="${item.icon}" style="--source-color:${item.color}">${sourceIcon(item.icon)}</span><span class="source-name"><span class="name">${escapeHtml(item.name)}</span><span class="type">${item.type === 'office' ? 'Office collection' : item.name === 'ECPay' ? 'Mobile payment channel' : 'Payment channel'}</span></span><span class="source-values"><span class="amount">${money.format(item.value)}</span><span class="share">${percent(item.share)}</span></span><span class="source-bar"><i style="width:0;background:${item.color}"></i></span></button>`).join('') || '<p class="collector-chart-empty">No collections in this period.</p>';
  [...$('#source-list').querySelectorAll('.source-row')].forEach((button, index) => {
    const item = sourceItems[index]; item.button = button;
    button.addEventListener('mouseenter', () => setDonutCenter(item)); button.addEventListener('mouseleave', () => setDonutCenter(null));
    button.addEventListener('focus', () => setDonutCenter(item)); button.addEventListener('blur', () => setDonutCenter(null));
    button.addEventListener('click', () => setDonutCenter(button.classList.contains('on') ? null : item));
    requestAnimationFrame(() => requestAnimationFrame(() => { button.querySelector('.source-bar i').style.width = `${item.share * 100}%`; }));
  });
  setDonutCenter(null);
}
function renderBillMonthChart(data) {
  const rows = data.billMonths || [], max = Math.max(0, ...rows.map(row => Number(row.amount || 0))), total = Number(data.totals.amount || 0);
  if (!rows.length || !max) { $('#billmonth-chart').innerHTML = '<p class="collector-chart-empty">No paid collections by bill month for this period.</p>'; return; }
  const bars = rows.map(row => {
    const value = Number(row.amount || 0), height = Math.max(1, value / max * 100), raw = String(row.billMonth), match = raw.match(/^(\d{2})(\d{2})$/), label = match ? `${match[1]}/20${match[2]}` : raw;
    return `<div class="billmonth-bar" title="Bill month ${escapeHtml(label)} · ${money.format(value)} · ${number.format(row.bills)} bills · ${percent(value / total)} of total"><strong>${compactMoney.format(value)}</strong><div class="billmonth-track"><i style="height:${height}%"></i></div><span>${escapeHtml(label)}</span><small>${percent(value / total)}</small></div>`;
  }).join('');
  $('#billmonth-chart').innerHTML = `<div class="billmonth-bars">${bars}</div>`;
}
function filteredRows() {
  if (!reportData) return [];
  const office = $('#collector-office').value, channel = $('#collector-channel').value;
  return reportData.rows.filter(row => (office === 'all' || row.database === office) && (channel === 'all' || row.channel === channel));
}
function renderDetails() {
  const rows = filteredRows().sort((a, b) => b.amount - a.amount);
  $('#collector-rows').innerHTML = rows.map(row => `<tr><td>${escapeHtml(row.database)}</td><td>${escapeHtml(row.collectorCode)}</td><th>${escapeHtml(row.bankName ?? row.collectorName)}</th><td><select class="channel-override" data-database="${escapeHtml(row.database)}" data-code="${escapeHtml(row.collectorCode)}"><option value="auto"${row.channelOverride === 'auto' ? ' selected' : ''}>Auto (${escapeHtml(row.channel)})</option><option value="bank"${row.channelOverride === 'bank' ? ' selected' : ''}>Bank</option><option value="collector"${row.channelOverride === 'collector' ? ' selected' : ''}>Office collection</option></select></td><td>${number.format(row.bills)}</td><td>${decimal.format(row.kwh)}</td><td>${money.format(row.amount)}</td><td>${percent(row.percentOfTotal)}</td></tr>`).join('') || '<tr><td colspan="8">No collections matched these filters.</td></tr>';
  document.querySelectorAll('.channel-override').forEach(select => select.addEventListener('change', () => saveClassification(select)));
}
async function saveClassification(select) {
  select.disabled = true; const error = $('#collector-error'); error.hidden = true;
  try {
    const response = await fetch('/api/collector-channel-override', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ database: select.dataset.database, collectorCode: select.dataset.code, classification: select.value }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Unable to save classification.'); await run();
  } catch (cause) { error.textContent = cause.message; error.hidden = false; select.disabled = false; }
}
function render(data) {
  reportData = data;
  $('#collector-title h3').textContent = `Collections paid ${data.dateFrom} to ${data.dateTo}`;
  $('#collector-updated').textContent = `Updated ${new Date(data.generatedAt).toLocaleString('en-PH')}${data.cached ? ' · SQLite snapshot' : ' · saved to SQLite'}`;
  renderSourceBreakdown(data); renderBillMonthChart(data);
  const maxBank = Math.max(1, ...data.banks.map(row => row.amount));
  $('#bank-bars').innerHTML = data.banks.map((row, index) => `<div class="bank-bar"><div><strong>${index + 1}. ${escapeHtml(row.bankName)}</strong><span>${money.format(row.amount)} · ${percent(row.percentOfTotal)} of total</span></div><div class="bank-track"><i style="width:${row.amount / maxBank * 100}%"></i></div></div>`).join('') || '<p class="component-note">No bank collections in this period.</p>';
  $('#bank-rows').innerHTML = data.banks.map(row => `<tr><th>${escapeHtml(row.bankName)}</th><td>${row.offices.map(escapeHtml).join(', ')}</td><td>${number.format(row.bills)}</td><td>${decimal.format(row.kwh)}</td><td>${money.format(row.amount)}</td><td>${percent(row.percentOfTotal)}</td><td>${percent(row.percentOfBanks)}</td></tr>`).join('') || '<tr><td colspan="7">No bank collections in this period.</td></tr>';
  const selectedOffice = $('#collector-office').value;
  $('#collector-office').innerHTML = '<option value="all">All offices</option>' + [...new Set(data.rows.map(row => row.database))].sort().map(office => `<option value="${escapeHtml(office)}">${escapeHtml(office)}</option>`).join('');
  if ([...$('#collector-office').options].some(option => option.value === selectedOffice)) $('#collector-office').value = selectedOffice;
  renderDetails(); $('#collector-content').hidden = false;
}
async function run() {
  const button = $('#run-collectors'), from = $('#collector-from').value, to = $('#collector-to').value, error = $('#collector-error'); error.hidden = true;
  if (!from || !to || from > to) { error.textContent = 'Choose a valid paid-date range.'; error.hidden = false; return; }
  button.disabled = true; button.textContent = 'Running...';
  try {
    const response = await fetch(`/api/collector-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to build collector report'); render(data);
  } catch (cause) { error.textContent = cause.message; error.hidden = false; }
  finally { button.disabled = false; button.textContent = 'Run report'; }
}
function defaultCycle() { const today = iso(new Date()); return { from: today, to: today }; }
const cycle = defaultCycle(); $('#collector-from').value = cycle.from; $('#collector-to').value = cycle.to;
$('#run-collectors').addEventListener('click', run);
$('#collector-office').addEventListener('change', renderDetails); $('#collector-channel').addEventListener('change', renderDetails);
$('#source-tabs').addEventListener('click', event => {
  const button = event.target.closest('button[data-filter]'); if (!button || !reportData) return;
  sourceFilter = button.dataset.filter;
  $('#source-tabs').querySelectorAll('button').forEach(item => { const active = item === button; item.classList.toggle('on', active); item.setAttribute('aria-selected', String(active)); });
  renderSourceBreakdown(reportData);
});
