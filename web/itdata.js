const $=selector=>document.querySelector(selector);
let page=1,pages=1,search='',loading=false;
function cell(tag,value){const node=document.createElement(tag);node.textContent=value??'—';return node}
function controls(){for(const id of ['run','clear'])$('#'+id).disabled=loading;$('#previous').disabled=loading||page<=1;$('#next').disabled=loading||page>=pages}
async function load(targetPage=1){
  loading=true;controls();$('#status').className='';$('#status').textContent='Loading user records…';
  try{
    const response=await fetch('/api/itdata?'+new URLSearchParams({search,page:String(targetPage)}));
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load user records.');
    page=data.page;pages=data.pages;$('#source').textContent=`${data.database}.${data.table}`;
    const header=document.createElement('tr');for(const column of data.columns)header.append(cell('th',column));$('#columns').replaceChildren(header);
    const rows=data.rows.map(values=>{const row=document.createElement('tr');for(const value of values)row.append(cell('td',value));return row});
    if(!rows.length){const row=document.createElement('tr'),empty=cell('td','No matching user records.');empty.colSpan=data.columns.length;row.append(empty);rows.push(row)}
    $('#rows').replaceChildren(...rows);$('#page').textContent=`Page ${page.toLocaleString()} of ${pages.toLocaleString()}`;
    const first=data.total?(page-1)*data.pageSize+1:0,last=Math.min(page*data.pageSize,data.total);
    $('#status').textContent=`${data.total.toLocaleString()} matching records · Showing ${first.toLocaleString()}–${last.toLocaleString()}`;
  }catch(error){$('#status').className='error';$('#status').textContent=error.message;$('#columns').replaceChildren();$('#rows').replaceChildren();$('#page').textContent='';page=1;pages=1}
  finally{loading=false;controls()}
}
$('#search-form').addEventListener('submit',event=>{event.preventDefault();if(loading)return;search=$('#search').value.trim();load()});
$('#clear').addEventListener('click',()=>{$('#search').value='';search='';load()});
$('#previous').addEventListener('click',()=>load(page-1));$('#next').addEventListener('click',()=>load(page+1));load();

const tabs=[...document.querySelectorAll('.it-tabs [role="tab"]')];
function selectTab(id){
  const selected=tabs.find(tab=>tab.id===id)||tabs[0];
  for(const tab of tabs){const active=tab===selected;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!active}
}
function tabFromHash(){selectTab(location.hash==='#mysqlworkspace'?'mysqlworkspace-tab':'records-tab')}
for(const [index,tab] of tabs.entries()){
  tab.addEventListener('click',()=>{const hash=tab.id==='mysqlworkspace-tab'?'#mysqlworkspace':'#records';history.replaceState(null,'',hash);selectTab(tab.id)});
  tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();tabs[next].focus();tabs[next].click()});
}
window.addEventListener('hashchange',tabFromHash);tabFromHash();

