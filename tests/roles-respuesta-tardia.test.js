// Una respuesta de A no puede volver a habilitar sus roles después de salir.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function arnes(){
  const ctx={console,currentUser:{id:'a'},supabaseClient:{rpc:null}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../marketplace.js','utf8'),ctx);
  return {ctx,run:s=>vm.runInContext(s,ctx)};
}
(async()=>{
  for(const volverA of [false,true]){
    const h=arnes(),perfilA=defer(),adminA=defer(),perfilB=defer(),adminB=defer();
    h.ctx.__perfil=perfilA.promise;h.ctx.supabaseClient.rpc=()=>adminA.promise;
    h.run('perfilProfesorActual=()=>__perfil;');
    const pA=h.run('cargarPerfilProfesor()'),aA=h.run('cargarSoyAdministrador()');
    h.run('olvidarSesionMarketplace();');h.ctx.currentUser={id:volverA?'a':'b'};
    h.ctx.__perfil=perfilB.promise;h.ctx.supabaseClient.rpc=()=>adminB.promise;
    const pB=h.run('cargarPerfilProfesor()'),aB=h.run('cargarSoyAdministrador()');
    perfilB.resolve({ok:true,perfil:null});adminB.resolve({data:false,error:null});await pB;await aB;
    perfilA.resolve({ok:true,perfil:{nombre_publico:'Ficha anterior',estado:'aprobado'}});adminA.resolve({data:true,error:null});await pA;await aA;
    assert.equal(h.run('esProfesorAprobado()'),false,'la ficha anterior no aparece en la nueva sesión');
    assert.equal(h.run('esAdministrador()'),false,'el rol admin anterior no revive');
    assert.equal(h.run('perfilProfesorConocido()'),false);
  }
  const h=arnes(),vieja=defer();h.ctx.supabaseClient.rpc=()=>vieja.promise;
  const anterior=h.run('cargarSoyAdministrador()');h.run('olvidarSesionMarketplace();');h.ctx.currentUser={id:'b'};
  h.ctx.supabaseClient.rpc=async()=>({data:true,error:null});await h.run('cargarSoyAdministrador()');
  vieja.reject(Error('red'));await anterior;
  assert.equal(h.run('esAdministrador()'),true,'un error tardío de A tampoco borra el rol real de B');
  console.log('OK: respuestas privadas de roles quedan atadas a su cuenta y visita');
})().catch(e=>{console.error(e);process.exitCode=1;});
