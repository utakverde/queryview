(()=>{
  const select=document.querySelector('#theme-select');
  if(!select)return;
  const stored=(()=>{try{return localStorage.getItem('samelco-theme')}catch{return null}})();
  const apply=theme=>{const value=theme==='dark'?'dark':'normal';document.documentElement.dataset.theme=value;select.value=value;try{localStorage.setItem('samelco-theme',value)}catch{}};
  apply(stored);
  select.addEventListener('change',()=>apply(select.value));
})();
