// Un mismo ramo puede llegar desde la pauta, la malla y el catalogo general.
// Al crecer el catalogo UC, resolver solo por nombre deja duplicados cuando la
// sigla coincide pero el nombre cambia; resolver solo por sigla hace lo mismo
// cuando dos fuentes escriben igual el nombre con codigos distintos.
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

// Fuentes sinteticas: no amarra el mecanismo a un ramo ni a una pauta real.
run(`
  Object.keys(CREDITOS_UC).forEach(k=>delete CREDITOS_UC[k]);
  Object.assign(CREDITOS_UC,{
    'Calculo para Ingenieria':[10,'MAT1000'],
    'Fundamentos del Calculo':[10,'MAT1000'],
    'Etica Profesional':[10,'ETI1000']
  });
  CURSOS_UC.splice(0,CURSOS_UC.length,
    ['MAT1000','Introduccion al Calculo'],
    ['ETI9999','etica profesional'],
    ['QUI1000','Quimica General']
  );
  mallaFor=tenant=>tenant==='uc'?{ING:{
    2:['Calculo para Ingenieria'],
    4:['Etica Profesional']
  }}:{};
  findPresetName=(nombre,tenant)=>tenant==='uc'&&normName(nombre)===normName('Fundamentos del Calculo')?nombre:null;
  presetsFueraDeMalla=(tenant)=>tenant==='uc'?['Fundamentos del Calculo']:[];
`);

const catalogo=run(`catalogRamosUniversidad('uc','ING')`);
const porSigla=sigla=>catalogo.filter(r=>r.sigla===sigla);
const porNombre=nombre=>catalogo.filter(r=>run(`normName(${JSON.stringify(r.nombre)})`)===run(`normName(${JSON.stringify(nombre)})`));

let ok=0,fail=0;
const chk=(nombre,cond)=>{if(cond){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}};

console.log('\n=== La identidad por sigla conserva una sola version ===');
const calculo=porSigla('MAT1000');
chk('una pauta, una malla y un curso pelado con la misma sigla aparecen una vez',calculo.length===1);
chk('gana el nombre de la pauta y conserva que trae ponderaciones',calculo.length===1&&calculo[0].nombre==='Fundamentos del Calculo'&&calculo[0].tienePreset===true);
chk('la pauta conserva el semestre que aportaba la malla',calculo.length===1&&calculo[0].semestre===2);

console.log('\n=== La identidad por nombre normalizado tambien deduplica ===');
const etica=porNombre('Ética profesional');
chk('el mismo nombre con tildes, mayusculas y siglas distintas aparece una vez',etica.length===1);
chk('gana la fila de malla con semestre sobre el curso pelado',etica.length===1&&etica[0].semestre===4&&etica[0].sigla==='ETI1000');

console.log('\n=== Los ramos distintos no se pierden ===');
chk('un curso sin coincidencias sigue presente',catalogo.some(r=>r.sigla==='QUI1000'&&r.nombre==='Quimica General'));
chk('quedan exactamente los tres ramos logicos',catalogo.length===3);

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
