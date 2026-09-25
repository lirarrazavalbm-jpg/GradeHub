// ─── CLASES PARTICULARES · DATOS Y PRIVACIDAD ───────────────────────────────
//
// Incluye el espacio privado de profesor, pero no publica anuncios: trae el
// catálogo de avisos activos y decide LOCALMENTE qué ramos calzan.
// La lista de ramos, las notas y cualquier señal de rendimiento no salen del
// dispositivo para segmentar anuncios.

const METRICAS_ANUNCIO = new Set(['impresion', 'clic', 'contacto']);
const FLYER_CLASE_MAX_BYTES = 5*1024*1024;
const FLYER_CLASE_TIPOS = new Set(['image/jpeg','image/png','image/webp']);
const CAMPOS_PUBLICOS_ANUNCIO = 'id,tenant,ramos_siglas,criterios,modalidad,ubicacion,precio_clp,titulo,descripcion,contacto_tipo,contacto_valor,flyer_path,estado,publicado_at,vence_at,created_at';
const CAMPOS_BORRADOR_CLASE = 'id,tenant,ramos_siglas,criterios,modalidad,ubicacion,precio_clp,titulo,descripcion,contacto_tipo,contacto_valor,flyer_path,estado,created_at';

// Un borrador en Supabase es una clase COMPLETA, todavía no un formulario a
// medio escribir: la tabla exige estos campos. No se añade nada a gradehub_v1.
function validarBorradorClase(entrada){
  if(!entrada||typeof entrada!=='object'||Array.isArray(entrada))return {ok:false,campo:'clase',error:'Completa los datos de tu clase.'};
  const tenant=String(entrada.tenant||'').trim();
  if(!['uc','fen','uai','uandes'].includes(tenant))return {ok:false,campo:'tenant',error:'Elige una universidad.'};
  const titulo=String(entrada.titulo||'').trim();
  if(titulo.length<5||titulo.length>90)return {ok:false,campo:'titulo',error:'Ponle un título de 5 a 90 caracteres.'};
  const descripcion=String(entrada.descripcion||'').trim();
  if(descripcion.length<20||descripcion.length>1500)return {ok:false,campo:'descripcion',error:'Cuenta qué harás en la clase (20 a 1500 caracteres).'};
  const siglas=Array.isArray(entrada.ramos_siglas)?entrada.ramos_siglas.map(s=>String(s||'').trim().toUpperCase()):[];
  if(siglas.length<1||siglas.length>12||siglas.some(s=>!/^[A-Z0-9-]{2,24}$/.test(s))||new Set(siglas).size!==siglas.length)
    return {ok:false,campo:'ramos_siglas',error:'Elige entre 1 y 12 ramos, sin repetir siglas.'};
  if(!criteriosClaseValidos(entrada.criterios))return {ok:false,campo:'criterios',error:'Revisa el promedio y el avance elegidos para tu público.'};
  const modalidad=String(entrada.modalidad||''),ubicacion=String(entrada.ubicacion||'');
  if(!['individual','grupal'].includes(modalidad))return {ok:false,campo:'modalidad',error:'Elige si la clase es individual o grupal.'};
  if(!['online','presencial','hibrido'].includes(ubicacion))return {ok:false,campo:'ubicacion',error:'Indica dónde haces la clase.'};
  if(!Number.isSafeInteger(entrada.precio_clp)||entrada.precio_clp<1000||entrada.precio_clp>500000)
    return {ok:false,campo:'precio_clp',error:'Indica el precio de la clase en pesos, entre $1.000 y $500.000.'};
  const contacto_tipo=String(entrada.contacto_tipo||''),contacto_valor=String(entrada.contacto_valor||'').trim();
  if(!['whatsapp','instagram','email'].includes(contacto_tipo))return {ok:false,campo:'contacto_tipo',error:'Elige cómo te contactarán.'};
  if(contacto_valor.length<3||contacto_valor.length>160)return {ok:false,campo:'contacto_valor',error:'Revisa el dato de contacto.'};
  // El formulario rellena "+56 9 " o "@" solo: sin esta comprobación el prefijo
  // solo, sin número ni usuario, pasaba como contacto válido y el anuncio
  // llegaba a revisión con un botón que no lleva a ninguna parte.
  if(!enlaceContactoClase(contacto_tipo,contacto_valor))return {ok:false,campo:'contacto_valor',error:ERROR_CONTACTO_CLASE[contacto_tipo]};
  // Lista blanca: nunca aceptar un estado de publicación, marcas de pago ni
  // datos académicos del estudiante enviados junto con el formulario.
  return {ok:true,datos:{tenant,ramos_siglas:siglas,
    criterios:{promedioMenorA:entrada.criterios.promedioMenorA,avanceMinimo:entrada.criterios.avanceMinimo},
    modalidad,ubicacion,precio_clp:entrada.precio_clp,titulo,descripcion,contacto_tipo,contacto_valor}};
}

const ERROR_CONTACTO_CLASE={
  whatsapp:'Escribe tu número de WhatsApp completo, por ejemplo +56 9 1234 5678.',
  instagram:'Escribe tu usuario de Instagram, por ejemplo @profe.calculo.',
  email:'Revisa tu correo: tiene que ser como nombre@dominio.cl.',
};

// ─── CAMPOS QUE SE ESCRIBEN CON FORMATO ─────────────────────────────────────
//
// Un monto en pesos se ve como se lee: al escribir 15000 aparece $15.000. El
// campo guarda texto y `pesosDeTexto` devuelve el número; por eso es un
// input de texto con teclado numérico y no `type=number`, que no acepta ni el
// signo ni los puntos.
function textoPesosEscrito(texto){
  const digitos=String(texto||'').replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0,9);
  return digitos?'$'+digitos.replace(/\B(?=(\d{3})+(?!\d))/g,'.'):'';
}
function pesosDeTexto(texto){
  const digitos=String(texto||'').replace(/\D/g,'');
  return digitos?Number(digitos):NaN;
}

// WhatsApp de Chile con sus espacios: "+56 9 1234 5678". Solo se ordena un
// celular chileno; un número de otro país se deja tal como lo escribieron.
function textoWhatsappEscrito(texto){
  const t=String(texto||'');
  const digitos=t.replace(/\D/g,'');
  if(!/^\s*\+?\s*56/.test(t)||!digitos.startsWith('569'))return t;
  const resto=digitos.slice(3,11);
  return '+56 9 '+(resto.length>4?resto.slice(0,4)+' '+resto.slice(4):resto);
}
function textoInstagramEscrito(texto){
  const t=String(texto||'').replace(/\s+/g,'');
  return t&&!t.startsWith('@')?'@'+t:t;
}
const PREFIJO_CONTACTO_CLASE={whatsapp:'+56 9 ',instagram:'@',email:''};
const EJEMPLO_CONTACTO_CLASE={whatsapp:'+56 9 1234 5678',instagram:'@profe.calculo',email:'nombre@dominio.cl'};

// Reescribe el campo con su formato sin mandar el cursor al final: cuenta
// cuántos caracteres "de verdad" (dígitos, letras) había antes del cursor y lo
// deja después de esa misma cantidad en el texto nuevo. Borrar no reformatea,
// para que la persona pueda borrar un espacio o el prefijo sin que vuelva solo.
function formatearAlEscribir(input,formatear){
  if(!input||typeof input.addEventListener!=='function')return;
  const util=c=>/[\p{L}\p{N}]/u.test(c);
  input.addEventListener('input',e=>{
    if(e&&typeof e.inputType==='string'&&e.inputType.startsWith('delete'))return;
    const antes=String(input.value||''),nuevo=formatear(antes);
    if(nuevo===antes)return;
    const cursor=typeof input.selectionStart==='number'?input.selectionStart:antes.length;
    const utilesAntes=[...antes.slice(0,cursor)].filter(util).length;
    input.value=nuevo;
    let pos=nuevo.length;
    if(utilesAntes<[...nuevo].filter(util).length){
      let vistos=0;
      for(let i=0;i<nuevo.length;i++){if(util(nuevo[i])&&++vistos===utilesAntes){pos=i+1;break;}}
      if(utilesAntes===0)pos=nuevo.search(/[\p{L}\p{N}]/u);
    }
    try{input.setSelectionRange(pos,pos);}catch(err){}
  });
}
function campoPesos(input){formatearAlEscribir(input,textoPesosEscrito);}

// El estado de profesor lo miran dos lugares —la sección de Ajustes y la barra
// de pestañas— y ninguno puede esperar una consulta de red para pintarse. Se
// guarda acá: null mientras no se sabe, y la ficha (o false) cuando se supo.
// Tres estados distintos, y confundirlos deja la pantalla mintiendo: todavía no
// se sabe, no se pudo saber (el SQL del marketplace no está aplicado), o se supo
// —y ahí puede ser una ficha o ninguna—.
let perfilProfesorCache=null,perfilProfesorPedido=false,perfilProfesorResuelto=false;
function perfilProfesorConocido(){
  if(!perfilProfesorResuelto)return undefined;   // preguntando
  return perfilProfesorCache;                     // ficha, false, o null si no se pudo
}
function esProfesorAprobado(){
  return !!(perfilProfesorCache&&perfilProfesorCache.estado==='aprobado');
}
// Se llama al entrar. No bloquea nada: si falla —por ejemplo porque el SQL del
// marketplace todavía no está aplicado— la app sigue igual y simplemente no
// aparece ni la pestaña ni el estado en Ajustes.
async function cargarPerfilProfesor(){
  if(perfilProfesorPedido)return perfilProfesorCache;
  perfilProfesorPedido=true;
  const r=await perfilProfesorActual();
  perfilProfesorCache=r.ok?(r.perfil||false):null;
  perfilProfesorResuelto=true;
  return perfilProfesorCache;
}
// Después de postular o de que cambie el estado, para no dejar la pantalla
// mostrando lo anterior.
function olvidarPerfilProfesor(){perfilProfesorCache=null;perfilProfesorPedido=false;perfilProfesorResuelto=false;}

function sesionProfesorClase(){
  return supabaseClient&&currentUser&&currentUser.id?String(currentUser.id):'';
}

