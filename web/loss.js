const $=selector=>document.querySelector(selector),decimal=new Intl.NumberFormat('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}),number=new Intl.NumberFormat('en-PH'),percent=new Intl.NumberFormat('en-PH',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2});
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const monthLabel=value=>new Date(2000+Number(value.slice(2)),Number(value.slice(0,2))-1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});
const rate=value=>value===null?'N/A':percent.format(value);
const statusClass=value=>value==='Normal'?'normal':value==='High loss'?'high':'exception';

function render(data){
  const t=data.totals,rows=[...data.rows].sort((a,b)=>(b.lossRate??-Infinity)-(a.lossRate??-Infinity));
  $('#loss-metrics').innerHTML=[['Gross mother input',`${decimal.format(t.motherKwh)} kWh`],['Individual consumption',`${decimal.format(t.individualKwh)} kWh`],['Calculated loss',`${decimal.format(t.lossKwh)} kWh`],['Weighted loss rate',rate(t.lossRate)],['BAPA books',number.format(t.books)]].map(([label,value])=>`<article><span>${label}</span><strong>${value}</strong></article>`).join('');
  $('#loss-title h3').textContent=`${data.database==='all'?'All four offices':data.byOffice[0]?.office??data.database} · ${monthLabel(data.billMonth)}`;
  $('#loss-updated').textContent=`Updated ${new Date(data.generatedAt).toLocaleString('en-PH')}${data.cached?' · SQLite snapshot':' · saved to SQLite'}`;
  const chartRows=rows.filter(row=>row.lossRate!==null).slice(0,12),max=Math.max(.01,...chartRows.map(row=>Math.max(0,row.lossRate)));
  $('#loss-bars').innerHTML=chartRows.map(row=>`<div class="loss-bar"><div><strong>${escapeHtml(row.label)} · ${escapeHtml(row.area)}-${escapeHtml(row.book)}</strong><span>${decimal.format(row.lossKwh)} kWh · ${rate(row.lossRate)}</span></div><div class="loss-track"><i class="${row.lossRate<0?'negative':''}" style="width:${Math.min(100,Math.abs(row.lossRate)/max*100)}%"></i></div></div>`).join('')||'<p>No BAPA books matched this month.</p>';
  $('#loss-office-rows').innerHTML=data.byOffice.map(row=>`<tr><th>${escapeHtml(row.office)}</th><td>${number.format(row.books)}</td><td>${decimal.format(row.motherKwh)}</td><td>${decimal.format(row.individualKwh)}</td><td>${decimal.format(row.lossKwh)}</td><td>${rate(row.lossRate)}</td><td>${number.format(row.exceptions)}</td></tr>`).join('')||'<tr><td colspan="7">No data matched this month.</td></tr>';
  $('#loss-detail-rows').innerHTML=rows.map(row=>`<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.area)} · ${escapeHtml(row.areaName)}</td><td>${escapeHtml(row.book)}</td><td>${escapeHtml(row.motherAccounts)}</td><th>${escapeHtml(row.motherNames)}</th><td>${number.format(row.motherCount)}</td><td>${number.format(row.individualCount)}</td><td>${decimal.format(row.motherKwh)}</td><td>${decimal.format(row.individualKwh)}</td><td class="${row.lossKwh<0?'negative-value':'loss-value'}">${decimal.format(row.lossKwh)}</td><td>${rate(row.lossRate)}</td><td><span class="loss-status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td></tr>`).join('')||'<tr><td colspan="12">No data matched this month.</td></tr>';
  $('#loss-content').hidden=false;
}

async function run(){
  const button=$('#run-loss'),error=$('#loss-error'),params=new URLSearchParams({billMonth:$('#loss-month').value,database:$('#loss-database').value});
  error.hidden=true;button.disabled=true;button.textContent='Running...';
  try{const response=await fetch(`/api/loss-report?${params}`),data=await response.json();if(!response.ok)throw new Error(data.error??'Unable to build loss report');render(data)}catch(cause){error.textContent=cause.message;error.hidden=false}finally{button.disabled=false;button.textContent='Run report'}
}

try{
  const [catalogResponse,monthsResponse]=await Promise.all([fetch('/api/catalog'),fetch('/api/bill-months')]),catalog=await catalogResponse.json(),monthCatalog=await monthsResponse.json();
  $('#loss-database').innerHTML='<option value="all">All four offices</option>'+catalog.databases.map(item=>`<option value="${escapeHtml(item.database)}">${escapeHtml(item.label)}</option>`).join('');
  $('#loss-month').innerHTML=monthCatalog.months.map(value=>`<option value="${value}">${monthLabel(value)}</option>`).join('');
  $('#run-loss').addEventListener('click',run);await run();
}catch(error){$('#loss-error').textContent=error.message;$('#loss-error').hidden=false}
