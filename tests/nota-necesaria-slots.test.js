// Una categoría con casillas declaradas no queda completa por tener la primera
// nota. Este archivo fija el caso real del Laboratorio de Dinámica.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const src=['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
let ok=0,fail=0;
const chk=(nombre,condicion)=>{if(condicion){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}};
const eq=(nombre,actual,esperado)=>chk(`${nombre} (${actual===null?'null':Number(actual).toFixed(2)})`,typeof actual==='number'&&Math.abs(actual-esperado)<.005);
const presetRamo=vm.runInContext('presetRamo',ctx);
const ramoToStructure=vm.runInContext('ramoToStructure',ctx);
const gradesOf=vm.runInContext('gradesOf',ctx);
const ramoAvg=vm.runInContext('ramoAvg',ctx);
const notaNecesaria=vm.runInContext('notaNecesaria',ctx);
const calcular=vm.runInContext('calculateFinalGrade',ctx);

function laboratorio(notasInformes){
  const p=presetRamo('Laboratorio de Dinámica','uc','ING-PC');
  p.id='lab';
  p.categorias.forEach(c=>{c.notas=c.nombre==='Informes'?notasInformes:[];});
  vm.runInContext('S.ramos=__ramos',Object.assign(ctx,{__ramos:[p]}));
  return p;
}

console.log('\n=== Laboratorio de Dinámica · casillas que aún faltan ===');
const conInforme0=laboratorio([{id:'informe-0',nombre:'Informe 0',valor:6.5,peso:1,slot:0}]);
eq('una nota de seis informes conserva el promedio parcial',ramoAvg(conInforme0),6.5);
eq('con cinco informes y dos categorías pendientes necesita 3,67',notaNecesaria(conInforme0),3.67);
eq('para meta 5, la calculadora cuenta los cinco Informes que faltan',notaNecesaria(conInforme0,5),4.80);
const calculoConUno=calcular(ramoToStructure(conInforme0),gradesOf(conInforme0));
chk('las dieciséis casillas que faltan llegan al motor',calculoConUno.emptyLeaves.length===16);
chk('las casillas pendientes se derivan sin agregarse al ramo guardado',conInforme0.categorias.find(c=>c.nombre==='Informes').notas.length===1);
const appSrc=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
chk('la calculadora reutiliza la meta por casillas, no una cuenta por categoría',
  /const needed=notaNecesaria\(r,target\)/.test(appSrc));

console.log('\n=== Una corrección no inventa otra casilla rendida ===');
const corregido=laboratorio([
  {id:'informe-0-viejo',nombre:'Informe 0',valor:5.0,peso:1,slot:0},
  {id:'informe-0-nuevo',nombre:'Informe 0',valor:6.5,peso:1,slot:0}
]);
const estructuraCorregida=ramoToStructure(corregido);
const informes=estructuraCorregida.children.find(c=>c.name==='Informes');
const calculoCorregido=calcular(estructuraCorregida,gradesOf(corregido));
chk('Informes tiene una nota rendida y cinco casillas pendientes, no siete hojas',informes.children.length===6&&calculoCorregido.emptyLeaves.filter(l=>l.name.includes('Informe')).length===5);

console.log('\n=== Una categoría abierta conserva su comportamiento ===');
const sinSlots={id:'manual',nombre:'Ramo manual',categorias:[{id:'abierta',nombre:'Proyecto',peso:100,notas:[]}]};
eq('sin slots ni notas sigue necesitando 4,00',notaNecesaria(sinSlots),4.0);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
