// El catálogo UC completo se descarga aparte. Si esa descarga falla, los
// cursos chicos que ya viven en data.js siguen siendo un catálogo utilizable.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const appPath=process.env.GRADEHUB_APP||path.join(raiz,'app.js');
const scripts=[];
const stub=()=>({
  style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false},toggle(){}},
  addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},
  querySelector(){return null},querySelectorAll(){return[]},focus(){},select(){},value:'',innerHTML:'',textContent:'',dataset:{},clientWidth:375,
});
const ctx={
  console,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{
    getElementById:()=>stub(),createElement:()=>stub(),addEventListener(){},documentElement:stub(),body:stub(),
    querySelector:q=>q.includes('app.js')?{src:'https://gradehub.cl/app.js?v=abc1234'}:null,
    querySelectorAll:()=>[],head:{appendChild:s=>scripts.push(s)},
  },
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},
  location:{origin:'https://gradehub.cl',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  setTimeout,clearTimeout,requestAnimationFrame(){return 1},cancelAnimationFrame(){},
};
vm.createContext(ctx);
for(const file of ['data.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(raiz,file),'utf8'),ctx,{filename:file});
vm.runInContext(fs.readFileSync(appPath,'utf8'),ctx,{filename:'app.js'});
const run=source=>vm.runInContext(source,ctx);
let ok=0,fail=0;
function chk(nombre,cond){if(cond){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}}

(async()=>{
  console.log('\n=== La descarga se pide una vez y conserva la versión ===');
  const primera=run('cargarCursosUC()');
  const repetida=run('cargarCursosUC()');
  chk('dos llamadas comparten la promesa pendiente',primera===repetida);
  chk('se agrega un solo script',scripts.length===1);
  chk('el archivo hereda el SHA de app.js',scripts[0]&&scripts[0].src==='cursos-uc.js?v=abc1234');

  scripts[0].onerror();
  chk('un error resuelve false',await primera===false);

  console.log('\n=== Fallar conserva el catálogo pequeño ===');
  const respaldo=run("searchCatalog('TTF013','uc','ING-PC',2)");
  chk('la sigla de data.js sigue encontrando su curso',respaldo.some(r=>r.sigla==='TTF013'&&r.nombre==='Tópicos de Ética Social Cristiana'));

  console.log('\n=== Una carga posterior amplía el mismo buscador ===');
  const reintento=run('cargarCursosUC()');
  chk('después de fallar se puede reintentar',scripts.length===2&&reintento!==primera);
  run("CURSOS_UC_FULL=[['ZZZ9999','Curso sintético de carga diferida',12,0]];ESCUELAS_UC=['Escuela de prueba'];");
  scripts[1].onload();
  chk('el reintento cargado resuelve true',await reintento===true);
  const ampliado=run("searchCatalog('ZZZ9999','uc','ING-PC',2)");
  chk('el catálogo cargado se busca por sigla',ampliado.length===1&&ampliado[0].creditos===12&&ampliado[0].escuela==='Escuela de prueba');
  chk('una vez cargado no vuelve a pedir el archivo',run('cargarCursosUC()')===reintento&&scripts.length===2);
  chk('el respaldo también sigue presente después de ampliar',run("searchCatalog('TTF013','uc','ING-PC',2)").some(r=>r.sigla==='TTF013'));

  console.log('\n=== El catálogo tiene el contrato acordado ===');
  const cat={};vm.createContext(cat);
  vm.runInContext(fs.readFileSync(path.join(raiz,'cursos-uc.js'),'utf8'),cat,{filename:'cursos-uc.js'});
  const filas=cat.CURSOS_UC_FULL;
  chk('expone las dos variables globales',Array.isArray(filas)&&Array.isArray(cat.ESCUELAS_UC));
  // El archivo es el catálogo oficial completo, no una muestra. Si alguien lo
  // regenera y salen unos cientos, algo se cortó en el camino.
  chk('trae el catálogo completo, no un pedazo',filas.length>9000);
  chk('cada curso es [sigla, nombre, créditos]',filas.every(f=>Array.isArray(f)&&f.length===3&&typeof f[0]==='string'&&typeof f[1]==='string'));
  // Los créditos son número o no están. Nunca un valor plausible inventado:
  // el catálogo oficial da distintos créditos para el mismo ramo según la
  // escuela, y elegir uno al azar le descuadra el promedio de carrera a quien
  // lo agregue.
  chk('los créditos son un número o null, nunca un relleno',filas.every(f=>f[2]===null||(typeof f[2]==='number'&&f[2]>=0)));
  chk('ninguna sigla se repite',new Set(filas.map(f=>f[0])).size===filas.length);
  // Dos siglas con el mismo nombre son dos ramos que el alumno puede elegir
  // —Dinámica de FIS y de ICE son las dos válidas en Ingeniería—, así que no
  // se colapsan: se distinguen con el código, igual que ya hace CREDITOS_UC.
  chk('ningún nombre queda repetido sin poder distinguirse',new Set(filas.map(f=>f[1])).size===filas.length);
  const alternativas=filas.filter(f=>/ \([A-Z]+\d+[A-Z]?\)$/.test(f[1]));
  chk('las alternativas del mismo ramo llevan su código',alternativas.length>500);
  // Cada alternativa acompaña a un ramo base que también está: si la base
  // faltara, el estudiante vería solo "(ACO2391)" colgando de la nada.
  const nombres=new Set(filas.map(f=>f[1]));
  chk('cada alternativa tiene su ramo base en la lista',
    alternativas.every(f=>nombres.has(f[1].replace(/ \([A-Z]+\d+[A-Z]?\)$/,''))));
  // Donde la app ya resolvió a mano entre dos siglas —el plan común de
  // Ingeniería ofrece Dinámica de FIS o de ICE, y CREDITOS_UC ya lo dice— el
  // catálogo no mete opciones nuevas: esa elección estaba curada y funcionaba.
  chk('no agrega alternativas a un ramo que la app ya tenía resuelto',
    filas.filter(f=>/^Dinámica( \(|$)/.test(f[1])).length===1);
  const deploy=fs.readFileSync(path.join(raiz,'.github/workflows/deploy.yml'),'utf8');
  chk('el deploy protege cursos-uc.js',/data\.js mallas-uc\.js mallas-uai\.js cursos-uc\.js engine\.js/.test(deploy));

  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
})().catch(error=>{console.error(error);process.exit(1);});