let workspaceResult=null,schemaLoaded=false,queryBusy=false,workspaceTables=[],queryPreview=null;
const quoteIdentifier=value=>'`'+value.replaceAll('`','``')+'`';
async function workspaceRequest(url,options){const response=await fetch(url,{cache:'no-store',...options}),data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed.');return data}
async function loadSchema(){
  resetQueryTables();$('#schema-refresh').disabled=true;$('#schema-status').textContent='Loading tables…';$('#schema-tables').replaceChildren();
  try{if(!$('#workspace-connection').value)await loadConnections();if(!$('#workspace-database').value)await loadDatabases();const data=await workspaceRequest('/api/itdata/workspace/schema?'+new URLSearchParams({database:$('#workspace-database').value,connection:$('#workspace-connection').value}));$('#schema-status').textContent=`${data.database} · ${data.tables.length} tables`;$('#schema-tables').replaceChildren();workspaceTables=data.tables;$('#query-table').replaceChildren(new Option('Choose a table',''),...data.tables.map(table=>new Option(table.name,table.name)));$('#query-table').disabled=!data.tables.length;
    for(const table of data.tables){const details=document.createElement('details'),summary=cell('summary',table.name),preview=cell('button','Build SELECT');preview.type='button';preview.addEventListener('click',()=>{$('#query-table').value=table.name;updateTemplateButtons();buildQueryTemplate('select')});details.append(summary,preview);for(const column of table.columns){const button=cell('button',`${column.name} · ${column.type}`);button.type='button';button.className='workspace-column';button.title='Insert column at cursor';button.addEventListener('click',()=>{const editor=$('#query-editor');invalidatePreview();editor.setRangeText(quoteIdentifier(column.name),editor.selectionStart,editor.selectionEnd,'end');editor.focus()});details.append(button)}$('#schema-tables').append(details)}schemaLoaded=true;
  }catch(error){$('#schema-status').textContent=error.message;schemaLoaded=false}finally{$('#schema-refresh').disabled=false}
}
async function runQuery(){
  if(queryBusy)return;if(!queryPreview||queryPreview.source!==JSON.stringify(currentQuery())||Date.now()>=Date.parse(queryPreview.expiresAt)){invalidatePreview();$('#query-status').textContent='Preview this query before running it.';return}const approved={...currentQuery(),previewToken:queryPreview.token};invalidatePreview();if(!$('#workspace-database').value){$('#query-status').textContent='Choose an available database first.';return}queryBusy=true;$('#workspace-database').disabled=true;$('#workspace-connection').disabled=true;$('#query-run').disabled=true;$('#query-export').disabled=true;$('#query-status').textContent='Running query…';$('#query-columns').replaceChildren();$('#query-rows').replaceChildren();workspaceResult=null;
  try{const data=await workspaceRequest('/api/itdata/workspace/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(approved)});workspaceResult=data;const header=document.createElement('tr');for(const column of data.columns)header.append(cell('th',column));$('#query-columns').replaceChildren(header);for(const values of data.rows){const row=document.createElement('tr');for(const value of values)row.append(cell('td',value));$('#query-rows').append(row)}$('#query-status').textContent=`${data.database} · ${data.rows.length} rows · ${data.durationMs} ms${data.truncated?' · Results limited to 500 rows; narrow your query.':''}`;$('#query-export').disabled=!data.columns.length;
  }catch(error){$('#query-status').textContent=error.message}finally{queryBusy=false;$('#query-run').disabled=true;$('#workspace-database').disabled=false;$('#workspace-connection').disabled=false}
}
let savedQueries=[];try{const saved=JSON.parse(localStorage.getItem('itdata-workspace-queries')||'[]');if(Array.isArray(saved))savedQueries=saved.filter(item=>typeof item.name==='string'&&typeof item.query==='string')}catch{}
function renderSaved(){const select=$('#query-saved');select.replaceChildren(new Option('Choose a saved query',''));savedQueries.forEach((item,index)=>select.add(new Option(item.name,String(index))))}
$('#query-save').addEventListener('click',()=>{const name=prompt('Query name');if(!name?.trim())return;const item={name:name.trim(),query:$('#query-editor').value,connection:$('#workspace-connection').value,database:$('#workspace-database').value},index=savedQueries.findIndex(value=>value.name===item.name),next=[...savedQueries];if(index<0)next.push(item);else next[index]=item;try{localStorage.setItem('itdata-workspace-queries',JSON.stringify(next));savedQueries=next;renderSaved();$('#query-status').textContent='Query saved in this browser.'}catch{$('#query-status').textContent='Unable to save query in this browser.'}});
$('#query-saved').addEventListener('change',async()=>{if($('#query-saved').value!==''){const saved=savedQueries[Number($('#query-saved').value)];invalidatePreview();$('#query-editor').value=saved.query;try{if(saved.connection&&saved.connection!==$('#workspace-connection').value){const option=[...$('#workspace-connection').options].find(option=>option.value===saved.connection&&!option.disabled);if(!option)throw new Error('The saved connection is unavailable.');$('#workspace-connection').value=saved.connection;clearWorkspace();await loadDatabases()}if(saved.database&&[...$('#workspace-database').options].some(option=>option.value===saved.database)){$('#workspace-database').value=saved.database;databaseChanged()}}catch(error){$('#query-status').textContent=error.message}}});
$('#query-export').addEventListener('click',()=>{if(!workspaceResult)return;const csv=[workspaceResult.columns,...workspaceResult.rows].map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n'),url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='mysqlworkspace-results.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
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
function databaseChanged(){invalidatePreview();schemaLoaded=false;workspaceResult=null;$('#query-columns').replaceChildren();$('#query-rows').replaceChildren();$('#query-export').disabled=true;$('#query-status').textContent='Database changed. Choose a table or update your SQL before running.';loadSchema()}
$('#workspace-database').addEventListener('change',databaseChanged);

async function loadConnections(){
  const data=await workspaceRequest('/api/itdata/workspace/connections'),select=$('#workspace-connection');
  select.replaceChildren(...data.connections.map(item=>{const option=new Option(`${item.label} · ${item.host}:${item.port}${item.enabled?'':' (disabled)'}`,item.id);option.disabled=!item.enabled;return option}));
  select.value=data.connections.find(item=>item.id==='itProgram'&&item.enabled)?.id||data.connections.find(item=>item.enabled)?.id||'';select.disabled=!select.value;
  if(!select.value)throw new Error('Enable a connection in Database Settings first.');
}
function clearWorkspace(){invalidatePreview();$('#database-count').textContent='';resetQueryTables();schemaLoaded=false;workspaceResult=null;$('#workspace-database').replaceChildren(new Option('Choose a database',''));$('#workspace-database').disabled=true;$('#schema-tables').replaceChildren();$('#query-columns').replaceChildren();$('#query-rows').replaceChildren();$('#query-export').disabled=true}
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
  try{const data=await workspaceRequest('/api/itdata/workspace/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});if(JSON.stringify(currentQuery())!==JSON.stringify(input))return;queryPreview={...data,source:JSON.stringify(input)};$('#query-run').disabled=false;$('#query-status').textContent='Preview ready. Review it, then click Run previewed query.'}catch(error){$('#query-status').textContent=error.message}finally{$('#query-preview').disabled=false}
}
$('#query-preview').addEventListener('click',previewQuery);$('#query-editor').addEventListener('input',invalidatePreview);
