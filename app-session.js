const PASS_MIN = 8;
// La versión acompaña a cada aceptación para poder saber qué texto leyó alguien
// si cambian los términos o la política. Las cuentas anteriores no la traen y
// siguen entrando: esta constancia se exige solo al crear una cuenta nueva.
const LEGAL_ACCEPTANCE_VERSION = '2026-09-07';

// UN SOLO TEXTO para dos caminos que tienen que verse iguales desde afuera: el
// registro que no devolvió sesión y el correo que YA tenía cuenta. Si difieren,
// mandar un correo al formulario y comparar las dos respuestas dice quién está
// registrado en GradeHub — que es media credencial servida, y con las notas de
// esa persona al otro lado. Por eso es una constante y no dos literales:
// separarlos reabre la enumeración sin que falle nada.
//
// NO PROMETE UN CORREO. La confirmación por correo está desactivada en
// Supabase, así que el registro nuevo entra directo y este aviso queda casi
// siempre para el correo que ya tenía cuenta: mandarlo a esperar un mail que
// nadie despacha lo deja botado sin saberlo. Lo que dice es cierto en los dos
// casos y sigue sin distinguirlos. Si algún día se reactiva la confirmación,
// hay que volver a redactarlo. Lo fija `tests/seguridad.test.js`.
const MSG_VERIFICA = 'Ya puedes entrar con ese correo y tu contraseña.';

function passwordPolicyError(password){
  if(password.length<PASS_MIN)return 'La contraseña debe tener al menos '+PASS_MIN+' caracteres.';
  if(!/[A-Za-z]/.test(password)||!/\d/.test(password))return 'La contraseña debe incluir al menos una letra y un número.';
  return '';
}

function togglePasswordVisibility(inputId,button){
  const input=document.getElementById(inputId);
  if(!input||!button)return;
  const mostrar=input.type==='password';
  input.type=mostrar?'text':'password';
  button.classList.toggle('is-visible',mostrar);
  button.setAttribute('aria-pressed',mostrar?'true':'false');
  button.setAttribute('aria-label',mostrar?'Ocultar contraseña':'Mostrar contraseña');
  input.focus();
}

