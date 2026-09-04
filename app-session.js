const PASS_MIN = 8;

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

let supabaseClient=null, currentUser=null, authMode='login';
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
  document.getElementById('auth-sub').textContent=authMode==='login'?'Tus notas, tu promedio y cuánto te falta para aprobar.':'Crea tu cuenta gratis y guarda tus notas en la nube.';
  document.getElementById('auth-btn').textContent=authMode==='login'?'Iniciar sesión':'Crear cuenta';
  document.getElementById('auth-toggle').textContent=authMode==='login'?'¿No tienes cuenta? Crea una':'¿Ya tienes cuenta? Inicia sesión';
  document.getElementById('auth-pass').setAttribute('autocomplete',authMode==='login'?'current-password':'new-password');
  const confirmWrap=document.getElementById('auth-pass-confirm-wrap');
  confirmWrap.style.display=authMode==='signup'?'block':'none';
  confirmWrap.setAttribute('aria-hidden',authMode==='signup'?'false':'true');
  document.getElementById('auth-pass2').value='';
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
  const m=((e&&e.message)||'').toLowerCase();
  // No confirmar si un correo ya tiene cuenta: esa diferencia permite enumerar
  // usuarios y preparar phishing o credential stuffing. Registro existente y
  // registro aceptado tienen que verse iguales hacia afuera.
  if(m.includes('already')||m.includes('exists'))return contexto==='cambio_correo'
    ?'Ese correo ya está asociado a otra cuenta.'
    :MSG_VERIFICA;
  if(m.includes('invalid login')||m.includes('credentials'))return 'Usuario o contraseña incorrectos.';
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
// Supabase conserva el correo actual hasta que la persona confirma los dos
// mensajes. Por eso no se actualiza `currentUser.email` ni se redibuja Ajustes
// como si el cambio ya hubiera ocurrido.
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
  if(btn){btn.disabled=true;btn.textContent='Enviando confirmaciones…';}
  try{
    const {error}=await supabaseClient.auth.updateUser({email:correo});
    if(error)throw error;
    estadoCambioCorreo('Revisa tu correo actual y el nuevo. El cambio se hará recién cuando confirmes los dos mensajes.',false);
    return true;
  }catch(e){
    estadoCambioCorreo(traduceAuthError(e,'cambio_correo'),true);
    return false;
  }finally{
    if(btn){btn.disabled=false;btn.textContent=original;}
  }
}

async function submitAuth(){
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
  }
  if(!supabaseClient){authError('Falta configurar Supabase (URL y clave) en el código.');return;}

  const btn=document.getElementById('auth-btn');const orig=btn.textContent;
  btn.disabled=true;btn.textContent='Cargando...';
  try{
    if(authMode==='signup'){
      const {data,error}=await supabaseClient.auth.signUp({email,password:p});
      if(error)throw error;
      if(!data.session){authError(MSG_VERIFICA,'info');btn.disabled=false;btn.textContent=orig;return;}
      currentUser=data.user;await afterSignup();
    }else{
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password:p});
      if(error)throw error;
      currentUser=data.user;await afterLogin();
    }
  }catch(e){
    authError(traduceAuthError(e));
    btn.disabled=false;btn.textContent=orig;
  }
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
  try{
    const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    if(error)throw error;
    authError('');showToast('Te enviamos un correo para recuperar tu contraseña');
  }catch(e){authError(traduceAuthError(e));}
}

