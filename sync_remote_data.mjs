const baseUrl=(process.env.LOCAL_REPORT_URL??"http://127.0.0.1:3001").replace(/\/$/,"");
const [billMonth,dateFrom,dateTo]=process.argv.slice(2);

function iso(date){return date.toISOString().slice(0,10)}
function completedCycle(){
  const now=new Date(),end=new Date(Date.UTC(now.getFullYear(),now.getMonth(),25));
  if(now.getDate()<26)end.setUTCMonth(end.getUTCMonth()-1);
  const start=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-1,26));
  return{from:iso(start),to:iso(end)};
}
async function get(path,label){
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const response=await fetch(`${baseUrl}${path}`,{signal:AbortSignal.timeout(300000)}),body=await response.json();
      if(!response.ok)throw new Error(body.error??response.statusText);
      console.log(`Saved: ${label}`);
      return body;
    }catch(error){
      lastError=error;
      if(attempt<3){console.log(`Retrying: ${label} (${attempt}/3)`);await new Promise(resolve=>setTimeout(resolve,attempt*1500))}
    }
  }
  throw new Error(`${label}: ${lastError.message}`);
}
async function runLimited(jobs,limit=2){
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(limit,jobs.length)},async()=>{while(cursor<jobs.length){const job=jobs[cursor++];await get(job.path,job.label)}}));
}

try{
  await get("/api/health","server health");
  const catalog=await get("/api/catalog","report catalog");
  await get("/api/bill-months?refresh=1","bill-month catalog");
  const jobs=[];
  for(const report of catalog.reports){
    const targets=report.scope==="all"?["all"]:catalog.databases.map(({database})=>database);
    for(const database of targets)jobs.push({label:`${report.label} - ${database}`,path:`/api/reports/${report.id}?database=${encodeURIComponent(database)}&refresh=1`});
  }
  await runLimited(jobs);
  const cycle=billMonth&&dateFrom&&dateTo?{from:dateFrom,to:dateTo}:completedCycle();
  await get(`/api/collection-components?from=${cycle.from}&to=${cycle.to}&database=all&group=all&refresh=1`,`Collection Components ${cycle.from} to ${cycle.to}`);
  if(billMonth||dateFrom||dateTo){
    if(!/^\d{4}$/.test(billMonth??"")||!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom??"")||!/^\d{4}-\d{2}-\d{2}$/.test(dateTo??"")||dateFrom>dateTo)throw new Error("Use: sync_remote_data.bat MMYY YYYY-MM-DD YYYY-MM-DD");
    await get(`/api/collection-monitoring?billMonth=${billMonth}&from=${dateFrom}&to=${dateTo}&refresh=1`,`Collection Monitoring ${billMonth}`);
  }
  console.log("Remote-to-local sync completed successfully.");
}catch(error){
  console.error(`Sync failed: ${error.message}`);
  process.exitCode=1;
}
