// El simulador tiene que aguantar las formas que llegan de verdad, no solo la
// categoría bien armada. Nace de un reporte de "se cierra al poner una nota":
// no se reprodujo ese caso, pero sí aparecieron dos formas en que la ventana
// quedaba rota o sucia sin decir por qué.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const leer=f=>fs.readFileSync(raiz+f,'utf8');
function elemento(){let html='';const a={};const n={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false}},children:[],value:'',textContent:'',dataset:{},disabled:false,checked:false,
 addEventListener(){},appendChild(h){this.children.push(h);return h},setAttribute(k,v){a[k]=v},removeAttribute(k){delete a[k]},getAttribute(k){return a[k]||null},querySelector(){return n},querySelectorAll(){return[]},focus(){},select(){},remove(){},click(){},clientWidth:400};
 Object.defineProperty(n,'innerHTML',{get(){return html},set(v){html=String(v);this.children=[]}});return n;}
const ids={};const porId=id=>ids[id]||(ids[id]=elemento());
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
 document:{getElementById:porId,createElement:elemento,addEventListener(){},documentElement:elemento(),querySelector:()=>elemento(),querySelectorAll:()=>[],body:elemento()},
 localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);
vm.runInContext(['data.js','engine.js','app.js','render-main.js','render-agenda.js'].map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n'),ctx);
const run=c=>vm.runInContext(c,ctx);
run('save=()=>{};track=()=>{};closeModal=()=>{};openModal=()=>{};showToast=()=>{};showConfirm=()=>{};');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
function montar(cats,gates){
  ctx.__c=JSON.parse(JSON.stringify(cats));
  run(`S={ramos:[{id:'r',nombre:'Ramo',color:'#000',categorias:__c,gates:${JSON.stringify(gates||[])}}],
    userName:'',careerSemestre:1,carrera:'ING-PC',tenant:'uc',onboardingDone:true,historial:[],sortMode:'manual'};
    currentRamoId='r';simState={};`);
}
const abreYAcepta=(cats,gates)=>{
  montar(cats,gates);
  try{ run('openSimuladorModal()'); porId('sim-in-c1').value='5.5'; run("simAddNota('c1')"); return null; }
  catch(e){ return e.constructor.name+': '+e.message; }
};

console.log('=== Una categoría sin su arreglo de notas no rompe la ventana ===');
// normalize() lo garantiza al cargar, pero una categoría creada en esta sesión
// por un camino que lo olvide llega sin él, y el simulador quedaba roto apenas
// se abría, sin mensaje.
chk('abrir y simular sobre una categoría sin `notas`',
  abreYAcepta([{id:'c1',nombre:'Controles',peso:50,slots:3,directNota:true},{id:'c2',nombre:'Examen',peso:50,notas:[]}])===null);
chk('lo mismo con compuertas puestas',
  abreYAcepta([{id:'c1',nombre:'Controles',peso:50,slots:3,directNota:true},{id:'c2',nombre:'Examen',peso:50,notas:[]}],
    [{type:'min_grade_required',catId:'c2',min:3.5,cap:3.9},{type:'group_min',catIds:['c1','c2'],min:4,cap:'self'}])===null);

console.log('\n=== Una casilla con fecha y sin nota no se muestra como nota ===');
// Desde que cada casilla puede tener su propia fecha, hay notas con `valor` en
// null: son una fecha agendada, no un resultado. Salían como etiqueta vacía.
montar([{id:'c1',nombre:'Laboratorios',peso:30,slots:3,directNota:true,notas:[
  {id:'n1',nombre:'Laboratorio 1',valor:null,peso:1,slot:0,fecha:'2026-10-02'},
  {id:'n2',nombre:'Laboratorio 2',valor:5.4,peso:1,slot:1}]},{id:'c2',nombre:'Examen',peso:70,notas:[]}]);
run('openSimuladorModal()');
const html=porId('sim-cats').innerHTML;
const reales=(html.match(/class="sim-chip real"/g)||[]).length;
chk('la casilla agendada sin nota no aparece entre las reales',reales===1);
chk('y la que sí tiene nota sigue apareciendo con su valor',/Laboratorio 2<\/span>|Laboratorio 2: 5\.4/.test(html)||html.includes('5.4'));

console.log('\n=== El ramo es el título, porque la ventana tapa todo ===');
// "Simular escenario" servía para cualquiera de los seis ramos del semestre, y
// al cubrir la pantalla entera la cabecera de la ficha que lo decía deja de
// verse: esta ventana tiene que decir sola de qué ramo habla.
montar([{id:'c1',nombre:'Examen',peso:100,directNota:true,notas:[]}]);
run("S.ramos[0].nombre='Cálculo II';S.ramos[0].seccion=3;");
run('openSimuladorModal()');
const cabecera=porId('modal-content').innerHTML;
chk('el ramo es el título, no un subtítulo',/class="modal-title sim-ramo">Cálculo II/.test(cabecera));
chk('y "Simular escenario" va debajo del ramo',
  cabecera.indexOf('sim-ramo')<cabecera.indexOf('sim-kicker')&&/class="sim-kicker"/.test(cabecera));
chk('y la sección cuando la hay',/Sección 3/.test(cabecera));
run("S.ramos[0].seccion=null;");run('openSimuladorModal()');
chk('sin sección no inventa una',!/Sección/.test(porId('modal-content').innerHTML));

console.log('\n=== Ocupa la pantalla entera, sin tapar los botones ===');
// Eran 36vh fijos. El 330px restado es el resto de la ventana —antetítulo,
// ramo, bajada, promedio y botones—, que mide casi lo mismo en cualquier
// teléfono; por eso va en píxeles y el alto de pantalla en dvh.
const css=leer('styles.css');
chk('la ventana del simulador se estira a la pantalla completa',
  /\.modal-overlay:has\(\.sim-cats\)\{align-items:stretch;\}/.test(css) &&
  /\.modal-sheet:has\(\.sim-cats\)\{max-height:none;border-radius:0;\}/.test(css));
chk('la lista se calcula contra el alto de la pantalla, no en un valor fijo',
  /\.sim-cats\{max-height:max\(150px,calc\(100dvh - 330px\)\)/.test(css));
chk('y deja un piso para pantallas bajas o con el teclado abierto',/max\(150px,/.test(css));

console.log('\n=== Las pautas reales de Ingeniería UC siguen andando ===');
// Barrido sobre la malla: es el caso que un estudiante tiene de verdad.
run(`S={ramos:[],userName:'',careerSemestre:1,carrera:'ING-PC',tenant:'uc',onboardingDone:true,historial:[],sortMode:'manual'};`);
const ramos=run(`Object.values(MALLA_UC['ING-PC']||{}).flat()`);
let conPauta=0,rotos=0;
for(const nombre of ramos){
  ctx.__n=nombre;
  run('S.ramos=[];currentRamoId=null;simState={};');
  let r;try{ r=run('crearRamoDesdeCatalogo(__n,null)'); }catch(e){ rotos++; continue; }
  if(!r||!(r.categorias||[]).length)continue;
  conPauta++;
  run(`currentRamoId=S.ramos[0].id;simState={};
    S.ramos[0].categorias.forEach((c,i)=>{if(Number.isInteger(c.slots)&&c.slots>1)c.notas=[{id:'x'+i,nombre:etiquetaCasilla(S.ramos[0],c,0),valor:4.5,peso:1,slot:0}];});`);
  try{
    run('openSimuladorModal()');
    for(const cid of run('S.ramos[0].categorias.map(c=>c.id)')){porId('sim-in-'+cid).value='5.5';run(`simAddNota(${JSON.stringify(cid)})`);}
  }catch(e){ rotos++; }
}
chk(`las ${conPauta} pautas de la malla aceptan una nota simulada en cada evaluación`,conPauta>0&&rotos===0);

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
