// Abrir el simulador del semestre y no tocar nada mostraba un promedio distinto
// al que el estudiante tiene en su pantalla: 6,22 contra 6,03 en el caso que se
// reportó. El simulador calculaba el promedio por su cuenta —suma de notas
// dividida por cantidad de ramos— mientras la app lo calcula con `gpa`, que
// pondera por créditos, filtra los ramos que no van al promedio y resuelve los
// ramos vinculados.
//
// La diferencia más visible: un laboratorio de 0 créditos no mueve el promedio
// real, pero en un promedio simple pesa igual que un ramo de 10.
//
// No lanza ningún error y el número se ve perfectamente plausible. Por eso el
// test compara las dos cuentas en un semestre donde tienen que diferir: si
// alguien vuelve a duplicar la fórmula, esto falla.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const appSrc=fs.readFileSync(process.env.GRADEHUB_APP||path.join(raiz,'app.js'),'utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const stub=()=>({
  style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false},toggle(){}},
  addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},
  querySelector(){return null},querySelectorAll(){return[]},focus(){},select(){},value:'',innerHTML:'',textContent:'',dataset:{},clientWidth:375,
});
const ctx={
  console,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{
    getElementById:()=>stub(),createElement:()=>stub(),addEventListener(){},documentElement:stub(),body:stub(),
    querySelector:()=>null,querySelectorAll:()=>[],head:{appendChild(){}},
  },
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},
  location:{origin:'https://gradehub.cl',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  setTimeout,clearTimeout,requestAnimationFrame(){return 1},cancelAnimationFrame(){},
};
vm.createContext(ctx);
for(const f of ['data.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(raiz,f),'utf8'),ctx,{filename:f});
vm.runInContext(appSrc,ctx,{filename:'app.js'});
const run=src=>vm.runInContext(src,ctx);

// Un semestre donde ponderar SÍ cambia el resultado: el laboratorio no tiene
// créditos, así que no pesa en el promedio real pero sí en uno simple.
const nota=(peso,v)=>`{id:'c'+Math.random(),nombre:'E',peso:${peso},notas:[{id:'n'+Math.random(),valor:${v}}]}`;
run(`S.ramos=[
  {id:'a',nombre:'Cálculo II',creditos:10,categorias:[${nota(100,5.6)}]},
  {id:'b',nombre:'Dinámica',creditos:10,categorias:[${nota(100,6.1)}]},
  {id:'lab',nombre:'Laboratorio de Dinámica',creditos:0,categorias:[${nota(100,6.8)}]},
  {id:'c',nombre:'Programación',creditos:10,categorias:[${nota(100,6.4)}]}
]; simGlobalState={};`);

console.log('=== Sin tocar nada, el simulador muestra el promedio de siempre ===');
const real=run('gpa(S.ramos)');
const proj=run('simGlobalAvg()');
chk(`la app calcula ${real===null?'—':real.toFixed(2)}`, real!==null);
chk('y el simulador parte del mismo número', proj!==null && Math.abs(proj-real)<0.005);
// La prueba de que el escenario sirve: si ponderar no cambiara nada, comparar
// las dos cuentas no demostraría nada.
const simple=run(`(()=>{const v=S.ramos.map(r=>ramoAvg(r)).filter(x=>x!==null);return v.reduce((a,b)=>a+b,0)/v.length;})()`);
chk('y el escenario de verdad distingue ponderar de no ponderar', Math.abs(simple-real)>0.05);

console.log('\n=== Y al simular una nota sigue reaccionando ===');
run("simGlobalState={'b':7.0};");
const conCambio=run('simGlobalAvg()');
chk('subir un ramo sube el proyectado', conCambio>real);
chk('y lo hace ponderando, no sumando parejo',
  Math.abs(conCambio-run(`(()=>{const v=S.ramos.map(r=>r.id==='b'?7.0:ramoAvg(r)).filter(x=>x!==null);return v.reduce((a,b)=>a+b,0)/v.length;})()`))>0.05);
run('simGlobalState={};');

console.log('\n=== Una sola fórmula para el mismo número ===');
chk('el simulador delega en gpa en vez de calcular aparte',
  /function simGlobalAvg\(\)\{[\s\S]{0,400}?return gpa\(/.test(appSrc));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
