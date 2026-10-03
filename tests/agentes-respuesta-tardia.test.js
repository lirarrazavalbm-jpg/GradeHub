// Lista y URL de conexión son privadas: una RPC vieja no las lleva a B.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const app=fs.readFileSync(__dirname+'/../app.js','utf8');
function arnes(){
  const ids={},el=id=>ids[id]||(ids[id]={disabled:false,textContent:'',value:'',innerHTML:''});
  const calls=[],toasts=[],pendientes=[];
  const ctx={document:{getElementById:el},currentUser:{id:'a'},console:{warn(){}},showToast:m=>toasts.push(m),esc:String,
    supabaseClient:{rpc:(nombre)=>{calls.push(nombre);return new Promise((resolve,reject)=>pendientes.push({resolve,reject}));},auth:{refreshSession:async()=>{}}}};
  vm.createContext(ctx);
  vm.runInContext(app.slice(app.indexOf('let agentesConectados='),app.indexOf('// Las propuestas no viven en S:')),ctx);
  const run=c=>vm.runInContext(c,ctx);
  return {ctx,el,calls,toasts,pendientes,run};
}
(async()=>{
  for(const volverA of [false,true]){
    const h=arnes(),p=h.run('cargarAgentesConectados()');
    h.ctx.currentUser={id:volverA?'a':'b'};
    const nueva=h.run('cargarAgentesConectados()');
    h.pendientes[1].resolve({data:[{id:'nuevo',agente:'Agente de la visita actual'}]});await nueva;
    h.pendientes[0].resolve({data:[{id:'viejo',agente:'Agente de la visita anterior'}]});await p;
    assert.equal(h.run('agentesConectados[0].id'),'nuevo','la lista anterior no reemplaza la vigente');
    const c=h.run('crearUrlAgente()');h.ctx.currentUser={id:'otra'};
    h.pendientes[2].resolve({data:{token:'a'.repeat(64)}});await c;
    assert.equal(h.run('agenteUrlActual'),'','no expone la llave de A a otra cuenta');
  }
  const h=arnes(),p=h.run('cargarAgentesConectados()');h.ctx.currentUser={id:'b'};
  h.pendientes[0].reject(Error('red'));await p;
  assert.equal(h.run('agentesError'),'','no pinta un error de otra visita');
  const r=arnes();let refresh;r.ctx.supabaseClient.auth.refreshSession=()=>new Promise(resolve=>{refresh=resolve;});
  const q=r.run("rpcAgente('crear_vinculo_agente',{p_agente:'Prueba'})");
  r.pendientes[0].resolve({error:{message:'sin sesión'}});await new Promise(setImmediate);
  r.ctx.currentUser={id:'b'};refresh();await q;
  assert.equal(r.calls.length,1,'no reintenta una operación de A con la sesión de B');
  const n=arnes(),z=n.run('crearUrlAgente()');n.pendientes[0].resolve({data:{token:'b'.repeat(64)}});await z;
  assert.equal(n.run('agenteUrlActual'),'https://gradehub.cl/mcp/'+'b'.repeat(64));
  n.pendientes[1].resolve({data:[]});await Promise.resolve();
  n.run('olvidarSesionAgentes()');assert.equal(n.run('agenteUrlActual'),'');assert.equal(n.run('agentesConectados.length'),0);
  assert.match(fs.readFileSync(__dirname+'/../app-session.js','utf8'),/typeof olvidarSesionAgentes==='function'\)olvidarSesionAgentes\(\)/,'la salida real limpia datos privados en memoria');
  console.log('OK: agentes, errores y reintentos respetan la visita de origen');
})().catch(e=>{console.error(e);process.exitCode=1;});