function resetPasswordVisibility(){
  ['auth-pass','auth-pass2'].forEach(id=>{
    const input=document.getElementById(id);
    const button=document.querySelector(`[data-password-for="${id}"]`);
    if(input)input.type='password';
    if(button){button.classList.remove('is-visible');button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Mostrar contraseña');}
  });
}

const SUPABASE_URL      = 'https://lsulsnswzesyekpsvlql.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JwBMAOR7iHW-gcRdLMGrYw_eCOISwqA';

// auth-js procesa el enlace del correo de recuperación y BORRA el fragmento
// (`location.hash=''`) antes de que boot() reciba la sesión, y avisa
// PASSWORD_RECOVERY recién en un setTimeout. Leer `type=recovery` en boot()
// llegaba tarde: la app entraba directo, showTab('home') escondía la pantalla
// de nueva contraseña y "¿Olvidaste tu contraseña?" nunca dejaba ponerla. Se
// lee acá, antes de crear el cliente.
const LLEGA_DE_RECUPERACION=typeof location!=='undefined'&&/(?:^|[#&])type=recovery(?:&|$)/.test(location.hash||'');
let enRecuperacion=LLEGA_DE_RECUPERACION;
let supabaseClient=null, currentUser=null, authMode='login';
let _cerrandoSesion=false;
try{
  if(window.supabase && SUPABASE_URL.startsWith('http')){
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  }
}catch(e){console.warn('Supabase no inicializado:',e);}

function freshState(){return{ramos:[],userName:'',careerSemestre:1,carrera:null,tenant:'fen',onboardingDone:false,historial:[],sortMode:'manual',modo:'sistema',acento:'turquesa',fondo:'neutro',carreraNombre:null};}

function authError(msg,kind){
  // kind: 'error' (default, rojo) | 'info' (neutro, para mensajes tipo "revisa tu correo")
  const el=document.getElementById('auth-error');
  el.textContent=msg||'';
  el.style.display=msg?'block':'none';
  el.style.color=kind==='info'?'var(--fg2)':'var(--red)';
}
function toggleAuthMode(){
  authMode=authMode==='login'?'signup':'login';
  resetPasswordVisibility();
  document.getElementById('auth-sub').textContent=authMode==='login'?'Tus notas, tu promedio y cuánto te falta para aprobar.':'Guarda tus notas y revísalas desde cualquier dispositivo.';
  document.getElementById('auth-btn').textContent=authMode==='login'?'Iniciar sesión':'Crear cuenta';
  document.getElementById('auth-toggle').textContent=authMode==='login'?'¿No tienes cuenta? Crea una':'¿Ya tienes cuenta? Inicia sesión';
  document.getElementById('auth-pass').setAttribute('autocomplete',authMode==='login'?'current-password':'new-password');
  const confirmWrap=document.getElementById('auth-pass-confirm-wrap');
  confirmWrap.style.display=authMode==='signup'?'block':'none';
  confirmWrap.setAttribute('aria-hidden',authMode==='signup'?'false':'true');
  document.getElementById('auth-pass2').value='';
  const legalWrap=document.getElementById('auth-legal-accept-wrap');
  const legalAccept=document.getElementById('auth-legal-accept');
  legalWrap.style.display=authMode==='signup'?'block':'none';
  legalWrap.setAttribute('aria-hidden',authMode==='signup'?'false':'true');
  if(authMode!=='signup'&&legalAccept)legalAccept.checked=false;
  // Al iniciar sesión no se anuncia un mínimo: sería mentirle a quien creó su
  // cuenta cuando el mínimo era otro.
  document.getElementById('auth-pass').placeholder=authMode==='login'?'Tu contraseña':PASS_MIN+'+ caracteres, letras y números';
  document.getElementById('auth-fp').style.display=authMode==='login'?'block':'none';
  authError('');
}
function showAuthScreen(){
  ['home','stats','agenda','ramo','onboard','reset','app-error'].forEach(s=>{const el=document.getElementById('screen-'+s);if(el)el.classList.remove('active');});
  document.getElementById('bottom-nav').style.display='none';
  document.getElementById('screen-auth').classList.add('active');
  marcarUltimoLogin();
  // El esqueleto se pinta YA, con el alto definitivo: la RPC tarda cerca de un
  // segundo en producción y, sin esto, los números entraban empujando el botón
  // de Google hacia abajo justo cuando alguien iba a tocarlo.
  pintarEsqueletoEstadisticas();
  cargarEstadisticasPublicas();
}
// "1.240 estudiantes ya llevan sus notas acá". Sale de una RPC pública que
// devuelve solo agregados (supabase/estadisticas_publicas.sql). Con pocas
// cuentas la línea juega en contra —"12 estudiantes" suena a nadie—, así que
// bajo el mínimo no se muestra nada. Si la RPC falla, tampoco: es adorno.
const MINIMO_CUENTAS_PARA_MOSTRAR=100;
const ETIQUETAS_ESTADISTICAS=['estudiantes','ramos','notas'];
function fichaEstadistica(valor,etiqueta){
  const n=Number(valor||0).toLocaleString('es-CL');
  return `<div class="auth-stat"><b data-final="${Number(valor)||0}">${n}</b><span>${etiqueta}</span></div>`;
}
// Las tres etiquetas con un guion en vez del número: mismo alto que el final,
// así nada se mueve cuando llegan los datos. Si la consulta falla o no alcanza
// el mínimo, la banda se esconde y el guion no queda nunca a la vista.
function pintarEsqueletoEstadisticas(){
  const el=document.getElementById('auth-stats');
  if(!el||!supabaseClient)return;
  el.innerHTML=ETIQUETAS_ESTADISTICAS.map(l=>`<div class="auth-stat"><b class="auth-stat-cargando">—</b><span>${l}</span></div>`).join('');
  el.setAttribute('aria-busy','true');
  el.hidden=false;
}
async function cargarEstadisticasPublicas(){
  const el=document.getElementById('auth-stats');
  if(!el||!supabaseClient)return;
  try{
    const {data,error}=await supabaseClient.rpc('estadisticas_publicas');
    if(error||!data||!(data.cuentas>=MINIMO_CUENTAS_PARA_MOSTRAR)){el.hidden=true;el.innerHTML='';return;}
    const n=x=>Number(x||0).toLocaleString('es-CL');
    const tile=fichaEstadistica;
    el.innerHTML=tile(data.cuentas,'estudiantes')+(data.ramos>0?tile(data.ramos,'ramos'):'')+(data.notas>0?tile(data.notas,'notas'):'');
    el.removeAttribute('aria-busy');
    el.hidden=false;
    // Los números suben desde 0 en ~700 ms. Es adorno: con reduced-motion se
    // quedan como están, y el texto final ya estaba pintado por si el rAF no corre.
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const t0=performance.now();
    const paso=t=>{
      const p=Math.min(1,(t-t0)/700),e=1-Math.pow(1-p,3);
      el.querySelectorAll('b[data-final]').forEach(b=>{b.textContent=n(Math.round(Number(b.dataset.final)*e));});
      if(p<1)requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }catch(e){el.hidden=true;el.innerHTML='';}
}
// Una sesión válida que falla al dibujarse no es un error de login. Esta
// pantalla conserva esa distinción: no expone el stack, no cierra la sesión y
// ofrece una acción que sí puede ayudar (cargar la app completa de nuevo).
function showAppErrorScreen(fase){
  ['auth','home','stats','agenda','ramo','onboard','reset','app-error'].forEach(s=>{const el=document.getElementById('screen-'+s);if(el)el.classList.remove('active');});
  const app=document.querySelector('.app');
  if(app)app.classList.remove('tab-mode','dragging');
  const nav=document.getElementById('bottom-nav');
  if(nav)nav.style.display='none';
  const comprobando=fase==='obtener_sesion';
  const title=document.getElementById('app-error-title');
  const desc=document.getElementById('app-error-desc');
  if(title)title.textContent=comprobando?'No pudimos comprobar tu sesión':'No pudimos abrir GradeHub';
  if(desc)desc.textContent=comprobando
    ?'Parece un problema de conexión. Tus datos no se borraron; recarga para intentarlo de nuevo.'
    :'Tu sesión sigue activa y tus datos no se borraron. Recarga para intentarlo de nuevo.';
  const screen=document.getElementById('screen-app-error');
  if(screen)screen.classList.add('active');
}

// El detalle ayuda a encontrar el punto exacto que falló, pero una excepción
// también podría incluir accidentalmente un dato que venía del estado. Antes
// de mandarla a analítica se quitan correos, números y todos los textos que el
// estudiante pudo haber escrito o recibido en su cuenta.
function detalleErrorSeguro(error){
  let detalle=String((error&&error.message)||'Error sin mensaje').slice(0,240);
  const privados=[];
  const vistos=new Set();
  const recopilar=(valor,profundidad)=>{
    if(typeof valor==='string'){if(valor.trim().length>1)privados.push(valor);return;}
    if(!valor||typeof valor!=='object'||profundidad>8||vistos.has(valor)||privados.length>=1000)return;
    vistos.add(valor);
    Object.values(valor).forEach(v=>recopilar(v,profundidad+1));
  };
  recopilar(currentUser,0);
  if(typeof S!=='undefined')recopilar(S,0);
  privados.filter(v=>typeof v==='string'&&v.trim().length>1)
    .sort((a,b)=>b.length-a.length)
    .forEach(v=>{detalle=detalle.replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'[dato]');});
  return detalle
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[correo]')
    .replace(/https?:\/\/\S+/gi,'[url]')
    .replace(/\b\d+(?:[.,]\d+)?\b/g,'[n]')
    .slice(0,100);
}

function registrarErrorArranque(error,fase){
  const tiposSeguros=['TypeError','ReferenceError','RangeError','SyntaxError'];
  const tipo=error&&tiposSeguros.includes(error.name)?error.name:'Error';
  const detalle=detalleErrorSeguro(error);
  console.error('GradeHub no pudo completar el arranque ('+fase+'): '+tipo+' · '+detalle);
  track('app_boot_error',{fase:fase,tipo:tipo,detalle:detalle});
}
function enterOnboarding(){
  document.getElementById('screen-auth').classList.remove('active');
  document.getElementById('screen-onboard').classList.add('active');
  // Si entró con Google, ya sabemos su nombre: no se lo preguntamos en blanco
  const nameInput=document.getElementById('ob-name');
  if(nameInput && !nameInput.value.trim() && currentUser && currentUser.user_metadata){
    const m=currentUser.user_metadata;
    const n=(m.full_name||m.name||'').trim();
    if(n)nameInput.value=n.split(' ')[0];
  }
  obIniciar();
}
function enterApp(){
  document.getElementById('screen-auth').classList.remove('active');
  document.getElementById('screen-onboard').classList.remove('active');
  showMainApp();
}

function traduceAuthError(e,contexto){
  if(e&&e.code==='CACHE_LOCAL_NO_AISLADA')return 'No pudimos proteger los ramos guardados en este dispositivo. La cuenta se creó, pero no se copiaron. Libera espacio o entra desde otro navegador.';
  const m=((e&&e.message)||'').toLowerCase();
  // No confirmar si un correo ya tiene cuenta: esa diferencia permite enumerar
  // usuarios y preparar phishing o credential stuffing. Registro existente y
  // registro aceptado tienen que verse iguales hacia afuera.
  if(m.includes('already')||m.includes('exists'))return contexto==='cambio_correo'
    ?'Ese correo ya está asociado a otra cuenta.'
    :MSG_VERIFICA;
  if(m.includes('invalid login')||m.includes('credentials'))return 'Usuario o contraseña incorrectos.';
  // Sin esto caían en "revisa tu internet": el correo de recuperación tiene un
  // límite por hora y quien lo pedía dos veces creía que no tenía conexión.
  const code=String((e&&e.code)||'');
  if((e&&e.status===429)||code.includes('rate_limit')||m.includes('rate limit')||m.includes('security purposes'))
    return 'Hiciste varios intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
  if(code==='same_password'||m.includes('different from the old'))return 'La nueva contraseña tiene que ser distinta de la anterior.';
  if(code==='email_address_invalid'||(m.includes('email')&&m.includes('invalid')))return 'Ese correo no es válido. Revísalo e intenta de nuevo.';
  if(m.includes('password'))return 'La contraseña debe tener al menos '+PASS_MIN+' caracteres e incluir letras y números.';
  return 'No se pudo conectar. Revisa tu internet e intenta de nuevo.';
}

function correoValido(correo){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);}
function estadoCambioCorreo(mensaje,esError){
  const aviso=document.getElementById('s-account-email-status');
  const input=document.getElementById('s-account-email');
  if(aviso){aviso.textContent=mensaje||'';aviso.hidden=!mensaje;aviso.style.color=esError?'var(--red)':'var(--fg2)';}
  if(input){if(esError)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');}
}
// GradeHub tiene las confirmaciones de correo desactivadas mientras usa el SMTP
// limitado de Supabase. El cambio debe llegar aplicado en la respuesta; si no,
// no fingimos que la persona ya puede entrar con la dirección nueva.
async function cambiarCorreoCuenta(){
  const input=document.getElementById('s-account-email');
  const btn=document.getElementById('s-account-email-save');
  const correo=(input&&input.value||'').trim().toLowerCase();
  estadoCambioCorreo('',false);
  if(!correoValido(correo)){
    estadoCambioCorreo('Ingresa un correo electrónico válido.',true);
    if(input)input.focus();
    return false;
  }
  if(currentUser&&correo===String(currentUser.email||'').toLowerCase()){
    estadoCambioCorreo('Ese ya es el correo de acceso de tu cuenta.',true);
    if(input)input.focus();
    return false;
  }
  if(!supabaseClient||!supabaseClient.auth||!currentUser){
    estadoCambioCorreo('Necesitas iniciar sesión para cambiar tu correo.',true);
    return false;
  }
  const original=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Guardando…';}
  try{
    const {data,error}=await supabaseClient.auth.updateUser({email:correo});
    if(error)throw error;
    const correoGuardado=String(data&&data.user&&data.user.email||'').trim().toLowerCase();
    if(correoGuardado!==correo){
      estadoCambioCorreo('No pudimos actualizar el correo al tiro. Sigue usando tu correo actual e inténtalo más tarde.',true);
      return false;
    }
    currentUser=data.user;
    estadoCambioCorreo('Correo actualizado. Desde ahora entra con esta dirección.',false);
    return true;
  }catch(e){
    estadoCambioCorreo(traduceAuthError(e,'cambio_correo'),true);
    return false;
  }finally{
    if(btn){btn.disabled=false;btn.textContent=original;}
  }
}

async function submitAuth(){
  const btn=document.getElementById('auth-btn');
  // Enter llama esta función desde el campo, aunque el botón esté deshabilitado.
  if(btn.disabled)return;
  const email=(document.getElementById('auth-user').value||'').trim().toLowerCase();
  const p=document.getElementById('auth-pass').value;
  const p2=document.getElementById('auth-pass2').value;
  authError('');
  const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(!emailRe.test(email)){authError('Ingresa un correo electrónico válido.');return;}
  // El mínimo se exige SOLO al crear la cuenta. Al iniciar sesión no se valida
  // el largo: quien se registró cuando el mínimo era 6 tiene que poder entrar,
  // y validarlo acá lo dejaría fuera de su propia cuenta con un error engañoso.
  if(!p){authError('Escribe tu contraseña.');return;}
  if(authMode==='signup'){
    const policyError=passwordPolicyError(p);
    if(policyError){authError(policyError);return;}
    if(p!==p2){authError('Las contraseñas no coinciden.');return;}
    const legalAccept=document.getElementById('auth-legal-accept');
    if(!legalAccept||!legalAccept.checked){
      authError('Para crear tu cuenta, acepta los términos y la política de privacidad.');
      if(legalAccept){legalAccept.setAttribute('aria-invalid','true');legalAccept.focus();}
      return;
    }
    legalAccept.removeAttribute('aria-invalid');
  }
  if(!supabaseClient){authError('Falta configurar Supabase (URL y clave) en el código.');return;}

  const orig=btn.textContent;
  btn.disabled=true;btn.textContent='Cargando...';
  try{
    if(authMode==='signup'){
      const {data,error}=await supabaseClient.auth.signUp({email,password:p});
      if(error)throw error;
      if(!data.session){authError(MSG_VERIFICA,'info');btn.disabled=false;btn.textContent=orig;return;}
      currentUser=data.user;
      await registrarAceptacionLegal();
      await afterSignup();
    }else{
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password:p});
      if(error)throw error;
      recordarMetodoLogin('correo');
      currentUser=data.user;await afterLogin();
    }
  }catch(e){
    authError(traduceAuthError(e));
  }finally{
    btn.disabled=false;btn.textContent=orig;
  }
}

// --- ULTIMO METODO USADO PARA ENTRAR ---
// Volver despues de un mes y no acordarse de si se entro con Google o con
// correo termina en un "contrasena incorrecta" que no es tal: la cuenta existe,
// pero se creo por el otro camino.
//
// Se guarda SOLO cual de los dos, nunca el correo: esta pantalla se ve en
// computadores compartidos y de un correo a la vista se deduce quien lo usa.
// Va en su propia clave y no en el estado de la app, porque tiene que seguir
// disponible despues de cerrar sesion, que es justo cuando hace falta.
var CLAVE_ULTIMO_LOGIN='gradehub_ultimo_login';
function recordarMetodoLogin(metodo){
  try{localStorage.setItem(CLAVE_ULTIMO_LOGIN,metodo);}catch(e){/* modo privado */}
}
function ultimoMetodoLogin(){
  try{return localStorage.getItem(CLAVE_ULTIMO_LOGIN);}catch(e){return null;}
}
// La marca se pinta al mostrar la pantalla de auth. Si no hay nada guardado
// -primera vez, o navegador que no deja guardar- simplemente no aparece.
function marcarUltimoLogin(){
  const metodo=ultimoMetodoLogin();
  document.querySelectorAll('.auth-ultimo').forEach(function(e){e.remove();});
  if(!metodo)return;
  // La marca va ENCIMA del metodo, no dentro. Metida en el boton de Google
  // quedaba gris sobre gris —ilegible— y ademas le partia el texto en dos
  // lineas. Arriba se lee en los dos casos y no toca el boton.
  const destino=metodo==='google'
    ? document.getElementById('btn-google')
    : document.querySelector('#screen-auth .ob-card');
  if(!destino||!destino.parentNode)return;
  const marca=document.createElement('div');
  marca.className='auth-ultimo';
  marca.textContent='Lo usaste la última vez';
  destino.parentNode.insertBefore(marca,destino);
}

// Login con Google vía Supabase OAuth. Redirige fuera; al volver, boot() detecta
// la sesión y entra solo (o manda a onboarding si es cuenta nueva).
async function signInWithProvider(provider){
  if(!supabaseClient){authError('Falta configurar Supabase.');return;}
  authError('');
  const btn=document.getElementById('btn-'+provider);
  const orig=btn?btn.innerHTML:'';
  if(btn){btn.disabled=true;btn.style.opacity='.6';}
  try{
    const {error}=await supabaseClient.auth.signInWithOAuth({
      provider,
      options:{redirectTo:location.origin+location.pathname}
    });
    if(error)throw error;
    // Se anota ANTES de irse a Google: desde acá la pagina se descarga y no hay
    // vuelta a este codigo si el login sale bien.
    recordarMetodoLogin(provider);
  }catch(e){
    authError(traduceAuthError(e));
    if(btn){btn.disabled=false;btn.style.opacity='';btn.innerHTML=orig;}
  }
}

// Recuperar contraseña
async function forgotPassword(){
  const email=(document.getElementById('auth-user').value||'').trim().toLowerCase();
  const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(!emailRe.test(email)){authError('Escribe tu correo arriba y vuelve a tocar "¿Olvidaste tu contraseña?".');return;}
  if(!supabaseClient){authError('Falta configurar Supabase.');return;}
  // Un segundo toque mientras va el primero gastaba el límite de correos.
  const boton=document.getElementById('auth-fp');
  if(boton&&boton.disabled)return;
  if(boton)boton.disabled=true;
  try{
    const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    if(error)throw error;
    authError('');showToast('Te enviamos un correo para recuperar tu contraseña');
  }catch(e){authError(traduceAuthError(e));}
  finally{if(boton)boton.disabled=false;}
}

// Al volver del correo, Supabase dispara PASSWORD_RECOVERY (ver boot()).
// Esta función recibe la nueva contraseña y la guarda.
async function submitNewPassword(){
  const btn=document.getElementById('reset-btn');
  if(btn.disabled)return;
  const p1=document.getElementById('reset-pass').value;
  const p2=document.getElementById('reset-pass2').value;
  const err=document.getElementById('reset-error');
  err.style.display='none';
  const policyError=passwordPolicyError(p1);
  if(policyError){err.textContent=policyError;err.style.display='block';return;}
  if(p1!==p2){err.textContent='Las contraseñas no coinciden.';err.style.display='block';return;}
  if(!supabaseClient){err.textContent='Supabase no está configurado.';err.style.display='block';return;}
  const orig=btn.textContent;
  btn.disabled=true;btn.textContent='Guardando...';
  try{
    const {data,error}=await supabaseClient.auth.updateUser({password:p1});
    if(error)throw error;
    currentUser=data.user;
    enRecuperacion=false;
    showToast('Contraseña actualizada');
    document.getElementById('screen-reset').classList.remove('active');
    await afterLogin();
  }catch(e){
    // El mensaje de Supabase viene en inglés ("New password should be different…").
    err.textContent=traduceAuthError(e);err.style.display='block';
  }finally{
    btn.disabled=false;btn.textContent=orig;
  }
}

function showResetScreen(){
  ['home','stats','agenda','ramo','onboard','auth'].forEach(s=>{const el=document.getElementById('screen-'+s);if(el)el.classList.remove('active');});
  document.getElementById('bottom-nav').style.display='none';
  document.getElementById('screen-reset').classList.add('active');
  setTimeout(()=>{const i=document.getElementById('reset-pass');if(i)i.focus();},100);
}

// Supabase procesa el fragmento antes de que boot() reciba la sesión. Recién
// después se puede borrar: hacerlo antes rompería OAuth y recovery. Una vez
// procesado, dejar access_token/refresh_token en la barra o el historial solo
// aumenta la superficie frente a extensiones, capturas y una futura XSS.
function limpiarFragmentoAuth(){
  const h=location.hash||'';
  if(!/(?:^|[&#])(access_token|refresh_token|type|expires_in|expires_at|token_type)=/.test(h))return;
  try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
}

// El registro crea un UID nuevo. La caché que ya estaba en este navegador no
// pasa a ser suya por eso: podría pertenecer a otra cuenta o no tener dueño.
const CACHE_APARTADA_PREFIX='gradehub_v1_respaldo_';
function llaveCacheApartada(owner){return CACHE_APARTADA_PREFIX+owner;}
function borrarCacheApartada(owner){
  try{localStorage.removeItem(llaveCacheApartada(owner||'sin_dueno'));}catch(e){}
}
function apartarCacheLocal(owner){
  const data=localStorage.getItem(STORAGE_KEY)||JSON.stringify(S);
  const key=llaveCacheApartada(owner||'sin_dueno');
  // Una caché vacía temporal no debe pisar un respaldo anterior con ramos.
  const anterior=localStorage.getItem(key);
  if(anterior){
    try{
      const guardado=JSON.parse(anterior);
      const actual=JSON.parse(data);
      const tieneDatos=x=>!!(x?.ramos?.length||x?.historial?.length||x?.onboardingDone||x?.userName);
      if(tieneDatos(JSON.parse(guardado.data))&&!tieneDatos(actual))return;
    }catch(e){}
  }
  const baseCruda=localStorage.getItem(SYNC_BASE_KEY);
  let base=null;
  try{if(JSON.parse(baseCruda||'null')?.owner===owner)base=baseCruda;}catch(e){}
  localStorage.setItem(key,JSON.stringify({owner:owner||null,data,base}));
}
function aislarCacheEnRegistro(uid){
  const owner=getCacheOwner();
  const datosPrevios=!!(S.ramos?.length||S.historial?.length||S.onboardingDone||S.userName);
  const importable=!owner&&datosPrevios;
  if(owner===uid)return {propia:true,importable:false};
  if(!owner&&!datosPrevios){
    S=freshState();
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(S));setCacheOwner(uid);}catch(e){}
    return {propia:false,importable:false};
  }
  const previa=localStorage.getItem(STORAGE_KEY),base=localStorage.getItem(SYNC_BASE_KEY);
  try{
    if(owner||importable)apartarCacheLocal(owner);
    const vacia=freshState();
    localStorage.setItem(STORAGE_KEY,JSON.stringify(vacia));
    localStorage.removeItem(SYNC_BASE_KEY);if(typeof olvidarBaseSesion==='function')olvidarBaseSesion();
    localStorage.setItem(CACHE_OWNER_KEY,uid);
    S=vacia;
    return {propia:false,importable};
  }catch(e){
    // Si falla una de las escrituras, la cuenta nueva no debe reclamar la
    // caché antigua. Recuperamos sus claves antes de salir del registro.
    try{
      if(previa===null)localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY,previa);
      if(base===null)localStorage.removeItem(SYNC_BASE_KEY);
      else localStorage.setItem(SYNC_BASE_KEY,base);
      if(owner)localStorage.setItem(CACHE_OWNER_KEY,owner);
      else localStorage.removeItem(CACHE_OWNER_KEY);
    }catch(_){}
    if(typeof olvidarBaseSesion==='function')olvidarBaseSesion();
    return null;
  }
}
function restaurarCacheApartada(uid){
  const key=llaveCacheApartada(uid);
  let previa=null,basePrevia=null,ownerPrevio=null,mutada=false;
  try{
    const raw=localStorage.getItem(key);
    if(!raw)return false;
    const copia=JSON.parse(raw);
    if(copia.owner!==uid||typeof copia.data!=='string')return false;
    const restaurada=normalize(JSON.parse(copia.data));
    // Si la cuenta ya tiene una caché con datos, es más reciente que esta copia.
    if(getCacheOwner()===uid&&(S.ramos?.length||S.historial?.length||S.onboardingDone||S.userName))return false;
    previa=localStorage.getItem(STORAGE_KEY);
    basePrevia=localStorage.getItem(SYNC_BASE_KEY);
    ownerPrevio=getCacheOwner();
    const otro=ownerPrevio;
    if(otro&&otro!==uid)apartarCacheLocal(otro);
    mutada=true;
    localStorage.setItem(STORAGE_KEY,JSON.stringify(restaurada));
    if(copia.base)localStorage.setItem(SYNC_BASE_KEY,copia.base);
    else localStorage.removeItem(SYNC_BASE_KEY);
    if(typeof olvidarBaseSesion==='function')olvidarBaseSesion();
    localStorage.setItem(CACHE_OWNER_KEY,uid);
    S=restaurada;
    localStorage.removeItem(key);
    return true;
  }catch(e){
    if(!mutada)return false;
    try{
      if(previa===null)localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY,previa);
      if(basePrevia===null)localStorage.removeItem(SYNC_BASE_KEY);
      else localStorage.setItem(SYNC_BASE_KEY,basePrevia);
      if(ownerPrevio)localStorage.setItem(CACHE_OWNER_KEY,ownerPrevio);
      else localStorage.removeItem(CACHE_OWNER_KEY);
    }catch(_){}
    if(typeof olvidarBaseSesion==='function')olvidarBaseSesion();
    return false;
  }
}
async function importarCacheSinDueno(uid){
  if(currentUser?.id!==uid)return;
  try{
    const key=llaveCacheApartada('sin_dueno');
    const copia=JSON.parse(localStorage.getItem(key)||'null');
    if(!copia||copia.owner!==null||typeof copia.data!=='string')return;
    const restaurada=normalize(JSON.parse(copia.data));
    localStorage.setItem(STORAGE_KEY,JSON.stringify(restaurada));
    S=restaurada;
    localStorage.removeItem(key);
    const respaldado=await syncNow();await syncProfile();
    showToast(respaldado
      ? '✓ Tus ramos quedaron guardados en la nube'
      : 'Tus ramos siguen en este dispositivo, pero no pudimos respaldarlos. No cierres sesión.',!respaldado);
    enterApp();
  }catch(e){showToast('No pudimos traer los ramos de este dispositivo. Siguen guardados aquí.',true);}
}
async function afterSignup(){
  track('signup');
  const uid=currentUser?.id;
  const aislamiento=uid&&aislarCacheEnRegistro(uid);
  if(!aislamiento){
    try{await supabaseClient.auth.signOut();}catch(e){}
    currentUser=null;
    const error=new Error('No pudimos proteger los ramos guardados en este dispositivo.');
    error.code='CACHE_LOCAL_NO_AISLADA';
    throw error;
  }
  if(aislamiento.propia&&S.onboardingDone&&S.ramos.length){
    const respaldado=await syncNow();await syncProfile();
    showToast(respaldado
      ? '✓ Cuenta creada — tus datos están en la nube'
      : 'Tu cuenta se creó y tus notas siguen en este dispositivo, pero no pudimos respaldarlas. No cierres sesión.',!respaldado);
    enterApp();
    return;
  }
  enterOnboarding();
  if(aislamiento.importable){
    showConfirm('¿Traer datos de este dispositivo?',
      'Hay datos guardados sin una cuenta asociada. Solo se copiarán a esta cuenta si eliges traerlos.',
      ()=>importarCacheSinDueno(uid),{label:'Traer datos',danger:false,focusCancel:true});
  }
}
async function afterLogin(){
  track('login');
  const uid=currentUser?currentUser.id:null;
  const visita=++_visitaSesion;
  const vigente=()=>visita===_visitaSesion&&!!currentUser&&currentUser.id===uid;
  // Una sesión anterior pudo terminar por vencimiento, sin pasar por signOut.
  // Ninguna de sus propuestas debe asomarse en Inicio de la cuenta nueva.
  if(typeof propuestasPautaAgente!=='undefined')propuestasPautaAgente=[];
  if(typeof propuestasNotasAgente!=='undefined')propuestasNotasAgente=[];
  if(typeof propuestasFechasAgente!=='undefined')propuestasFechasAgente=[];
  if(typeof propuestasRamosAgente!=='undefined')propuestasRamosAgente=[];
  if(typeof renderPropuestasPautaHome==='function')renderPropuestasPautaHome();
  if(uid)restaurarCacheApartada(uid);
  let cloud,ok=true;
  // Solo la lectura remota es recuperable: si falla, la copia local ya fue
  // normalizada al cargar y además está protegida por el dueño de la caché.
  // normalize() y enterApp() quedan fuera a propósito. Si una de ellas falla,
  // continuar con estado o DOM a medias sería peor que detenerse con un aviso.
  try{cloud=await loadFromCloud();}catch(e){ok=false;}
  if(!vigente())return;
  const mismaCache=getCacheOwner()===uid;
  // La copia previa a importar es de quien importó. Si la caché es de otra
  // cuenta (navegador compartido, o una sesión que venció sin cerrarse), se va:
  // con "Deshacer importación" la siguiente persona recibía el nombre y las
  // notas de la otra, y se subían a su cuenta. El typeof es porque la clave vive
  // en app.js y hay tests que cargan solo este bloque.
  if(!mismaCache&&typeof PRE_IMPORT_KEY!=='undefined'){try{localStorage.removeItem(PRE_IMPORT_KEY);}catch(e){}}
  if(ok&&cloud!==null){
    // La nube puede contener ramos creados con versiones anteriores. Pásalos
    // siempre por normalize(): un ramo sin preset necesita categorias:[] para
    // que el editor de pauta pueda abrirse igual que uno con pauta oficial.
    //
    // La nube YA NO pisa la copia local a ciegas: si este dispositivo tiene
    // algo que no alcanzó a subir (una nota anotada sin conexión), se conserva
    // y se sube. Ver «Sincronización sin pérdidas», más abajo.
    const nube=normalize({...freshState(),...clonarSync(cloud)});
    const {estado,subir}=mismaCache?reconciliarAlEntrar(uid,S,nube,cloud):{estado:nube,subir:false};
    S=estado;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(S));}catch(e){}
    guardarBaseSync(uid,nube);
    setCacheOwner(uid);
    if(subir){
      syncNow().then(respaldado=>{
        if(respaldado)showToast('✓ Guardamos en la nube lo que anotaste en este dispositivo');
      }).catch(()=>{});
    }
  }else if(ok&&mismaCache){
    // `null` significa que la consulta no encontró una fila; NO demuestra que
    // esta persona no tenga datos. Si la caché ya tiene el mismo dueño, es la
    // única copia conocida: se conserva y se intenta crear el respaldo.
    const respaldado=await syncNow();
    showToast(respaldado
      ? 'Recuperamos tu copia local y la respaldamos en la nube'
      : 'Tus notas siguen en este dispositivo, pero no pudimos respaldarlas. No cierres sesión e inténtalo de nuevo con internet.',!respaldado);
  }else if(ok){
    // Cuenta realmente nueva, o caché de otra persona en un navegador
    // compartido. Nunca se reutilizan datos cuyo dueño no coincide.
    S=freshState();
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(S));}catch(e){}
    setCacheOwner(uid);
  }else{
    // Sin red: la caché local sirve, pero SOLO si es de este mismo usuario.
    // Si es de otro (navegador compartido), se descarta para no filtrar sus datos.
    if(mismaCache){
      showToast('Sin conexión · usando tu copia local');
    }else{
      S=freshState();
      try{localStorage.removeItem(STORAGE_KEY);}catch(e){}
      showToast('No pudimos cargar tus datos. Revisa tu conexión.',true);
    }
  }
  if(!vigente())return;
  if(S.onboardingDone)enterApp();else enterOnboarding();
  // No bloquea la entrada: es una lectura de red y la app ya está en pantalla.
  // Si llega con algo, repinta y lo dice — una pauta no aparece en silencio.
  aplicarConsensoAuto().then(n=>{
    if(!n)return;
    renderHome();
    showToast(n===1?'Agregamos una pauta reportada por otros estudiantes':`Agregamos ${n} pautas reportadas por otros estudiantes`);
  }).catch(()=>{});
  // La otra dirección: las pautas que esta persona armó para ramos que el
  // catálogo trae vacíos. No avisa ni pregunta —viaja la pauta, nunca las
  // notas— y no bloquea nada. Va después del consenso a propósito: si una pauta
  // acaba de llegar de otros, no tiene sentido devolvérsela.
  if(typeof aportarPautasAlCatalogo==='function')aportarPautasAlCatalogo().catch(()=>{});
  // Los promedios de la comparación con el curso se renuevan al entrar, no solo
  // al abrir Estadísticas: curso_posicion y universidad_posicion ignoran filas
  // sin actualizar en 30 días (para que no cuenten los ramos borrados o
  // archivados antes del arreglo), y quien usa la app sin abrir Estadísticas
  // quedaba fuera aunque su promedio fuera real. Una vez por visita: la firma
  // de subirNotasCurso evita repetir si nada cambió. Va después de afterLogin
  // entero para que suba el estado ya reconciliado con la nube.
  if(S.onboardingDone&&typeof subirNotasCurso==='function')subirNotasCurso().catch(()=>{});
  // Si esta persona está aprobada como profesor particular, le aparece una
  // cuarta pestaña. Se pregunta una vez al entrar y no bloquea nada: si el SQL
  // del marketplace todavía no está aplicado, la consulta falla en silencio y
  // la app queda exactamente como antes, con sus tres pestañas.
  if(typeof cargarPerfilProfesor==='function'){
    cargarPerfilProfesor()
      .then(()=>{if(typeof recalcularNavTabs==='function')recalcularNavTabs();})
      .catch(()=>{});
  }
  // Igual para la pestaña de administración: una pregunta, sin bloquear nada.
  if(typeof cargarSoyAdministrador==='function'){
    cargarSoyAdministrador()
      .then(()=>{if(typeof recalcularNavTabs==='function')recalcularNavTabs();})
      .catch(()=>{});
  }
  // Es una bandeja de revisión, no una sincronización del semestre: se lee
  // aparte y nunca bloquea entrar. Si llega una propuesta, Inicio la recuerda
  // para que la persona la aplique o descarte cuando quiera.
  // La bandeja de propuestas es opcional y vive en app.js. El guardia no es
  // ceremonia: un ReferenceError acá revienta afterLogin() entero —o sea el
  // login y la sincronización— por una pantalla accesoria. El .catch cubre la
  // promesa rechazada, no la función que no existe.
  if(S.onboardingDone&&typeof cargarPropuestasPautaAgente==='function'){
    cargarPropuestasPautaAgente().catch(()=>{});
  }
}