async function perfilProfesorActual(){
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para entrar al espacio de profesor.'};
  try{
    const {data,error}=await supabaseClient.from('tutor_perfiles')
      .select('nombre_publico,presentacion,estado,solicitado_at,revisado_at')
      .eq('user_id',uid).maybeSingle();
    if(error)return {ok:false,error:'El espacio de profesor todavía no está disponible. Tus notas no se han tocado.'};
    return {ok:true,perfil:data||null};
  }catch(e){return {ok:false,error:'El espacio de profesor todavía no está disponible. Tus notas no se han tocado.'};}
}

async function postularProfesor(nombre,presentacion){
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para postular.'};
  const publico=String(nombre||'').trim(),texto=String(presentacion||'').trim();
  if(publico.length<2||publico.length>100)return {ok:false,campo:'nombre',error:'Escribe un nombre público de 2 a 100 caracteres.'};
  if(texto.length<20||texto.length>1500)return {ok:false,campo:'presentacion',error:'Cuéntanos qué ramos enseñas y tu experiencia (20 a 1500 caracteres).'};
  try{
    const {data,error}=await supabaseClient.from('tutor_perfiles')
      .insert({user_id:uid,nombre_publico:publico,presentacion:texto})
      .select('nombre_publico,presentacion,estado,solicitado_at,revisado_at').single();
    if(error||!data||data.estado!=='pendiente')return {ok:false,error:'No pudimos enviar tu postulación. Intenta de nuevo.'};
    return {ok:true,perfil:data};
  }catch(e){return {ok:false,error:'No pudimos enviar tu postulación. Intenta de nuevo.'};}
}

async function abrirBorradorClase(id){
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para ver tus borradores.'};
  if(id&&!/^[0-9a-f-]{36}$/i.test(String(id)))return {ok:false,error:'No encontramos ese borrador.'};
  try{
    // RLS delimita al dueño. autor_id no tiene SELECT público: filtrarlo aquí
    // provocaría un error de permisos o expondría identidades si se concediera.
    let consulta=supabaseClient.from('tutor_anuncios').select(CAMPOS_BORRADOR_CLASE)
      .eq('estado','borrador');
    consulta=id?consulta.eq('id',id):consulta.order('created_at',{ascending:false}).limit(1);
    const {data,error}=await consulta.maybeSingle();
    if(error)return {ok:false,error:'No pudimos abrir tu borrador. Intenta de nuevo.'};
    return {ok:true,anuncio:data||null};
  }catch(e){return {ok:false,error:'No pudimos abrir tu borrador. Intenta de nuevo.'};}
}

async function guardarBorradorClase(entrada,id){
  const valido=validarBorradorClase(entrada);
  if(!valido.ok)return valido;
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para guardar el borrador.'};
  if(id&&!/^[0-9a-f-]{36}$/i.test(String(id)))return {ok:false,error:'No encontramos ese borrador.'};
  try{
    let consulta=id
      ?supabaseClient.from('tutor_anuncios').update(valido.datos).eq('id',id).eq('estado','borrador')
      :supabaseClient.from('tutor_anuncios').insert({...valido.datos,autor_id:uid});
    const {data,error}=await consulta.select(CAMPOS_BORRADOR_CLASE).single();
    if(error||!data||data.estado!=='borrador')return {ok:false,error:'No se guardó el borrador. Revisa tu conexión e intenta de nuevo.'};
    return {ok:true,anuncio:data};
  }catch(e){return {ok:false,error:'No se guardó el borrador. Revisa tu conexión e intenta de nuevo.'};}
}

async function enviarBorradorClase(id){
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para enviar tu anuncio.'};
  if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))return {ok:false,error:'Guarda el borrador antes de enviarlo.'};
  const abierto=await abrirBorradorClase(id);
  if(!abierto.ok)return abierto;
  if(!abierto.anuncio)return {ok:false,error:'Este anuncio ya no es un borrador. Vuelve a abrirlo.'};
  const valido=validarBorradorClase(abierto.anuncio);
  if(!valido.ok)return valido;
  try{
    const {data,error}=await supabaseClient.from('tutor_anuncios')
      .update({estado:'en_revision'}).eq('id',id).eq('estado','borrador')
      .select('id,estado').single();
    if(error||!data||data.estado!=='en_revision')return {ok:false,error:'No se envió a revisión. Tu borrador sigue disponible.'};
    return {ok:true,anuncio:data};
  }catch(e){return {ok:false,error:'No se envió a revisión. Tu borrador sigue disponible.'};}
}

function validarFlyerClase(file){
  if(!file)return {ok:true,opcional:true};
  if(!FLYER_CLASE_TIPOS.has(String(file.type||'').toLowerCase()))return {ok:false,error:'Usa una imagen JPG, PNG o WebP.'};
  if(!Number.isFinite(file.size)||file.size<=0)return {ok:false,error:'No pudimos leer ese archivo.'};
  if(file.size>FLYER_CLASE_MAX_BYTES)return {ok:false,error:'El flyer no puede pesar más de 5 MB.'};
  return {ok:true,opcional:false};
}

function extensionFlyerClase(tipo){
  return tipo==='image/png'?'png':tipo==='image/webp'?'webp':'jpg';
}

// El anuncio tiene que existir primero: así la RLS puede comprobar tanto la
// carpeta del usuario como el borrador al que pertenece. Nunca se conserva el
// nombre original del archivo.
async function subirFlyerClase(anuncioId,file){
  const valido=validarFlyerClase(file);
  if(!valido.ok)return {ok:false,error:valido.error};
  if(valido.opcional)return {ok:true,path:null};
  if(!supabaseClient||!currentUser||!anuncioId)return {ok:false,error:'Primero guarda el borrador del anuncio.'};
  const id=String(anuncioId).trim(),uid=String(currentUser.id||'').trim();
  if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f-]{36}$/i.test(uid))return {ok:false,error:'No pudimos identificar el borrador.'};
  const {data:anuncio,error:lecturaError}=await supabaseClient.from('tutor_anuncios')
    .select('flyer_path,estado').eq('id',id).single();
  if(lecturaError||!anuncio)return {ok:false,error:'No encontramos tu borrador. Vuelve a abrirlo antes de subir el flyer.'};
  if(anuncio.estado!=='borrador')return {ok:false,error:'Vuelve el anuncio a borrador antes de cambiar su flyer.'};
  const aleatorio=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'';
  if(!aleatorio)return {ok:false,error:'Tu navegador no pudo preparar un nombre seguro para el flyer.'};
  const path=`${uid}/${id}/${aleatorio}.${extensionFlyerClase(file.type)}`;
  const {error:subidaError}=await supabaseClient.storage.from('tutor-flyers').upload(path,file,{contentType:file.type,upsert:false});
  if(subidaError)return {ok:false,error:subidaError.message||'No pudimos subir el flyer.'};
  const {data:guardado,error:anuncioError}=await supabaseClient.from('tutor_anuncios')
    .update({flyer_path:path}).eq('id',id).eq('estado','borrador')
    .select('flyer_path').single();
  if(anuncioError||!guardado||guardado.flyer_path!==path){
    await supabaseClient.storage.from('tutor-flyers').remove([path]);
    return {ok:false,error:'El flyer subió, pero no pudimos unirlo al borrador. Intenta de nuevo.'};
  }
  const anterior=String(anuncio.flyer_path||'').trim();
  if(anterior&&anterior!==path)await supabaseClient.storage.from('tutor-flyers').remove([anterior]);
  return {ok:true,path};
}

async function urlFlyerClase(path){
  const limpio=String(path||'').trim();
  if(!supabaseClient||!limpio||limpio.includes('..')||!limpio.includes('/'))return '';
  // Las URLs firmadas no son revocables en el acto: se limitan a un minuto.
  const {data,error}=await supabaseClient.storage.from('tutor-flyers').createSignedUrl(limpio,60);
  if(error)return '';
  return String(data&&data.signedUrl||'');
}

async function quitarFlyerClase(anuncioId){
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para editar el flyer.'};
  const abierto=await abrirBorradorClase(anuncioId);
  if(!abierto.ok)return abierto;
  if(!abierto.anuncio)return {ok:false,error:'Vuelve el anuncio a borrador antes de quitar el flyer.'};
  const anterior=abierto.anuncio.flyer_path;
  if(!anterior)return {ok:true};
  try{
    const {data,error}=await supabaseClient.from('tutor_anuncios').update({flyer_path:null})
      .eq('id',anuncioId).eq('estado','borrador').select('id,flyer_path').single();
    if(error||!data||data.flyer_path!==null)return {ok:false,error:'No pudimos quitar el flyer. Intenta de nuevo.'};
    // El anuncio ya no lo muestra aunque falle la limpieza de Storage.
    try{
      const {error:borradoError}=await supabaseClient.storage.from('tutor-flyers').remove([anterior]);
      return borradoError?{ok:true,aviso:'Flyer quitado del anuncio; quedó una copia privada por limpiar.'}:{ok:true};
    }catch(e){return {ok:true,aviso:'Flyer quitado del anuncio; quedó una copia privada por limpiar.'};}
  }catch(e){return {ok:false,error:'No pudimos quitar el flyer. Intenta de nuevo.'};}
}

function siglaAnuncio(sigla){
  return String(sigla||'').trim().toUpperCase();
}

function siglaRamoParaClases(ramo){
  const origen=ramo&&ramo.origen;
  if(!origen||!origen.tenant)return '';
  // La app ya sella siglas al cargar el catálogo, incluidas UAI y UAndes.
  // Los ramos antiguos recurren al mismo resolutor que la ficha, sin inferir
  // que cualquier ramoKey sea una sigla (en FEN suele ser un nombre).
  return siglaAnuncio(ramo.sigla||siglaDeRamo(ramo,origen.tenant));
}

function ramosLocalesConSigla(ramos){
  const vistos=new Set();
  return (Array.isArray(ramos)?ramos:[]).map(siglaRamoParaClases)
    .filter(sigla=>sigla&& !vistos.has(sigla) && (vistos.add(sigla),true));
}

