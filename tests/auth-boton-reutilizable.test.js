// Iniciar sesión, salir y volver a usar el mismo formulario en la misma visita.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function arnes(){
  const ids={};const el=id=>ids[id]||(ids[id]={value:'',textContent:'',disabled:false,checked:true,
    style:{},classList:{remove(){}},removeAttribute(){},setAttribute(){},focus(){}});
  const ctx={window:{},document:{getElementById:el,addEventListener(){}},location:{hash:''},console,setTimeout,clearTimeout};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../app-session.js','utf8'),ctx);
  ctx.__cliente={auth:{signInWithPassword:async()=>({data:{user:{id:'a'}},error:null}),signUp:async()=>({data:{user:{id:'b'},session:{}},error:null}),updateUser:async()=>({data:{user:{id:'a'}},error:null})}};
  vm.runInContext(`supabaseClient=__cliente;afterLogin=async()=>{};afterSignup=async()=>{};registrarAceptacionLegal=async()=>{};recordarMetodoLogin=()=>{};showToast=()=>{};`,ctx);
  el('auth-user').value='persona@example.invalid';el('auth-pass').value=el('auth-pass2').value='abc12345';
  el('auth-btn').textContent='Iniciar sesión';el('reset-btn').textContent='Guardar contraseña';
  el('reset-pass').value=el('reset-pass2').value='nuevo123';
  return {ctx,el,run:c=>vm.runInContext(c,ctx)};
}
(async()=>{
  for(const modo of ['login','signup']){
    const h=arnes();h.run(`authMode='${modo}'`);await h.run('submitAuth()');
    assert.equal(h.el('auth-btn').disabled,false,modo+': puede volver a entrar después de salir');
    assert.equal(h.el('auth-btn').textContent,'Iniciar sesión');
    h.ctx.__cliente.auth.signInWithPassword=async()=>({error:{message:'Invalid login credentials'}});
    h.run("authMode='login'");await h.run('submitAuth()');
    assert.equal(h.el('auth-btn').disabled,false,'un fallo también permite reintentar');
  }
  const h=arnes();await h.run('submitNewPassword()');
  assert.equal(h.el('reset-btn').disabled,false,'el formulario de recovery se puede usar otra vez');
  assert.equal(h.el('reset-btn').textContent,'Guardar contraseña');
  console.log('OK: los formularios vuelven a estar disponibles tras éxito y error');
})().catch(e=>{console.error(e);process.exitCode=1;});