// Cada entrada y cada salida abren una visita nueva. Una lectura de la nube que
// vuelve después de cambiar de cuenta, o de salir y volver a entrar, es de la
// visita anterior: aplicarla mostraba los datos de A en la sesión de B y los
// dejaba en su caché (issue #579, punto 2).
let _visitaSesion=0;

// La persona suele consultar al agente en otra app y volver a GradeHub. Al
// regresar, se consulta la bandeja sin obligarla a cerrar sesión ni recargar.
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&currentUser&&S.onboardingDone
    &&typeof cargarPropuestasPautaAgente==='function')cargarPropuestasPautaAgente().catch(()=>{});
});

async function loadFromCloud(){
  const {data,error}=await supabaseClient.from('user_ramos').select('data').eq('user_id',currentUser.id).maybeSingle();
  if(error)throw error;
  return data?data.data:null; // null = la cuenta aún no tiene datos
}
let _syncTimer=null;
function syncToCloud(){
  if(!supabaseClient||!currentUser)return;
  clearTimeout(_syncTimer);
  _syncTimer=setTimeout(()=>{_syncTimer=null;syncNow();},800); // agrupa ediciones rápidas
}
// Si la persona cambia de app o cierra la pestaña antes de esos 800 ms, el
// temporizador no alcanza a correr y la nube se queda sin la última edición.
// Al volver a entrar, afterLogin() carga la nube encima de la copia local y
// esa nota se pierde sin aviso. Cuando la página se esconde, se sube de
// inmediato lo que estaba esperando.
function subirSyncPendiente(){
  if(!_syncTimer)return false;
  clearTimeout(_syncTimer);_syncTimer=null;
  syncNow();
  return true;
}
// Una subida que falló sin red no se reintentaba hasta la próxima edición: la
// nota quedaba solo en el dispositivo aunque la conexión ya hubiera vuelto
// (issue #579, punto 13). Se reintenta al volver la red y al volver a la
// pestaña, por el mismo camino de siempre (subida condicional y fusión).
function reintentarSubida(){
  if(!_syncTimer&&!_subida&&hayCambiosSinSubir())syncNow();
}
if(typeof document!=='undefined'&&typeof document.addEventListener==='function')
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')subirSyncPendiente();
    else reintentarSubida();
  });
