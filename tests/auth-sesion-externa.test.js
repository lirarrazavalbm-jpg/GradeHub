// Eventos de Supabase sintéticos: otra pestaña y sesión revocada/vencida.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const fuente=fs.readFileSync(__dirname+'/../app-session.js','utf8');
function arnes(){
  let callback,recargas=0,auth=0,cierres=0;
  const almacen=new Map([['gradehub_v1','{"ramos":[{"id":"r-a"}]}'],['gradehub_cache_owner','a']]);
  const ctx={window:{},document:{addEventListener(){},getElementById:()=>({value:'',classList:{remove(){}},style:{}})},
    location:{hash:'',reload(){recargas++;}},localStorage:{getItem:k=>almacen.get(k)||null,setItem:(k,v)=>almacen.set(k,v),removeItem:k=>almacen.delete(k)},
    S:{onboardingDone:true},console,setTimeout,clearTimeout};
  vm.createContext(ctx);vm.runInContext(fuente,ctx);
  ctx.__cliente={auth:{onAuthStateChange:fn=>{callback=fn;},getSession:async()=>({data:{session:{user:{id:'a'}}}}),signOut:async()=>{callback('SIGNED_OUT',null);return {error:null};}}};
  ctx.__mostrar=()=>auth++;ctx.__cerrar=()=>cierres++;
  vm.runInContext(`supabaseClient=__cliente;afterLogin=async()=>{};showAuthScreen=__mostrar;closeModal=__cerrar;limpiarFragmentoAuth=()=>{};`,ctx);
  return {ctx,almacen,run:c=>vm.runInContext(c,ctx),evento:(...args)=>callback(...args),recargas:()=>recargas,auth:()=>auth,cierres:()=>cierres};
}
(async()=>{
  for(const evento of ['SIGNED_OUT','SIGNED_IN']){
    const h=arnes();await h.run('boot()');const antes=[...h.almacen];
    h.evento(evento,evento==='SIGNED_IN'?{user:{id:'b'}}:null);
    assert.equal(h.run('currentUser'),null,evento+': no sigue actuando como A');
    assert.equal(h.auth(),1,'oculta inmediatamente las pantallas privadas');
    assert.equal(h.cierres(),1,'oculta también el modal de A');
    assert.equal(h.recargas(),1,'reinicia las lecturas y cachés de la sesión anterior');
    assert.deepEqual([...h.almacen],antes,'conserva intacta la copia local sin respaldar');
  }
  const misma=arnes();await misma.run('boot()');
  misma.evento('TOKEN_REFRESHED',{user:{id:'a'}});misma.evento('SIGNED_IN',{user:{id:'a'}});
  assert.equal(misma.recargas(),0,'renovar la misma cuenta no interrumpe editar');
  const propia=arnes();await propia.run('boot()');
  propia.run(`STORAGE_KEY='gradehub_v1';CACHE_OWNER_KEY='gradehub_cache_owner';CURSO_SIGLAS_KEY='siglas';PRE_IMPORT_KEY='import';`);
  await propia.run('cerrarSesion()');
  assert.equal(propia.recargas(),0,'la salida explícita completa su limpieza antes de salir');
  assert.equal(propia.almacen.has('gradehub_v1'),false);
  console.log('OK: sesión externa, cambio de cuenta, renovación y salida explícita');
})().catch(e=>{console.error(e);process.exitCode=1;});