// Al volver del correo, Supabase dispara PASSWORD_RECOVERY (ver boot()).
// Esta función recibe la nueva contraseña y la guarda.
async function submitNewPassword(){
  const p1=document.getElementById('reset-pass').value;
  const p2=document.getElementById('reset-pass2').value;
  const err=document.getElementById('reset-error');
  err.style.display='none';
  const policyError=passwordPolicyError(p1);
  if(policyError){err.textContent=policyError;err.style.display='block';return;}
  if(p1!==p2){err.textContent='Las contraseñas no coinciden.';err.style.display='block';return;}
  if(!supabaseClient){err.textContent='Supabase no está configurado.';err.style.display='block';return;}
  const btn=document.getElementById('reset-btn');const orig=btn.textContent;
  btn.disabled=true;btn.textContent='Guardando...';
  try{
    const {data,error}=await supabaseClient.auth.updateUser({password:p1});
    if(error)throw error;
    currentUser=data.user;
    showToast('Contraseña actualizada');
    document.getElementById('screen-reset').classList.remove('active');
    await afterLogin();
  }catch(e){
    err.textContent=(e&&e.message)||'No se pudo actualizar la contraseña.';err.style.display='block';
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

async function afterSignup(){
  track('signup');
  setCacheOwner(currentUser?currentUser.id:null);
  if(S.onboardingDone && S.ramos.length){
    // El usuario ya tenía datos locales → migrarlos a la nube
    await syncNow();await syncProfile();
    showToast('✓ Cuenta creada — tus datos están en la nube');
    enterApp();
  }else{
    enterOnboarding(); // usuario nuevo → completar onboarding
  }
}
async function afterLogin(){
  track('login');
  const uid=currentUser?currentUser.id:null;
  let cloud,ok=true;
  // Solo la lectura remota es recuperable: si falla, la copia local ya fue
  // normalizada al cargar y además está protegida por el dueño de la caché.
  // normalize() y enterApp() quedan fuera a propósito. Si una de ellas falla,
  // continuar con estado o DOM a medias sería peor que detenerse con un aviso.
  try{cloud=await loadFromCloud();}catch(e){ok=false;}
  if(ok){
    // La nube puede contener ramos creados con versiones anteriores. Pásalos
    // siempre por normalize(): un ramo sin preset necesita categorias:[] para
    // que el editor de pauta pueda abrirse igual que uno con pauta oficial.
    S=normalize(cloud?{...freshState(),...cloud}:freshState());
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(S));}catch(e){}
    setCacheOwner(uid);
  }else{
    // Sin red: la caché local sirve, pero SOLO si es de este mismo usuario.
    // Si es de otro (navegador compartido), se descarta para no filtrar sus datos.
    if(getCacheOwner()===uid){
      showToast('Sin conexión · usando tu copia local');
    }else{
      S=freshState();
      try{localStorage.removeItem(STORAGE_KEY);}catch(e){}
      showToast('No pudimos cargar tus datos. Revisa tu conexión.',true);
    }
  }
  if(S.onboardingDone)enterApp();else enterOnboarding();
  // No bloquea la entrada: es una lectura de red y la app ya está en pantalla.
  // Si llega con algo, repinta y lo dice — una pauta no aparece en silencio.
  aplicarConsensoAuto().then(n=>{
    if(!n)return;
    renderHome();
    showToast(n===1?'Agregamos una pauta reportada por otros estudiantes':`Agregamos ${n} pautas reportadas por otros estudiantes`);
  }).catch(()=>{});
}

async function loadFromCloud(){
  const {data,error}=await supabaseClient.from('user_ramos').select('data').eq('user_id',currentUser.id).maybeSingle();
  if(error)throw error;
  return data?data.data:null; // null = la cuenta aún no tiene datos
}
let _syncTimer=null;
function syncToCloud(){
  if(!supabaseClient||!currentUser)return;
  clearTimeout(_syncTimer);
  _syncTimer=setTimeout(syncNow,800); // agrupa ediciones rápidas
}
async function syncNow(){
  if(!supabaseClient||!currentUser)return;
  try{
    await supabaseClient.from('user_ramos').upsert({user_id:currentUser.id,data:S},{onConflict:'user_id'});
    setCacheOwner(currentUser.id); // la caché local quedó alineada con esta cuenta
  }catch(e){/* sin conexión: localStorage ya guardó, se sube al próximo save */}
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
async function signOut(){
  try{await supabaseClient.auth.signOut();}catch(e){}
  currentUser=null;closeModal();
  // Limpiar la caché local: si no, el siguiente que entre en este navegador
  // podría ver los datos de la sesión anterior.
  try{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(CACHE_OWNER_KEY);}catch(e){}
  S=freshState();
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
    if(event==='PASSWORD_RECOVERY'){
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
  // Si venimos de un correo de recuperación, la URL trae "type=recovery" en el hash.
  // Mostrar la pantalla de nueva contraseña en vez de entrar directo a la app.
  const esRecovery=location.hash.includes('type=recovery');
  limpiarFragmentoAuth();
  if(esRecovery){showResetScreen();return;}
  try{
    await afterLogin();
  }catch(e){
    registrarErrorArranque(e,'abrir_app');
    showAppErrorScreen('abrir_app');
  }
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
