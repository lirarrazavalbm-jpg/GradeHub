// Una evaluación de nota única (Solemne, Examen) es UNA nota. El simulador
// dejaba "agregar" un 7,0 hipotético encima del 5,5 real y promediaba los dos;
// al guardar, la categoría quedaba con dos notas y la ficha muestra una sola
// casilla. Con casillas (Controles ×3) o lista abierta sí se agregan varias.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const src=['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},clientWidth:400,dataset:{},click(){}};
const inputs={};
const toasts=[];
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:id=>inputs[id]||stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
vm.runInContext('showToast=(m,e)=>toasts.push(m);renderSimulador=()=>{};',Object.assign(ctx,{toasts}));

let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

vm.runInContext(`
  S.ramos=[{id:'r',nombre:'Ramo',categorias:[
    {id:'sol',nombre:'Solemne',peso:30,directNota:true,notas:[{id:'n',nombre:'Solemne',valor:5.5,peso:1}]},
    {id:'ex',nombre:'Examen',peso:30,directNota:true,notas:[]},
    {id:'ctr',nombre:'Controles',peso:40,directNota:true,slots:3,notas:[]},
  ]}];
  currentRamoId='r';simState={};
`,ctx);
const agregar=(cat,valor)=>{inputs['sim-in-'+cat]={value:String(valor),focus(){}};vm.runInContext(`simAddNota('${cat}')`,ctx);};
const hipoteticas=cat=>vm.runInContext(`(simState['${cat}']||[]).length`,ctx);

agregar('sol',7.0);
chk('Solemne con 5,5 real no acepta una hipotética encima',hipoteticas('sol')===0&&/Solemne/.test(toasts[toasts.length-1]||''));
agregar('ex',6.0);
chk('Examen sin nota acepta una hipotética',hipoteticas('ex')===1);
agregar('ex',4.0);
chk('…pero no una segunda',hipoteticas('ex')===1);
agregar('ctr',5.0);agregar('ctr',6.0);
chk('Controles ×3 acepta varias',hipoteticas('ctr')===2);
chk('simCatLlena: Solemne llena, Controles no',vm.runInContext(`simCatLlena(S.ramos[0].categorias[0])===true&&simCatLlena(S.ramos[0].categorias[2])===false`,ctx));

console.log(`\n${ok} ok, ${fail} fail`);
if(fail)process.exit(1);
