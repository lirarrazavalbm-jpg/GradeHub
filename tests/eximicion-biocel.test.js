// Biocel permite eximirse con nota de presentación suficiente, pero GradeHub
// no conoce la asistencia de Taller. La app puede comprobar las notas; la parte
// que solo sabe el estudiante se confirma de forma explícita y reversible.
const fs=require('fs'),vm=require('vm');
const raiz=(process.env.GRADEHUB_ROOT||(__dirname+'/..')).replace(/\/$/,'')+'/';
const appPath=process.env.GRADEHUB_APP||raiz+'app.js';
const src=[raiz+'data.js',raiz+'engine.js',appPath,raiz+'app-session.js',raiz+'render-main.js',raiz+'render-agenda.js']
  .map(f=>fs.readFileSync(f,'utf8')).join('\n');

function classList(){const clases=new Set();return{add(...xs){xs.forEach(x=>clases.add(x));},remove(...xs){xs.forEach(x=>clases.delete(x));},toggle(x){clases.has(x)?clases.delete(x):clases.add(x);},contains(x){return clases.has(x);}};}
function el(){let html='';const attrs={};const nodo={style:{setProperty(){},removeProperty(){}},classList:classList(),children:[],textContent:'',value:'',dataset:{},hidden:false,
  addEventListener(){},appendChild(h){this.children.push(h);return h;},setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},getAttribute(k){return attrs[k]||null;},
  querySelector(){return nodo;},querySelectorAll(){return [];},focus(){},select(){},click(){},remove(){},clientWidth:400,clientHeight:700,scrollIntoView(){}};
  Object.defineProperty(nodo,'innerHTML',{get(){return html;},set(v){html=String(v);this.children=[];}});return nodo;}
const ids={};const byId=id=>ids[id]||(ids[id]=el());
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:byId,createElement:el,addEventListener(){},documentElement:el(),querySelector(){return el();},querySelectorAll(){return [];},body:el()},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  getComputedStyle:()=>({getPropertyValue:()=>''}),setTimeout(fn){fn();return 0},clearTimeout(){},requestAnimationFrame(){return 0},cancelAnimationFrame(){},console,gtag(){}
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=codigo=>vm.runInContext(codigo,ctx);
let ok=0,fail=0;
function chk(nombre,cond){if(cond){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}}
function cerca(a,b){return typeof a==='number'&&Math.abs(a-b)<0.005;}

const preset=run("presetRamo('Biología de la Célula','uc','ING-PC')");
const biocel={id:'bio',nombre:'Biología de la Célula',color:'#6484b8',origen:{tenant:'uc',carrera:'ING-PC'},categorias:preset.categorias,gates:preset.gates};
function nota(id,valor,slot){return {id,nombre:id,valor,peso:1,...(Number.isInteger(slot)?{slot}:{})};}
function cargarNotas(valor=5){
  const porNombre=n=>biocel.categorias.find(c=>c.nombre===n);
  porNombre('Interrogaciones').notas=[0,1,2].map(i=>nota('i'+i,valor,i));
  porNombre('Talleres').notas=[nota('t1',valor)];
  porNombre('Trabajos prácticos').notas=[0,1].map(i=>nota('tp'+i,valor,i));
  porNombre('Trabajo grupal').notas=[nota('tg',valor)];
  porNombre('Examen final').notas=[];
}
cargarNotas();ctx.__biocel=biocel;
run("S={...freshState(),tenant:'uc',ramos:[__biocel]};currentRamoId='bio';save=()=>{};track=()=>{};");

console.log('\n=== El programa deja de ser una regla a medias ===');
const def=run("PRESETS_UC['Biología de la Célula']");
chk('declara una eximición que necesita confirmación',!!def.eximicion&&def.eximicion.min===5&&def.eximicion.requiereConfirmacion===true);
chk('la eximición ya no queda en noCalcula',!(def.noCalcula||[]).some(x=>/eximir/i.test(x)));

