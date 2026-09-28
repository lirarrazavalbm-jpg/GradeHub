// Dos bugs encontrados en la revisión del 2026-09-28. Datos sintéticos.
// 1. La comparación con el curso se guardaba la primera vez y no se renovaba
//    aunque cambiara el promedio: seguía la cifra vieja hasta recargar.
// 2. Un grupo de "varias notas" recién armado en la pauta propia partía
//    cerrado, y parecía que las evaluaciones habían desaparecido.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
function el(){return {style:{setProperty(){}},classList:{add(){},remove(){},contains(){return false}},dataset:{},value:'',checked:false,innerHTML:'',textContent:'',addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},querySelector(){return null},querySelectorAll(){return[]},focus(){}};}
const ids={};const get=id=>ids[id]||(ids[id]=el());
const ctx={console,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:get,querySelector:()=>el(),querySelectorAll:()=>[],createElement:el,addEventListener(){},documentElement:el(),body:el(),head:{appendChild(){}}},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},setTimeout,clearTimeout};
vm.createContext(ctx);
for(const f of ['data.js','engine.js','app.js'])vm.runInContext(fs.readFileSync(path.join(raiz,f),'utf8'),ctx,{filename:f});
const run=s=>vm.runInContext(s,ctx);

(async()=>{
  console.log('=== La comparación con el curso se renueva cuando cambia tu promedio ===');
  run(`S.tenant='uc';S.ramos=[{id:'r1',nombre:'Ramo Sintético',sigla:'ZZZ100',color:'#2563eb',categorias:[{id:'c1',nombre:'Prueba',peso:100,directNota:true,notas:[{id:'n1',valor:4.0}]}],gates:[]}];
    var currentUser={id:'u1'};globalThis.__sets=0;globalThis.__pos=0;globalThis.__mejor=10;
    var supabaseClient={rpc(n){if(n==='curso_nota_set'){__sets++;return Promise.resolve({error:null});}
      __pos++;return Promise.resolve({data:[{mejor_que:__mejor,total:6}],error:null});}};`);
  await run('subirNotasCurso()');let p=await run('cargarPosicionesCurso()');
  chk('primera vez: sube y pide la posición',run('__sets')===1&&run('__pos')===1&&p.r1.mejorQue===10);
  await run('subirNotasCurso()');p=await run('cargarPosicionesCurso()');
  chk('sin cambios no repite llamadas',run('__sets')===1&&run('__pos')===1);
  run("S.ramos[0].categorias[0].notas[0].valor=6.5;__mejor=80;");
  await run('subirNotasCurso()');p=await run('cargarPosicionesCurso()');
  chk('con otra nota, sube de nuevo y trae la posición nueva',run('__sets')===2&&run('__pos')===2&&p.r1.mejorQue===80);
  run("currentUser={id:'u2'};");
  await run('subirNotasCurso()');
  chk('otra cuenta en el mismo dispositivo no hereda la caché',run('__sets')===3&&run('_posCursoCache')===null);
  run("globalThis.__fallidas=0;supabaseClient.rpc=(n)=>{if(n==='curso_nota_set'){__fallidas++;return Promise.resolve({error:{message:'x'}});}return Promise.resolve({data:[],error:null});};S.ramos[0].categorias[0].notas[0].valor=5.0;");
  const warn=console.warn;console.warn=()=>{};
  await run('subirNotasCurso()');await run('subirNotasCurso()');
  console.warn=warn;
  chk('si la subida falla, se reintenta en vez de darla por hecha',run('__fallidas')===2);

  console.log('\n=== Un grupo de varias notas recién armado parte abierto ===');
  run(`S.ramos=[{id:'r2',nombre:'Ramo Manual',color:'#2563eb',categorias:[],gates:[]}];currentRamoId='r2';openCats={};
    save=()=>{};track=()=>{};closeModal=()=>{};renderRamo=()=>{};showToast=()=>{};
    pautaDraft=[{id:null,nombre:'Interrogación 1',peso:70,varias:false,cantidad:null},{id:null,nombre:'Controles',peso:30,varias:true,cantidad:3}];`);
  run('guardarPautaManual()');
  const ctrl=run("S.ramos[0].categorias.find(c=>c.nombre==='Controles')");
  chk('Controles quedó como grupo de 3 casillas',ctrl&&ctrl.slots===3&&ctrl.directNota===true);
  chk('y abierto, para ver dónde van las notas',run(`openCats['${ctrl.id}']`)===true);
  const i1=run("S.ramos[0].categorias.find(c=>c.nombre==='Interrogación 1')");
  chk('una evaluación simple no toca openCats',run(`openCats['${i1.id}']`)===undefined);
  run(`openCats={};S.ramos[0].categorias.find(c=>c.nombre==='Controles').notas=[{id:'x',valor:5,slot:0}];
    pautaDraft=S.ramos[0].categorias.map(c=>({id:c.id,nombre:c.nombre,peso:c.peso,varias:c.nombre==='Controles',cantidad:c.nombre==='Controles'?3:null,tieneNotas:(c.notas||[]).length>0}));`);
  run('guardarPautaManual()');
  chk('un grupo que ya tiene notas conserva su estado',run(`openCats['${ctrl.id}']`)===undefined);

  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
