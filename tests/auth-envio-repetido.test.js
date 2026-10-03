// Enter llama directamente a las funciones: deshabilitar el botón no impide
// un segundo envío desde el campo mientras la petición sigue pendiente.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sesion=fs.readFileSync(path.join(__dirname,'../app-session.js'),'utf8');
let fallos=0;
const chk=(nombre,fn)=>{try{fn();console.log('OK: '+nombre);}catch(e){fallos++;console.error('FAIL: '+nombre+' — '+e.message);}};
function preparar(modo){
  const elementos=new Map(),almacen=new Map();
  const el=id=>{
    if(!elementos.has(id))elementos.set(id,{value:'',checked:true,disabled:false,textContent:id==='reset-btn'?'Guardar contraseña':'Entrar',style:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},focus(){}});
    return elementos.get(id);
  };
  el('auth-user').value='cuenta-sintetica@ejemplo.invalid';
  for(const id of ['auth-pass','auth-pass2','reset-pass','reset-pass2'])el(id).value='clave123';
  let resolver,intentos=0,entradas=0;
  let pendiente;
  const peticion=()=>{intentos++;return pendiente;};
  const ctx={window:{supabase:{createClient:()=>({auth:{signInWithPassword:peticion,signUp:peticion,updateUser:peticion}})}},document:{getElementById:el,querySelector:()=>null,addEventListener(){}},localStorage:{getItem:k=>almacen.get(k)||null,setItem:(k,v)=>almacen.set(k,v)},location:{},console,setTimeout(){},clearTimeout(){},showToast(){},registrarEntrada:()=>entradas++};
  vm.createContext(ctx);vm.runInContext(sesion,ctx);
  vm.runInContext(`authMode='${modo}';afterLogin=async()=>registrarEntrada();`,ctx);
  return {el,run:s=>vm.runInContext(s,ctx),abrir:()=>{pendiente=new Promise(resolve=>{resolver=resolve;});},resolver:r=>resolver(r),intentos:()=>intentos,entradas:()=>entradas};
}
(async()=>{
  for(const modo of ['login','signup','reset']){
    const h=preparar(modo),funcion=modo==='reset'?'submitNewPassword()':'submitAuth()',boton=h.el(modo==='reset'?'reset-btn':'auth-btn');
    h.abrir();const primero=h.run(funcion),segundo=h.run(funcion);
    chk(modo+': dos Enter generan una sola petición pendiente',()=>assert.equal(h.intentos(),1));
    chk(modo+': se mantiene el botón deshabilitado',()=>assert.equal(boton.disabled,true));
    h.resolver({data:modo==='signup'?{session:null}:{user:{id:'cuenta-sintetica'}},error:null});
    await Promise.all([primero,segundo]);
    chk(modo+': el botón vuelve a habilitarse',()=>assert.equal(boton.disabled,false));
    chk(modo+': el éxito no abre la app dos veces',()=>assert.equal(h.entradas(),modo==='signup'?0:1));
    // Un fallo también libera el envío; luego debe ser posible reintentarlo.
    const anteriores=h.intentos();h.abrir();const fallido=h.run(funcion);
    h.resolver({data:null,error:{message:'Network error'}});await fallido;
    chk(modo+': el error permite reintentar',()=>assert.equal(boton.disabled,false));
    h.abrir();const reintento=h.run(funcion);
    chk(modo+': se realiza una petición nueva tras el error',()=>assert.equal(h.intentos(),anteriores+2));
    h.resolver({data:null,error:{message:'Network error'}});await reintento;
  }
  const h=preparar('login');h.el('auth-user').value='correo inválido';await h.run('submitAuth()');
  chk('la validación local no llama a auth ni bloquea el botón',()=>{assert.equal(h.intentos(),0);assert.equal(h.el('auth-btn').disabled,false);});
  if(fallos)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
