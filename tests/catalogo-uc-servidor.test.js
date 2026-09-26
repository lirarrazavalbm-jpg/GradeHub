// "Agregar ramo" en la UC ya no descarga cursos-uc.js al abrirse: busca en
// public.catalogo_uc y muestra primero lo que más toma la gente de la misma
// carrera (supabase/catalogo_uc.sql). Si el servidor no responde, vuelve al
// archivo. Los cursos de este test son sintéticos, escritos acá.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const leer=f=>fs.readFileSync(path.join(raiz,f),'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const esperar=ms=>new Promise(r=>setTimeout(r,ms));

function elemento(){let html='';const n={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false}},children:[],value:'',textContent:'',dataset:{},
 addEventListener(){},appendChild(h){this.children.push(h);return h},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelector(){return n},querySelectorAll(){return[]},focus(){},select(){},remove(){},click(){}};
 Object.defineProperty(n,'innerHTML',{get(){return html},set(v){html=String(v);this.children=[]}});return n;}

function nuevaApp(servidor){
  const ids={},todos=[];const scripts={get length(){return todos.filter(x=>/cursos-uc\.js/.test(x.src||'')).length;},some:f=>todos.some(f)};
  const porId=id=>ids[id]||(ids[id]=elemento());
  const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
    document:{getElementById:porId,createElement:elemento,addEventListener(){},documentElement:elemento(),querySelector:()=>Object.assign(elemento(),{src:'app.js'}),querySelectorAll:()=>[],body:elemento(),
      head:{appendChild(s){todos.push(s);}}},
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},setTimeout,clearTimeout,console};
  vm.createContext(ctx);
  vm.runInContext(['data.js','engine.js','app.js'].map(leer).join('\n'),ctx);
  const run=c=>vm.runInContext(c,ctx);
  run("S={ramos:[],userName:'',careerSemestre:2,carrera:'ING-PC',tenant:'uc',onboardingDone:true,historial:[],sortMode:'manual'};");
  const consultas=[];
  if(servidor){
    ctx.__srv=servidor;ctx.__consultas=consultas;
    run(`var currentUser={id:'u1'};var supabaseClient={
      from(t){const q={pasos:[['from',t]],select(c){q.pasos.push(['select',c]);return q;},or(f){q.pasos.push(['or',f]);return q;},
        ilike(c,v){q.pasos.push(['ilike',c,v]);return q;},limit(n){q.pasos.push(['limit',n]);__consultas.push(q.pasos);return Promise.resolve(__srv.tabla(q.pasos));}};return q;},
      rpc(n,a){return Promise.resolve(__srv.rpc(n,a));}};`);
  }
  return {run,porId,scripts,consultas};
}

const SINTETICOS=[{sigla:'ZZZ100',nombre:'Curso Sintético de Prueba II',creditos:10},{sigla:'ZZZ200',nombre:'Optativo Sintético',creditos:5}];

(async()=>{
  console.log('=== El CSV compara lo mismo que la app ===');
  const {filas,busquedaDe}=require('../bin/catalogo-uc-csv.js');
  const app=nuevaApp(null);
  const lista=filas();
  const distintas=lista.filter(f=>app.run(`normBusqueda(normName(${JSON.stringify(f.nombre)}))`)!==f.busqueda);
  chk(`las ${lista.length} filas del CSV normalizan igual que el buscador`,lista.length>10000&&distintas.length===0);
  chk('los romanos quedan en cifras',busquedaDe('Cálculo II')==='calculo 2');
  chk('sin siglas repetidas',new Set(lista.map(f=>f.sigla)).size===lista.length);

  console.log('\n=== La consulta solo lleva letras y números ===');
  chk('"Cálculo II" busca calculo y 2',JSON.stringify(app.run("consultaCatalogoUc('Cálculo II')"))==='["calculo","2"]');
  chk('una sigla va tal cual',JSON.stringify(app.run("consultaCatalogoUc('MAT1620')"))==='["mat1620"]');
  chk('comas, puntos y paréntesis no llegan al filtro',app.run("consultaCatalogoUc('a,b.or(sigla.eq.x)')").every(t=>/^[a-z0-9]+$/.test(t)));
  chk('una sola letra no consulta',app.run("consultaCatalogoUc('c')")===null);

  console.log('\n=== Con el servidor respondiendo ===');
  let a=nuevaApp({tabla:()=>({data:[SINTETICOS[0]],error:null}),rpc:()=>({data:[SINTETICOS[1]],error:null})});
  a.run("renderCatalogResults('sintetico 2')");
  chk('mientras espera, no dice que el ramo no existe',/Buscando en el catálogo de la UC/.test(a.porId('m-ramo-results').innerHTML));
  await esperar(350);
  a.run("renderCatalogResults('sintetico 2')");
  chk('no descarga el archivo de cursos',a.scripts.length===0);
  chk('el curso del servidor aparece',/ZZZ100/.test(a.porId('m-ramo-results').innerHTML));
  chk('la consulta filtra por sigla o nombre y por cada palabra',JSON.stringify(a.consultas[0]).includes('sigla.ilike.SINTETICO%,busqueda.ilike.%sintetico%')&&JSON.stringify(a.consultas[0]).includes('"ilike","busqueda","%2%"'));
  const ramo=a.run("crearRamoDesdeCatalogo('Curso Sintético de Prueba II','ZZZ100')");
  chk('al agregarlo, trae su sigla y sus créditos',ramo.sigla==='ZZZ100'&&ramo.creditos===10);

  console.log('\n=== Lo frecuente de tu carrera va primero ===');
  a=nuevaApp({tabla:()=>({data:[],error:null}),rpc:(n,args)=>n==='cursos_frecuentes_uc'&&args.p_carrera==='ING-PC'?{data:[SINTETICOS[1]],error:null}:{data:null,error:{}}});
  a.run("renderCatalogResults('')");
  await esperar(50);
  a.run("renderCatalogResults('')");
  const primero=(a.porId('m-ramo-results').innerHTML.match(/cat-hit-name">([^<]+)/)||[])[1];
  chk('al abrir, el primero es el frecuente de tu carrera',primero==='Optativo Sintético');
  chk('y tampoco descarga el archivo',a.scripts.length===0);

  console.log('\n=== Si el servidor falla, el archivo de siempre ===');
  a=nuevaApp({tabla:()=>({data:null,error:{code:'PGRST205',message:'no existe'}}),rpc:()=>({data:null,error:{}})});
  a.run("renderCatalogResults('calculo')");
  await esperar(350);
  chk('sin tabla, pide cursos-uc.js',a.scripts.some(s=>/cursos-uc\.js/.test(s.src||'')));
  chk('y sigue diciendo que busca, no que el ramo no existe',/Buscando en el catálogo de la UC/.test((a.run("renderCatalogResults('zzzqqq')"),a.porId('m-ramo-results').innerHTML)));
  a=nuevaApp(null);
  a.run("renderCatalogResults('calculo')");
  chk('sin cliente de Supabase, también',a.scripts.some(s=>/cursos-uc\.js/.test(s.src||'')));

  console.log('\nPASS: '+ok+'   FAIL: '+fail);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
