// Matemáticas Avanzadas II UAI: el examen (30%) es eximible con nota de
// presentación 5,0. La pauta lo declaraba, pero sin `ignoraDescartes:true` el
// motor lo ignoraba y el examen seguía pendiente con su 30% aunque la
// presentación pasara el 5,0 (reporte de un estudiante, 2026-09-25). Y el aviso
// de confirmación le pedía "asistencia de Taller", un requisito de Biocel UC.
//
// La pauta de ejemplo sale del catálogo a propósito: lo que se prueba es que
// ESTA pauta declare bien su eximición, no el mecanismo en abstracto.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js'].map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
function el(){let html='';const nodo={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false}},children:[],textContent:'',value:'',dataset:{},
  addEventListener(){},appendChild(h){return h;},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelector(){return nodo;},querySelectorAll(){return [];},focus(){},select(){},click(){},remove(){},clientWidth:400,clientHeight:700,scrollIntoView(){}};
  Object.defineProperty(nodo,'innerHTML',{get(){return html;},set(v){html=String(v);}});return nodo;}
const ids={};const byId=id=>ids[id]||(ids[id]=el());
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:byId,createElement:el,addEventListener(){},documentElement:el(),querySelector(){return el();},querySelectorAll(){return [];},body:el()},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  getComputedStyle:()=>({getPropertyValue:()=>''}),setTimeout(fn){fn();return 0},clearTimeout(){},requestAnimationFrame(){return 0},cancelAnimationFrame(){},console,gtag(){}};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=c=>vm.runInContext(c,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const com=run("CARRERAS_DECLARABLES.uai.find(x=>x.n==='Ingeniería Comercial').malla");
const p=run(`presetRamo('Matemáticas Avanzadas II','uai','${com}')`);
const r={id:'m',nombre:'Matemáticas Avanzadas II',color:'#000',origen:{tenant:'uai',carrera:com},categorias:p.categorias,gates:p.gates||[]};
const cat=n=>r.categorias.find(c=>c.nombre===n);
const nota=(id,v,s)=>({id,nombre:id,valor:v,peso:1,slot:s});
function notas(pruebas,controles){
  cat('Pruebas').notas=[0,1,2].map(i=>nota('p'+i,pruebas,i));
  cat('Controles').notas=[0,1,2].map(i=>nota('c'+i,controles,i));
  cat('Examen').notas=[];
}
ctx.__r=r;run("S={...freshState(),tenant:'uai',ramos:[__r]};currentRamoId='m';save=()=>{};track=()=>{};");

console.log('=== Con presentación sobre 5,0 se ofrece la eximición ===');
notas(6,5.5);   // presentación (6·49 + 5,5·21)/70 = 5,85
let e=run('estadoEximicion(__r)');
chk('el motor reconoce la regla', !!e);
chk('es elegible con 5,85', e&&e.elegible===true&&Math.abs(e.promedio-5.85)<0.005);
chk('pero no se aplica sola: pide confirmación', e&&e.activa===false&&e.puedeConfirmar===true);
run('renderRamo()');
const aviso=byId('eximicion-warning').innerHTML;
chk('el aviso pide lo de esta pauta', /rendiste todas las pruebas y controles/.test(aviso));
chk('y no el requisito de Biocel', !/Taller/.test(aviso));

console.log('\n=== Confirmada, el examen sale del cálculo ===');
r.eximicionConfirmada=true;
e=run('estadoEximicion(__r)');
chk('la eximición queda activa', e&&e.activa===true);
chk('el examen deja de estar vigente', !run('categoriasVigentes(__r)').some(c=>c.nombre==='Examen'));
chk('la nota final es la de presentación', Math.abs(run('ramoAvg(__r,undefined,S.ramos)')-5.85)<0.005);

console.log('\n=== Bajo 5,0 no hay eximición aunque esté confirmada ===');
notas(4.5,4.5);
e=run('estadoEximicion(__r)');
chk('no es elegible', e&&e.elegible===false&&e.activa===false);
chk('el examen sigue contando', run('categoriasVigentes(__r)').some(c=>c.nombre==='Examen'));
delete r.eximicionConfirmada;

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
