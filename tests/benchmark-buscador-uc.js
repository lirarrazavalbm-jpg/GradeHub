// Micro-benchmark reproducible para el catálogo completo de la UC.
// No termina en .test.js a propósito: mide tiempos y no debe volver inestable
// el CI. Se corre con: node tests/benchmark-buscador-uc.js
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const {performance}=require('perf_hooks');

const raiz=path.join(__dirname,'..');
const appPath=process.env.GRADEHUB_APP||path.join(raiz,'app.js');
const stub=()=>({
  style:{setProperty(){},removeProperty(){}},
  classList:{add(){},remove(){},contains(){return false},toggle(){}},
  addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},
  querySelector(){return null},querySelectorAll(){return[]},focus(){},select(){},click(){},
  value:'',innerHTML:'',textContent:'',dataset:{},clientWidth:375,
});
const ctx={
  console,
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{
    getElementById:()=>stub(),createElement:()=>stub(),addEventListener(){},documentElement:stub(),body:stub(),
    querySelector:()=>null,querySelectorAll:()=>[],head:{appendChild(){}},
  },
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},
  location:{origin:'https://gradehub.cl',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  setTimeout,clearTimeout,requestAnimationFrame(){return 1},cancelAnimationFrame(){},
};
vm.createContext(ctx);
for(const archivo of ['data.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(raiz,archivo),'utf8'),ctx,{filename:archivo});
vm.runInContext(fs.readFileSync(appPath,'utf8'),ctx,{filename:'app.js'});

const bases=[
  'Álgebra lineal','Biología molecular','Derecho constitucional','Economía política',
  'Historia contemporánea','Física experimental','Taller de diseño','Seminario interdisciplinario',
  'Química orgánica','Literatura chilena','Sociología urbana','Geometría diferencial',
];
const relleno='fundamentos avanzados y métodos para estudios interdisciplinarios de nivel superior';
function nombreRealista(i){
  // Miles de coincidencias para "ca" y unas 326 para "calcu": suficiente
  // para medir búsqueda y orden sin el sesgo anterior, donde 5.397 filas
  // coincidían porque cuatro de cada diez nombres empezaban igual.
  const base=i%40===0?'Cálculo':(i%20===0?'Mecánica':bases[i%bases.length]);
  const largo=15+(i%86),id=String(i+1).padStart(5,'0');
  let nombre=base;
  while(nombre.length<largo-id.length-1)nombre+=' '+relleno;
  return nombre.slice(0,Math.max(base.length,largo-id.length-1)).trimEnd()+' '+id;
}
ctx.__catalogo=Array.from({length:13044},(_,i)=>({
  nombre:nombreRealista(i),
  sigla:`${String.fromCharCode(65+(i%26))}${String.fromCharCode(65+(Math.floor(i/26)%26))}${String(i).padStart(5,'0')}`,
  semestre:(i%10)+1,
  propio:i%7===0,
  tienePreset:i%19===0,
}));
vm.runInContext('catalogRamosUniversidad=()=>__catalogo',ctx);
const buscar=vm.runInContext('searchCatalog',ctx);

const ITERACIONES=80;
const CALENTAMIENTO=12;
const limpiarIndice=()=>vm.runInContext("typeof _indicesBusquedaCatalogo==='undefined'||_indicesBusquedaCatalogo.clear()",ctx);
function percentil(valores,p){
  return valores[Math.min(valores.length-1,Math.floor((valores.length-1)*p))];
}
function medir(consulta){
  limpiarIndice();
  const inicioFrio=performance.now();
  buscar(consulta,'uc','ING-PC',5);
  const frio=performance.now()-inicioFrio;
  for(let i=0;i<CALENTAMIENTO;i++)buscar(consulta,'uc','ING-PC',5);
  const tiempos=[];
  let resultados=0;
  for(let i=0;i<ITERACIONES;i++){
    const inicio=performance.now();
    resultados=buscar(consulta,'uc','ING-PC',5).length;
    tiempos.push(performance.now()-inicio);
  }
  tiempos.sort((a,b)=>a-b);
  return {
    consulta,
    caracteres:consulta.length,
    resultados,
    frio,
    mediana:percentil(tiempos,0.5),
    p95:percentil(tiempos,0.95),
    max:tiempos[tiempos.length-1],
  };
}

console.log(`Catálogo: ${ctx.__catalogo.length.toLocaleString('es-CL')} ramos de volumen realista (nombres de 15–100 caracteres)`);
console.log(`Muestras: ${ITERACIONES} por consulta (${CALENTAMIENTO} de calentamiento)`);
console.table(['ca','cal','calcu'].map(medir).map(r=>({
  consulta:r.consulta,
  caracteres:r.caracteres,
  resultados:r.resultados,
  'primera ms':r.frio.toFixed(2),
  'mediana ms':r.mediana.toFixed(2),
  'p95 ms':r.p95.toFixed(2),
  'máximo ms':r.max.toFixed(2),
})));
