export async function routeReport(f, databases, query) {
  const suffix={regular:'',individual:'_bi',mother:'_bm'}[f.source];
  const date=new Date(Date.UTC(2000+Number(f.month.slice(2)),Number(f.month.slice(0,2))-2,1));
  const previous=String(date.getUTCMonth()+1).padStart(2,'0')+String(date.getUTCFullYear()).slice(2);
  const read=async(db,sql,keys)=>(await query(db,sql)).split(/\r?\n/).filter(Boolean).map(line=>Object.fromEntries(line.split('\t').map((v,i)=>[keys[i],v==='NULL'?'':v])));
  const selected=databases.filter(d=>f.database==='all'||d.database===f.database);
  const groups=await Promise.all(selected.map(async office=>{
    const loc=alias=>[f.area?`${alias}.Area='${f.area}'`:'',f.book?`${alias}.Book='${f.book}'`:''].filter(Boolean).map(x=>' AND '+x).join('');
    const range=col=>`${col}>='${f.from}' AND ${col}<DATE_ADD('${f.to}',INTERVAL 1 DAY)`;
    let accounts;
    if(f.mode==='reading'){
      const masters=await read(office.database,`SELECT m.Code,m.AccountNumber,m.Name,m.Address,m.Area,m.Book,m.ConnStatus,IF(m.ConnStatus='A' AND (m.NewConnectionDate IS NULL OR m.NewConnectionDate='0000-00-00' OR m.NewConnectionDate<DATE_ADD('${f.to}',INTERVAL 1 DAY)),1,0),IF(${range('m.NewConnectionDate')},1,0) FROM master${suffix} m WHERE 1=1 ${loc('m')}`,['code','account','name','address','area','book','status','eligible','newConnections']);
      const bills=await read(office.database,`SELECT Code,SUM(IF(BillMonth='${previous}',1,0)),SUM(IF(BillMonth='${f.month}',1,0)),SUM(IF(BillMonth='${f.month}' AND UPPER(TRIM(IFNULL(flag_paid,'')))<>'Y' AND IFNULL(TotalBill,0)>0,1,0)),SUM(IF(BillMonth='${f.month}' AND UPPER(TRIM(IFNULL(flag_paid,'')))<>'Y' AND IFNULL(TotalBill,0)>0,TotalBill,0)) FROM billhistory${suffix} WHERE BillMonth IN ('${previous}','${f.month}') GROUP BY Code`,['code','previousBills','currentBills','unpaidBills','unpaidAmount']);
      const byCode=new Map(bills.map(b=>[b.code,b]));
      accounts=masters.map(m=>{const b=byCode.get(m.code)??{};return {...m,...b,unbilled:Number(m.eligible)===1&&!Number(b.currentBills)?1:0}});
    }else{
      // Aggregate by account before joining master so repeated bill months cannot multiply totals.
      accounts=await read(office.database,`SELECT b.Code,COALESCE(m.AccountNumber,b.account),COALESCE(m.Name,b.name),COALESCE(m.Address,''),COALESCE(m.Area,b.area),COALESCE(m.Book,b.book),COALESCE(m.ConnStatus,''),b.unpaidBills,b.unpaidAmount,b.paidBills,b.paidAmount,b.oldestMonth,b.latestMonth FROM (SELECT Code,MAX(AccountNumber) account,MAX(Name) name,MAX(Area) area,MAX(Book) book,SUM(IF(UPPER(TRIM(IFNULL(flag_paid,'')))<>'Y' AND IFNULL(TotalBill,0)>0,1,0)) unpaidBills,SUM(IF(UPPER(TRIM(IFNULL(flag_paid,'')))<>'Y' AND IFNULL(TotalBill,0)>0,TotalBill,0)) unpaidAmount,SUM(IF(UPPER(TRIM(IFNULL(flag_paid,'')))='Y' AND ${range('date_paid')},1,0)) paidBills,SUM(IF(UPPER(TRIM(IFNULL(flag_paid,'')))='Y' AND ${range('date_paid')},IFNULL(TotalBill,0),0)) paidAmount,MIN(IF(UPPER(TRIM(IFNULL(flag_paid,'')))<>'Y' AND IFNULL(TotalBill,0)>0,CONCAT('20',RIGHT(BillMonth,2),'-',LEFT(BillMonth,2)),NULL)) oldestMonth,MAX(IF(UPPER(TRIM(IFNULL(flag_paid,'')))<>'Y' AND IFNULL(TotalBill,0)>0,CONCAT('20',RIGHT(BillMonth,2),'-',LEFT(BillMonth,2)),NULL)) latestMonth FROM billhistory${suffix} GROUP BY Code) b LEFT JOIN master${suffix} m ON m.Code=b.Code WHERE (b.unpaidBills>0 OR b.paidBills>0) ${f.area?`AND COALESCE(m.Area,b.area)='${f.area}'`:''} ${f.book?`AND COALESCE(m.Book,b.book)='${f.book}'`:''}`,['code','account','name','address','area','book','status','unpaidBills','unpaidAmount','paidBills','paidAmount','oldestMonth','latestMonth']);
    }
    const routes=new Map();
    const route=(area,book)=>{const key=JSON.stringify([area,book]);if(!routes.has(key))routes.set(key,{office:office.label,area,book,previousBills:0,currentBills:0,unbilled:0,newConnections:0,disconnections:0,reconnections:0,meterChanges:0,unpaidBills:0,unpaidAmount:0,unpaidAccounts:0,paidBills:0,paidAmount:0});return routes.get(key)};
    for(const a of accounts){a.office=office.label;const r=route(a.area,a.book);for(const k of ['previousBills','currentBills','unbilled','newConnections','unpaidBills','unpaidAmount','paidBills','paidAmount']){a[k]=Number(a[k]||0);r[k]+=a[k]}if(a.unpaidBills>0)r.unpaidAccounts++}
    if(f.mode==='reading')for(const [table,key] of [['disconnection','disconnections'],['reconnection','reconnections'],['changemeter','meterChanges']]){
      const events=await read(office.database,`SELECT x.Area,x.Book,COUNT(*) FROM ${table}${suffix} x WHERE ${range('x.Date')} ${loc('x')} GROUP BY x.Area,x.Book`,['area','book','count']);for(const e of events)route(e.area,e.book)[key]+=Number(e.count);
    }
    return {routes:[...routes.values()],accounts:accounts.filter(a=>f.mode==='reading'?(a.unbilled>0||a.unpaidBills>0):a.unpaidBills>0)};
  }));
  return {filters:f,previousMonth:previous,generatedAt:new Date().toISOString(),routes:groups.flatMap(g=>g.routes),accounts:groups.flatMap(g=>g.accounts)};
}
