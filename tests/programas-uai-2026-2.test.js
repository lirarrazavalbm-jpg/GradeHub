const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const path=require('path');
const root=process.env.GRADEHUB_ROOT||(process.env.GRADEHUB_APP?path.dirname(process.env.GRADEHUB_APP):path.join(__dirname,'..'));
function sandbox(){
  const store=new Map(),elements=new Map();
  const element=()=>({style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false},toggle(){}},addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return []},querySelector(){return null},focus(){},select(){},value:'',innerHTML:'',textContent:'',dataset:{},clientWidth:375});
  const ctx={console,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element,addEventListener(){},documentElement:element(),body:element(),querySelector(){return null},querySelectorAll(){return []}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout(){return 1},clearTimeout(){},requestAnimationFrame(){}};
  vm.createContext(ctx);
  for(const f of ['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),ctx,{filename:f});
  ctx.run=s=>vm.runInContext(s,ctx);return ctx;
}
const note=(id,valor,slot)=>({id,nombre:id,valor,peso:1,...(slot===undefined?{}:{slot})});
const cat=(id,peso,notas=[],extra={})=>({id,nombre:id,peso,notas,directNota:true,...extra});
const course=(id,categorias,extra={})=>({id,nombre:id,categorias,creditos:10,origen:null,gates:[],...extra});

const ctx=sandbox();
const expected={
  'Escritura Argumentativa':[3.75,4.5,6.75,15,22.5,11.25,11.25,25],
  'Matemáticas Avanzadas I':[7,14,49,30],
  'Razonamiento Cuantitativo con Datos I':[35,26.25,8.75,15,15],
  'Introducción a la Microeconomía':[20,25,25,30],
  'Management':[20,20,20,25,15],
  'Introducción a la Macroeconomía':[15,20,20,20,25],
};
const plain=x=>JSON.parse(JSON.stringify(x));
const at=new Date('2026-09-08T12:00:00Z');
for(const [nombre,pesos] of Object.entries(expected)){
  const clave=ctx.findPresetName(nombre,'uai','COM');
  assert.equal(clave,nombre,'La UAI debe ofrecer '+nombre);
  const def=ctx.definicionPreset(nombre,'uai','COM');
  const p=ctx.presetRamo(nombre,'uai','COM',at);
  assert.deepEqual(plain(p.categorias.map(c=>c.peso)),pesos,nombre+': pesos sobre la final, no la presentación');
  assert.equal(p.categorias.reduce((s,c)=>s+c.peso,0),100);
  assert.equal(p.periodo,'2026-2');
  assert.equal(ctx.definicionPresetDelRamo({nombre,origen:{tenant:'uai',carrera:'COM'}}),def);
  assert.ok(ctx.presetsFueraDeMalla('uai','COM').includes(nombre));
  assert.ok(ctx.searchCatalog(nombre,'uai','COM',1).some(r=>r.nombre===nombre),'Alcanzable al agregar un ramo');
  assert.ok(def.reglasDelCurso.some(t=>t.includes('2026-2')),'Ámbito del programa visible');
  assert.ok(p.categorias.every(c=>c.notas.length===0),'No inventa notas');
}
const mat=ctx.presetRamo('Matemáticas Avanzadas I','uai','COM',at);
assert.deepEqual(plain(mat.categorias.map(c=>c.slots||null)),[3,3,3,null]);
assert.equal(mat.creditos,6);
const rcd=ctx.presetRamo('Razonamiento Cuantitativo con Datos I','uai','COM',at);
assert.equal(rcd.categorias.find(c=>c.nombre==='Controles').slots,5);
assert.equal(rcd.categorias.find(c=>c.nombre==='Pruebas teóricas').slots,2);
assert.equal(rcd.creditos,null,'No hay créditos en el programa MAT125');
const micro=ctx.presetRamo('Introducción a la Microeconomía','uai','COM',at);
assert.equal(micro.recuperativo,null,'No hereda el recuperativo de Micro FEN');
assert.equal(micro.gates.length,0,'ECO122 no exige mínimo de examen');
assert.equal(micro.creditos,6);
assert.ok(micro.categorias.every(c=>!c.slots&&!c.fecha),'No inventa cantidad de controles ni fechas');
const management=ctx.presetRamo('Management','uai','COM',at);
const controles=management.categorias.find(c=>c.nombre==='Controles');
assert.equal(controles.directNota,false);
assert.equal(controles.slots,undefined);
assert.deepEqual(plain(controles.dropLowest),{count:2});
assert.equal(management.gates[0].catId,controles.id);
assert.equal(management.gates[0].min,4);
assert.equal(management.gates[0].cap,3.9);
assert.equal(management.categorias.some(c=>/examen/i.test(c.nombre)),false,'La tercera solemne NO agrega un examen');
const macro=ctx.presetRamo('Introducción a la Macroeconomía','uai','COM',at);
assert.equal(macro.creditos,6);
assert.ok(macro.categorias.every(c=>!c.slots&&!c.dropLowest),'Al menos ocho / dos o tres descartes no son cantidades fijas');
const core=ctx.presetRamo('Escritura Argumentativa','uai','COM',at);
assert.equal(core.categorias.find(c=>c.nombre==='Análisis de textos 1').fecha,'2026-08-20');
assert.equal(core.categorias.find(c=>c.nombre==='Análisis de textos 2').fecha,'2026-08-27');
assert.equal(core.categorias.find(c=>c.nombre==='Examen').fecha,undefined,'Preparar un examen no es rendirlo');
assert.equal(core.categorias.find(c=>c.nombre==='Evaluación entre pares').slots,undefined,'Dos instancias sin reparto no equivalen a dos notas de igual peso');
assert.ok(ctx.presetRamo('Escritura Argumentativa','uai','COM',new Date('2027-03-01')).categorias.every(c=>!c.fecha),'No arrastra fechas 2026 a 2027');
// Agregar el registro no convierte un ramo manual homónimo en oficial.
assert.equal(ctx.definicionPresetDelRamo({nombre:'Management',origen:null}),null);
assert.equal(ctx.findPresetName('Management','uc','ING-PC'),null);
assert.equal(ctx.findPresetName('Management','fen','COM'),null);
// Un ramo existente y personalizado conserva categorías, notas y compuertas.
const old=ctx.normalize({ramos:[course('manual',[cat('mi-evaluacion',100,[note('primera',5.8)])],{nombre:'Management'})]}).ramos[0];
old.origen={tenant:'uai',carrera:'COM'};
ctx.old=old;ctx.run("S.tenant='uai';S.carrera='COM';S.ramos=[old]");
const before=JSON.stringify(old.categorias);
const avg=ctx.ramoAvg(old);
ctx.run('S=normalize(S)');
const loaded=ctx.run('S.ramos[0]');
assert.equal(JSON.stringify(loaded.categorias),before);
assert.equal(ctx.ramoAvg(loaded),avg);
console.log('Programas UAI: seis pautas verificadas, sin mezclar universidades ni modificar pautas personales');
