// Una actualización de credenciales en vuelo no puede revivir otra sesión.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function arnes(){
  const ids={},el=id=>ids[id]||(ids[id]={value:'',textContent:'',disabled:false,style:{},classList:{remove(){}},setAttribute(){},removeAttribute(){},focus(){}});
  const ctx={window:{},document:{getElementById:el,addEventListener(){}},location:{hash:''},console,setTimeout,clearTimeout};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../app-session.js','utf8'),ctx);
  let resolver;ctx.__cliente={auth:{updateUser:()=>new Promise(r=>{resolver=r;})}};
  ctx.__avisos=[];ctx.__entradas=0;
  const run=c=>vm.runInContext(c,ctx);
  run("supabaseClient=__cliente;currentUser={id:'a',email:'a@example.invalid'};showToast=m=>__avisos.push(m);afterLogin=async()=>{__entradas++;};");
  el('s-account-email').value='nuevo@example.invalid';el('s-account-email-save').textContent='Cambiar correo';
  el('reset-pass').value=el('reset-pass2').value='nuevo12345';el('reset-btn').textContent='Guardar contraseña';
  return {ctx,el,run,resolver:r=>resolver(r)};
}
(async()=>{
  for(const accion of ['cambiarCorreoCuenta()','submitNewPassword()']){
    for(const destino of ["{id:'b',email:'b@example.invalid'}","null","{id:'a',email:'a@example.invalid'}"]){
      const h=arnes(),p=h.run(accion);h.run('currentUser='+destino);
      h.resolver({data:{user:{id:'a',email:'nuevo@example.invalid'}},error:null});await p;
      assert.equal(h.run('currentUser&&currentUser.email'),destino==='null'?null:destino.includes("id:'b'")?'b@example.invalid':'a@example.invalid',accion+': conserva la sesión vigente');
      assert.equal(h.ctx.__entradas,0,'no carga datos tras una recuperación obsoleta');
      assert.deepEqual(h.ctx.__avisos,[],'no anuncia éxito de otra visita');
    }
    const h=arnes(),p=h.run(accion);h.run("currentUser={id:'b',email:'b@example.invalid'}");
    h.resolver({error:{message:'Email already registered'}});await p;
    assert.equal(h.el('s-account-email-status').textContent,'','no pinta error del correo de A');
    assert.equal(h.el('reset-error').textContent,'','no pinta error de recuperación de A');
  }
  const h=arnes(),p=h.run('cambiarCorreoCuenta()');h.resolver({data:{user:{id:'a',email:'nuevo@example.invalid'}},error:null});
  assert.equal(await p,true);assert.equal(h.run('currentUser.email'),'nuevo@example.invalid');
  assert.equal(h.el('s-account-email-save').disabled,false);
  const r=arnes(),q=r.run('submitNewPassword()');r.resolver({data:{user:{id:'a',email:'a@example.invalid'}},error:null});await q;
  assert.equal(r.ctx.__entradas,1);assert.equal(r.el('reset-btn').disabled,false);
  console.log('OK: correo y recuperación descartan respuestas de una visita anterior');
})().catch(e=>{console.error(e);process.exitCode=1;});