console.log('\n=== El promedio solo ofrece; no afirma lo que la app no sabe ===');
let estado=run('estadoEximicion(__biocel)');
chk('con presentación 5,0 puede confirmar, pero aún no está eximido',estado&&estado.elegible===true&&estado.puedeConfirmar===true&&estado.activa===false);
chk('antes de confirmar el examen sigue pendiente',run("categoriaEximida(__biocel,__biocel.categorias.find(c=>c.nombre==='Examen final'))")===false);
run('renderRamo()');
chk('la ficha pregunta por notas completas y asistencia',/todas tus notas previas/i.test(byId('eximicion-warning').innerHTML)&&/asistencia de Taller/i.test(byId('eximicion-warning').innerHTML));

console.log('\n=== Confirmar activa la regla sin borrar datos ===');
let accionExiste=true;
try{run("confirmacion=null;showConfirm=(titulo,cuerpo,accion)=>{confirmacion={titulo,cuerpo,accion};};confirmarEximicionActual();");}catch(_){accionExiste=false;}
const dialogo=accionExiste?run('confirmacion'):null;
chk('la acción pide confirmación real',!!dialogo&&/eximición/i.test(dialogo.titulo)&&/asistencia/i.test(dialogo.cuerpo));
if(dialogo)run('confirmacion.accion()');else biocel.eximicionConfirmada=true;
estado=run('estadoEximicion(__biocel)');
chk('la declaración queda guardada aparte de la regla',biocel.eximicionConfirmada===true);
chk('confirmada, la eximición queda activa',estado&&estado.activa===true);
chk('el examen sale del cálculo y el ramo queda completo',run('ramoCompletamenteEvaluado(__biocel)')===true&&run('notaNecesaria(__biocel)')===null);
chk('el promedio de presentación se conserva como nota final',cerca(run('ramoAvg(__biocel)'),5));
run('renderRamo()');
const fichaActiva=byId('cat-list').children.map(x=>x.innerHTML).join('\n');
chk('la ficha dice que se eximió',/Te eximiste del Examen final/.test(byId('ramo-min-chip').textContent));
chk('el examen se oculta, pero sus datos no se borran',!/Examen final/.test(fichaActiva)&&biocel.categorias.some(c=>c.nombre==='Examen final'));
chk('puede corregir la confirmación',/corregirEximicionActual/.test(byId('eximicion-warning').innerHTML));

console.log('\n=== Una corrección posterior no borra la declaración ===');
cargarNotas(4.5);
estado=run('estadoEximicion(__biocel)');
chk('bajo 5,0 se desactiva y conserva la confirmación',estado&&estado.activa===false&&estado.confirmada===true&&biocel.eximicionConfirmada===true);
run('renderRamo()');
chk('explica que la declaración ya no se aplica',/se conserva, pero ya no se aplica/i.test(byId('eximicion-warning').innerHTML));
chk('el examen vuelve a aparecer',byId('cat-list').children.some(x=>/Examen final/.test(x.innerHTML)));
cargarNotas(5);
chk('si vuelve a cumplir, la declaración se reactiva sola',run('estadoEximicion(__biocel)?.activa')===true);

console.log('\n=== Las condiciones de notas siguen mandando ===');
cargarNotas(6);
biocel.categorias.find(c=>c.nombre==='Interrogaciones').notas[0].valor=3.9;
estado=run('estadoEximicion(__biocel)');
chk('una interrogación roja impide la eximición aunque el promedio supere 5,0',estado&&estado.activa===false&&estado.razon==='minimo_categoria');
biocel.categorias.find(c=>c.nombre==='Examen final').notas=[nota('ex',6)];
chk('si rindió el examen, nunca se borra ni se ignora su nota',run("estadoEximicion(__biocel)?.razon")==='examen_rendido'&&run("categoriaEximida(__biocel,__biocel.categorias.find(c=>c.nombre==='Examen final'))")===false);

console.log('\n=== La eximición automática que ya existía no cambia ===');
const transporte=run("presetRamo('Ingeniería de Sistemas de Transporte','uc','ING-PC')");
transporte.nombre='Ingeniería de Sistemas de Transporte';transporte.origen={tenant:'uc',carrera:'ING-PC'};
const controles=transporte.categorias.find(c=>c.nombre==='Controles');
controles.notas=[0,1,2,3,4].map(i=>nota('c'+i,5.5,i));
ctx.__transporte=transporte;
chk('Transporte se sigue eximiendo sin una confirmación nueva',run('estadoEximicion(__transporte)').activa===true);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
