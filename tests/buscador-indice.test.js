// El índice evita rehacer 13 mil normalizaciones en cada tecla, pero no puede
// dejar la búsqueda pegada al catálogo chico cuando termina una carga diferida.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const appPath=process.env.GRADEHUB_APP||path.join(raiz,'app.js');
const stub=()=>({
  style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false},toggle(){}},
  addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},
  querySelector(){return null},querySelectorAll(){return[]},focus(){},select(){},click(){},
  value:'',innerHTML:'',textContent:'',dataset:{},clientWidth:375,
});
const ctx={
  console,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub(),createElement:()=>stub(),addEventListener(){},documentElement:stub(),body:stub(),querySelector:()=>null,querySelectorAll:()=>[]},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},
  location:{origin:'https://gradehub.cl',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  setTimeout,clearTimeout,requestAnimationFrame(){return 1},cancelAnimationFrame(){},
};
vm.createContext(ctx);
for(const archivo of ['data.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(raiz,archivo),'utf8'),ctx,{filename:archivo});
vm.runInContext(fs.readFileSync(appPath,'utf8'),ctx,{filename:'app.js'});
const run=source=>vm.runInContext(source,ctx);
let ok=0,fail=0;
function chk(nombre,cond){if(cond){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}}

run(`
  var __armados=0;
  catalogRamosUniversidad=()=>{
    __armados++;
    return typeof CURSOS_UC_FULL==='undefined'
      ? [{nombre:'Cálculo inicial',sigla:'MAT1000',semestre:1,propio:true,tienePreset:false}]
      : [{nombre:'Cálculo avanzado',sigla:'MAT2000',semestre:3,propio:true,tienePreset:false}];
  };
  var __normalizaciones=0;
  var __normNameReal=normName;
  normName=valor=>{__normalizaciones++;return __normNameReal(valor);};
`);

console.log('\n=== Reutiliza el trabajo entre teclas ===');
run("searchCatalog('ca','uc','ING-PC',2)");
const trasPrimera=run('__normalizaciones');
run("searchCatalog('cal','uc','ING-PC',2)");
chk('el catálogo se arma una sola vez',run('__armados')===1);
chk('la segunda tecla normaliza solo la consulta, no cada ramo de nuevo',run('__normalizaciones')-trasPrimera===1);

console.log('\n=== Una carga diferida invalida el índice ===');
run('var CURSOS_UC_FULL=[]');
const nuevos=run("searchCatalog('avanzado','uc','ING-PC',2)");
chk('reconstruye al aparecer el catálogo completo',run('__armados')===2);
chk('la búsqueda muestra la fuente recién cargada',nuevos.length===1&&nuevos[0].sigla==='MAT2000');

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
