(()=>{
  const select=document.querySelector('#theme-select');
  if(!select)return;
  const stored=(()=>{try{return localStorage.getItem('samelco-theme')}catch{return null}})();
  const apply=theme=>{const value=theme==='dark'?'dark':'normal';document.documentElement.dataset.theme=value;select.value=value;try{localStorage.setItem('samelco-theme',value)}catch{}};
  apply(stored);
  select.addEventListener('change',()=>apply(select.value));
})();

const reportPrintProfiles={
  'netmetering-invoice':'netmetering-invoice','netmetering-ledger':'netmetering-ledger',
  sales:'sales','sales-register':'sales-register','sales-register-recap':'sales-register-recap','monthly-sales':'monthly-sales',
  receipts:'receipts','bills-inquiry-invoice':'bills-inquiry-invoice',aging:'aging',collectors:'collectors','cash-flow':'cash-flow',
  'collection-monitoring':'collection-monitoring',components:'components',engineering:'engineering','engineering-assets':'engineering-assets',
  'engineering-meters':'engineering-meters','engineering-substations':'engineering-substations',itdata:'itdata',accounting:'accounting',
  lifeline:'lifeline',delinquent:'delinquent','route-reading':'route-reading','route-unpaid':'route-unpaid',visual:'visual','billing-summary':'billing-summary','ninja-vat':'ninja-vat','cnpl-accounts':'cnpl-accounts','cnpl-collection':'cnpl-collection','non-power-bill':'non-power-bill','disco-analysis':'disco-analysis','lifeline-paid':'lifeline-paid','kwh-query':'kwh-query',loss:'loss','status-dashboard':'status-dashboard','compromise-agreements':'compromise-agreements'
};
const reportPathIds={
  '/netmetering':'netmetering-invoice','/overall-sales':'sales','/sales-by-area':'sales','/rate-checker':'sales',
  '/sales-register':'sales-register','/sales-register-recap':'sales-register-recap','/monthly-sales-report':'monthly-sales',
  '/receipts':'receipts','/bills-inquiry':'bills-inquiry-invoice','/aging-report':'aging','/collector-report':'collectors',
  '/cash-flow':'cash-flow','/collection-monitoring':'collection-monitoring','/collection-components':'components',
  '/engineering-data':'engineering','/engineering-feeder-ratecode':'engineering','/engineering-assets':'engineering-assets',
  '/engineering-meters':'engineering-meters','/engineering-substations':'engineering-substations','/itdata':'itdata',
  '/accounting-report':'accounting','/accounting-by-municipality':'accounting','/mfsr':'accounting','/other-charges-report':'accounting','/lifeline-report':'lifeline','/lifeline-checker':'lifeline',
  '/delinquent-report':'delinquent','/route-reading':'route-reading','/route-unpaid':'route-unpaid','/visual-report':'visual','/ninja-vat':'ninja-vat','/cnpl-accounts':'cnpl-accounts','/cnpl-collection-monitoring':'cnpl-collection','/non-power-bill-collection':'non-power-bill','/disco-analysis':'disco-analysis','/lifeline-paid-posting':'lifeline-paid','/kwh-query':'kwh-query','/loss-report':'loss','/status-dashboard':'status-dashboard','/compromise-agreement-monitoring':'compromise-agreements'
};
let reportPrintSettingsCache;
async function applyReportPrintSettings(reportId=(location.pathname==='/'&&new URLSearchParams(location.search).get('report')==='billing-summary'?'billing-summary':reportPathIds[location.pathname]||'default')){
  try{
    reportPrintSettingsCache??=fetch('/api/report-print-settings').then(response=>{if(!response.ok)throw new Error('Unable to load report print settings');return response.json()});
    const profiles=await reportPrintSettingsCache,settings={...(profiles.default||{}),...(profiles.reports?.[reportId]||{})};
    const pageSize=settings.pageSize==='a4'?'A4':'letter',orientation=settings.orientation==='landscape'?'landscape':'portrait',margin=['0.25','0.45','0.65'].includes(String(settings.margin))?settings.margin:'0.45',textSize=settings.textSize||'normal';
    document.body.classList.toggle('report-print-small',textSize==='small');document.body.classList.toggle('report-print-large',textSize==='large');document.body.classList.toggle('report-print-colors',settings.printColors!==false);document.body.classList.toggle('report-print-fit',settings.fitWideTables===true);document.body.classList.toggle('report-print-repeat-head',settings.repeatTableHeaders!==false);
    let style=document.querySelector('#report-print-settings-style');if(!style){style=document.createElement('style');style.id='report-print-settings-style';document.head.append(style)}
    style.textContent=`@media print{@page{size:${pageSize} ${orientation};margin:${margin}in}body.report-print-small{zoom:.86}body.report-print-large{zoom:1.08}body.report-print-colors,body.report-print-colors *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body.report-print-fit table{width:100%!important;min-width:0!important;table-layout:auto!important}body.report-print-fit .table-wrap,body.report-print-fit .report,body.report-print-fit .schedule-table-wrap{overflow:visible!important}body.report-print-repeat-head thead{display:table-header-group!important}body:not(.report-print-repeat-head) thead{display:table-row-group!important}table{page-break-inside:auto}tr{break-inside:avoid;page-break-inside:avoid}}`;
    return settings;
  }catch(error){console.warn('Report print settings are unavailable:',error.message);return null}
}
window.applyReportPrintSettings=applyReportPrintSettings;
window.getCurrentReportPrintId=()=>location.pathname==='/sales-register-recap'?'sales-register-recap':(location.pathname==='/'&&new URLSearchParams(location.search).get('report')==='billing-summary'?'billing-summary':reportPathIds[location.pathname]||'default');
applyReportPrintSettings();
