let selected='Summary';
const keys=['bills','kwh','amount','paidBills','paidKwh','paidAmount','unpaidBills','unpaidKwh','unpaidAmount'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n??0).toLocaleString('en-PH',{maximumFractionDigits:2});
function group(rows,fields){const map=new Map();for(const row of rows){const id=JSON.stringify(fields.map(k=>row[k]));if(!map.has(id))map.set(id,Object.fromEntries(fields.map(k=>[k,row[k]])));const item=map.get(id);for(const k of keys)item[k]=(item[k]??0)+Number(row[k]??0)}return [...map.values()].sort((a,b)=>String(b.month).slice(2).localeCompare(String(a.month).slice(2))||String(b.month).slice(0,2).localeCompare(String(a.month).slice(0,2))||String(a.area??a.rateCode).localeCompare(String(b.area??b.rateCode)))}
function summary(rows){const head='<thead><tr><th rowspan="2">Bill month</th><th rowspan="2">Rate code</th><th colspan="3">TOTAL</th><th colspan="3">Paid</th><th colspan="3">Unpaid</th><th rowspan="2">DIFF (Paid %)</th></tr><tr>'+Array(3).fill('<th>Count</th><th>kWh</th><th>Total bill</th>').join('')+'</tr></thead>';const line=r=>`<tr><th>${esc(r.month)}</th><th>${esc(r.rateCode)}</th>${keys.map(k=>`<td>${fmt(r[k])}</td>`).join('')}<td>${r.amount?fmt(r.paidAmount/r.amount*100)+'%':'-'}</td></tr>`;const grouped=group(rows,['month','rateCode']);let body='';for(const month of [...new Set(grouped.map(r=>r.month))]){body+=grouped.filter(r=>r.month===month).map(line).join('');body+=line({...group(rows.filter(r=>r.month===month),['month'])[0],rateCode:'MONTH TOTAL'})}return `<table>${head}<tbody>${body}</tbody></table>`}
function plain(headers,rows){return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
export function renderBillingSummary(data,query=''){
 const root=document.createElement('div');root.id='billing-sheets';document.querySelector('.report-head').after(root);
 const names=['Summary','Area Summary','Consumer Summary','Raw Data',...new Set(data.rows.map(r=>r.office))];if(!names.includes(selected))selected='Summary';
 const tabbar=document.createElement('div');tabbar.style.cssText='display:flex;gap:8px;overflow:auto;padding:16px';root.append(tabbar);
 const panel=document.createElement('article');panel.style.cssText='padding:16px;overflow-x:auto';root.append(panel);
 const rows=data.rows.filter(r=>!query||Object.values(r).some(v=>String(v).toLowerCase().includes(query.toLowerCase())));
 for(const name of names){const button=document.createElement('button');button.textContent=name;button.style.cssText=`white-space:nowrap;padding:10px;background:${name===selected?'#0e7167':'#e8ece7'};color:${name===selected?'white':'#16251f'}`;button.onclick=()=>{selected=name;root.remove();renderBillingSummary(data,query)};tabbar.append(button)}
 let html='';
 if(selected==='Summary')html=summary(rows);
 else if(selected==='Area Summary'){
  const rates=[...new Set(['R','C','P','S','H','B',...rows.map(r=>r.rateCode)])];
  for(const [title,fields] of [['TOTAL BILL',['bills','kwh','amount']],['PAID',['paidBills','paidKwh','paidAmount']],['UNPAID',['unpaidBills','unpaidKwh','unpaidAmount']]]){
   const grouped=group(rows,['month','area','rateCode']),areas=group(rows,['month','area']);
   html+=`<h4>${title}</h4><table><thead><tr><th rowspan="2">Month</th><th rowspan="2">Area code</th><th rowspan="2">Area</th>${[...rates,'TOTAL'].map(r=>`<th colspan="3">${esc(r)}</th>`).join('')}</tr><tr>${[...rates,'TOTAL'].map(()=>'<th>Count</th><th>kWh</th><th>Total bill</th>').join('')}</tr></thead><tbody>`;
   for(const a of areas)html+=`<tr><th>${esc(a.month)}</th><th>${esc(a.area)}</th><th>${esc(data.areaNames?.[a.area]??a.area)}</th>${[...rates,'TOTAL'].map(rate=>{const item=rate==='TOTAL'?a:grouped.find(r=>r.month===a.month&&r.area===a.area&&r.rateCode===rate);return fields.map(k=>`<td>${fmt(item?.[k])}</td>`).join('')}).join('')}</tr>`;html+='</tbody></table>';
  }
 }else if(selected==='Consumer Summary')html=plain(['Office','Month','Area','Book','Address','Count','kWh','Total bill'],(data.consumerRows??[]).filter(r=>!query||Object.values(r).some(v=>String(v).toLowerCase().includes(query.toLowerCase()))).map(r=>[r.office,r.month,r.area,r.book,r.address,fmt(r.consumers),fmt(r.kwh),fmt(r.totalBill)]));
 else if(selected==='Raw Data')html=plain(data.columns.map(c=>c[1]),rows.map(r=>data.columns.map(([k,,type])=>['number','decimal','currency'].includes(type)?fmt(r[k]):r[k])));
 else for(const [source,title] of [['billhistory','Non-BAPA / billhistory'],['billhistory_bm','BAPA mother / billhistory_bm']])html+=`<h4>${esc(title)}</h4>${summary(rows.filter(r=>r.office===selected&&r.source===source))}`;
 panel.innerHTML=`<h3>${esc(selected)}</h3><p>Selected office scope: ${esc(data.label)}. DIFF is paid amount divided by total billed, matching the workbook. Search filters this view. Excel exports the visible sheet.</p>${html}`;
}
