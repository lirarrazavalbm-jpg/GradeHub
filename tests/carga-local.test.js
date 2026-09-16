// La copia local tiene que cargar al arrancar, con ramos del catálogo adentro.
//
// loadData() corre a media carga de app.js y atrapa cualquier excepción sin
// decir nada. Entre el 2026-08-29 y hoy, normalize() → migrarOrigenesFecha →
// definicionPreset → ramoDeLaMalla tocaba una const declarada 1.300 líneas más
// abajo (TDZ): loadData devolvía null y S quedaba fresco. Online no se notaba
// —la nube re-normaliza después—, pero sin red a una persona con datos en caché
// le aparecía el onboarding y, si lo completaba, pisaba su copia local.
//
// Este test arranca app.js con un localStorage que ya tiene un ramo de FEN y
// exige que `loaded` traiga ese ramo. Cualquier const nueva que normalize()
// alcance antes de estar declarada vuelve a reventar acá, no en producción.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js'].map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const guardado = JSON.stringify({
  onboardingDone: true, userName: 'Persona Sintética', tenant: 'fen', carrera: 'IICG', careerSemestre: 2,
  ramos: [{ id: 'r1', nombre: 'Contabilidad', color: '#000', creditos: 6,
    origen: { tenant: 'fen', carrera: 'IICG', ramoKey: 'contabilidad' },
    categorias: [{ id: 'c1', nombre: 'Solemne', peso: 30, notas: [{ id: 'n1', nombre: 'Solemne', valor: 5.5, peso: 1 }], fecha: '2026-10-01' }] }],
});

function classList(){const c=new Set();return{add(...x){x.forEach(v=>c.add(v));},remove(...x){x.forEach(v=>c.delete(v));},contains(v){return c.has(v);}};}
const stub={style:{setProperty(){},removeProperty(){}},classList:classList(),addEventListener(){},appendChild(){},value:'',innerHTML:'',textContent:'',focus(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return stub;},querySelectorAll(){return[];},dataset:{}};
const errores = [];
const ctx = {
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem:k=>k==='gradehub_v1'?guardado:null,setItem(){},removeItem(){}},navigator:{},
  location:{origin:'',pathname:'/',search:'',hash:'',reload(){}},history:{replaceState(){}},
  setTimeout,clearTimeout,console:{...console,error:(...a)=>errores.push(a.join(' '))},
};
vm.createContext(ctx);
vm.runInContext(src, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const loaded = vm.runInContext('loaded', ctx);
chk('loadData() devolvió la copia local (no la tragó una excepción)', !!loaded);
chk('el ramo del catálogo sigue ahí con su nota', !!loaded && loaded.ramos.length === 1 && loaded.ramos[0].categorias[0].notas[0].valor === 5.5);
chk('S arranca con onboardingDone, no fresco', vm.runInContext('S.onboardingDone===true&&S.ramos.length===1', ctx));

console.log(`\n${ok} ok, ${fail} fail`);
if (fail) process.exit(1);
