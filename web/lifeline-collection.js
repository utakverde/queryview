const $=selector=>document.querySelector(selector),money=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2}),number=new Intl.NumberFormat('en-PH',{maximumFractionDigits:0});
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const iso=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function defaultCycle(){const today=new Date(),end=new Date(today.getFullYear(),today.getMonth(),25);if(today.getDate()<26)end.setMonth(end.getMonth()-1);return{from:iso(new Date(end.getFullYear(),end.getMonth()-1,26)),to:iso(end)}}
function render(data){
  const t=data.totals;
  $('#report-metrics').innerHTML=[['Total amount',money.format(t.amount)],['Consumer count',number.format(t.count)],['Kilowatt-hour',number.format(t.kilowattHour)],['Areas',number.format(t.areas)]].map(([label,value])=>`<article><span>${label}</span><strong>${value}</strong></article>`).join('');
  $('#report-title h3').textContent=`Paid ${data.dateFrom} to ${data.dateTo}`;
  $('#report-updated').textContent=`Updated ${new Date(data.generatedAt).toLocaleString('en-PH')}${data.cached?' · SQLite snapshot':' · saved to SQLite'}`;
  $('#detail-rows').innerHTML=data.rows.map(row=>`<tr><th>${escapeHtml(row.area)}</th><td>${escapeHtml(row.areaName)}</td><td>${number.format(row.count)}</td><td>${number.format(row.kilowattHour)}</td><td>${money.format(row.amount)}</td></tr>`).join('')||'<tr><td colspan="5">No matching collections.</td></tr>';
  $('#report-content').hidden=false;
}
async function run(){const button=$('#run-report'),error=$('#report-error'),params=new URLSearchParams({from:$('#date-from').value,to:$('#date-to').value});error.hidden=true;if(!params.get('from')||!params.get('to')||params.get('from')>params.get('to')){error.textContent='Choose a valid paid-date range.';error.hidden=false;return}button.disabled=true;button.textContent='Running...';try{const response=await fetch(`/api/lifeline-collection?${params}`),data=await response.json();if(!response.ok)throw new Error(data.error??'Unable to build lifeline collection report');render(data)}catch(cause){error.textContent=cause.message;error.hidden=false}finally{button.disabled=false;button.textContent='Run report'}}
const cycle=defaultCycle();$('#date-from').value=cycle.from;$('#date-to').value=cycle.to;$('#run-report').addEventListener('click',run);
