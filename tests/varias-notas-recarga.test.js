// Reproducción de los reportes de agosto: declarar varias notas, ingresarlas,
// recargar y volver a la ficha y al editor no debe esconder ninguna evaluación.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js']
  .map(f=>fs.readFileSync(f==='app.js'&&process.env.GRADEHUB_APP||raiz+f,'utf8')).join('\n');

function elemento(){
  let html='';const atributos={};
  const nodo={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false;}},children:[],value:'',textContent:'',dataset:{},
    addEventListener(){},appendChild(h){this.children.push(h);return h;},setAttribute(k,v){atributos[k]=v;},removeAttribute(k){delete atributos[k];},getAttribute(k){return atributos[k]||null;},
    querySelector(){return nodo;},querySelectorAll(){return [];},focus(){},select(){},remove(){},click(){},clientWidth:400};
  Object.defineProperty(nodo,'innerHTML',{get(){return html;},set(v){html=String(v);this.children=[];}});
  return nodo;
}
const ids={};const porId=id=>ids[id]||(ids[id]=elemento());
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:porId,createElement:elemento,addEventListener(){},documentElement:elemento(),querySelector(){return elemento();},querySelectorAll(){return [];},body:elemento()},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console,
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=code=>vm.runInContext(code,ctx);
run('save=()=>{};track=()=>{};closeModal=()=>{};openModal=()=>{};showToast=()=>{};animarPromedio=()=>{};mostrarEcoGpa=()=>{};');
let ok=0,fail=0;
function comprobar(nombre,cond){console.log(`  ${cond?'OK  ':'FAIL'} ${nombre}`);if(cond)ok++;else fail++;}
function ficha(){run('renderRamo()');return porId('cat-list').children.map(x=>x.innerHTML).join('\n');}
function recargar(){
  const guardado=JSON.parse(JSON.stringify(run('S')));
  ctx.__guardado=guardado;
  run('S=normalize(__guardado);openCats={};');
}

console.log('\n=== Casillas fijas creadas en el editor de pauta ===');
run(`S={...freshState(),ramos:[{id:'r',nombre:'Ramo manual',color:'#6d5dd3',categorias:[],gates:[]}]};currentRamoId='r';
  pautaDraft=[{id:null,nombre:'Controles',peso:60,tieneNotas:false,varias:true,cantidad:3},
    {id:null,nombre:'Prueba',peso:40,tieneNotas:false,varias:false,cantidad:null}];guardarPautaManual();`);
const cat=run("S.ramos[0].categorias.find(c=>c.nombre==='Controles')");
// La etiqueta de cada casilla la decide la app —desde #414 va en singular,
// "Control 1" y no "Controles 1"—, así que se le pregunta en vez de escribirla
// acá. Lo que este test cuida es que las casillas se VEAN, no cómo se redactan:
// con el nombre a mano, cambiar la redacción rompía esto sin que nada estuviera
// roto. Pasó al juntar #411 con #414, los dos verdes por separado.
const etiqueta=i=>run(`etiquetaCasilla(S.ramos[0],S.ramos[0].categorias.find(c=>c.nombre==='Controles'),${i})`);
comprobar('declarar tres controles crea tres casillas visibles',cat.slots===3&&cat.directNota===true&&ficha().includes(etiqueta(0))&&ficha().includes(etiqueta(2)));
ctx.__catId=cat.id;
run("setSlotNota(__catId,0,'5.0');setSlotNota(__catId,1,'5.2');");
comprobar('dos casillas guardan notas distintas',cat.notas.length===2&&cat.notas[0].slot===0&&cat.notas[1].slot===1);
comprobar('el modelo conserva promedio 5,1 y avance 40%',run('ramoAvg(S.ramos[0])')===5.1&&run('ramoProgress(S.ramos[0]).pct')===40);
recargar();
let html=ficha();
comprobar('al recargar aparecen ambas notas y la tercera casilla pendiente',/eval-group-body open/.test(html)&&/value="5\.0"/.test(html)&&/value="5\.2"/.test(html)&&html.includes(etiqueta(2)));
run('openPautaManualModal()');
comprobar('el editor reabre la pauta como varias notas con tres casillas',run("pautaDraft.find(f=>f.nombre==='Controles')?.varias")===true&&run("pautaDraft.find(f=>f.nombre==='Controles')?.cantidad")===3);
run('guardarPautaManual()');
comprobar('guardar la pauta de nuevo no borra ni esconde las notas',/value="5\.0"/.test(ficha())&&/value="5\.2"/.test(ficha()));

console.log('\n=== Lista abierta, cuando no se conoce cuántos controles habrá ===');
run(`S={...freshState(),ramos:[{id:'r2',nombre:'Otro ramo',color:'#6d5dd3',categorias:[],gates:[]}]};currentRamoId='r2';
  pautaDraft=[{id:null,nombre:'Controles',peso:30,tieneNotas:false,varias:true,cantidad:null},
    {id:null,nombre:'Examen',peso:70,tieneNotas:false,varias:false,cantidad:null}];guardarPautaManual();`);
const abierta=run("S.ramos[0].categorias.find(c=>c.nombre==='Controles')");
comprobar('sin cantidad, no inventa casillas y ofrece Agregar nota',abierta.directNota===false&&!abierta.slots&&/Agregar nota/.test(ficha()));
abierta.notas=[{id:'n1',nombre:'Control 1',valor:5,peso:1},{id:'n2',nombre:'Control 2',valor:5.2,peso:1}];
recargar();
run(`openCats['${abierta.id}']=true`);
html=ficha();
comprobar('al expandir después de recargar se ven las dos notas y se pueden editar',/Control 1/.test(html)&&/Control 2/.test(html)&&/openEditNotaModal/.test(html)&&/Agregar nota/.test(html));
run('openPautaManualModal()');
comprobar('el editor distingue lista abierta de casillas fijas',run("pautaDraft.find(f=>f.nombre==='Controles')?.varias")===true&&run("pautaDraft.find(f=>f.nombre==='Controles')?.cantidad")===null);

console.log('\n=== Agregar evaluación desde la ficha, sin pasar por el editor ===');
run("S={...freshState(),ramos:[{id:'r3',nombre:'Tercer ramo',color:'#6d5dd3',categorias:[],gates:[]}]};currentRamoId='r3';openCats={};");
porId('m-cat-name').value='Talleres';porId('m-cat-fecha').value='';porId('m-cat-varias').checked=true;
run('confirmAddCat()');
const talleres=run("S.ramos[0].categorias.find(c=>c.nombre==='Talleres')");
comprobar('marcar varias en Agregar evaluación dibuja la lista y su acción',talleres?.directNota===false&&!talleres.slots&&/Agregar nota/.test(ficha()));
porId('m-nota-name').value='Taller 1';porId('m-nota-val').value='5.1';porId('m-nota-fecha').value='';porId('m-pond-toggle').checked=false;
ctx.__talleresId=talleres.id;
run('confirmAddNota(__talleresId)');
recargar();run(`openCats['${talleres.id}']=true`);
comprobar('la nota creada desde la ficha sigue visible tras recargar',/Taller 1/.test(ficha())&&/5\.1/.test(ficha()));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