if(typeof window!=='undefined'&&typeof window.addEventListener==='function'){
  window.addEventListener('pagehide',subirSyncPendiente);
  window.addEventListener('online',reintentarSubida);
}
// Una subida a la vez: si llega otra mientras una va en camino, se repite al
// terminar con el estado de ese momento. Dos subidas cruzadas partirían de la
// misma versión y la segunda chocaría con la primera.
let _subida=null,_otraSubida=false;
async function syncNow(){
  if(!supabaseClient||!currentUser)return false;
  if(_subida){_otraSubida=true;return _subida;}
  _subida=subirConVersion(currentUser.id);
  try{return await _subida;}
  finally{
    _subida=null;
    if(_otraSubida){_otraSubida=false;syncToCloud();}
  }
}

// ─── SINCRONIZACIÓN SIN PÉRDIDAS ─────────────────────────────────────────────
// Hasta el 2026-09-29, al abrir la app la nube pisaba la copia local, y cada
// subida reemplazaba el documento entero. Así se perdían notas en dos casos
// reales, reproducidos con las funciones de verdad:
//   1. Una nota anotada sin conexión no alcanzaba a subir. Al reabrir con red,
//      la nube —sin esa nota— reemplazaba la copia local. Abrir la app sin
//      internet ya lo provocaba: supabase-js viene de un CDN que no se cachea,
//      así que la app arranca sin sesión y nada de esa visita se sube.
//   2. Una pestaña abierta desde la mañana subía su copia vieja completa y
//      borraba lo que se había anotado en el celular entremedio.
//
// Ahora cada dispositivo recuerda la última versión de la nube que vio (la
// BASE, en SYNC_BASE_KEY) y la nube lleva un número de versión, `_rev`, DENTRO
// del mismo JSON: no hay columna nueva ni migración, y quien lea `data` (la
// agenda .ics, las estadísticas públicas, los agentes) sigue igual.
//   · Al entrar: si la nube sigue en la versión de la base, nadie más escribió:
//     manda lo local y, si difiere, se sube. Si otro dispositivo escribió, se
//     fusionan las tres copias (base, local, nube).
//   · Al subir: la escritura es condicional ("solo si la nube sigue en mi
//     versión"). Si chocó, se baja la nube, se fusiona y se reintenta.
// La fusión no borra nada que no se haya borrado a propósito: lo agregado en
// cualquiera de los dos lados se queda; lo que un lado borró se va solo si el
// otro no lo tocó; si los dos cambiaron el mismo dato, gana este dispositivo,
// que es lo que la persona tiene en pantalla.
const SYNC_BASE_KEY='gradehub_v1_base';
const clonarSync=x=>x==null?x:JSON.parse(JSON.stringify(x));
const igualSync=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const objetoSync=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
function sinRevSync(x){if(!objetoSync(x))return x;const {_rev,...resto}=x;return resto;}
function revSync(x){return objetoSync(x)&&Number.isInteger(x._rev)?x._rev:null;}