// Recibe anuncios ya descargados y ramos que YA viven en el navegador. Esta
// operación no llama a Supabase ni envía notas o ramos para elegir el aviso.
function anunciosParaRamosLocales(anuncios,ramos){
  const porUniversidad=new Map();
  (Array.isArray(ramos)?ramos:[]).forEach(r=>{
    const sigla=siglaRamoParaClases(r),tenant=r&&r.origen&&r.origen.tenant;
    if(!sigla||!tenant)return;
    if(!porUniversidad.has(tenant))porUniversidad.set(tenant,new Set());
    porUniversidad.get(tenant).add(sigla);
  });
  return (Array.isArray(anuncios)?anuncios:[]).map(anuncio=>{
    const siglas=porUniversidad.get(anuncio&&anuncio.tenant);
    if(!siglas)return null;
    const coinciden=(Array.isArray(anuncio&&anuncio.ramos_siglas)?anuncio.ramos_siglas:[])
      .map(siglaAnuncio).filter(sigla=>siglas.has(sigla));
    return coinciden.length?{...anuncio,siglasCoincidentes:coinciden}:null;
  }).filter(Boolean);
}

// No hay una regla oculta por defecto: cada campaña declara su público.
// Un aviso antiguo sin criterios sigue en el catálogo general, pero no se
// personaliza hasta que el anunciante y el equipo acuerden ese público.
function criteriosClaseValidos(c){
  return !!c&&typeof c==='object'&&!Array.isArray(c)&&
    Object.keys(c).length===2&&Number.isFinite(c.promedioMenorA)&&
    c.promedioMenorA>1&&c.promedioMenorA<=7&&Number.isFinite(c.avanceMinimo)&&
    c.avanceMinimo>=0&&c.avanceMinimo<100;
}
function seleccionarClaseApoyo(anuncios,ramos,tenant,{descartados=[],ahora=Date.now()}={}){
  const propios=(Array.isArray(ramos)?ramos:[]).filter(r=>r&&r.origen&&r.origen.tenant===tenant);
  const omitidos=new Set(descartados);
  const disponibles=anunciosParaRamosLocales(anuncios,propios).filter(a=>
    a.tenant===tenant&&a.estado==='publicado'&&!omitidos.has(a.id)&&
    (a.vence_at==null||Date.parse(a.vence_at)>ahora)&&criteriosClaseValidos(a.criterios));
  // El orden de ramos que eligió la persona manda; el de los avisos desempata.
  // Se entrega como máximo una tarjeta, sin escribir ninguna preferencia en S.
  for(const ramo of propios){
    const sigla=siglaRamoParaClases(ramo);
    const candidatos=disponibles.filter(a=>a.siglasCoincidentes.includes(sigla));
    if(!candidatos.length)continue;
    const cats=ramo.categorias||[];
    const total=cats.reduce((s,c)=>s+Number(c.peso||0),0);
    const esperado=100-Number(ramo.aporta&&ramo.aporta.peso||0);
    if(!Number.isFinite(total)||esperado<=0||Math.abs(total-esperado)>0.01||
      cats.some(c=>!Number.isFinite(Number(c.peso))||Number(c.peso)<0||c.lista))continue;
    const avance=ramoProgress(ramo);
    if(!Number.isFinite(avance.total)||avance.total<=0||!Number.isFinite(avance.pending)||avance.pending<=0)continue;
    // `pct` está redondeado para la pantalla: 19,9% no debe cumplir 20%.
    const evaluado=100*(avance.total-avance.pending)/avance.total;
    const promedio=ramoAvg(ramo,undefined,ramos);
    if(!Number.isFinite(promedio))continue;
    const anuncio=candidatos.find(a=>promedio<a.criterios.promedioMenorA&&evaluado+1e-9>=a.criterios.avanceMinimo);
    if(anuncio)return {anuncio,ramo};
  }
  return null;
}

// Cotización pura: recibe CONTEOS agregados, nunca cuentas ni notas. El equipo
// define tramos de tarifas; se toma el más caro que cumple la segmentación.
// El piloto parte con $1.000/$2.000, pero los recibe como dato para que GradeHub
// pueda administrarlos sin duplicar la regla dentro de esta función.
// Esto no factura: los eventos actuales no miden alcance único. Sin medición
// real, null significa desconocido y nunca se transforma en cero usuarios.
// La tarifa del piloto. Es una decisión comercial de GradeHub, no un precio que
// el profesor pueda editar, y vive acá para poder cambiarla sin tocar la
// fórmula. Decidida por Lucas el 2026-09-20.
const TARIFA_CLASES={
  base:1000,          // $ por cuenta alcanzada con el público más amplio posible
  cargoFijo:3000,     // $ por publicar, cubre la revisión humana de cada aviso
  porRamoExtra:1000,  // $ por cada ramo además del primero
  redondeo:50,        // el precio por persona sale redondo, no con decimales
};
// De qué nota para abajo empieza a cobrarse el recargo, y cuánto rango cubre.
// 5,5 es donde un promedio deja de ser "cualquiera" y empieza a ser alguien a
// quien le puede servir una clase; 2,5 puntos más abajo (3,0) es el máximo.
const NOTA_SIN_RECARGO=5.5,RANGO_NOTA_RECARGO=2.5;

// Cuánto más caro es un público más exigente, entre 0 (nada) y 2 (el doble del
// recargo máximo por cada lado). Dos palancas, porque encarecen por motivos
// distintos:
//
// - Pedir un promedio MÁS BAJO estrecha el público a quien de verdad está
//   complicado en ese ramo. Es el aviso que más sirve y el que menos gente ve.
// - Pedir MÁS % evaluado no estrecha tanto, pero compra certeza: con medio
//   semestre corregido el promedio ya significa algo, y el anunciante no le
//   está pagando a GradeHub por alcanzar a alguien con dos notas.
//
// La fórmula reproduce los dos precios que ya estaban acordados para el piloto:
// sin filtro (7,0 y 0%) da 1x = $1.000, y bajo 4,0 con 40% evaluado da 2x =
// $2.000. O sea generaliza los dos tramos en vez de reemplazarlos por otra cosa.
function exigenciaCriteriosClase(criterios){
  const porNota=Math.min(Math.max((NOTA_SIN_RECARGO-criterios.promedioMenorA)/RANGO_NOTA_RECARGO,0),1);
  const porAvance=Math.min(Math.max(criterios.avanceMinimo/100,0),1);
  return porNota+porAvance;
}

// Esto no factura: los eventos actuales no miden alcance único. Sin medición
// real, null significa desconocido y nunca se transforma en cero usuarios.
//
// Devuelve dos cobros que son cosas distintas y no se suman a ciegas: un cargo
// fijo por publicar, que se paga aunque el aviso no lo vea nadie, y un precio
// por cuenta alcanzada. `totalEstimado` es la suma solo cuando hay una medición
// que sumar.
function cotizarCampanaClases(criterios,tarifa,{elegibles=null,alcanzados=null,presupuestoClp=null,ramos=1}={}){
  if(!criteriosClaseValidos(criterios))return null;
  if([elegibles,alcanzados,presupuestoClp].some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0)))return null;
  if(!Number.isSafeInteger(ramos)||ramos<1||ramos>12)return null;
  const t={...TARIFA_CLASES,...(tarifa&&typeof tarifa==='object'&&!Array.isArray(tarifa)?tarifa:{})};
  if(!['base','cargoFijo','porRamoExtra','redondeo'].every(k=>Number.isSafeInteger(t[k])&&t[k]>=0))return null;
  if(t.base<=0||t.redondeo<=0)return null;

  const precioCrudo=t.base*(1+exigenciaCriteriosClase(criterios));
  const precioPorCuenta=Math.round(precioCrudo/t.redondeo)*t.redondeo;
  // Publicar cuesta lo mismo aunque no lo vea nadie: paga la revisión humana.
  // Cada ramo extra abre otro público y otra revisión, así que sube parejo.
  const cargoFijo=t.cargoFijo+t.porRamoExtra*(ramos-1);

  // El presupuesto cubre el alcance, no el cargo fijo: ese ya se pagó al
  // publicar. Descontarlo acá haría que subir un ramo bajara el alcance.
  const cupo=presupuestoClp===null?null:Math.floor(presupuestoClp/precioPorCuenta);
  const alcanceCotizado=elegibles===null?null:Math.min(elegibles,cupo??Infinity);
  const costoEstimado=alcanceCotizado===null?null:alcanceCotizado*precioPorCuenta;
  const costoPorAlcance=alcanzados===null?null:Math.min(alcanzados,cupo??Infinity)*precioPorCuenta;
  const totalEstimado=costoEstimado===null?null:cargoFijo+costoEstimado;
  const totalPorAlcance=costoPorAlcance===null?null:cargoFijo+costoPorAlcance;
  if([costoEstimado,costoPorAlcance,totalEstimado,totalPorAlcance].some(n=>n!==null&&!Number.isSafeInteger(n)))return null;
  return {precioPorCuenta,cargoFijo,ramos,elegibles,alcanzados,alcanceCotizado,
    costoEstimado,costoPorAlcance,totalEstimado,totalPorAlcance,presupuestoClp};
}

// Pide solo el catálogo público de una universidad. No recibe `ramos` como
// parámetro ni lee S.ramos: esos datos nunca cruzan esta frontera de red.
async function cargarAnunciosClases(tenant){
  const universidad=String(tenant||'').trim();
  if(!supabaseClient||!universidad)return [];
  const ahora=new Date().toISOString();
  try{
    const anuncios=[],vistos=new Set(),tamano=60;
    for(let desde=0;;desde+=tamano){
      const {data,error}=await supabaseClient.from('tutor_anuncios')
        .select(CAMPOS_PUBLICOS_ANUNCIO).eq('tenant',universidad).eq('estado','publicado')
        .or(`vence_at.is.null,vence_at.gt.${ahora}`)
        .order('publicado_at',{ascending:false}).order('id',{ascending:true})
        .range(desde,desde+tamano-1);
      if(error)throw error;
      const pagina=Array.isArray(data)?data:[];
      pagina.forEach(a=>{if(!vistos.has(a.id)){vistos.add(a.id);anuncios.push(a);}});
      if(pagina.length<tamano)return anuncios;
    }
  }catch(error){console.warn('No se pudieron cargar las clases particulares:',error.message||error);return [];}
}

