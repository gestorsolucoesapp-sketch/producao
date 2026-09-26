const s=document.getElementById('s');
function send(m){return new Promise(r=>chrome.runtime.sendMessage(m,x=>r(x||{})))}
async function refresh(){
  const d=await send({action:'v1-status'});
  if(!d.state){s.textContent='Supervisor '+(d.version||'v1.1')+' pronto. Nenhuma execução ativa.';return}
  const x=d.state,done=(x.completed||[]).length;
  const pos=x.report_id?Math.min(14,Number(x.report_index||0)+1):14;
  const icon=x.status==='done'?'✅ ':x.status==='error'?'❌ ':'⏳ ';
  s.textContent=icon+(x.report_id||'concluído')+' · '+done+'/14 concluídos'+(x.report_id?' · posição '+pos+'/14':'')+'\nFase: '+x.phase+'\nConcluídos: '+((x.completed||[]).join(', ')||'nenhum')+(x.last_error?'\nErro: '+x.last_error:'');
}
document.getElementById('start').onclick=async()=>{s.textContent='Iniciando…';await send({action:'v1-start',slot:'manual'});refresh()};
document.getElementById('resume').onclick=async()=>{s.textContent='Retomando…';await send({action:'v1-resume'});refresh()};
document.getElementById('ifx').onclick=()=>send({action:'v1-open-iniflex'});
document.getElementById('app').onclick=()=>send({action:'v1-open-app'});
refresh();setInterval(refresh,3000);