// Tres caminos del login que fallaban sin error visible (barrido del 2026-10-01).
// Cuentas, correos y notas sintéticos; el cliente de Supabase es falso pero
// imita el orden real de auth-js 2.112.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','marketplace.js','render-main.js','render-agenda.js']
  .map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
function classList(){const c=new Set();return{add(...x){x.forEach(v=>c.add(v));},remove(...x){x.forEach(v=>c.delete(v));},contains(v){return c.has(v);},toggle(){}};}
function el(){let html='';const attrs={};
  const nodo={style:{setProperty(){},removeProperty(){}},classList:classList(),children:[],textContent:'',value:'',dataset:{},parentElement:null,
    addEventListener(){},appendChild(h){this.children.push(h);return h;},setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},getAttribute(k){return attrs[k]||null;},
    querySelector(){return nodo;},querySelectorAll(){return [];},focus(){},select(){},click(){},remove(){},scrollTo(){},clientWidth:400};
  nodo.parentElement=nodo;
  Object.defineProperty(nodo,'innerHTML',{get(){return html;},set(v){html=String(v);this.children=[];}});
  return nodo;}
function contexto(hash,cliente){
  const ids={},guardado={};
  const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}}),supabase:{createClient:()=>cliente}},
    document:{getElementById:id=>ids[id]||(ids[id]=el()),createElement:el,addEventListener(){},documentElement:el(),querySelector(){return el();},querySelectorAll(){return [];},body:el()},
    localStorage:{getItem(k){return k in guardado?guardado[k]:null;},setItem(k,v){guardado[k]=String(v);},removeItem(k){delete guardado[k];}},
    navigator:{},location:{origin:'https://gradehub.cl',pathname:'/',search:'',hash},history:{replaceState(){}},
    setTimeout,clearTimeout,requestAnimationFrame(){return 1},performance:{now:()=>0},console:{...console,warn(){},error(){}}};
  vm.createContext(ctx);vm.runInContext(src,ctx);
  return {ctx,ids,guardado,run:c=>vm.runInContext(c,ctx)};
}
const espera=ms=>new Promise(r=>setTimeout(r,ms));
let ok=0,fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++;};

(async()=>{
  console.log('\n=== El enlace de recuperación lleva a poner la contraseña nueva ===');
  // Como auth-js: al iniciar borra el fragmento y avisa PASSWORD_RECOVERY en un
  // setTimeout, después de que getSession() ya entregó la sesión.
  let avisar=null,lecturas=0,t=null;
  const sesion={user:{id:'u-sintetico-1',email:'ana@ejemplo.test'}};
  const cliente={
    auth:{onAuthStateChange(f){avisar=f;return {data:{subscription:{unsubscribe(){}}}};},
      async getSession(){t.ctx.location.hash='';setTimeout(()=>avisar&&avisar('PASSWORD_RECOVERY',sesion),0);return {data:{session:sesion},error:null};}},
    from(){lecturas++;const q={select(){return q;},eq(){return q;},maybeSingle:async()=>{await espera(5);return {data:null,error:null};}};return q;},
    rpc:async()=>({data:null,error:null}),
  };
  t=contexto('#access_token=tok-sintetico&expires_in=3600&refresh_token=ref-sintetico&token_type=bearer&type=recovery',cliente);
  await t.run('boot()');await espera(30);
  chk('queda en la pantalla de nueva contraseña',t.ids['screen-reset'].classList.contains('active'));
  chk('y no entra a la app por detrás',!t.ids['screen-home'].classList.contains('active')&&!t.ids['screen-onboard'].classList.contains('active'));
  chk('sin leer la nube antes de cambiarla',lecturas===0);

  console.log('\n=== Cerrar sesión no borra lo que no alcanzó a subir ===');
  let red=true;
  const cliente2={auth:{signOut:async()=>({error:null})},rpc:async()=>({data:null,error:null}),
    from(){const q={upsert:async()=>red?{error:null}:{error:{message:'sin red'}},update(){return q;},eq(){return q;},is(){return q;},
      select:async()=>red?{data:[{user_id:'u-sintetico-1'}],error:null}:{data:null,error:{message:'sin red'}}};return q;}};
  const s=contexto('',cliente2);
  s.run(`currentUser={id:'u-sintetico-1'};S=normalize({...freshState(),onboardingDone:true,ramos:[{id:'r1',nombre:'Ramo sintético',categorias:[]}]});
    localStorage.setItem(STORAGE_KEY,JSON.stringify(S));guardarBaseSync('u-sintetico-1',JSON.parse(JSON.stringify(S)));`);
  s.run(`S.ramos[0].categorias.push({id:'c1',nombre:'Prueba',peso:100,notas:[{id:'n1',valor:6.5}]});localStorage.setItem(STORAGE_KEY,JSON.stringify(S));`);
  red=false;
  await s.run('signOut()');
  chk('sin red, pregunta antes de salir',s.ids['confirm-title'].textContent==='Tienes cambios sin respaldar');
  chk('y la nota sigue en el dispositivo',/6\.5/.test(s.guardado.gradehub_v1||''));
  red=true;
  await s.run('signOut()');
  chk('con red, la sube y sale sin preguntar',!('gradehub_v1' in s.guardado)&&s.run('currentUser')===null);

  console.log('\n=== Los errores de Supabase dicen lo que pasó ===');
  const tr=e=>s.run('traduceAuthError')(e);
  chk('límite de correos no culpa al internet',/varios intentos/.test(tr({status:429,code:'over_email_send_rate_limit',message:'email rate limit exceeded'})));
  chk('esperar entre correos tampoco',/varios intentos/.test(tr({message:'For security purposes, you can only request this after 52 seconds.'})));
  chk('la misma contraseña de antes se explica',/distinta de la anterior/.test(tr({code:'same_password',message:'New password should be different from the old password.'})));
  chk('credenciales malas siguen igual',tr({message:'Invalid login credentials'})==='Usuario o contraseña incorrectos.');
  chk('un correo ya registrado sigue sin delatarse',tr({message:'User already registered'})===s.run('MSG_VERIFICA'));

  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