// La base se guarda con su dueño: en un navegador compartido, la versión que
// vio otra cuenta no sirve para nada y no debe mezclarse.
//
// Y es la de ESTA pestaña. Dos pestañas del mismo navegador comparten
// localStorage: cuando cada una leía la base de ahí, la que tenía S viejo en
// memoria tomaba la versión que acababa de subir la otra, la escritura
// condicional pasaba y su documento entero borraba la nota ajena, también en
// la nube (issue #579). Ahora cada pestaña recuerda en memoria la versión de
// la que salió su S, y el disco guarda S junto con SU base: el próximo arranque
// compara lo que quedó escrito contra la versión de la que salió, aunque otra
// pestaña haya subido entremedio.
// undefined = esta pestaña todavía no la conoce y la lee del disco.
let _baseSesion;
function leerBaseSync(uid){
  if(_baseSesion!==undefined)return _baseSesion&&_baseSesion.owner===uid?_baseSesion.data:null;
  try{
    const b=JSON.parse(localStorage.getItem(SYNC_BASE_KEY)||'null');
    return b&&b.owner===uid&&objetoSync(b.data)?b.data:null;
  }catch(e){return null;}
}
function guardarBaseSync(uid,data){
  // Copia profunda: S suele compartir objetos con `data` (la nube recién
  // leída, o lo que se acaba de subir) y anotar una nota cambiaría la base.
  _baseSesion=data&&uid?{owner:uid,data:clonarSync(data)}:null;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(S));}catch(e){}
  escribirBaseEnDisco();
}
// La llama también save(), justo después de escribir S.
function escribirBaseEnDisco(){
  if(_baseSesion===undefined)return;
  try{
    if(_baseSesion)localStorage.setItem(SYNC_BASE_KEY,JSON.stringify(_baseSesion));
    else localStorage.removeItem(SYNC_BASE_KEY);
  }catch(e){}
}
// Quien escribe la base directo en el disco (registro, restaurar una copia
// apartada, cerrar sesión) hace que esta pestaña la vuelva a leer de ahí.
function olvidarBaseSesion(){_baseSesion=undefined;}

