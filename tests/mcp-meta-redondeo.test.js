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

// El estado académico debe coincidir con la nota final que muestra la app.
const app=sandbox();
function servidor(r){
  const estado={ramos:[r]},ctx={console,Response,module:{exports:{}},HERRAMIENTAS:[],NOMBRES:['que_necesito_para_aprobar','simular'],fetch:async()=>({ok:true,json:async()=>structuredClone(estado)})};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/engine.js','utf8'),ctx);ctx.motorCompartido=ctx.module.exports;
  vm.runInContext(fs.readFileSync(root+'/functions/mcp/[[ruta]].js','utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),ctx);
  return async(name,args)=>{const response=await ctx.onRequestPost({params:{ruta:['a'.repeat(64)]},request:{json:async()=>({id:1,method:'tools/call',params:{name,arguments:args}})}});const body=await response.json();assert.equal(body.error,undefined);return JSON.parse(body.result.content[0].text);};
}
(async()=>{
  for(const [valor,meta,gates] of [[3.95,4,[]],[3.94,4,[]],[4.97,5,[]],[4.94,5,[]],[3.99,4,[{type:'min_grade_required',catId:'P',min:4,cap:3.99}]]]){
    const r=course('Curso sintético',[cat('P',100,[note('n',valor)])],{gates});
    const antes=JSON.stringify(r),llamar=servidor(r);app.r=r;app.run('S.ramos=[r]');
    const promedio=app.run('ramoAvg(r)');
    const alcanzada=meta===4?app.run('notaAprobadaRamo(r,ramoAvg(r))'):app.run('notaFinalOficial(ramoAvg(r))')>=meta;
    const cerrado=await llamar('que_necesito_para_aprobar',{ramo:r.nombre,meta});
    assert.equal(cerrado.promedioActual,promedio,'no crea otro promedio');
    assert.equal(cerrado.promedioNecesario,null);
    assert.equal(cerrado.estado,alcanzada?'meta_alcanzada':'sin_evaluaciones_pendientes',`Final ${valor}, meta ${meta}: el estado debe coincidir con la app`);
    assert.equal(cerrado.factibleEnEscala,alcanzada);
    const simulado=await llamar('simular',{ramo:r.nombre,meta,notas:[{evaluacion:'P',valor}]});
    assert.equal(simulado.promedioSimulado,promedio);
    assert.equal(simulado.alcanzaLaMeta,alcanzada);
    if(gates.length)assert.equal(simulado.compuertasIncumplidas.length,1,'la compuerta no se borra con el redondeo');
    assert.equal(JSON.stringify(r),antes,'ninguna nota guardada cambia');
  }
  console.log('OK: metas MCP respetan el redondeo final oficial y las compuertas');
})().catch(e=>{console.error(e);process.exitCode=1;});
