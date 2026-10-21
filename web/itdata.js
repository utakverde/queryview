import { buildBapaExcel } from './bapa-excel.js';
const $=selector=>document.querySelector(selector);
let page=1,pages=1,search='',loading=false,recordRequest=0;
function cell(tag,value){const node=document.createElement(tag);node.textContent=value??'—';return node}
function passwordCell(value){
  const td=document.createElement('td'),wrap=document.createElement('div'),text=document.createElement('span'),button=document.createElement('button');
  wrap.className='it-password-cell';text.className='it-password-value';button.className='it-password-toggle';button.type='button';
  let visible=false;
  const render=()=>{
    text.textContent=visible?(value??'—'):'••••••••';
    button.setAttribute('aria-label',visible?'Hide password':'Show password');button.setAttribute('aria-pressed',String(visible));button.title=visible?'Hide password':'Show password';
    button.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(visible?'<path d="m3 3 18 18"/>':'')+'</svg>';
  };
  button.addEventListener('click',()=>{visible=!visible;render()});render();wrap.append(text,button);td.append(wrap);return td;
}
function controls(){for(const id of ['run','clear'])$('#'+id).disabled=loading;$('#previous').disabled=loading||page<=1;$('#next').disabled=loading||page>=pages}
async function load(targetPage=1){
  const request=++recordRequest;
  loading=true;controls();$('#status').className='';$('#status').textContent='Loading user records…';
  try{
    const response=await fetch('/api/itdata?'+new URLSearchParams({search,page:String(targetPage),showPasswords:'1'}),{cache:'no-store'});
    const data=await response.json();if(request!==recordRequest)return;if(!response.ok)throw new Error(data.error||'Unable to load user records.');
    page=data.page;pages=data.pages;$('#source').textContent=`${data.database}.${data.table}`;
    const header=document.createElement('tr');for(const column of data.columns)header.append(cell('th',column==='password'?'Password':column));$('#columns').replaceChildren(header);
    const rows=data.rows.map(values=>{const row=document.createElement('tr');for(const [index,value] of values.entries())row.append(data.columns[index]==='password'?passwordCell(value):cell('td',value));return row});
    if(!rows.length){const row=document.createElement('tr'),empty=cell('td','No matching user records.');empty.colSpan=data.columns.length;row.append(empty);rows.push(row)}
    $('#rows').replaceChildren(...rows);$('#page').textContent=`Page ${page.toLocaleString()} of ${pages.toLocaleString()}`;
    const first=data.total?(page-1)*data.pageSize+1:0,last=Math.min(page*data.pageSize,data.total);
    $('#status').textContent=`${data.total.toLocaleString()} matching records · Showing ${first.toLocaleString()}–${last.toLocaleString()}`;
  }catch(error){if(request!==recordRequest)return;$('#status').className='error';$('#status').textContent=error.message;$('#columns').replaceChildren();$('#rows').replaceChildren();$('#page').textContent='';page=1;pages=1}
  finally{if(request===recordRequest){loading=false;controls()}}
}
$('#search-form').addEventListener('submit',event=>{event.preventDefault();if(loading)return;search=$('#search').value.trim();load()});
$('#clear').addEventListener('click',()=>{$('#search').value='';search='';load()});
$('#previous').addEventListener('click',()=>load(page-1));$('#next').addEventListener('click',()=>load(page+1));load();

let bapaData=null,bapaBusy=false,membershipData=null,membershipBusy=false;
const tabs=[...document.querySelectorAll('.it-tabs [role="tab"]')];
function selectTab(id){
  const selected=tabs.find(tab=>tab.id===id)||tabs[0];
  for(const tab of tabs){const active=tab===selected;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!active}
}
function tabFromHash(){selectTab(location.hash==='#mobile-transfer'?'mobile-transfer-tab':location.hash==='#membership-posting'?'membership-posting-tab':location.hash==='#bapa-reports'?'bapa-reports-tab':location.hash==='#mysqlworkspace'?'mysqlworkspace-tab':'records-tab');if(location.hash==='#bapa-reports'&&!bapaData)loadBapa();if(location.hash==='#membership-posting'){if(!membershipData)loadMembership();loadMembershipBillingUsers();loadMembershipHistory()}if(location.hash==='#mobile-transfer'){loadMobileFiles();loadMobileDevices()}}
for(const [index,tab] of tabs.entries()){
  tab.addEventListener('click',()=>{const hash=tab.id==='mobile-transfer-tab'?'#mobile-transfer':tab.id==='membership-posting-tab'?'#membership-posting':tab.id==='bapa-reports-tab'?'#bapa-reports':tab.id==='mysqlworkspace-tab'?'#mysqlworkspace':'#records';history.replaceState(null,'',hash);selectTab(tab.id);if(tab.id==='bapa-reports-tab'&&!bapaData)loadBapa();if(tab.id==='membership-posting-tab'){if(!membershipData)loadMembership();loadMembershipBillingUsers();loadMembershipHistory()}if(tab.id==='mobile-transfer-tab'){loadMobileFiles();loadMobileDevices()}});
  tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();tabs[next].focus();tabs[next].click()});
}
window.addEventListener('hashchange',tabFromHash);

