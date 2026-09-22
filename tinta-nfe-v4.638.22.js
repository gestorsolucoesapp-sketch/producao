/* Rioplastic v4.638.29 — lista completa da NF + soma dos itens x total da nota */
(function(){
  'use strict';

  let _nfeAtual = null;
  let _nfeNotas = [];
  let _nfeNotasCarregadas = false;
  let _nfeNotasCarregando = false;
  let _nfeSalvando = false;
  let _nfePasso = 0;
  let _nfeConfFinal = false;

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
  /* Regra da Casa de Tintas: cada lata representa 2 kg.
     Nas NFs que vêm em KG, o estoque em latas é sempre peso / 2. */
  const qtdLatas = (q,u) => {
    const v=Number(q||0), un=String(u||'').trim().toUpperCase();
    if(!(v>0)) return '';
    if(un==='KG' || un==='KGS') return v/2;
    if(unidadeEhPeca(un)) return v;
    return '';
  };

  function codigosProduto(p){
    const a=Array.isArray(p&&p.codigos_erp)?p.codigos_erp.map(String):[];
    const c=String((p&&p.cod_erp)||'').trim();
    if(c && !a.includes(c)) a.push(c);
    return a;
  }
  function produtoPorCod(cod){
    const c=String(cod||'').trim();
    if(!c) return null;
    return (_tintaSaldo||[]).find(p=>codigosProduto(p).some(x=>String(x).trim()===c)) || null;
  }
  function produtoPorId(id){
    return (_tintaSaldo||[]).find(p=>String(p.id)===String(id)) || null;
  }
  function nomeBaseTinta(v){
    return normPdf(v)
      .replace(/\b(SPECIAL COLOR|SULFLEX)\b/g,' ')
      .replace(/\b(RIG|TINTA|BASE)\b/g,' ')
      .replace(/\bUV[0-9A-Z]*\b/g,' ')
      .replace(/\b\d{8}\s+\d{3}\s+\d{4}\b/g,' ')
      .replace(/\((\d{5,10})\)/g,' ')
      .replace(/(\d)\s+([A-Z])\b/g,'$1$2')
      .replace(/\s+/g,' ').trim();
  }
  function marcaDaNota(fornecedor){
    const nf=normPdf(fornecedor);
    if(!nf) return '';
    const marcas=[...new Set((_tintaSaldo||[]).map(x=>String(x.fornecedor||'').trim()).filter(Boolean))]
      .sort((a,b)=>b.length-a.length);
    return marcas.find(m=>nf.includes(normPdf(m)) || normPdf(m).includes(nf)) || '';
  }
  function produtoPorNomeMarca(desc,fornecedor){
    const marca=marcaDaNota(fornecedor);
    if(!marca) return null;
    const base=nomeBaseTinta(desc);
    if(!base) return null;
    const L=(_tintaSaldo||[]).filter(p=>p.ativo && normPdf(p.fornecedor)===normPdf(marca));
    const ex=L.filter(p=>nomeBaseTinta(p.nome)===base);
    if(ex.length===1) return ex[0];
    const pref=L.filter(p=>{
      const pn=nomeBaseTinta(p.nome);
      return pn && (base.startsWith(pn+' ') || pn.startsWith(base+' '));
    });
    return pref.length===1 ? pref[0] : null;
  }
  function qtdKgItem(it){
    const uf=String((it&&it.unidade_fiscal)||'').trim().toUpperCase();
    const qf=n(it&&it.quantidade_fiscal);
    if((uf==='KG'||uf==='KGS') && qf>0) return qf;
    const lat=n(it&&it.quantidade_estoque);
    return lat>0 ? lat*2 : 0;
  }
  function novoPreco(it){
    const kg=qtdKgItem(it), v=n(it.valor_total);
    return kg>0 && v>0 ? v/kg : 0;
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
      const pCod=produtoPorCod(cod);
      const p=pCod || produtoPorNomeMarca(desc,fornecedor);
      return {
        idx:i+1,
        ordem:i+1,
        pagina:1,
        cod_erp:cod,
        descricao:desc,
        quantidade_fiscal:qtd,
        unidade_fiscal:un,
        valor_unit:vu,
        valor_total:vl || vprod,
        produto_id:p?p.id:'',
        entra_estoque:!!p,
        quantidade_estoque:p ? qtdLatas(qtd,un) : '',
        vincular_cod_erp:!!(p && cod && !pCod),
        auto:!!p,
        match_tipo:pCod?'erp':(p?'nome':'')
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
      valor_total:n(txt(total,'vNF')) || itens.reduce((a,x)=>a+n(x.valor_total),0),
      valor_total_danfe:n(txt(total,'vNF')),
      valor_total_itens:itens.reduce((a,x)=>a+n(x.valor_total),0),
      chave_nfe:chave,
      total_paginas:1,
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
      entra_estoque:!!p, quantidade_estoque:p?qtdLatas(qtd,un):'',
      vincular_cod_erp:false, auto:!!p
    };
  }
  function pdfItens(lines,fornecedor,paginas){
    const mapa=new Map();
    (_tintaSaldo||[]).forEach(p=>codigosProduto(p).forEach(c=>{
      c=String(c||'').trim(); if(c) mapa.set(c,p);
    }));
    const out=[];
    const linhasUsadas=new Set();
    lines.forEach((line,li)=>{
      for(const [cod,p] of mapa){
        if(!String(line).includes(cod)) continue;
        const it=pdfLinhaItem(line,cod,p);
        if(it){
          /* Se o ERP conhecido está na linha — inclusive entre parênteses,
             ex. 4UV0202Y · AMARELO 012 UV (2211201) — a linha já está vinculada.
             Marca a LINHA inteira para não nascer uma segunda linha pelo código
             do fornecedor (4UV0202Y). */
          it.idx=out.length+1;
          it._ordem_linha=li;
          it.pagina=Number((paginas&&paginas[li])||1);
          const antes=String(line).slice(0,String(line).indexOf(cod)).replace(/\($/,'').trim();
          const desc=antes.replace(/^\s*[A-Z0-9][A-Z0-9._/-]{2,19}\s*[·\-:]?\s*/i,'').trim();
          if(desc) it.descricao=desc;
          out.push(it);
          linhasUsadas.add(li);
          break;
        }
      }
    });
    const unit='UN|UND|UNID|PC|PÇ|PCA|LATA|LTN|BD|BALDE|GL|GALAO|GALÃO|KG|LT|L';
    const re=new RegExp('^\\s*([A-Z0-9][A-Z0-9._/-]{2,19})\\s+(.+?)\\s+('+unit+')\\s+([\\d.,]+)\\s+([\\d.,]+)\\s+([\\d.,]+)','i');
    lines.forEach((line,li)=>{
      if(linhasUsadas.has(li)) return;
      const raw=String(line);
      const m=raw.match(re); if(!m) return;
      const codFornecedor=m[1];
      if(codFornecedor.replace(/\D/g,'').length===44) return;
      if(!/[A-Za-zÀ-ÿ]/.test(m[2])) return;

      /* O número entre parênteses é o código ERP Rioplastic. O primeiro código
         da linha é do fornecedor e NÃO deve ocupar cod_erp. */
      const par=raw.match(/\((\d{5,10})\)/);
      const codErp=par?par[1]:'';
      const pCod=codErp?(mapa.get(codErp)||null):null;
      const qFiscal=pdfNum(m[4]);
      let desc=m[2].trim()
        .replace(/\((\d{5,10})\)/g,' ')
        .replace(/\b\d{8}\s+\d{3}\s+\d{4}\b/g,' ')
        .replace(/\s+/g,' ').trim();
      const p=pCod || produtoPorNomeMarca(desc,fornecedor);

      out.push({
        idx:out.length+1,
        _ordem_linha:li,
        pagina:Number((paginas&&paginas[li])||1),
        cod_erp:codErp,
        cod_fornecedor:codFornecedor,
        descricao:codFornecedor+' · '+desc,
        quantidade_fiscal:qFiscal,unidade_fiscal:m[3],
        valor_unit:pdfNum(m[5]),valor_total:pdfNum(m[6]),
        produto_id:p?p.id:'',
        entra_estoque:!!p,
        quantidade_estoque:p?qtdLatas(qFiscal,m[3]):'',
        vincular_cod_erp:!!(p && codErp && !pCod),auto:!!p,
        match_tipo:pCod?'erp':(p?'nome':'')
      });
    });
    out.sort((a,b)=>n(a._ordem_linha)-n(b._ordem_linha));
    out.forEach((x,i)=>{x.idx=i+1;x.ordem=i+1;});
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
            r.total_paginas=pdf.numPages;
            r.pdf_aviso='O PDF continha o XML da NF-e incorporado; os dados vieram do XML.';
            return r;
          }
        }
      }
    }catch(_){}

    const lines=[], paginas=[];
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
        if(l){lines.push(l);paginas.push(pg);}
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
    const itens=pdfItens(lines,fornecedor,paginas);
    if(!itens.length) throw new Error('Li o PDF, mas não consegui reconhecer a tabela de produtos. Tente o XML da NF-e.');

    const total=pdfValorDepois(lines,/VALOR TOTAL DA NOTA|VALOR TOTAL DA NF|V\.?\s*TOTAL\s*NF/i);
    const somaItens=itens.reduce((a,x)=>a+n(x.valor_total),0);
    return {
      arquivo:file.name,numero,serie,fornecedor,cnpj:'',emissao,
      entrada:new Date().toISOString().slice(0,10),valor_total:total||somaItens,
      valor_total_danfe:total,valor_total_itens:somaItens,chave_nfe:chave,
      total_paginas:pdf.numPages,itens,origem:'pdf',
      pdf_aviso:'Dados extraídos do DANFE PDF. Confira número da nota, quantidades e valores antes de confirmar.'
    };
  }
  function prepararOrdemNota(N){
    if(!N) return;
    const L=Array.isArray(N.itens)?N.itens:[];
    L.sort((a,b)=>{
      const ao=Number.isFinite(+a._ordem_linha)?+a._ordem_linha:null;
      const bo=Number.isFinite(+b._ordem_linha)?+b._ordem_linha:null;
      if(ao!==null && bo!==null && ao!==bo) return ao-bo;
      return n(a.idx)-n(b.idx);
    });
    L.forEach((it,i)=>{
      it.idx=i+1;
      it.ordem=i+1;
      if(!it.pagina && n(N.total_paginas)<=1) it.pagina=1;
      it.conferido=false;
    });
    N.itens=L;
    const pags=L.map(x=>n(x.pagina)).filter(x=>x>0);
    N.total_paginas=Math.max(1,n(N.total_paginas),...(pags.length?pags:[1]));
    _nfePasso=0;
    _nfeConfFinal=false;
  }

  function editarCab(){
    if(!_nfeAtual) return;
    let v=prompt('Número da nota fiscal:',_nfeAtual.numero||''); if(v===null)return; _nfeAtual.numero=String(v).trim();
    v=prompt('Série:',_nfeAtual.serie||''); if(v!==null)_nfeAtual.serie=String(v).trim();
    v=prompt('Fornecedor:',_nfeAtual.fornecedor||''); if(v!==null)_nfeAtual.fornecedor=String(v).trim();
    v=prompt('Data de emissão (DD/MM/AAAA):',_nfeAtual.emissao?fmtD(_nfeAtual.emissao):''); if(v!==null){const d=brDataIso(v)||iso(v);if(d)_nfeAtual.emissao=d;}
    v=prompt('Valor total da NF:',n(_nfeAtual.valor_total_danfe||_nfeAtual.valor_total)?String(n(_nfeAtual.valor_total_danfe||_nfeAtual.valor_total)).replace('.',','):'');
    if(v!==null){const t=pdfNum(v);if(t>0){_nfeAtual.valor_total_danfe=t;_nfeAtual.valor_total=t;}}
    renderPreview();
  }
  function valorItem(i,v){
    if(!_nfeAtual||!_nfeAtual.itens[i]) return;
    _nfeAtual.itens[i].valor_total=pdfNum(v);
    _nfeAtual.itens[i].conferido=false; _nfeConfFinal=false;
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
      prepararOrdemNota(_nfeAtual);
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
    it.vincular_cod_erp=!!(p && it.cod_erp && !codigosProduto(p).includes(String(it.cod_erp)));
    it.match_tipo=p?'manual':'';
    if(p && !it.quantidade_estoque) it.quantidade_estoque=qtdLatas(it.quantidade_fiscal,it.unidade_fiscal);
    it.conferido=false; _nfeConfFinal=false;
    renderPreview();
  }
  function toggle(i,on){
    if(!_nfeAtual || !_nfeAtual.itens[i]) return;
    _nfeAtual.itens[i].entra_estoque=!!on;
    _nfeAtual.itens[i].conferido=false; _nfeConfFinal=false;
    renderPreview();
  }
  function qtd(i,v){
    if(!_nfeAtual || !_nfeAtual.itens[i]) return;
    _nfeAtual.itens[i].quantidade_estoque=String(v||'').replace(',','.');
    _nfeAtual.itens[i].conferido=false; _nfeConfFinal=false;
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
    const somaItens=_nfeAtual.itens.reduce((a,x)=>a+n(x.valor_total),0);
    const totalDanfe=n(_nfeAtual.valor_total_danfe);
    const totalExibido=totalDanfe || n(_nfeAtual.valor_total) || somaItens;
    _nfeAtual.valor_total_itens=somaItens;
    if(totalDanfe) _nfeAtual.valor_total=totalDanfe;
    const dif=totalDanfe ? Math.abs(totalDanfe-somaItens) : 0;
    const conf=totalDanfe
      ? (dif<0.01
          ? '<div style="margin:-2px 0 10px;padding:7px 9px;border-radius:8px;background:#EAF7EF;color:#1F6D42;font-size:11px;font-weight:700">✓ Conferência: total da NF e soma dos itens batem em '+_tBRL(totalDanfe)+'</div>'
          : '<div style="margin:-2px 0 10px;padding:7px 9px;border-radius:8px;background:#FFF6E6;color:#8A5A12;font-size:11px">⚠️ Total da NF '+_tBRL(totalDanfe)+' · soma dos itens '+_tBRL(somaItens)+' · diferença '+_tBRL(dif)+'. Confira frete, impostos, desconto ou a leitura do PDF.</div>')
      : '<div style="margin:-2px 0 10px;padding:7px 9px;border-radius:8px;background:#EEF4FA;color:var(--navy);font-size:11px">ℹ️ Soma dos '+_nfeAtual.itens.length+' itens: <b>'+_tBRL(somaItens)+'</b>. Se o total da NF não for reconhecido no PDF, use “Conferir dados da nota” para informar o valor e comparar.</div>';
    return '<div class="idet-grid" style="margin:10px 0">'
      +'<div><b>'+_nfeAtual.itens.length+'</b><span>itens na NF</span></div>'
      +'<div><b>'+entra.length+'</b><span>itens para estoque</span></div>'
      +'<div><b style="color:'+(pend.length?'var(--critico)':'var(--verde)')+'">'+pend.length+'</b><span>pendências</span></div>'
      +(_tintaVeDinheiro()?'<div><b>'+_tBRL(totalExibido)+'</b><span>total da NF</span></div>':'')
      +'</div>'
      +(_tintaVeDinheiro()?conf:'');
  }

  function renderPreview(){
    const box=$id('tintaNfePreview'); if(!box) return;
    if(!_nfeAtual){ box.innerHTML=''; return; }
    const N=_nfeAtual;
    const ve$=_tintaVeDinheiro();
    const somaItens=N.itens.reduce((a,x)=>a+n(x.valor_total),0);
    const totalNota=n(N.valor_total_danfe);
    const dif=totalNota?Math.abs(totalNota-somaItens):0;

    box.innerHTML=
      '<div style="border:1px solid var(--linha);border-radius:12px;padding:11px;margin:10px 0;background:var(--leve-s)">'
      +'<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +'<div><b style="font-size:15px">NF '+escapeHtml(N.numero||'—')+(N.serie?' · série '+escapeHtml(N.serie):'')+'</b>'
      +'<div class="desc">'+escapeHtml(N.fornecedor||'Fornecedor não identificado')+(N.cnpj?' · '+escapeHtml(N.cnpj):'')+'</div></div>'
      +'<div class="desc" style="text-align:right">emissão '+fmtD(N.emissao)+'<br>'+escapeHtml(N.arquivo||'')+(N.total_paginas>1?'<br><b>'+N.total_paginas+' páginas</b>':'')+'</div></div>'
      +(N.chave_nfe?'<div class="desc" style="font-size:10px;word-break:break-all;margin-top:5px">chave '+escapeHtml(N.chave_nfe)+'</div>':'')
      +(N.pdf_aviso?'<div style="margin-top:6px;padding:6px 8px;background:#FFF6E6;border-radius:7px;font-size:11px;color:#8A5A12">⚠️ '+escapeHtml(N.pdf_aviso)+'</div>':'')
      +(N.origem&&N.origem.indexOf('pdf')===0?'<button class="btn btn-borda" style="width:auto;padding:5px 9px;font-size:11px;margin-top:7px" onclick="tintaNfeEditarCab()">✏️ Conferir dados da nota</button>':'')
      +'</div>'
      +resumoPreview()
      +(ve$?'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:8px 0 11px">'
        +'<div style="padding:9px 11px;border-radius:9px;background:#EEF4FA"><span class="desc">Soma dos itens</span><br><b style="font-size:16px">'+_tBRL(somaItens)+'</b></div>'
        +'<div style="padding:9px 11px;border-radius:9px;background:'+(totalNota?(dif<0.01?'#EAF7EF':'#FFF6E6'):'#EEF4FA')+'"><span class="desc">Valor total da NF</span><br><b style="font-size:16px">'+(totalNota?_tBRL(totalNota):'não identificado')+'</b></div>'
        +'<div style="padding:9px 11px;border-radius:9px;background:'+(totalNota?(dif<0.01?'#EAF7EF':'#FFF6E6'):'#EEF4FA')+'"><span class="desc">Diferença</span><br><b style="font-size:16px">'+(totalNota?_tBRL(dif):'—')+'</b></div>'
        +'</div>':'')
      +'<p class="desc" style="margin:7px 0"><b>Regra do estoque: 1 lata = 2 kg.</b> Os itens abaixo estão na ordem da nota. Confira a lista e o total antes de lançar.</p>'
      +'<div style="overflow-x:auto"><table style="width:100%;min-width:930px;font-size:12px"><thead><tr>'
      +'<th>#</th><th>Pág.</th><th>Entrar</th><th style="text-align:left">Item da NF</th><th style="text-align:left">Vincular à tinta</th><th>Peso/Qtd. NF</th><th>Latas (÷ 2 kg)</th>'
      +(ve$?'<th style="text-align:right">Valor item</th><th style="text-align:right">Preço atual R$/kg</th><th style="text-align:right">Novo R$/kg</th>':'')
      +'</tr></thead><tbody>'
      +N.itens.map((it,i)=>{
        const p=produtoPorId(it.produto_id);
        const nv=novoPreco(it), mud=mudouPreco(it);
        const vinc=!!(p && it.cod_erp && !codigosProduto(p).includes(String(it.cod_erp)));
        return '<tr style="border-top:1px solid var(--linha);'+(!it.produto_id?'background:#FFF9EC':'')+'">'
          +'<td style="text-align:center;font-weight:800">'+(i+1)+'</td>'
          +'<td style="text-align:center">'+(it.pagina||'—')+'</td>'
          +'<td style="text-align:center"><input type="checkbox" '+(it.entra_estoque?'checked':'')+' onchange="tintaNfeToggle('+i+',this.checked)"></td>'
          +'<td style="text-align:left"><b>'+escapeHtml(it.cod_erp||it.cod_fornecedor||'—')+'</b> · '+escapeHtml(it.descricao||'')
          +(it.auto?'<div style="color:var(--verde);font-size:10px;font-weight:800">✓ '+(it.match_tipo==='nome'?'nome + marca reconhecidos':'código ERP reconhecido')+'</div>':'')
          +'</td>'
          +'<td style="text-align:left"><select onchange="tintaNfeMapear('+i+',this.value)" style="max-width:330px;width:100%;padding:6px;border:1px solid var(--borda);border-radius:8px;font-size:12px">'
          +optsProduto(it.produto_id)+'</select>'
          +(vinc?'<div style="font-size:10px;color:var(--verde);font-weight:700">novo código ERP será salvo como código alternativo desta tinta</div>':'')
          +'</td>'
          +'<td style="text-align:center;white-space:nowrap">'+Number(it.quantidade_fiscal||0).toLocaleString('pt-BR',{maximumFractionDigits:3})+' '+escapeHtml(it.unidade_fiscal||'')+'</td>'
          +'<td style="text-align:center"><input id="nfeQtd'+i+'" type="number" min="0" step="0.001" value="'+escapeHtml(it.quantidade_estoque)+'" oninput="tintaNfeQtd('+i+',this.value)" style="width:88px;padding:6px;border:1px solid '+(it.entra_estoque && !(n(it.quantidade_estoque)>0)?'var(--critico)':'var(--borda)')+';border-radius:8px;text-align:center"></td>'
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

    const itens=N.itens.map((it,i)=>{
      const p=produtoPorId(it.produto_id);
      return {
        ordem:n(it.ordem)||(i+1),
        pagina:n(it.pagina)||null,
        produto_id:it.produto_id||null,
        cod_erp:it.cod_erp||null,
        descricao:it.descricao||null,
        quantidade_fiscal:n(it.quantidade_fiscal),
        unidade_fiscal:it.unidade_fiscal||null,
        valor_unit:n(it.valor_unit)||null,
        valor_total:n(it.valor_total)||null,
        quantidade_estoque:it.entra_estoque?n(it.quantidade_estoque):null,
        entra_estoque:!!it.entra_estoque,
        vincular_cod_erp:!!(it.entra_estoque && p && it.cod_erp && it.vincular_cod_erp)
      };
    });
    const somaNota=N.itens.reduce((a,x)=>a+n(x.valor_total),0);
    const totalNota=n(N.valor_total_danfe) || n(N.valor_total) || somaNota;
    N.valor_total=totalNota;
    const nota={
      numero:N.numero, serie:N.serie||null, fornecedor:N.fornecedor||null,
      emissao:N.emissao||null, entrada:N.entrada||new Date().toISOString().slice(0,10),
      valor_total:totalNota||null, arquivo:N.arquivo||null, chave_nfe:N.chave_nfe||null
    };
    _nfeSalvando=true; renderPreview();
    try{
      const {data,error}=await sb.rpc('tinta_importar_nfe',{p_nota:nota,p_itens:itens});
      if(error) throw error;
      _nfeAtual=null; _nfePasso=0; _nfeConfFinal=false; _nfeNotasCarregadas=false;
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
    _nfeAtual=null; _nfeSalvando=false; _nfePasso=0; _nfeConfFinal=false;
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
          +'<td style="text-align:center">'+(x.entra_estoque?Number(x.quantidade_estoque||0).toLocaleString('pt-BR',{maximumFractionDigits:3})+' lata(s) · '+Number((x.quantidade_estoque||0)*2).toLocaleString('pt-BR',{maximumFractionDigits:3})+' kg':'—')+'</td>'
          +(ve$?'<td style="text-align:right">'+(x.preco_aplicado?_tBRL(x.preco_aplicado)+'/kg':'—')+'</td>':'')+'</tr>').join('')
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

  /* Estoque: preço é por KG; saldo operacional continua em latas.
     Como 1 lata = 2 kg, mostramos as duas unidades e valorizamos pelos kg. */
  window.tintaTelaEstoque=function(box){
    const L=_tintaSaldo||[];
    const tot=L.reduce((a,x)=>a+(+x.valor||0),0);
    const latas=L.reduce((a,x)=>a+(+x.saldo||0),0);
    const kg=L.reduce((a,x)=>a+(+x.saldo_kg||0),0);
    const baixo=L.filter(x=>x.abaixo_minimo&&x.ativo);
    const semPreco=L.filter(x=>x.saldo>0&&x.preco_atencao);
    const f=String(_tintaBusca||'').trim().toLowerCase();
    const vis=_tintaFiltra(f?L.filter(x=>(String(x.nome||'')+' '+String(x.cod_erp||'')+' '+String(x.fornecedor||'')).toLowerCase().includes(f)):L)
      .filter(x=>x.saldo>0||f);

    box.innerHTML='<div class="idet-grid">'
      +'<div><b>'+_tNum(latas)+'</b><span>latas em estoque</span></div>'
      +'<div><b>'+Number(kg||0).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg</b><span>peso em estoque</span></div>'
      +(_tintaVeDinheiro()?'<div><b>'+_tBRL(tot)+'</b><span>valor do estoque</span></div>':'')
      +'<div><b style="color:'+(baixo.length?'var(--critico)':'var(--verde)')+'">'+baixo.length+'</b><span>abaixo do mínimo</span></div>'
      +'</div>'
      +(semPreco.length?'<p class="desc" style="margin-top:8px;background:#FFF6E6;border-left:3px solid var(--laranja);padding:7px 10px;border-radius:6px">⚠️ <b>'+semPreco.length+' item(ns) com preço não atualizado</b>.</p>':'')
      +_tintaBarraMarcas()
      +'<input id="tintaBusca" type="search" placeholder="🔎 buscar cor, código ou fornecedor…" value="'+escapeHtml(_tintaBusca||'')+'" oninput="_tintaBusca=this.value;tintaRender()" style="width:100%;margin:10px 0;padding:9px 11px;border:1px solid var(--borda);border-radius:10px;font-size:14px">'
      +'<div style="overflow-x:auto"><table style="width:100%;font-size:13px"><thead><tr>'
      +'<th style="text-align:left">Cor</th><th>Latas</th><th>Kg</th><th>Mín.</th>'
      +(_tintaVeDinheiro()?'<th style="text-align:right">Preço/kg</th><th style="text-align:right">Valor</th>':'')
      +'</tr></thead><tbody>'
      +vis.map(x=>{
        const bx=x.abaixo_minimo&&x.ativo;
        return '<tr style="border-top:1px solid var(--linha)">'
          +'<td style="text-align:left"><b>'+_bolinha(x.nome)+escapeHtml(x.nome)+'</b>'
          +'<div class="desc" style="font-size:10.5px">'+escapeHtml(x.fornecedor||'')+(x.cod_barras?' · <b>'+escapeHtml(x.cod_barras)+'</b>':'')
          +(x.preco_aviso?'<br><span style="color:var(--laranja-4,#9E5514);font-weight:700">⚠️ '+escapeHtml(x.preco_aviso)+'</span>':'')+'</div></td>'
          +'<td style="text-align:center;font-weight:800;color:'+(bx?'var(--critico)':'inherit')+'">'+_tNum(x.saldo)+'</td>'
          +'<td style="text-align:center;font-weight:700">'+Number(x.saldo_kg||0).toLocaleString('pt-BR',{maximumFractionDigits:1})+'</td>'
          +'<td style="text-align:center;color:var(--fraco-2)">'+_tNum(x.estoque_min)+'</td>'
          +(_tintaVeDinheiro()?'<td style="text-align:right">'+(x.preco?_tBRL(x.preco)+'/kg':'—')+'</td>'
            +'<td style="text-align:right;font-weight:700">'+(x.valor?_tBRL(x.valor):'—')+'</td>':'')
          +'</tr>';
      }).join('')
      +'</tbody></table></div>'
      +(!vis.length?'<p class="vazio-painel">Nada encontrado.</p>':'');
  };


  /* ===== RESUMOS GERENCIAIS DA CASA DE TINTAS — v4.638.27 =====
     Consumo sai dos movimentos em latas; o valor usa kg x preço/kg.
     Histórico de preço usa as NFs importadas e, como referência inicial,
     os preços históricos já existentes no cadastro ERP. */
  let _tResumoMetrica='kg';
  let _tResumoPreco={carregado:false,carregando:false,erp:[],notas:[],itens:[]};

  function _trMes(k){
    const p=String(k||'').split('-');
    return p.length===2 ? p[1]+'/'+p[0].slice(2) : k;
  }
  function _trPesoLata(p){
    const x=n(p&&p.peso_lata_kg);
    return x>0?x:2;
  }
  function _trConsumo(){
    const meses={}, prod={};
    (_tintaMov||[]).forEach(m=>{
      if(String(m.tipo)!=='saida') return;
      const dia=String(m.quando||'').slice(0,10); if(!dia) return;
      const k=dia.slice(0,7), q=n(m.quantidade);
      const p=produtoPorId(m.produto_id);
      const kg=q*_trPesoLata(p), pr=n(p&&p.preco), val=kg*pr;
      if(!meses[k]) meses[k]={latas:0,kg:0,valor:0};
      meses[k].latas+=q; meses[k].kg+=kg; meses[k].valor+=val;
      const id=String(m.produto_id||'');
      if(!prod[id]) prod[id]={nome:(p&&p.nome)||'Sem cadastro',kg:0,latas:0,valor:0};
      prod[id].kg+=kg; prod[id].latas+=q; prod[id].valor+=val;
    });
    const ks=Object.keys(meses).sort().slice(-12);
    const ativos=ks.filter(k=>meses[k].kg>0);
    const atual=new Date().toISOString().slice(0,7);
    const mesAtual=meses[atual]||{latas:0,kg:0,valor:0};
    const media=ativos.length?ativos.reduce((a,k)=>a+meses[k].kg,0)/ativos.length:0;
    let maiorK='',maior={kg:0,latas:0,valor:0};
    ks.forEach(k=>{if(meses[k].kg>maior.kg){maiorK=k;maior=meses[k];}});
    const top=Object.values(prod).sort((a,b)=>b.kg-a.kg).slice(0,8);
    return {meses,ks,ativos,mesAtual,media,maiorK,maior,top};
  }
  function _trFmtMetrica(v,met){
    if(met==='valor') return _tBRL(v);
    if(met==='latas') return Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:1})+' lata(s)';
    return Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg';
  }
  function _trGrafConsumo(R){
    if(!R.ks.length) return '<p class="desc">Ainda não há saídas suficientes para montar o gráfico mensal.</p>';
    const met=_tResumoMetrica;
    const vals=R.ks.map(k=>n(R.meses[k][met]));
    const mx=Math.max(1,...vals);
    const botoes=[['kg','kg'],['latas','latas']];
    if(_tintaVeDinheiro()) botoes.push(['valor','R$']);
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 10px">'
      +botoes.map(x=>'<span onclick="tintaResumoMetrica(\''+x[0]+'\')" style="cursor:pointer;font-size:11.5px;font-weight:800;border-radius:999px;padding:5px 11px;'
        +(_tResumoMetrica===x[0]?'background:var(--navy);color:#fff':'background:var(--leve-2);color:var(--navy);border:1px solid var(--linha-2s)')+'">'+x[1]+'</span>').join('')
      +'</div>'
      +'<div style="display:flex;align-items:flex-end;gap:4px;height:165px;padding:8px 2px 0">'
      +R.ks.map(k=>{
        const M=R.meses[k],v=n(M[met]),h=Math.max(v?3:0,Math.round(v/mx*132));
        return '<div style="flex:1;min-width:24px;text-align:center" title="'+_trMes(k)+' · '+_trFmtMetrica(v,met)+' · '+_trFmtMetrica(M.kg,'kg')+'">'
          +'<div style="font-size:9px;color:var(--fraco-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(v?_trFmtMetrica(v,met).replace('R$ ',''):'')+'</div>'
          +'<div style="height:'+h+'px;background:var(--azul-2);border-radius:5px 5px 0 0;margin:2px auto 0;max-width:42px"></div>'
          +'<span style="font-size:9px;color:var(--fraco-2);display:block;margin-top:4px">'+_trMes(k)+'</span></div>';
      }).join('')
      +'</div>';
  }
  function _trTopConsumo(R){
    if(!R.top.length) return '<p class="desc">Sem consumo por cor no período.</p>';
    const mx=Math.max(1,...R.top.map(x=>x.kg));
    return '<div style="display:grid;gap:7px">'
      +R.top.map((x,i)=>'<div>'
        +'<div style="display:flex;justify-content:space-between;gap:8px;font-size:11.5px"><span><b>'+(i+1)+'º</b> '+escapeHtml(x.nome)+'</span><b>'+Number(x.kg).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg</b></div>'
        +'<div style="height:7px;background:var(--leve-2);border-radius:999px;overflow:hidden;margin-top:3px"><div style="height:100%;width:'+Math.max(2,Math.round(x.kg/mx*100))+'%;background:var(--navy);border-radius:999px"></div></div>'
        +'</div>').join('')
      +'</div>';
  }

  async function _trCarregaPreco(){
    if(_tResumoPreco.carregado||_tResumoPreco.carregando) return;
    _tResumoPreco.carregando=true;
    try{
      const [a,b,c]=await Promise.all([
        sb.from('tinta_erp_item').select('cod_erp,desc_erp,preco24,preco_ultimo,preco_ultimo_data').limit(500),
        sb.from('tinta_nota').select('id,numero,emissao,entrada,importado_em').order('importado_em',{ascending:false}).limit(120),
        sb.from('tinta_nota_item').select('nota_id,produto_id,cod_erp,descricao,preco_anterior,preco_aplicado').not('preco_aplicado','is',null).limit(1000)
      ]);
      _tResumoPreco.erp=(a&&!a.error&&a.data)||[];
      _tResumoPreco.notas=(b&&!b.error&&b.data)||[];
      _tResumoPreco.itens=(c&&!c.error&&c.data)||[];
    }catch(_){
      _tResumoPreco.erp=[];_tResumoPreco.notas=[];_tResumoPreco.itens=[];
    }finally{
      _tResumoPreco.carregando=false;_tResumoPreco.carregado=true;
      if(_tintaVista==='resumo') tintaRender();
    }
  }
  function _trGrafPreco(){
    if(!_tintaVeDinheiro()) return '';
    if(!_tResumoPreco.carregado) return '<p class="desc">Carregando histórico de preços…</p>';
    const rows=(_tResumoPreco.erp||[]).map(x=>{
      const a=n(x.preco24),b=n(x.preco_ultimo);
      return {nome:x.desc_erp||x.cod_erp||'Item',base:a,atual:b,data:x.preco_ultimo_data||'',pct:(a>0&&b>0)?((b-a)/a*100):0};
    }).filter(x=>x.base>0&&x.atual>0&&Math.abs(x.pct)>=0.01)
      .sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct)).slice(0,10);
    const notasPorId={};(_tResumoPreco.notas||[]).forEach(x=>notasPorId[x.id]=x);
    const mud=(_tResumoPreco.itens||[]).map(x=>{
      const a=n(x.preco_anterior),b=n(x.preco_aplicado),N=notasPorId[x.nota_id]||{},p=produtoPorId(x.produto_id);
      return {nome:(p&&p.nome)||x.descricao||x.cod_erp||'Item',antes:a,depois:b,pct:(a>0&&b>0)?((b-a)/a*100):0,
        data:N.emissao||N.entrada||String(N.importado_em||'').slice(0,10),numero:N.numero||''};
    }).filter(x=>x.antes>0&&x.depois>0&&Math.abs(x.depois-x.antes)>=0.01)
      .sort((a,b)=>String(b.data).localeCompare(String(a.data))).slice(0,8);
    let h='';
    if(rows.length){
      const mx=Math.max(1,...rows.map(x=>Math.abs(x.pct)));
      h+='<div class="titulo-sec" style="margin-top:14px">Alteração de preço · maiores variações</div>'
        +'<p class="desc" style="margin:3px 0 9px">Comparação entre a referência histórica do ERP e o último preço conhecido por kg.</p>'
        +'<div style="display:grid;gap:8px">'+rows.map(x=>{
          const w=Math.max(2,Math.round(Math.abs(x.pct)/mx*48));
          const pos=x.pct>=0;
          return '<div><div style="display:flex;justify-content:space-between;gap:8px;font-size:11px"><span style="max-width:72%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHtml(x.nome)+'</span><b>'+(x.pct>=0?'+':'')+x.pct.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%</b></div>'
            +'<div style="position:relative;height:10px;background:var(--leve-2);border-radius:999px;overflow:hidden;margin-top:3px">'
            +'<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--linha-2s)"></div>'
            +'<div style="position:absolute;top:1px;bottom:1px;'+(pos?'left:50%':'right:50%')+';width:'+w+'%;background:'+(pos?'var(--laranja-4,#9E5514)':'var(--azul-2)')+';border-radius:999px"></div></div>'
            +'<div class="desc" style="font-size:9.5px">'+_tBRL(x.base)+'/kg → '+_tBRL(x.atual)+'/kg'+(x.data?' · '+fmtD(x.data):'')+'</div></div>';
        }).join('')+'</div>';
    }else{
      h+='<div class="titulo-sec" style="margin-top:14px">Alteração de preço</div><p class="desc">Ainda não há duas referências de preço suficientes para montar o gráfico.</p>';
    }
    if(mud.length){
      h+='<div class="titulo-sec" style="margin-top:14px">Últimas alterações confirmadas por NF</div>'
        +'<div style="overflow-x:auto"><table style="width:100%;font-size:11.5px"><thead><tr><th style="text-align:left">Tinta</th><th>NF</th><th>Data</th><th style="text-align:right">Antes</th><th style="text-align:right">Novo</th><th style="text-align:right">Variação</th></tr></thead><tbody>'
        +mud.map(x=>'<tr style="border-top:1px solid var(--linha)"><td style="text-align:left">'+escapeHtml(x.nome)+'</td><td style="text-align:center">'+escapeHtml(x.numero||'—')+'</td><td style="text-align:center">'+fmtD(x.data)+'</td><td style="text-align:right">'+_tBRL(x.antes)+'</td><td style="text-align:right;font-weight:700">'+_tBRL(x.depois)+'</td><td style="text-align:right;font-weight:800">'+(x.pct>=0?'+':'')+x.pct.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%</td></tr>').join('')
        +'</tbody></table></div>';
    }
    return h;
  }

  function renderResumoGerencial(box){
    if(!box) return;
    if(!_tResumoPreco.carregado&&!_tResumoPreco.carregando) setTimeout(_trCarregaPreco,0);
    try{
      if(typeof _tBalHist!=='undefined' && _tBalHist===null && typeof tintaBalHistCarregar==='function'){
        tintaBalHistCarregar().then(()=>{if(_tintaVista==='resumo')tintaRender();});
      }
    }catch(_){}
    const R=_trConsumo(),ve$=_tintaVeDinheiro();
    const baixo=(_tintaSaldo||[]).filter(x=>x.abaixo_minimo&&x.ativo&&n(x.saldo)>=0);
    const neg=(_tintaSaldo||[]).filter(x=>n(x.saldo)<0);
    const maiorTxt=R.maiorK ? Number(R.maior.kg).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg' : '0 kg';
    const top1=R.top[0];
    let inv='';
    try{
      if(typeof _tintaGrafInventario==='function') inv='<div class="titulo-sec" style="margin-top:16px">Diferença do inventário</div>'+_tintaGrafInventario();
    }catch(_){}
    box.innerHTML=
      (neg.length?'<p class="desc" style="background:#FBE9E9;border-left:3px solid var(--critico);padding:7px 10px;border-radius:6px"><b>'+neg.length+' cor(es) com saldo negativo</b> — acertar no balanço.</p>':'')
      +'<div class="idet-grid">'
      +'<div><b>'+Number(R.mesAtual.kg).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg</b><span>consumo mês atual</span></div>'
      +'<div><b>'+Number(R.media).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg</b><span>consumo médio / mês</span></div>'
      +'<div><b>'+maiorTxt+'</b><span>maior consumo'+(R.maiorK?' · '+_trMes(R.maiorK):'')+'</span></div>'
      +'<div><b>'+(top1?escapeHtml(top1.nome):'—')+'</b><span>tinta mais consumida</span></div>'
      +(ve$?'<div><b>'+_tBRL(R.mesAtual.valor)+'</b><span>valor estimado no mês</span></div>':'')
      +'<div><b style="color:'+(baixo.length?'var(--critico)':'var(--verde)')+'">'+baixo.length+'</b><span>abaixo do mínimo</span></div>'
      +'</div>'
      +'<div class="titulo-sec" style="margin-top:14px">Consumo mensal</div>'
      +'<p class="desc" style="margin:3px 0 6px">Últimos 12 meses com saídas registradas. Valor em R$ é estimado usando o preço atual por kg.</p>'
      +_trGrafConsumo(R)
      +'<div class="titulo-sec" style="margin-top:16px">Maior consumo por tinta</div>'
      +_trTopConsumo(R)
      +_trGrafPreco()
      +inv
      +'<div class="titulo-sec" style="margin-top:16px">Resumo mensal</div>'
      +'<div style="overflow-x:auto"><table style="width:100%;font-size:12px"><thead><tr><th style="text-align:left">Mês</th><th>Latas</th><th>kg</th>'+(ve$?'<th style="text-align:right">Valor estimado</th>':'')+'</tr></thead><tbody>'
      +R.ks.slice().reverse().map(k=>{const M=R.meses[k];return '<tr style="border-top:1px solid var(--linha)"><td style="text-align:left">'+_trMes(k)+'</td><td style="text-align:center">'+Number(M.latas).toLocaleString('pt-BR',{maximumFractionDigits:1})+'</td><td style="text-align:center;font-weight:700">'+Number(M.kg).toLocaleString('pt-BR',{maximumFractionDigits:1})+'</td>'+(ve$?'<td style="text-align:right">'+_tBRL(M.valor)+'</td>':'')+'</tr>';}).join('')
      +'</tbody></table></div>'
      +(baixo.length?'<div style="margin-top:16px"><div class="titulo-sec">Abaixo do mínimo · comprar</div>'+baixo.sort((a,b)=>n(a.saldo)-n(b.saldo)).slice(0,20).map(x=>'<div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid var(--linha);font-size:12.5px"><span>'+_bolinha(x.nome)+'<b>'+escapeHtml(x.nome)+'</b></span><span><b style="color:var(--critico)">'+_tNum(x.saldo)+'</b> <span class="desc">de mín. '+_tNum(x.estoque_min)+'</span></span></div>').join('')+'</div>':'');
  }
  function ajustarResumoBotao(){
    const b=document.querySelector('#tintaSubAbas [data-tv="resumo"]');
    if(b) b.innerHTML='📊 Resumos';
  }
  window.tintaResumoMetrica=function(v){
    if(v==='kg'||v==='latas'||(v==='valor'&&_tintaVeDinheiro())){_tResumoMetrica=v;tintaRender();}
  };
  try { tintaTelaResumo=renderResumoGerencial; } catch(_) { window.tintaTelaResumo=renderResumoGerencial; }
  setTimeout(ajustarResumoBotao,0);

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