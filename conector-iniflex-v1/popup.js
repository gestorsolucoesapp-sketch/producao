const s=document.getElementById('s');
function send(m){return new Promise(r=>chrome.runtime.sendMessage(m,x=>r(x||{})))}
async function refresh(){
  const d=await send({action:'v1-status'});
  if(!d.state){s.textContent='Supervisor pronto. Nenhuma execução ativa.';return}
  const x=d.state;
  s.textContent=(x.status==='done'?'✅ ':'⏳ ')+(x.report_id||'concluído')+' · '+x.report_index+'/14\nFase: '+x.phase+'\nConcluídos: '+((x.completed||[]).join(', ')||'nenhum')+(x.last_error?'\nErro: '+x.last_error:'');
}
document.getElementById('start').onclick=async()=>{s.textContent='Iniciando…';await send({action:'v1-start',slot:'manual'});refresh()};
document.getElementById('ifx').onclick=()=>send({action:'v1-open-iniflex'});
document.getElementById('app').onclick=()=>send({action:'v1-open-app'});
refresh();setInterval(refresh,3000);
