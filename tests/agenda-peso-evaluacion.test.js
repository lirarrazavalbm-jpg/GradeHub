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

const c=sandbox();const n={...note('Informe 0',null,0),fecha:'2026-10-01'};
c.r=course('Laboratorio',[cat('Informes',70,[n],{slots:6}),cat('Examen',30,[],{fecha:'2026-10-01'})]);c.run('S.ramos=[r]');
const ev=c.agendaEvents().map(e=>({...e,dias:1,score:0,necesita:4,avg:null,nivel:'baja',estadoAgenda:'por_venir'}));
const orden=c.ordenarAgenda(ev,'peso');
assert.equal(orden[0].cat.nombre,'Examen','Informe 0 no puede llevarse el peso de seis informes');
const informe=orden[1],before=JSON.stringify(c.r);
assert.ok(Math.abs(c.pesoEventoAgenda(informe)-70/6)<1e-9);
assert.equal(c.resumenSemanaAgenda(ev).peso,41.67);
for(const html of [c.agendaDestacadaHTML(informe,0),c.agendaItemHTML(informe),c.agendaRendidaHTML({...informe,notas:[note('Informe 0',4,0)]})]){
  assert.match(html,/11\.67%/);
  assert.match(html,/Informe 0/);
  assert.doesNotMatch(html,/>70%/);
}
assert.ok(c.withPriority(ev[1]).score>c.withPriority(ev[0]).score,'Recomendado también usa el peso individual');
assert.equal(JSON.stringify(c.r),before,'mostrar la fracción no cambia pesos guardados');
// Si el grupo conserva fecha, no vuelve a sumar los informes con fecha propia.
c.r.categorias[0].fecha='2026-10-02';
const todos=c.agendaEvents().map(e=>({...e,dias:1}));
assert.equal(c.resumenSemanaAgenda(todos).peso,100);
// Una lista abierta o un descarte no permite prometer un porcentaje individual.
delete c.r.categorias[0].slots;
assert.equal(c.pesoEventoAgenda(informe),null);
assert.match(c.agendaDestacadaHTML(informe,0),/Peso variable · grupo 70%/);
assert.equal(c.resumenSemanaAgenda(ev).peso,null);
c.r.categorias[0].slots=6;c.r.categorias[0].dropLowest={count:1};
assert.equal(c.pesoEventoAgenda(informe),null);
console.log('OK: Examen 30% precede al informe de 11,67%');