// ─── CATÁLOGO GENERAL PARA ESTUDIANTES ─────────────────────────────────────
//
// Esta puerta no es una recomendación: todos los estudiantes de la misma
// universidad reciben los mismos anuncios y el filtro trabaja sobre esa lista
// ya descargada. No lee S.ramos ni una nota para ordenar o esconder resultados.
function normalizarBusquedaClase(texto){
  return String(texto||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

function nombresRamosParaClases(tenant){
  const nombres={};
  const agregar=(sigla,nombre)=>{
    const codigo=siglaAnuncio(sigla),rotulo=String(nombre||'').trim();
    if(codigo&&rotulo&&!nombres[codigo])nombres[codigo]=rotulo;
  };
  // Créditos y cursos UC son fuentes ya cargadas por la app. No se deduce una
  // sigla desde el texto: si GradeHub no conoce el par, el aviso sigue siendo
  // encontrable por su código y por el texto que escribió el profesor.
  const creditos=typeof CREDITOS_POR_TENANT!=='undefined'&&CREDITOS_POR_TENANT[tenant];
  if(creditos)Object.entries(creditos).forEach(([nombre,fila])=>agregar(fila&&fila[1],nombre));
  if(tenant==='uc'&&typeof cursosUcDisponibles==='function')
    cursosUcDisponibles().forEach(fila=>{if(Array.isArray(fila))agregar(fila[0],fila[1]);});
  if(tenant==='uc'&&typeof SIGLAS_UC!=='undefined')
    Object.values(SIGLAS_UC).forEach(tabla=>Object.entries(tabla||{}).forEach(([nombre,sigla])=>agregar(sigla,nombre)));
  return nombres;
}

function prepararCatalogoClases(anuncios,busqueda,nombresPorSigla={}, {ahora=Date.now()}={}){
  const consulta=normalizarBusquedaClase(busqueda),tokens=consulta.split(' ').filter(Boolean);
  return (Array.isArray(anuncios)?anuncios:[]).filter(a=>{
    if(!a||a.estado!=='publicado')return false;
    if(a.vence_at!=null){const vence=Date.parse(a.vence_at);if(!Number.isFinite(vence)||vence<=ahora)return false;}
    const siglas=(Array.isArray(a.ramos_siglas)?a.ramos_siglas:[]).map(siglaAnuncio).filter(Boolean);
    const nombres=siglas.map(s=>nombresPorSigla[s]).filter(Boolean);
    const texto=normalizarBusquedaClase([a.titulo,a.descripcion,...siglas,...nombres].join(' '));
    return !tokens.length||tokens.every(t=>texto.includes(t));
  }).map(a=>{
    const siglas=(Array.isArray(a.ramos_siglas)?a.ramos_siglas:[]).map(siglaAnuncio).filter(Boolean);
    return {...a,ramos_siglas:siglas,nombres_ramos:siglas.map(s=>nombresPorSigla[s]).filter(Boolean)};
  }).sort((a,b)=>{
    const sa=(a.ramos_siglas.slice().sort()[0]||'ZZZ'),sb=(b.ramos_siglas.slice().sort()[0]||'ZZZ');
    if(sa!==sb)return sa<sb?-1:1;
    const va=a.vence_at?Date.parse(a.vence_at):Infinity,vb=b.vence_at?Date.parse(b.vence_at):Infinity;
    if(va!==vb)return va-vb;
    return String(a.titulo||'').localeCompare(String(b.titulo||''),'es');
  });
}

// Los datos de contacto vienen de contenido revisado, pero igual se construyen
// con lista blanca. Nunca se copia una URL arbitraria a href.
function enlaceContactoClase(tipo,valor){
  const canal=String(tipo||''),dato=String(valor||'').trim();
  if(canal==='whatsapp'){
    const telefono=dato.replace(/\D/g,'');
    return telefono.length>=8&&telefono.length<=15?`https://wa.me/${telefono}`:'';
  }
  if(canal==='instagram'){
    const usuario=dato.replace(/^@/,'');
    return /^[A-Za-z0-9._]{1,30}$/.test(usuario)?`https://www.instagram.com/${usuario}/`:'';
  }
  if(canal==='email'){
    const correo=dato.toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))return '';
    // El `@` NO se codifica: es el separador del destinatario y el RFC 6068 no
    // lo admite escapado. `encodeURIComponent` lo convertía en %40, y con eso
    // hay clientes de correo que no abren el mensaje o lo abren sin destino —
    // justo el enlace del que depende todo el marketplace.
    //
    // Lo demás sí se codifica: un `?` o un `&` en la dirección los leería el
    // cliente como el inicio de los encabezados del mailto (asunto, cuerpo,
    // copia oculta), no como parte del correo.
    return `mailto:${encodeURIComponent(correo).replace(/%40/g,'@')}`;
  }
  return '';
}

function formatoClase(anuncio){
  const modalidad={individual:'Individual',grupal:'Grupal'}[anuncio&&anuncio.modalidad]||'';
  const ubicacion={online:'Online',presencial:'Presencial',hibrido:'Híbrida'}[anuncio&&anuncio.ubicacion]||'';
  return [modalidad,ubicacion].filter(Boolean).join(' · ');
}
function pesosClase(valor){
  // Nunca un precio negativo. El formulario ya exige entre 1.000 y 500.000, así
  // que un negativo solo puede venir de una fila corrupta o manipulada del
  // servidor — y ahí "$-500" en el catálogo es peor que no mostrar nada.
  const n=Number(valor);
  return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0})
    .format(Number.isFinite(n)&&n>0?n:0);
}
function textoContactoClase(tipo){return {whatsapp:'Hablar por WhatsApp',instagram:'Ver Instagram',email:'Enviar correo'}[tipo]||'Contactar';}

let catalogoClasesActual=[],nombresCatalogoClasesActual={};
function renderCatalogoClases(busqueda=''){
  const raiz=document.getElementById('catalogo-clases-resultados');
  if(!raiz)return;
  const anuncios=prepararCatalogoClases(catalogoClasesActual,busqueda,nombresCatalogoClasesActual);
  const estado=document.getElementById('catalogo-clases-estado');
  if(estado)estado.textContent=anuncios.length
    ?`${anuncios.length} ${anuncios.length===1?'clase encontrada':'clases encontradas'}`
    :(busqueda?'No encontramos clases para esa búsqueda.':'Todavía no hay clases publicadas en tu universidad.');
  raiz.innerHTML=anuncios.map(a=>{
    const contacto=enlaceContactoClase(a.contacto_tipo,a.contacto_valor);
    const siglas=a.ramos_siglas.join(' · '),nombres=[...new Set(a.nombres_ramos)].join(' · ');
    return `<article class="catalogo-clase-card" data-catalogo-anuncio="${esc(a.id)}">
      ${a.flyer_path?`<div class="catalogo-clase-flyer" data-flyer="${esc(a.flyer_path)}"><span>Cargando flyer…</span></div>`:''}
      <div class="catalogo-clase-contenido">
        <small>Publicidad · Clase particular</small>
        <h3>${esc(a.titulo||'Clase particular')}</h3>
        <p class="catalogo-clase-ramos"><strong>${esc(siglas)}</strong>${nombres?`<span>${esc(nombres)}</span>`:''}</p>
        <p class="catalogo-clase-descripcion">${esc(a.descripcion||'')}</p>
        <div class="catalogo-clase-datos"><span>${esc(formatoClase(a))}</span><strong>${pesosClase(a.precio_clp)} <small>por clase</small></strong></div>
        ${contacto?`<a class="catalogo-clase-contacto" href="${esc(contacto)}" ${a.contacto_tipo==='email'?'':'target="_blank" rel="noopener noreferrer"'} data-contactar="${esc(a.id)}" data-sigla="${esc(a.ramos_siglas[0]||'')}">${esc(textoContactoClase(a.contacto_tipo))}</a>`
          :'<p class="catalogo-clase-sin-contacto">El contacto de esta clase necesita revisión.</p>'}
      </div>
    </article>`;
  }).join('');
  raiz.querySelectorAll('[data-contactar]').forEach(link=>link.addEventListener('click',()=>{
    registrarMetricaAnuncio(link.dataset.contactar,'contacto',link.dataset.sigla);
  }));
  observarImpresionesClases(raiz,anuncios);
  raiz.querySelectorAll('[data-flyer]').forEach(async caja=>{
    const url=await urlFlyerClase(caja.dataset.flyer);
    if(!caja.isConnected)return;
    caja.innerHTML=url?`<img src="${esc(url)}" alt="" loading="lazy">`:'';
    if(!url)caja.remove();
  });
}

// Una impresión es una tarjeta que se VIO: al menos la mitad en pantalla
// durante un segundo, como dice docs/marketplace-clases.md. Pintarla fuera de
// la vista no cuenta. Se registra una vez por anuncio mientras el catálogo
// está abierto: buscar y volver a pintar no la suma de nuevo.
//
// Va a `anuncio_metricas`, que cuenta eventos y no factura. El alcance por
// catálogo —lo que sí se cobraría, a un precio menor que el segmentado— espera
// a que el servidor distinga por qué camino llegó cada cuenta.
const IMPRESION_VISIBLE=0.5,IMPRESION_MS=1000;
let impresionesCatalogo=new Set(),observadorCatalogo=null;
function observarImpresionesClases(raiz,anuncios){
  if(observadorCatalogo){observadorCatalogo.disconnect();observadorCatalogo=null;}
  if(typeof IntersectionObserver!=='function'||!raiz)return;
  const sigla=new Map((anuncios||[]).map(a=>[a.id,(a.ramos_siglas||[])[0]||'']));
  const timers=new Map();
  observadorCatalogo=new IntersectionObserver(entradas=>{
    for(const e of entradas){
      const id=e.target.dataset.catalogoAnuncio;
      if(!id||impresionesCatalogo.has(id))continue;
      if(e.isIntersecting&&e.intersectionRatio>=IMPRESION_VISIBLE){
        if(!timers.has(id))timers.set(id,setTimeout(()=>{
          timers.delete(id);
          if(!e.target.isConnected||impresionesCatalogo.has(id))return;
          impresionesCatalogo.add(id);
          registrarMetricaAnuncio(id,'impresion',sigla.get(id));
        },IMPRESION_MS));
      }else if(timers.has(id)){clearTimeout(timers.get(id));timers.delete(id);}
    }
  },{threshold:[IMPRESION_VISIBLE]});
  raiz.querySelectorAll('[data-catalogo-anuncio]').forEach(card=>observadorCatalogo.observe(card));
}

