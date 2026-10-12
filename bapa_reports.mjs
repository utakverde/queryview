export async function bapaReport(databases, query) {
  const groups = await Promise.all(databases.map(async office => {
    // Aggregate individuals before joining: multiple mothers can share a route.
    const output = await query(office.database, `SELECT bm.Code,bm.AccountNumber,bm.Name,bm.Address,bm.Area,bm.Book,bm.Serial,bm.ConnStatus,
      COALESCE(bi.individuals,0),COALESCE(bi.active,0),COALESCE(bi.disconnected,0),routes.mothers
      FROM master_bm bm
      LEFT JOIN (SELECT Area,Book,COUNT(DISTINCT Code) individuals,
        COUNT(DISTINCT CASE WHEN ConnStatus='A' THEN Code END) active,
        COUNT(DISTINCT CASE WHEN ConnStatus='D' THEN Code END) disconnected
        FROM master_bi GROUP BY Area,Book) bi ON bi.Area=bm.Area AND bi.Book=bm.Book
      LEFT JOIN (SELECT Area,Book,COUNT(*) mothers FROM master_bm GROUP BY Area,Book) routes
        ON routes.Area=bm.Area AND routes.Book=bm.Book
      ORDER BY bm.Area,bm.Book,bm.AccountNumber,bm.Code`);
    const keys = ['code','accountNumber','name','address','area','book','serial','status','individuals','active','disconnected','routeMothers'];
    const rows = output.split(/\r?\n/).filter(Boolean).map(line => {
      const values = line.split('\t');
      const row = Object.fromEntries(keys.map((key,index) => [key,values[index]==='NULL'?'':values[index]??'']));
      for (const key of ['individuals','active','disconnected','routeMothers']) row[key]=Number(row[key]||0);
      return {...row,office:office.label,database:office.database};
    });
    const totals = (await query(office.database, `SELECT COUNT(DISTINCT bi.Code),
      COUNT(DISTINCT CASE WHEN EXISTS(SELECT 1 FROM master_bm bm WHERE bm.Area=bi.Area AND bm.Book=bi.Book) THEN bi.Code END),
      COUNT(DISTINCT CASE WHEN bi.ConnStatus='A' THEN bi.Code END),
      COUNT(DISTINCT CASE WHEN bi.ConnStatus='D' THEN bi.Code END)
      FROM master_bi bi`)).trim().split('\t').map(Number);
    return {office:office.label,database:office.database,mothers:rows.length,individuals:totals[0]||0,linkedIndividuals:totals[1]||0,unmatchedIndividuals:(totals[0]||0)-(totals[1]||0),activeIndividuals:totals[2]||0,disconnectedIndividuals:totals[3]||0,rows};
  }));
  return {generatedAt:new Date().toISOString(),linkMethod:'Area and Book within each database',
    offices:groups.map(({rows,...summary})=>summary),rows:groups.flatMap(group=>group.rows)};
}
