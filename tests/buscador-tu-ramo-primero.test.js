// Con el catálogo completo hay 42 ramos que contienen "álgebra". Un estudiante
// de Ingeniería que escribía "algebra" recibía primero el "Álgebra" de otra
// carrera —coincidencia exacta— y su propia "Álgebra Lineal" quedaba segunda,
// detrás de siete filas que no puede cursar.
//
// La calidad de la coincidencia textual no puede mandar sobre de quién es el
// ramo: el de tu malla es literalmente el que vas a tomar.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const appSrc=fs.readFileSync(process.env.GRADEHUB_APP||path.join(raiz,'app.js'),'utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

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
for(const f of ['data.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(raiz,f),'utf8'),ctx,{filename:f});
vm.runInContext(appSrc,ctx,{filename:'app.js'});
const run=s=>vm.runInContext(s,ctx);

// Catálogo sintético: no amarra el test a los ramos que hoy tenga la UC.
run(`
  _catalogoTest=[
    {nombre:'Álgebra',semestre:0,propio:false,sigla:'XXX1000',tienePreset:false},
    {nombre:'Álgebra Lineal',semestre:1,propio:true,sigla:'MAT1203',tienePreset:true},
    {nombre:'Álgebra (XXX2000)',semestre:0,propio:false,sigla:'XXX2000',tienePreset:false},
    {nombre:'Álgebra (XXX3000)',semestre:0,propio:false,sigla:'XXX3000',tienePreset:false},
    {nombre:'Álgebra Abstracta',semestre:0,propio:false,sigla:'XXX4000',tienePreset:false},
    {nombre:'Álgebra Lineal (ICE9999)',semestre:0,propio:false,sigla:'ICE9999',tienePreset:false}
  ];
  catalogRamosUniversidad=function(){return _catalogoTest;};
`);
const buscar=q=>JSON.parse(run(`JSON.stringify(searchCatalog(${JSON.stringify(q)},'uc','ING-PC',1).map(r=>r.nombre))`));

console.log('=== Tu ramo va primero, aunque otro calce mejor con lo que escribiste ===');
const r=buscar('algebra');
// "Álgebra" es coincidencia EXACTA y "Álgebra Lineal" solo empieza igual: antes
// ganaba el exacto aunque fuera de otra carrera.
chk('el ramo de tu malla encabeza la lista', r[0]==='Álgebra Lineal');
chk('y el de otra carrera queda detrás', r.indexOf('Álgebra')>0);

console.log('\n=== Las desambiguaciones ajenas no tapan la lista ===');
// "Álgebra (XXX2000)" existe solo para distinguir dos ramos homónimos: es la
// fila menos informativa y con varias seguidas esconde a "Álgebra Abstracta",
// que sí se distingue por su nombre.
chk('un ramo con nombre propio va antes que una desambiguación ajena',
  r.indexOf('Álgebra Abstracta') < r.indexOf('Álgebra (XXX2000)'));

console.log('\n=== Pero la alternativa de TU ramo no se esconde ===');
// El plan común admite "Dinámica" de FIS o de ICE y el alumno cursa la que le
// tocó. Degradar esa fila la vuelve inencontrable justo para quien la necesita.
chk('la desambiguación de un ramo de tu malla se queda arriba',
  r.indexOf('Álgebra Lineal (ICE9999)') < r.indexOf('Álgebra (XXX2000)'));
chk('y queda entre las primeras', r.indexOf('Álgebra Lineal (ICE9999)')<=2);

console.log('\n=== Sin volver a normalizar cada ramo por tecla ===');
// #346 sacó ese trabajo del bucle: el reordenamiento no puede reintroducirlo.
const bloque=(appSrc.match(/const porCoincidencia=[\s\S]*?return propios\.concat[^;]*;/)||[''])[0];
chk('el reordenamiento usa el nombre ya normalizado', /r\._n/.test(bloque));
chk('y no llama normName dentro del bucle', !/normName\(/.test(bloque));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