async function openCatalogoClases(){
  impresionesCatalogo=new Set();
  const raiz=document.getElementById('modal-content');
  if(!raiz)return;
  raiz.innerHTML=`<div class="catalogo-clases">
    <div class="catalogo-clases-head"><div><div class="modal-title" id="modal-titulo">Clases particulares</div><p>Busca apoyo por ramo o sigla. El catálogo es el mismo para todos los estudiantes de tu universidad: no usa tus notas.</p></div><button type="button" class="settings-cerrar" onclick="closeModal()">Cerrar</button></div>
    <label class="modal-label" for="catalogo-clases-buscar">Buscar clases</label>
    <div class="catalogo-clases-busqueda"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="catalogo-clases-buscar" type="search" autocomplete="off" placeholder="Ej. Cálculo II o MAT1620" aria-describedby="catalogo-clases-estado"></div>
    <p class="catalogo-clases-estado" id="catalogo-clases-estado" role="status" aria-live="polite">Buscando clases publicadas…</p>
    <div class="catalogo-clases-resultados" id="catalogo-clases-resultados" aria-busy="true"></div>
  </div>`;
  openModal();
  const input=raiz.querySelector('#catalogo-clases-buscar');
  const sigueAbierto=()=>input.isConnected&&document.getElementById('catalogo-clases-buscar')===input&&
    document.getElementById('modal').classList.contains('open');
  input.addEventListener('input',()=>renderCatalogoClases(input.value));
  const tenant=S.tenant;
  // En UC los nombres del catálogo completo llegan diferidos. Los avisos y sus
  // siglas aparecen al tiro; cuando carga el archivo, se enriquece la búsqueda
  // por nombre sin volver a pedir anuncios ni tocar datos académicos.
  if(tenant==='uc'&&typeof cargarCursosUC==='function'&&typeof cursosUcExtra==='function'&&!cursosUcExtra())
    cargarCursosUC().then(ok=>{if(ok&&sigueAbierto()){nombresCatalogoClasesActual=nombresRamosParaClases(tenant);renderCatalogoClases(input.value);}}).catch(()=>{});
  catalogoClasesActual=await cargarAnunciosClases(tenant);
  if(!sigueAbierto())return;
  nombresCatalogoClasesActual=nombresRamosParaClases(tenant);
  const resultados=raiz.querySelector('#catalogo-clases-resultados');if(resultados)resultados.setAttribute('aria-busy','false');
  renderCatalogoClases(input.value);
  input.focus();
}

function payloadMetricaAnuncio(anuncioId,tipo,ramoSigla){
  const evento=String(tipo||'');
  const sigla=siglaAnuncio(ramoSigla);
  if(!METRICAS_ANUNCIO.has(evento)||!anuncioId||!sigla)return null;
  // Lista blanca deliberada. No se agrega user_id, ramos, notas ni device id:
  // auth.uid() autoriza dentro de la RPC y se descarta antes de escribir.
  return {p_anuncio_id:anuncioId,p_tipo:evento,p_ramo_sigla:sigla};
}

async function registrarMetricaAnuncio(anuncioId,tipo,ramoSigla){
  const payload=payloadMetricaAnuncio(anuncioId,tipo,ramoSigla);
  if(!supabaseClient||!currentUser||!payload)return false;
  const {data,error}=await supabaseClient.rpc('registrar_metrica_anuncio',payload);
  if(error){console.warn('No se pudo registrar la métrica del anuncio:',error.message||error);return false;}
  return data===true;
}

// La RPC aplica el mínimo de quince EVENTOS en el servidor. Esta función no
// replica ni relaja el umbral: si no hay filas, simplemente no hay un corte
// seguro para mostrar todavía.
async function resumenMetricasAnuncio(anuncioId){
  if(!supabaseClient||!currentUser||!anuncioId)return [];
  const {data,error}=await supabaseClient.rpc('resumen_metricas_anuncio',{p_anuncio_id:anuncioId});
  if(error){console.warn('No se pudieron cargar las métricas del anuncio:',error.message||error);return [];}
  return Array.isArray(data)?data:[];
}

// ─── ALCANCE ÚNICO ──────────────────────────────────────────────────────────
//
// Lo que se cobra es cuántas CUENTAS DISTINTAS vieron un aviso. La llamada solo
// manda el id del aviso: la cuenta la pone el servidor con auth.uid() y la
// campaña ya la conoce. No viajan notas, ramos ni el criterio con que se eligió
// el aviso, así que la fila no dice nada de cómo le va a quien lo vio.
//
// El Set evita repetir la llamada dentro de la misma visita. No es la
// deduplicación: esa la hace la llave primaria en el servidor, que es la que
// cuenta para facturar. Acá solo se ahorra red.
const ALCANCE_REGISTRADO=new Set();
async function registrarAlcanceAnuncio(anuncioId){
  if(!supabaseClient||!currentUser||!anuncioId||ALCANCE_REGISTRADO.has(anuncioId))return false;
  ALCANCE_REGISTRADO.add(anuncioId);
  const {data,error}=await supabaseClient.rpc('registrar_alcance_anuncio',{p_anuncio_id:anuncioId});
  if(error){
    // Si falló, no quedó registrado: se puede reintentar en la próxima vista.
    ALCANCE_REGISTRADO.delete(anuncioId);
    console.warn('No se pudo registrar el alcance del anuncio:',error.message||error);
    return false;
  }
  return data===true;
}

// El total de la propia campaña. Devuelve null si no se pudo consultar, para no
// confundir "no sé" con "nadie lo vio" en una pantalla que habla de plata.
async function alcanceAnuncio(anuncioId){
  if(!supabaseClient||!currentUser||!anuncioId)return null;
  const {data,error}=await supabaseClient.rpc('alcance_anuncio',{p_anuncio_id:anuncioId});
  if(error){console.warn('No se pudo cargar el alcance del anuncio:',error.message||error);return null;}
  return Number.isInteger(data)?data:null;
}

// Espacio separado de las notas. El SQL es manual: si todavía no existe,
// esta puerta explica el fallo y no interviene en el arranque de GradeHub.
// El espacio de profesor vive en su propia PESTAÑA desde el 2026-09-21: armar un
// anuncio con su público y su cotización es una tarea de varios pasos y no cabe
// en una ventana. El cuerpo se separa del modal para que las dos entradas —la
// pestaña y el menú, mientras exista— pinten exactamente lo mismo.
async function renderProfesor(){
  const raiz=document.getElementById('profesor-body');
  if(!raiz)return;
  await renderEspacioProfesor(raiz,{titulo:false});
}
async function openEspacioProfesor(){
  const raiz=document.getElementById('modal-content');
  raiz.innerHTML='<div class="modal-title" id="modal-titulo">Espacio de profesor</div><p class="profesor-info" role="status">Revisando tu acceso…</p>';
  openModal();
  await renderEspacioProfesor(raiz,{titulo:true});
}
async function renderEspacioProfesor(raiz,{titulo=true}={}){
  const cabecera=t=>titulo?`<div class="modal-title" id="modal-titulo">${t}</div>`:'';
  // Toda pantalla que termina acá tiene que poder cerrarse. Desde que el modal
  // no se cierra ni arrastrándolo ni tocando fuera, una ventana sin botón deja a
  // la persona encerrada — y estas son de una sola línea, sin formulario ni
  // botones propios. En la pestaña no va: ahí no hay nada que cerrar.
  const salida=()=>titulo?'<div class="modal-btns"><button type="button" class="btn-cancel" onclick="closeModal()">Cerrar</button></div>':'';
  raiz.innerHTML=cabecera('Espacio de profesor')+'<p class="profesor-info" role="status">Revisando tu acceso…</p>';
  const ficha=await perfilProfesorActual();
  if(!ficha.ok){raiz.innerHTML=cabecera('Espacio de profesor')+`<p class="profesor-info" role="alert">${esc(ficha.error)}</p>`+salida();return;}
  if(!ficha.perfil){renderPostulacionProfesor(raiz);return;}
  if(ficha.perfil.estado!=='aprobado'){
    const avisos={pendiente:'Tu postulación está esperando revisión. Todavía no puedes ofrecer clases.',rechazado:'Tu postulación no fue aprobada. Puedes escribirnos desde Sugerencias para revisar el motivo.',suspendido:'Tu acceso de profesor está suspendido. Tus notas como estudiante siguen disponibles.'};
    raiz.innerHTML=cabecera('Espacio de profesor')+`<p class="profesor-info" role="status">${esc(avisos[ficha.perfil.estado]||'Tu perfil necesita revisión.')}</p>`+salida();
    return;
  }
  const mios=await misAnunciosClase();
  if(!mios.ok){raiz.innerHTML=cabecera('Espacio de profesor')+`<p class="profesor-info" role="alert">${esc(mios.error)}</p>`+salida();return;}
  // Sin ningún anuncio todavía, no hay panel que mostrar: se entra derecho a
  // preparar el primero, que es lo único que esa persona puede hacer.
  if(!mios.anuncios.length){renderBorradorProfesor(raiz,null);return;}
  await renderPanelProfesor(raiz,mios.anuncios,{cabecera,salida});
}

