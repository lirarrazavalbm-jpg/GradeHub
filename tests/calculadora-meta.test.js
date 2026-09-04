// La calculadora no puede redondear una meta imposible como si fuera un 7,0.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const src=['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
let ok=0,fail=0;
const chk=(nombre,condicion)=>{if(condicion){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}};
const resumen=vm.runInContext('typeof resumenMetaCalculadora==="function"?resumenMetaCalculadora:null',ctx);

console.log('\n=== Calculadora · borde de la nota máxima ===');
chk('expone el resumen que separa una meta máxima de una imposible',typeof resumen==='function');
const exacta=resumen&&resumen(7);
chk('un 7,0 exacto sigue siendo posible y explica que requiere la máxima',!!exacta&&exacta.estado==='maxima'&&exacta.texto==='7.0');
const sobreSiete=resumen&&resumen(7.0001);
chk('un 7,0001 se muestra como 7,01 imposible, nunca como 7,0',!!sobreSiete&&sobreSiete.estado==='inalcanzable'&&sobreSiete.texto==='7.01');

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
