// El catálogo completo de la UC son 11.853 ramos en un archivo aparte de ~660 KB.
// Mientras no llega, buscar una sigla no encuentra nada — y en ese momento los
// buscadores decían "no está, lo agregamos como ramo tuyo". Quien hace caso crea
// a mano un ramo que SÍ tenemos, y pierde su sigla, sus créditos y su pauta.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const leer=f=>fs.readFileSync(raiz+f,'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

function elemento(){let html='';const n={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false}},children:[],value:'',textContent:'',dataset:{},
 addEventListener(){},appendChild(h){this.children.push(h);return h},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelector(){return n},querySelectorAll(){return[]},focus(){},select(){},remove(){},click(){},clientWidth:400};
 Object.defineProperty(n,'innerHTML',{get(){return html},set(v){html=String(v);this.children=[]}});return n;}
const ids={};const porId=id=>ids[id]||(ids[id]=elemento());
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
 document:{getElementById:porId,createElement:elemento,addEventListener(){},documentElement:elemento(),querySelector:()=>elemento(),querySelectorAll:()=>[],body:elemento(),head:{appendChild(){}}},
 localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);
vm.runInContext(['data.js','engine.js','app.js'].map(leer).join('\n'),ctx);
const run=c=>vm.runInContext(c,ctx);
run("S={ramos:[],userName:'',careerSemestre:2,carrera:'ING-PC',tenant:'uc',onboardingDone:true,historial:[],sortMode:'manual'};");

console.log('=== Mientras el catálogo viene en camino ===');
// CURSOS_UC_FULL no está definido: es exactamente el estado de los primeros
// segundos de una visita, que es cuando alguien escribe su sigla.
chk('la app sabe que el catálogo UC todavía no llega', run("catalogoUcEnCamino('uc')")===true);
chk('y no lo dice de una universidad que no tiene catálogo aparte',
  run("catalogoUcEnCamino('fen')")===false && run("catalogoUcEnCamino('uai')")===false);

run("renderCatalogResults('BIO143M')");
const agregar=porId('m-ramo-results').innerHTML;
chk('buscar una sigla no concluye que el ramo no existe', !/lo agregamos como ramo tuyo/.test(agregar));
chk('dice que está buscando', /Buscando en el catálogo de la UC/.test(agregar));

console.log('\n=== Cuando ya llegó ===');
// Con el archivo cargado, una sigla que no está sí es una sigla que no está.
vm.runInContext(leer('cursos-uc.js'),ctx);
chk('ahora la app sabe que el catálogo está', run("catalogoUcEnCamino('uc')")===false);
run("renderCatalogResults('ZZZ999X')");
const despues=porId('m-ramo-results').innerHTML;
chk('una sigla inexistente sí ofrece agregarla a mano', /lo agregamos como ramo tuyo/.test(despues));
run("renderCatalogResults('BIO143M')");
chk('y la que sí existe aparece con su sigla', /BIO143M/.test(porId('m-ramo-results').innerHTML));

console.log('\n=== Los tres buscadores avisan igual ===');
const app=leer('app.js');
chk('agregar ramo, onboarding y semestre anterior usan la misma guarda',
  (app.match(/catalogoUcEnCamino\(/g)||[]).length>=4);

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
