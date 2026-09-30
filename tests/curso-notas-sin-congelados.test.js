// Un ramo que ya no está no puede seguir contando en la posición del curso.
//
// Barrido del 2026-09-29: subirNotasCurso solo recorría los ramos de AHORA. Al
// borrar uno (confirmDeleteRamo) o archivar el semestre (S.ramos=[]) nadie
// mandaba el `p_promedio:null` que saca la fila, así que su último promedio
// quedaba para siempre en `curso_notas`: ensuciaba el "Igual o por sobre el X%"
// de los compañeros y el promedio de la persona en universidad_posicion.
//
// Se prueba con un cliente de Supabase falso que anota cada rpc, y con los
// flujos reales de borrar y archivar (showConfirm → botón de confirmar).
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js']
  .map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
function classList(){const c=new Set();return{add(...x){x.forEach(v=>c.add(v));},remove(...x){x.forEach(v=>c.delete(v));},contains(v){return c.has(v);},toggle(){}};}
function el(){let html='';const attrs={};
  const nodo={style:{setProperty(){},removeProperty(){}},classList:classList(),children:[],textContent:'',value:'',dataset:{},parentElement:null,
    addEventListener(){},appendChild(h){this.children.push(h);return h;},setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},getAttribute(k){return attrs[k]||null;},
    querySelector(){return nodo;},querySelectorAll(){return [];},focus(){},select(){},click(){},remove(){},scrollTo(){},clientWidth:400};
  nodo.parentElement=nodo;
  Object.defineProperty(nodo,'innerHTML',{get(){return html;},set(v){html=String(v);this.children=[];}});
  return nodo;}
const ids={};const byId=id=>ids[id]||(ids[id]=el());
const guardado={};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:byId,createElement:el,addEventListener(){},documentElement:el(),querySelector(){return el();},querySelectorAll(){return [];},body:el()},
  localStorage:{getItem(k){return k in guardado?guardado[k]:null;},setItem(k,v){guardado[k]=String(v);},removeItem(k){delete guardado[k];}},
  navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout:()=>0,clearTimeout(){},console:{...console,warn(){}}};
vm.createContext(ctx);vm.runInContext(src,ctx);
let ok=0,fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++;};

// Cliente falso: anota cada curso_nota_set. `caido` simula estar sin red.
const llamadas=[];let caido=false;
ctx.__fake={rpc:async(fn,args)=>{
  if(fn!=='curso_nota_set')return {data:null,error:null};
  if(caido)return {data:null,error:{message:'sin red'}};
  llamadas.push(args);return {data:null,error:null};
}};
vm.runInContext(`supabaseClient=__fake;currentUser={id:'u-sintetico-1'};`,ctx);

// Pauta sintética: tres ramos con sigla explícita, dos comparten sigla (la
// misma asignatura cargada dos veces, por ejemplo teoría y otra sección).
const ramo=(id,sigla,valor)=>({id,nombre:'Ramo '+id,sigla,color:'#6d5dd3',creditos:null,origen:null,gates:[],
  categorias:[{id:'c'+id,nombre:'Prueba',peso:100,notas:[{id:'n'+id,nombre:'Prueba',valor,peso:1}]}]});
ctx.__datos=JSON.stringify({tenant:'uc',onboardingDone:true,historial:[],
  ramos:[ramo('a','MAT1610',5.5),ramo('b','FIS1514',4.8),ramo('c','FIS1514',6.1)]});
vm.runInContext(`S=JSON.parse(__datos);`,ctx);

const subir=async()=>{llamadas.length=0;await vm.runInContext('subirNotasCurso()',ctx);return llamadas.slice();};
const nulls=ls=>ls.filter(a=>a.p_promedio===null).map(a=>a.p_sigla).sort();
const confirmar=()=>byId('confirm-action').onclick();

(async()=>{
  console.log('\n=== Primera subida: nada que sacar ===');
  let ls=await subir();
  chk('sube los tres ramos con su promedio', ls.length===3&&ls.every(a=>typeof a.p_promedio==='number'));
  chk('no manda ningún null', nulls(ls).length===0);
  chk('recuerda las siglas con dueño', /u-sintetico-1/.test(guardado.gradehub_curso_siglas||'')&&/MAT1610/.test(guardado.gradehub_curso_siglas));
  ls=await subir();
  chk('sin cambios no repite llamadas (firma)', ls.length===0);

  console.log('\n=== Borrar un ramo manda null para su sigla ===');
  vm.runInContext(`currentRamoId='a';confirmDeleteRamo();`,ctx);confirmar();
  chk('el ramo se borró de verdad', vm.runInContext(`S.ramos.map(r=>r.id).join()`,ctx)==='b,c');
  ls=await subir();
  chk('MAT1610 sale del curso', nulls(ls).join()==='MAT1610');
  chk('con la misma universidad', (ls.find(a=>a.p_promedio===null)||{}).p_tenant==='uc');
  ls=await subir();
  chk('y no se vuelve a mandar', ls.length===0);

  console.log('\n=== Una sigla compartida por otro ramo vigente no se borra ===');
  vm.runInContext(`currentRamoId='b';confirmDeleteRamo();`,ctx);confirmar();
  ls=await subir();
  chk('FIS1514 no recibe null', nulls(ls).length===0);
  chk('y sigue subiendo el promedio del ramo que queda', ls.some(a=>a.p_sigla==='FIS1514'&&a.p_promedio!==null));

  console.log('\n=== Sin red, el null se reintenta ===');
  vm.runInContext(`S.ramos.push(${JSON.stringify(ramo('d','ICS1113',5.0))});`,ctx);
  await subir();
  vm.runInContext(`S.ramos=S.ramos.filter(r=>r.id!=='d');`,ctx);
  caido=true;await subir();caido=false;
  ls=await subir();
  chk('al volver la red, ICS1113 sale del curso', nulls(ls).join()==='ICS1113');

  console.log('\n=== Archivar el semestre manda null para todas ===');
  vm.runInContext(`S.ramos.push(${JSON.stringify(ramo('e','MAT1203',4.2))});`,ctx);
  await subir();
  vm.runInContext(`confirmArchiveSemester();`,ctx);confirmar();
  chk('el semestre quedó vacío', vm.runInContext('S.ramos.length',ctx)===0);
  ls=await subir();
  chk('FIS1514 y MAT1203 salen del curso', nulls(ls).join()==='FIS1514,MAT1203');
  chk('y no se sube nada más', ls.length===2);

  console.log('\n=== La memoria es por cuenta ===');
  vm.runInContext(`S.ramos=[${JSON.stringify(ramo('f','EYP1113',5.9))}];`,ctx);
  await subir();
  vm.runInContext(`currentUser={id:'u-sintetico-2'};S.ramos=[];`,ctx);
  ls=await subir();
  chk('otra cuenta no manda null por siglas ajenas', ls.length===0);
  vm.runInContext(`currentUser={id:'u-sintetico-1'};`,ctx);
  await vm.runInContext('signOut()',ctx);
  chk('cerrar sesión borra la memoria', !('gradehub_curso_siglas' in guardado));

  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
