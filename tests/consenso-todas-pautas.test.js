// El origen del ramo no decide quién puede aportar: sí importa que la persona
// haya armado o corregido una pauta completa. No viajan notas ni votos copiados.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const src=['data.js','engine.js','app.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const nodo={style:{setProperty(){}},classList:{add(){},remove(){},contains(){return false}},addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelector(){return null},querySelectorAll(){return []},innerHTML:'',textContent:''};
const calls=[];
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>nodo,createElement:()=>nodo,addEventListener(){},documentElement:nodo,querySelector:()=>nodo,querySelectorAll:()=>[],body:nodo},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},
  setTimeout,clearTimeout,console,syncToCloud(){}};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
const J=x=>JSON.stringify(x);
const check=(name,ok)=>{if(!ok)throw Error(name);console.log('  OK  '+name);};
const cats=[{id:'c1',nombre:'Control',peso:40,notas:[{id:'n1',nombre:'Control',valor:6.2,peso:1}]},
  {id:'c2',nombre:'Examen',peso:60,notas:[]}];
const ramo=(extra={})=>({id:'r1',nombre:'Curso de prueba',sigla:'ABC1234',origen:null,
  categorias:JSON.parse(J(cats)),gates:[],...extra});
ctx.calls=calls;
run(`S.tenant='uc';S.carrera='Carrera de prueba';currentUser={id:'u1'};
  supabaseClient={rpc:async(nombre,args)=>{calls.push({nombre,args});return {error:null}}};`);

(async()=>{
  run('S.ramos='+J([ramo()]));
  await run('aportarPautasAlCatalogo()');
  check('ramo armado a mano aporta',calls.length===1&&calls[0].nombre==='submit_catalog_report');
  check('se agrupa por su sigla explícita',calls[0].args.p_ramo_sigla==='ABC1234'
    &&run('claveReporte(S.ramos[0])')==='ABC1234');
  run(`CREDITOS_UC['Curso de prueba']=[10,'ABC1234']`);
  check('un ramo manual sin sigla se une al del catálogo si el nombre es inequívoco',
    run('siglaReporteUC('+J(ramo({sigla:null}))+')')==='ABC1234');
  check('no viajan notas',calls[0].args.p_nota===null&&!J(calls[0].args.p_estructura).includes('6.2'));
  await run('aportarPautasAlCatalogo()');
  check('la misma persona no reenvía la misma versión',calls.length===1);

  calls.length=0;
  run('S.ramos='+J([ramo({origen:{tenant:'uc',carrera:'Carrera de prueba',ramoKey:'ABC1234'},pautaHuella:'otra pauta'})]));
  await run('aportarPautasAlCatalogo()');
  check('corrección de pauta oficial aporta',calls.length===1);

  calls.length=0;
  const intacta=ramo({origen:{tenant:'uc',carrera:'Carrera de prueba',ramoKey:'ABC1234'}});
  intacta.pautaHuella=run('huellaPauta('+J(cats)+')');
  run('S.ramos='+J([intacta]));
  await run('aportarPautasAlCatalogo()');
  check('pauta oficial intacta no se hace pasar por voto',calls.length===0);

  run('S.ramos='+J([ramo({consensoRespaldos:3})]));
  await run('aportarPautasAlCatalogo()');
  check('pauta recibida del consenso no se recircula',calls.length===0);

  run('S.ramos='+J([ramo({categorias:[cats[0]]})]));
  await run('aportarPautasAlCatalogo()');
  check('pauta incompleta espera',calls.length===0);

  // Una caída de red no marca el aporte como entregado; el próximo intento sí.
  run(`supabaseClient.rpc=async()=>({error:new Error('Sin red')});S.ramos=${J([ramo()])}`);
  await run('aportarPautasAlCatalogo()');
  check('fallo de red conserva el aporte pendiente',!run('S.ramos[0].consensoAportado'));
  run(`supabaseClient.rpc=async(nombre,args)=>{calls.push({nombre,args});return {error:null}}`);
  await run('aportarPautasAlCatalogo()');
  check('se reintenta después del fallo',calls.length===1&&!!run('S.ramos[0].consensoAportado'));
  const sql=fs.readFileSync(path.join(raiz,'supabase/catalog_consensus.sql'),'utf8');
  check('el servidor cuenta tres personas distintas, también para ramos manuales',
    /count\(distinct cr\.user_id\)::integer as respaldos/.test(sql)
    &&/having count\(distinct cr\.user_id\) >= 3/.test(sql)
    &&/sigla := public\.sigla_catalogo_uc\(p_ramo\)/.test(sql));
  console.log('PASS: consenso de todos los orígenes');
})().catch(e=>{console.error(e);process.exitCode=1});
