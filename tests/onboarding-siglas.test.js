// Tres cosas del paso 5 y del paso 3 que no rompen nada y confunden igual:
//
// 1. "Tu malla se carga sola" se prometía en el paso 3, antes de saber en qué
//    semestre va la persona. Ingeniería UC llega hasta 4° —de 5° se separa por
//    major— y Comercial hasta 8°: quien iba más arriba elegía su carrera
//    leyendo esa promesa y después no le cargaba ningún ramo.
// 2. El plan común admite FIS1514 o ICE1514 y los dos se llaman "Dinámica". La
//    malla sugería el nombre, sin manera de decir cuál está tomando.
// 3. Sin la sigla, el ramo sugerido no se puede contrastar con el horario.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const app=process.env.GRADEHUB_APP||raiz+'app.js';
const src=['data.js','engine.js'].map(f=>fs.readFileSync(raiz+f,'utf8'))
  .concat(fs.readFileSync(app,'utf8'),fs.readFileSync(raiz+'render-main.js','utf8'),fs.readFileSync(raiz+'render-agenda.js','utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},clientWidth:400,clientHeight:400,scrollTop:0,dataset:{},click(){},closest(){return stub;},insertBefore(){},removeChild(){},remove(){},getBoundingClientRect(){return {top:0,left:0,width:0,height:0,bottom:0,right:0};},children:[],firstElementChild:null,contains(){return false;},disabled:false};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console,gtag(){},requestAnimationFrame(){return 0;},cancelAnimationFrame(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== La promesa de la malla solo donde se cumple siempre ===');
run('selectedTenant="uc"');
chk('Ingeniería UC no la promete: su malla llega a 4°', run('mallaCubreTodoElPaso("ING-PC")')===false);
chk('Comercial tampoco: llega a 8°', run('mallaCubreTodoElPaso("COM")')===false);
run('selectedTenant="fen"');
chk('una malla FEN que sí cubre los 11 la conserva', run('mallaCubreTodoElPaso("CA")')===true);
chk('y una que llega a 10° no la promete', run('mallaCubreTodoElPaso("IC")')===false);
chk('una carrera sin malla nunca la promete', run('mallaCubreTodoElPaso(null)')===false);

console.log('\n=== Dos códigos para el mismo ramo se pueden elegir ===');
const vs=run('variantesDeRamo("Dinámica","uc")');
chk('Dinámica ofrece sus dos códigos', vs.length===2 && vs.map(v=>v.sigla).join(',')==='FIS1514,ICE1514');
chk('un ramo con un solo código no ofrece elección', run('variantesDeRamo("Cálculo II","uc")').length===0);
// "Diseño en Ingeniería Biomédica I (Capstone)" NO es otra versión de otro ramo:
// el paréntesis tiene que traer una sigla, si no se ofrecería una elección falsa.
chk('un paréntesis que no es sigla no crea una variante',
  run('variantesDeRamo("Diseño en Ingeniería Biomédica I","uc")').length===0);

console.log('\n=== La sigla acompaña al ramo ===');
chk('sale la del catálogo UC', run('siglaDeRamo({nombre:"Cálculo II"},"uc")')==='MAT1620');
chk('y la del laboratorio', run('siglaDeRamo({nombre:"Laboratorio de Dinámica"},"uc")')==='FIS0154');
chk('un ramo inventado no tiene sigla', run('siglaDeRamo({nombre:"Electivo de cine"},"uc")')===null);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
