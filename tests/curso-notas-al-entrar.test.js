// Los promedios de la comparación con el curso se suben al ENTRAR, no solo al
// abrir Estadísticas. curso_posicion y universidad_posicion ignoran filas sin
// actualizar en 30 días (supabase/curso_posicion.sql): sin esto, quien usa la
// app sin abrir Estadísticas dejaba de contar aunque su promedio fuera real.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const fuente=['data.js','engine.js','app.js','app-session.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');

let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

function el(){let html='';const n={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false;}},children:[],dataset:{},value:'',
  addEventListener(){},removeEventListener(){},appendChild(h){return h;},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return el();},querySelectorAll(){return [];},focus(){},remove(){},closest(){return null;},src:''};
  Object.defineProperty(n,'innerHTML',{get(){return html;},set(v){html=String(v);}});return n;}

// Un dispositivo con la app completa y una nube falsa que anota cada RPC.
function dispositivo(nubeData){
  const llamadas=[],almacen=new Map([['gradehub_v1',JSON.stringify(nubeData)],['gradehub_cache_owner','u1']]);
  const cualquiera=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?(r=>r({data:null,error:null})):cualquiera(),apply:()=>cualquiera()});
  const cliente={
    rpc:async(nombre,args)=>{llamadas.push({nombre,args});return {data:null,error:null};},
    auth:{signOut:async()=>{}},
    from:t=>t!=='user_ramos'?cualquiera():{
      select:()=>({eq:()=>({maybeSingle:async()=>({data:{data:JSON.parse(JSON.stringify(nubeData))},error:null})})}),
      upsert:async()=>({error:null}),
      update:()=>{const q={eq:()=>q,is:()=>q,select:async()=>({data:[{user_id:'u1'}],error:null})};return q;},
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
  run(`showToast=()=>{};enterApp=()=>{};enterOnboarding=()=>{};renderHome=()=>{};aplicarConsensoAuto=async()=>0;supabaseClient=__cliente;currentUser={id:'u1'};`);
  return {run,llamadas,subidas:()=>llamadas.filter(l=>l.nombre==='curso_nota_set')};
}
const esperar=ms=>new Promise(r=>setTimeout(r,ms));
const estado=(extra={})=>({onboardingDone:true,tenant:'uc',userName:'Estudiante',careerSemestre:1,historial:[],sortMode:'manual',
  ramos:[
    {id:'r1',nombre:'Cálculo I',sigla:'MAT1610',color:'#2563eb',categorias:[{id:'c1',nombre:'I1',peso:100,notas:[{id:'n1',nombre:'I1',valor:5.5,peso:1}]}],gates:[]},
    {id:'r2',nombre:'Ramo inventado',color:'#7c3aed',categorias:[{id:'c2',nombre:'Examen',peso:100,notas:[{id:'n2',nombre:'Examen',valor:6,peso:1}]}],gates:[]},
  ],...extra});

(async()=>{
  console.log('=== Al entrar se renueva el promedio, sin abrir Estadísticas ===');
  {
    const d=dispositivo(estado());
    await d.run('afterLogin()');await esperar(50);
    const s=d.subidas();
    chk('sube el promedio del ramo con sigla',s.some(l=>l.args.p_sigla==='MAT1610'&&l.args.p_promedio===5.5&&l.args.p_tenant==='uc'));
    chk('un ramo sin sigla no se sube: no se sabe con quién compararlo',!s.some(l=>/inventado/i.test(JSON.stringify(l.args))));
    const antes=s.length;
    await d.run('subirNotasCurso()');
    chk('abrir Estadísticas en la misma visita, sin cambios, no repite la subida',d.subidas().length===antes);
  }
  console.log('\n=== Donde no corresponde ===');
  {
    const d=dispositivo(estado({onboardingDone:false}));
    await d.run('afterLogin()');await esperar(50);
    chk('con el onboarding sin terminar no se sube nada',d.subidas().length===0);
  }
  {
    // Sin la función (por ejemplo, un test que carga solo el bloque de sesión)
    // afterLogin no revienta: la llamada va detrás de un typeof.
    const src=fs.readFileSync(path.join(raiz,'app-session.js'),'utf8');
    chk('la llamada va protegida y sin await',/typeof subirNotasCurso==='function'\)subirNotasCurso\(\)\.catch/.test(src));
  }

  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
