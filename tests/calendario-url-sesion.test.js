// Una URL de calendario permite leer las evaluaciones de su dueño.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const app=fs.readFileSync(__dirname+'/../app.js','utf8');
function arnes(){
  let campo={value:'',select(){}};const pendientes=[],copias=[],avisos=[];
  const ctx={currentUser:{id:'a'},location:{origin:'https://gradehub.test'},document:{getElementById:()=>campo},
    supabaseClient:{rpc:()=>new Promise((resolve,reject)=>pendientes.push({resolve,reject}))},
    navigator:{clipboard:{writeText:async t=>{copias.push(t);}}},showToast:m=>avisos.push(m),track(){}};
  vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('let _feedUrl=null;'),app.indexOf('\n}',app.indexOf('function revocarFeedCalendario'))+2),ctx);
  return {ctx,pendientes,copias,avisos,run:c=>vm.runInContext(c,ctx),campo:()=>campo,reemplazar:()=>campo={value:'',select(){}}};
}
(async()=>{
  for(const volverA of [false,true]){
    const h=arnes(),anterior=h.run('pintarFeedCalendario()');h.ctx.currentUser={id:volverA?'a':'b'};h.reemplazar();
    const nueva=h.run('pintarFeedCalendario()');h.pendientes[1].resolve({data:'b'.repeat(64)});await nueva;
    h.pendientes[0].resolve({data:'a'.repeat(64)});await anterior;
    h.run('copiarFeedCalendario()');await Promise.resolve();
    assert.deepEqual(h.copias,['https://gradehub.test/cal/'+'b'.repeat(64)],'no copia la URL de la visita anterior');
  }
  const h=arnes(),p=h.run('pintarFeedCalendario()');h.ctx.currentUser={id:'b'};h.reemplazar();
  h.pendientes[0].reject(Error('red'));await p;assert.deepEqual(h.avisos,[],'no muestra errores de otra cuenta');
  const r=arnes(),primera=r.run('pintarFeedCalendario()'),segunda=r.run('pintarFeedCalendario()');
  r.pendientes[1].resolve({data:'c'.repeat(64)});await segunda;r.pendientes[0].resolve({data:'d'.repeat(64)});await primera;
  assert.equal(r.campo().value,'https://gradehub.test/cal/'+'c'.repeat(64),'la respuesta más vieja no pisa la última solicitud');
  r.ctx.currentUser={id:'b'};r.run('copiarFeedCalendario()');assert.deepEqual(r.copias,[],'una URL en memoria conserva dueño');
  console.log('OK: las URLs privadas de calendario quedan ligadas a su cuenta y solicitud');
})().catch(e=>{console.error(e);process.exitCode=1;});
