// Las abreviaturas de estas pautas escondían qué evaluación era cada una,
// y Probabilidad tenía porcentajes distintos a los informados por el curso.
// Al corregirlas, las notas que alguien ya ingresó con los nombres antiguos
// tienen que seguir con la evaluación equivalente cuando acepte actualizar.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return stub},clientWidth:400,dataset:{},click(){}};
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:stub,querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},
  setTimeout,clearTimeout,console,
};
vm.createContext(ctx);
vm.runInContext(['data.js','engine.js','app.js'].map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n'),ctx);
const val=e=>vm.runInContext(e,ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n)}else{fail++;console.log('  FAIL '+n)}};
const firma=p=>(p.categorias||[]).map(c=>`${c.nombre}:${c.peso}${c.slots?`x${c.slots}`:''}`).join('|');
const nota=(id,valor)=>({id,nombre:'Nota',valor,peso:1,fecha:null,hora:null,fechaQuitada:false});

console.log('\n=== Pautas informadas de Comercial UC ===');
const macro=val("presetRamo('Introducción a la Macroeconomía','uc','COM')");
const proba=val("presetRamo('Probabilidad y Estadística','uc','COM')");
chk('Macro desarrolla las abreviaturas sin cambiar sus pesos',
  firma(macro)==='Control 1:16|Prueba 1:22|Prueba 2:22|Parte del profesor:10|Examen:30');
chk('Probabilidad refleja los porcentajes y las tres casillas sorpresa',
  firma(proba)==='Control 1:10|Control 2:10|Control 3:10|Prueba 1:20|Prueba 2:20|Controles sorpresa:5x3|Examen:25');
chk('ambas pautas siguen sumando 100%',
  [macro,proba].every(p=>Math.abs(p.categorias.reduce((s,c)=>s+c.peso,0)-100)<0.001));

console.log('\n=== Actualizar conserva las notas de los nombres anteriores ===');
const ramoMacro={categorias:[
  {id:'c1',nombre:'C1',peso:16,notas:[nota('n-c1',5.8)]},
  {id:'p1',nombre:'P1',peso:22,notas:[nota('n-p1',6.1)]},
  {id:'p2',nombre:'P2',peso:22,notas:[]},
  {id:'pp',nombre:'PP',peso:10,notas:[nota('n-pp',5.5)]},
  {id:'ex',nombre:'Examen',peso:30,notas:[]},
]};
ramoMacro.id='macro';ramoMacro.nombre='Introducción a la Macroeconomía';
ramoMacro.origen={tenant:'uc',carrera:'COM'};
ctx.ramoMacro=ramoMacro;
ramoMacro.pautaHuella=val('huellaPauta(ramoMacro.categorias)');
chk('el aviso no afirma que una nota renombrada quedará fuera de la pauta',
  val('cambioDePauta(ramoMacro)').notasFueraDePauta===false);
ctx.ramoMacro=ramoMacro;ctx.macroCats=macro.categorias;
val('fusionarPauta(ramoMacro,macroCats)');
chk('C1 pasa a Control 1 con su nota',
  ramoMacro.categorias.find(c=>c.nombre==='Control 1')?.notas[0]?.id==='n-c1');
chk('P1 pasa a Prueba 1 con su nota',
  ramoMacro.categorias.find(c=>c.nombre==='Prueba 1')?.notas[0]?.id==='n-p1');
chk('PP pasa a Parte del profesor con su nota',
  ramoMacro.categorias.find(c=>c.nombre==='Parte del profesor')?.notas[0]?.id==='n-pp');

const ramoProba={categorias:[
  {id:'s1',nombre:'Control sorpresa 1',peso:2,notas:[nota('n-s1',4.5)]},
  {id:'s2',nombre:'Control sorpresa 2',peso:2,notas:[nota('n-s2',5.0)]},
  {id:'s3',nombre:'Control sorpresa 3',peso:2,notas:[nota('n-s3',6.0)]},
]};
ctx.ramoProba=ramoProba;ctx.probaCats=proba.categorias;
val('fusionarPauta(ramoProba,probaCats)');
const sorpresa=ramoProba.categorias.find(c=>c.nombre==='Controles sorpresa');
chk('los tres controles sorpresa se agrupan sin perder notas',
  !!sorpresa&&sorpresa.notas.map(n=>n.id).join('|')==='n-s1|n-s2|n-s3');
chk('cada nota antigua conserva una casilla distinta',
  !!sorpresa&&sorpresa.notas.map(n=>n.slot).join('|')==='0|1|2');

console.log(`\n${ok} OK, ${fail} FAIL`);
if(fail)process.exit(1);
