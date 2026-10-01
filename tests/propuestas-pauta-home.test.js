// El aviso de Inicio se alimenta de la bandeja real y desaparece al resolver.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const leer=f=>fs.readFileSync(path.join(raiz,f),'utf8');
const el=()=>({style:{setProperty(){}},classList:{add(){},remove(){},contains(){return false}},
  addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelector(){return null},querySelectorAll(){return []},innerHTML:'',textContent:''});
const elementos={};const get=id=>elementos[id]||(elementos[id]=el());
const llamadas=[];
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:get,createElement:el,addEventListener(){},documentElement:el(),querySelector:()=>null,querySelectorAll:()=>[],body:el()},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},
  setTimeout,clearTimeout,console,syncToCloud(){}};
vm.createContext(ctx);vm.runInContext(['data.js','engine.js','app.js','render-main.js'].map(leer).join('\n'),ctx);
const run=s=>vm.runInContext(s,ctx);
const check=(name,ok)=>{if(!ok)throw Error(name);console.log('  OK  '+name);};
const id='12345678-1234-1234-1234-123456789abc';
const filas=[{id,tipo:'pauta',ramo:'Curso de prueba',ramo_key:'ABC1234',fuente:'Programa del curso',
  evaluaciones:[{nombre:'Control',peso:40},{nombre:'Examen',peso:60}]}];
ctx.filas=filas;ctx.llamadas=llamadas;
run(`currentUser={id:'u1'};S.ramos=[{id:'r1',nombre:'Curso de prueba',origen:{ramoKey:'ABC1234'},categorias:[]}];
  supabaseClient={rpc:async(nombre,args)=>{llamadas.push({nombre,args});return nombre==='listar_propuestas_pauta_agente'?{data:filas,error:null}:{error:null}}};`);

(async()=>{
  await run('cargarPropuestasPautaAgente()');
  const aviso=get('home-pautas-propuestas');
  check('la bandeja muestra aviso en Inicio',aviso.style.display==='block'&&/Curso de prueba/.test(aviso.innerHTML));
  check('el aviso abre la revisión sin aplicar',/abrirPropuestasPautaAgente\(\)/.test(aviso.innerHTML)
    &&run('S.ramos[0].categorias.length')===0);
  check('las propuestas no se abren como modal al iniciar',get('modal-content').innerHTML==='');
  ctx.openModal=()=>{};
  await run('cargarPropuestasPautaAgente({mostrar:true})');
  check('el botón de Ajustes sigue abriendo la revisión completa',/Pautas por revisar/.test(get('modal-content').innerHTML));
  await run(`resolverPropuestaPauta('${id}','descartada')`);
  check('resolver quita el aviso',aviso.style.display==='none'&&aviso.innerHTML==='');
  // La misma propuesta, ahora aceptada: solo entonces se manda al consenso.
  llamadas.length=0;
  ctx.track=()=>{};ctx.closeModal=()=>{};ctx.renderHome=()=>{};ctx.showToast=()=>{};
  await run('cargarPropuestasPautaAgente()');
  check('una propuesta pendiente no se reporta',!llamadas.some(x=>x.nombre==='submit_catalog_report'));
  await run(`aplicarPropuestaPauta('${id}')`);
  check('al aceptar se guarda la pauta',run('S.ramos[0].categorias.length')===2);
  check('al aceptar se suma al consenso una vez',llamadas.filter(x=>x.nombre==='submit_catalog_report').length===1
    &&!!run('S.ramos[0].consensoAportado'));
  check('el aviso desaparece tras aceptarla',aviso.style.display==='none');
  check('el HTML monta el aviso sobre los ramos',/id="home-pautas-propuestas"[^>]*aria-live="polite"[\s\S]*id="home-ramos"/.test(leer('index.html')));
  check('botón alcanzable y foco visible',/\.home-propuesta-row\{[^}]*min-height:44px/.test(leer('styles.css'))
    &&/\.home-propuesta-row:focus-visible/.test(leer('styles.css')));
  run(`currentUser={id:'u1'};supabaseClient.rpc=()=>new Promise(resolve=>{terminar=resolve})`);
  ctx.terminar=null;
  // Se resuelve desde la cuenta anterior después de que abrió otra: no pinta
  // sus pautas en el Inicio de la persona nueva.
  const pendiente=run('cargarPropuestasPautaAgente()');
  run(`currentUser={id:'u2'};propuestasPautaAgente=[];renderPropuestasPautaHome()`);
  // La promesa de la RPC anterior se guarda en el contexto del navegador.
  // El stub de arriba asignó `terminar` en ese mismo contexto.
  run('terminar({data:filas,error:null})');
  await pendiente;
  check('una respuesta tardía no muestra datos de otra cuenta',aviso.style.display==='none');
  console.log('PASS: aviso de pautas de agente');
})().catch(e=>{console.error(e);process.exitCode=1});
