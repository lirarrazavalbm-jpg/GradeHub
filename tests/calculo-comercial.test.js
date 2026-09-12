// La pauta de Cálculo I estaba excluida para Ingeniería Comercial. El comentario
// que lo justificaba decía que "el Cálculo I de Comercial es OTRO curso, de otra
// facultad", y el catálogo oficial de la UC dice que no: MAT1610 es UNA sola
// sigla, aparece en la malla de Ingeniería Plan Común y en la de Comercial, con
// los mismos 10 créditos. Lo confirmó además un estudiante que lo cursa.
//
// El costo de la exclusión no se veía: el ramo simplemente no traía sus
// ponderaciones y el estudiante las escribía a mano, creyendo que no existían.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const stub=()=>({style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false},toggle(){}},
  addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},
  querySelector(){return null},querySelectorAll(){return[]},focus(){},select(){},value:'',innerHTML:'',textContent:'',dataset:{},clientWidth:375});
const ctx={console,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub(),createElement:()=>stub(),addEventListener(){},documentElement:stub(),body:stub(),
    querySelector:()=>null,querySelectorAll:()=>[],head:{appendChild(){}}},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},
  location:{origin:'https://gradehub.cl',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  setTimeout,clearTimeout,requestAnimationFrame(){return 1},cancelAnimationFrame(){}};
vm.createContext(ctx);
for(const f of ['data.js','engine.js','app.js'])vm.runInContext(fs.readFileSync(path.join(raiz,f),'utf8'),ctx,{filename:f});
const run=src=>vm.runInContext(src,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== Es el mismo ramo, y por eso hereda la pauta ===');
// La razón está primero: si algún día la UC le pone otra sigla al Cálculo I de
// Comercial, este test falla y obliga a revisar la decisión en vez de arrastrarla.
chk('Cálculo I tiene una sola sigla', run("(CREDITOS_UC['Cálculo I']||[])[1]")==='MAT1610');
chk('y está en las dos mallas',
  run("((MALLA_UC['COM']||{})[1]||[]).includes('Cálculo I')") &&
  run("Object.values(MALLA_UC['ING-PC']||{}).flat().includes('Cálculo I')"));
chk('un estudiante de Comercial recibe sus ponderaciones',
  !!run("findPresetName('Cálculo I','uc','COM')"));
chk('y el de Ingeniería sigue recibiéndolas',
  !!run("findPresetName('Cálculo I','uc','ING-PC')"));

console.log('\n=== Pero la lista de Comercial sigue siendo explícita ===');
// Lo que se corrige es un ramo mal excluido, no la regla. Un ramo que en
// Comercial lleva OTRA sigla es otro curso aunque se llame igual, y heredar
// pautas de Ingeniería en bloque pondría ponderaciones falsas con estrella de
// "oficial" al lado.
chk('no se abrió la puerta a todo el catálogo de Ingeniería',
  !run("findPresetName('Álgebra Lineal','uc','COM')"));
chk('la lista de Comercial se enumera a mano', /const PRESETS_UC_COM=\[/.test(fs.readFileSync(path.join(raiz,'data.js'),'utf8')));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
