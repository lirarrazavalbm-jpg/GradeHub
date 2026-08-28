// La pauta manual es el camino habitual para ramos sin programa transcrito. La
// ayuda puede ahorrar escritura y aritmética, pero jamás elegir pesos por la
// persona ni reescribir una pauta que ya guardó.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','render-main.js','render-agenda.js'].map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelector(){return stub},querySelectorAll(){return []},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
const val=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++;};

console.log('\n=== El porcentaje restante se asigna solo cuando lo eliges ===');
vm.runInContext("pautaDraft=[{id:null,nombre:'Tarea',peso:20,tieneNotas:false,varias:false},{id:null,nombre:'Examen',peso:0,tieneNotas:false,varias:false}];",ctx);
let usarResto=null;try{usarResto=val('usarRestoPauta');}catch(_){}
if(usarResto)usarResto(1);
chk('asigna el resto a la fila explícita, no a una elegida por la app',
  val('pautaDraft[0].peso')===20&&val('pautaDraft[1].peso')===80);

console.log('\n=== Un grupo repetido puede declarar cuántas notas espera ===');
vm.runInContext("S={ramos:[{id:'r',nombre:'Ramo sin preset',categorias:[],gates:[]}]};currentRamoId='r';pautaDraft=[{id:null,nombre:'Tareas',peso:40,tieneNotas:false,varias:true,cantidad:4},{id:null,nombre:'Examen',peso:60,tieneNotas:false,varias:false,cantidad:null}];showToast=function(){};closeModal=function(){};renderRamo=function(){};save=function(){};",ctx);
val('guardarPautaManual')();
const tareas=val("S.ramos[0].categorias.find(c=>c.nombre==='Tareas')");
chk('guardar una cantidad explícita la convierte en slots',tareas&&tareas.directNota===false&&tareas.slots===4);

console.log('\n=== La ayuda no modifica una pauta existente por sí sola ===');
const examen=val("S.ramos[0].categorias.find(c=>c.nombre==='Examen')");
chk('la otra fila conserva exactamente el peso que escribió la persona',examen&&examen.peso===60&&!('slots' in examen));

vm.runInContext("S={ramos:[{id:'manual',nombre:'Pauta ajustada',categorias:[{id:'t',nombre:'Tareas',peso:35,directNota:false,slots:4,notas:[]},{id:'e',nombre:'Examen',peso:65,directNota:true,notas:[]}],gates:[]}]};currentRamoId='manual';pautaDraft=[{id:'t',nombre:'Tareas',peso:35,tieneNotas:false,varias:true,cantidad:4},{id:'e',nombre:'Examen',peso:65,tieneNotas:false,varias:false,cantidad:null}];",ctx);
val('guardarPautaManual')();
chk('al guardar sin cambios conserva una pauta manual ajustada',
  val("S.ramos[0].categorias.map(c=>c.nombre+':'+c.peso+':'+(c.slots||'')).join('|')")==='Tareas:35:4|Examen:65:');

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