// La puerta desde Ajustes: solo la postulación, sin el espacio completo. Quien
// todavía no postula no tiene anuncios que mostrarle.
function postularComoProfesor(){
  const raiz=document.getElementById('modal-content');
  if(!raiz)return;
  renderPostulacionProfesor(raiz);
  openModal();
}
function renderPostulacionProfesor(raiz){
  raiz.innerHTML=`<div class="modal-title" id="modal-titulo">Postula para ofrecer clases</div>
    <p class="profesor-info">Tu cuenta de estudiante sigue igual. Un miembro de nuestro equipo revisará tu postulación antes de que puedas preparar anuncios.</p>
    <form class="profesor-form" id="profesor-postular">
      <label class="modal-label" for="profesor-nombre">Nombre público</label><input id="profesor-nombre" type="text" maxlength="100" minlength="2" required autocomplete="name">
      <label class="modal-label" for="profesor-presentacion">Qué ramos enseñas y qué experiencia tienes</label><textarea id="profesor-presentacion" minlength="20" maxlength="1500" required></textarea>
      <p class="profesor-info">Nadie verá tus notas. Cada anuncio que prepares necesitará otra aprobación.</p>
      <div class="modal-btns"><button type="button" class="btn-cancel" onclick="closeModal()">Cancelar</button><button class="btn-confirm" type="submit">Enviar postulación</button></div>
      <p class="profesor-estado" role="status" aria-live="polite"></p>
    </form>`;
  const form=raiz.querySelector('#profesor-postular'),estado=form.querySelector('.profesor-estado');
  let enviando=false;
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(enviando)return;
    if(!form.reportValidity())return;
    enviando=true;
    const boton=form.querySelector('button');boton.disabled=true;estado.textContent='Enviando postulación…';
    const resultado=await postularProfesor(form.querySelector('#profesor-nombre').value,form.querySelector('#profesor-presentacion').value);
    if(resultado.ok){
      // El estado en memoria quedó viejo: sin esto Ajustes seguiría ofreciendo
      // postular a alguien que acaba de hacerlo.
      olvidarPerfilProfesor();
      if(typeof cargarPerfilProfesor==='function')cargarPerfilProfesor().then(()=>{
        if(typeof renderSettingsSiAbierto==='function')renderSettingsSiAbierto();
      }).catch(()=>{});
      raiz.innerHTML='<div class="modal-title" id="modal-titulo">Postulación enviada</div><p class="profesor-info" role="status">Quedó pendiente de revisión. Aún no puedes publicar clases. En Ajustes · Clases particulares puedes ver en qué va.</p><div class="modal-btns"><button type="button" class="btn-cancel" onclick="closeModal()">Cerrar</button></div>';
      return;
    }
    estado.textContent=resultado.error;boton.disabled=false;enviando=false;
    if(resultado.campo)form.querySelector(resultado.campo==='nombre'?'#profesor-nombre':'#profesor-presentacion').focus();
  });
}

// Los anuncios de quien mira. La RLS ya delimita al dueño —un profesor ve los
// suyos en cualquier estado y de los demás solo los publicados—, así que no se
// filtra por autor_id acá: esa columna no tiene SELECT público y pedirla daría
// un error de permisos.
async function misAnunciosClase(){
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para ver tus clases.'};
  try{
    const {data,error}=await supabaseClient.from('tutor_anuncios')
      .select(CAMPOS_PUBLICOS_ANUNCIO)
      .order('created_at',{ascending:false});
    if(error)throw error;
    // Los publicados de otros tutores también pasan la RLS: se descartan por
    // los que uno puede editar, que son los únicos con métricas propias.
    return {ok:true,anuncios:Array.isArray(data)?data:[]};
  }catch(e){return {ok:false,error:'No pudimos consultar tus clases. Intenta de nuevo.'};}
}

const ESTADOS_ANUNCIO={
  borrador:['Borrador','Nadie lo ve todavía.'],
  en_revision:['En revisión','No se publica hasta que lo aprobemos.'],
  publicado:['Publicado','Se está mostrando a tu público.'],
  pausado:['Pausado','Dejó de mostrarse.'],
  expirado:['Terminado','La campaña llegó a su fin.'],
};

// Lo que se cobra son PERSONAS DISTINTAS alcanzadas, así que ese es el número
// grande. Los cortes por día y tipo vienen del servidor solo cuando superan los
// quince eventos: por debajo no se devuelven, y decir "0 clics" ahí sería
// mentir. Con pocos datos se dice que son pocos, no que son cero.
// Solo un anuncio que ALCANZÓ a publicarse puede tener números. Un borrador o
// uno esperando aprobación no los vio nadie, y mostrarle "23 personas · va
// costando $49.000" a quien todavía espera el visto bueno es inventarle un
// gasto que no existe.
const ANUNCIO_YA_SE_MOSTRO=new Set(['publicado','pausado','expirado']);
async function metricasDeAnuncio(anuncio){
  const salida={alcance:null,cortes:[]};
  if(!anuncio||!ANUNCIO_YA_SE_MOSTRO.has(anuncio.estado))return salida;
  try{
    const {data,error}=await supabaseClient.rpc('alcance_anuncio',{p_anuncio_id:anuncio.id});
    if(!error&&Number.isInteger(data))salida.alcance=data;
  }catch(e){}
  try{
    const {data,error}=await supabaseClient.rpc('resumen_metricas_anuncio',{p_anuncio_id:anuncio.id});
    if(!error&&Array.isArray(data))salida.cortes=data;
  }catch(e){}
  return salida;
}

function totalesDeCortes(cortes){
  const por={impresion:0,clic:0,contacto:0};
  (cortes||[]).forEach(c=>{if(por[c.tipo]!==undefined)por[c.tipo]+=Number(c.eventos)||0;});
  return por;
}

// Lo que lleva gastado esta campaña, con la misma tarifa que cotiza al armarla.
// Solo se muestra cuando hay alcance medido: inventar un costo sobre un número
// que no existe es peor que no mostrarlo.
function costoDeAnuncio(anuncio,alcance){
  if(alcance===null||!criteriosClaseValidos(anuncio&&anuncio.criterios))return null;
  const ramos=Array.isArray(anuncio.ramos_siglas)?anuncio.ramos_siglas.length:1;
  return cotizarCampanaClases(anuncio.criterios,null,{alcanzados:alcance,ramos});
}

// La RLS deja que el profesor lleve su aviso a borrador, a revisión o a pausa.
// NO lo deja publicar ni expirar: eso lo marca el equipo. O sea pausar es una
// puerta de una sola dirección para él, y hay que decírselo ANTES de que la
// cruce: para volver a mostrarse, el aviso pasa por revisión otra vez.
async function cambiarEstadoAnuncio(id,estado){
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para administrar tus clases.'};
  if(!['borrador','en_revision','pausado'].includes(estado))return {ok:false,error:'Ese cambio no te corresponde a ti.'};
  try{
    const {data,error}=await supabaseClient.from('tutor_anuncios')
      .update({estado}).eq('id',id).select(CAMPOS_PUBLICOS_ANUNCIO).single();
    if(error||!data)return {ok:false,error:'No pudimos cambiar el estado. Intenta de nuevo.'};
    return {ok:true,anuncio:data};
  }catch(e){return {ok:false,error:'No pudimos cambiar el estado. Intenta de nuevo.'};}
}

function pausarAnuncioClase(id,alTerminar){
  showConfirm('¿Pausar esta clase?',
    'Deja de mostrarse al tiro y no se te cobra por nadie más. Para volver a publicarla tiene que pasar por revisión de nuevo: no se reanuda sola.',
    async()=>{
      const r=await cambiarEstadoAnuncio(id,'pausado');
      showToast(r.ok?'Clase pausada':r.error,!r.ok);
      if(r.ok&&typeof alTerminar==='function')alTerminar();
    },{label:'Pausar',danger:false});
}

function retomarAnuncioClase(id,alTerminar){
  showConfirm('¿Volver a publicarla?',
    'Pasa a borrador para que la revises. Cuando la envíes, la revisamos antes de publicarla de nuevo.',
    async()=>{
      const r=await cambiarEstadoAnuncio(id,'borrador');
      showToast(r.ok?'Quedó como borrador':r.error,!r.ok);
      if(r.ok&&typeof alTerminar==='function')alTerminar(r.anuncio||null);
    },{label:'Seguir',danger:false});
}

// Un publicado cuya fecha ya pasó está TERMINADO aunque la fila todavía diga
// "publicado": nadie más lo ve —la RLS filtra por vence_at— y nada en el
// servidor le cambia el estado al vencer. Decirle "se está mostrando" sería
// mentirle sobre una campaña que ya cerró.
function vigenciaAnuncio(a,ahora=Date.now()){
  if(!a)return '';
  if(a.estado==='publicado'){
    const vence=Date.parse(a.vence_at||'');
    return Number.isFinite(vence)&&vence<=ahora?'expirado':'publicado';
  }
  return a.estado;
}
// La página se ordena por lo que el profesor puede HACER con cada anuncio.
function gruposPanelClases(anuncios,ahora=Date.now()){
  const g={activos:[],revision:[],borradores:[],cerrados:[]};
  for(const a of anuncios||[]){
    const e=vigenciaAnuncio(a,ahora);
    (e==='publicado'?g.activos:e==='en_revision'?g.revision:e==='borrador'?g.borradores:g.cerrados).push(a);
  }
  return g;
}
function diasRestantesAnuncio(a,ahora=Date.now()){
  const vence=Date.parse(a&&a.vence_at||'');
  return Number.isFinite(vence)?Math.max(0,Math.ceil((vence-ahora)/864e5)):null;
}
// Cuánto de la campaña ya pasó, entre 0 y 1, para el riel de vigencia.
function avanceCampanaAnuncio(a,ahora=Date.now()){
  const desde=Date.parse(a&&a.publicado_at||''),hasta=Date.parse(a&&a.vence_at||'');
  if(!Number.isFinite(desde)||!Number.isFinite(hasta)||hasta<=desde)return null;
  return Math.min(Math.max((ahora-desde)/(hasta-desde),0),1);
}

// Una cifra con su nombre. Solo se pinta lo que se sabe: un tipo de evento sin
// datos suficientes no aparece como 0, porque el servidor no devuelve cortes
// con menos de quince eventos y "0 clics" ahí sería inventarlo.
function cifrasClase({alcance,totales,hayCortes,costo},pesos){
  const f=[];
  const miles=n=>new Intl.NumberFormat('es-CL').format(n);
  f.push(['Personas alcanzadas',alcance===null?'—':miles(alcance),'cuentas distintas']);
  if(hayCortes&&totales.impresion)f.push(['Se mostró',miles(totales.impresion),'veces']);
  if(hayCortes&&totales.clic)f.push(['Clics',miles(totales.clic),'veces']);
  if(hayCortes&&totales.contacto)f.push(['Contactos',miles(totales.contacto),'tocaron tu contacto']);
  if(hayCortes&&totales.impresion&&totales.contacto)
    f.push(['Tasa de contacto',new Intl.NumberFormat('es-CL',{style:'percent',maximumFractionDigits:1}).format(totales.contacto/totales.impresion),'de quienes la vieron']);
  if(costo)f.push(['Va costando',pesos(costo.totalPorAlcance),'hasta ahora']);
  return `<div class="clase-nums">${f.map(([t,v,d])=>
    `<div class="clase-num"><span>${t}</span><b>${v}</b><small>${d}</small></div>`).join('')}</div>`;
}

