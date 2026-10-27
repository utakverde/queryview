const resultCache=new Map(),cacheTtlMs=5*60*1000,maxCachedReports=2;
export async function delinquentReport(filters, databases, query) {
  const key=JSON.stringify({database:filters.database,source:filters.source,area:filters.area,book:filters.book,minBills:filters.minBills,minAmount:filters.minAmount});
  const cached=resultCache.get(key);
  if(cached&&cached.expiresAt>Date.now())return cached.result;
  if(cached)resultCache.delete(key);
  const selected=databases.filter(item=>filters.database==='all'||item.database===filters.database);
  const sources=filters.source==='all'?[['regular',''],['individual','_bi'],['mother','_bm']]:[[filters.source,{regular:'',individual:'_bi',mother:'_bm'}[filters.source]]];
  const read=async(database,statement,keys)=>(await query(database,statement)).split(/\r?\n/).filter(Boolean).map(line=>Object.fromEntries(line.split('\t').map((value,index)=>[keys[index],value==='NULL'?'':value])));
  const groups=await Promise.all(selected.flatMap(office=>sources.map(async([source,suffix])=>{
    const location=[filters.area?`COALESCE(m.Area,b.area)='${filters.area}'`:'',filters.book?`COALESCE(m.Book,b.book)='${filters.book}'`:''].filter(Boolean).map(value=>' AND '+value).join('');
    const statement=`SELECT b.Code,COALESCE(m.AccountNumber,b.account),COALESCE(m.Name,b.name),COALESCE(m.Address,''),COALESCE(m.Area,b.area),COALESCE(m.Book,b.book),COALESCE(m.RateCode,b.rateCode),COALESCE(m.ConnStatus,''),b.unpaidBills,b.unpaidKwh,b.unpaidAmount,b.oldestMonth,b.latestMonth,b.monthsUnpaid FROM (SELECT Code,MAX(AccountNumber) account,MAX(Name) name,MAX(Area) area,MAX(Book) book,MAX(RateCode) rateCode,COUNT(*) unpaidBills,COALESCE(SUM(KilowattHour),0) unpaidKwh,COALESCE(SUM(TotalBill),0) unpaidAmount,MIN(CONCAT('20',RIGHT(BillMonth,2),'-',LEFT(BillMonth,2))) oldestMonth,MAX(CONCAT('20',RIGHT(BillMonth,2),'-',LEFT(BillMonth,2))) latestMonth,COUNT(DISTINCT BillMonth) monthsUnpaid FROM billhistory${suffix} WHERE UPPER(TRIM(IFNULL(flag_paid,'')))<>'Y' AND IFNULL(TotalBill,0)>0 GROUP BY Code HAVING COUNT(*)>=${filters.minBills} AND SUM(TotalBill)>0 AND SUM(TotalBill)>=${filters.minAmount}) b LEFT JOIN master${suffix} m ON m.Code=b.Code WHERE 1=1 ${location} ORDER BY b.unpaidAmount DESC`;
    const keys=['code','account','name','address','area','book','rateCode','status','unpaidBills','unpaidKwh','unpaidAmount','oldestMonth','latestMonth','monthsUnpaid'];
    return (await read(office.database,statement,keys)).map(row=>({office:office.label,source,...row,unpaidBills:Number(row.unpaidBills),unpaidKwh:Number(row.unpaidKwh),unpaidAmount:Number(row.unpaidAmount),monthsUnpaid:Number(row.monthsUnpaid)}));
  })));
  const rows=groups.flat().sort((a,b)=>b.unpaidAmount-a.unpaidAmount),routeMap=new Map();
  for(const row of rows){const key=JSON.stringify([row.office,row.source,row.area,row.book]);if(!routeMap.has(key))routeMap.set(key,{office:row.office,source:row.source,area:row.area,book:row.book,accounts:0,unpaidBills:0,unpaidKwh:0,unpaidAmount:0});const item=routeMap.get(key);item.accounts++;item.unpaidBills+=row.unpaidBills;item.unpaidKwh+=row.unpaidKwh;item.unpaidAmount+=row.unpaidAmount}
  const result={generatedAt:new Date().toISOString(),filters,summary:[...routeMap.values()].sort((a,b)=>b.unpaidAmount-a.unpaidAmount),rows,totals:{accounts:rows.length,bills:rows.reduce((s,r)=>s+r.unpaidBills,0),kwh:rows.reduce((s,r)=>s+r.unpaidKwh,0),amount:rows.reduce((s,r)=>s+r.unpaidAmount,0)}};
  resultCache.set(key,{expiresAt:Date.now()+cacheTtlMs,result});
  while(resultCache.size>maxCachedReports)resultCache.delete(resultCache.keys().next().value);
  return result;
}
