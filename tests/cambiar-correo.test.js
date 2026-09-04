// Cambiar el correo es el camino que evita que una cuenta quede atrapada por un
// error al registrarse. Se prueba aislado: no necesita hablar con Supabase real
// ni usar correos de personas.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const sesion=fs.readFileSync(raiz+'app-session.js','utf8');
const app=fs.readFileSync(raiz+'app.js','utf8');
let ok=0,fail=0;
const chk=(nombre,condicion)=>{console.log(`  ${condicion?'OK  ':'FAIL'} ${nombre}`);if(condicion)ok++;else fail++;};

function elemento(valor=''){
  const atributos={};
  return {value:valor,textContent:'',hidden:true,disabled:false,style:{},focused:false,
    setAttribute(k,v){atributos[k]=String(v);},getAttribute(k){return atributos[k]||null;},removeAttribute(k){delete atributos[k];},focus(){this.focused=true;}};
}
function arnes(resultado){
  const ids={
    's-account-email':elemento(''),
    's-account-email-status':elemento(),
    's-account-email-save':elemento('Cambiar correo')
  };
  let llamadas=0;
  const ctx={
    document:{getElementById:id=>ids[id]||null},
    currentUser:{email:'cuenta@ejemplo.test'},
    supabaseClient:{auth:{updateUser:async()=>{llamadas++;return resultado;}}},
    MSG_VERIFICA:'Ya puedes entrar con ese correo y tu contraseña.'
  };
  vm.createContext(ctx);
  const inicio=sesion.indexOf('function traduceAuthError');
  const fin=sesion.indexOf('// Recuperar contraseña',inicio);
  vm.runInContext(sesion.slice(inicio,fin),ctx);
  return {ctx,ids,llamadas:()=>llamadas};
}

console.log('\n=== Cambiar el correo de la cuenta ===');
let kit=arnes({data:{user:{email:'cuenta@ejemplo.test'}},error:null});
kit.ids['s-account-email'].value='correo-mal-escrito';
const cambiar=kit.ctx.cambiarCorreoCuenta;
if(typeof cambiar!=='function'){
  chk('existe el control para corregir el correo de acceso',false);
  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(1);
}
Promise.resolve(cambiar()).then(resultado=>{
  chk('valida el formato antes de mandarlo a Supabase',resultado===false&&kit.llamadas()===0&&/correo electrónico válido/i.test(kit.ids['s-account-email-status'].textContent)&&kit.ids['s-account-email'].focused);

  kit=arnes({data:null,error:{message:'Email already registered'}});
  kit.ids['s-account-email'].value='otra@ejemplo.test';
  return kit.ctx.cambiarCorreoCuenta();
}).then(resultado=>{
  chk('traduce un correo ya tomado sin usar el mensaje de registro',resultado===false&&/ya está asociado a otra cuenta/i.test(kit.ids['s-account-email-status'].textContent));

  kit=arnes({data:{user:{email:'cuenta@ejemplo.test'}},error:null});
  kit.ids['s-account-email'].value='nuevo@ejemplo.test';
  return kit.ctx.cambiarCorreoCuenta();
}).then(resultado=>{
  chk('el éxito aclara que hay que confirmar ambos correos',resultado===true&&/correo actual y el nuevo/i.test(kit.ids['s-account-email-status'].textContent)&&/confirmes los dos/i.test(kit.ids['s-account-email-status'].textContent));
  chk('Ajustes expone el correo de acceso solo para una sesión iniciada',/id="s-account-email"/.test(app)&&/cambiarCorreoCuenta\(\)/.test(app)&&/currentUser\?`[\s\S]{0,1400}s-account-email/.test(app));
  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
}).catch(e=>{console.error(e);process.exit(1);});
