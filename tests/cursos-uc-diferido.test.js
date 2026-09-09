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

  console.log('\n=== El archivo de reemplazo tiene el contrato acordado ===');
  const muestra={};vm.createContext(muestra);
  vm.runInContext(fs.readFileSync(path.join(raiz,'cursos-uc.js'),'utf8'),muestra,{filename:'cursos-uc.js'});
  chk('expone las dos variables globales',Array.isArray(muestra.CURSOS_UC_FULL)&&Array.isArray(muestra.ESCUELAS_UC));
  chk('la muestra trae exactamente 20 cursos',muestra.CURSOS_UC_FULL.length===20);
  chk('cada curso usa [sigla, nombre, créditos, índice de escuela]',muestra.CURSOS_UC_FULL.every(f=>Array.isArray(f)&&f.length===4));
  const actuales=new Set(JSON.parse(run('JSON.stringify(CURSOS_UC)')).map(f=>f[0]+'\n'+f[1]));
  chk('las 20 filas de muestra salen del catálogo actual',muestra.CURSOS_UC_FULL.every(f=>actuales.has(f[0]+'\n'+f[1])));
  const deploy=fs.readFileSync(path.join(raiz,'.github/workflows/deploy.yml'),'utf8');
  chk('el deploy protege cursos-uc.js',/data\.js mallas-uc\.js mallas-uai\.js cursos-uc\.js engine\.js/.test(deploy));

  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
})().catch(error=>{console.error(error);process.exit(1);});
