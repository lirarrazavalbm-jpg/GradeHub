// Las mallas UAI y las 69 mallas UC extra se cargan bajo demanda. El selector
// de ramos tiene que pedir la malla propia y rehacer su índice cuando llega,
// sin mezclar las carreras vecinas de la misma universidad.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const appPath=process.env.GRADEHUB_APP||path.join(raiz,'app.js');
const scripts=[],elements=new Map();
function element(){
  return {
    style:{setProperty(){},removeProperty(){}},
    classList:{add(){},remove(){},contains(){return false},toggle(){}},
    addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},
    querySelector(){return null},querySelectorAll(){return[]},focus(){},select(){},click(){},
    value:'',innerHTML:'',textContent:'',dataset:{},clientWidth:375,
  };
}
function byId(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}
const ctx={
  console,
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{
    getElementById:byId,createElement:element,addEventListener(){},documentElement:element(),body:element(),
    querySelector:q=>q.includes('app.js')?{src:'https://gradehub.cl/app.js?v=abc1234'}:element(),
    querySelectorAll:()=>[],head:{appendChild:s=>scripts.push(s)},
  },
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},
  location:{origin:'https://gradehub.cl',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  setTimeout(fn){fn();return 1},clearTimeout(){},requestAnimationFrame(){return 1},cancelAnimationFrame(){},
};
vm.createContext(ctx);
for(const file of ['data.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(raiz,file),'utf8'),ctx,{filename:file});
vm.runInContext(fs.readFileSync(appPath,'utf8'),ctx,{filename:'app.js'});
const run=source=>vm.runInContext(source,ctx);

(async()=>{
  run("S.tenant='uai';S.carrera='UAI-INGENIERIA-CIVIL-INFORMATICA';S.careerSemestre=2;S.ramos=[]");

  // Construye primero el índice chico: reproduce la llegada tardía del archivo.
  run("searchCatalog('calculo','uai','UAI-INGENIERIA-CIVIL-INFORMATICA',2)");
  run('openAddRamoModal()');
  byId('m-ramo-search').value='calculo';
  run("renderCatalogResults('calculo')");

  if(scripts.length!==1)throw new Error('Agregar ramo no pidió la malla UAI propia');
  if(scripts[0].src!=='mallas-uai.js?v=abc1234')throw new Error('La malla UAI no heredó la versión de app.js');

  vm.runInContext(fs.readFileSync(path.join(raiz,'mallas-uai.js'),'utf8'),ctx,{filename:'mallas-uai.js'});
  scripts[0].onload();
  await Promise.resolve();

  const propios=run("searchCatalog('calculo integral','uai','UAI-INGENIERIA-CIVIL-INFORMATICA',2)");
  if(!propios.some(r=>r.nombre==='Cálculo Integral'&&r.propio)){
    throw new Error('Ingeniería Civil Informática UAI no encuentra Cálculo Integral de su propia malla');
  }
  if(!byId('m-ramo-results').innerHTML.includes('Cálculo Integral')){
    throw new Error('El selector no se repintó cuando llegó la malla UAI');
  }

  const ajenos=run("searchCatalog('destrezas forenses','uai','UAI-INGENIERIA-CIVIL-INFORMATICA',2)");
  if(ajenos.some(r=>r.nombre==='Destrezas Forenses')){
    throw new Error('El buscador mezcló un ramo exclusivo de Derecho UAI');
  }

  console.log('Buscador por malla propia: carga diferida, caché renovada y carreras UAI aisladas');
})().catch(error=>{console.error(error);process.exit(1);});
