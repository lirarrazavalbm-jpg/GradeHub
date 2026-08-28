// Una sesión válida no puede terminar presentada como un problema de login si
// el render falla. El bug anterior tragaba la excepción completa y activaba
// screen-auth: la persona insistía con Google aunque su sesión estaba bien.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'app-session.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

function classList(inicial){
  const clases=new Set(inicial||[]);
  return {add(...xs){xs.forEach(x=>clases.add(x));},remove(...xs){xs.forEach(x=>clases.delete(x));},contains(x){return clases.has(x);}};
}
const ids={};
['auth','home','stats','agenda','ramo','onboard','reset','app-error'].forEach(id=>{
  ids['screen-'+id]={style:{},classList:classList(id==='auth'?['active']:[]),textContent:'',setAttribute(){},removeAttribute(){}};
});
ids['bottom-nav']={style:{display:'flex'},classList:classList()};
ids['app-error-title']={style:{},classList:classList(),textContent:''};
ids['app-error-desc']={style:{},classList:classList(),textContent:''};
const stub={style:{setProperty(){},removeProperty(){}},classList:classList(),addEventListener(){},appendChild(){},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return stub;},querySelectorAll(){return[];},clientWidth:400,dataset:{},click(){}};
const appEl={style:{},classList:classList(['tab-mode'])};
const eventos=[];
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:id=>ids[id]||stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:q=>q==='.app'?appEl:stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},
  location:{origin:'',pathname:'/',search:'',hash:'',reload(){}},history:{replaceState(){}},
  gtag:(accion,evento,params)=>eventos.push({accion,evento,params}),
  setTimeout,clearTimeout,console,
};
vm.createContext(ctx);vm.runInContext(src,ctx);

let ok=0,fail=0;
const chk=(nombre,cond)=>{if(cond){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}};

async function main(){
  console.log('=== Sesión válida + enterApp falla ===');
  vm.runInContext(`
    S={...freshState(),onboardingDone:true,userName:'Persona Sintética',ramos:[{
      id:'r',nombre:'Ramo Sintético',categorias:[{id:'c',nombre:'Control Sintético',notas:[]}]
    }]};
    supabaseClient={auth:{
      onAuthStateChange(){},
      getSession:async()=>({data:{session:{user:{id:'usuario-prueba',email:'persona@example.com',user_metadata:{full_name:'Persona Sintética'}}}}})
    }};
    enterApp=()=>{throw new TypeError('Ramo Sintético persona@example.com 5.4 no se pudo dibujar');};
    afterLogin=async()=>enterApp();
  `,ctx);
  await vm.runInContext('boot()',ctx);

  chk('no muestra el login',!ids['screen-auth'].classList.contains('active'));
  chk('muestra una pantalla de recuperación',ids['screen-app-error'].classList.contains('active'));
  chk('explica que la sesión sigue activa',ids['app-error-desc'].textContent.includes('sesión sigue activa'));
  chk('sale del carrusel que podría tapar el aviso',!appEl.classList.contains('tab-mode'));
  const error=eventos.find(e=>e.evento==='app_boot_error');
  chk('registra el fallo de abrir la app',!!error&&error.params.fase==='abrir_app'&&error.params.tipo==='TypeError');
  chk('el detalle no filtra datos sintéticos del estudiante',!!error&&!/Ramo Sintético|persona@example\.com|5\.4/.test(error.params.detalle));

  console.log('\n=== Sin sesión ===');
  eventos.length=0;
  vm.runInContext(`supabaseClient.auth.getSession=async()=>({data:{session:null}});`,ctx);
  await vm.runInContext('boot()',ctx);
  chk('sin sesión sí muestra el login',ids['screen-auth'].classList.contains('active'));
  chk('sin sesión quita la pantalla de error',!ids['screen-app-error'].classList.contains('active'));
  chk('la ausencia normal de sesión no se registra como error',!eventos.some(e=>e.evento==='app_boot_error'));

  console.log('\n=== No se pudo comprobar la sesión ===');
  eventos.length=0;
  vm.runInContext(`supabaseClient.auth.getSession=async()=>{throw new TypeError('Network request failed 503')};`,ctx);
  await vm.runInContext('boot()',ctx);
  chk('un fallo de red tampoco se disfraza de logout',!ids['screen-auth'].classList.contains('active'));
  chk('explica que no pudo comprobar la sesión',ids['app-error-title'].textContent.includes('comprobar tu sesión'));
  const errorSesion=eventos.find(e=>e.evento==='app_boot_error');
  chk('registra aparte el fallo al comprobar sesión',!!errorSesion&&errorSesion.params.fase==='obtener_sesion');

  console.log('\nPASS: '+ok+'   FAIL: '+fail);
  process.exit(fail?1:0);
}
main().catch(e=>{console.error(e);process.exit(1);});