// De quienes la vieron, cuántos tocaron algo. Barras relativas a las
// impresiones y dibujadas con scaleX, no con width.
function embudoClase(totales){
  if(!totales.impresion)return '';
  const filas=[['Se mostró',totales.impresion],['Clics',totales.clic],['Contactos',totales.contacto]].filter(([,n])=>n>0);
  if(filas.length<2)return '';
  return `<div class="clase-embudo" aria-label="De quienes vieron tu clase, cuántos avanzaron">${filas.map(([t,n])=>
    `<div class="clase-embudo-fila"><span>${t}</span><div class="clase-barra"><i style="transform:scaleX(${(n/totales.impresion).toFixed(3)})"></i></div><b>${n}</b></div>`).join('')}</div>`;
}

function tarjetaPanelClase(a,pesos,ahora){
  const vig=vigenciaAnuncio(a,ahora);
  const [etiqueta,detalle]=ESTADOS_ANUNCIO[vig]||[vig,''];
  const dias=vig==='publicado'?diasRestantesAnuncio(a,ahora):null,avance=vig==='publicado'?avanceCampanaAnuncio(a,ahora):null;
  const accion={
    publicado:`<button type="button" class="clase-accion" data-pausar="${esc(a.id)}">Pausar</button>`,
    borrador:`<button type="button" class="clase-accion" data-editar="${esc(a.id)}">Seguir editando</button>`,
    pausado:`<button type="button" class="clase-accion" data-retomar="${esc(a.id)}">Volver a publicar</button>`,
    expirado:`<button type="button" class="clase-accion" data-retomar="${esc(a.id)}">Volver a publicar</button>`,
  }[vig]||'';
  return `<article class="clase-card" data-anuncio="${esc(a.id)}">
    <div class="clase-card-top">
      <strong>${esc(a.titulo||'Sin título')}</strong>
      <span class="clase-estado clase-estado-${esc(vig)}">${esc(etiqueta)}</span>
    </div>
    <p class="clase-card-meta">${esc((a.ramos_siglas||[]).join(' · '))}${a.precio_clp?' · '+pesos(a.precio_clp)+' por clase':''}</p>
    ${dias!==null?`<div class="clase-vigencia"><span>${dias===0?'Termina hoy':dias===1?'Queda 1 día':`Quedan ${dias} días`}</span>${avance!==null?`<div class="clase-riel"><i style="transform:scaleX(${avance.toFixed(3)})"></i></div>`:''}</div>`
      :`<p class="clase-card-detalle">${esc(detalle)}</p>`}
    <div class="clase-numeros" data-metricas="${esc(a.id)}"></div>
    ${accion}
  </article>`;
}

function seccionPanelClases(titulo,lista,pesos,ahora,vacio){
  if(!lista.length&&!vacio)return '';
  return `<section class="clases-seccion"><h3>${titulo}${lista.length?` <span>${lista.length}</span>`:''}</h3>
    ${lista.length?`<div class="clase-lista">${lista.map(a=>tarjetaPanelClase(a,pesos,ahora)).join('')}</div>`:`<p class="clase-sin-datos">${vacio}</p>`}</section>`;
}

async function renderPanelProfesor(raiz,anuncios,{cabecera,salida}){
  const pesos=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n);
  const ahora=Date.now(),g=gruposPanelClases(anuncios,ahora);
  const conNumeros=[...g.activos,...g.cerrados];
  raiz.innerHTML=cabecera('Espacio de profesor')+
    `<section class="clases-resumen" aria-labelledby="clases-resumen-titulo">
       <h3 id="clases-resumen-titulo">${g.activos.length?`Tus clases activas`:'Todavía no tienes clases activas'}</h3>
       <div id="clases-kpis">${g.activos.length?'<p class="clase-sin-datos">Cargando números…</p>'
         :`<p class="clase-sin-datos">${g.revision.length?'Cuando aprobemos tu clase, acá vas a ver a cuántas personas llega, cuántas te contactan y cuánto va costando.'
           :'Arma un borrador y mándalo a revisión. Cuando se publique, acá vas a ver cómo le va.'}</p>`}</div>
       <p class="clase-privacidad">Los números son de cuentas distintas, nunca de personas con nombre.</p>
     </section>
     <div class="clases-acciones"><button type="button" class="btn-confirm" id="clase-nueva">Armar un borrador</button></div>`+
    seccionPanelClases('Publicadas',g.activos,pesos,ahora)+
    seccionPanelClases('En revisión',g.revision,pesos,ahora)+
    seccionPanelClases('Borradores',g.borradores,pesos,ahora)+
    seccionPanelClases('Pausadas y terminadas',g.cerrados,pesos,ahora)+
    salida();
  // Al cambiar el estado se vuelve a pedir la lista: el estado, los números y
  // los botones de cada tarjeta dependen de él, y repintar a mano lo que uno
  // cree que cambió es la forma de que una tarjeta quede mintiendo.
  const repintar=()=>renderEspacioProfesor(raiz,{titulo:!!cabecera('x')});
  const nueva=raiz.querySelector('#clase-nueva');
  if(nueva)nueva.addEventListener('click',()=>renderBorradorProfesor(raiz,null));
  raiz.querySelectorAll('[data-editar]').forEach(b=>
    b.addEventListener('click',()=>renderBorradorProfesor(raiz,anuncios.find(a=>a.id===b.dataset.editar)||null)));
  raiz.querySelectorAll('[data-pausar]').forEach(b=>
    b.addEventListener('click',()=>pausarAnuncioClase(b.dataset.pausar,repintar)));
  // Volver a publicar = volver a borrador y abrirlo: el anuncio pasa por
  // revisión otra vez, y lo natural es revisarlo antes de reenviarlo.
  raiz.querySelectorAll('[data-retomar]').forEach(b=>
    b.addEventListener('click',()=>retomarAnuncioClase(b.dataset.retomar,an=>an?renderBorradorProfesor(raiz,an):repintar())));

  for(const a of [...g.revision,...g.borradores]){
    const caja=raiz.querySelector(`[data-metricas="${a.id}"]`);
    if(caja)caja.innerHTML=`<p class="clase-sin-datos">${a.estado==='en_revision'
      ?'Cuando lo aprobemos y empiece a mostrarse, sus números aparecen acá.'
      :'Todavía no se publica, así que no hay nada que medir.'}</p>`;
  }
  conNumeros.forEach(a=>{const caja=raiz.querySelector(`[data-metricas="${a.id}"]`);if(caja)caja.innerHTML='<p class="clase-sin-datos">Cargando…</p>';});

  // Las métricas se piden después de pintar y en paralelo: son dos consultas
  // por anuncio y la lista ya está en pantalla. Si alguna falla, esa tarjeta lo
  // dice y las otras siguen andando.
  const medidas=await Promise.all(conNumeros.map(async a=>{
    const m=await metricasDeAnuncio(a);
    return {a,alcance:m.alcance,totales:totalesDeCortes(m.cortes),hayCortes:m.cortes.length>0,costo:costoDeAnuncio(a,m.alcance)};
  }));
  for(const d of medidas){
    const caja=raiz.querySelector(`[data-metricas="${d.a.id}"]`);
    if(!caja||!caja.isConnected)continue;
    caja.innerHTML=cifrasClase(d,pesos)+embudoClase(d.totales)+
      (d.hayCortes?'':'<p class="clase-sin-datos">Las veces que se mostró, los clics y los contactos aparecen cuando hay suficientes datos para que nadie quede identificado.</p>')+
      (d.costo?`<p class="clase-sin-datos">${pesos(d.costo.cargoFijo)} de publicación${d.costo.alcanzados?` + ${pesos(d.costo.precioPorCuenta)} por cada una de las ${d.costo.alcanzados} personas`:''}.</p>`:'');
  }

  // El resumen suma solo las clases activas: es "cómo me va ahora". Suma lo que
  // se sabe; si ningún anuncio pudo medir su alcance, sale raya y no cero.
  const kpis=raiz.querySelector('#clases-kpis');
  const activas=medidas.filter(d=>vigenciaAnuncio(d.a,ahora)==='publicado');
  if(kpis&&kpis.isConnected&&activas.length){
    const conAlcance=activas.filter(d=>d.alcance!==null);
    const totales={impresion:0,clic:0,contacto:0};
    activas.forEach(d=>Object.keys(totales).forEach(k=>totales[k]+=d.totales[k]));
    const costos=activas.filter(d=>d.costo);
    const costo=costos.length?{totalPorAlcance:costos.reduce((n,d)=>n+d.costo.totalPorAlcance,0)}:null;
    kpis.innerHTML=cifrasClase({alcance:conAlcance.length?conAlcance.reduce((n,d)=>n+d.alcance,0):null,
      totales,hayCortes:activas.some(d=>d.hayCortes),costo},pesos).replace('class="clase-nums"','class="clase-nums clases-kpis"')+
      embudoClase(totales);
  }
}