let workspaceResult=null,activeWorkspaceResult=0,schemaLoaded=false,queryBusy=false,workspaceTables=[],queryPreview=null;
const quoteIdentifier=value=>'`'+value.replaceAll('`','``')+'`';
async function workspaceRequest(url,options){const response=await fetch(url,{cache:'no-store',...options}),data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed.');return data}
async function loadSchema(){
  resetQueryTables();$('#schema-refresh').disabled=true;$('#schema-status').textContent='Loading tables…';$('#schema-tables').replaceChildren();
  try{if(!$('#workspace-connection').value)await loadConnections();if(!$('#workspace-database').value)await loadDatabases();const data=await workspaceRequest('/api/itdata/workspace/schema?'+new URLSearchParams({database:$('#workspace-database').value,connection:$('#workspace-connection').value}));$('#schema-status').textContent=`${data.database} · ${data.tables.length} tables`;$('#schema-tables').replaceChildren();workspaceTables=data.tables;$('#query-table').replaceChildren(new Option('Choose a table',''),...data.tables.map(table=>new Option(table.name,table.name)));$('#query-table').disabled=!data.tables.length;
    for(const table of data.tables){const details=document.createElement('details'),summary=cell('summary',table.name),preview=cell('button','Build SELECT');preview.type='button';preview.addEventListener('click',()=>{$('#query-table').value=table.name;updateTemplateButtons();buildQueryTemplate('select')});details.append(summary,preview);for(const column of table.columns){const button=cell('button',`${column.name} · ${column.type}`);button.type='button';button.className='workspace-column';button.title='Insert column at cursor';button.addEventListener('click',()=>{const editor=$('#query-editor');invalidatePreview();editor.setRangeText(quoteIdentifier(column.name),editor.selectionStart,editor.selectionEnd,'end');editor.focus()});details.append(button)}$('#schema-tables').append(details)}schemaLoaded=true;
  }catch(error){$('#schema-status').textContent=error.message;schemaLoaded=false}finally{$('#schema-refresh').disabled=false}
}
async function runQuery(){
  if(queryBusy)return;if(!queryPreview||queryPreview.source!==JSON.stringify(currentQuery())||Date.now()>=Date.parse(queryPreview.expiresAt)){invalidatePreview();$('#query-status').textContent='Preview this query before running it.';return}const approved={...currentQuery(),previewToken:queryPreview.token};invalidatePreview();if(!$('#workspace-database').value){$('#query-status').textContent='Choose an available database first.';return}queryBusy=true;$('#workspace-database').disabled=true;$('#workspace-connection').disabled=true;$('#query-run').disabled=true;$('#query-export').disabled=true;$('#query-status').textContent='Running query…';$('#query-columns').replaceChildren();$('#query-rows').replaceChildren();$('#query-result-tabs').replaceChildren();workspaceResult=null;
  try{const data=await workspaceRequest('/api/itdata/workspace/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(approved)});workspaceResult=data;activeWorkspaceResult=0;const tabs=$('#query-result-tabs');tabs.replaceChildren(...data.results.map((result,index)=>{const button=cell('button',`Result ${index+1} · ${result.rows.length} rows`);button.type='button';button.addEventListener('click',()=>showWorkspaceResult(index));return button}));tabs.hidden=data.results.length<2;showWorkspaceResult(0);
  }catch(error){$('#query-status').textContent=error.message}finally{queryBusy=false;$('#query-run').disabled=true;$('#workspace-database').disabled=false;$('#workspace-connection').disabled=false}
}
function showWorkspaceResult(index){
  const result=workspaceResult?.results[index];if(!result)return;activeWorkspaceResult=index;
  const header=document.createElement('tr');for(const column of result.columns)header.append(cell('th',column));$('#query-columns').replaceChildren(header);
  $('#query-rows').replaceChildren(...result.rows.map(values=>{const row=document.createElement('tr');for(const value of values)row.append(cell('td',value));return row}));
  for(const [position,button] of [...$('#query-result-tabs').children].entries())button.setAttribute('aria-pressed',String(position===index));
  $('#query-status').textContent=`${workspaceResult.database} · Result ${index+1} of ${workspaceResult.results.length} · ${result.rows.length} rows · ${workspaceResult.durationMs} ms${result.truncated?' · Results limited to 500 rows; narrow your query.':''}`;
  $('#query-export').disabled=!result.columns.length;
}
let savedQueries=[];try{const saved=JSON.parse(localStorage.getItem('itdata-workspace-queries')||'[]');if(Array.isArray(saved))savedQueries=saved.filter(item=>typeof item.name==='string'&&typeof item.query==='string')}catch{}
function renderSaved(){const select=$('#query-saved');select.replaceChildren(new Option('Choose a saved query',''));savedQueries.forEach((item,index)=>select.add(new Option(item.name,String(index))))}
$('#query-save').addEventListener('click',()=>{const name=prompt('Query name');if(!name?.trim())return;const item={name:name.trim(),query:$('#query-editor').value,connection:$('#workspace-connection').value,database:$('#workspace-database').value},index=savedQueries.findIndex(value=>value.name===item.name),next=[...savedQueries];if(index<0)next.push(item);else next[index]=item;try{localStorage.setItem('itdata-workspace-queries',JSON.stringify(next));savedQueries=next;renderSaved();$('#query-status').textContent='Query saved in this browser.'}catch{$('#query-status').textContent='Unable to save query in this browser.'}});
$('#query-saved').addEventListener('change',async()=>{if($('#query-saved').value!==''){const saved=savedQueries[Number($('#query-saved').value)];invalidatePreview();$('#query-editor').value=saved.query;try{if(saved.connection&&saved.connection!==$('#workspace-connection').value){const option=[...$('#workspace-connection').options].find(option=>option.value===saved.connection&&!option.disabled);if(!option)throw new Error('The saved connection is unavailable.');$('#workspace-connection').value=saved.connection;clearWorkspace();await loadDatabases()}if(saved.database&&[...$('#workspace-database').options].some(option=>option.value===saved.database)){$('#workspace-database').value=saved.database;databaseChanged()}}catch(error){$('#query-status').textContent=error.message}}});
$('#query-export').addEventListener('click',()=>{const result=workspaceResult?.results[activeWorkspaceResult];if(!result)return;const csv=[result.columns,...result.rows].map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n'),url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`mysqlworkspace-result-${activeWorkspaceResult+1}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
$('#query-run').addEventListener('click',runQuery);$('#query-editor').addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();previewQuery()}});$('#schema-refresh').addEventListener('click',loadSchema);
$('#mysqlworkspace-tab').addEventListener('click',()=>{if(!schemaLoaded)loadSchema()});window.addEventListener('hashchange',()=>{if(location.hash==='#mysqlworkspace'&&!schemaLoaded)loadSchema()});renderSaved();if(location.hash==='#mysqlworkspace')loadSchema();

async function loadDatabases(){
  $('#database-count').textContent='Loading all databases…';
  const previous=$('#workspace-database').value;
  const data=await workspaceRequest('/api/itdata/workspace/databases?'+new URLSearchParams({connection:$('#workspace-connection').value})),select=$('#workspace-database');
  const names=[...new Set(data.databases)].sort((a,b)=>a.localeCompare(b));
  select.replaceChildren(...names.map(name=>new Option(name,name)));
  if(names.includes(previous))select.value=previous;else if(names.includes(data.defaultDatabase))select.value=data.defaultDatabase;
  $('#database-count').textContent=`${names.length} available databases`;
  select.disabled=!data.databases.length;
  if(!data.databases.length)throw new Error('No databases are available for this connection.');
}
function databaseChanged(){invalidatePreview();schemaLoaded=false;workspaceResult=null;$('#query-columns').replaceChildren();$('#query-rows').replaceChildren();$('#query-result-tabs').replaceChildren();$('#query-export').disabled=true;$('#query-status').textContent='Database changed. Choose a table or update your SQL before running.';loadSchema()}
$('#workspace-database').addEventListener('change',databaseChanged);

async function loadConnections(){
  const data=await workspaceRequest('/api/itdata/workspace/connections'),select=$('#workspace-connection');
  select.replaceChildren(...data.connections.map(item=>{const option=new Option(`${item.label} · ${item.host}:${item.port}${item.enabled?'':' (disabled)'}`,item.id);option.disabled=!item.enabled;return option}));
  select.value=data.connections.find(item=>item.id==='itProgram'&&item.enabled)?.id||data.connections.find(item=>item.enabled)?.id||'';select.disabled=!select.value;
  if(!select.value)throw new Error('Enable a connection in Database Settings first.');
}
function clearWorkspace(){invalidatePreview();$('#database-count').textContent='';resetQueryTables();schemaLoaded=false;workspaceResult=null;$('#workspace-database').replaceChildren(new Option('Choose a database',''));$('#workspace-database').disabled=true;$('#schema-tables').replaceChildren();$('#query-columns').replaceChildren();$('#query-rows').replaceChildren();$('#query-result-tabs').replaceChildren();$('#query-export').disabled=true}
$('#workspace-connection').addEventListener('change',async()=>{clearWorkspace();$('#workspace-connection').disabled=true;$('#schema-status').textContent='Connecting…';try{await loadDatabases();await loadSchema();$('#query-status').textContent='Connection changed. Choose a table or update your SQL before running.'}catch(error){$('#schema-status').textContent=error.message}finally{$('#workspace-connection').disabled=false}});

function resetQueryTables(){workspaceTables=[];$('#query-table').replaceChildren(new Option('Choose a table',''));$('#query-table').disabled=true;updateTemplateButtons()}
function updateTemplateButtons(){for(const button of document.querySelectorAll('[data-query-template]'))button.disabled=!$('#query-table').value}
function buildQueryTemplate(kind){invalidatePreview();
  const table=workspaceTables.find(item=>item.name===$('#query-table').value);if(!table)return;
  const name=quoteIdentifier(table.name),columns=table.columns.map(column=>quoteIdentifier(column.name));
  if(!columns.length)return;
  const templates={select:`SELECT ${columns.join(', ')}\nFROM ${name}\nLIMIT 100;`,insert:`INSERT INTO ${name} (${columns.join(', ')})\nVALUES (${columns.map(()=>"'[value]'").join(', ')});`,update:`UPDATE ${name}\nSET ${columns.map(column=>`${column} = '[value]'`).join(',\n    ')}\nWHERE 1 = 0;`,delete:`DELETE FROM ${name}\nWHERE 1 = 0;`};
  $('#query-editor').value=templates[kind];$('#query-editor').focus();$('#query-status').textContent=kind==='select'?'SELECT built. Edit the query, then preview it.':`${kind.toUpperCase()} template built. Replace placeholders${kind==='update'||kind==='delete'?' and WHERE 1 = 0 with your target condition':''}. The workspace runs SELECT queries only.`;
}
$('#query-table').addEventListener('change',updateTemplateButtons);
for(const button of document.querySelectorAll('[data-query-template]'))button.addEventListener('click',()=>buildQueryTemplate(button.dataset.queryTemplate));
$('#query-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#query-editor').value);$('#query-status').textContent='SQL copied.'}catch{$('#query-editor').focus();$('#query-editor').select();$('#query-status').textContent='Press Ctrl+C to copy the selected SQL.'}});

