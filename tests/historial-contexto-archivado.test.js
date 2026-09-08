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

const c=sandbox();const dyn=course('Dinamica',[cat('dc',100,[note('dn',6)])],{aporta:{ramo:'Laboratorio',peso:30,min:4}}),lab=course('Laboratorio',[cat('lc',100,[note('ln',4)])],{creditos:0});
c.h={id:'h',label:'Anterior',ramos:[dyn,lab]};c.run('S.ramos=[];h.gpa=gpa(h.ramos)');const before=c.h.gpa;
c.run('S.historial=[h];save=()=>{};closeModal=()=>{};renderStats=()=>{};showToast=()=>{}');
c.document.getElementById('m-hist-avg').value='4';c.confirmEditHistRamo('h','Laboratorio');
assert.equal(c.h.gpa,before,'guardar el mismo 4,0 no puede convertir un promedio archivado de 5,4 en 6,0');
const notasAntes=JSON.stringify(c.h.ramos.map(r=>r.categorias));
c.actual=course('Laboratorio',[cat('otra',100,[note('actual',7)])],{creditos:0});
c.run('S.ramos=[actual];openModal=()=>{}');
assert.equal(c.histRamoAvg(dyn,c.h.ramos),before,'el laboratorio actual no influye en el archivado');
c.openEditHistRamoModal('h','Dinamica');
assert.match(c.document.getElementById('modal-content').innerHTML,/value="5\.4"/);
c.resetHistRamoAvg('h','Laboratorio');
assert.equal(c.h.gpa,before,'restaurar usa el mismo semestre que editar');
assert.equal(JSON.stringify(c.h.ramos.map(r=>r.categorias)),notasAntes,'no se reescriben evaluaciones archivadas');
const sinNotas={ramos:[course('Vacío',[cat('sin',100)])]};
c.recomputeHistGpa(sinNotas);assert.equal(sinNotas.gpa,null);
console.log('OK: el promedio usa los ramos del semestre archivado');
