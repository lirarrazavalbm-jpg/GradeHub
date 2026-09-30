// La copia previa a importar no pasa de una cuenta a otra (2026-09-30).
// Antes, signOut() no la borraba: en un navegador compartido la siguiente
// persona veía "Deshacer importación", lo tocaba y le aparecían el nombre y las
// notas de la anterior, que además se subían a su cuenta. Reproducido con las
// funciones reales en el barrido de bugs del 2026-09-29.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const fuente=['data.js','engine.js','app.js','app-session.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');

let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

function el(){let html='';const n={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false;}},children:[],dataset:{},value:'',
  addEventListener(){},removeEventListener(){},appendChild(h){return h;},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return el();},querySelectorAll(){return [];},focus(){},remove(){},closest(){return null;},src:''};
  Object.defineProperty(n,'innerHTML',{get(){return html;},set(v){html=String(v);}});return n;}

// Un navegador: la app completa, su localStorage y una nube falsa.
function navegador(almacen,nubes){
  const cualquiera=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?(r=>r({data:null,error:null})):cualquiera(),apply:()=>cualquiera()});
  let uidActual=null;
  const cliente={
    rpc:async()=>({data:null,error:null}),auth:{signOut:async()=>{}},
    from:t=>t!=='user_ramos'?cualquiera():{
      select:()=>({eq:(_c,uid)=>({maybeSingle:async()=>({data:nubes[uid]?{data:JSON.parse(JSON.stringify(nubes[uid]))}:null,error:null})})}),
      upsert:async f=>{nubes[f.user_id]=JSON.parse(JSON.stringify(f.data));return {error:null};},
      update:v=>{const q={eq:(c,x)=>{if(c==='user_id')uidActual=x;return q;},is:()=>q,select:async()=>{nubes[uidActual]=JSON.parse(JSON.stringify(v.data));return {data:[{user_id:uidActual}],error:null};}};return q;},
    },
  };
  const ctx={
    window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
    document:{getElementById:()=>el(),createElement:el,addEventListener(){},removeEventListener(){},documentElement:el(),querySelector(){return null;},querySelectorAll(){return [];},body:el(),head:{appendChild(){}},visibilityState:'visible'},
    localStorage:{getItem:k=>almacen.has(k)?almacen.get(k):null,setItem:(k,v)=>almacen.set(k,String(v)),removeItem:k=>almacen.delete(k)},
    navigator:{},location:{origin:'',pathname:'/',hash:'',reload(){}},history:{replaceState(){}},
    setTimeout,clearTimeout,console:{...console,warn(){}},getComputedStyle:()=>({getPropertyValue:()=>''}),__cliente:cliente,
  };
  vm.createContext(ctx);vm.runInContext(fuente,ctx);
  const run=c=>vm.runInContext(c,ctx);
  run(`showToast=()=>{};enterApp=()=>{};enterOnboarding=()=>{};renderHome=()=>{};renderStats=()=>{};closeModal=()=>{};showAuthScreen=()=>{};
       aplicarConsensoAuto=async()=>0;supabaseClient=__cliente;showConfirm=(t,d,fn)=>fn();`);
  return {run,entrar:async uid=>{run(`currentUser={id:${JSON.stringify(uid)}};`);await run('afterLogin()');}};
}
const datosDeA=()=>({onboardingDone:true,tenant:'fen',userName:'Persona A',careerSemestre:1,historial:[],sortMode:'manual',
  ramos:[{id:'r1',nombre:'Ramo privado de A',color:'#000',categorias:[{id:'c1',nombre:'Solemne',peso:100,notas:[{id:'n1',nombre:'Solemne',valor:3.1,peso:1}]}],gates:[]}]});
const datosDeB=()=>({onboardingDone:true,tenant:'fen',userName:'Persona B',careerSemestre:1,historial:[],sortMode:'manual',ramos:[]});

(async()=>{
  console.log('=== Cerrar sesión y entrar con otra cuenta ===');
  {
    const almacen=new Map(),nubes={A:datosDeA(),B:datosDeB()};
    let nav=navegador(almacen,nubes);
    await nav.entrar('A');
    nav.run(`localStorage.setItem(PRE_IMPORT_KEY,JSON.stringify(S));`);   // A importó un respaldo
    chk('A tiene su copia previa a importar',nav.run('hayRespaldoPreImport()')===true);
    await nav.run('signOut()');
    chk('cerrar sesión la borra',!almacen.has('gradehub_v1_pre_import'));
    nav=navegador(almacen,nubes);await nav.entrar('B');
    chk('B no ve "Deshacer importación"',nav.run('hayRespaldoPreImport()')===false);
    nav.run('deshacerImport()');
    chk('y aunque lo intente, no recibe los datos de A',nav.run('S.userName')==='Persona B'&&!JSON.stringify(nubes.B).includes('Ramo privado de A'));
  }

  console.log('\n=== Una sesión que venció sin cerrarse ===');
  {
    // A importó y se fue sin cerrar sesión; B entra en el mismo navegador.
    const almacen=new Map(),nubes={A:datosDeA(),B:datosDeB()};
    let nav=navegador(almacen,nubes);
    await nav.entrar('A');
    nav.run(`localStorage.setItem(PRE_IMPORT_KEY,JSON.stringify(S));`);
    nav=navegador(almacen,nubes);await nav.entrar('B');
    chk('al entrar otra cuenta, la copia de A se borra',!almacen.has('gradehub_v1_pre_import'));
    chk('y B no la ve',nav.run('hayRespaldoPreImport()')===false);
  }

  console.log('\n=== La misma persona conserva su copia ===');
  {
    const almacen=new Map(),nubes={A:datosDeA()};
    let nav=navegador(almacen,nubes);
    await nav.entrar('A');
    nav.run(`localStorage.setItem(PRE_IMPORT_KEY,JSON.stringify(S));`);
    nav=navegador(almacen,nubes);await nav.entrar('A');                  // reabre la app
    chk('reabrir con la misma cuenta no borra su copia',nav.run('hayRespaldoPreImport()')===true);
  }

  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
