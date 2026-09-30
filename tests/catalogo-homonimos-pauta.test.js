// Dos cursos con el mismo nombre y siglas distintas: la pauta es de uno solo.
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(process.env.GRADEHUB_APP||path.join(root,'app.js'),'utf8');
const src=[fs.readFileSync(path.join(root,'data.js'),'utf8'),fs.readFileSync(path.join(root,'engine.js'),'utf8'),app].join('\n');

const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return stub},clientWidth:400,dataset:{},click(){}};
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console,
};
vm.createContext(ctx);
vm.runInContext(src,ctx);
const run=code=>vm.runInContext(code,ctx);
// Dos cursos UC con el mismo nombre y siglas distintas, y la pauta es de uno
// solo. Pasó con "Revelación y Fe" (TTF012 con pauta, TEB110 sin ella) el
// 2026-09-30: el buscador los juntaba en una fila con la sigla de uno y la
// estrella del otro, y al agregarla no se cargaba ninguna evaluación. Datos
// sintéticos: se prueba el mecanismo, no el catálogo.
run(`
  Object.keys(CREDITOS_UC).forEach(k=>delete CREDITOS_UC[k]);
  CURSOS_UC.splice(0,CURSOS_UC.length,['OTR100','Curso Homonimo'],['ETI9999','etica profesional']);
  Object.assign(CREDITOS_UC,{'Etica Profesional':[10,'ETI1000']});
  mallaFor=tenant=>tenant==='uc'?{ING:{4:['Etica Profesional']}}:{};
  findPresetName=(nombre,tenant)=>tenant==='uc'&&normName(nombre)===normName('Curso Homonimo')?'Curso Homonimo':null;
  presetsFueraDeMalla=tenant=>tenant==='uc'?['Curso Homonimo']:[];
  siglaDePreset=nombre=>normName(nombre)===normName('Curso Homonimo')?'PAU100':null;
`);
const cat=run(`catalogRamosUniversidad('uc','ING')`);
const homonimos=cat.filter(r=>run(`normName(${JSON.stringify(r.nombre)})`)===run(`normName('Curso Homonimo')`));
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
chk('la pauta con sigla propia y el homónimo con otra sigla son dos filas',homonimos.length===2);
chk('una trae la pauta',homonimos.filter(r=>r.tienePreset).length===1);
chk('y el homónimo de otra sigla no promete ponderaciones',homonimos.some(r=>r.sigla==='OTR100'&&r.tienePreset===false));
// La regla general no cambia: sin pauta de por medio, el mismo nombre con otra
// sigla se sigue deduplicando (catalogo-precedencia.test.js).
chk('sin pauta de por medio, el mismo nombre sigue apareciendo una vez',
  cat.filter(r=>run(`normName(${JSON.stringify(r.nombre)})`)===run(`normName('etica profesional')`)).length===1);
console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
