// La nota final se redondea a una décima antes de decidir aprobación. El valor
// bruto 3,98 debe verse como 4,0 y todas las decisiones tienen que aprobarlo.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const root=process.env.GRADEHUB_ROOT||path.join(__dirname,'..');

function sandbox(){
  const elements=new Map();
  function element(){
    return {style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false;},toggle(){}},
      children:[],appendChild(child){this.children.push(child);},remove(){},addEventListener(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},
      querySelectorAll(){return [];},querySelector(){return null;},focus(){},select(){},click(){},value:'',innerHTML:'',textContent:'',dataset:{},clientWidth:375};
  }
  const document={getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,addEventListener(){},documentElement:element(),body:element(),querySelector(){return null;},querySelectorAll(){return [];}};
  const ctx={console,document,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout(){return 1;},clearTimeout(){},requestAnimationFrame(){}};
  vm.createContext(ctx);
  for(const file of ['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js']){
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
  }
  ctx.run=source=>vm.runInContext(source,ctx);
  return ctx;
}

const ctx=sandbox();
const nota=(id,valor)=>({id,nombre:id,valor,peso:1});
const categoria=(id,peso,valor)=>({id,nombre:id,peso,directNota:true,notas:[nota('n-'+id,valor)]});
const ramo=(id,categorias,extra={})=>({id,nombre:id,color:'#2563eb',creditos:10,origen:null,gates:[],categorias,...extra});
const exacto=ramo('borde-398',[
  categoria('a',20,2.4),categoria('b',20,4.0),categoria('c',20,4.0),categoria('d',30,4.0),categoria('e',10,7.0),
]);
ctx.exacto=exacto;

const promedio=ctx.run('ramoAvg(exacto)');
assert.ok(Math.abs(promedio-3.98)<1e-9,'la fórmula reproducida debe dar 3,98');
assert.equal(ctx.run('fmt(ramoAvg(exacto))'),'4.0','la representación histórica ya redondeaba a una décima');
assert.equal(ctx.run('colorClass(ramoAvg(exacto))'),'warn','el estado debe usar la misma nota 4,0 que ya veía la persona');
assert.equal(ctx.run('notaFinalOficial(ramoAvg(exacto))'),4,'el valor oficial redondea a una décima');
assert.equal(ctx.run('fmtPromedio(ramoAvg(exacto))'),'4.0','la UI muestra la nota oficial');
assert.equal(ctx.run('notaAprobada(ramoAvg(exacto))'),true,'3,98 queda aprobado como 4,0');

const bordes=[
  [3.94,'3.9','bad',false],
  [3.95,'4.0','warn',true],
  [3.98,'4.0','warn',true],
  [3.99,'4.0','warn',true],
  [4.00,'4.0','warn',true],
  [4.95,'5.0','good',true],
  [5.00,'5.0','good',true],
];
for(const [valor,texto,nivel,aprueba] of bordes){
  ctx.valor=valor;
  assert.equal(ctx.run('fmtPromedio(valor)'),texto,`${valor} se representa sin cruzar el umbral`);
  assert.equal(ctx.run('colorClass(valor)'),nivel,`${valor} usa el semáforo correcto`);
  assert.equal(ctx.run('notaAprobada(valor)'),aprueba,`${valor} decide aprobación con el mismo valor`);
}

// La calculadora de un ramo ya cerrado debe repetir el mismo veredicto.
ctx.run('S={...freshState(),ramos:[exacto]};currentRamoId=exacto.id;openModal=()=>{};');
ctx.openCalculadoraModal();
ctx.document.getElementById('m-calc-target').value='4';
ctx.window.calcResult();
const calculadora=ctx.document.getElementById('calc-result').innerHTML;
assert.match(calculadora,/<b>4\.0<\/b>/,'Nota mínima muestra la nota oficial');
assert.match(calculadora,/ya lo lograste/,'Nota mínima también lo declara aprobado');
assert.doesNotMatch(calculadora,/te faltan/,'Nota mínima no exige puntos inexistentes');

const parcial=ramo('parcial',[categoria('mitad',50,4),{id:'pendiente',nombre:'pendiente',peso:50,directNota:true,notas:[]}]);
ctx.parcial=parcial;
assert.ok(Math.abs(ctx.run('notaNecesaria(parcial)')-3.9)<1e-9,'con 3,9 pendiente la final bruta 3,95 redondea a 4,0');

// Las compuertas siguen aplicándose antes de representar la nota final.
const fijo=ramo('tope-fijo',[categoria('trabajo',50,6),categoria('examen',50,2)],{
  gates:[{type:'min_grade_required',catId:'examen',min:3,cap:3.9,nombre:'Examen'}],
});
ctx.fijo=fijo;
assert.equal(ctx.run('ramoAvg(fijo)'),3.9);
assert.equal(ctx.run('fmtPromedio(ramoAvg(fijo))'),'3.9');
assert.equal(ctx.run('notaAprobadaRamo(fijo,ramoAvg(fijo))'),false);

const propio=ramo('tope-propio',[categoria('individual',50,3.98),categoria('grupal',50,6)],{
  gates:[{type:'group_min',catIds:['individual'],min:4,cap:'self',nombre:'Individual'}],
});
ctx.propio=propio;
assert.equal(ctx.run('r2(ramoAvg(propio))'),3.98,'cap self conserva el promedio del requisito');
assert.equal(ctx.run('fmtPromedio(ramoAvg(propio))'),'4.0','la nota se redondea aunque exista una regla aparte');
assert.equal(ctx.run('gatesActivas(propio).length'),1,'la compuerta sigue explícitamente activa');
assert.equal(ctx.run('notaAprobadaRamo(propio,ramoAvg(propio))'),false,'la compuerta explícita sigue reprobando');
assert.equal(ctx.run('colorClassRamo(propio,ramoAvg(propio))'),'bad','el semáforo refleja la excepción explícita');

// Los puntos visibles donde aparecía el promedio del ramo comparten el helper.
const main=fs.readFileSync(path.join(root,'render-main.js'),'utf8');
const agenda=fs.readFileSync(path.join(root,'render-agenda.js'),'utf8');
assert.match(main,/ramo-nota[^\n]+fmtPromedio\(avg\)/,'la tarjeta de Inicio usa el formato coherente');
assert.match(main,/const s=fmtPromedio\(avg\)/,'la ficha del ramo usa el formato coherente');
assert.match(main,/Promedio oficial: \$\{fmtPromedio\(g\)\}/,'el detalle del promedio general tampoco revive el 3,98');
assert.doesNotMatch(main,/Exacto: \$\{exacto\}/,'el detalle no vuelve a exigir centésimas después de aprobar');
assert.match(agenda,/fmtPromedio\(e\.avg\)/,'la Agenda usa el formato coherente');
assert.equal(ctx.run('fmtPromedio(simProjectedAvg(exacto))'),'4.0','el simulador parte del mismo resultado oficial');
ctx.openSimuladorModal();
assert.equal(ctx.document.getElementById('sim-delta').textContent,'Tu promedio actual: 4.0','el simulador no vuelve a revelar 3,98 como si fuera otro promedio');

console.log('OK: 3,98 se muestra como 4,0 y GradeHub lo considera aprobado');
