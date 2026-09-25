// La página de administración pide un segundo factor (AGENTS.md: con un panel
// administrativo deja de ser opcional). Lo que protege de verdad es el
// servidor: sus funciones exigen estar en admin.administradores Y una sesión
// aal2. La puerta de la app solo guía a la persona hasta ahí.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const leer=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== El servidor ===');
const sql=leer('supabase/administradores.sql').split('\n').map(l=>l.replace(/--.*$/,'')).join('\n');
chk('la lista vive en el esquema admin, que la API no expone',/create table if not exists admin\.administradores/.test(sql)&&
  /revoke all on admin\.administradores from public, anon, authenticated/.test(sql));
chk('la lista se borra con la cuenta',/user_id\s+uuid primary key references auth\.users\(id\) on delete cascade/.test(sql));
chk('la llave exige estar en la lista y haber pasado el segundo factor',
  /function public\.administrador_verificado[\s\S]*?soy_administrador\(\)[\s\S]*?auth\.jwt\(\) ->> 'aal', ''\) = 'aal2'/.test(sql));
chk('esa llave no se puede llamar desde el navegador',/revoke all on function public\.administrador_verificado\(\) from public, anon, authenticated/.test(sql)&&
  !/grant [^;]*administrador_verificado/.test(sql));
chk('ningún correo queda escrito en el repositorio',!/@[a-z0-9-]+\.[a-z]{2,}/i.test(leer('supabase/administradores.sql')));

console.log('\n=== La puerta en la app ===');
// DOM mínimo: cada selector devuelve siempre el mismo elemento.
function nodo(){const n={textContent:'',value:'',handlers:{},hijos:{},focus(){},
  addEventListener(t,f){this.handlers[t]=f;},querySelector(sel){return this.hijos[sel]||(this.hijos[sel]=nodo());}};
  let html='';Object.defineProperty(n,'innerHTML',{get(){return html},set(v){html=String(v);n.hijos={};}});return n;}
const ctx={console,Promise,esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  document:{addEventListener(){}},location:{hash:''},window:{}};
vm.createContext(ctx);vm.runInContext(leer('app-session.js'),ctx);
const run=c=>vm.runInContext(c,ctx);
function montar({factores=[],nivel='aal1',codigoBueno='123456',qr='data:image/svg+xml;utf-8,<svg/>'}={}){
  const log={unenroll:[],enroll:0,verify:[]};
  ctx.__sb={auth:{mfa:{
    listFactors:async()=>({data:{all:factores,totp:factores.filter(f=>f.factor_type==='totp')},error:null}),
    getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:nivel},error:null}),
    unenroll:async({factorId})=>{log.unenroll.push(factorId);return {error:null};},
    enroll:async()=>{log.enroll++;return {data:{id:'nuevo',totp:{qr_code:qr,secret:'ABCDEF'}},error:null};},
    challengeAndVerify:async({factorId,code})=>{log.verify.push([factorId,code]);return {error:code===codigoBueno?null:{message:'invalid'}};},
  }}};
  run('supabaseClient=__sb;currentUser={id:"u1"};');
  return log;
}
(async()=>{
  let pasado=0;ctx.__alPasar=()=>{pasado++;};
  const raiz=nodo();ctx.__raiz=raiz;

  montar({factores:[{id:'f1',factor_type:'totp',status:'verified'}],nivel:'aal2'});
  await run('renderPuertaDosPasos(__raiz,{alPasar:__alPasar})');
  chk('con la sesión ya verificada pasa directo',pasado===1);

  const log=montar({factores:[{id:'f1',factor_type:'totp',status:'verified'}],nivel:'aal1'});
  await run('renderPuertaDosPasos(__raiz,{alPasar:__alPasar})');
  chk('con la app ya activada pide el código',/Código de 6 números/.test(raiz.innerHTML)&&pasado===1);
  const form=raiz.querySelector('.dos-pasos-form'),campo=raiz.querySelector('#dos-pasos-codigo'),estado=raiz.querySelector('.dos-pasos-estado');
  campo.value='12345';await form.handlers.submit({preventDefault(){}});
  chk('un código que no tiene 6 números ni se manda',log.verify.length===0&&/6 números/.test(estado.textContent));
  campo.value='999 999';await form.handlers.submit({preventDefault(){}});
  chk('un código equivocado no deja pasar',pasado===1&&/no sirve/.test(estado.textContent));
  campo.value='123 456';await form.handlers.submit({preventDefault(){}});
  chk('el código correcto deja pasar, sin espacios',pasado===2&&log.verify.at(-1)[1]==='123456');

  const log2=montar({factores:[{id:'viejo',factor_type:'totp',status:'unverified'}]});
  await run('renderPuertaDosPasos(__raiz,{alPasar:__alPasar})');
  chk('sin app activada ofrece activarla',/Activar/.test(raiz.innerHTML));
  await raiz.querySelector('#dos-pasos-activar').handlers.click();
  chk('borra el intento anterior a medias antes de empezar otro',log2.unenroll.join()==='viejo'&&log2.enroll===1);
  chk('muestra el QR y la clave para escribirla a mano',/dos-pasos-qr/.test(raiz.innerHTML)&&/ABCDEF/.test(raiz.innerHTML));

  montar({qr:'https://malo.example/qr.png'});
  await run('renderPuertaDosPasos(__raiz,{alPasar:__alPasar})');
  await raiz.querySelector('#dos-pasos-activar').handlers.click();
  chk('un QR que no es imagen data: no se carga',!/malo\.example/.test(raiz.innerHTML));

  console.log(`\n${ok} OK, ${fail} FAIL`);
  process.exit(fail?1:0);
})();