$('#databases-refresh').addEventListener('click',async()=>{if(queryBusy)return;$('#databases-refresh').disabled=true;$('#workspace-connection').disabled=true;$('#workspace-database').disabled=true;try{if(!$('#workspace-connection').value)await loadConnections();await loadDatabases();databaseChanged()}catch(error){$('#database-count').textContent=error.message}finally{$('#databases-refresh').disabled=false;$('#workspace-connection').disabled=false}});

function currentQuery(){return{query:$('#query-editor').value,connection:$('#workspace-connection').value,database:$('#workspace-database').value}}
function invalidatePreview(){queryPreview=null;$('#query-run').disabled=true;$('#query-preview-panel').hidden=true}
async function previewQuery(){
  if(queryBusy)return;invalidatePreview();const input=currentQuery();
  if(!input.connection||!input.database){$('#query-status').textContent='Choose a connection and database first.';return}
  $('#query-preview-target').textContent=`${$('#workspace-connection').selectedOptions[0].textContent} → ${input.database}`;$('#query-preview-sql').textContent=input.query;$('#query-preview-panel').hidden=false;$('#query-preview').disabled=true;$('#query-status').textContent='Validating preview…';
  try{const data=await workspaceRequest('/api/itdata/workspace/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});if(JSON.stringify(currentQuery())!==JSON.stringify(input))return;queryPreview={...data,source:JSON.stringify(input)};$('#query-run').disabled=false;$('#query-status').textContent=`Preview ready for ${data.statementCount} SELECT statement${data.statementCount===1?'':'s'}. Review, then run.`}catch(error){$('#query-status').textContent=error.message}finally{$('#query-preview').disabled=false}
}
$('#query-preview').addEventListener('click',previewQuery);$('#query-editor').addEventListener('input',invalidatePreview);

function filteredBapaRows(){
  const office=$('#bapa-office').value,search=$('#bapa-search').value.trim().toLowerCase();
  return bapaData.rows.filter(row=>(office==='all'||row.database===office)&&['office','accountNumber','name','address','area','book','serial'].some(key=>String(row[key]).toLowerCase().includes(search)));
}
function renderBapaCharts(offices){
  const charts=$('#bapa-charts');charts.replaceChildren();
  for(const [title,key,color] of [['Mother meters by office','mothers','mother'],['Individual accounts by office','individuals','individual']]){
    const figure=document.createElement('figure');figure.className='bapa-chart';figure.append(cell('figcaption',title));
    const max=Math.max(1,...offices.map(office=>office[key]));
    for(const office of offices){
      const button=document.createElement('button');button.type='button';button.className='bapa-bar-row';button.setAttribute('aria-label',`${office.office}: ${office[key].toLocaleString()} ${title.split(' by ')[0].toLowerCase()}. Show this office.`);
      const track=document.createElement('span'),bar=document.createElement('span');track.className='bapa-bar-track';bar.className=`bapa-bar ${color}`;bar.style.width=`${office[key]/max*100}%`;track.append(bar);
      button.append(cell('span',office.office),track,cell('strong',office[key].toLocaleString()));button.addEventListener('click',()=>{$('#bapa-office').value=office.database;renderBapa()});figure.append(button);
    }
    charts.append(figure);
  }
  const figure=document.createElement('figure');figure.className='bapa-chart';figure.append(cell('figcaption','Individual account status'));
  const total=offices.reduce((sum,office)=>sum+office.individuals,0),active=offices.reduce((sum,office)=>sum+office.activeIndividuals,0),disconnected=offices.reduce((sum,office)=>sum+office.disconnectedIndividuals,0);
  const track=document.createElement('div');track.className='bapa-status-track';track.setAttribute('role','img');track.setAttribute('aria-label',`${active.toLocaleString()} active, ${disconnected.toLocaleString()} disconnected, ${(total-active-disconnected).toLocaleString()} other or unspecified`);
  for(const [label,value,color] of [['Active',active,'active'],['Disconnected',disconnected,'disconnected'],['Other / unspecified',Math.max(0,total-active-disconnected),'other']]){
    const segment=document.createElement('span');segment.className=`bapa-status-segment ${color}`;segment.style.width=`${total?value/total*100:0}%`;segment.title=`${label}: ${value.toLocaleString()}`;track.append(segment);
    const legend=document.createElement('div');legend.className='bapa-chart-legend';const dot=document.createElement('span');dot.className=`bapa-legend-dot ${color}`;legend.append(dot,cell('span',label),cell('strong',`${value.toLocaleString()} (${total?(value/total*100).toFixed(1):'0.0'}%)`));figure.append(legend);
  }
  figure.insertBefore(track,figure.children[1]);if(!total)figure.append(cell('p','No individual accounts.'));charts.append(figure);
}
function renderBapa(){
  if(!bapaData)return;
  const office=$('#bapa-office').value,rows=filteredBapaRows();
  $('#bapa-export').disabled=bapaBusy||!rows.length;
  const summaries=bapaData.offices.filter(item=>office==='all'||item.database===office);
  renderBapaCharts(summaries);
  $('#bapa-summary').replaceChildren(...summaries.map(item=>{const card=document.createElement('div');card.append(cell('h4',item.office),cell('p',`${item.mothers.toLocaleString()} mother meters · ${item.individuals.toLocaleString()} individual accounts`),cell('p',`${item.linkedIndividuals.toLocaleString()} linked · ${item.unmatchedIndividuals.toLocaleString()} without a matching mother route`));return card}));
  $('#bapa-rows').replaceChildren(...rows.map(item=>{const row=document.createElement('tr');for(const key of ['office','accountNumber','name','address','area','book','serial','status','individuals','active','disconnected'])row.append(cell('td',typeof item[key]==='number'?item[key].toLocaleString():item[key]));row.append(cell('td',item.routeMothers>1?`Shared route (${item.routeMothers} mothers)`:'Single mother route'));return row}));
  if(!rows.length){const row=document.createElement('tr'),empty=cell('td','No matching mother meters.');empty.colSpan=12;row.append(empty);$('#bapa-rows').append(row)}
  $('#bapa-count').textContent=`${rows.length.toLocaleString()} of ${bapaData.rows.length.toLocaleString()} mother meters`;
}
async function loadBapa(){
  if(bapaBusy)return;bapaBusy=true;$('#bapa-refresh').disabled=true;$('#bapa-export').disabled=true;$('#bapa-status').className='';$('#bapa-status').textContent='Loading BAPA mother meters from all four databases…';
  try{const response=await fetch('/api/itdata/bapa-reports',{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load BAPA reports.');bapaData=data;const previous=$('#bapa-office').value;$('#bapa-office').replaceChildren(new Option('All four offices','all'),...data.offices.map(item=>new Option(item.office,item.database)));if([...$('#bapa-office').options].some(option=>option.value===previous))$('#bapa-office').value=previous;renderBapa();$('#bapa-status').textContent=`Loaded ${data.offices.length} offices · Updated ${new Date(data.generatedAt).toLocaleString()}`}
  catch(error){$('#bapa-status').className='error';$('#bapa-status').textContent=(bapaData?'Showing the previous report. Refresh failed: ':'')+error.message}
  finally{bapaBusy=false;$('#bapa-refresh').disabled=false;$('#bapa-export').disabled=!bapaData||!filteredBapaRows().length}
}
$('#bapa-export').addEventListener('click',()=>{
  if(!bapaData||bapaBusy)return;
  const rows=filteredBapaRows();if(!rows.length)return;
  const office=$('#bapa-office').value,offices=bapaData.offices.filter(item=>office==='all'||item.database===office);
  const workbook=buildBapaExcel(rows,offices,{office:$('#bapa-office').selectedOptions[0].textContent,search:$('#bapa-search').value.trim(),generatedAt:bapaData.generatedAt});
  const url=URL.createObjectURL(new Blob([workbook],{type:'application/vnd.ms-excel;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download=`samelco-bapa-reports-${office}-${new Date().toISOString().slice(0,10)}.xls`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('#bapa-refresh').addEventListener('click',loadBapa);$('#bapa-office').addEventListener('change',renderBapa);$('#bapa-search').addEventListener('input',renderBapa);$('#bapa-form').addEventListener('submit',event=>{event.preventDefault();renderBapa()});
const membershipMoney=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'});
function membershipDefaults(){const to=new Date(),from=new Date(to);from.setDate(from.getDate()-30);$('#membership-to').value=to.toISOString().slice(0,10);$('#membership-from').value=from.toISOString().slice(0,10)}
function renderMembership(){
  if(!membershipData)return;
  const category=$('#membership-category').value,search=$('#membership-search').value.trim().toLowerCase();
  const rows=membershipData.rows.filter(row=>(category==='all'||row.category===category)&&[row.applyId,row.accountNumber,row.orNumber,row.itemName].some(value=>String(value??'').toLowerCase().includes(search)));
  $('#membership-rows').replaceChildren(...rows.map(item=>{const tr=document.createElement('tr');for(const value of [item.paymentDate,item.applyId,item.accountNumber,item.category,item.itemName,membershipMoney.format(item.amount),item.orNumber,item.accountingCode||'Unmapped'])tr.append(cell('td',value));return tr}));
  if(!rows.length){const tr=document.createElement('tr'),td=cell('td','No matching payments.');td.colSpan=8;tr.append(td);$('#membership-rows').append(tr)}
  const amount=rows.reduce((sum,row)=>sum+row.amount,0);
  $('#membership-summary').textContent=`${rows.length.toLocaleString()} payment lines · ${membershipMoney.format(amount)} · ${new Set(rows.map(row=>row.applyId)).size.toLocaleString()} applications`;
}
async function loadMembership(){
  if(membershipBusy)return;
  const from=$('#membership-from').value,to=$('#membership-to').value;
  if(!from||!to||from>to){$('#membership-status').textContent='Choose a valid paid-date range.';return}
  membershipBusy=true;$('#membership-load').disabled=true;$('#membership-status').className='';$('#membership-status').textContent='Loading Membership payments…';
  try{
    const response=await fetch('/api/non-power-bill-collection?'+new URLSearchParams({from,to,refresh:'1'}),{cache:'no-store'}),data=await response.json();
    if(!response.ok)throw new Error(data.error||'Unable to load Membership payments.');
    membershipData=data;$('#membership-source').textContent=data.database;
    const prior=$('#membership-category').value,categories=[...new Set(data.rows.map(row=>row.category))].sort();
    $('#membership-category').replaceChildren(new Option('All categories','all'),...categories.map(value=>new Option(value,value)));
    if(categories.includes(prior))$('#membership-category').value=prior;
    renderMembership();$('#membership-status').textContent=`Paid ${from} to ${to} · Updated ${new Date(data.generatedAt).toLocaleString()}`;
  }catch(error){$('#membership-status').className='error';$('#membership-status').textContent=error.message}
  finally{membershipBusy=false;$('#membership-load').disabled=false}
}
membershipDefaults();
$('#membership-view-form').addEventListener('submit',event=>{event.preventDefault();loadMembership()});
$('#membership-category').addEventListener('change',renderMembership);
$('#membership-search').addEventListener('input',renderMembership);
let membershipPostRows=[],membershipPostPreview=null,membershipPostBusy=false,billingUserOffices=null,billingUsersBusy=false;
async function loadMembershipBillingUsers(){
  if(billingUserOffices||billingUsersBusy)return;
  billingUsersBusy=true;
  try{
    const data=await workspaceRequest('/api/lifeline-teller-accounts');
    billingUserOffices=data.databases;
    $('#membership-billing-office').replaceChildren(new Option('Choose billing office',''),...data.databases.map(item=>new Option(item.label,item.database)));
    $('#membership-post-status').textContent='Choose a billing office and posting user, then search for payment items.';
  }catch(error){$('#membership-billing-office').replaceChildren(new Option('Unable to load offices',''));$('#membership-post-status').className='error';$('#membership-post-status').textContent=`Unable to load billing users: ${error.message}`}
  finally{billingUsersBusy=false}
}
function renderMembershipBillingUsers(){
  invalidateMembershipPreview();
  const office=billingUserOffices?.find(item=>item.database===$('#membership-billing-office').value),users=office?.accounts??[];
  $('#membership-billing-user').replaceChildren(new Option('Choose posting user',''),...users.map(item=>new Option(`${item.fullname||item.username||item.userid} · ${item.username||'no username'} · ID ${item.userid}`,item.userid)));
  $('#membership-billing-user').disabled=!office;
}
function selectedMembershipItems(){return [...$('#membership-post-rows').querySelectorAll('input[type="checkbox"]:checked')].map(input=>membershipPostRows[Number(input.value)])}
function invalidateMembershipPreview(){membershipPostPreview=null;$('#membership-preview-panel').hidden=true;$('#membership-execute').disabled=true}
function updateMembershipSelection(){
  invalidateMembershipPreview();
  const rows=selectedMembershipItems(),amount=rows.reduce((sum,row)=>sum+row.amount,0);
  $('#membership-selected-total').textContent=`${rows.length} item${rows.length===1?'':'s'} selected · ${membershipMoney.format(amount)}`;
  $('#membership-preview').disabled=membershipPostBusy||!rows.length;
}
async function findMembershipItems(){
  if(membershipPostBusy)return;
  const search=$('#membership-post-search').value.trim();if(search.length<2){$('#membership-post-status').textContent='Enter at least two characters.';return}
  membershipPostBusy=true;$('#membership-find').disabled=true;invalidateMembershipPreview();$('#membership-preview').disabled=true;$('#membership-post-status').className='';$('#membership-post-status').textContent='Searching Membership payment items…';
  try{
    const data=await workspaceRequest('/api/itdata/membership-posting/search?'+new URLSearchParams({search}));
    membershipPostRows=data.rows;
    $('#membership-post-rows').replaceChildren(...data.rows.map((item,index)=>{
      const tr=document.createElement('tr'),choice=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.value=String(index);check.setAttribute('aria-label',`Select ${item.category} for application ${item.applyId}`);check.addEventListener('change',updateMembershipSelection);choice.append(check);tr.append(choice);
      for(const value of [item.applyId,item.accountNumber,item.memberName,item.itemName,membershipMoney.format(item.amount),item.paymentDate||'—',item.orNumber||'—'])tr.append(cell('td',value));return tr;
    }));
    if(!data.rows.length){const tr=document.createElement('tr'),td=cell('td','No payment items found.');td.colSpan=8;tr.append(td);$('#membership-post-rows').append(tr)}
    $('#membership-post-status').textContent=`${data.rows.length} payment items found${data.truncated?' · Refine the search to see more':''}. Select up to 50 items to apply one date and OR.`;
    updateMembershipSelection();
  }catch(error){membershipPostRows=[];$('#membership-post-rows').replaceChildren();$('#membership-post-status').className='error';$('#membership-post-status').textContent=error.message}
  finally{membershipPostBusy=false;$('#membership-find').disabled=false;updateMembershipSelection()}
}
async function previewMembershipItems(){
  if(membershipPostBusy)return;
  const selected=selectedMembershipItems();if(!selected.length)return;
  const datePaid=$('#membership-post-date').value,orNumber=$('#membership-post-or').value.trim();
  const billingDatabase=$('#membership-billing-office').value,userId=$('#membership-billing-user').value;
  if(!billingDatabase||!userId||!datePaid||!orNumber){$('#membership-post-status').textContent='Choose a billing office, posting user, date, and OR number.';return}
  membershipPostBusy=true;$('#membership-preview').disabled=true;invalidateMembershipPreview();$('#membership-post-status').className='';$('#membership-post-status').textContent='Checking selected payment items…';
  try{
    const data=await workspaceRequest('/api/itdata/membership-posting/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selected:selected.map(({applyId,category})=>({applyId,category})),billingDatabase,userId,datePaid,orNumber})});
    membershipPostPreview=data;
    $('#membership-preview-summary').textContent=`${data.rows.length} items · ${membershipMoney.format(data.totalAmount)} · ${data.billingUser.office} user ${data.billingUser.fullname||data.billingUser.username||data.billingUser.userid} (ID ${data.billingUser.userid}) · Apply ${data.datePaid} and OR ${data.orNumber} to every selected item. Review current values below.`;
    $('#membership-preview-rows').replaceChildren(...data.rows.map(item=>{const tr=document.createElement('tr');for(const value of [item.applyId,item.accountNumber,item.itemName,membershipMoney.format(item.amount),item.paymentDate||'—',item.orNumber||'—',data.datePaid,data.orNumber])tr.append(cell('td',value));return tr}));
    $('#membership-preview-panel').hidden=false;$('#membership-execute').disabled=false;
    $('#membership-post-status').textContent=`Preview ready. Expires ${new Date(data.expiresAt).toLocaleTimeString()}.`;
  }catch(error){$('#membership-post-status').className='error';$('#membership-post-status').textContent=error.message}
  finally{membershipPostBusy=false;$('#membership-preview').disabled=!selectedMembershipItems().length}
}
async function executeMembershipItems(){
  if(membershipPostBusy||!membershipPostPreview)return;
  if(Date.now()>=Date.parse(membershipPostPreview.expiresAt)){invalidateMembershipPreview();$('#membership-post-status').textContent='Preview expired. Review the payment items again.';return}
  const token=membershipPostPreview.token;membershipPostBusy=true;$('#membership-execute').disabled=true;$('#membership-post-status').textContent='Posting selected Membership payments…';
  try{
    const data=await workspaceRequest('/api/itdata/membership-posting/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
    invalidateMembershipPreview();membershipPostBusy=false;
    $('#membership-result-summary').textContent=`Batch ${data.batchId} · ${data.billingUser.office} user ${data.billingUser.fullname||data.billingUser.username||data.billingUser.userid} · ${data.postedCount} posted · ${data.skippedCount} skipped · ${data.failedCount} failed · ${membershipMoney.format(data.totalAmount)} posted`;
    $('#membership-result-rows').replaceChildren(...data.results.map(item=>{const tr=document.createElement('tr');for(const value of [item.applyId,item.itemName,membershipMoney.format(item.amount),item.status,item.message])tr.append(cell('td',value));return tr}));
    $('#membership-result-panel').hidden=false;
    await findMembershipItems();await loadMembership();await loadMembershipHistory();
    $('#membership-post-status').className=data.ok?'':'error';$('#membership-post-status').textContent=`${data.postedCount} of ${data.itemCount} items posted · ${membershipMoney.format(data.totalAmount)} · Batch ${data.batchId}${data.auditSaved?'':' · Local audit save failed; contact an administrator'}. Review the results below.`;
  }catch(error){invalidateMembershipPreview();$('#membership-post-status').className='error';$('#membership-post-status').textContent=error.message}
  finally{membershipPostBusy=false;$('#membership-execute').disabled=true}
}
$('#membership-post-date').value=new Date().toISOString().slice(0,10);
$('#membership-post-form').addEventListener('submit',event=>{event.preventDefault();findMembershipItems()});
$('#membership-billing-office').addEventListener('change',renderMembershipBillingUsers);
$('#membership-billing-user').addEventListener('change',invalidateMembershipPreview);
$('#membership-post-date').addEventListener('input',invalidateMembershipPreview);
$('#membership-post-or').addEventListener('input',invalidateMembershipPreview);
$('#membership-preview').addEventListener('click',previewMembershipItems);
$('#membership-execute').addEventListener('click',executeMembershipItems);
let membershipHistoryBusy=false;
async function loadMembershipHistory(){
  if(membershipHistoryBusy)return;
  membershipHistoryBusy=true;$('#membership-history-refresh').disabled=true;$('#membership-history-status').className='';$('#membership-history-status').textContent='Loading recent posting batches…';
  try{
    const data=await workspaceRequest('/api/itdata/membership-posting/history');
    $('#membership-history-rows').replaceChildren(...data.batches.map(item=>{const tr=document.createElement('tr');const user=item.billingUser;for(const value of [new Date(item.postedAt).toLocaleString(),item.batchId,user?.office??'—',user?.fullname||user?.username||user?.userid||'—',item.datePaid,item.orNumber,item.postedCount,item.skippedCount,item.failedCount,membershipMoney.format(item.totalAmount)])tr.append(cell('td',value));return tr}));
    if(!data.batches.length){const tr=document.createElement('tr'),td=cell('td','No Membership posting batches yet.');td.colSpan=10;tr.append(td);$('#membership-history-rows').append(tr)}
    $('#membership-history-status').textContent=`Showing ${data.batches.length} most recent batches.`;
  }catch(error){$('#membership-history-status').className='error';$('#membership-history-status').textContent=error.message}
  finally{membershipHistoryBusy=false;$('#membership-history-refresh').disabled=false}
}
$('#membership-history-refresh').addEventListener('click',loadMembershipHistory);
let mobileFilesBusy=false;
async function loadMobileFiles(){
  if(mobileFilesBusy)return;
  mobileFilesBusy=true;$('#mobile-refresh').disabled=true;$('#mobile-transfer-status').className='';$('#mobile-transfer-status').textContent='Loading validated transfer files…';
  try{
    const data=await workspaceRequest('/api/itdata/mobile-transfer/files');
    $('#mobile-transfer-rows').replaceChildren(...data.files.map(item=>{
      const tr=document.createElement('tr'),counts=item.summary.counts,bills=Object.entries(counts).filter(([name])=>name.startsWith('billhistory')).reduce((sum,[,count])=>sum+count,0);
      for(const value of [new Date(item.createdAt).toLocaleString(),item.source,`${(item.sizeBytes/1048576).toFixed(2)} MB`,counts.reading??'—',bills,counts.reading_pay??'—'])tr.append(cell('td',value));
      const hash=cell('td',item.sha256.slice(0,16)+'…');hash.title=item.sha256;tr.append(hash);
      const action=document.createElement('td'),link=cell('a','Download database.db');link.href=`/api/itdata/mobile-transfer/files/${item.id}/download`;action.append(link);tr.append(action);return tr;
    }));
    if(!data.files.length){const tr=document.createElement('tr'),td=cell('td','No validated transfer files yet.');td.colSpan=8;tr.append(td);$('#mobile-transfer-rows').append(tr)}
    const picker=$('#mobile-send-file'),selected=picker.value;
    picker.replaceChildren(new Option('Select a staged database.db',''),...data.files.map(item=>new Option(`${new Date(item.createdAt).toLocaleString()} · ${item.source} · ${item.sha256.slice(0,8)}`,item.id)));
    if(data.files.some(item=>item.id===selected))picker.value=selected;
    $('#mobile-transfer-status').textContent=`${data.files.length} validated file${data.files.length===1?'':'s'} available.`;
  }catch(error){$('#mobile-transfer-status').className='error';$('#mobile-transfer-status').textContent=error.message}
  finally{mobileFilesBusy=false;$('#mobile-refresh').disabled=false}
}
async function uploadMobileFile(event){
  event.preventDefault();const file=$('#mobile-upload-file').files[0];if(!file)return;
  $('#mobile-upload-button').disabled=true;$('#mobile-transfer-status').className='';$('#mobile-transfer-status').textContent=`Uploading and checking ${file.name}…`;
  try{
    const response=await fetch('/api/itdata/mobile-transfer/files',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file}),data=await response.json();
    if(!response.ok)throw new Error(data.error||'Unable to upload the database file.');
    $('#mobile-upload-file').value='';await loadMobileFiles();
    $('#mobile-transfer-status').textContent=`Validated database.db · ${(data.sizeBytes/1048576).toFixed(2)} MB · SHA-256 ${data.sha256.slice(0,16)}…`;
  }catch(error){$('#mobile-transfer-status').className='error';$('#mobile-transfer-status').textContent=error.message}
  finally{$('#mobile-upload-button').disabled=false}
}
$('#mobile-upload-form').addEventListener('submit',uploadMobileFile);
$('#mobile-refresh').addEventListener('click',loadMobileFiles);
let mobileDevicesBusy=false,mobileAdbBusy=false;
async function loadMobileDevices(){
  if(mobileDevicesBusy)return;
  mobileDevicesBusy=true;$('#mobile-devices-refresh').disabled=true;
  try{
    const data=await workspaceRequest('/api/itdata/mobile-transfer/devices'),picker=$('#mobile-device'),selected=picker.value;
    picker.replaceChildren(new Option('Select a connected phone',''),...data.devices.map(item=>new Option(`${item.serial} (${item.state})`,item.state==='device'?item.serial:'')));
    if(data.devices.some(item=>item.serial===selected&&item.state==='device'))picker.value=selected;
    const ready=data.devices.filter(item=>item.state==='device').length;
    $('#mobile-device-status').className='';$('#mobile-device-status').textContent=ready?`${ready} authorized phone${ready===1?'':'s'} connected.`:'No authorized phone found. Check USB debugging and the phone authorization prompt.';
  }catch(error){$('#mobile-device').replaceChildren(new Option('ADB unavailable',''));$('#mobile-device-status').className='error';$('#mobile-device-status').textContent=error.message}
  finally{mobileDevicesBusy=false;$('#mobile-devices-refresh').disabled=false}
}
async function transferMobile(direction){
  if(mobileAdbBusy)return;
  const serial=$('#mobile-device').value,profile=$('#mobile-profile').value,fileId=$('#mobile-send-file').value;
  if(!serial){$('#mobile-device-status').className='error';$('#mobile-device-status').textContent='Select an authorized Android phone.';return}
  if(direction==='push'&&!fileId){$('#mobile-device-status').className='error';$('#mobile-device-status').textContent='Select a validated database.db to upload to the phone.';return}
  if(direction==='push'&&!window.confirm('Replace the phone app Import/database.db with the selected staged file?'))return;
  mobileAdbBusy=true;$('#mobile-pull').disabled=true;$('#mobile-push').disabled=true;
  $('#mobile-device-status').className='';$('#mobile-device-status').textContent=direction==='pull'?'Downloading and validating database.db from the phone…':'Uploading database.db to the phone and checking its SHA-256…';
  try{
    const data=await workspaceRequest(`/api/itdata/mobile-transfer/${direction}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serial,profile,fileId})});
    if(direction==='pull'){await loadMobileFiles();$('#mobile-send-file').value=data.id;$('#mobile-device-status').textContent=`Downloaded and validated database.db · SHA-256 ${data.sha256.slice(0,16)}…`}
    else $('#mobile-device-status').textContent=`Uploaded and verified database.db on ${serial} · SHA-256 ${data.sha256.slice(0,16)}…`;
  }catch(error){$('#mobile-device-status').className='error';$('#mobile-device-status').textContent=error.message}
  finally{mobileAdbBusy=false;$('#mobile-pull').disabled=false;$('#mobile-push').disabled=false}
}
$('#mobile-devices-refresh').addEventListener('click',loadMobileDevices);
$('#mobile-pull').addEventListener('click',()=>transferMobile('pull'));
$('#mobile-push').addEventListener('click',()=>transferMobile('push'));
tabFromHash();
