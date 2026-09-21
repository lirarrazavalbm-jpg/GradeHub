// Genera una muestra local autocontenida. No lee cuentas ni llama a Supabase.
// Usa las funciones reales: cambiar el cálculo o la segmentación cambia la demo.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const raiz=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
const extraer=nombre=>{
  const texto=app.match(new RegExp('function '+nombre+'\\([^]*?\\n\\}'));
  if(!texto)throw new Error('No se encontró '+nombre);
  return texto[0];
};

// El catálogo real, sacado de la misma función que alimenta el buscador de la
// app. Antes la muestra traía dos ramos inventados por universidad
// ("TEST102 · Ramo de ejemplo"), así que elegir el ramo no se parecía en nada a
// elegirlo en GradeHub y no se veía el problema de fondo: la segmentación
// calza por SIGLA, y hay universidades enteras donde los ramos no tienen.
//
// Se resuelve acá y no en el navegador porque el buscador vive en app.js, que
// son 400 KB atados al DOM. Acá corre una vez, al generar el archivo.
function catalogoReal(){
  const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return stub},clientWidth:400,dataset:{},click(){}};
  const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
    document:{getElementById:()=>({...stub}),createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console:{log(){},warn(){},error(){}}};
  vm.createContext(ctx);
  vm.runInContext(['data.js','engine.js','app.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n'),ctx);
  const out={};
  for(const tenant of ['uc','fen','uai','uandes']){
    const ramos=vm.runInContext(`catalogRamosUniversidad(${JSON.stringify(tenant)},null)`,ctx);
    // Solo el nombre y la sigla: la muestra no necesita el resto y el archivo ya
    // pesa bastante. El catálogo completo de la UC (11.853 ramos, carga
    // diferida) queda fuera a propósito — son 600 KB para una muestra local.
    out[tenant]=ramos.map(r=>[r.nombre,r.sigla||'']);
  }
  return out;
}

const fuentes={
  __ENGINE__:fs.readFileSync(path.join(raiz,'engine.js'),'utf8'),
  __MARKETPLACE__:fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8'),
  __PROGRESS__:extraer('ramoProgress'),
  __CATALOGO__:JSON.stringify(catalogoReal()),
};
const plantilla=fs.readFileSync(path.join(__dirname,'marketplace-demo.html'),'utf8');
const html=plantilla.replace(/__ENGINE__|__MARKETPLACE__|__PROGRESS__|__CATALOGO__/g,clave=>fuentes[clave].replace(/<\/script/gi,'<\\/script'));
const destino=path.resolve(process.argv[2]||'/tmp/gradehub-marketplace-muestra.html');
if(destino.startsWith(raiz+path.sep))throw new Error('Genera la muestra fuera del repo para no publicarla con la app.');
fs.writeFileSync(destino,html);
console.log(destino);
