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
  // Lista blanca: nunca aceptar un estado de publicación, marcas de pago ni
  // datos académicos del estudiante enviados junto con el formulario.
  return {ok:true,datos:{tenant,ramos_siglas:siglas,
    criterios:{promedioMenorA:entrada.criterios.promedioMenorA,avanceMinimo:entrada.criterios.avanceMinimo},
    modalidad,ubicacion,precio_clp:entrada.precio_clp,titulo,descripcion,contacto_tipo,contacto_valor}};
}

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
async function openEspacioProfesor(){
  const raiz=document.getElementById('modal-content');
  raiz.innerHTML='<div class="modal-title" id="modal-titulo">Espacio de profesor</div><p class="profesor-info" role="status">Revisando tu acceso…</p>';
  openModal();
  const ficha=await perfilProfesorActual();
  if(!ficha.ok){raiz.innerHTML=`<div class="modal-title" id="modal-titulo">Espacio de profesor</div><p class="profesor-info" role="alert">${esc(ficha.error)}</p>`;return;}
  if(!ficha.perfil){renderPostulacionProfesor(raiz);return;}
  if(ficha.perfil.estado!=='aprobado'){
    const avisos={pendiente:'Tu postulación está esperando revisión. Todavía no puedes ofrecer clases.',rechazado:'Tu postulación no fue aprobada. Puedes escribirnos desde Sugerencias para revisar el motivo.',suspendido:'Tu acceso de profesor está suspendido. Tus notas como estudiante siguen disponibles.'};
    raiz.innerHTML=`<div class="modal-title" id="modal-titulo">Espacio de profesor</div><p class="profesor-info" role="status">${esc(avisos[ficha.perfil.estado]||'Tu perfil necesita revisión.')}</p>`;
    return;
  }
  const borrador=await abrirBorradorClase();
  if(!borrador.ok){raiz.innerHTML=`<div class="modal-title" id="modal-titulo">Espacio de profesor</div><p class="profesor-info" role="alert">${esc(borrador.error)}</p>`;return;}
  if(!borrador.anuncio){
    try{
      const {data,error}=await supabaseClient.from('tutor_anuncios').select('id,titulo,estado')
        .eq('estado','en_revision').order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(error)throw error;
      if(data){raiz.innerHTML=`<div class="modal-title" id="modal-titulo">Espacio de profesor</div><p class="profesor-info" role="status">Tu anuncio ${esc(data.titulo||'')} está en revisión. No se publica hasta que GradeHub lo apruebe.</p>`;return;}
    }catch(e){raiz.innerHTML='<div class="modal-title" id="modal-titulo">Espacio de profesor</div><p class="profesor-info" role="alert">No pudimos consultar tus anuncios. Intenta de nuevo.</p>';return;}
  }
  renderBorradorProfesor(raiz,borrador.anuncio);
}

function renderPostulacionProfesor(raiz){
  raiz.innerHTML=`<div class="modal-title" id="modal-titulo">Postula para ofrecer clases</div>
    <p class="profesor-info">Tu cuenta de estudiante sigue igual. Un miembro de nuestro equipo revisará tu postulación antes de que puedas preparar anuncios.</p>
    <form class="profesor-form" id="profesor-postular">
      <label class="modal-label" for="profesor-nombre">Nombre público</label><input id="profesor-nombre" type="text" maxlength="100" minlength="2" required autocomplete="name">
      <label class="modal-label" for="profesor-presentacion">Qué ramos enseñas y qué experiencia tienes</label><textarea id="profesor-presentacion" minlength="20" maxlength="1500" required></textarea>
      <p class="profesor-info">Nadie verá tus notas. Cada anuncio que prepares necesitará otra aprobación.</p>
      <button class="btn-confirm" type="submit">Enviar postulación</button><p class="profesor-estado" role="status" aria-live="polite"></p>
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
    if(resultado.ok){raiz.innerHTML='<div class="modal-title" id="modal-titulo">Postulación enviada</div><p class="profesor-info" role="status">Quedó pendiente de revisión. Aún no puedes publicar clases; vuelve a este espacio para ver su estado.</p>';return;}
    estado.textContent=resultado.error;boton.disabled=false;enviando=false;
    if(resultado.campo)form.querySelector(resultado.campo==='nombre'?'#profesor-nombre':'#profesor-presentacion').focus();
  });
}

function renderBorradorProfesor(raiz,anuncio){
  let id=anuncio&&anuncio.id||null,flyerActual=anuncio&&anuncio.flyer_path||null;
  const valor=(campo,defecto='')=>esc(anuncio&&anuncio[campo]!=null?anuncio[campo]:defecto);
  const elegir=(opciones,actual)=>opciones.map(([clave,texto])=>`<option value="${clave}"${actual===clave?' selected':''}>${texto}</option>`).join('');
  raiz.innerHTML=`<div class="modal-title" id="modal-titulo">${id?'Edita tu borrador':'Prepara tu clase'}</div>
    <p class="profesor-info">Nada se publica al guardar. Completa tu clase, revisa el público y luego envíala a revisión.</p>
    <form class="profesor-form" id="profesor-borrador">
      <h3>1. Tu clase</h3>
      <label class="modal-label" for="pr-titulo">Título del anuncio</label><input id="pr-titulo" type="text" minlength="5" maxlength="90" required value="${valor('titulo')}">
      <label class="modal-label" for="pr-descripcion">Qué van a trabajar</label><textarea id="pr-descripcion" minlength="20" maxlength="1500" required>${valor('descripcion')}</textarea>
      <label class="modal-label" for="pr-precio">Precio por clase · CLP</label><input id="pr-precio" type="number" min="1000" max="500000" step="1" required value="${valor('precio_clp')}">
      <label class="modal-label" for="pr-modalidad">Formato</label><select id="pr-modalidad">${elegir([['individual','Individual'],['grupal','Grupal']],anuncio&&anuncio.modalidad)}</select>
      <label class="modal-label" for="pr-ubicacion">Dónde</label><select id="pr-ubicacion">${elegir([['online','Online'],['presencial','Presencial'],['hibrido','Híbrido']],anuncio&&anuncio.ubicacion)}</select>
      <label class="modal-label" for="pr-contacto-tipo">Cómo te contactarán</label><select id="pr-contacto-tipo">${elegir([['whatsapp','WhatsApp'],['instagram','Instagram'],['email','Correo']],anuncio&&anuncio.contacto_tipo)}</select>
      <label class="modal-label" for="pr-contacto">Tu contacto</label><input id="pr-contacto" type="text" minlength="3" maxlength="160" required value="${valor('contacto_valor')}">
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
      titulo:campo('titulo').value,descripcion:campo('descripcion').value,precio_clp:Number(campo('precio').value),
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