// Al entrar con la caché de la misma cuenta. `nube` ya viene normalizada;
// `crudo` es la fila tal como llegó, para revisar sus ids.
function reconciliarAlEntrar(uid,local,nube,crudo){
  const base=leerBaseSync(uid);
  const localSinRev=sinRevSync(local),nubeSinRev=sinRevSync(nube);
  if(igualSync(localSinRev,nubeSinRev))return {estado:nube,subir:false};
  // Se compara el CONTENIDO y no solo `_rev`: una pestaña con la versión
  // anterior de la app todavía abierta escribe sin subir el número.
  if(base&&igualSync(nubeSinRev,sinRevSync(base))){
    // Nadie escribió desde la última vez: lo distinto es de este dispositivo.
    return {estado:local,subir:true};
  }
  if(!base&&!idsCompletosSync(crudo)){
    // Primera vez con este código y una copia vieja con elementos sin id:
    // normalize() les inventa ids distintos en cada lado y fusionar duplicaría
    // notas. Se hace lo de antes: manda la nube.
    return {estado:nube,subir:false};
  }
  const fusion=normalize({...freshState(),...fusionarSync(base,local,nube)});
  return {estado:fusion,subir:!igualSync(sinRevSync(fusion),nubeSinRev)};
}
function idsCompletosSync(doc){
  const idOk=x=>x&&typeof x.id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x.id);
  const lista=v=>Array.isArray(v)?v:[];
  const ramosOk=rs=>lista(rs).every(r=>idOk(r)&&lista(r.categorias).every(c=>idOk(c)&&lista(c.notas).every(idOk)));
  return objetoSync(doc)&&ramosOk(doc.ramos)&&lista(doc.historial).every(h=>idOk(h)&&ramosOk(h.ramos));
}

// Fusión de tres vías. Sin base (el primer arranque de un dispositivo con este
// código) no se sabe quién cambió qué: se suma lo que exista en cualquiera de
// las dos y, si un mismo dato difiere, manda la nube, como hacía la app antes.
function fusionarSync(base,local,nube){
  return fusionarValorSync(base||undefined,local,nube,base?'local':'nube');
}
function fusionarValorSync(b,l,n,gana){
  if(igualSync(l,n))return l;
  if(b!==undefined&&igualSync(l,b))return n;     // solo cambió la nube
  if(b!==undefined&&igualSync(n,b))return l;     // solo cambió este dispositivo
  if(objetoSync(l)&&objetoSync(n))return fusionarObjetoSync(objetoSync(b)?b:{},l,n,gana);
  if(Array.isArray(l)&&Array.isArray(n)&&l.concat(n).some(x=>objetoSync(x)&&typeof x.id==='string'))
    return fusionarListaSync(Array.isArray(b)?b:[],l,n,gana);
  return gana==='local'?l:n;
}
function fusionarObjetoSync(b,l,n,gana){
  const out={};
  for(const k of new Set([...Object.keys(l),...Object.keys(n)])){
    if(k in l&&k in n)out[k]=fusionarValorSync(b[k],l[k],n[k],gana);
    else if(k in l){if(!(k in b&&igualSync(l[k],b[k])))out[k]=l[k];}  // la nube lo quitó sin que acá se tocara: se va
    else if(!(k in b&&igualSync(n[k],b[k])))out[k]=n[k];
  }
  return out;
}
// Ramos, categorías, notas y semestres archivados se emparejan por id. El
// orden es el de este dispositivo; lo que llegó de otro va al final.
function fusionarListaSync(b,l,n,gana){
  const porId=a=>new Map(a.filter(x=>objetoSync(x)&&typeof x.id==='string').map(x=>[x.id,x]));
  const B=porId(b),N=porId(n),vistos=new Set(),out=[];
  for(const x of l){
    if(!objetoSync(x)||typeof x.id!=='string'){out.push(x);continue;}
    vistos.add(x.id);
    if(N.has(x.id))out.push(fusionarValorSync(B.get(x.id),x,N.get(x.id),gana));
    else if(!(B.has(x.id)&&igualSync(x,B.get(x.id))))out.push(x);   // nuevo acá, o editado acá aunque allá se borró
  }
  for(const y of n){
    if(!objetoSync(y)||typeof y.id!=='string'||vistos.has(y.id))continue;
    if(!(B.has(y.id)&&igualSync(y,B.get(y.id))))out.push(y);         // nuevo en otro dispositivo
  }
  return out;
}

