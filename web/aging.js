const $=selector=>document.querySelector(selector),money=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2}),number=new Intl.NumberFormat('en-PH',{maximumFractionDigits:0});
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const areaNames={"001":"Catbalogan","002":"Jiabong","003":"Motiong","004":"Paranas","005":"San Sebastian","006":"Hinabangan","007":"Calbiga","008":"Pinabacdao","009":"Villareal","010":"Sta. Rita","011":"Talalora","012":"Basey","013":"Daram","014":"Zumarraga","015":"Marabut","016":"San Jose De Buan","017":"Large Load","018":"Coop Use","019":"CINCORAMA","020":"Mombon","021":"Basiao BAPA","022":"Brgy Boco BAPA"};
const monthLabel=value=>new Date(2000+Number(value.slice(2)),Number(value.slice(0,2))-1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});

function render(data){
  const t=data.totals,bucketLabels=data.bucketDefinitions,oldest=bucketLabels.at(-1);
  $('#aging-metrics').innerHTML=[['Outstanding total',money.format(t.total)],['Accounts',number.format(t.accounts)],['Unpaid bills',number.format(t.bills)],[oldest[1],money.format(t[oldest[0]])],['Areas',number.format(data.byArea.length)]].map(([label,value])=>`<article><span>${label}</span><strong>${value}</strong></article>`).join('');
  $('#aging-title h3').textContent=`${data.label} · ${data.bracketType==='old'?'Old aging':'Standard aging'} · ${monthLabel(data.referenceMonth)} · ${data.area==='all'?'All areas':`${data.area} ${areaNames[data.area]??''}`} · ${data.rateCode==='all'?'All rates':`Rate ${data.rateCode}`}`;
  $('#aging-updated').textContent=`Updated ${new Date(data.generatedAt).toLocaleString('en-PH')}${data.cached?' · SQLite snapshot':' · saved to SQLite'}`;
  const max=Math.max(1,...bucketLabels.map(([key])=>Math.abs(t[key])));
  $('#aging-bars').style.gridTemplateColumns='repeat(auto-fit,minmax(170px,1fr))';
  $('#aging-bars').innerHTML=bucketLabels.map(([key,label])=>`<div class="aging-bar"><div><strong>${label}</strong><span>${money.format(t[key])}</span></div><div class="aging-track"><i style="width:${Math.abs(t[key])/max*100}%"></i></div></div>`).join('');
  $('#aging-summary-head').innerHTML=`<th>Area</th><th>Accounts</th><th>Bills</th>${bucketLabels.map(([,label])=>`<th>${escapeHtml(label)}</th>`).join('')}<th>Total</th>`;
  $('#aging-detail-head').innerHTML=`<th>Account</th><th>Type</th><th>Name</th><th>Area</th><th>Book</th>${bucketLabels.map(([,label])=>`<th>${escapeHtml(label)}</th>`).join('')}<th>Total</th>`;
  $('#aging-summary-rows').innerHTML=data.byArea.map(row=>`<tr><th>${escapeHtml(row.area)} · ${escapeHtml(row.areaName)}</th><td>${number.format(row.accounts)}</td><td>${number.format(row.bills)}</td>${bucketLabels.map(([key])=>`<td>${money.format(row[key])}</td>`).join('')}<td class="aging-total">${money.format(row.total)}</td></tr>`).join('')||`<tr><td colspan="${bucketLabels.length+4}">No outstanding balances matched the filters.</td></tr>`;
  $('#aging-detail-rows').innerHTML=data.rows.map(row=>`<tr><td>${escapeHtml(row.accountNumber)}</td><td>${escapeHtml(row.rateCode)}</td><th>${escapeHtml(row.name)}</th><td>${escapeHtml(row.area)}</td><td>${escapeHtml(row.book)}</td>${bucketLabels.map(([key])=>`<td>${row[key]?money.format(row[key]):'–'}</td>`).join('')}<td class="aging-total">${money.format(row.total)}</td></tr>`).join('')||`<tr><td colspan="${bucketLabels.length+6}">No outstanding balances matched the filters.</td></tr>`;
  $('#aging-content').hidden=false;
}

async function run(){
  const button=$('#run-aging'),error=$('#aging-error'),params=new URLSearchParams({bracketType:$('#aging-bracket').value,referenceMonth:$('#aging-month').value,database:$('#aging-database').value,area:$('#aging-area').value,rateCode:$('#aging-rate').value});
  error.hidden=true;button.disabled=true;button.textContent='Running...';
  try{const response=await fetch(`/api/aging-report?${params}`),data=await response.json();if(!response.ok)throw new Error(data.error??'Unable to build aging report');render(data)}catch(cause){error.textContent=cause.message;error.hidden=false}finally{button.disabled=false;button.textContent='Run report'}
}

try{
  const [catalogResponse,monthsResponse]=await Promise.all([fetch('/api/catalog'),fetch('/api/bill-months')]),catalog=await catalogResponse.json(),monthCatalog=await monthsResponse.json();
  $('#aging-database').innerHTML=catalog.databases.map(item=>`<option value="${escapeHtml(item.database)}">${escapeHtml(item.label)}</option>`).join('');
  $('#aging-month').innerHTML=monthCatalog.months.map(value=>`<option value="${value}">${monthLabel(value)}</option>`).join('');
  $('#aging-area').innerHTML='<option value="all">All areas</option>'+Object.entries(areaNames).map(([code,name])=>`<option value="${code}">${code} · ${escapeHtml(name)}</option>`).join('');
  $('#run-aging').addEventListener('click',run);
}catch(error){$('#aging-error').textContent=error.message;$('#aging-error').hidden=false}
