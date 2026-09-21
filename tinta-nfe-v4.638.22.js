/* Rioplastic v4.638.23 — importador XML/PDF NF-e da Casa de Tintas */
(function(){
  'use strict';

  let _nfeAtual = null;
  let _nfeNotas = [];
  let _nfeNotasCarregadas = false;
  let _nfeNotasCarregando = false;
  let _nfeSalvando = false;

  const $id = id => document.getElementById(id);
  const n = v => {
    const x = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(x) ? x : 0;
  };
  const iso = v => {
    const s = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0,10) : '';
  };
  const fmtD = v => {
    const s = iso(v); if(!s) return '—';
    const p=s.split('-'); return p[2]+'/'+p[1]+'/'+p[0];
  };
  const elTag = (root, nome) => {
    if(!root) return null;
    const a = root.getElementsByTagNameNS ? root.getElementsByTagNameNS('*', nome) : [];
    if(a && a.length) return a[0];
    const b = root.getElementsByTagName ? root.getElementsByTagName(nome) : [];
    return b && b.length ? b[0] : null;
  };
  const txt = (root, nome) => {
    const e=elTag(root,nome);
    return e ? String(e.textContent || '').trim() : '';
  };
  const elems = (root,nome) => {
    if(!root) return [];
    const a = root.getElementsByTagNameNS ? root.getElementsByTagNameNS('*', nome) : [];
    if(a && a.length) return Array.from(a);
    return Array.from(root.getElementsByTagName ? root.getElementsByTagName(nome) : []);
  };
  const unidadeEhPeca = u => /^(UN|UND|UNID|PC|PÇ|PCA|LATA|LTN|BD|BALDE|GL|GALAO|GALÃO)$/i.test(String(u||'').trim());

  function produtoPorCod(cod){
    const c=String(cod||'').trim();
    return (_tintaSaldo||[]).find(p=>String(p.cod_erp||'').trim()===c) || null;
  }
  function produtoPorId(id){
    return (_tintaSaldo||[]).find(p=>String(p.id)===String(id)) || null;
  }
  function novoPreco(it){
    const q=n(it.quantidade_estoque), v=n(it.valor_total);
    return q>0 && v>0 ? v/q : 0;
  }
  function mudouPreco(it){
    const p=produtoPorId(it.produto_id), nv=novoPreco(it);
    if(!p || !nv) return false;
    const atual=n(p.preco);
    return !atual || Math.abs(nv-atual) >= 0.01;
  }

  function parseXml(xmlText, arquivo){
    const doc=new DOMParser().parseFromString(xmlText,'application/xml');
    if(elems(doc,'parsererror').length) throw new Error('XML inválido ou corrompido.');

    const inf=elTag(doc,'infNFe');
    const ide=elTag(doc,'ide');
    const emit=elTag(doc,'emit');
    const total=elTag(doc,'ICMSTot');
    const dets=elems(doc,'det');
    if(!inf || !ide || !dets.length) throw new Error('Este arquivo não parece ser uma NF-e válida.');

    let chave=txt(doc,'chNFe');
    if(!chave && inf.getAttribute){
      chave=String(inf.getAttribute('Id')||'').replace(/^NFe/i,'');
    }
    chave=String(chave||'').replace(/\D/g,'');

    const emissao=iso(txt(ide,'dhEmi') || txt(ide,'dEmi'));
    const fornecedor=txt(emit,'xNome') || txt(emit,'xFant') || '';
    const cnpj=txt(emit,'CNPJ') || txt(emit,'CPF') || '';

    const itens=dets.map((det,i)=>{
      const prod=elTag(det,'prod') || det;
      const cod=txt(prod,'cProd');
      const desc=txt(prod,'xProd');
      const qtd=n(txt(prod,'qCom'));
      const un=txt(prod,'uCom');
      const vu=n(txt(prod,'vUnCom'));
      const vprod=n(txt(prod,'vProd'));
      const vdesc=n(txt(prod,'vDesc'));
      const vl=Math.max(0,vprod-vdesc);
      const p=produtoPorCod(cod);
      return {
        idx:i+1,
        cod_erp:cod,
        descricao:desc,
        quantidade_fiscal:qtd,
        unidade_fiscal:un,
        valor_unit:vu,
        valor_total:vl || vprod,
        produto_id:p?p.id:'',
        entra_estoque:!!p,
        quantidade_estoque:p && unidadeEhPeca(un) ? qtd : '',
        vincular_cod_erp:false,
        auto:!!p
      };
    });

    return {
      arquivo: arquivo || '',
      numero: txt(ide,'nNF'),
      serie: txt(ide,'serie'),
      fornecedor,
      cnpj,
      emissao,
      entrada: new Date().toISOString().slice(0,10),
      valor_total:n(txt(total,'vNF')),
      chave_nfe:chave,
      itens
    };
  }

  function pdfNum(v){
    let s=String(v==null?'':v).trim().replace(/\s/g,'').replace(/R\$/gi,'');
    if(!s) return 0;
    if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
    else {
      const dots=(s.match(/\./g)||[]).length;
      if(dots>1) s=s.replace(/\./g,'');
    }
    const x=parseFloat(s.replace(/[^\d.-]/g,''));
    return Number.isFinite(x)?x:0;
  }
  function brDataIso(v){
    const m=String(v||'').match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/);
    return m ? (m[3]+'-'+m[2]+'-'+m[1]) : '';
  }
  function normPdf(v){
    return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  }
  async function pdfLib(){
    if(window.__rpPdfJs) return window.__rpPdfJs;
    const mod=await import('./pdf.min.mjs');
    mod.GlobalWorkerOptions.workerSrc='./pdf.worker.min.mjs';
    window.__rpPdfJs=mod;
    return mod;
  }
  function pdfValorDepois(lines, rotulo){
    const re=rotulo instanceof RegExp?rotulo:new RegExp(rotulo,'i');
    for(let i=0;i<lines.length;i++){
      if(!re.test(lines[i])) continue;
      for(let j=i;j<Math.min(lines.length,i+4);j++){
        const nums=String(lines[j]||'').match(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g);
        if(nums&&nums.length) return pdfNum(nums[nums.length-1]);
      }
    }
    return 0;
  }
  function pdfDataDepois(lines, rotulo){
    const re=rotulo instanceof RegExp?rotulo:new RegExp(rotulo,'i');
    for(let i=0;i<lines.length;i++){
      if(!re.test(lines[i])) continue;
      for(let j=i;j<Math.min(lines.length,i+5);j++){
        const d=brDataIso(lines[j]);
        if(d) return d;
      }
    }
    return '';
  }
  function pdfFornecedor(lines){
    const todo=normPdf(lines.join(' '));
    const marcas=[...new Set((_tintaSaldo||[]).map(x=>String(x.fornecedor||'').trim()).filter(Boolean))]
      .sort((a,b)=>b.length-a.length);
    const achou=marcas.find(x=>todo.includes(normPdf(x)));
    if(achou) return achou;
    for(let i=0;i<lines.length;i++){
      if(/IDENTIFICA[CÇ][AÃ]O DO EMITENTE|EMITENTE/i.test(lines[i])){
        for(let j=i+1;j<Math.min(lines.length,i+5);j++){
          const z=String(lines[j]||'').trim();
          if(z.length>3 && /[A-Za-zÀ-ÿ]/.test(z) && !/DANFE|DOCUMENTO AUXILIAR|NOTA FISCAL/i.test(z)) return z.slice(0,160);
        }
      }
    }
    return '';
  }
  function pdfLinhaItem(line,cod,p){
    const pos=String(line).indexOf(cod);
    if(pos<0) return null;
    const resto=String(line).slice(pos+cod.length).trim();
    const unitRe=/(?:^|\s)(UN|UND|UNID|PC|PÇ|PCA|LATA|LTN|BD|BALDE|GL|GALAO|GALÃO|KG|LT|L)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i;
    const m=resto.match(unitRe);
    let desc=resto, un='', qtd=0, vu=0, vt=0;
    if(m){
      desc=resto.slice(0,m.index).trim();
      un=m[1]; qtd=pdfNum(m[2]); vu=pdfNum(m[3]); vt=pdfNum(m[4]);
      desc=desc.replace(/\s+\d{8}\s+\d{1,3}\s+\d{4}\s*$/,'').trim();
    }
    if(!desc || desc.length<2) desc=p ? p.nome : '';
    return {
      cod_erp:cod, descricao:desc, quantidade_fiscal:qtd, unidade_fiscal:un,
      valor_unit:vu, valor_total:vt, produto_id:p?p.id:'',
      entra_estoque:!!p, quantidade_estoque:p&&unidadeEhPeca(un)&&qtd?qtd:'',
      vincular_cod_erp:false, auto:!!p
    };
  }
  function pdfItens(lines){
    const mapa=new Map((_tintaSaldo||[]).filter(x=>x.cod_erp).map(x=>[String(x.cod_erp).trim(),x]));
    const out=[];
    const usados=new Set();
    lines.forEach((line,li)=>{
      for(const [cod,p] of mapa){
        if(!String(line).includes(cod)) continue;
        const it=pdfLinhaItem(line,cod,p);
        if(it){it.idx=out.length+1;out.push(it);usados.add(li+'|'+cod);}
      }
    });
    const unit='UN|UND|UNID|PC|PÇ|PCA|LATA|LTN|BD|BALDE|GL|GALAO|GALÃO|KG|LT|L';
    const re=new RegExp('^\\s*([A-Z0-9][A-Z0-9._/-]{2,19})\\s+(.+?)\\s+('+unit+')\\s+([\\d.,]+)\\s+([\\d.,]+)\\s+([\\d.,]+)','i');
    lines.forEach((line,li)=>{
      const m=String(line).match(re); if(!m) return;
      const cod=m[1];
      if(mapa.has(cod) || cod.replace(/\D/g,'').length===44) return;
      if(!/[A-Za-zÀ-ÿ]/.test(m[2])) return;
      out.push({
        idx:out.length+1,cod_erp:cod,descricao:m[2].trim(),
        quantidade_fiscal:pdfNum(m[4]),unidade_fiscal:m[3],
        valor_unit:pdfNum(m[5]),valor_total:pdfNum(m[6]),
        produto_id:'',entra_estoque:false,quantidade_estoque:'',
        vincular_cod_erp:false,auto:false
      });
    });
    return out;
  }
  async function parsePdf(file){
    const lib=await pdfLib();
    const bytes=new Uint8Array(await file.arrayBuffer());
    const pdf=await lib.getDocument({data:bytes}).promise;

    try{
      const at=await pdf.getAttachments();
      if(at){
        for(const [nome,a] of Object.entries(at)){
          if(/\.xml$/i.test(nome||'') && a&&a.content){
            const xml=new TextDecoder('utf-8').decode(a.content);
            const r=parseXml(xml,file.name);
            r.origem='pdf+xml';
            r.pdf_aviso='O PDF continha o XML da NF-e incorporado; os dados vieram do XML.';
            return r;
          }
        }
      }
    }catch(_){}

    const lines=[];
    for(let pg=1;pg<=pdf.numPages;pg++){
      const page=await pdf.getPage(pg);
      const tc=await page.getTextContent();
      const grupos=new Map();
      (tc.items||[]).forEach(it=>{
        const str=String(it.str||'').trim(); if(!str) return;
        const x=it.transform?it.transform[4]:0, y=it.transform?it.transform[5]:0;
        const ky=Math.round(y/2)*2;
        if(!grupos.has(ky)) grupos.set(ky,[]);
        grupos.get(ky).push({x,str});
      });
      [...grupos.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,arr])=>{
        const l=arr.sort((a,b)=>a.x-b.x).map(z=>z.str).join(' ').replace(/\s+/g,' ').trim();
        if(l) lines.push(l);
      });
    }
    if(!lines.length) throw new Error('O PDF não possui texto selecionável. Use o XML da NF-e ou um DANFE digital, não uma foto/scan.');

    const all=lines.join('\n');
    let chave='';
    const chaves=all.match(/(?:\d[\s.-]*){44}/g)||[];
    for(const c of chaves){
      const d=c.replace(/\D/g,'');
      if(d.length===44){chave=d;break;}
    }
    let numero='',serie='';
    for(const l of lines){
      const m=l.match(/\bN[º°]\s*[:.]?\s*([\d.]{3,})/i) || l.match(/\bNF[-\s]?E?\s*[:.]?\s*([\d.]{3,})/i);
      if(m && !numero){numero=m[1].replace(/\D/g,'').replace(/^0+/,'')||'0';}
      const se=l.match(/S[ÉE]RIE\s*[:.]?\s*(\d{1,4})/i);
      if(se && !serie) serie=se[1].replace(/^0+/,'')||'0';
      if(numero&&serie) break;
    }
    const emissao=pdfDataDepois(lines,/DATA (?:DA )?EMISS[AÃ]O|EMISS[AÃ]O/i);
    const fornecedor=pdfFornecedor(lines);
    const itens=pdfItens(lines);
    if(!itens.length) throw new Error('Li o PDF, mas não consegui reconhecer a tabela de produtos. Tente o XML da NF-e.');

    const total=pdfValorDepois(lines,/VALOR TOTAL DA NOTA|VALOR TOTAL DA NF|V\.?\s*TOTAL\s*NF/i);
    return {
      arquivo:file.name,numero,serie,fornecedor,cnpj:'',emissao,
      entrada:new Date().toISOString().slice(0,10),valor_total:total,chave_nfe:chave,
      itens,origem:'pdf',
      pdf_aviso:'Dados extraídos do DANFE PDF. Confira número da nota, quantidades e valores antes de confirmar.'
    };
  }
  function editarCab(){
    if(!_nfeAtual) return;
    let v=prompt('Número da nota fiscal:',_nfeAtual.numero||''); if(v===null)return; _nfeAtual.numero=String(v).trim();
    v=prompt('Série:',_nfeAtual.serie||''); if(v!==null)_nfeAtual.serie=String(v).trim();
    v=prompt('Fornecedor:',_nfeAtual.fornecedor||''); if(v!==null)_nfeAtual.fornecedor=String(v).trim();
    v=prompt('Data de emissão (DD/MM/AAAA):',_nfeAtual.emissao?fmtD(_nfeAtual.emissao):''); if(v!==null){const d=brDataIso(v)||iso(v);if(d)_nfeAtual.emissao=d;}
    renderPreview();
  }
  function valorItem(i,v){
    if(!_nfeAtual||!_nfeAtual.itens[i]) return;
    _nfeAtual.itens[i].valor_total=pdfNum(v);
    renderPreview();
  }

  async function ler(input){
    const file=input && input.files && input.files[0];
    if(!file) return;
    try{
      const ehXml=/\.xml$/i.test(file.name)||/xml/i.test(file.type||'');
      const ehPdf=/\.pdf$/i.test(file.name)||/pdf/i.test(file.type||'');
      if(!ehXml&&!ehPdf) throw new Error('Escolha o XML ou o PDF (DANFE) da NF-e.');
      try{toast(ehPdf?'Lendo DANFE PDF…':'Lendo XML da NF-e…');}catch(_){}
      _nfeAtual=ehPdf ? await parsePdf(file) : parseXml(await file.text(),file.name);
      renderEntrada();
      try{ toast('NF '+(_nfeAtual.numero||'')+' lida · confira antes de importar'); }catch(_){}
    }catch(e){
      _nfeAtual=null;
      try{toast('Não consegui ler a NF-e: '+((e&&e.message)||e));}catch(_){}
      renderEntrada();
    }
  }

  function mapear(i,id){
    if(!_nfeAtual || !_nfeAtual.itens[i]) return;
    const it=_nfeAtual.itens[i], p=produtoPorId(id);
    it.produto_id=id||'';
    it.entra_estoque=!!p;
    it.vincular_cod_erp=!!(p && it.cod_erp && !String(p.cod_erp||'').trim());
    if(p && !it.quantidade_estoque && unidadeEhPeca(it.unidade_fiscal)) it.quantidade_estoque=it.quantidade_fiscal;
    renderPreview();
  }
  function toggle(i,on){
    if(!_nfeAtual || !_nfeAtual.itens[i]) return;
    _nfeAtual.itens[i].entra_estoque=!!on;
    renderPreview();
  }
  function qtd(i,v){
    if(!_nfeAtual || !_nfeAtual.itens[i]) return;
    _nfeAtual.itens[i].quantidade_estoque=String(v||'').replace(',','.');
    const cel=$id('nfePrecoNovo'+i);
    if(cel){
      const it=_nfeAtual.itens[i], nv=novoPreco(it);
      cel.innerHTML=nv ? (_tintaVeDinheiro()?_tBRL(nv):'✓') : '—';
    }
  }

  function optsProduto(sel){
    const L=(_tintaSaldo||[]).filter(x=>x.ativo).slice().sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR'));
    return '<option value="">— não vinculado / ignorar —</option>'+L.map(p=>
      '<option value="'+escapeHtml(p.id)+'"'+(String(sel||'')===String(p.id)?' selected':'')+'>'
      +escapeHtml(p.nome)+' · '+escapeHtml(p.fornecedor||'')+(p.cod_erp?' · ERP '+escapeHtml(p.cod_erp):'')+'</option>'
    ).join('');
  }

  function resumoPreview(){
    if(!_nfeAtual) return '';
    const entra=_nfeAtual.itens.filter(x=>x.entra_estoque);
    const pend=entra.filter(x=>!x.produto_id || !(n(x.quantidade_estoque)>0));
    return '<div class="idet-grid" style="margin:10px 0">'
      +'<div><b>'+_nfeAtual.itens.length+'</b><span>itens na NF</span></div>'
      +'<div><b>'+entra.length+'</b><span>itens para estoque</span></div>'
      +'<div><b style="color:'+(pend.length?'var(--critico)':'var(--verde)')+'">'+pend.length+'</b><span>pendências</span></div>'
      +(_tintaVeDinheiro()?'<div><b>'+_tBRL(_nfeAtual.valor_total)+'</b><span>total da NF</span></div>':'')
      +'</div>';
  }

  function renderPreview(){
    const box=$id('tintaNfePreview'); if(!box) return;
    if(!_nfeAtual){ box.innerHTML=''; return; }
    const N=_nfeAtual;
    const ve$=_tintaVeDinheiro();
    box.innerHTML=
      '<div style="border:1px solid var(--linha);border-radius:12px;padding:11px;margin:10px 0;background:var(--leve-s)">'
      +'<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +'<div><b style="font-size:15px">NF '+escapeHtml(N.numero||'—')+(N.serie?' · série '+escapeHtml(N.serie):'')+'</b>'
      +'<div class="desc">'+escapeHtml(N.fornecedor||'Fornecedor não identificado')+(N.cnpj?' · '+escapeHtml(N.cnpj):'')+'</div></div>'
      +'<div class="desc" style="text-align:right">emissão '+fmtD(N.emissao)+'<br>'+escapeHtml(N.arquivo||'')+'</div></div>'
      +(N.chave_nfe?'<div class="desc" style="font-size:10px;word-break:break-all;margin-top:5px">chave '+escapeHtml(N.chave_nfe)+'</div>':'')
      +(N.pdf_aviso?'<div style="margin-top:6px;padding:6px 8px;background:#FFF6E6;border-radius:7px;font-size:11px;color:#8A5A12">⚠️ '+escapeHtml(N.pdf_aviso)+'</div>':'')
      +(N.origem&&N.origem.indexOf('pdf')===0?'<button class="btn btn-borda" style="width:auto;padding:5px 9px;font-size:11px;margin-top:7px" onclick="tintaNfeEditarCab()">✏️ Conferir dados da nota</button>':'')
      +'</div>'
      +resumoPreview()
      +'<p class="desc" style="margin:7px 0">Marque somente o que deve entrar na Casa de Tintas. Quando a unidade da NF não representa uma lata/peça, informe manualmente quantas latas chegaram.</p>'
      +'<div style="overflow-x:auto"><table style="width:100%;min-width:850px;font-size:12px"><thead><tr>'
      +'<th>Entrar</th><th style="text-align:left">Item da NF</th><th style="text-align:left">Vincular à tinta</th><th>Qtd. fiscal</th><th>Qtd. estoque</th>'
      +(ve$?'<th style="text-align:right">Valor item</th><th style="text-align:right">Preço atual</th><th style="text-align:right">Novo preço</th>':'')
      +'</tr></thead><tbody>'
      +N.itens.map((it,i)=>{
        const p=produtoPorId(it.produto_id);
        const nv=novoPreco(it), mud=mudouPreco(it);
        const conflito=p && p.cod_erp && it.cod_erp && String(p.cod_erp)!==String(it.cod_erp);
        const vinc=p && it.cod_erp && !String(p.cod_erp||'').trim();
        return '<tr style="border-top:1px solid var(--linha);'+(!it.produto_id?'background:#FFF9EC':'')+'">'
          +'<td style="text-align:center"><input type="checkbox" '+(it.entra_estoque?'checked':'')+' onchange="tintaNfeToggle('+i+',this.checked)"></td>'
          +'<td style="text-align:left"><b>'+escapeHtml(it.cod_erp||'—')+'</b> · '+escapeHtml(it.descricao||'')
          +(it.auto?'<div style="color:var(--verde);font-size:10px;font-weight:800">✓ código ERP reconhecido</div>':'')
          +'</td>'
          +'<td style="text-align:left"><select onchange="tintaNfeMapear('+i+',this.value)" style="max-width:330px;width:100%;padding:6px;border:1px solid var(--borda);border-radius:8px;font-size:12px">'
          +optsProduto(it.produto_id)+'</select>'
          +(vinc?'<div style="font-size:10px;color:var(--verde);font-weight:700">o código ERP será salvo para as próximas notas</div>':'')
          +(conflito?'<div style="font-size:10px;color:var(--laranja);font-weight:700">vínculo só nesta nota · esta tinta já possui outro código ERP</div>':'')
          +'</td>'
          +'<td style="text-align:center;white-space:nowrap">'+Number(it.quantidade_fiscal||0).toLocaleString('pt-BR',{maximumFractionDigits:3})+' '+escapeHtml(it.unidade_fiscal||'')+'</td>'
          +'<td style="text-align:center"><input id="nfeQtd'+i+'" type="number" min="0" step="0.001" value="'+escapeHtml(it.quantidade_estoque)+'" '
          +'oninput="tintaNfeQtd('+i+',this.value)" style="width:88px;padding:6px;border:1px solid '+(it.entra_estoque && !(n(it.quantidade_estoque)>0)?'var(--critico)':'var(--borda)')+';border-radius:8px;text-align:center"></td>'
          +(ve$?'<td style="text-align:right"><input type="text" inputmode="decimal" value="'+escapeHtml(it.valor_total||'')+'" onchange="tintaNfeValor('+i+',this.value)" style="width:92px;padding:5px;border:1px solid var(--borda);border-radius:7px;text-align:right"></td>'
            +'<td style="text-align:right;white-space:nowrap">'+(p&&p.preco?_tBRL(p.preco):'—')+'</td>'
            +'<td id="nfePrecoNovo'+i+'" style="text-align:right;white-space:nowrap;font-weight:'+(mud?'800':'600')+';color:'+(mud?'var(--laranja-4)':'inherit')+'">'+(nv?_tBRL(nv):'—')+'</td>':'')
          +'</tr>';
      }).join('')
      +'</tbody></table></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
      +'<button class="btn btn-verde" style="width:auto;padding:9px 16px" onclick="tintaNfeImportar()" '+(_nfeSalvando?'disabled':'')+'>'
      +(_nfeSalvando?'Importando…':'✓ Confirmar e lançar NF')+'</button>'
      +'<button class="btn btn-borda" style="width:auto;padding:9px 16px" onclick="tintaNfeLimpar()">Cancelar</button></div>';
  }

  async function importar(){
    if(!_nfeAtual || _nfeSalvando) return;
    const N=_nfeAtual;
    const entradas=N.itens.filter(x=>x.entra_estoque);
    const pend=entradas.filter(x=>!x.produto_id || !(n(x.quantidade_estoque)>0));
    if(pend.length){
      toast('Há '+pend.length+' item(ns) marcado(s) para entrar sem tinta vinculada ou sem quantidade.');
      return;
    }
    if(!entradas.length){
      toast('Nenhum item está marcado para entrar no estoque.');
      return;
    }
    if(!confirm('Importar a NF '+(N.numero||'')+'?\n\nSerão geradas '+entradas.length+' entrada(s) no estoque.')){
      return;
    }

    const itens=N.itens.map(it=>{
      const p=produtoPorId(it.produto_id);
      return {
        produto_id:it.produto_id||null,
        cod_erp:it.cod_erp||null,
        descricao:it.descricao||null,
        quantidade_fiscal:n(it.quantidade_fiscal),
        unidade_fiscal:it.unidade_fiscal||null,
        valor_unit:n(it.valor_unit)||null,
        valor_total:n(it.valor_total)||null,
        quantidade_estoque:it.entra_estoque?n(it.quantidade_estoque):null,
        entra_estoque:!!it.entra_estoque,
        vincular_cod_erp:!!(it.entra_estoque && p && it.cod_erp && !String(p.cod_erp||'').trim())
      };
    });
    const nota={
      numero:N.numero, serie:N.serie||null, fornecedor:N.fornecedor||null,
      emissao:N.emissao||null, entrada:N.entrada||new Date().toISOString().slice(0,10),
      valor_total:N.valor_total||null, arquivo:N.arquivo||null, chave_nfe:N.chave_nfe||null
    };
    _nfeSalvando=true; renderPreview();
    try{
      const {data,error}=await sb.rpc('tinta_importar_nfe',{p_nota:nota,p_itens:itens});
      if(error) throw error;
      _nfeAtual=null; _nfeNotasCarregadas=false;
      await tintaCarregar();
      await carregarNotas();
      tintaVer('entrada');
      const r=data||{};
      toast('NF '+(r.numero||N.numero)+' importada · '+(r.entradas||entradas.length)+' entrada(s)'
        +(r.precos_atualizados?' · '+r.precos_atualizados+' preço(s) atualizado(s)':''));
    }catch(e){
      toast('Não consegui importar a NF: '+((e&&e.message)||e));
    }finally{
      _nfeSalvando=false;
      renderEntrada();
    }
  }

  function limpar(){
    _nfeAtual=null; _nfeSalvando=false;
    const inp=$id('tintaNfeArquivo'); if(inp) inp.value='';
    renderEntrada();
  }

  async function carregarNotas(){
    if(_nfeNotasCarregando) return;
    _nfeNotasCarregando=true;
    try{
      const {data,error}=await sb.from('tinta_nota')
        .select('id,numero,serie,fornecedor,emissao,entrada,valor_total,chave_nfe,arquivo,importado_em')
        .order('importado_em',{ascending:false}).limit(20);
      if(error) throw error;
      _nfeNotas=data||[]; _nfeNotasCarregadas=true;
    }catch(_){
      _nfeNotas=[];
    }finally{
      _nfeNotasCarregando=false;
      if(_tintaVista==='entrada') renderEntrada();
    }
  }

  async function detalhe(id){
    try{
      const nota=_nfeNotas.find(x=>x.id===id);
      const {data,error}=await sb.from('tinta_nota_item')
        .select('*,produto:tinta_produto(nome,cod_erp,fornecedor)')
        .eq('nota_id',id).order('descricao');
      if(error) throw error;
      const L=data||[];
      const ve$=_tintaVeDinheiro();
      const h='<div class="desc" style="margin-bottom:8px">'+escapeHtml((nota&&nota.fornecedor)||'')+' · emissão '+fmtD(nota&&nota.emissao)+'</div>'
        +'<div style="overflow-x:auto"><table style="width:100%;font-size:12px"><thead><tr><th style="text-align:left">Item</th><th>Fiscal</th><th>Entrada</th>'
        +(ve$?'<th style="text-align:right">Preço aplicado</th>':'')+'</tr></thead><tbody>'
        +L.map(x=>'<tr style="border-top:1px solid var(--linha)"><td style="text-align:left"><b>'+escapeHtml(x.cod_erp||'—')+'</b> · '+escapeHtml(x.descricao||'')
          +(x.produto?'<div class="desc">'+escapeHtml(x.produto.nome||'')+'</div>':'<div style="color:var(--fraco);font-size:10px">ignorado no estoque</div>')+'</td>'
          +'<td style="text-align:center">'+Number(x.quantidade||0).toLocaleString('pt-BR',{maximumFractionDigits:3})+' '+escapeHtml(x.unidade||'')+'</td>'
          +'<td style="text-align:center">'+(x.entra_estoque?Number(x.quantidade_estoque||0).toLocaleString('pt-BR',{maximumFractionDigits:3})+' lata(s)':'—')+'</td>'
          +(ve$?'<td style="text-align:right">'+(x.preco_aplicado?_tBRL(x.preco_aplicado):'—')+'</td>':'')+'</tr>').join('')
        +'</tbody></table></div>';
      abreDet('NF '+escapeHtml((nota&&nota.numero)||''),h);
    }catch(e){toast('Não consegui abrir a nota: '+((e&&e.message)||e));}
  }

  function renderNotas(){
    if(!_nfeNotasCarregadas){
      if(!_nfeNotasCarregando) setTimeout(carregarNotas,0);
      return '<p class="desc" style="margin-top:12px">Carregando últimas notas…</p>';
    }
    if(!_nfeNotas.length) return '<p class="desc" style="margin-top:12px">Nenhuma NF importada ainda.</p>';
    return '<div style="margin-top:14px"><div class="titulo-sec">Últimas notas importadas</div>'
      +'<div style="overflow-x:auto"><table style="width:100%;font-size:12px"><thead><tr><th>NF</th><th style="text-align:left">Fornecedor</th><th>Emissão</th>'
      +(_tintaVeDinheiro()?'<th style="text-align:right">Valor</th>':'')+'<th></th></tr></thead><tbody>'
      +_nfeNotas.map(x=>'<tr style="border-top:1px solid var(--linha)"><td style="text-align:center"><b>'+escapeHtml(x.numero||'')+'</b></td>'
        +'<td style="text-align:left">'+escapeHtml(x.fornecedor||'—')+'</td><td style="text-align:center">'+fmtD(x.emissao||x.entrada)+'</td>'
        +(_tintaVeDinheiro()?'<td style="text-align:right">'+_tBRL(x.valor_total||0)+'</td>':'')
        +'<td style="text-align:right"><span onclick="tintaNfeDetalhe(\''+x.id+'\')" style="cursor:pointer;color:var(--azul-2);font-weight:800">ver ›</span></td></tr>').join('')
      +'</tbody></table></div></div>';
  }

  function renderEntrada(){
    const box=$id('tintaConteudo'); if(!box || _tintaVista!=='entrada') return;
    const f=String(_tintaBusca||'').trim().toLowerCase();
    const L=_tintaFiltra((_tintaSaldo||[]).filter(x=>x.ativo && (!f || String(x.nome||'').toLowerCase().includes(f))));
    box.innerHTML=
      '<div style="border:1px solid var(--linha);border-radius:12px;padding:12px;background:var(--leve-s)">'
      +'<div class="titulo-sec">📄 Importar NF-e</div>'
      +'<p class="desc" style="margin:0 0 8px">Selecione o <b>XML da NF-e ou o PDF do DANFE</b>. XML é a leitura mais exata; no PDF o app extrai o texto e você confere os campos antes de lançar.</p>'
      +'<input id="tintaNfeArquivo" type="file" accept=".xml,.pdf,text/xml,application/xml,application/pdf" onchange="tintaNfeLer(this)" '
      +'style="width:100%;padding:9px;border:1px dashed var(--linha-2s);border-radius:9px;background:#fff">'
      +'<div id="tintaNfePreview"></div></div>'
      +'<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:800;color:var(--navy)">＋ Entrada manual</summary>'
      +'<input type="search" placeholder="🔎 buscar a cor que chegou…" value="'+escapeHtml(_tintaBusca||'')+'" oninput="_tintaBusca=this.value;tintaRender()" style="width:100%;margin:8px 0;padding:10px;border:1px solid var(--borda);border-radius:10px;font-size:14px">'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:7px">'
      +L.slice(0,40).map(x=>'<div onclick="tintaEntrarQtd(\''+x.id+'\')" style="cursor:pointer;border:1px solid var(--linha-2s);border-radius:10px;padding:9px;background:var(--leve-2)">'
        +'<b style="font-size:12.5px;display:block">'+_bolinha(x.nome)+escapeHtml(x.nome)+'</b>'
        +'<span class="desc" style="font-size:11px">saldo '+_tNum(x.saldo)+' · + entrada</span></div>').join('')
      +'</div></details>'
      +renderNotas();
    renderPreview();
  }

  window.tintaNfeLer=ler;
  window.tintaNfeMapear=mapear;
  window.tintaNfeToggle=toggle;
  window.tintaNfeQtd=qtd;
  window.tintaNfeValor=valorItem;
  window.tintaNfeEditarCab=editarCab;
  window.tintaNfeImportar=importar;
  window.tintaNfeLimpar=limpar;
  window.tintaNfeDetalhe=detalhe;

  try { tintaTelaEntrada=renderEntrada; } catch(_){ window.tintaTelaEntrada=renderEntrada; }
})();