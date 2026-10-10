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
