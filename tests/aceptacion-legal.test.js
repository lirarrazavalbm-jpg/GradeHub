// Aceptar no puede ser una frase pasiva: el registro necesita un acto visible,
// y ese acto tiene que quedar fechado y versionado sin bloquear cuentas previas.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const leer=(archivo,env)=>{
  const ruta=process.env[env]||path.join(raiz,archivo);
  return fs.existsSync(ruta)?fs.readFileSync(ruta,'utf8'):'';
};
let fail=0;
const chk=(nombre,ok)=>{console.log(`  ${ok?'OK  ':'FAIL'} ${nombre}`);if(!ok)fail++;};

const html=leer('index.html','GRADEHUB_INDEX');
const sesion=leer('app-session.js','GRADEHUB_SESSION');
const privacidad=leer('privacidad.html','GRADEHUB_PRIVACIDAD');
const preguntas=leer('preguntas.html','GRADEHUB_PREGUNTAS');
const terminos=leer('terminos.html','GRADEHUB_TERMINOS');
const sql=leer('supabase/aceptacion_legal.sql','GRADEHUB_SQL');

console.log('\n=== Aceptación explícita al registrarse ===');
const casillas=[...html.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)].filter(m=>/id="auth-legal-accept"/.test(m[0]));
chk('hay una sola casilla de aceptación en registro',casillas.length===1);
chk('la casilla parte desmarcada',casillas.length===1&&!/\bchecked\b/.test(casillas[0][0]));
chk('la casilla enlaza términos, privacidad y el uso local para recomendaciones',
  /auth-legal-accept[\s\S]{0,900}términos de uso[\s\S]{0,900}política de privacidad[\s\S]{0,900}notas y ramos[\s\S]{0,900}recomendaciones de clases/i.test(html));
chk('sin marcarla el registro se detiene antes de llamar a Supabase',
  /authMode==='signup'[\s\S]{0,900}auth-legal-accept[\s\S]{0,500}acepta los términos[\s\S]{0,1000}signUp\(/i.test(sesion));
chk('al volver a iniciar sesión la casilla se limpia y se esconde',
  /auth-legal-accept-wrap[\s\S]{0,400}authMode==='signup'[\s\S]{0,700}if\(authMode!=='signup'&&legalAccept\)legalAccept\.checked=false/i.test(sesion));

console.log('\n=== Constancia compatible con cuentas existentes ===');
chk('la versión legal está declarada una sola vez',
  (sesion.match(/LEGAL_ACCEPTANCE_VERSION/g)||[]).length>=2&&/const LEGAL_ACCEPTANCE_VERSION\s*=\s*'\d{4}-\d{2}-\d{2}'/.test(sesion));
chk('el registro guarda fecha y versión en el perfil antes de abrir la app',
  /async function registrarAceptacionLegal[\s\S]{0,1200}terminos_aceptados_en[\s\S]{0,500}terminos_version/.test(sesion)&&
  /currentUser=data\.user;\s*await registrarAceptacionLegal\(\);\s*await afterSignup\(\)/.test(sesion));
chk('las columnas nuevas son opcionales: no reescriben ni bloquean perfiles previos',
  /add column if not exists terminos_aceptados_en timestamptz/i.test(sql)&&
  /add column if not exists terminos_version text/i.test(sql)&&
  !/not null/i.test(sql));
const boot=(sesion.match(/async function boot\(\)[\s\S]*?(?=\nasync function |\nfunction |\n\/\/)/)||[])[0]||'';
chk('una sesión existente no se redirige por no tener constancia',!/terminos_aceptados|terminos_version|LEGAL_ACCEPTANCE/.test(boot));

console.log('\n=== Lo que se acepta está publicado ===');
const usoLocal=/(notas y ramos|ramos y notas)[\s\S]{0,500}(local|navegador)[\s\S]{0,500}(ordenar|recomendaciones)[\s\S]{0,500}(profesores|profesor)[\s\S]{0,500}(no ven|no recibe|no reciben|no saben)/i;
chk('la privacidad explica el uso local y que profesores no reciben notas',usoLocal.test(privacidad));
chk('las preguntas frecuentes dicen lo mismo sin prometer un selector',usoLocal.test(preguntas)&&!/permiso explícito[\s\S]{0,220}si dices que no/i.test(preguntas));
chk('los términos incorporan el mismo alcance',usoLocal.test(terminos));

async function pruebaDeRegistro(){
  const elementos={};
  const campo=(valor='')=>({value:valor,style:{},setAttribute(){},removeAttribute(){},focus(){}});
  elementos['auth-user']=campo('alguien@ejemplo.cl');
  elementos['auth-pass']=campo('clave123');
  elementos['auth-pass2']=campo('clave123');
  elementos['auth-legal-accept']={checked:false,style:{},setAttribute(){},removeAttribute(){},focus(){}};
  elementos['auth-error']=campo();
  elementos['auth-btn']=campo('Crear cuenta');
  let intentos=0,perfil=null;
  const cliente={
    auth:{signUp:async()=>{intentos++;return {data:{session:{},user:{id:'cuenta-nueva'}},error:null};}},
    from:()=>({upsert:async datos=>{perfil=datos;return {error:null};}}),
  };
  const contexto={
    window:{supabase:{createClient:()=>cliente}},
    document:{getElementById:id=>elementos[id]||campo(),querySelector:()=>null,addEventListener(){}},
    console:{warn(){},log(){}},setTimeout(){},clearTimeout(){},location:{},
  };
  vm.createContext(contexto);
  vm.runInContext(sesion,contexto);
  vm.runInContext("authMode='signup'",contexto);
  await vm.runInContext('submitAuth()',contexto);
  chk('la casilla desmarcada no alcanza a crear una cuenta',
    intentos===0&&/acepta los términos/i.test(elementos['auth-error'].textContent||''));
  elementos['auth-legal-accept'].checked=true;
  vm.runInContext('afterSignup=async()=>{}',contexto);
  await vm.runInContext('submitAuth()',contexto);
  chk('la cuenta nueva guarda su aceptación antes del onboarding',
    intentos===1&&perfil?.id==='cuenta-nueva'&&typeof perfil?.terminos_aceptados_en==='string'&&perfil?.terminos_version==='2026-09-07');
}

pruebaDeRegistro().then(()=>{
  if(fail){console.error(`\n${fail} comprobación(es) fallaron.`);process.exit(1);}
  console.log('\nTodo OK.');
});
