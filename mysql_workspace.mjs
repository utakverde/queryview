export function validateWorkspaceQueries(value) {
  const input=String(value??'').trim();
  if(!input||input.length>20000)throw new Error('Enter SELECT queries of up to 20,000 characters total.');
  const queries=[];let start=0,tokens='',quote='';
  const finish=end=>{
    const query=input.slice(start,end).trim();
    if(!query)throw new Error('Remove empty statements between semicolons.');
    if(!/^SELECT\b/i.test(tokens.trim())||/\b(INTO|OUTFILE|DUMPFILE|FOR|LOCK|PROCEDURE|SLEEP|BENCHMARK|LOAD_FILE|GET_LOCK|RELEASE_LOCK)\b|@/i.test(tokens))throw new Error('Use read-only SELECT statements without file access, locks, or variables.');
    queries.push(query);tokens='';start=end+1;
    if(queries.length>5)throw new Error('Run up to five SELECT statements at a time.');
  };
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quote){if(c==='\\')throw new Error('Use doubled quotes instead of backslash escapes.');if(c===quote){if(input[i+1]===quote)i++;else quote=''}continue}
    if(c==="'"||c==='"'||c==='`'){quote=c;tokens+=' ';continue}
    if(c==='\\'||c==='#'||(c==='-'&&input[i+1]==='-')||(c==='/'&&input[i+1]==='*'))throw new Error('Use SELECT statements without comments or client commands.');
    if(c===';'){finish(i);continue}
    tokens+=c;
  }
  if(quote)throw new Error('Close all quoted values and identifiers.');
  if(input.slice(start).trim())finish(input.length);
  return queries;
}
export function validateWorkspaceQuery(value){
  const queries=validateWorkspaceQueries(value);
  if(queries.length!==1)throw new Error('Use one SELECT statement.');
  return queries[0];
}
export function parseWorkspaceOutput(output){
  const decode=value=>value==='NULL'?null:value.replace(/\\([0ntbr\\])/g,(_,c)=>({'0':'\0',n:'\n',t:'\t',b:'\b',r:'\r','\\':'\\'}[c]));
  const lines=output.replace(/[\r\n]+$/,'').split(/\r?\n/);
  return {columns:lines[0]?lines[0].split('\t').map(decode):[],rows:lines.slice(1).map(line=>line.split('\t').map(decode))};
}
