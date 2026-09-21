const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const acorn=require('acorn');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const functions=new Map();
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc\s*=|application\//.test(m[1]))continue;
 const ast=acorn.parse(m[2],{ecmaVersion:'latest'});
 for(const n of ast.body)if(n.type==='FunctionDeclaration')functions.set(n.id.name,m[2].slice(n.start,n.end));
}
function context(names,values){const ctx=vm.createContext(values);for(const n of names)vm.runInContext(functions.get(n),ctx);return ctx;}
function query(result){return {select(){return this},update(){return this},eq(){return this},gte(){return this},order(){return this},limit(){return this},range(...args){return Promise.resolve(typeof result==='function'?result(...args):result)},then(resolve,reject){return Promise.resolve(typeof result==='function'?result():result).then(resolve,reject)}};}
async function main(){
 let calls=0,fail=true;
 const metas=context(['getMetas'],{metasData:null,sb:{from:()=>query(()=>{calls++;return fail?{data:null,error:{message:'failed'}}:{data:[{recurso_cod:'1',bloco:'Manhã',meta:123,so_com_producao:true}],error:null}})}});
 await assert.rejects(metas.getMetas());assert.equal(metas.metasData,null);fail=false;await metas.getMetas();await metas.getMetas();assert.equal(calls,2);assert.equal(metas.metasData['1']['Manhã'],123);assert.equal(metas.metasData['1'].__soComProd,true);
 console.log('PASS metas: falha nao fica no cache, nova tentativa funciona, valores preservados');
 let result={data:null,error:{message:'rejected'}};const task={id:1,progresso:20,concluida:false},messages=[];
 const tarefas=context(['salvarProg'],{tarefasData:[task],perfil:{nome:'Teste'},sb:{from:()=>query(()=>result)},toast:m=>messages.push(m),renderTarefas(){},atualizarSino(){}});
 await tarefas.salvarProg(1,100);assert.equal(task.progresso,20);assert.equal(task.concluida,false);assert(!messages.some(m=>m.includes('tarefa concluída')));
 result={data:[],error:null};await tarefas.salvarProg(1,100);assert.equal(task.concluida,false);
 result={data:[{id:1}],error:null};await tarefas.salvarProg(1,100);assert.equal(task.concluida,true);
 console.log('PASS tarefas: erro e zero linhas nao confirmam sucesso; gravacao confirmada conclui');
 let failPage=true;const orders=context(['buscarTodasOS'],{OS_COLS:'id',sb:{from:()=>query(start=>start===0?{data:Array.from({length:1000},(_,id)=>({id})),error:null}:failPage?{data:null,error:{message:'page failed'}}:{data:[{id:1000}],error:null})}});
 await assert.rejects(orders.buscarTodasOS());failPage=false;assert.equal((await orders.buscarTodasOS()).length,1001);
 const capped=context(['buscarTodasOS'],{OS_COLS:'id',sb:{from:()=>query({data:Array.from({length:1000},(_,id)=>({id})),error:null})}});
 await assert.rejects(capped.buscarTodasOS(),/limite/);
 console.log('PASS OS: falha de pagina e limite rejeitam resultado parcial; recuperacao funciona');
 let saveCalls=0;const recurrent={id:2,fixa:true,progresso:25,concluida:false};const recurrentMessages=[];
 const recurrentCtx=context(['registrarConclusaoRecorrente'],{perfil:{id:'fake',nome:'Teste'},toast:m=>recurrentMessages.push(m),renderTarefas(){},atualizarSino(){},sb:{from:()=>({insert:async()=>({error:{message:'insert failed'}}),update:()=>{saveCalls++;return query({data:[{id:2}],error:null})}})}});
 await recurrentCtx.registrarConclusaoRecorrente(recurrent);assert.equal(saveCalls,0);assert.equal(recurrent.progresso,25);assert(recurrentMessages[0].includes('não salvo'));
 console.log('PASS recorrente: falha de historico interrompe conclusao');
 const store=new Map([['rp_senha','DADO_FICTICIO'],['rp_email','teste@example.invalid']]);
 const fields={inLembrar:{checked:true},inEmail:{value:'teste@example.invalid'},inSenha:{value:'DADO_FICTICIO'}};
 const creds=context(['salvarCredenciais','preencherCredenciais'],{localStorage:{setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k),removeItem:k=>store.delete(k)},$:id=>fields[id]});
 creds.preencherCredenciais();assert(!store.has('rp_senha'));creds.salvarCredenciais();assert(!store.has('rp_senha'));assert.equal(store.get('rp_email'),'teste@example.invalid');
 console.log('PASS login: remove senha antiga, nunca persiste senha nova');
 const labels=context(['nomeRotinaHistorico'],{});assert.equal(labels.nomeRotinaHistorico('196'),'REST196');assert.equal(labels.nomeRotinaHistorico('241'),'REST241');assert.equal(labels.nomeRotinaHistorico('339'),'RGER339');assert.equal(labels.nomeRotinaHistorico('RVEN002'),'RVEN002');assert.equal(labels.nomeRotinaHistorico('621'),'RPCP621');
 let detail='';const hist=context(['verHistoricoDetalhe','nomeRotinaHistorico'],{historicoDados:[{rotina:'196',arquivo:'<script>test</script>',periodo_de:'2026-09-01',registros:5}],_ROTINA_TAB:{},abreDet:(title,body)=>{detail=body},escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),fmtData:s=>s,fmt:x=>x});hist.verHistoricoDetalhe(0);assert(detail.includes('5'));assert(!detail.includes('<script>'));assert(detail.includes('linha a linha ainda não está disponível'));
 assert(!html.includes('fmtDataSem(ate).slice(0, 10)'));
 console.log('PASS historico: nomes corretos, detalhe honesto, arquivo escapado, data sem corte');
 console.log('Todos os testes de confiabilidade passaram.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