async function subirConVersion(uid){
  try{
    for(let intento=0;intento<3;intento++){
      const base=leerBaseSync(uid);
      const enviado={...S,_rev:(revSync(base)||0)+1};
      let escrito;
      if(!base){
        // No conocemos ninguna copia en la nube: cuenta nueva o lectura sin fila.
        const {error}=await supabaseClient.from('user_ramos').upsert({user_id:uid,data:enviado},{onConflict:'user_id'});
        // Supabase normalmente resuelve la promesa y entrega el fallo acá; el
        // catch por sí solo no lo ve. Marcar la caché como alineada en ese caso
        // deja a la app creyendo que existe un respaldo que nunca se escribió.
        if(error)throw error;
        escrito=true;
      }else{
        // Solo si la nube sigue en la versión que este dispositivo conoce. Una
        // copia de antes de este cambio no tiene `_rev`: se compara con null.
        let consulta=supabaseClient.from('user_ramos').update({data:enviado}).eq('user_id',uid);
        consulta=revSync(base)===null?consulta.is('data->>_rev',null):consulta.eq('data->>_rev',String(revSync(base)));
        const {data:filas,error}=await consulta.select('user_id');
        if(error)throw error;
        escrito=Array.isArray(filas)&&filas.length>0;
      }
      if(escrito){
        // Si entretanto se cambió de cuenta, S y el disco ya son de la otra:
        // la subida quedó hecha, pero no se le anota esta base ni este dueño.
        if(!currentUser||currentUser.id!==uid)return true;
        S._rev=enviado._rev;
        guardarBaseSync(uid,enviado);
        setCacheOwner(uid); // la caché local quedó alineada con esta cuenta
        return true;
      }
      // Otro dispositivo escribió desde la última vez: se fusiona y se reintenta.
      // Nunca sobre la cuenta que entró después: loadFromCloud lee la sesión actual.
      if(!currentUser||currentUser.id!==uid)return false;
      const cloud=await loadFromCloud();
      if(!currentUser||currentUser.id!==uid)return false;
      if(cloud===null){guardarBaseSync(uid,null);continue;}
      if(!fusionarConNube(uid,base,cloud))return false;
    }
    return false;
  }catch(e){
    console.warn('No se pudo respaldar la copia local:',(e&&e.code)||'error');
    return false; // localStorage conserva la copia; se reintenta al próximo save
  }
}
// Con un modal abierto no se reemplaza S: el formulario quedaría editando
// objetos que ya no están en el estado y esa edición se perdería al guardar.
// Se reintenta en un rato; la base no cambia, así que el choque se repite y se
// resuelve cuando el modal se cierre.
function fusionarConNube(uid,base,cloud){
  const modal=typeof document!=='undefined'&&document.getElementById&&document.getElementById('modal');
  if(modal&&modal.classList&&modal.classList.contains('open')){setTimeout(syncToCloud,1500);return false;}
  const nube=normalize({...freshState(),...clonarSync(cloud)});
  S=normalize({...freshState(),...fusionarSync(base,S,nube)});
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(S));}catch(e){}
  guardarBaseSync(uid,nube);
  repintarTrasFusion();
  showToast('Sumamos lo que anotaste en otro dispositivo');
  return true;
}
function repintarTrasFusion(){
  try{
    const activa=typeof document!=='undefined'&&document.querySelector&&document.querySelector('.screen.active');
    const id=activa&&activa.id;
    if(typeof renderHome==='function')renderHome();
    if(id==='screen-ramo'){
      if(S.ramos.some(r=>r.id===currentRamoId)&&typeof renderRamo==='function')renderRamo();
      else if(typeof goHome==='function')goHome();
    }
    if(id==='screen-stats'&&typeof renderStats==='function')renderStats();
    if(id==='screen-agenda'&&typeof renderAgenda==='function')renderAgenda();
  }catch(e){}
}
async function syncProfile(){
  if(!supabaseClient||!currentUser)return;
  try{
    await supabaseClient.from('profiles').upsert({
      id:currentUser.id,
      nombre:S.userName||null,
      universidad:(TENANTS[S.tenant]&&TENANTS[S.tenant].name)||null,
      // Se manda lo DECLARADO, no el código: 'Derecho' vale para saber qué
      // malla construir; 'null' —que es lo que había cuando no tenemos su
      // malla— no vale para nada. Los códigos viejos siguen siendo válidos y
      // se distinguen porque están en CARRERAS_DECLARABLES.
      carrera:S.carreraNombre||S.carrera||null,
      semestre:S.careerSemestre||null,
    });
  }catch(e){}
}
// Se guarda apenas se crea la cuenta, antes del onboarding. Así no depende de
// que la persona alcance a configurar sus ramos para que exista la constancia.
// Las columnas son opcionales para no reinterpretar ni bloquear perfiles previos.
// Se llama al terminar el onboarding, que es por donde pasa toda cuenta nueva.
// No revienta hacia afuera: la persona ya está adentro y su semestre ya está
// guardado; un fallo de red acá no puede dejarla fuera de su propia cuenta.
async function registrarDeclaracionEdad(){
  if(!supabaseClient||!currentUser)return;
  try{
    await supabaseClient.from('profiles').upsert({
      id:currentUser.id,
      edad_declarada_en:new Date().toISOString(),
    });
    // Quien entró con Google nunca vio la casilla del formulario de correo.
    await registrarAceptacionLegal();
  }catch(e){}
}
async function registrarAceptacionLegal(){
  if(!supabaseClient||!currentUser)throw new Error('No pudimos registrar la aceptación.');
  const {error}=await supabaseClient.from('profiles').upsert({
    id:currentUser.id,
    terminos_aceptados_en:new Date().toISOString(),
    terminos_version:LEGAL_ACCEPTANCE_VERSION,
  });
  if(error)throw error;
}
// Lo que no alcanzó a subir vive solo en este dispositivo, y cerrar sesión borra
// la copia local: una nota anotada sin conexión se perdía sin aviso, aunque la
// app ya hubiera dicho "No cierres sesión". Antes de salir se intenta subir y,
// si no se puede, se pregunta.
// ¿Tiene esta pestaña algo que la nube todavía no tiene?
function hayCambiosSinSubir(){
  if(!supabaseClient||!currentUser)return false;
  const base=leerBaseSync(currentUser.id);
  if(base)return !igualSync(sinRevSync(S),sinRevSync(base));
  return !!(S.ramos?.length||S.historial?.length||S.onboardingDone);
}
async function respaldoAlDia(){
  if(!hayCambiosSinSubir())return true;
  clearTimeout(_syncTimer);_syncTimer=null;
  return (await syncNow())&&!hayCambiosSinSubir();
}
async function signOut(){
  if(!(await respaldoAlDia())){
    showConfirm('Tienes cambios sin respaldar',
      'Lo último que anotaste no alcanzó a guardarse en la nube. Si cierras sesión ahora, se borra de este dispositivo. Conéctate a internet y vuelve a intentarlo.',
      cerrarSesion,{label:'Cerrar sesión igual',focusCancel:true});
    return;
  }
  await cerrarSesion();
}
async function cerrarSesion(){
  _visitaSesion++;
  try{_cerrandoSesion=true;await supabaseClient.auth.signOut();}catch(e){}
  finally{_cerrandoSesion=false;}
  currentUser=null;closeModal();
  // Las propuestas pertenecen a la cuenta que salió, no al navegador.
  if(typeof propuestasPautaAgente!=='undefined')propuestasPautaAgente=[];
  if(typeof propuestasNotasAgente!=='undefined')propuestasNotasAgente=[];
  if(typeof propuestasFechasAgente!=='undefined')propuestasFechasAgente=[];
  if(typeof propuestasRamosAgente!=='undefined')propuestasRamosAgente=[];
  // Limpiar la caché local: si no, el siguiente que entre en este navegador
  // podría ver los datos de la sesión anterior.
  // La base de la sincronización también: es una copia completa de los datos.
  // Y la copia previa a importar: la siguiente persona podía restaurarla con
  // "Deshacer importación" y quedarse con los datos de esta cuenta.
  try{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(CACHE_OWNER_KEY);localStorage.removeItem(SYNC_BASE_KEY);localStorage.removeItem(CURSO_SIGLAS_KEY);localStorage.removeItem(PRE_IMPORT_KEY);}catch(e){}
  olvidarBaseSesion();
  S=freshState();
  // Las pestañas de profesor y admin son de la cuenta que salió, no del navegador.
  if(typeof olvidarSesionMarketplace==='function')olvidarSesionMarketplace();
  if(typeof recalcularNavTabs==='function')recalcularNavTabs();
  authMode='login';
  document.getElementById('auth-user').value='';
  document.getElementById('auth-pass').value='';
  showAuthScreen();
}

