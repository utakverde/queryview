import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const settings=JSON.parse(await fs.readFile(path.join(root,'connection.settings.json'),'utf8'));
const config=JSON.parse(await fs.readFile(path.join(root,'consumer_growth_kwh_forecast','builder.config.json'),'utf8'));
const mysql=config.mysql??{};
const mysqlExe=settings.executable||mysql.executable||'mysql.exe';
const mysqlArgs=['-h',settings.host||mysql.host||'localhost',...(settings.port||mysql.port?['-P',String(settings.port||mysql.port)]:[]),'-u',settings.user||mysql.user||'root',`-p${settings.password??mysql.password??''}`,'-N','-B'];
const audit=settings.ecpayAudit??{};
const auditDb=audit.database||'ecpay_audit';
const auditExe=audit.executable||'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe';
const auditArgs=['-h',audit.host||'127.0.0.1','-P',String(audit.port||3310),'-u',audit.user||settings.user||'root',`-p${audit.password??settings.password??''}`,'-N','-B'];
const run=(exe,args,sql)=>new Promise((resolve,reject)=>{const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']}),stdout=[],stderr=[];child.stdout.on('data',chunk=>stdout.push(chunk));child.stderr.on('data',chunk=>stderr.push(chunk));child.on('error',reject);child.on('close',code=>code===0?resolve(Buffer.concat(stdout).toString().trim()):reject(new Error(Buffer.concat(stderr).toString().trim()||`mysql exited with code ${code}`)));child.stdin.end(sql)});
const escape=value=>String(value??'').replaceAll('\\','\\\\').replaceAll("'","''");
const parse=(output,keys)=>output?output.split(/\r?\n/).filter(Boolean).map(line=>Object.fromEntries(line.split('\t').map((value,index)=>[keys[index],value==='NULL'?null:value]))):[];

const batchId=await run(auditExe,auditArgs,`SELECT batch_id FROM \`${auditDb}\`.post_log_v3 WHERE created_at>COALESCE((SELECT reset_at FROM \`${auditDb}\`.reset_state WHERE id=1),'1000-01-01') ORDER BY created_at DESC,id DESC LIMIT 1`);
if(!batchId)throw new Error('There is no active ECPay test batch to reset.');
const auditOutput=await run(auditExe,auditArgs,`SELECT id,batch_id,DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ'),status,reason,database_name,office,account_number,consumer_name,bill_month,amount,COALESCE(DATE_FORMAT(source_date_paid,'%Y-%m-%d'),''),DATE_FORMAT(date_paid,'%Y-%m-%d'),source_reference,bill_count,updated_count FROM \`${auditDb}\`.post_log_v3 WHERE batch_id='${escape(batchId)}' ORDER BY batch_row`);
const auditRows=parse(auditOutput,['id','batchId','createdAt','status','reason','database','office','accountNumber','name','billMonth','amount','sourceDatePaid','datePaid','sourceReference','billCount','updatedCount']);
const posted=auditRows.filter(row=>row.status==='success');
const groups=new Map();
for(const row of posted){const match=String(row.reason).match(/;\s*([^;]+)$/);if(!match)throw new Error(`Cannot identify the receipt for audit row ${row.id}.`);const key=`${row.database}\t${row.datePaid}\t${match[1]}`,group=groups.get(key)??{database:row.database,datePaid:row.datePaid,orCollection:match[1],accounts:new Set};group.accounts.add(row.accountNumber);groups.set(key,group)}
const billingRows=[];
for(const group of groups.values()){
  const accounts=[...group.accounts].map(value=>`'${escape(value)}'`).join(',');
  const sql=`SELECT Entry,AccountNumber,BillMonth,COALESCE(flag_paid,''),COALESCE(DATE_FORMAT(date_paid,'%Y-%m-%d'),''),COALESCE(CAST(collector_code AS CHAR),''),COALESCE(ORCollection,''),TotalBill FROM billhistory WHERE AccountNumber IN (${accounts}) AND flag_paid='Y' AND date_paid='${group.datePaid}' AND ORCollection='${escape(group.orCollection)}' ORDER BY Entry`;
  const rows=parse(await run(mysqlExe,[...mysqlArgs,group.database],sql),['entry','accountNumber','billMonth','flagPaid','datePaid','collectorCode','orCollection','totalBill']).map(row=>({database:group.database,...row}));
  billingRows.push(...rows);
}
const expected=posted.reduce((sum,row)=>sum+Number(row.updatedCount||0),0);
if(billingRows.length!==expected)throw new Error(`Safety check failed: expected ${expected} bill rows but found ${billingRows.length}. Nothing was changed.`);
await fs.mkdir(path.join(root,'outputs','ecpay-reset-backups'),{recursive:true});
const backupPath=path.join(root,'outputs','ecpay-reset-backups',`${batchId}.json`);
await fs.writeFile(backupPath,JSON.stringify({resetAt:new Date().toISOString(),batchId,auditRows,billingRows},null,2));
for(const [database,rows] of Map.groupBy(billingRows,row=>row.database)){
  const entries=rows.map(row=>Number(row.entry));
  if(entries.some(entry=>!Number.isSafeInteger(entry)))throw new Error(`Invalid billing entry detected in ${database}.`);
  const sql=`START TRANSACTION; UPDATE billhistory SET flag_paid=NULL,date_paid=NULL,collector_code=NULL,ORCollection=NULL WHERE Entry IN (${entries.join(',')}) AND flag_paid='Y'; SELECT ROW_COUNT(); COMMIT;`;
  const changed=Number((await run(mysqlExe,[...mysqlArgs,database],sql)).split(/\r?\n/).filter(Boolean).at(-1));
  if(changed!==rows.length)throw new Error(`Reset count mismatch in ${database}: expected ${rows.length}, changed ${changed}.`);
}
const resetAt=new Date().toISOString().slice(0,23).replace('T',' ');
await run(auditExe,auditArgs,`INSERT INTO \`${auditDb}\`.reset_state(id,reset_at) VALUES(1,'${resetAt}') AS new ON DUPLICATE KEY UPDATE reset_at=new.reset_at`);
const sqlite=new DatabaseSync(path.join(root,'portable_data','reporting_cache.sqlite'));
sqlite.exec("BEGIN; DELETE FROM ecpay_post_log; DELETE FROM cache_entry WHERE category IN ('ecpay-unpaid','collector-report'); COMMIT;");
sqlite.close();
console.log(JSON.stringify({ok:true,batchId,auditRows:auditRows.length,billingRows:billingRows.length,backupPath}));
