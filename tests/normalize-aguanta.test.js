// Cargar los ramos guardados no puede lanzar.
//
// `normalize` usaba `x || []` para recorrer ramos, categorías y notas. Eso no
// alcanza cuando el dato no es una lista: un string no vacío es truthy y no
// tiene `.map`, así que la función LANZABA. Y lanza en el camino crítico —al
// abrir la app con lo que hay en gradehub_v1—, o sea no es un error visible
// sino una cuenta que no abre, con sus datos intactos y fuera de alcance.
//
// De dónde puede venir un dato así: una escritura cortada por falta de espacio,
// un sync a medias, un respaldo importado de otra versión. No hace falta que
// sea frecuente: si pasa, la persona pierde el acceso a todo.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return stub},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);
['data.js','engine.js','app.js'].forEach(f=>vm.runInContext(fs.readFileSync(raiz+f,'utf8'),ctx));
const normalize=vm.runInContext('normalize',ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const aguanta=(n,data,comprobar)=>{
  let r=null,err=null;
  try{r=normalize(data);}catch(e){err=e.message;}
  chk(n+(err?' → LANZÓ: '+err:''), !err && (!comprobar||comprobar(r)));
};

console.log('\n=== Lo que no es lista se trata como vacío ===');
aguanta('ramos es un string', {tenant:'uc',onboardingDone:true,ramos:'nope'}, r=>r.ramos.length===0);
aguanta('ramos es un número', {tenant:'uc',onboardingDone:true,ramos:42}, r=>r.ramos.length===0);
aguanta('ramos es un objeto', {tenant:'uc',onboardingDone:true,ramos:{a:1}}, r=>r.ramos.length===0);
aguanta('categorias es un string', {tenant:'uc',onboardingDone:true,ramos:[{id:'r1',nombre:'R',categorias:'nope'}]},
  r=>r.ramos[0].categorias.length===0);
aguanta('notas es un string', {tenant:'uc',onboardingDone:true,ramos:[{id:'r1',nombre:'R',categorias:[{id:'c1',nombre:'C',peso:100,notas:'nope'}]}]},
  r=>r.ramos[0].categorias[0].notas.length===0);
aguanta('todo junto corrupto', {tenant:'uc',onboardingDone:true,ramos:[{id:'r1',nombre:'R',categorias:[{id:'c1',nombre:'C',peso:100,notas:7}]},'basura']});

console.log('\n=== Y lo que sí es lista sigue intacto ===');
aguanta('un ramo normal no cambia', {tenant:'uc',onboardingDone:true,ramos:[{id:'r1',nombre:'R',categorias:[{id:'c1',nombre:'Examen',peso:100,notas:[{id:'n1',valor:5.5,peso:1}]}]}]},
  r=>r.ramos.length===1&&r.ramos[0].categorias[0].notas[0].valor===5.5&&r.ramos[0].categorias[0].nombre==='Examen');

console.log('\n=== Una categoría sin nombre no se dibuja como "undefined" ===');
aguanta('sin nombre recibe uno genérico', {tenant:'uc',onboardingDone:true,ramos:[{id:'r1',nombre:'R',categorias:[{id:'c1',peso:100,notas:[]}]}]},
  r=>typeof r.ramos[0].categorias[0].nombre==='string'&&r.ramos[0].categorias[0].nombre.length>0);
aguanta('un nombre en blanco también', {tenant:'uc',onboardingDone:true,ramos:[{id:'r1',nombre:'R',categorias:[{id:'c1',nombre:'   ',peso:100,notas:[]}]}]},
  r=>r.ramos[0].categorias[0].nombre.trim().length>0);

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail?1:0);