async function boot(){
  if(!supabaseClient){
    // Sin configurar Supabase → funciona en modo local (fallback)
    document.getElementById('screen-auth').classList.remove('active');
    if(S.onboardingDone)showMainApp();
    else {document.getElementById('screen-onboard').classList.add('active');obIniciar();}
    return;
  }
  // Suscribirse a cambios de auth: el evento PASSWORD_RECOVERY viene cuando
  // el usuario abre el link del correo de "olvidé mi contraseña".
  supabaseClient.auth.onAuthStateChange((event, session)=>{
    // Otra pestaña puede salir o cambiar de cuenta, y una sesión puede vencer.
    // Se reinicia la visita para cancelar también las lecturas de la cuenta
    // anterior. La copia local se conserva; no se borra una edición sin subir.
    if(!_cerrandoSesion&&currentUser&&(event==='SIGNED_OUT'||
      (event==='SIGNED_IN'&&session&&session.user.id!==currentUser.id))){
      currentUser=null;closeModal();showAuthScreen();location.reload();return;
    }
    if(event==='PASSWORD_RECOVERY'){
      enRecuperacion=true;
      if(session)currentUser=session.user;
      limpiarFragmentoAuth();
      showResetScreen();
    }
  });
  let session=null;
  try{
    const result=await supabaseClient.auth.getSession();
    session=result&&result.data?result.data.session:null;
  }catch(e){
    registrarErrorArranque(e,'obtener_sesion');
    showAppErrorScreen('obtener_sesion');
    return;
  }
  if(!session){showAuthScreen();return;}

  currentUser=session.user;
  // Si venimos de un correo de recuperación, se muestra la pantalla de nueva
  // contraseña en vez de entrar directo a la app (ver LLEGA_DE_RECUPERACION).
  limpiarFragmentoAuth();
  if(enRecuperacion){showResetScreen();return;}
  try{
    await afterLogin();
  }catch(e){
    registrarErrorArranque(e,'abrir_app');
    showAppErrorScreen('abrir_app');
  }
}
// ─── VERIFICACIÓN EN DOS PASOS ──────────────────────────────────────────────
//
// Además de la contraseña, un código de seis dígitos de una app como Google
// Authenticator (TOTP de Supabase). Hoy la pide solo la página de
// administración: AGENTS.md la exige para un panel administrativo, y el
// servidor revisa que la sesión haya pasado por acá (aal2) antes de entregar
// nada. No se ofrece a todos todavía a propósito: el inicio de sesión no la
// pide, así que activarla no protegería una cuenta de estudiante y sería una
// promesa falsa.
async function estadoDosPasos(){
  const mfa=supabaseClient&&supabaseClient.auth&&supabaseClient.auth.mfa;
  if(!mfa||!currentUser)return {ok:false,error:'Inicia sesión para seguir.'};
  try{
    const [lista,nivel]=await Promise.all([mfa.listFactors(),mfa.getAuthenticatorAssuranceLevel()]);
    if(lista.error||nivel.error)return {ok:false,error:'No pudimos revisar tu verificación en dos pasos.'};
    const verificados=(lista.data&&lista.data.totp||[]).filter(f=>f.status==='verified');
    return {ok:true,factor:verificados[0]||null,nivel:nivel.data&&nivel.data.currentLevel||'aal1'};
  }catch(e){return {ok:false,error:'No pudimos revisar tu verificación en dos pasos.'};}
}
// Un intento anterior que quedó a medias deja un factor sin verificar: se
// borra antes de empezar otro, para que no se acumulen.
async function iniciarDosPasos(){
  const mfa=supabaseClient.auth.mfa;
  try{
    const lista=await mfa.listFactors();
    for(const f of (lista.data&&lista.data.all||[]).filter(f=>f.factor_type==='totp'&&f.status!=='verified'))
      await mfa.unenroll({factorId:f.id});
    const {data,error}=await mfa.enroll({factorType:'totp'});
    if(error||!data||!data.totp)return {ok:false,error:'No pudimos preparar tu código. Intenta de nuevo.'};
    return {ok:true,factorId:data.id,qr:data.totp.qr_code,secreto:data.totp.secret};
  }catch(e){return {ok:false,error:'No pudimos preparar tu código. Intenta de nuevo.'};}
}
function codigoDosPasosValido(codigo){return /^\d{6}$/.test(String(codigo||'').replace(/\s/g,''));}
async function verificarCodigoDosPasos(factorId,codigo){
  const limpio=String(codigo||'').replace(/\s/g,'');
  if(!codigoDosPasosValido(limpio))return {ok:false,error:'El código tiene 6 números.'};
  try{
    const {error}=await supabaseClient.auth.mfa.challengeAndVerify({factorId,code:limpio});
    if(error)return {ok:false,error:'Ese código no sirve. Revisa que sea el que muestra tu app ahora.'};
    return {ok:true};
  }catch(e){return {ok:false,error:'No pudimos revisar el código. Intenta de nuevo.'};}
}
// La puerta: pinta en `raiz` lo que falte —activar la app o escribir el
// código— y llama a `alPasar` cuando la sesión quedó en aal2.
async function renderPuertaDosPasos(raiz,{alPasar,titulo='Verificación en dos pasos'}={}){
  if(!raiz)return;
  raiz.innerHTML=`<p class="profesor-info" role="status">Revisando tu verificación…</p>`;
  const e=await estadoDosPasos();
  if(!e.ok){raiz.innerHTML=`<p class="profesor-info" role="alert">${esc(e.error)}</p>`;return;}
  if(e.factor&&e.nivel==='aal2'){if(typeof alPasar==='function')alPasar();return;}
  const pedirCodigo=(factorId,intro,extra='')=>{
    raiz.innerHTML=`<div class="dos-pasos"><h3>${esc(titulo)}</h3>${intro}${extra}
      <form class="dos-pasos-form"><label class="modal-label" for="dos-pasos-codigo">Código de 6 números</label>
      <input id="dos-pasos-codigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required>
      <button class="btn-confirm" type="submit">Verificar</button>
      <p class="dos-pasos-estado" role="status" aria-live="polite"></p></form></div>`;
    const form=raiz.querySelector('.dos-pasos-form'),estado=raiz.querySelector('.dos-pasos-estado'),campo=raiz.querySelector('#dos-pasos-codigo');
    if(campo&&typeof campo.focus==='function')campo.focus();
    const boton=form.querySelector('button[type="submit"]');
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();
      // Un código TOTP sirve una vez: el segundo envío lo daba por malo y abría
      // el panel dos veces.
      if(boton.disabled)return;
      boton.disabled=true;estado.textContent='Revisando…';
      const r=await verificarCodigoDosPasos(factorId,campo.value);
      if(!r.ok){estado.textContent=r.error;boton.disabled=false;return;}
      if(typeof alPasar==='function')alPasar();
    });
  };
  if(e.factor){
    pedirCodigo(e.factor.id,'<p class="profesor-info">Escribe el código que muestra tu app de verificación.</p>');
    return;
  }
  raiz.innerHTML=`<div class="dos-pasos"><h3>${esc(titulo)}</h3>
    <p class="profesor-info">Esta página muestra datos de todos los profesores, así que además de tu contraseña pide un código de una app como Google Authenticator o 1Password. Se configura una vez.</p>
    <button type="button" class="btn-confirm" id="dos-pasos-activar">Activar</button>
    <p class="dos-pasos-estado" role="status" aria-live="polite"></p></div>`;
  const activar=raiz.querySelector('#dos-pasos-activar');
  activar.addEventListener('click',async()=>{
    if(activar.disabled)return;
    activar.disabled=true;
    const estado=raiz.querySelector('.dos-pasos-estado');estado.textContent='Preparando…';
    const r=await iniciarDosPasos();
    if(!r.ok){estado.textContent=r.error;activar.disabled=false;return;}
    // El QR viene de Supabase como imagen data:, que la CSP ya permite. Solo se
    // acepta ese formato: nunca una URL que cargue algo de afuera.
    const qr=/^data:image\/svg\+xml/.test(String(r.qr||''))?`<img class="dos-pasos-qr" src="${esc(r.qr)}" alt="Código QR para tu app de verificación">`:'';
    pedirCodigo(r.factorId,'<p class="profesor-info">Escanea este código con tu app de verificación y escribe los 6 números que te muestra.</p>',
      `${qr}<p class="profesor-info">Si no puedes escanearlo, escribe esta clave en la app: <code class="dos-pasos-secreto">${esc(r.secreto||'')}</code></p>`);
  });
}

// boot() termina en showMainApp(), que llama a renderAgenda() — y esa vive en
// render-agenda.js, que se carga DESPUÉS de este archivo. Llamarlo acá mismo
// reventaba con un ReferenceError justo en medio de
// `renderHome();renderStats();renderAgenda()`, así que las tres pantallas
// quedaban montadas y showTab('home') nunca corría: se veían una encima de otra.
//
// Solo se notaba cuando supabaseClient es null, que es la rama local — la que
// existe precisamente para que la app siga sirviendo si el script de Supabase no
// carga (bloqueador, red, CDN caída). O sea: el camino de emergencia estaba roto.
//
// DOMContentLoaded corre cuando el parser ya ejecutó todos los <script> clásicos
// del documento, así que renderAgenda ya existe.
document.addEventListener('DOMContentLoaded',boot);
