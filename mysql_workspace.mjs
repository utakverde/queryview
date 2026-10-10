export function validateWorkspaceQuery(value) {
  const query=String(value??'').trim().replace(/;\s*$/, '');
  if(!query||query.length>20000)throw new Error('Enter a SELECT query of up to 20,000 characters.');
  let tokens='',quote='';
  for(let i=0;i<query.length;i++){
    const c=query[i];
    if(quote){if(c==='\\')throw new Error('Use doubled quotes instead of backslash escapes.');if(c===quote){if(query[i+1]===quote)i++;else quote=''}continue}
    if(c==="'"||c==='"'||c==='`'){quote=c;tokens+=' ';continue}
    if(c===';'||c==='\\'||c==='#'||(c==='-'&&query[i+1]==='-')||(c==='/'&&query[i+1]==='*'))throw new Error('Use one SELECT statement without comments or client commands.');
    tokens+=c;
  }
  if(quote)throw new Error('Close all quoted values and identifiers.');
  if(!/^SELECT\b/i.test(tokens)||/\b(INTO|OUTFILE|DUMPFILE|FOR|LOCK|PROCEDURE|SLEEP|BENCHMARK|LOAD_FILE|GET_LOCK|RELEASE_LOCK)\b|@/i.test(tokens))throw new Error('Use a read-only SELECT query without file access, locks, or variables.');
  return query;
}
export function parseWorkspaceOutput(output){
  const decode=value=>value==='NULL'?null:value.replace(/\\([0ntbr\\])/g,(_,c)=>({'0':'\0',n:'\n',t:'\t',b:'\b',r:'\r','\\':'\\'}[c]));
  const lines=output.replace(/[\r\n]+$/,'').split(/\r?\n/);
  return {columns:lines[0]?lines[0].split('\t').map(decode):[],rows:lines.slice(1).map(line=>line.split('\t').map(decode))};
}