function renderBorradorProfesor(raiz,anuncio){
  let id=anuncio&&anuncio.id||null,flyerActual=anuncio&&anuncio.flyer_path||null;
  const valor=(campo,defecto='')=>esc(anuncio&&anuncio[campo]!=null?anuncio[campo]:defecto);
  const tipoContactoInicial=anuncio&&PREFIJO_CONTACTO_CLASE[anuncio.contacto_tipo]!==undefined?anuncio.contacto_tipo:'whatsapp';
  const elegir=(opciones,actual)=>opciones.map(([clave,texto])=>`<option value="${clave}"${actual===clave?' selected':''}>${texto}</option>`).join('');
  raiz.innerHTML=`<div class="modal-title" id="modal-titulo">${id?'Edita tu borrador':'Prepara tu clase'}</div>
    <p class="profesor-info">Nada se publica al guardar. Completa tu clase, revisa el público y luego envíala a revisión.</p>
    <form class="profesor-form" id="profesor-borrador">
      <h3>1. Tu clase</h3>
      <label class="modal-label" for="pr-titulo">Título del anuncio</label><input id="pr-titulo" type="text" minlength="5" maxlength="90" required value="${valor('titulo')}">
      <label class="modal-label" for="pr-descripcion">Descripción</label><textarea id="pr-descripcion" minlength="20" maxlength="1500" required placeholder="Qué van a trabajar, cómo son tus clases y tu experiencia con el ramo.">${valor('descripcion')}</textarea>
      <label class="modal-label" for="pr-precio">Precio por clase</label><input id="pr-precio" type="text" inputmode="numeric" autocomplete="off" required placeholder="$15.000" value="${esc(textoPesosEscrito(anuncio&&anuncio.precio_clp))}">
      <label class="modal-label" for="pr-modalidad">Formato</label><select id="pr-modalidad">${elegir([['individual','Individual'],['grupal','Grupal']],anuncio&&anuncio.modalidad)}</select>
      <label class="modal-label" for="pr-ubicacion">Dónde</label><select id="pr-ubicacion">${elegir([['online','Online'],['presencial','Presencial'],['hibrido','Híbrido']],anuncio&&anuncio.ubicacion)}</select>
      <label class="modal-label" for="pr-contacto-tipo">Cómo te contactarán</label><select id="pr-contacto-tipo">${elegir([['whatsapp','WhatsApp'],['instagram','Instagram'],['email','Correo']],anuncio&&anuncio.contacto_tipo)}</select>
      <label class="modal-label" for="pr-contacto">Tu contacto</label><input id="pr-contacto" type="text" minlength="3" maxlength="160" required autocomplete="off" placeholder="${esc(EJEMPLO_CONTACTO_CLASE[tipoContactoInicial])}" value="${esc(anuncio&&anuncio.contacto_valor!=null?anuncio.contacto_valor:PREFIJO_CONTACTO_CLASE[tipoContactoInicial])}">
      <label class="modal-label" for="pr-flyer">Flyer · opcional</label><input id="pr-flyer" type="file" accept="image/jpeg,image/png,image/webp"><p class="profesor-info">JPG, PNG o WebP · máximo 5 MB. Primero se guarda el borrador y después se sube la imagen.</p>
      <div class="profesor-flyer-preview" hidden><img alt="Vista previa del flyer"></div>
      <button class="btn-cancel" id="pr-quitar-flyer" type="button" ${flyerActual?'':'hidden'}>Quitar flyer guardado</button>
      <h3>2. Público</h3>
      <label class="modal-label" for="pr-tenant">Universidad</label><select id="pr-tenant">${elegir([['uc','UC'],['fen','FEN'],['uai','UAI'],['uandes','UAndes']],anuncio&&anuncio.tenant||S.tenant)}</select>
      <label class="modal-label" for="pr-siglas">Siglas de los ramos · separadas por coma</label><input id="pr-siglas" type="text" required placeholder="MAT1610, FIS1514" value="${esc(anuncio&&Array.isArray(anuncio.ramos_siglas)?anuncio.ramos_siglas.join(', '):'')}">
      <label class="modal-label" for="pr-promedio">Promedio menor a</label><input id="pr-promedio" type="number" min="1.1" max="7" step="0.1" required value="${esc(anuncio&&anuncio.criterios?anuncio.criterios.promedioMenorA:5)}">
      <label class="modal-label" for="pr-avance">Mínimo evaluado · %</label><input id="pr-avance" type="number" min="0" max="99" step="1" required value="${esc(anuncio&&anuncio.criterios?anuncio.criterios.avanceMinimo:20)}">
      <p class="profesor-info">GradeHub calcula el público sin mostrarte notas ni identidades. Esta pantalla aún no cotiza ni cobra campañas.</p>
      <h3>3. Revisa antes de enviar</h3><div class="profesor-vista"><small>Publicidad · Clase particular</small><strong></strong><p></p></div>
      <div class="modal-btns"><button class="btn-cancel" id="pr-guardar" type="button">Guardar borrador</button><button class="btn-confirm" id="pr-enviar" type="button">Enviar a revisión</button></div>
      <p class="profesor-estado" role="status" aria-live="polite">${id?'Borrador recuperado. Puedes seguir editándolo.':'Completa la clase para guardar el primer borrador.'}</p>
    </form>`;
  const form=raiz.querySelector('#profesor-borrador'),campo=id=>form.querySelector('#pr-'+id),estado=form.querySelector('.profesor-estado');
  let procesando=false;
  const vista=form.querySelector('.profesor-vista');
  const actualizarVista=()=>{vista.querySelector('strong').textContent=campo('titulo').value.trim()||'Tu clase';vista.querySelector('p').textContent=campo('descripcion').value.trim()||'Aquí aparecerá lo que ofreces.';};
  form.addEventListener('input',actualizarVista);actualizarVista();
  campoPesos(campo('precio'));
  // WhatsApp e Instagram parten con su prefijo escrito. Al cambiar de canal se
  // cambia el prefijo solo si el campo no tiene nada más que un prefijo: lo que
  // la persona ya escribió no se borra por tocar el selector.
  const contacto=campo('contacto');
  formatearAlEscribir(contacto,texto=>{
    const tipo=campo('contacto-tipo').value;
    return tipo==='whatsapp'?textoWhatsappEscrito(texto):tipo==='instagram'?textoInstagramEscrito(texto):texto;
  });
  campo('contacto-tipo').addEventListener('change',()=>{
    const tipo=campo('contacto-tipo').value,actual=String(contacto.value||'').trim();
    if(!actual||Object.values(PREFIJO_CONTACTO_CLASE).some(p=>p&&p.trim()===actual))contacto.value=PREFIJO_CONTACTO_CLASE[tipo]||'';
    contacto.placeholder=EJEMPLO_CONTACTO_CLASE[tipo]||'';
  });
  const preview=form.querySelector('.profesor-flyer-preview');
  if(flyerActual)urlFlyerClase(flyerActual).then(url=>{if(url&&preview.isConnected){preview.querySelector('img').src=url;preview.hidden=false;}});
  campo('flyer').addEventListener('change',()=>{
    const file=campo('flyer').files&&campo('flyer').files[0],validacion=validarFlyerClase(file);
    if(!validacion.ok){campo('flyer').value='';estado.textContent=validacion.error;return;}
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{if(!preview.isConnected)return;preview.querySelector('img').src=String(reader.result||'');preview.hidden=false;estado.textContent='Flyer listo para subir cuando guardes.';};
    reader.onerror=()=>{estado.textContent='No pudimos leer ese flyer. Elige otra imagen.';};
    reader.readAsDataURL(file);
  });
  form.querySelector('#pr-quitar-flyer').addEventListener('click',async()=>{
    if(!id||procesando)return;
    procesando=true;
    estado.textContent='Quitando flyer…';
    const resultado=await quitarFlyerClase(id);procesando=false;
    estado.textContent=resultado.ok?resultado.aviso||'Flyer quitado del borrador.':resultado.error;
    if(resultado.ok){flyerActual=null;campo('flyer').value='';preview.hidden=true;form.querySelector('#pr-quitar-flyer').hidden=true;}
  });
  const procesar=async enviar=>{
    if(procesando)return;
    if(!form.reportValidity())return;
    const file=campo('flyer').files&&campo('flyer').files[0],validacion=validarFlyerClase(file);
    if(!validacion.ok){estado.textContent=validacion.error;campo('flyer').focus();return;}
    const datos={tenant:campo('tenant').value,ramos_siglas:campo('siglas').value.split(',').map(s=>s.trim()),
      criterios:{promedioMenorA:Number(campo('promedio').value),avanceMinimo:Number(campo('avance').value)},
      titulo:campo('titulo').value,descripcion:campo('descripcion').value,precio_clp:pesosDeTexto(campo('precio').value),
      modalidad:campo('modalidad').value,ubicacion:campo('ubicacion').value,
      contacto_tipo:campo('contacto-tipo').value,contacto_valor:campo('contacto').value};
    procesando=true;
    const botones=[form.querySelector('#pr-guardar'),form.querySelector('#pr-enviar')];botones.forEach(b=>b.disabled=true);
    estado.textContent='Guardando borrador…';
    try{
      const guardado=await guardarBorradorClase(datos,id);
      if(!guardado.ok){estado.textContent=guardado.error;if(guardado.campo){const mapa={ramos_siglas:'siglas',criterios:'promedio',precio_clp:'precio',contacto_tipo:'contacto-tipo',contacto_valor:'contacto'};campo(mapa[guardado.campo]||guardado.campo)?.focus();}return;}
      id=guardado.anuncio.id;
      if(file){estado.textContent='Borrador guardado. Subiendo flyer…';const subida=await subirFlyerClase(id,file);
        if(!subida.ok){estado.textContent='Borrador guardado, pero '+subida.error;return;}
        flyerActual=subida.path;campo('flyer').value='';form.querySelector('#pr-quitar-flyer').hidden=false;
      }
      if(enviar){estado.textContent='Enviando a revisión…';const respuesta=await enviarBorradorClase(id);
        if(!respuesta.ok){estado.textContent=respuesta.error;return;}
        raiz.innerHTML='<div class="modal-title" id="modal-titulo">En revisión</div><p class="profesor-info" role="status">Recibimos tu anuncio. Nadie lo verá hasta que GradeHub lo revise y apruebe.</p>';return;
      }
      estado.textContent='Borrador guardado. Puedes volver después o enviarlo a revisión.';
    }catch(e){estado.textContent='No pudimos completar la acción. Revisa si tu borrador quedó guardado e intenta de nuevo.';
    }finally{procesando=false;botones.forEach(b=>{if(b.isConnected)b.disabled=false;});}
  };
  form.addEventListener('submit',e=>{e.preventDefault();procesar(false);});
  form.querySelector('#pr-guardar').addEventListener('click',()=>procesar(false));
  form.querySelector('#pr-enviar').addEventListener('click',()=>procesar(true));
}

if(typeof document!=='undefined'){
  const entradaProfesor=document.getElementById('um-profesor');
  if(entradaProfesor)entradaProfesor.addEventListener('click',()=>umGo(openEspacioProfesor));
}
