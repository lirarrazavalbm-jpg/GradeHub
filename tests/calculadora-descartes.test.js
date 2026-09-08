const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const path=require('path');
const root=process.env.GRADEHUB_ROOT||(process.env.GRADEHUB_APP?path.dirname(process.env.GRADEHUB_APP):path.join(__dirname,'..'));
function sandbox(){
  const store=new Map(),elements=new Map();
  const element=()=>({style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false},toggle(){}},addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return []},querySelector(){return null},focus(){},select(){},value:'',innerHTML:'',textContent:'',dataset:{},clientWidth:375});
  const ctx={console,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element,addEventListener(){},documentElement:element(),body:element(),querySelector(){return null},querySelectorAll(){return []}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout(){return 1},clearTimeout(){},requestAnimationFrame(){}};
  vm.createContext(ctx);
  for(const f of ['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),ctx,{filename:f});
  ctx.run=s=>vm.runInContext(s,ctx);return ctx;
}
const note=(id,valor,slot)=>({id,nombre:id,valor,peso:1,...(slot===undefined?{}:{slot})});
const cat=(id,peso,notas=[],extra={})=>({id,nombre:id,peso,notas,directNota:true,...extra});
const course=(id,categorias,extra={})=>({id,nombre:id,categorias,creditos:10,origen:null,gates:[],...extra});

const c=sandbox();
const r=course('transporte',[cat('Controles',45,[1,4,4,4].map((n,i)=>note('c'+i,n,i)),{slots:5,dropLowest:{count:1}}),...['Meme 1','Meme 2','Meme 3','Meme 4'].map((n,i)=>cat(n,5,[note('m'+i,4)])),cat('Examen',35,[note('ex',4)])]);
c.r=r;c.run('S.ramos=[r]');
const needed=c.run('notaNecesaria(r)');
const filled=structuredClone(r);filled.categorias[0].notas.push(note('c4',4,4));c.filled=filled;
assert.equal(c.run('ramoAvg(filled)'),4);
assert.equal(c.run('solveForTarget(ramoToStructure(r),gradesOf(r),4).requiredAverage'),4);
assert.ok(Math.abs(needed-4)<1e-9,'la app exige más que una nota que sí permite aprobar');
c.run('currentRamoId=r.id;openModal=()=>{}');c.openCalculadoraModal();
c.document.getElementById('m-calc-target').value='4';c.window.calcResult();
assert.match(c.document.getElementById('calc-result').innerHTML,/>4\.0<\/b>/);
assert.doesNotMatch(c.document.getElementById('calc-result').innerHTML,/imposible/);
const before=JSON.stringify(r),avg=c.run('ramoAvg(r)');
assert.ok(c.notaNecesaria(r,7)>7,'una meta imposible no se disfraza de un 7,0 alcanzable');
assert.equal(JSON.stringify(r),before,'calcular no guarda notas hipotéticas');
assert.equal(c.run('ramoAvg(r)'),avg,'el promedio actual no cambia');

// El descarte de un grupo ya terminado tampoco vuelve a entrar como peso bruto.
const completo=course('completo',[cat('controles',50,[1,4,4,4,4].map((n,i)=>note('c'+i,n,i)),{slots:5,dropLowest:{count:1}}),cat('examen',50)]);
assert.equal(c.notaNecesaria(completo),4);
// Los ids son locales a cada acta: el vínculo no puede pisar sus notas.
const vinculado=course('vinculado',[cat('examen',100,[note('ex',4)])],{aporta:{ramo:r.nombre,peso:30,min:4}});
c.vinculado=vinculado;c.run('S.ramos=[vinculado,r]');
assert.ok(Math.abs(c.notaNecesaria(vinculado)-4)<1e-9);
const borde=course('borde',[cat('primera',50,[note('p',6.9998)]),cat('segunda',50)]);
assert.ok(Math.abs(c.notaNecesaria(borde,7)-7.0002)<1e-9,'no redondear antes de decidir si cabe en la escala');
assert.equal(c.resumenMetaCalculadora(c.notaNecesaria(borde,7)).estado,'inalcanzable');
console.log('OK: la reproducción de 2ff3468 ahora exige 4,0, no 7,0');
