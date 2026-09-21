/* v4.638.9 — corrige modal de replicação de bolinhas */
(function(){
  window.mqReplicar=function(chave){
    const p=(_mqPartes||[]).find(z=>z.chave===chave); if(!p)return;
    const outras=_mqMaqsReplicar();
    if(!outras.length){toast('Não há outra máquina neste setor.');return;}
    const esc=v=>escapeHtml(String(v==null?'':v));
    const d=document.createElement('div');
    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;background:rgba(11,42,74,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto';
    const card=document.createElement('div');
    card.style.cssText='background:#fff;border-radius:14px;padding:15px;max-width:400px;width:100%';
    card.innerHTML='<div style="font-size:14px;font-weight:800;color:var(--navy)">Copiar “'+esc(p.nome)+'” para outras máquinas</div>'
      +'<p class="desc" style="font-size:11.5px;margin:5px 0 10px">A bolinha vai para as máquinas marcadas, no mesmo lugar do desenho. A contagem continua por máquina: cada uma lê só as ordens dela.</p>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px"><button type="button" id="mqRepTodas" class="btn" style="width:auto;padding:5px 10px;font-size:11px">marcar todas</button><button type="button" id="mqRepNada" class="btn" style="width:auto;padding:5px 10px;font-size:11px">limpar</button></div>'
      +'<div id="mqRepLista" style="display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 4px"></div>'
      +'<div style="display:flex;gap:7px;justify-content:flex-end;margin-top:12px"><button type="button" id="mqRepX" class="btn" style="width:auto;padding:8px 14px;font-size:12px">agora não</button><button type="button" id="mqRepOk" class="btn" style="width:auto;padding:8px 16px;font-size:12px;background:#1F7A46;color:#fff">copiar</button></div>';
    overlay.appendChild(card); d.appendChild(overlay); document.body.appendChild(d);
    const lista=card.querySelector('#mqRepLista');
    outras.forEach(m=>{
      const lab=document.createElement('label');
      lab.style.cssText='display:inline-flex;align-items:center;gap:5px;border:1px solid var(--linha-2s);border-radius:999px;padding:5px 11px;cursor:pointer;font-size:13px;font-weight:700';
      const ck=document.createElement('input'); ck.type='checkbox'; ck.className='mqRepCk'; ck.value=String(m); ck.style.cssText='width:16px;height:16px';
      lab.appendChild(ck); lab.appendChild(document.createTextNode(' '+String(m))); lista.appendChild(lab);
    });
    const marcadas=()=>[...d.querySelectorAll('.mqRepCk')].filter(c=>c.checked).map(c=>c.value);
    card.querySelector('#mqRepTodas').onclick=()=>d.querySelectorAll('.mqRepCk').forEach(c=>c.checked=true);
    card.querySelector('#mqRepNada').onclick=()=>d.querySelectorAll('.mqRepCk').forEach(c=>c.checked=false);
    card.querySelector('#mqRepX').onclick=()=>d.remove();
    card.querySelector('#mqRepOk').onclick=async()=>{const alvos=marcadas();d.remove();if(alvos.length)await _mqReplicaPara(p,alvos);};
    overlay.addEventListener('click',e=>{if(e.target===overlay)d.remove();});
  };
})();