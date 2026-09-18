// Al archivar el semestre, Inicio quedaba con las insight cards del semestre
// recién archivado ("Próxima evaluación · Control 2", "Ramo en riesgo ·
// Marketing"), apuntando a ramos que ya no existen: renderHome() salía por el
// camino de "sin ramos" antes de llegar al bloque que las repinta.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const src=['data.js','engine.js','app.js','render-main.js','render-agenda.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const nuevoStub=()=>({style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},closest(){return null;},classList:{add(){},remove(){},contains(){return false;},toggle(){}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return nuevoStub();},clientWidth:400,dataset:{},click(){}});
const ids={};
const el=id=>ids[id]||(ids[id]=nuevoStub());
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:el,createElement:()=>nuevoStub(),addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>nuevoStub(),querySelectorAll:()=>[],body:nuevoStub()},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);

let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

// Un semestre con ramo y fecha próxima deja una insight card pintada…
vm.runInContext(`
  S.userName='Persona Sintética';S.ramos=[{id:'r',nombre:'Ramo Sintético',color:'#000',creditos:6,categorias:[
    {id:'c',nombre:'Control',peso:100,directNota:true,notas:[],fecha:new Date(Date.now()+3*86400000).toISOString().slice(0,10)}]}];
  renderHome();
`,ctx);
chk('con un ramo y fecha próxima hay insight card',/insight-card/.test(el('home-insights').innerHTML));

// …y al quedar sin ramos (archivar) tiene que desaparecer.
vm.runInContext('S.ramos=[];renderHome();',ctx);
chk('sin ramos, Inicio no deja insight cards viejas',el('home-insights').innerHTML===''&&el('home-insights').style.display==='none');

console.log(`\n${ok} ok, ${fail} fail`);
if(fail)process.exit(1);
