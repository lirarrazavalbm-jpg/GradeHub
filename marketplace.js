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

// Columnas que llegaron después, en capas y en el orden en que se aplicaron:
// formato y lugar "otra" con detalles a medida, y después qué datos van bajo
// el título. El SQL se aplica a mano, así que la app puede salir antes que él:
// si el servidor dice que falta una columna, la consulta se repite sin la
// última capa y el catálogo, el panel y los borradores siguen andando. Se
// recuerda para no pedirlas de nuevo en cada consulta.
// La tercera capa (2026-09-30): pack de clases, que escribe el profesor, y el
// descuento por venir de GradeHub, que solo fija GradeHub al aprobar.
const CAPAS_CAMPOS_CLASE=[',modalidad_otra,ubicacion_otra,detalles',',linea_datos',',pack_clases,descuento_gradehub_pct'];
let capasColumnasClase=CAPAS_CAMPOS_CLASE.length;
function faltaColumnaClase(error){
  return !!error&&(error.code==='42703'||error.code==='PGRST204'||/column|columna/i.test(String(error.message||'')));
}
async function consultaCamposClase(hacer,base){
  for(;;){
    const capas=capasColumnasClase;
    const r=await hacer(base+CAPAS_CAMPOS_CLASE.slice(0,capas).join(''));
    if(capas===0||!faltaColumnaClase(r&&r.error))return r;
    // Dos consultas a la vez no bajan dos capas por la misma columna.
    capasColumnasClase=Math.min(capasColumnasClase,capas-1);
  }
}
// Hasta dos ramos por anuncio desde el 2026-09-26 (decisión de Lucas): la
// misma clase puede servir a dos siglas, como Dinámica ICE1514 y FIS1514.
const MAX_RAMOS_POR_ANUNCIO=2;
const MAX_DETALLES_CLASE=4,MAX_ETIQUETA_DETALLE=30,MAX_VALOR_DETALLE=80;
const MIN_PACK_CLASES=2,MAX_PACK_CLASES=20;
// Bajo el título de la recomendación caben pocos datos: el profesor elige
// hasta tres. Sin elección son los de siempre.
const MAX_LINEA_CLASE=3,LINEA_CLASE_POR_OMISION=['modalidad','ubicacion','precio'];
const MODALIDADES_CLASE=[['individual','Individual'],['grupal','Grupal']];
const UBICACIONES_CLASE=[['online','Online'],['presencial','Presencial'],['hibrido','Híbrida']];

// Un borrador en Supabase es una clase COMPLETA, todavía no un formulario a
// medio escribir: la tabla exige estos campos. No se añade nada a gradehub_v1.
// El nombre de un ramo sin la sigla entre paréntesis: "Dinámica (ICE1514)" y
// "Dinámica" son el mismo ramo para quien lee el anuncio.
function nombreBaseRamoClase(nombre){return String(nombre||'').replace(/\s*\([^)]*\)\s*$/,'').trim();}
function mismoRamoClase(a,b){
  const n=x=>nombreBaseRamoClase(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return !!n(a)&&n(a)===n(b);
}
const ERROR_DOS_RAMOS_CLASE='Dos siglas solo se juntan si son el mismo ramo, como Dinámica ICE1514 y FIS1514. Si enseñas otro ramo, arma otro anuncio.';
function validarBorradorClase(entrada,nombresPorSigla){
  if(!entrada||typeof entrada!=='object'||Array.isArray(entrada))return {ok:false,campo:'clase',error:'Completa los datos de tu clase.'};
  const tenant=String(entrada.tenant||'').trim();
  if(!['uc','fen','uai','uandes'].includes(tenant))return {ok:false,campo:'tenant',error:'Elige una universidad.'};
  const titulo=String(entrada.titulo||'').trim();
  if(titulo.length<5||titulo.length>90)return {ok:false,campo:'titulo',error:'Ponle un título de 5 a 90 caracteres.'};
  const descripcion=String(entrada.descripcion||'').trim();
  if(descripcion.length<20||descripcion.length>1500)return {ok:false,campo:'descripcion',error:'Cuenta qué harás en la clase (20 a 1500 caracteres).'};
  const siglas=Array.isArray(entrada.ramos_siglas)?entrada.ramos_siglas.map(s=>String(s||'').trim().toUpperCase()):[];
  // Un ramo por anuncio (decisión de Lucas del 2026-09-25), con una
  // excepción desde el 2026-09-26: dos siglas del MISMO ramo, como Dinámica
  // ICE1514 y FIS1514. Dos ramos distintos siguen siendo dos anuncios. La base
  // exige uno o dos con un trigger; que sean el mismo ramo lo revisa esta
  // validación y quien aprueba, porque la base no conoce los nombres.
  if(siglas.length<1||siglas.some(s=>!/^[A-Z0-9-]{2,24}$/.test(s)))
    return {ok:false,campo:'ramos_siglas',error:'Elige el ramo de tu clase.'};
  if(siglas.length>MAX_RAMOS_POR_ANUNCIO||new Set(siglas).size!==siglas.length)
    return {ok:false,campo:'ramos_siglas',error:'Un anuncio puede tener hasta dos ramos. Si enseñas más, arma otro anuncio.'};
  if(siglas.length===2){
    const nombres=nombresPorSigla||nombresRamosParaClases(entrada.tenant);
    if(!mismoRamoClase(nombres[siglas[0]],nombres[siglas[1]]))return {ok:false,campo:'ramos_siglas',error:ERROR_DOS_RAMOS_CLASE};
  }
  if(!criteriosClaseValidos(entrada.criterios))return {ok:false,campo:'criterios',error:'Revisa el promedio y el avance elegidos para tu público.'};
  // Formato y lugar son opcionales. "Otra" exige escribirla: una opción
  // elegida sin texto se mostraría como nada.
  const opcion=(valor,validas,texto,campo,nombre)=>{
    const v=String(valor||'');
    if(!v)return {ok:true,valor:null,otra:null};
    if(v==='otra'){
      const t=String(texto||'').trim();
      if(t.length<2||t.length>40)return {ok:false,campo:campo+'_otra',error:`Escribe ${nombre} en 2 a 40 caracteres.`};
      return {ok:true,valor:'otra',otra:t};
    }
    return validas.includes(v)?{ok:true,valor:v,otra:null}:{ok:false,campo,error:`Revisa ${nombre}.`};
  };
  const mod=opcion(entrada.modalidad,MODALIDADES_CLASE.map(o=>o[0]),entrada.modalidad_otra,'modalidad','el formato');
  if(!mod.ok)return mod;
  const ubi=opcion(entrada.ubicacion,UBICACIONES_CLASE.map(o=>o[0]),entrada.ubicacion_otra,'ubicacion','dónde es la clase');
  if(!ubi.ok)return ubi;
  const detallesCrudos=entrada.detalles==null?[]:entrada.detalles;
  if(!Array.isArray(detallesCrudos))return {ok:false,campo:'detalles',error:'Revisa los detalles de tu clase.'};
  // Una fila sin nada escrito no es un detalle: es una casilla que quedó vacía.
  const detalles=detallesCrudos.map(d=>({etiqueta:String(d&&d.etiqueta||'').trim(),valor:String(d&&d.valor||'').trim()}))
    .filter(d=>d.etiqueta||d.valor);
  if(detalles.length>MAX_DETALLES_CLASE)return {ok:false,campo:'detalles',error:`Puedes agregar hasta ${MAX_DETALLES_CLASE} detalles.`};
  if(detalles.some(d=>!d.etiqueta||!d.valor))return {ok:false,campo:'detalles',error:'Cada detalle necesita un nombre y lo que dice, por ejemplo "Duración: 90 minutos".'};
  if(detalles.some(d=>d.etiqueta.length>MAX_ETIQUETA_DETALLE||d.valor.length>MAX_VALOR_DETALLE))
    return {ok:false,campo:'detalles',error:`Cada detalle va con un nombre de hasta ${MAX_ETIQUETA_DETALLE} caracteres y un texto de hasta ${MAX_VALOR_DETALLE}.`};
  const modalidad=mod.valor,ubicacion=ubi.valor;
  let linea_datos=null;
  if(entrada.linea_datos!=null){
    const validas=new Set([...LINEA_CLASE_POR_OMISION,...detalles.map(d=>'detalle:'+d.etiqueta)]);
    const claves=Array.isArray(entrada.linea_datos)?[...new Set(entrada.linea_datos.map(x=>String(x||'').trim()))]:[];
    if(claves.length<1||claves.length>MAX_LINEA_CLASE||claves.some(c=>!validas.has(c)))
      return {ok:false,campo:'linea_datos',error:`Elige de 1 a ${MAX_LINEA_CLASE} datos para mostrar bajo el título.`};
    linea_datos=claves;
  }
  // Pack: el precio sigue siendo POR CLASE y el pack solo dice cuántas trae.
  // Vacío = sin pack. Una clase gratis no se vende en pack.
  let pack_clases=null;
  if(entrada.pack_clases!==null&&entrada.pack_clases!==undefined&&entrada.pack_clases!==''){
    const n=Number(entrada.pack_clases);
    if(!Number.isSafeInteger(n)||n<MIN_PACK_CLASES||n>MAX_PACK_CLASES)
      return {ok:false,campo:'pack_clases',error:`Un pack trae entre ${MIN_PACK_CLASES} y ${MAX_PACK_CLASES} clases. Déjalo vacío si cobras por clase.`};
    if(entrada.precio_clp===0)return {ok:false,campo:'pack_clases',error:'Una clase gratis no se vende en pack. Deja vacío el pack.'};
    pack_clases=n;
  }
  // $0 es una clase gratis (pedido de Lucas del 2026-09-25). Entre $1 y $999
  // no hay clase que valga eso: casi siempre es un precio a medio escribir.
  if(!Number.isSafeInteger(entrada.precio_clp)||!(entrada.precio_clp===0||(entrada.precio_clp>=1000&&entrada.precio_clp<=500000)))
    return {ok:false,campo:'precio_clp',error:'Indica el precio de la clase entre $1.000 y $500.000, o $0 si es gratis.'};
  const contacto_tipo=String(entrada.contacto_tipo||''),contacto_valor=String(entrada.contacto_valor||'').trim();
  // WhatsApp desde el 2026-09-25 (decisión de Lucas): es el canal que usan
  // todos y el único que abre con el mensaje escrito. El número no se muestra;
  // el estudiante llega por el botón y así el contacto se mide. Una clase
  // GRATIS puede, además, llevar a un Instagram o a un link de inscripción.
  if(!contactosPermitidosClase(entrada.precio_clp).includes(contacto_tipo))
    return {ok:false,campo:'contacto_valor',error:entrada.precio_clp===0
      ?'Elige cómo te contactarán: WhatsApp, Instagram o un link de inscripción.'
      :'Las clases pagadas se contactan por WhatsApp. Escribe tu número.'};
  if(contacto_valor.length<3||contacto_valor.length>160)return {ok:false,campo:'contacto_valor',error:'Revisa el dato de contacto.'};
  // El formulario rellena "+56 " o "@" solo: sin esta comprobación el prefijo
  // solo, sin número ni usuario, pasaba como contacto válido y el anuncio
  // llegaba a revisión con un botón que no lleva a ninguna parte.
  if(!enlaceContactoClase(contacto_tipo,contacto_valor))return {ok:false,campo:'contacto_valor',error:ERROR_CONTACTO_CLASE[contacto_tipo]};
  // Lista blanca: nunca aceptar un estado de publicación, marcas de pago ni
  // datos académicos del estudiante enviados junto con el formulario.
  return {ok:true,datos:{tenant,ramos_siglas:siglas,
    criterios:{promedioMenorA:entrada.criterios.promedioMenorA,avanceMinimo:entrada.criterios.avanceMinimo},
    modalidad,ubicacion,modalidad_otra:mod.otra,ubicacion_otra:ubi.otra,detalles:detalles.length?detalles:null,linea_datos,
    precio_clp:entrada.precio_clp,pack_clases,titulo,descripcion,contacto_tipo,contacto_valor}};
}

const ERROR_CONTACTO_CLASE={
  whatsapp:'Escribe tu número de WhatsApp completo, por ejemplo +56 9 1234 5678.',
  instagram:'Escribe tu usuario de Instagram, por ejemplo @salvaramos.',
  enlace:'Pega el link de inscripción completo, que empiece con https://.',
};
// Qué contactos admite una clase según su precio. El servidor exige lo mismo.
const CONTACTOS_CLASE=[['whatsapp','WhatsApp'],['instagram','Instagram'],['enlace','Link de inscripción']];
function contactosPermitidosClase(precio){return precio===0?['whatsapp','instagram','enlace']:['whatsapp'];}

// ─── CAMPOS QUE SE ESCRIBEN CON FORMATO ─────────────────────────────────────
//
// Un monto en pesos se ve como se lee: al escribir 15000 aparece $15.000. El
// campo guarda texto y `pesosDeTexto` devuelve el número; por eso es un
// input de texto con teclado numérico y no `type=number`, que no acepta ni el
// signo ni los puntos.
function textoPesosEscrito(texto){
  const digitos=String(texto??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0,9);
  return digitos?'$'+digitos.replace(/\B(?=(\d{3})+(?!\d))/g,'.'):'';
}
function pesosDeTexto(texto){
  const digitos=String(texto||'').replace(/\D/g,'');
  return digitos?Number(digitos):NaN;
}

// WhatsApp de Chile con sus espacios: "+56 9 1234 5678". Solo se ordena un
// celular chileno; un número de otro país se deja tal como lo escribieron.
//
// El campo parte con "+56 " y NO con "+56 9 ": con el 9 ya puesto, quien
// escribía su número como lo dice ("9 1234 5678") quedaba con un 9 de más, y
// esta función además cortaba en 8 dígitos, así que el último se perdía sin
// aviso. Así se publicó un anuncio cuyo botón abría el chat de un número que no
// era (2026-09-28). Ahora no se corta nada: lo que sobra queda a la vista y la
// validación lo rechaza.
function textoWhatsappEscrito(texto){
  const t=String(texto||'');
  if(!/^\s*\+?\s*56/.test(t))return t;
  const resto=t.replace(/\D/g,'').slice(2);
  if(!resto.startsWith('9'))return t;
  const cel=resto.slice(1);
  return '+56 9 '+(cel.length>4?cel.slice(0,4)+' '+cel.slice(4):cel);
}
// Un número de Chile tiene 9 dígitos después del 56. Uno con el código de país
// y un dígito de más o de menos, o un celular sin el 56 ("9 1234 5678", que
// wa.me leería como de otro país), se puede escribir y guardar en el borrador,
// pero no se envía a revisión: ver enviarBorradorClase.
const ERROR_WHATSAPP_CHILE='Revisa tu número: después del +56 van 9 dígitos, por ejemplo +56 9 1234 5678.';
function whatsappChilenoCompleto(valor){
  const d=String(valor||'').replace(/\D/g,'');
  if(d.startsWith('56'))return d.length===11;
  return !(d.length===9&&d.startsWith('9'));
}
function contactoListoParaPublicar(datos){
  if(datos&&datos.contacto_tipo==='whatsapp'&&!whatsappChilenoCompleto(datos.contacto_valor))
    return {ok:false,campo:'contacto_valor',error:ERROR_WHATSAPP_CHILE};
  return {ok:true};
}
function textoInstagramEscrito(texto){
  const t=String(texto||'').replace(/\s+/g,'');
  return t&&!t.startsWith('@')?'@'+t:t;
}
const PREFIJO_CONTACTO_CLASE={whatsapp:'+56 ',instagram:'@',enlace:'https://'};
const EJEMPLO_CONTACTO_CLASE={whatsapp:'+56 9 1234 5678',instagram:'@salvaramos',enlace:'https://forms.gle/…'};

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
    // El logo llegó después: sin su SQL aplicado se pide la ficha de siempre.
    const pedir=campos=>supabaseClient.from('tutor_perfiles').select(campos).eq('user_id',uid).maybeSingle();
    let {data,error}=await pedir('nombre_publico,presentacion,estado,solicitado_at,revisado_at,logo_id,logo_path,logo_aprobado_path');
    if(faltaColumnaClase(error))({data,error}=await pedir('nombre_publico,presentacion,estado,solicitado_at,revisado_at'));
    // El motivo real queda en la consola. El 2026-09-25 un SQL pegado a medias
    // dejó sin permiso de lectura la ficha, y la pantalla solo decía "todavía
    // no está disponible": un "permission denied" acá lo habría dicho al tiro.
    if(error){console.warn('No se pudo leer la ficha de profesor:',error.code||'',error.message||error);
      return {ok:false,error:'El espacio de profesor todavía no está disponible. Tus notas no se han tocado.'};}
    return {ok:true,perfil:data||null};
  }catch(e){console.warn('No se pudo leer la ficha de profesor:',e);return {ok:false,error:'El espacio de profesor todavía no está disponible. Tus notas no se han tocado.'};}
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
    const {data,error}=await consultaCamposClase(campos=>{
      let consulta=supabaseClient.from('tutor_anuncios').select(campos).eq('estado','borrador');
      consulta=id?consulta.eq('id',id):consulta.order('created_at',{ascending:false}).limit(1);
      return consulta.maybeSingle();
    },CAMPOS_BORRADOR_CLASE);
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
    const escribir=async campos=>{
      const datos={...valido.datos};
      if(!campos.includes('pack_clases')){
        if(datos.pack_clases)return {data:null,error:{message:'sin-pack'}};
        delete datos.pack_clases;
      }
      if(!campos.includes('linea_datos')){
        if(datos.linea_datos)return {data:null,error:{message:'sin-linea-datos'}};
        delete datos.linea_datos;
      }
      if(!campos.includes('detalles')){
        // El servidor todavía no tiene estas columnas: lo clásico se guarda
        // igual, y lo nuevo se avisa en vez de perderse callado.
        if(datos.modalidad==='otra'||datos.ubicacion==='otra'||datos.detalles||datos.modalidad===null||datos.ubicacion===null)
          return {data:null,error:{message:'sin-columnas-nuevas'}};
        delete datos.modalidad_otra;delete datos.ubicacion_otra;delete datos.detalles;
      }
      const consulta=id
        ?supabaseClient.from('tutor_anuncios').update(datos).eq('id',id).eq('estado','borrador')
        :supabaseClient.from('tutor_anuncios').insert({...datos,autor_id:uid});
      return consulta.select(campos).single();
    };
    const {data,error}=await consultaCamposClase(escribir,CAMPOS_BORRADOR_CLASE);
    // Sin el SQL que acepta $0, el servidor rechaza la clase gratis por su
    // restricción de precio: se dice eso y no "revisa tu conexión".
    if(error&&error.code==='23514'&&valido.datos.precio_clp===0)return {ok:false,campo:'precio_clp',error:'Todavía no podemos guardar clases gratis. Pon un precio por ahora.'};
    if(error&&error.message==='sin-pack')return {ok:false,campo:'pack_clases',error:'Todavía no podemos guardar packs. Deja vacío el pack y pon el precio por clase por ahora.'};
    if(error&&error.message==='sin-linea-datos')return {ok:false,campo:'linea_datos',error:'Todavía no podemos guardar qué datos van bajo el título. Deja formato, dónde y precio por ahora.'};
    if(error&&error.message==='sin-columnas-nuevas')return {ok:false,campo:'detalles',error:'Todavía no podemos guardar "Otra", un formato vacío ni detalles a medida. Usa las opciones de la lista por ahora.'};
    if(error||!data||data.estado!=='borrador'){
      // El motivo real queda en la consola: "revisa tu conexión" también sale
      // cuando el servidor rechaza, y sin esto hay que ir a buscarlo a mano.
      if(error)console.warn('No se guardó el borrador:',error.code||'',error.message||error);
      return {ok:false,error:error&&error.code==='42501'
        ?'No pudimos guardar: falta un permiso en el servidor. Tu borrador anterior sigue ahí.'
        :'No se guardó el borrador. Revisa tu conexión e intenta de nuevo.'};
    }
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
  // El borrador se guarda con el número como esté; lo que no pasa es a
  // revisión. Así el profesor tiene que mirar un número mal escrito antes de
  // que un estudiante le escriba a otra persona (decisión de Lucas, 2026-09-28).
  const listo=contactoListoParaPublicar(valido.datos);
  if(!listo.ok)return listo;
  const campana=await leerCampanaClase(id,{diagnostico:true});
  if(!campana?.sqlAnterior&&(!campana||!validarCampanaClase(campana).ok))
    return {ok:false,error:'No se envió: primero guarda los días, la fecha y el tope de la campaña. Tu borrador sigue disponible.'};
  try{
    const {data,error}=await supabaseClient.from('tutor_anuncios')
      .update({estado:'en_revision'}).eq('id',id).eq('estado','borrador')
      .select('id,estado').single();
    if(error||!data||data.estado!=='en_revision')return {ok:false,error:'No se envió a revisión. Tu borrador sigue disponible.'};
    return {ok:true,anuncio:data,sqlAnterior:!!campana?.sqlAnterior};
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

// ─── LOGO DEL PROFESOR ──────────────────────────────────────────────────────
//
// Uno por profesor, en todos sus anuncios. Desde el 2026-09-25 se muestra al
// tiro, sin revisión (lo resuelve un trigger en el servidor). El estado "en
// revisión" se mantiene por si se vuelve a revisar, o si el SQL no está al día.
// Mismas reglas de archivo que el flyer: JPG, PNG o WebP ≤ 5 MB.
function estadoLogoProfesor(perfil){
  if(!perfil||!('logo_id' in perfil))return 'no-disponible';
  if(perfil.logo_path&&perfil.logo_path!==perfil.logo_aprobado_path)return 'en-revision';
  return perfil.logo_aprobado_path?'aprobado':'sin-logo';
}

// Logos sin fondo. Un PNG o WebP transparente se muestra tal cual, sin marco.
// El riesgo es el contraste: un logo verde oscuro sin fondo desaparece en el
// tema oscuro. Al cargar se mira la imagen en chico y, solo si es transparente
// y no se leería sobre el fondo que tiene detrás, se le dibuja un contorno
// claro: sigue sin fondo, como lo subió el profesor.
// Un logo con fondo propio (un JPG) no se toca.
function imgLogoClase(url,extra=''){
  return `<img class="logo-clase" src="${esc(url)}" alt="" crossorigin="anonymous"${extra}>`;
}
function luminanciaClase(r,g,b){
  const c=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};
  return .2126*c(r)+.7152*c(g)+.0722*c(b);
}
// El color de fondo real detrás del logo: el primer antepasado que no es
// transparente. Chrome devuelve color-mix() como color(srgb …), en 0–1.
function fondoDetrasClase(el){
  for(let n=el;n&&n.nodeType===1;n=n.parentElement){
    const bg=String(getComputedStyle(n).backgroundColor||'');
    const nums=(bg.match(/-?[\d.]+/g)||[]).map(Number);
    if(nums.length<3)continue;
    const srgb=/^color\(/.test(bg),alfa=nums.length>3?nums[3]:1;
    if(alfa<.5)continue;
    const [r,g,b]=srgb?nums.slice(0,3).map(v=>v*255):nums.slice(0,3);
    return luminanciaClase(r,g,b);
  }
  return 1;
}
function revisarLogoClase(img){
  const caja=img.parentElement;
  if(!caja||!img.naturalWidth||img.dataset.contorno==='1')return;
  let px;
  try{
    const lado=24,canvas=document.createElement('canvas');canvas.width=canvas.height=lado;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0,lado,lado);px=ctx.getImageData(0,0,lado,lado).data;
  }catch(e){return;}
  let transparentes=0,suma=0,visibles=0;
  for(let k=0;k<px.length;k+=4){
    if(px[k+3]<200){transparentes++;continue;}
    suma+=luminanciaClase(px[k],px[k+1],px[k+2]);visibles++;
  }
  caja.classList.remove('logo-contorno');
  if(!visibles||transparentes/(px.length/4)<.1)return;
  const logo=suma/visibles,fondo=fondoDetrasClase(caja);
  if((Math.max(logo,fondo)+.05)/(Math.min(logo,fondo)+.05)<2)dibujarContornoLogoClase(img,caja);
}
// El contorno se dibuja en un canvas y el logo pasa a ser esa imagen. Antes
// era un `filter: drop-shadow` de 0,8px encadenado: Chrome lo dibujaba nítido
// y Safari (Mac y iPhone) como un halo borroso que dejaba el logo casi
// ilegible (2026-09-26, logo de SalvaRamos). Pintado a mano se ve igual en
// todos los navegadores: un borde fino del color del texto y un halo suave.
function dibujarContornoLogoClase(img,caja){
  if(img.dataset.contorno==='1')return;
  try{
    const dpr=Math.min(3,Math.max(1,(typeof devicePixelRatio==='number'&&devicePixelRatio)||1));
    const alto=Math.max(24,caja.clientHeight||44)*dpr;
    const esc=alto/img.naturalHeight,w=Math.max(1,Math.round(img.naturalWidth*esc)),h=Math.max(1,Math.round(alto));
    const borde=1.2*dpr,halo=3.5*dpr,pad=Math.ceil(halo+1);
    const color=String(getComputedStyle(caja).getPropertyValue('--fg')||'').trim()||'#f1f1f3';
    // La silueta del logo en el color del texto.
    const sil=document.createElement('canvas');sil.width=w;sil.height=h;
    const cs=sil.getContext('2d');cs.drawImage(img,0,0,w,h);
    cs.globalCompositeOperation='source-in';cs.fillStyle=color;cs.fillRect(0,0,w,h);
    const out=document.createElement('canvas');out.width=w+2*pad;out.height=h+2*pad;
    const co=out.getContext('2d');
    // Halo suave: la silueta corrida en un anillo ancho, casi transparente.
    co.globalAlpha=.07;
    for(let k=0;k<24;k++){const a=k/24*2*Math.PI;co.drawImage(sil,pad+Math.cos(a)*halo,pad+Math.sin(a)*halo);}
    // Borde fino y opaco.
    co.globalAlpha=1;
    for(let k=0;k<16;k++){const a=k/16*2*Math.PI;co.drawImage(sil,pad+Math.cos(a)*borde,pad+Math.sin(a)*borde);}
    co.drawImage(img,pad,pad,w,h);
    img.dataset.contorno='1';
    img.src=out.toDataURL('image/png');
    caja.classList.add('logo-contorno');
  }catch(e){}
}
if(typeof document!=='undefined'&&typeof document.addEventListener==='function'){
  // load y error no burbujean: se escuchan en captura para todos los logos.
  document.addEventListener('load',e=>{
    const img=e.target;if(img&&img.classList&&img.classList.contains('logo-clase'))revisarLogoClase(img);
  },true);
  // Si el almacenamiento no respondiera con CORS, la imagen se carga igual,
  // sin revisión de contraste: nunca un logo roto por esto.
  document.addEventListener('error',e=>{
    const img=e.target;
    if(img&&img.classList&&img.classList.contains('logo-clase')&&img.hasAttribute('crossorigin')){const src=img.src;img.removeAttribute('crossorigin');img.src=src;}
  },true);
}

async function subirLogoProfesor(file){
  const valido=validarFlyerClase(file);
  if(!valido.ok)return {ok:false,error:valido.error.replace(/flyer/gi,'logo')};
  if(valido.opcional)return {ok:false,error:'Elige una imagen para tu logo.'};
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para subir tu logo.'};
  const ficha=await perfilProfesorActual();
  if(!ficha.ok||!ficha.perfil)return {ok:false,error:'No pudimos leer tu ficha de profesor.'};
  const logoId=String(ficha.perfil.logo_id||'');
  if(!/^[0-9a-f-]{36}$/i.test(logoId))return {ok:false,error:'Los logos todavía no están disponibles.'};
  const aleatorio=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'';
  if(!aleatorio)return {ok:false,error:'Tu navegador no pudo preparar un nombre seguro para el logo.'};
  const path=`logos/${logoId}/${aleatorio}.${extensionFlyerClase(file.type)}`;
  try{
    const {error:subidaError}=await supabaseClient.storage.from('tutor-flyers').upload(path,file,{contentType:file.type,upsert:false});
    if(subidaError)return {ok:false,error:'No pudimos subir el logo. Intenta de nuevo.'};
    const {data,error}=await supabaseClient.from('tutor_perfiles').update({logo_path:path})
      .eq('user_id',uid).select('logo_path,logo_aprobado_path').single();
    if(error||!data||data.logo_path!==path){
      await supabaseClient.storage.from('tutor-flyers').remove([path]);
      return {ok:false,error:'El logo subió, pero no pudimos guardarlo en tu ficha. Intenta de nuevo.'};
    }
    // Lo que ya no se muestra sobra. Sin revisión el servidor iguala las dos
    // columnas al tiro, así que el logo anterior también se va. Si algún día
    // se vuelve a revisar, el que se sigue mostrando se conserva.
    const enUso=new Set([path,data.logo_aprobado_path].filter(Boolean));
    const sobran=[...new Set([ficha.perfil.logo_path,ficha.perfil.logo_aprobado_path].filter(r=>r&&!enUso.has(r)))];
    if(sobran.length)try{await supabaseClient.storage.from('tutor-flyers').remove(sobran);}catch(e){}
    return {ok:true,perfil:{...ficha.perfil,...data}};
  }catch(e){return {ok:false,error:'No pudimos subir el logo. Intenta de nuevo.'};}
}

async function quitarLogoProfesor(){
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para quitar tu logo.'};
  const ficha=await perfilProfesorActual();
  if(!ficha.ok||!ficha.perfil)return {ok:false,error:'No pudimos leer tu ficha de profesor.'};
  try{
    const {error}=await supabaseClient.rpc('quitar_mi_logo');
    if(error)return {ok:false,error:'No pudimos quitar el logo. Intenta de nuevo.'};
    // Ya no se muestra en ninguna parte aunque falle la limpieza de Storage.
    const rutas=[ficha.perfil.logo_path,ficha.perfil.logo_aprobado_path].filter(Boolean);
    if(rutas.length)try{await supabaseClient.storage.from('tutor-flyers').remove([...new Set(rutas)]);}catch(e){}
    return {ok:true};
  }catch(e){return {ok:false,error:'No pudimos quitar el logo. Intenta de nuevo.'};}
}

// Logos aprobados de los anuncios del catálogo, por id de anuncio. El
// catálogo no conoce al autor de cada anuncio y no tiene por qué conocerlo.
async function logosDeAnuncios(ids){
  const lista=[...new Set((ids||[]).filter(id=>/^[0-9a-f-]{36}$/i.test(String(id))))].slice(0,100);
  if(!supabaseClient||!lista.length)return new Map();
  try{
    const {data,error}=await supabaseClient.rpc('logos_de_anuncios',{p_ids:lista});
    if(error||!Array.isArray(data))return new Map();
    return new Map(data.filter(f=>f&&f.anuncio_id&&f.logo_path).map(f=>[f.anuncio_id,f.logo_path]));
  }catch(e){return new Map();}
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
function seleccionarClaseApoyo(anuncios,ramos,tenant,{descartados=[],ahora=Date.now(),turno=0}={}){
  const propios=(Array.isArray(ramos)?ramos:[]).filter(r=>r&&r.origen&&r.origen.tenant===tenant);
  const omitidos=new Set(descartados);
  const disponibles=anunciosParaRamosLocales(anuncios,propios).filter(a=>
    a.tenant===tenant&&a.estado==='publicado'&&!omitidos.has(a.id)&&
    (a.vence_at==null||Date.parse(a.vence_at)>ahora)&&criteriosClaseValidos(a.criterios));
  // El orden de ramos que eligió la persona manda. Si varios avisos calzan con
  // el mismo ramo, se alternan en cada apertura de la app: antes ganaba siempre
  // el publicado último, y un profesor con dos clases del mismo ramo casi no
  // veía la otra en Inicio (Salva Ramos, 2026-09-30). Se entrega como máximo
  // una tarjeta, sin escribir ninguna preferencia en S.
  for(const ramo of propios){
    const sigla=siglaRamoParaClases(ramo);
    const candidatos=disponibles.filter(a=>a.siglasCoincidentes.includes(sigla));
    if(!candidatos.length)continue;
    const cats=ramo.categorias||[];
    const total=cats.reduce((s,c)=>s+Number(c.peso||0),0);
    // Las evaluaciones del ramo suman 100 aunque tenga un laboratorio
    // vinculado: el motor combina ese `aporta` encima (Dinámica: 70% cátedra,
    // 30% laboratorio). Esperar 100 menos el laboratorio dejaba sin
    // recomendación a todo el que cursa Dinámica.
    if(!Number.isFinite(total)||Math.abs(total-100)>0.01||
      cats.some(c=>!Number.isFinite(Number(c.peso))||Number(c.peso)<0||c.lista))continue;
    const avance=ramoProgress(ramo);
    if(!Number.isFinite(avance.total)||avance.total<=0||!Number.isFinite(avance.pending)||avance.pending<=0)continue;
    // `pct` está redondeado para la pantalla: 19,9% no debe cumplir 20%.
    const evaluado=100*(avance.total-avance.pending)/avance.total;
    const promedio=ramoAvg(ramo,undefined,ramos);
    if(!Number.isFinite(promedio))continue;
    // Orden estable por id: la rotación no cambia porque llegue otro aviso a la lista.
    const calzan=candidatos.filter(a=>promedio<a.criterios.promedioMenorA&&evaluado+1e-9>=a.criterios.avanceMinimo)
      .sort((x,y)=>String(x.id)<String(y.id)?-1:String(x.id)>String(y.id)?1:0);
    if(calzan.length){
      const i=Number.isSafeInteger(turno)?((turno%calzan.length)+calzan.length)%calzan.length:0;
      return {anuncio:calzan[i],ramo};
    }
  }
  return null;
}

// ─── CAMPAÑAS: CUÁNTO CUESTA ────────────────────────────────────────────────
//
// Decidido por Lucas el 2026-09-25. Una campaña cuesta $100 por día visible,
// y por PERSONA: $10 si la vio, $50 si la abrió y $1.000 si contactó. Cada
// persona cuenta una vez por anuncio en cada cosa. El profesor pone un tope: es
// lo máximo que pagaría, y al llegar la clase deja de mostrarse. Filtrar por
// nota no cuesta más. El cobro es manual: se coordina antes de publicar y nunca pasa del tope.
//
// El servidor tiene la misma tarifa (tarifa_campana_clp) y es el que cuenta;
// esto solo arma la cuenta para mostrarla. Un test exige que coincidan.
const TARIFA_CAMPANA={dia:100,vista:10,apertura:50,contacto:1000};
const DIAS_CAMPANA_POR_OMISION=10,MAX_DIAS_CAMPANA=60,MIN_TOPE_CAMPANA=1000,MAX_TOPE_CAMPANA=5000000;
const TOPE_CAMPANA_POR_OMISION=10000;

// La fecha de hoy en Chile como AAAA-MM-DD: las campañas empiezan a medianoche
// de Chile, no de Londres.
function hoyChileClase(ahora=Date.now()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date(ahora));
}
function sumarDiasFechaClase(fecha,dias){
  const t=Date.parse(fecha+'T12:00:00Z');
  return Number.isFinite(t)?new Date(t+dias*864e5).toISOString().slice(0,10):'';
}
function diasEntreFechasClase(desde,hasta){
  const a=Date.parse(desde+'T12:00:00Z'),b=Date.parse(hasta+'T12:00:00Z');
  return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/864e5):NaN;
}

// Días, inicio (vacío = apenas se apruebe) y tope, como los guarda la base.
function validarCampanaClase(entrada,ahora=Date.now()){
  const e=entrada||{};
  const dias=Number(e.dias),tope=Number(e.tope_clp),inicio=String(e.inicio||'').trim();
  if(!Number.isSafeInteger(dias)||dias<1||dias>MAX_DIAS_CAMPANA)
    return {ok:false,campo:'dias',error:`La campaña dura entre 1 y ${MAX_DIAS_CAMPANA} días.`};
  if(inicio&&(!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!Number.isFinite(Date.parse(inicio+'T12:00:00Z'))))
    return {ok:false,campo:'inicio',error:'Revisa la fecha de inicio.'};
  if(inicio&&inicio<hoyChileClase(ahora))
    return {ok:false,campo:'inicio',error:'La fecha de inicio ya pasó. Déjala vacía para partir apenas la aprobemos.'};
  if(!Number.isSafeInteger(tope)||tope<MIN_TOPE_CAMPANA||tope>MAX_TOPE_CAMPANA)
    return {ok:false,campo:'tope',error:`Pon un tope entre ${pesosClase(MIN_TOPE_CAMPANA)} y ${pesosClase(MAX_TOPE_CAMPANA)}.`};
  return {ok:true,datos:{dias,inicio:inicio||null,tope_clp:tope}};
}

// La cuenta de una campaña, con cada concepto a la vista. `total` nunca pasa
// del tope: eso es lo que el profesor pagaría.
function costoCampanaClase(c){
  if(!c)return null;
  const n=k=>Number.isSafeInteger(c[k])&&c[k]>0?c[k]:0;
  const partes=[
    {clave:'vista',cantidad:n('vistas'),precio:TARIFA_CAMPANA.vista},
    {clave:'apertura',cantidad:n('aperturas'),precio:TARIFA_CAMPANA.apertura},
    {clave:'contacto',cantidad:n('contactos'),precio:TARIFA_CAMPANA.contacto},
    {clave:'dia',cantidad:n('dias_cobrados'),precio:TARIFA_CAMPANA.dia},
  ].map(p=>({...p,subtotal:p.cantidad*p.precio}));
  const bruto=partes.reduce((s,p)=>s+p.subtotal,0);
  const tope=Number.isSafeInteger(c.tope_clp)?c.tope_clp:null;
  return {partes,bruto,tope,total:tope===null?bruto:Math.min(bruto,tope),agotada:tope!==null&&bruto>=tope};
}
// "120 personas te vieron ($1.200) · 15 la abrieron ($750) · …"
function lineaCostoCampanaClase(costo){
  if(!costo)return '';
  const miles=x=>new Intl.NumberFormat('es-CL').format(x);
  const texto={
    vista:x=>`${miles(x)} ${x===1?'persona te vio':'personas te vieron'}`,
    apertura:x=>`${miles(x)} ${x===1?'la abrió':'la abrieron'}`,
    contacto:x=>`${miles(x)} ${x===1?'te contactó':'te contactaron'}`,
    dia:x=>`${miles(x)} ${x===1?'día':'días'} publicada`,
  };
  return costo.partes.map(p=>`${texto[p.clave](p.cantidad)} (${pesosClase(p.subtotal)})`).join(' · ');
}

// Pide solo el catálogo público de una universidad. No recibe `ramos` como
// parámetro ni lee S.ramos: esos datos nunca cruzan esta frontera de red.
async function cargarAnunciosClases(tenant,{propagarError=false}={}){
  const universidad=String(tenant||'').trim();
  if(!supabaseClient||!universidad){if(propagarError)throw new Error('Catálogo no disponible');return [];}
  const ahora=new Date().toISOString();
  try{
    const anuncios=[],vistos=new Set(),tamano=60;
    for(let desde=0;;desde+=tamano){
      const {data,error}=await consultaCamposClase(campos=>supabaseClient.from('tutor_anuncios')
        .select(campos).eq('tenant',universidad).eq('estado','publicado')
        .or(`vence_at.is.null,vence_at.gt.${ahora}`)
        .order('publicado_at',{ascending:false}).order('id',{ascending:true})
        .range(desde,desde+tamano-1),CAMPOS_PUBLICOS_ANUNCIO);
      if(error)throw error;
      const pagina=Array.isArray(data)?data:[];
      pagina.forEach(a=>{if(!vistos.has(a.id)){vistos.add(a.id);anuncios.push(a);}});
      if(pagina.length<tamano)return anuncios;
    }
  }catch(error){console.warn('No se pudieron cargar las clases particulares:',error.message||error);if(propagarError)throw error;return [];}
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
function enlaceContactoClase(tipo,valor,mensaje=''){
  const canal=String(tipo||''),dato=String(valor||'').trim();
  if(canal==='whatsapp'){
    const telefono=dato.replace(/\D/g,'');
    if(telefono.length<8||telefono.length>15)return '';
    const texto=String(mensaje||'').trim();
    return `https://wa.me/${telefono}`+(texto?`?text=${encodeURIComponent(texto)}`:'');
  }
  if(canal==='instagram'){
    const usuario=dato.replace(/^@/,'');
    return /^[A-Za-z0-9._]{1,30}$/.test(usuario)?`https://www.instagram.com/${usuario}/`:'';
  }
  // Un link de inscripción (Google Forms, por ejemplo): solo https, sin usuario
  // ni contraseña dentro, y se arma de nuevo con URL para no copiar a href un
  // texto que el navegador interprete de otra forma.
  if(canal==='enlace'){
    let u;try{u=new URL(dato);}catch(e){return '';}
    if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||u.href.length>160)return '';
    return u.href;
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

function textoOpcionClase(lista,valor,otra){
  return valor==='otra'?String(otra||'').trim():(new Map(lista).get(valor)||'');
}
function formatoClase(anuncio){
  const a=anuncio||{};
  return [textoOpcionClase(MODALIDADES_CLASE,a.modalidad,a.modalidad_otra),textoOpcionClase(UBICACIONES_CLASE,a.ubicacion,a.ubicacion_otra)]
    .filter(Boolean).join(' · ');
}
// Los detalles que el profesor agregó, ya validados por el servidor. Se vuelven
// a filtrar al mostrarlos: una fila rara no rompe la tarjeta.
function detallesClase(anuncio){
  const d=anuncio&&anuncio.detalles;
  return Array.isArray(d)?d.filter(x=>x&&typeof x.etiqueta==='string'&&typeof x.valor==='string'&&x.etiqueta.trim()&&x.valor.trim())
    .slice(0,MAX_DETALLES_CLASE):[];
}
// El precio de la clase como lo lee el estudiante: $0 es "Gratis".
function esClaseGratis(anuncio){
  return !!anuncio&&anuncio.precio_clp!==null&&anuncio.precio_clp!==''&&Number(anuncio.precio_clp)===0;
}
// Pack y descuento. El precio guardado es SIEMPRE por clase: el pack solo lo
// multiplica, y el descuento por venir de GradeHub lo fija GradeHub al aprobar
// (el profesor no puede escribirlo). Nada de esto toca la medición ni la tarifa.
function preciosClase(a){
  const base=Number(a&&a.precio_clp);
  if(esClaseGratis(a))return {gratis:true};
  if(!a||a.precio_clp===null||a.precio_clp===''||!Number.isFinite(base)||base<=0)return {gratis:false,porClase:null};
  const n=Number.isInteger(a.pack_clases)&&a.pack_clases>=MIN_PACK_CLASES&&a.pack_clases<=MAX_PACK_CLASES?a.pack_clases:null;
  const d=Number.isInteger(a.descuento_gradehub_pct)&&a.descuento_gradehub_pct>=1&&a.descuento_gradehub_pct<=50?a.descuento_gradehub_pct:null;
  const conDescuento=x=>d?Math.round(x*(100-d)/100):x;
  return {gratis:false,pack:n,descuento:d,porClase:base,porClaseFinal:conDescuento(base),
    packTotal:n?base*n:null,packFinal:n?conDescuento(base*n):null};
}
// Corto, para la línea bajo el título: "$45.000 pack de 4" o "$11.250".
function precioClase(anuncio){
  const p=preciosClase(anuncio);
  if(p.gratis)return 'Gratis';
  if(p.porClase==null)return pesosClase(anuncio&&anuncio.precio_clp);
  return p.pack?`${pesosClase(p.packFinal)} pack de ${p.pack}`:pesosClase(p.porClaseFinal);
}
// El bloque de precio de la tarjeta. El precio anterior va tachado con texto
// oculto ("antes") para lectores de pantalla, y el descuento en el color de la
// marca: nunca en verde, que en GradeHub significa "aprobado".
function precioCatalogoHTML(a){
  const p=preciosClase(a);
  if(p.gratis)return '<strong>Gratis</strong>';
  if(p.porClase==null)return '';
  const antes=x=>p.descuento?`<del><span class="sr-precio">antes </span>${pesosClase(x)}</del> `:'';
  const chip=p.descuento?`<span class="catalogo-clase-descuento">−${p.descuento}% por venir de GradeHub</span>`:'';
  if(p.pack)return `<div class="catalogo-clase-precio"><strong>${antes(p.packTotal)}${pesosClase(p.packFinal)} <small>pack de ${p.pack}</small></strong>${chip}<span class="catalogo-clase-por-clase">${antes(p.porClase)}${pesosClase(p.porClaseFinal)} por clase</span></div>`;
  return `<div class="catalogo-clase-precio"><strong>${antes(p.porClase)}${pesosClase(p.porClaseFinal)} <small>por clase</small></strong>${chip}</div>`;
}
function pesosClase(valor){
  // Nunca un precio negativo. El formulario ya exige entre 1.000 y 500.000, así
  // que un negativo solo puede venir de una fila corrupta o manipulada del
  // servidor — y ahí "$-500" en el catálogo es peor que no mostrar nada.
  const n=Number(valor);
  return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0})
    .format(Number.isFinite(n)&&n>0?n:0);
}
// El chat parte escrito, para que el profesor sepa de qué anuncio viene. Nunca
// dice nada de las notas de quien escribe.
function mensajeContactoClase(anuncio){
  const titulo=String(anuncio&&anuncio.titulo||'').trim();
  return titulo?`Hola, vi tu clase «${titulo}» en GradeHub.`:'Hola, vi tu clase en GradeHub.';
}
function textoContactoClase(tipo){return {whatsapp:'Hablar por WhatsApp',instagram:'Ver Instagram',enlace:'Inscribirme',email:'Enviar correo'}[tipo]||'Contactar';}

let catalogoClasesActual=[],nombresCatalogoClasesActual={};
// Una clase como la ve el estudiante. `sigla` es el ramo por el que se la
// mostramos, para que un contacto se mida en ese ramo.
// Cerrada muestra lo justo para decidir; "Ver clase" la abre (eso es una
// apertura) y recién ahí aparece el botón de WhatsApp (eso es un contacto).
function tarjetaCatalogoClase(a,{sigla,abierta=false}={}){
  const siglaMetrica=sigla||a.ramos_siglas[0]||'';
    const contacto=enlaceContactoClase(a.contacto_tipo,a.contacto_valor,mensajeContactoClase(a));
    const siglas=a.ramos_siglas.join(' · '),nombres=[...new Set((a.nombres_ramos||[]).map(nombreBaseRamoClase).filter(Boolean))].join(' · ');
    // El flyer va como tarjeta aparte, bajo el anuncio y entero: metido al lado
    // del texto se recortaba y en celular no se veía nada. Aparece al abrir la
    // clase, así el catálogo cerrado no se alarga.
    return `<div class="catalogo-clase-bloque"><article class="catalogo-clase-card" data-catalogo-anuncio="${esc(a.id)}">
      <div class="catalogo-clase-contenido">
        <div class="catalogo-clase-cabeza"><div><small>Publicidad · Clase particular</small>
        <h3>${esc(a.titulo||'Clase particular')}</h3></div>${logosCatalogoClases.get(a.id)?`<div class="catalogo-clase-logo" data-logo="${esc(logosCatalogoClases.get(a.id))}"></div>`:''}</div>
        <p class="catalogo-clase-ramos"><strong>${esc(siglas)}</strong>${nombres?`<span>${esc(nombres)}</span>`:''}</p>
        <p class="catalogo-clase-descripcion">${esc(a.descripcion||'')}</p>
        <div class="catalogo-clase-datos"><span>${esc(formatoClase(a))}</span>${precioCatalogoHTML(a)}</div>
        ${abierta?'':`<button type="button" class="catalogo-clase-ver" data-abrir="${esc(a.id)}" data-sigla="${esc(siglaMetrica)}" aria-expanded="false">Ver clase</button>`}
        <div class="catalogo-clase-mas"${abierta?'':' hidden'}>
        ${detallesClase(a).length?`<dl class="catalogo-clase-detalles">${detallesClase(a).map(d=>`<div><dt>${esc(d.etiqueta)}</dt><dd>${esc(d.valor)}</dd></div>`).join('')}</dl>`:''}
        ${contacto?`<a class="catalogo-clase-contacto" href="${esc(contacto)}" ${a.contacto_tipo==='email'?'':'target="_blank" rel="noopener noreferrer"'} data-contactar="${esc(a.id)}" data-sigla="${esc(siglaMetrica)}">${esc(textoContactoClase(a.contacto_tipo))}</a>`
          :'<p class="catalogo-clase-sin-contacto">El contacto de esta clase necesita revisión.</p>'}
        </div>
      </div>
    </article>${a.flyer_path?`<figure class="catalogo-clase-flyer" data-flyer="${esc(a.flyer_path)}"${abierta?'':' hidden'}><span>Cargando flyer…</span></figure>`:''}</div>`;
}

// Filtros locales sobre el catálogo público; no modifican campañas ni medición.
function filtrarPrecioCatalogoClases(anuncios,{desde='',hasta='',gratis=false,ubicacion='',invalido=false}={}){
  const minimo=desde===''?0:Number(desde),maximo=hasta===''?Infinity:Number(hasta);
  const error=!gratis&&(invalido||!Number.isSafeInteger(minimo)||minimo<0||
    !(maximo===Infinity||Number.isSafeInteger(maximo))||maximo<minimo);
  return {error,anuncios:error?[]:anuncios.filter(a=>{
    // Una clase híbrida se dicta online y presencial: calza con los dos filtros.
    if(ubicacion&&a.ubicacion!==ubicacion&&a.ubicacion!=='hibrido')return false;
    if(gratis)return esClaseGratis(a);
    if(desde===''&&hasta==='')return true;
    // Se filtra por lo que paga el estudiante por clase, con el descuento aplicado.
    const precio=Number(preciosClase(a).porClaseFinal??a.precio_clp);
    return a.precio_clp!=null&&a.precio_clp!==''&&Number.isFinite(precio)&&precio>=minimo&&precio<=maximo;
  })};
}
function filtrosCatalogoClases(){
  const desde=document.getElementById('catalogo-desde'),hasta=document.getElementById('catalogo-hasta');
  return {desde:desde.value,hasta:hasta.value,gratis:document.getElementById('catalogo-gratis').checked,
    ubicacion:document.getElementById('catalogo-ubicacion').value,invalido:desde.validity.badInput||hasta.validity.badInput};
}
function cabeceraCatalogoClasesHTML(){
  return `<div class="catalogo-clases catalogo-redisenado">
    <header class="catalogo-clases-head"><div><p class="catalogo-ceja">CLASES PARTICULARES</p><h1 class="modal-title" id="modal-titulo">Un poco de apoyo. Un gran avance.</h1><p class="catalogo-bajada">Encuentra una clase para ese ramo que necesita un empujón.</p></div><button type="button" class="settings-cerrar" onclick="closeModal()">Cerrar</button></header>
    <div class="catalogo-herramientas"><div class="catalogo-buscador"><label for="catalogo-clases-buscar">Buscar clases</label>
    <div class="catalogo-clases-busqueda"><input id="catalogo-clases-buscar" type="search" autocomplete="off" placeholder="Busca por ramo o sigla" aria-describedby="catalogo-clases-estado"></div></div>
    <label class="catalogo-filtro">Modalidad<select id="catalogo-ubicacion"><option value="">Todas</option><option value="online">Online</option><option value="presencial">Presencial</option></select></label>
    <div class="catalogo-precios" role="group" aria-label="Precio por clase en pesos">
      <label class="catalogo-filtro">Desde $<input id="catalogo-desde" type="number" min="0" step="1" inputmode="numeric" placeholder="Sin mínimo" aria-describedby="catalogo-precio-error"></label>
      <label class="catalogo-filtro">Hasta $<input id="catalogo-hasta" type="number" min="0" step="1" inputmode="numeric" placeholder="Sin máximo" aria-describedby="catalogo-precio-error"></label>
      <label class="catalogo-gratis"><input id="catalogo-gratis" type="checkbox">Solo gratis</label>
      <p id="catalogo-precio-error" role="status"></p>
    </div></div>
    <div class="catalogo-lista-cabeza"><h2>Clases en tu universidad</h2><button type="button" id="catalogo-limpiar">Limpiar filtros</button></div>
    <p class="catalogo-clases-estado" id="catalogo-clases-estado" role="status" aria-live="polite">Buscando clases publicadas…</p>
    <div class="catalogo-clases-resultados" id="catalogo-clases-resultados" aria-busy="true"></div>
    <p class="catalogo-privacidad">El catálogo no usa tus notas. Tú eliges qué clase explorar y a quién contactar.</p>
  </div>`;
}
let estadoCargaCatalogo='listo';
function renderCatalogoClases(busqueda=''){
  const raiz=document.getElementById('catalogo-clases-resultados');
  if(!raiz)return;
  const filtros=filtrosCatalogoClases();
  const {anuncios,error}=filtrarPrecioCatalogoClases(prepararCatalogoClases(catalogoClasesActual,busqueda,nombresCatalogoClasesActual),filtros);
  document.getElementById('catalogo-precio-error').textContent=error?'Escribe montos válidos; Hasta debe ser igual o mayor que Desde.':'';
  ['catalogo-desde','catalogo-hasta'].forEach(id=>{const campo=document.getElementById(id);campo.disabled=filtros.gratis;campo.setAttribute('aria-invalid',String(error));});
  const estado=document.getElementById('catalogo-clases-estado');
  if(estadoCargaCatalogo!=='listo'){
    estado.textContent=estadoCargaCatalogo==='cargando'?'Buscando clases publicadas…':'No pudimos cargar las clases. Revisa tu conexión e inténtalo de nuevo.';
    raiz.innerHTML=estadoCargaCatalogo==='error'?'<button type="button" class="catalogo-reintentar">Reintentar</button>':'';
    const reintentar=raiz.querySelector('.catalogo-reintentar');if(reintentar)reintentar.addEventListener('click',openCatalogoClases);
    return;
  }
  if(estado)estado.textContent=anuncios.length
    ?`${anuncios.length} ${anuncios.length===1?'clase encontrada':'clases encontradas'}`
    :(busqueda||filtros.desde||filtros.hasta||filtros.gratis||filtros.ubicacion?'No encontramos clases con esos filtros. Prueba ampliarlos.':'Todavía no hay clases publicadas en tu universidad.');
  raiz.innerHTML=anuncios.map(a=>tarjetaCatalogoClase(a)).join('');
  activarTarjetasClases(raiz);
  observarImpresionesClases(raiz,anuncios,busqueda);
}

// Contacto medido e imágenes firmadas de las tarjetas dentro de `raiz`. La
// usan el catálogo y la clase abierta desde la recomendación de Inicio.
function activarTarjetasClases(raiz){
  raiz.querySelectorAll('[data-contactar]').forEach(link=>link.addEventListener('click',()=>{
    registrarMetricaAnuncio(link.dataset.contactar,'contacto',link.dataset.sigla);
    registrarInteraccionAnuncio(link.dataset.contactar,'contacto');
  }));
  raiz.querySelectorAll('[data-abrir]').forEach(boton=>boton.addEventListener('click',()=>{
    const tarjeta=boton.closest('.catalogo-clase-card'),mas=tarjeta&&tarjeta.querySelector('.catalogo-clase-mas');
    if(!mas)return;
    mas.hidden=false;boton.remove();
    const bloque=tarjeta.closest('.catalogo-clase-bloque'),flyer=bloque&&bloque.querySelector('.catalogo-clase-flyer');
    if(flyer)flyer.hidden=false;
    registrarMetricaAnuncio(boton.dataset.abrir,'clic',boton.dataset.sigla);
    registrarInteraccionAnuncio(boton.dataset.abrir,'apertura');
    const contacto=mas.querySelector('.catalogo-clase-contacto');if(contacto)contacto.focus();
  }));
  raiz.querySelectorAll('[data-logo]').forEach(async caja=>{
    const url=await urlFlyerClase(caja.dataset.logo);
    if(!caja.isConnected)return;
    if(url)caja.innerHTML=imgLogoClase(url,' loading="lazy"');else caja.remove();
  });
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
let impresionesCatalogo=new Set(),observadorCatalogo=null,logosCatalogoClases=new Map();
function observarImpresionesClases(raiz,anuncios,busqueda=''){
  // Si la persona escribió algo, las tarjetas que ve son resultado de buscar.
  const canal=String(busqueda||'').trim()?'busqueda':'lista';
  if(observadorCatalogo){observadorCatalogo.disconnect();observadorCatalogo=null;}
  if(typeof IntersectionObserver!=='function'||!raiz)return;
  const sigla=new Map((anuncios||[]).map(a=>[a.id,(a.ramos_siglas||[])[0]||'']));
  const timers=new Map();
  observadorCatalogo=new IntersectionObserver(entradas=>{
    for(const e of entradas){
      const id=e.target.dataset.catalogoAnuncio;
      if(!id||impresionesCatalogo.has(id+':'+canal))continue;
      if(e.isIntersecting&&e.intersectionRatio>=IMPRESION_VISIBLE){
        if(!timers.has(id))timers.set(id,setTimeout(()=>{
          timers.delete(id);
          if(!e.target.isConnected||impresionesCatalogo.has(id+':'+canal))return;
          impresionesCatalogo.add(id+':'+canal);
          registrarMetricaAnuncio(id,'impresion',sigla.get(id));
          registrarAlcanceAnuncio(id,canal);
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
  estadoCargaCatalogo='cargando';catalogoClasesActual=[];nombresCatalogoClasesActual={};logosCatalogoClases=new Map();
  raiz.innerHTML=cabeceraCatalogoClasesHTML();
  openModal();
  const input=raiz.querySelector('#catalogo-clases-buscar');
  const sigueAbierto=()=>input.isConnected&&document.getElementById('catalogo-clases-buscar')===input&&
    document.getElementById('modal').classList.contains('open');
  input.addEventListener('input',()=>renderCatalogoClases(input.value));
  ['catalogo-desde','catalogo-hasta'].forEach(id=>raiz.querySelector('#'+id).addEventListener('input',()=>renderCatalogoClases(input.value)));
  ['catalogo-gratis','catalogo-ubicacion'].forEach(id=>raiz.querySelector('#'+id).addEventListener('change',()=>renderCatalogoClases(input.value)));
  raiz.querySelector('#catalogo-limpiar').addEventListener('click',()=>{
    ['catalogo-desde','catalogo-hasta','catalogo-ubicacion'].forEach(id=>{raiz.querySelector('#'+id).value='';});
    raiz.querySelector('#catalogo-gratis').checked=false;input.value='';renderCatalogoClases();input.focus();
  });
  const tenant=S.tenant;
  // En UC los nombres del catálogo completo llegan diferidos. Los avisos y sus
  // siglas aparecen al tiro; cuando carga el archivo, se enriquece la búsqueda
  // por nombre sin volver a pedir anuncios ni tocar datos académicos.
  if(tenant==='uc'&&typeof cargarCursosUC==='function'&&typeof cursosUcExtra==='function'&&!cursosUcExtra())
    cargarCursosUC().then(ok=>{if(ok&&sigueAbierto()){nombresCatalogoClasesActual=nombresRamosParaClases(tenant);renderCatalogoClases(input.value);}}).catch(()=>{});
  let anuncios;
  try{anuncios=await cargarAnunciosClases(tenant,{propagarError:true});}
  catch(error){
    if(!sigueAbierto())return;
    estadoCargaCatalogo='error';raiz.querySelector('#catalogo-clases-resultados').setAttribute('aria-busy','false');renderCatalogoClases(input.value);return;
  }
  if(!sigueAbierto())return;
  catalogoClasesActual=anuncios;
  const logos=await logosDeAnuncios(anuncios.map(a=>a.id));
  if(!sigueAbierto())return;
  logosCatalogoClases=logos;estadoCargaCatalogo='listo';
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

// Abrió la clase o tocó contactar: una vez por persona y anuncio, lo cuenta el
// servidor con la cuenta de la sesión. El Set solo ahorra llamadas repetidas.
const INTERACCION_REGISTRADA=new Set();
function claveMedicionClase(anuncioId){
  const anuncio=catalogoClasesActual.find(a=>a.id===anuncioId)||
    (anunciosRecomendacion.lista||[]).find(a=>a.id===anuncioId);
  return (currentUser&&currentUser.id||'')+':'+anuncioId+':'+(anuncio&&anuncio.publicado_at||'');
}
async function registrarInteraccionAnuncio(anuncioId,tipo){
  const clave=claveMedicionClase(anuncioId)+':'+tipo;
  if(!supabaseClient||!currentUser||!anuncioId||!['apertura','contacto'].includes(tipo)||INTERACCION_REGISTRADA.has(clave))return false;
  INTERACCION_REGISTRADA.add(clave);
  const {data,error}=await supabaseClient.rpc('registrar_interaccion_anuncio',{p_anuncio_id:anuncioId,p_tipo:tipo});
  if(error){INTERACCION_REGISTRADA.delete(clave);console.warn('No se pudo registrar la interacción:',error.message||error);return false;}
  return data===true;
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
// El canal dice por qué camino llegó la cuenta —recomendación, búsqueda o
// lista— porque cada uno se cobra distinto. Es una palabra: lo que la persona
// escribió en el buscador no viaja. El servidor guarda el camino más caro y
// nunca lo baja, así que mandar uno más barato después no descuenta nada.
const CANALES_ALCANCE=new Set(['recomendacion','busqueda','lista']);
const ALCANCE_REGISTRADO=new Set();
async function registrarAlcanceAnuncio(anuncioId,canal='recomendacion'){
  const clave=claveMedicionClase(anuncioId)+':'+canal;
  if(!supabaseClient||!currentUser||!anuncioId||!CANALES_ALCANCE.has(canal)||ALCANCE_REGISTRADO.has(clave))return false;
  ALCANCE_REGISTRADO.add(clave);
  const {data,error}=await supabaseClient.rpc('registrar_alcance_anuncio',{p_anuncio_id:anuncioId,p_canal:canal});
  if(error){
    // Si falló, no quedó registrado: se puede reintentar en la próxima vista.
    ALCANCE_REGISTRADO.delete(clave);
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

// Los anuncios de quien mira. La RLS deja leer los propios en cualquier estado
// y, de los demás, los publicados: son públicos para el catálogo. No se puede
// filtrar por autor_id acá (esa columna no tiene SELECT público), así que los
// publicados se confirman uno por uno con `anuncio_propio`, que corre en el
// servidor. Sin esto, cada profesor veía en su página las clases de los otros
// (pasó el 2026-09-26 con la primera clase de un profesor externo).
async function misAnunciosClase(){
  const uid=sesionProfesorClase();
  if(!uid)return {ok:false,error:'Inicia sesión para ver tus clases.'};
  try{
    const {data,error}=await consultaCamposClase(campos=>supabaseClient.from('tutor_anuncios')
      .select(campos).order('created_at',{ascending:false}),CAMPOS_PUBLICOS_ANUNCIO);
    if(error)throw error;
    const todos=Array.isArray(data)?data:[];
    // Si no se puede confirmar un publicado, se falla entero en vez de
    // adivinar: mostrar uno ajeno o esconder uno propio serían los dos malos.
    const propio=await Promise.all(todos.map(async a=>{
      if(a.estado!=='publicado')return true;
      const r=await supabaseClient.rpc('anuncio_propio',{p_anuncio_id:a.id,p_editable:false});
      if(r.error)throw r.error;
      return r.data===true;
    }));
    return {ok:true,anuncios:todos.filter((_,i)=>propio[i])};
  }catch(e){return {ok:false,error:'No pudimos consultar tus clases. Intenta de nuevo.'};}
}

const ESTADOS_ANUNCIO={
  borrador:['Borrador','Nadie lo ve todavía.'],
  en_revision:['En revisión','No se publica hasta que lo aprobemos.'],
  publicado:['Publicado','Se está mostrando a tu público.'],
  programado:['Programado','Empieza el día que elegiste.'],
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
// `porCanal` es null si el servidor todavía no separa caminos (SQL sin
// aplicar): ahí se usa el total de siempre y todo se cobra como segmentado,
// que es como se cotizaba antes. Nunca se inventa un reparto.
async function metricasDeAnuncio(anuncio){
  const salida={alcance:null,porCanal:null,cortes:[],agregados:null,campana:null};
  if(!anuncio||!ANUNCIO_YA_SE_MOSTRO.has(anuncio.estado))return salida;
  // La campaña: personas que vieron, abrieron y contactaron, y días cobrados.
  // Sin el SQL de campañas no hay costo que mostrar, y no se inventa.
  try{
    const {data,error}=await supabaseClient.rpc('campana_anuncio',{p_anuncio_id:anuncio.id});
    const fila=!error&&Array.isArray(data)?data[0]:null;
    if(fila&&['vistas','aperturas','contactos','dias_cobrados'].every(k=>Number.isInteger(fila[k])))salida.campana=fila;
  }catch(e){}
  try{
    const {data,error}=await supabaseClient.rpc('alcance_anuncio_por_canal',{p_anuncio_id:anuncio.id});
    if(!error&&Array.isArray(data)){
      const por={recomendacion:0,busqueda:0,lista:0};
      data.forEach(f=>{if(por[f.canal]!==undefined&&Number.isInteger(f.cuentas))por[f.canal]=f.cuentas;});
      salida.porCanal=por;salida.alcance=por.recomendacion+por.busqueda+por.lista;
    }
  }catch(e){}
  if(salida.alcance===null)try{
    const {data,error}=await supabaseClient.rpc('alcance_anuncio',{p_anuncio_id:anuncio.id});
    if(!error&&Number.isInteger(data))salida.alcance=data;
  }catch(e){}
  try{
    const {data,error}=await supabaseClient.rpc('resumen_metricas_anuncio',{p_anuncio_id:anuncio.id});
    if(!error&&Array.isArray(data))salida.cortes=data;
  }catch(e){}
  // Totales por una dimensión a la vez, con el mismo umbral de quince. Si el
  // servidor todavía no tiene la función, se arman desde los cortes finos.
  try{
    const {data,error}=await supabaseClient.rpc('totales_metricas_anuncio',{p_anuncio_id:anuncio.id});
    if(!error&&Array.isArray(data))salida.agregados=agregadosDeFilas(data);
  }catch(e){}
  if(!salida.agregados)salida.agregados=agregadosDeFilas([
    ...salida.cortes.map(c=>({vista:'dia',clave:c.dia,tipo:c.tipo,eventos:c.eventos})),
    ...salida.cortes.map(c=>({vista:'ramo',clave:c.ramo_sigla,tipo:c.tipo,eventos:c.eventos})),
    ...salida.cortes.map(c=>({vista:'total',clave:'',tipo:c.tipo,eventos:c.eventos}))]);
  return salida;
}

// {total:{impresion,clic,contacto}, dias:{'2026-09-25':{...}}, ramos:{MAT1620:{...}}}
function agregadosDeFilas(filas){
  const vacio=()=>({impresion:0,clic:0,contacto:0});
  const a={total:vacio(),dias:{},ramos:{}};
  for(const f of filas||[]){
    const n=Number(f.eventos)||0;
    if(!(f.tipo in a.total)||n<=0)continue;
    if(f.vista==='total')a.total[f.tipo]+=n;
    else if(f.vista==='dia'){(a.dias[f.clave]=a.dias[f.clave]||vacio())[f.tipo]+=n;}
    else if(f.vista==='ramo'){(a.ramos[f.clave]=a.ramos[f.clave]||vacio())[f.tipo]+=n;}
  }
  return a;
}

function totalesDeCortes(cortes){
  const por={impresion:0,clic:0,contacto:0};
  (cortes||[]).forEach(c=>{if(por[c.tipo]!==undefined)por[c.tipo]+=Number(c.eventos)||0;});
  return por;
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
    const {data,error}=await consultaCamposClase(campos=>supabaseClient.from('tutor_anuncios')
      .update({estado}).eq('id',id).select(campos).single(),CAMPOS_PUBLICOS_ANUNCIO);
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
    const vence=Date.parse(a.vence_at||''),desde=Date.parse(a.publicado_at||'');
    if(Number.isFinite(vence)&&vence<=ahora)return 'expirado';
    return Number.isFinite(desde)&&desde>ahora?'programado':'publicado';
  }
  return a.estado;
}
// La página se ordena por lo que el profesor puede HACER con cada anuncio.
function gruposPanelClases(anuncios,ahora=Date.now()){
  const g={activos:[],programados:[],revision:[],borradores:[],cerrados:[]};
  for(const a of anuncios||[]){
    const e=vigenciaAnuncio(a,ahora);
    (e==='publicado'?g.activos:e==='programado'?g.programados:e==='en_revision'?g.revision:e==='borrador'?g.borradores:g.cerrados).push(a);
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

// Cada etapa con sus dos números juntos: cuántas personas distintas (lo que
// se cobra) y cuántas veces en total (una persona puede verla en la mañana y
// en la tarde). Separados en tarjetas sueltas no se entendía qué medía cada
// uno. Solo se pinta lo que se sabe: el servidor no devuelve cortes con menos
// de quince eventos, y "0 veces" ahí sería inventarlo.
function cifrasClase({alcance,totales,hayCortes,campana,costo},pesos){
  const miles=n=>new Intl.NumberFormat('es-CL').format(n);
  const veces=n=>hayCortes&&n?n:null;
  // Con la campaña medida, las personas vienen de ahí: son exactas y son lo
  // que se cobra. Sin ella, el alcance de siempre, y abrir o contactar solo
  // se saben como veces.
  const etapas=[
    ['Se mostró',campana?campana.vistas:alcance,veces(totales.impresion),true],
    ['La abrieron',campana?campana.aperturas:null,veces(totales.clic),false],
    ['Te contactaron',campana?campana.contactos:null,veces(totales.contacto),false]];
  const mitad=(v,d)=>`<div><b>${v}</b><small>${d}</small></div>`;
  const html=etapas.filter(([,p,v,siempre])=>siempre||p!==null&&p!==undefined||v!==null).map(([t,p,v])=>
    `<div class="clase-etapa"><span>${t}</span><div class="clase-par">${
      [p!==null&&p!==undefined?mitad(miles(p),'personas distintas'):campana||!v?mitad('—','personas distintas'):'',
       v!==null?mitad(miles(v),'veces en total'):''].filter(Boolean).join('<i class="clase-par-sep" aria-hidden="true">/</i>')}</div></div>`).join('');
  const f=[];
  if(costo)f.push(['Va costando',pesos(costo.total),costo.tope!==null?`de tu tope de ${pesos(costo.tope)}`:'hasta ahora']);
  if(costo&&campana&&campana.contactos)f.push(['Por contacto',pesos(Math.round(costo.total/campana.contactos)),'lo que costó cada uno']);
  return `<div class="clase-etapas">${html}</div>`+(f.length?`<div class="clase-nums">${f.map(([t,v,d])=>
    `<div class="clase-num"><span>${t}</span><b>${v}</b><small>${d}</small></div>`).join('')}</div>`:'');
}

// De quienes la vieron, cuántos tocaron algo. Barras relativas a las
// impresiones y dibujadas con scaleX, no con width.
function embudoClase(totales){
  if(!totales.impresion)return '';
  const filas=[['Se mostró',totales.impresion],['La abrieron',totales.clic],['Te contactaron',totales.contacto]].filter(([,n])=>n>0);
  if(filas.length<2)return '';
  return `<div class="clase-embudo" aria-label="De quienes vieron tu clase, cuántos avanzaron">${filas.map(([t,n])=>
    `<div class="clase-embudo-fila"><span>${t}</span><div class="clase-barra"><i style="transform:scaleX(${(n/totales.impresion).toFixed(3)})"></i></div><b>${n}</b></div>`).join('')}</div>`;
}

// ─── GRÁFICOS DEL PANEL ─────────────────────────────────────────────────────
//
// SVG a mano, sin librerías. Los tres caminos van en tonos de un mismo turquesa,
// del más oscuro al más claro, del más dirigido al más casual. Nada usa el
// semáforo: esto no es una nota. Cada marca lleva su número escrito o en su
// <title>, así el color nunca es lo único que dice algo.
const CANALES_VIZ=[['recomendacion','Recomendado en Inicio','viz-c1'],['busqueda','Buscaron el ramo','viz-c2'],['lista','Vieron el catálogo','viz-c3']];
const milesViz=n=>new Intl.NumberFormat('es-CL').format(n);
const pctViz=(n,t)=>t?new Intl.NumberFormat('es-CL',{style:'percent',maximumFractionDigits:0}).format(n/t):'—';

function donaCanalesClase(porCanal){
  if(!porCanal)return '';
  const total=porCanal.recomendacion+porCanal.busqueda+porCanal.lista;
  const R=34,C=2*Math.PI*R,GAP=total&&CANALES_VIZ.filter(([k])=>porCanal[k]>0).length>1?2:0;
  let off=0;
  const arcos=total?CANALES_VIZ.filter(([k])=>porCanal[k]>0).map(([k,t,cls])=>{
    const largo=Math.max(C*porCanal[k]/total-GAP,0.5);
    const arco=`<circle class="${cls}" r="${R}" cx="45" cy="45" fill="none" stroke-width="12" stroke-dasharray="${largo.toFixed(2)} ${(C-largo).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 45 45)"><title>${t}: ${milesViz(porCanal[k])} (${pctViz(porCanal[k],total)})</title></circle>`;
    off+=C*porCanal[k]/total;return arco;
  }).join(''):`<circle r="${R}" cx="45" cy="45" fill="none" stroke-width="12" class="viz-vacio"/>`;
  return `<figure class="viz viz-dona" aria-label="Cómo llegaron: ${CANALES_VIZ.map(([k,t])=>t+' '+porCanal[k]).join(', ')}">
    <figcaption>Cómo llegaron</figcaption>
    <div class="viz-dona-cuerpo">
      <svg viewBox="0 0 90 90" role="img" aria-hidden="true">${arcos}<text x="45" y="44" text-anchor="middle" class="viz-dona-num">${milesViz(total)}</text><text x="45" y="57" text-anchor="middle" class="viz-dona-sub">personas</text></svg>
      <ul class="viz-leyenda">${CANALES_VIZ.map(([k,t,cls])=>`<li><i class="${cls}"></i><span>${t}</span><b>${milesViz(porCanal[k])}</b><small>${pctViz(porCanal[k],total)}</small></li>`).join('')}</ul>
    </div></figure>`;
}

// Varias campañas en una sola cuenta, para el resumen de arriba.
function sumarCostosCampana(costos){
  const c=costos.filter(Boolean);
  if(!c.length)return null;
  const partes=c[0].partes.map(p=>({...p,cantidad:0,subtotal:0}));
  c.forEach(x=>x.partes.forEach((p,i)=>{partes[i].cantidad+=p.cantidad;partes[i].subtotal+=p.subtotal;}));
  return {partes,bruto:c.reduce((n,x)=>n+x.bruto,0),total:c.reduce((n,x)=>n+x.total,0),
    tope:c.every(x=>x.tope!==null)?c.reduce((n,x)=>n+x.tope,0):null,agotada:false};
}
// En qué se va la plata: una barra apilada con cada concepto.
const PARTES_COSTO_VIZ={contacto:['Contactos','viz-c1'],apertura:['Aperturas','viz-c2'],vista:['Vistas','viz-c3'],dia:['Días publicada','viz-fijo']};
function costoApiladoClase(costo,pesos){
  if(!costo)return '';
  const partes=['contacto','apertura','vista','dia'].map(k=>{const p=costo.partes.find(x=>x.clave===k);return [PARTES_COSTO_VIZ[k][0],p?p.subtotal:0,PARTES_COSTO_VIZ[k][1]];}).filter(([,v])=>v>0);
  const total=partes.reduce((n,[,v])=>n+v,0);
  if(!total)return '';
  return `<figure class="viz viz-costo" aria-label="En qué se va el costo">
    <figcaption>En qué se va · ${pesos(costo.total)}${costo.tope!==null?` de ${pesos(costo.tope)}`:''}</figcaption>
    <div class="viz-apilada">${partes.map(([t,v,cls])=>`<span class="${cls}" style="flex-grow:${v}" title="${t}: ${pesos(v)}"></span>`).join('')}</div>
    <ul class="viz-leyenda">${partes.map(([t,v,cls])=>`<li><i class="${cls}"></i><span>${t}</span><b>${pesos(v)}</b><small>${pctViz(v,total)}</small></li>`).join('')}</ul>
  </figure>`;
}

// Cuánto de la campaña ya pasó, como anillo, con los días que quedan al centro.
function anilloCampanaClase(a,ahora){
  const avance=avanceCampanaAnuncio(a,ahora),dias=diasRestantesAnuncio(a,ahora);
  if(avance===null||dias===null)return '';
  const R=34,C=2*Math.PI*R;
  return `<figure class="viz viz-anillo" aria-label="Campaña: quedan ${dias} días">
    <figcaption>Campaña</figcaption>
    <svg viewBox="0 0 90 90" role="img" aria-hidden="true">
      <circle r="${R}" cx="45" cy="45" fill="none" stroke-width="8" class="viz-vacio"/>
      <circle r="${R}" cx="45" cy="45" fill="none" stroke-width="8" class="viz-avance" stroke-linecap="round" stroke-dasharray="${(C*avance).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 45 45)"><title>${pctViz(avance,1)} de la campaña</title></circle>
      <text x="45" y="47" text-anchor="middle" class="viz-dona-num">${dias}</text><text x="45" y="60" text-anchor="middle" class="viz-dona-sub">${dias===1?'día queda':'días quedan'}</text>
    </svg></figure>`;
}

// Veces que se mostró por día desde que se publicó. Un día sin barra no es un
// cero: es un día con menos de quince eventos, y se dice así.
function barrasDiasClase(a,agregados,ahora){
  if(!agregados)return '';
  const desde=Date.parse(a.publicado_at||''),hasta=Math.min(ahora,Date.parse(a.vence_at||'')||ahora);
  if(!Number.isFinite(desde))return '';
  const dias=[];
  for(let t=desde;t<=hasta&&dias.length<31;t+=864e5)dias.push(new Date(t).toISOString().slice(0,10));
  if(!dias.length)return '';
  const serie=dias.map(d=>({d,n:(agregados.dias[d]||{}).impresion||0,c:(agregados.dias[d]||{}).contacto||0}));
  const max=Math.max(...serie.map(x=>x.n),1),W=Math.max(dias.length*12,120),H=64;
  const ancho=Math.min(8,W/dias.length-3);
  const barras=serie.map((x,i)=>{
    const cx=i*(W/dias.length)+(W/dias.length-ancho)/2,fecha=new Date(x.d+'T12:00:00').toLocaleDateString('es-CL',{day:'numeric',month:'short'});
    if(!x.n)return `<rect x="${cx.toFixed(1)}" y="${H-2}" width="${ancho.toFixed(1)}" height="2" rx="1" class="viz-vacio-marca"><title>${fecha}: menos de 15 eventos</title></rect>`;
    const h=Math.max(3,(H-6)*x.n/max);
    return `<rect x="${cx.toFixed(1)}" y="${(H-h).toFixed(1)}" width="${ancho.toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="viz-c1"><title>${fecha}: se mostró ${milesViz(x.n)} veces${x.c?`, ${milesViz(x.c)} contactos`:''}</title></rect>`;
  }).join('');
  const conDatos=serie.filter(x=>x.n);
  const mejor=conDatos.sort((p,q)=>q.n-p.n)[0];
  return `<figure class="viz viz-dias" aria-label="Veces que se mostró por día">
    <figcaption>Veces que se mostró por día${mejor?` · mejor día ${new Date(mejor.d+'T12:00:00').toLocaleDateString('es-CL',{weekday:'long'})}`:''}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-hidden="true"><line x1="0" x2="${W}" y1="${H-0.5}" y2="${H-0.5}" class="viz-base"/>${barras}</svg>
    <div class="viz-eje"><span>${new Date(dias[0]+'T12:00:00').toLocaleDateString('es-CL',{day:'numeric',month:'short'})}</span><span>${new Date(dias[dias.length-1]+'T12:00:00').toLocaleDateString('es-CL',{day:'numeric',month:'short'})}</span></div>
    ${conDatos.length?'':'<p class="clase-sin-datos">Cada día aparece cuando junta al menos quince eventos.</p>'}
  </figure>`;
}

// Qué ramo del anuncio mueve más, si el anuncio tiene más de uno.
function barrasRamosClase(a,agregados){
  const siglas=Array.isArray(a.ramos_siglas)?a.ramos_siglas:[];
  if(!agregados||siglas.length<2)return '';
  const filas=siglas.map(sg=>({sg,n:(agregados.ramos[sg]||{}).impresion||0,c:(agregados.ramos[sg]||{}).contacto||0}));
  if(!filas.some(f=>f.n))return '';
  const max=Math.max(...filas.map(f=>f.n),1);
  return `<figure class="viz viz-ramos" aria-label="Veces que se mostró por ramo">
    <figcaption>Por ramo</figcaption>
    ${filas.sort((p,q)=>q.n-p.n).map(f=>`<div class="clase-embudo-fila"><span>${esc(f.sg)}</span><div class="clase-barra"><i style="transform:scaleX(${(f.n/max).toFixed(3)})"></i></div><b>${f.n?milesViz(f.n):'—'}</b></div>`).join('')}
  </figure>`;
}

function graficosClase(d,pesos,ahora){
  const arriba=donaCanalesClase(d.porCanal)+anilloCampanaClase(d.a,ahora);
  return (arriba?`<div class="viz-fila">${arriba}</div>`:'')+
    barrasDiasClase(d.a,d.agregados,ahora)+
    costoApiladoClase(d.costo,pesos)+
    barrasRamosClase(d.a,d.agregados)+
    embudoClase(d.totales);
}

function tarjetaPanelClase(a,pesos,ahora){
  const vig=vigenciaAnuncio(a,ahora);
  const [etiqueta,detalle]=ESTADOS_ANUNCIO[vig]||[vig,''];
  const dias=vig==='publicado'?diasRestantesAnuncio(a,ahora):null,avance=vig==='publicado'?avanceCampanaAnuncio(a,ahora):null;
  const empieza=vig==='programado'?new Date(a.publicado_at).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'}):'';
  const accion={
    publicado:`<button type="button" class="clase-accion" data-pausar="${esc(a.id)}">Pausar</button>`,
    programado:`<button type="button" class="clase-accion" data-pausar="${esc(a.id)}">Pausar</button>`,
    borrador:`<button type="button" class="clase-accion" data-editar="${esc(a.id)}">Seguir editando</button>`,
    pausado:`<button type="button" class="clase-accion" data-retomar="${esc(a.id)}">Volver a publicar</button>`,
    expirado:`<button type="button" class="clase-accion" data-retomar="${esc(a.id)}">Volver a publicar</button>`,
  }[vig]||'';
  return `<article class="clase-card" data-anuncio="${esc(a.id)}">
    <div class="clase-card-top">
      <strong>${esc(a.titulo||'Sin título')}</strong>
      <span class="clase-estado clase-estado-${esc(vig)}">${esc(etiqueta)}</span>
    </div>
    <p class="clase-card-meta">${esc((a.ramos_siglas||[]).join(' · '))}${esClaseGratis(a)?' · Gratis':a.precio_clp?' · '+(preciosClase(a).pack?precioClase(a):pesos(preciosClase(a).porClaseFinal)+' por clase'):''}</p>
    ${dias!==null?`<div class="clase-vigencia"><span>${dias===0?'Termina hoy':dias===1?'Queda 1 día':`Quedan ${dias} días`}</span>${avance!==null?`<div class="clase-riel"><i style="transform:scaleX(${avance.toFixed(3)})"></i></div>`:''}</div>`
      :`<p class="clase-card-detalle">${esc(empieza?`Empieza el ${empieza}.`:detalle)}</p>`}
    <div class="clase-numeros" data-metricas="${esc(a.id)}"></div>
    ${accion}
  </article>`;
}

// Presentación pura de la propuesta #522. Las acciones y los números siguen
// conectados al flujo de producción; no se importan adaptadores de bin/.
function cabeceraProfesorHTML(titulo,bajada,accion='',idTitulo='profesor-titulo'){
  return `<header class="profesor-hig-cabecera"><div><p class="profesor-hig-ceja">TU ESPACIO DE PROFESOR</p><h1 class="modal-title" id="${esc(idTitulo)}">${esc(titulo)}</h1><p>${esc(bajada)}</p></div>${accion}</header>`;
}
function filaProfesorClaseHTML(a,pesos,ahora){
  const vig=vigenciaAnuncio(a,ahora),etiqueta=(ESTADOS_ANUNCIO[vig]||[vig])[0];
  return `<details class="profesor-hig-fila"><summary>
    <span class="profesor-hig-identidad"><b>${esc(a.titulo||'Sin título')}</b><small>${esc((a.ramos_siglas||[]).join(' · '))}</small></span>
    <span class="clase-estado clase-estado-${esc(vig)}" data-estado-campana="${esc(a.id)}">${esc(etiqueta)}</span>
    <span class="profesor-hig-importe"><b data-costo-campana="${esc(a.id)}">${['publicado','pausado','expirado'].includes(vig)?'Cargando…':'—'}</b><small>Costo de campaña</small></span>
    <span class="profesor-hig-flecha" aria-hidden="true">⌄</span>
    </summary><div class="profesor-hig-detalle">${tarjetaPanelClase(a,pesos,ahora)}</div></details>`;
}
function presupuestoProfesorHTML(costo){
  if(!costo)return '<p class="clase-sin-datos">No pudimos cargar el costo de la campaña. Vuelve a abrir tu espacio para intentarlo de nuevo.</p>';
  const porcentaje=costo.tope?Math.min(100,Math.round(costo.total/costo.tope*100)):0;
  return `<section class="profesor-hig-presupuesto"><span>Costo · publicación actual</span><strong>${pesosClase(costo.total)} <small>de ${pesosClase(costo.tope)}</small></strong><progress max="100" value="${porcentaje}" aria-label="Presupuesto utilizado"></progress><p>${porcentaje}% del tope. La campaña deja de mostrarse al alcanzarlo.</p></section>`;
}

function seccionPanelClases(titulo,lista,pesos,ahora,vacio){
  if(!lista.length&&!vacio)return '';
  return `<section class="clases-seccion"><h3>${titulo}${lista.length?` <span>${lista.length}</span>`:''}</h3>
    ${lista.length?`<div class="clase-lista">${lista.map(a=>filaProfesorClaseHTML(a,pesos,ahora)).join('')}</div>`:`<p class="clase-sin-datos">${vacio}</p>`}</section>`;
}

async function renderPanelProfesor(raiz,anuncios,{cabecera,salida}){
  const pesos=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n);
  const ahora=Date.now(),g=gruposPanelClases(anuncios,ahora);
  const conNumeros=[...g.activos,...g.cerrados];
  raiz.innerHTML='<div class="profesor-hig">'+
    cabeceraProfesorHTML('Tu conocimiento puede ayudar.','Este es tu espacio para publicar clases y ver cómo les va.',
      '<button type="button" class="btn-confirm" id="clase-nueva">Crear anuncio</button>',raiz.id==='modal-content'?'modal-titulo':'profesor-titulo')+
    `<section class="profesor-hig-intro"><div><h2>Enseña a tu manera.</h2><p>Elige qué ofrecer, a quién llegar y cuánto destinar a tu campaña. Tú pones el límite.</p></div>
      <ol><li><b>Prepara tu clase.</b> Cuenta qué van a trabajar.</li><li><b>Define público y presupuesto.</b> Siempre con un tope.</li><li><b>Revisa y envía.</b> Nada se publica sin aprobación.</li></ol></section>
    <div class="profesor-hig-lista-cabeza"><h2>Tus anuncios</h2><span>${anuncios.length} ${anuncios.length===1?'anuncio':'anuncios'}</span></div>`+
    (anuncios.length?'':'<p class="profesor-hig-vacio">Todavía no tienes anuncios. Crea el primero y guárdalo como borrador hasta que esté listo.</p>')+
    seccionPanelClases('Publicadas',g.activos,pesos,ahora)+
    seccionPanelClases('Programadas',g.programados,pesos,ahora)+
    seccionPanelClases('En revisión',g.revision,pesos,ahora)+
    seccionPanelClases('Borradores',g.borradores,pesos,ahora)+
    seccionPanelClases('Pausadas y terminadas',g.cerrados,pesos,ahora)+
    `<details class="clases-resumen profesor-hig-resumen"><summary id="clases-resumen-titulo">Resumen de tus clases activas</summary>
       <div id="clases-kpis">${g.activos.length?'<p class="clase-sin-datos">Cargando números…</p>'
         :`<p class="clase-sin-datos">${g.revision.length?'Cuando aprobemos tu clase, acá vas a ver a cuántas personas llega, cuántas te contactan y cuánto va costando.'
           :'Arma un borrador y mándalo a revisión. Cuando se publique, acá vas a ver cómo le va.'}</p>`}</div>
       <p class="clase-privacidad">“Personas distintas” cuenta a cada cuenta una sola vez; “veces en total” suma cada vez que pasó. Nunca ves nombres. El costo es el de tu campaña y nunca pasa de tu tope.</p>
     </details>`+
    '<section class="clases-seccion"><h3>Tu perfil</h3><div id="clases-logo"></div></section>'+
    salida()+'</div>';
  // Al cambiar el estado se vuelve a pedir la lista: el estado, los números y
  // los botones de cada tarjeta dependen de él, y repintar a mano lo que uno
  // cree que cambió es la forma de que una tarjeta quede mintiendo.
  const repintar=()=>renderEspacioProfesor(raiz,{titulo:!!cabecera('x')});
  const nueva=raiz.querySelector('#clase-nueva');
  if(nueva)nueva.addEventListener('click',()=>renderBorradorProfesor(raiz,null));
  const cajaLogo=raiz.querySelector('#clases-logo');
  if(cajaLogo&&cajaLogo.isConnected&&typeof cajaLogo.addEventListener==='function')renderLogoProfesor(cajaLogo);
  raiz.querySelectorAll('[data-editar]').forEach(b=>
    b.addEventListener('click',()=>renderBorradorProfesor(raiz,anuncios.find(a=>a.id===b.dataset.editar)||null)));
  raiz.querySelectorAll('[data-pausar]').forEach(b=>
    b.addEventListener('click',()=>pausarAnuncioClase(b.dataset.pausar,repintar)));
  // Volver a publicar = volver a borrador y abrirlo: el anuncio pasa por
  // revisión otra vez, y lo natural es revisarlo antes de reenviarlo.
  raiz.querySelectorAll('[data-retomar]').forEach(b=>
    b.addEventListener('click',()=>retomarAnuncioClase(b.dataset.retomar,an=>an?renderBorradorProfesor(raiz,an):repintar())));

  for(const a of g.programados){
    const caja=raiz.querySelector(`[data-metricas="${a.id}"]`);
    if(caja)caja.innerHTML='<p class="clase-sin-datos">Todavía no empieza, así que no hay nada que medir ni que cobrar.</p>';
  }
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
    const totales=m.agregados?m.agregados.total:totalesDeCortes(m.cortes);
    return {a,alcance:m.alcance,porCanal:m.porCanal,totales,agregados:m.agregados,campana:m.campana,
      hayCortes:Object.values(totales).some(n=>n>0),costo:costoCampanaClase(m.campana)};
  }));
  for(const d of medidas){
    const caja=raiz.querySelector(`[data-metricas="${d.a.id}"]`);
    if(!caja||!caja.isConnected)continue;
    const importe=raiz.querySelector(`[data-costo-campana="${d.a.id}"]`);
    if(importe)importe.textContent=d.costo?pesos(d.costo.total):'No disponible';
    const estado=raiz.querySelector(`[data-estado-campana="${d.a.id}"]`);
    if(estado&&d.costo&&d.costo.agotada&&vigenciaAnuncio(d.a,ahora)==='publicado')estado.textContent='Tope alcanzado';
    caja.innerHTML=presupuestoProfesorHTML(d.costo)+(d.costo&&d.costo.agotada?'<p class="clase-aviso-tope">Llegó a tu tope: dejó de mostrarse y no suma más costo.</p>':'')+
      cifrasClase(d,pesos)+'<details class="profesor-hig-estadisticas"><summary>Más estadísticas</summary>'+graficosClase(d,pesos,ahora)+'</details>'+
      (d.hayCortes?'':'<p class="clase-sin-datos">Las veces que se mostró por día aparecen cuando hay suficientes datos para que nadie quede identificado.</p>')+
      (d.costo?`<p class="clase-sin-datos">${esc(lineaCostoCampanaClase(d.costo))}.</p>`:'');
  }

  // El resumen suma solo las clases activas: es "cómo me va ahora". Suma lo que
  // se sabe; si ningún anuncio pudo medir su alcance, sale raya y no cero.
  const kpis=raiz.querySelector('#clases-kpis');
  const activas=medidas.filter(d=>vigenciaAnuncio(d.a,ahora)==='publicado');
  if(kpis&&kpis.isConnected&&activas.length){
    const conAlcance=activas.filter(d=>d.alcance!==null);
    const totales={impresion:0,clic:0,contacto:0};
    activas.forEach(d=>Object.keys(totales).forEach(k=>totales[k]+=d.totales[k]));
    const costo=sumarCostosCampana(activas.map(d=>d.costo));
    const conCampana=activas.filter(d=>d.campana);
    const campana=conCampana.length===activas.length?conCampana.reduce((s,d)=>({vistas:s.vistas+d.campana.vistas,
      aperturas:s.aperturas+d.campana.aperturas,contactos:s.contactos+d.campana.contactos}),{vistas:0,aperturas:0,contactos:0}):null;
    const conCanal=activas.filter(d=>d.porCanal);
    const porCanal=conCanal.length?conCanal.reduce((s,d)=>({recomendacion:s.recomendacion+d.porCanal.recomendacion,
      busqueda:s.busqueda+d.porCanal.busqueda,lista:s.lista+d.porCanal.lista}),{recomendacion:0,busqueda:0,lista:0}):null;
    const alcanceTotal=conAlcance.length?conAlcance.reduce((n,d)=>n+d.alcance,0):null;
    kpis.innerHTML=cifrasClase({alcance:alcanceTotal,totales,hayCortes:activas.some(d=>d.hayCortes),campana,costo},pesos)
      .replace('class="clase-etapas"','class="clase-etapas clases-kpis-etapas"').replace('class="clase-nums"','class="clase-nums clases-kpis"')+
      `<div class="viz-fila">${donaCanalesClase(porCanal)}${costoApiladoClase(costo,pesos)}</div>`+
      embudoClase(totales);
  }
}

// ─── RAMOS DE LA CLASE ──────────────────────────────────────────────────────
//
// El profesor busca el ramo por nombre o sigla en vez de escribir la sigla
// exacta. Las elegidas se guardan igual que antes, separadas por coma, en el
// campo oculto #pr-siglas: la validación y la base no cambian. La búsqueda usa
// el mismo índice sigla → nombre que el catálogo de clases.
function buscarRamosParaClase(indice,consulta,elegidas=[],max=8){
  // "cálculo 2" tiene que encontrar "Cálculo II": misma regla que el buscador
  // de ramos de la app (normBusqueda pasa romanos a números en ambos lados).
  const romanos=t=>typeof normBusqueda==='function'?normBusqueda(t):t;
  const q=romanos(normalizarBusquedaClase(consulta));
  if(!q)return [];
  const tokens=q.split(' ').filter(Boolean),ya=new Set(elegidas);
  const qSigla=q.replace(/\s+/g,'').toUpperCase();
  const out=[];
  for(const [sigla,nombre] of Object.entries(indice||{})){
    if(ya.has(sigla))continue;
    // Cada palabra escrita tiene que ser el comienzo de una palabra del ramo:
    // "2" calza con "Cálculo II" pero no con el 2 perdido dentro de MAT1492.
    const palabras=romanos(normalizarBusquedaClase(sigla+' '+nombre)).split(/[\s()\-.,]+/);
    if(!tokens.every(t=>palabras.some(w=>w.startsWith(t)))&&!sigla.startsWith(qSigla))continue;
    const n=romanos(normalizarBusquedaClase(nombre));
    out.push({sigla,nombre,rango:sigla===qSigla?0:sigla.startsWith(qSigla)?1:n.startsWith(q)?2:3});
  }
  out.sort((a,b)=>a.rango-b.rango||a.nombre.localeCompare(b.nombre,'es')||a.sigla.localeCompare(b.sigla));
  // Una sigla bien formada que no está en el índice también se puede usar: el
  // índice no es exhaustivo (UAI no publica siglas, y UC carga su catálogo
  // completo recién cuando se busca).
  if(/^[A-Z0-9-]{2,24}$/.test(qSigla)&&!/\s/.test(consulta.trim())&&!indice[qSigla]&&!ya.has(qSigla)&&/\d/.test(qSigla))
    out.push({sigla:qSigla,nombre:'Usar esta sigla',rango:9});
  return out.slice(0,max);
}

function activarBuscadorRamosClase(form,campo){
  const buscar=campo('siglas-buscar'),oculto=campo('siglas'),lista=campo('ramos-resultados'),elegidasCaja=campo('ramos-elegidos'),tenantSel=campo('tenant');
  if(!buscar||!oculto||!lista||!elegidasCaja||typeof buscar.addEventListener!=='function')return;
  let indice={};
  const leer=()=>String(oculto.value||'').split(',').map(x=>siglaAnuncio(x)).filter(Boolean);
  const escribir=siglas=>{
    oculto.value=siglas.join(', ');pintarElegidas();
    // El campo oculto no dispara eventos solo: se avisa para que la vista
    // previa muestre el ramo elegido.
    try{if(typeof Event==='function'&&oculto.dispatchEvent)oculto.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}
  };
  const nombreDe=sg=>indice[sg]||'';
  const pintarElegidas=()=>{
    const siglas=leer();
    elegidasCaja.innerHTML=siglas.map(sg=>`<span class="profesor-ramo-chip"><b>${esc(sg)}</b>${nombreDe(sg)?`<span>${esc(nombreDe(sg))}</span>`:''}<button type="button" data-quitar-sigla="${esc(sg)}" aria-label="Quitar ${esc(sg)}">×</button></span>`).join('');
    elegidasCaja.querySelectorAll('[data-quitar-sigla]').forEach(b=>b.addEventListener('click',()=>escribir(leer().filter(x=>x!==b.dataset.quitarSigla))));
    // Con el máximo elegido no se reemplaza ninguno a escondidas: hay que
    // quitar uno para poner otro.
    const lleno=siglas.length>=MAX_RAMOS_POR_ANUNCIO;
    buscar.disabled=lleno;
    buscar.placeholder=lleno?'Ya elegiste dos siglas. Quita una para cambiarla.':siglas.length?'Otra sigla del mismo ramo (opcional)':'Busca por nombre o sigla, ej. Cálculo II';
  };
  const cerrar=()=>{lista.hidden=true;lista.innerHTML='';buscar.setAttribute('aria-expanded','false');};
  const mostrar=()=>{
    const res=buscarRamosParaClase(indice,buscar.value,leer());
    if(!res.length){cerrar();return;}
    lista.innerHTML=res.map((x,i)=>`<li role="option" id="pr-ramo-op-${i}" data-sigla="${esc(x.sigla)}"><b>${esc(x.sigla)}</b><span>${esc(x.nombre)}</span></li>`).join('');
    lista.hidden=false;buscar.setAttribute('aria-expanded','true');
    lista.querySelectorAll('[data-sigla]').forEach(li=>li.addEventListener('mousedown',e=>{e.preventDefault();elegir(li.dataset.sigla);}));
  };
  const elegir=sg=>{
    const actuales=leer();
    if(sg&&actuales.length===1&&actuales[0]!==sg&&!mismoRamoClase(nombreDe(actuales[0]),nombreDe(sg))){
      if(typeof showToast==='function')showToast(ERROR_DOS_RAMOS_CLASE,true);
      buscar.value='';cerrar();buscar.focus();return;
    }
    if(sg&&!actuales.includes(sg)&&actuales.length<MAX_RAMOS_POR_ANUNCIO)escribir([...actuales,sg]);
    buscar.value='';cerrar();buscar.focus();
  };
  const reindexar=()=>{indice=nombresRamosParaClases(tenantSel?tenantSel.value:S.tenant);pintarElegidas();if(buscar.value)mostrar();};
  buscar.addEventListener('input',mostrar);
  buscar.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();const primera=lista.querySelector('[data-sigla]');if(primera)elegir(primera.dataset.sigla);}
    else if(e.key==='Escape')cerrar();
  });
  buscar.addEventListener('blur',()=>setTimeout(cerrar,120));
  if(tenantSel)tenantSel.addEventListener('change',()=>{
    reindexar();
    if(tenantSel.value==='uc'&&typeof cargarCursosUC==='function')cargarCursosUC().then(ok=>{if(ok&&form.isConnected)reindexar();}).catch(()=>{});
  });
  reindexar();
  // El catálogo UC completo llega diferido: se busca con lo que hay y se
  // enriquece cuando termina de bajar.
  if((tenantSel?tenantSel.value:S.tenant)==='uc'&&typeof cargarCursosUC==='function')
    cargarCursosUC().then(ok=>{if(ok&&form.isConnected)reindexar();}).catch(()=>{});
}

// El logo es de la ficha, no del anuncio: el mismo bloque aparece en el
// formulario y en la página de Clases, y cambiarlo en uno cambia el otro.
async function renderLogoProfesor(caja){
  if(!caja)return;
  const ficha=await perfilProfesorActual();
  if(!caja.isConnected)return;
  const perfil=ficha.ok?ficha.perfil:null,estado=estadoLogoProfesor(perfil);
  if(estado==='no-disponible'){caja.innerHTML='';return;}
  const textos={
    'sin-logo':'Sale a la derecha en todos tus anuncios publicados.',
    'en-revision':perfil.logo_aprobado_path?'Tu logo nuevo está en revisión. Mientras tanto se sigue mostrando el anterior.':'Tu logo está en revisión. Aparecerá en tus anuncios cuando lo aprobemos.',
    'aprobado':'Se muestra en todos tus anuncios publicados.',
  };
  caja.innerHTML=`<div class="profesor-logo">
      <div class="profesor-logo-img" aria-hidden="true"></div>
      <div class="profesor-logo-texto"><strong>Tu logo${estado==='en-revision'?' · en revisión':''}</strong><span>${textos[estado]}</span></div>
    </div>
    <div class="profesor-logo-acciones">
      <label class="btn-cancel profesor-logo-subir">${estado==='sin-logo'?'Subir logo':'Cambiar logo'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
      ${estado==='sin-logo'?'':'<button type="button" class="btn-cancel profesor-logo-quitar">Quitar</button>'}
    </div>
    <p class="profesor-estado" role="status" aria-live="polite"></p>`;
  const aviso=caja.querySelector('.profesor-estado');
  const ruta=perfil.logo_path||perfil.logo_aprobado_path;
  const avisarLogo=url=>{try{document.dispatchEvent(new CustomEvent('gradehub:logo-profesor',{detail:url||''}));}catch(e){}};
  if(ruta)urlFlyerClase(ruta).then(url=>{const img=caja.querySelector('.profesor-logo-img');if(url&&img&&img.isConnected)img.innerHTML=imgLogoClase(url);avisarLogo(url);});
  else avisarLogo('');
  caja.querySelector('input[type=file]').addEventListener('change',async e=>{
    const file=e.target.files&&e.target.files[0];if(!file)return;
    aviso.textContent='Subiendo logo…';
    const r=await subirLogoProfesor(file);
    if(!caja.isConnected)return;
    if(!r.ok){aviso.textContent=r.error;e.target.value='';return;}
    renderLogoProfesor(caja);
  });
  const quitar=caja.querySelector('.profesor-logo-quitar');
  if(quitar)quitar.addEventListener('click',async()=>{
    aviso.textContent='Quitando logo…';
    const r=await quitarLogoProfesor();
    if(!caja.isConnected)return;
    if(!r.ok){aviso.textContent=r.error;return;}
    renderLogoProfesor(caja);
  });
}

// La tarjeta de ramo de la vista previa es la misma de Inicio (mismas clases,
// mismo tamaño), con una raya en vez de nota: la nota es de cada estudiante.
function filaRamoVistaPrevia(extra){
  return `<div class="ramo-row has-progress tiene-clase-apoyo${extra}" style="--ramo-tint:var(--fg3);--ramo-progress-scale:.3" aria-hidden="true">
      <div class="ramo-band"></div>
      <div class="ramo-info"><span class="ramo-name">Tu ramo</span><div class="ramo-meta"><span class="ramo-sigla">Sigla</span><span class="ramo-meta-text">30% evaluado</span></div></div>
      <div class="ramo-grade-action"><div class="ramo-nota vista-sin-nota">—</div><span class="chevron-r">›</span></div>
      <span class="ramo-progress-track"><span class="ramo-progress-fill"></span></span></div>`;
}
// La campaña vive aparte del anuncio (anuncio_campanas): el tope es del
// profesor y el anuncio lo lee cualquiera. Sin el SQL de campañas, `falta`
// avisa que no se pudo guardar sin tratarlo como un error de la persona.
// Solo ausencia explícita de esquema: jamás degradar por red, RLS o validación.
function sqlClasesDesactualizado(error){
  return !!error&&['42883','42703','PGRST202','PGRST204','42P01','PGRST205'].includes(error.code);
}
function faltaTablaCampana(error){return sqlClasesDesactualizado(error);}
const compatibilidadSqlClases={campanas:false,cobros:false};
const AVISO_SQL_CLASES='SQL de campañas pendiente. Se usa el modo anterior: los cobros solo se guardan para la publicación actual y los días y el tope pueden no estar guardados. Aplica los tres archivos SQL antes de publicar o renovar campañas.';
async function leerCampanaClase(anuncioId,{diagnostico=false,estricto=false}={}){
  if(!supabaseClient||!anuncioId)return null;
  try{
    const {data,error}=await supabaseClient.from('anuncio_campanas').select('dias,inicio,tope_clp').eq('anuncio_id',anuncioId).maybeSingle();
    if(error){if(estricto)throw error;if(faltaTablaCampana(error)){compatibilidadSqlClases.campanas=true;return diagnostico?{sqlAnterior:true}:null;}console.warn('No se pudo leer la campaña:',error.code||'',error.message||error);return null;}
    compatibilidadSqlClases.campanas=false;return data||null;
  }catch(e){if(estricto)throw e;return null;}
}
async function guardarCampanaClase(anuncioId,datos){
  if(!supabaseClient||!anuncioId)return {ok:false,error:'no pudimos guardar la campaña.'};
  // No se usa upsert: PostgREST lo traduce a ON CONFLICT DO UPDATE SET
  // anuncio_id=…, y el cliente no tiene UPDATE sobre anuncio_id (a propósito:
  // una campaña no se muda de anuncio). Postgres exige ese permiso aunque no
  // haya conflicto, así que fallaba SIEMPRE con 42501 y el anuncio no se podía
  // enviar a revisión. Primero se actualiza; si no había fila, se inserta.
  try{
    const tabla=()=>supabaseClient.from('anuncio_campanas');
    let {data,error}=await tabla().update(datos).eq('anuncio_id',anuncioId).select('anuncio_id');
    if(!error&&!(Array.isArray(data)&&data.length)){
      ({error}=await tabla().insert({anuncio_id:anuncioId,...datos}));
      // Otra pestaña la creó entre medio: ahora sí hay fila que actualizar.
      if(error&&error.code==='23505'){
        ({data,error}=await tabla().update(datos).eq('anuncio_id',anuncioId).select('anuncio_id'));
        if(!error&&!(Array.isArray(data)&&data.length))error={code:'SIN_FILA',message:'la campaña no quedó guardada'};
      }
    }
    if(!error){compatibilidadSqlClases.campanas=false;return {ok:true};}
    if(faltaTablaCampana(error)){compatibilidadSqlClases.campanas=true;return {ok:false,falta:true,error:'el servidor aún no guarda los días y el tope; se usará el proceso de revisión anterior.'};}
    console.warn('No se guardó la campaña:',error.code||'',error.message||error);
    return {ok:false,error:'no pudimos guardar los días y el tope. Intenta de nuevo.'};
  }catch(e){return {ok:false,error:'no pudimos guardar los días y el tope. Intenta de nuevo.'};}
}

function renderBorradorProfesor(raiz,anuncio){
  let id=anuncio&&anuncio.id||null,flyerActual=anuncio&&anuncio.flyer_path||null;
  const valor=(campo,defecto='')=>esc(anuncio&&anuncio[campo]!=null?anuncio[campo]:defecto);
  const tipoContactoInicial=anuncio&&PREFIJO_CONTACTO_CLASE[anuncio.contacto_tipo]!==undefined?anuncio.contacto_tipo:'whatsapp';
  const elegir=(opciones,actual)=>opciones.map(([clave,texto])=>`<option value="${clave}"${actual===clave?' selected':''}>${texto}</option>`).join('');
  raiz.innerHTML='<div class="profesor-hig profesor-hig-editor">'+cabeceraProfesorHTML(id?'Edita tu borrador.':'Prepara tu clase.',
    'Nada se publica al guardar. Completa tu clase, revisa el público y luego envíala a revisión.','',raiz.id==='modal-content'?'modal-titulo':'profesor-titulo')+`
    <form class="profesor-form" id="profesor-borrador">
      <!-- Campos y vista previa van juntos para que la vista previa, sticky en
           computador, se detenga donde termina esta fila y no baje a los botones. -->
      <div class="profesor-form-cuerpo">
      <div class="profesor-form-campos">
      <details class="profesor-seccion" open><summary><h3>1. Tu clase</h3></summary><div class="profesor-seccion-cuerpo">
      <label class="modal-label" for="pr-titulo">Título del anuncio</label><input id="pr-titulo" type="text" minlength="5" maxlength="90" required value="${valor('titulo')}">
      <label class="modal-label" for="pr-descripcion">Descripción</label><textarea id="pr-descripcion" minlength="20" maxlength="1500" required placeholder="Qué van a trabajar, cómo son tus clases y tu experiencia con el ramo.">${valor('descripcion')}</textarea>
      <label class="modal-label" for="pr-precio">Precio por clase</label><input id="pr-precio" type="text" inputmode="numeric" autocomplete="off" required placeholder="$15.000" aria-describedby="pr-precio-ayuda" value="${esc(textoPesosEscrito(anuncio&&anuncio.precio_clp))}"><p class="profesor-info" id="pr-precio-ayuda">Si la clase es gratis, pon $0: se mostrará como "Gratis".</p>
      <label class="modal-label" for="pr-pack">Clases por pack · opcional</label><input id="pr-pack" type="number" inputmode="numeric" min="${MIN_PACK_CLASES}" max="${MAX_PACK_CLASES}" step="1" placeholder="Ej. 4" aria-describedby="pr-pack-ayuda" value="${valor('pack_clases')}"><p class="profesor-info" id="pr-pack-ayuda">Si vendes un pack, pon cuántas clases trae. El precio de arriba sigue siendo por clase: mostramos el total del pack.</p>
      <label class="modal-label" for="pr-modalidad">Formato · opcional</label><select id="pr-modalidad">${elegir([['','No indicar'],...MODALIDADES_CLASE,['otra','Otra…']],anuncio&&anuncio.modalidad||'')}</select>
      <input id="pr-modalidad-otra" type="text" maxlength="40" aria-label="Escribe el formato" placeholder="Ej. grupos de hasta 3" value="${valor('modalidad_otra')}" ${anuncio&&anuncio.modalidad==='otra'?'':'hidden'}>
      <label class="modal-label" for="pr-ubicacion">Dónde · opcional</label><select id="pr-ubicacion">${elegir([['','No indicar'],...UBICACIONES_CLASE,['otra','Otra…']],anuncio&&anuncio.ubicacion||'')}</select>
      <input id="pr-ubicacion-otra" type="text" maxlength="40" aria-label="Escribe dónde es la clase" placeholder="Ej. en tu casa o en la biblioteca" value="${valor('ubicacion_otra')}" ${anuncio&&anuncio.ubicacion==='otra'?'':'hidden'}>
      <div class="profesor-detalles" id="pr-detalles-caja">
        <span class="modal-label">Detalles · opcional</span>
        <p class="profesor-info">Lo que quieras destacar, como "Duración: 90 minutos" o "Incluye: guía de ejercicios". Hasta ${MAX_DETALLES_CLASE}.</p>
        <div id="pr-detalles"></div>
        <button class="btn-cancel profesor-detalle-agregar" id="pr-agregar-detalle" type="button">Agregar un detalle</button>
      </div>
      <fieldset class="profesor-linea" id="pr-linea-caja">
        <legend class="modal-label">Bajo el título · hasta ${MAX_LINEA_CLASE}</legend>
        <p class="profesor-info">Es lo primero que lee el estudiante en Inicio, junto a su ramo. Elige lo que más ayuda a decidir; el resto aparece cuando abre tu clase.</p>
        <div class="profesor-linea-opciones" id="pr-linea"></div>
      </fieldset>
      <div class="profesor-contacto-tipo" id="pr-contacto-tipo-caja" hidden>
        <label class="modal-label" for="pr-contacto-tipo">Cómo te contactarán</label><select id="pr-contacto-tipo">${elegir(CONTACTOS_CLASE,tipoContactoInicial)}</select>
        <p class="profesor-info">Como la clase es gratis, puedes llevar a tu Instagram o a un link de inscripción en vez de WhatsApp.</p>
      </div>
      <label class="modal-label" for="pr-contacto" id="pr-contacto-etiqueta">Tu WhatsApp</label><input id="pr-contacto" type="text" minlength="3" maxlength="160" required autocomplete="off" aria-describedby="pr-contacto-error pr-contacto-ayuda" placeholder="${esc(EJEMPLO_CONTACTO_CLASE[tipoContactoInicial])}" value="${esc(anuncio&&anuncio.contacto_valor!=null?anuncio.contacto_valor:PREFIJO_CONTACTO_CLASE[tipoContactoInicial])}">
      <p id="pr-contacto-error" role="alert" hidden style="margin:6px 0 0;font-size:0.8125rem;color:var(--red);"></p>
      <p class="profesor-info" id="pr-contacto-ayuda"></p>
      <label class="modal-label" for="pr-flyer">Flyer · opcional</label><input id="pr-flyer" type="file" accept="image/jpeg,image/png,image/webp"><p class="profesor-info">JPG, PNG o WebP · máximo 5 MB. Primero se guarda el borrador y después se sube la imagen.</p>
      <div class="profesor-flyer-preview" hidden><img alt="Vista previa del flyer"></div>
      <button class="btn-cancel" id="pr-quitar-flyer" type="button" ${flyerActual?'':'hidden'}>Quitar flyer guardado</button>
      <div id="pr-logo"></div>
      </div></details>
      <details class="profesor-seccion" open><summary><h3>2. Público</h3></summary><div class="profesor-seccion-cuerpo">
      <label class="modal-label" for="pr-tenant">Universidad</label><select id="pr-tenant">${elegir([['uc','UC'],['fen','FEN'],['uai','UAI'],['uandes','UAndes']],anuncio&&anuncio.tenant||S.tenant)}</select>
      <label class="modal-label" for="pr-siglas-buscar">Ramo de tu clase</label>
      <div class="profesor-ramos" id="pr-ramos-elegidos" aria-live="polite"></div>
      <div class="profesor-ramos-buscar">
        <input id="pr-siglas-buscar" type="search" autocomplete="off" placeholder="Busca por nombre o sigla, ej. Cálculo II" aria-describedby="pr-siglas-ayuda" aria-controls="pr-ramos-resultados">
        <ul class="profesor-ramos-resultados" id="pr-ramos-resultados" role="listbox" hidden></ul>
      </div>
      <p class="profesor-info" id="pr-siglas-ayuda">Si tu ramo tiene dos siglas, como Dinámica ICE1514 y FIS1514, puedes elegir las dos. Otro ramo va en otro anuncio. Si no aparece, escribe su sigla completa.</p>
      <input id="pr-siglas" type="hidden" value="${esc(anuncio&&Array.isArray(anuncio.ramos_siglas)?anuncio.ramos_siglas.join(', '):'')}">
      <label class="modal-label" for="pr-promedio">Promedio menor a</label><input id="pr-promedio" type="number" min="1.1" max="7" step="0.1" required value="${esc(anuncio&&anuncio.criterios?anuncio.criterios.promedioMenorA:5)}">
      <label class="modal-label" for="pr-avance">Mínimo evaluado · %</label><input id="pr-avance" type="number" min="0" max="99" step="1" required value="${esc(anuncio&&anuncio.criterios?anuncio.criterios.avanceMinimo:20)}">
      <p class="profesor-info">GradeHub calcula el público sin mostrarte notas ni identidades.</p>
      </div></details>
      <details class="profesor-seccion" open><summary><h3>3. Tu campaña</h3></summary><div class="profesor-seccion-cuerpo">
      <div class="profesor-campana">
        <div class="profesor-campana-fechas">
          <div><label class="modal-label" for="pr-inicio">Empieza · opcional</label><input id="pr-inicio" type="date" min="${hoyChileClase()}"></div>
          <div><label class="modal-label" for="pr-dias">Días</label><input id="pr-dias" type="number" inputmode="numeric" min="1" max="${MAX_DIAS_CAMPANA}" step="1" required value="${DIAS_CAMPANA_POR_OMISION}"></div>
          <div><label class="modal-label" for="pr-fin">Termina</label><input id="pr-fin" type="date" min="${hoyChileClase()}"></div>
        </div>
        <p class="profesor-info">Sin fecha de inicio, parte apenas la aprobemos. Puedes elegir los días o la fecha de término: el otro se ajusta solo.</p>
        <label class="modal-label" for="pr-tope">Tope · lo máximo que pagarías</label><input id="pr-tope" type="text" inputmode="numeric" autocomplete="off" required placeholder="${esc(textoPesosEscrito(TOPE_CAMPANA_POR_OMISION))}" value="${esc(textoPesosEscrito(TOPE_CAMPANA_POR_OMISION))}">
        <p class="profesor-info">Cuesta ${pesosClase(TARIFA_CAMPANA.dia)} por día publicada y, por persona, ${pesosClase(TARIFA_CAMPANA.vista)} si la ve, ${pesosClase(TARIFA_CAMPANA.apertura)} si la abre y ${pesosClase(TARIFA_CAMPANA.contacto)} si te contacta. Cada persona cuenta una vez. Al llegar al tope deja de mostrarse: nunca pagas más que eso. El pago se coordina con GradeHub antes de publicar.</p>
        <p class="profesor-campana-resumen" id="pr-campana-resumen" aria-live="polite"></p><button type="button" class="btn-cancel" id="pr-reintentar-campana" hidden>Reintentar carga de campaña</button>
      </div>
      </div></details>
      </div>
      <section class="profesor-form-vista" aria-labelledby="pr-vista-titulo">
      <div class="vista-cabeza"><h3 id="pr-vista-titulo">4. Así la van a ver</h3></div>
      <!-- Solo la vista de celular. La de computador era la pantalla entera de
           Inicio achicada a la columna del formulario, y quedaba ilegible; el
           banner dice lo mismo en los dos, y la mayoría entra desde el iPhone. -->
      <div class="profesor-vista-previa modo-celular" id="pr-vista">
        <div class="vista-solo-cel"><p class="profesor-info">En Inicio, junto al ramo del estudiante:</p>
        <div class="vista-celular">${filaRamoVistaPrevia('')}<aside class="clase-apoyo vista-anuncio"></aside></div></div>
        <p class="profesor-info">La nota del ramo es la de cada estudiante: acá va una raya porque cambia para cada uno.</p>
        <p class="profesor-info">Al abrirla, y en el catálogo de clases, con tu flyer si subiste uno:</p>
        <div class="vista-catalogo" aria-hidden="true"></div>
      </div>
      </section>
      </div>
      <div class="profesor-form-acciones">
      <div class="modal-btns"><button class="btn-cancel" id="pr-guardar" type="button">Guardar borrador</button><button class="btn-confirm" id="pr-enviar" type="button">Enviar a revisión</button></div>
      <p class="profesor-estado" role="status" aria-live="polite">${id?'Borrador recuperado. Puedes seguir editándolo.':'Completa la clase para guardar el primer borrador.'}</p>
      </div>
    </form></div>`;
  const form=raiz.querySelector('#profesor-borrador'),campo=id=>form.querySelector('#pr-'+id),estado=form.querySelector('.profesor-estado');
  let procesando=false,campanaLista=!id;
  // Vista previa en vivo: el mismo contenido que verá el estudiante en Inicio,
  // armado con lo que el profesor lleva escrito y su logo.
  const vista=form.querySelector('#pr-vista');
  let logoVista='';
  const valorCampo=id=>{const el=campo(id);return el?String(el.value||''):'';};
  // Qué datos van bajo el título. Se guarda como claves, en el orden en que se
  // muestran; si coincide con lo de siempre se guarda null, como los anuncios
  // que ya existían.
  const lineaElegida=new Set(Array.isArray(anuncio&&anuncio.linea_datos)?anuncio.linea_datos:LINEA_CLASE_POR_OMISION);
  const cajaLinea=campo('linea');let firmaLinea='';
  const borradorEnVivo=()=>({titulo:valorCampo('titulo').trim(),precio_clp:pesosDeTexto(valorCampo('precio')),pack_clases:valorCampo('pack').trim(),
    modalidad:valorCampo('modalidad'),modalidad_otra:valorCampo('modalidad-otra').trim(),
    ubicacion:valorCampo('ubicacion'),ubicacion_otra:valorCampo('ubicacion-otra').trim(),
    detalles:leerDetalles(),linea_datos:[...lineaElegida]});
  const lineaParaGuardar=b=>{
    const claves=opcionesLineaClase(b).map(o=>o.clave);
    const elegidas=claves.filter(c=>lineaElegida.has(c)),omision=claves.filter(c=>LINEA_CLASE_POR_OMISION.includes(c));
    return elegidas.join()===omision.join()?null:elegidas;
  };
  const pintarLinea=b=>{
    if(!cajaLinea||typeof cajaLinea.querySelectorAll!=='function')return;
    const ops=opcionesLineaClase(b),firma=JSON.stringify(ops.map(o=>[o.clave,o.nombre,o.texto]));
    // Solo se rehace si cambiaron las opciones: marcar una casilla no le quita
    // el foco.
    if(firma!==firmaLinea){
      firmaLinea=firma;
      cajaLinea.innerHTML=ops.map(o=>`<label class="profesor-linea-opcion"><input type="checkbox" value="${esc(o.clave)}"><span><b>${esc(o.nombre)}</b> ${esc(o.texto)}</span></label>`).join('');
    }
    const marcadas=ops.filter(o=>lineaElegida.has(o.clave)).length;
    cajaLinea.querySelectorAll('input').forEach(i=>{i.checked=lineaElegida.has(i.value);i.disabled=!i.checked&&marcadas>=MAX_LINEA_CLASE;});
  };
  // Una casilla dispara input y después change, y el formulario repinta con
  // los dos: la elección se anota en el primero para que el repintado no
  // devuelva la casilla a como estaba.
  const anotarLinea=e=>{
    const i=e.target;if(!i||i.type!=='checkbox')return;
    if(i.checked)lineaElegida.add(i.value);else lineaElegida.delete(i.value);
  };
  if(cajaLinea){cajaLinea.addEventListener('input',anotarLinea);cajaLinea.addEventListener('change',anotarLinea);}
  const actualizarVista=()=>{
    const borrador=borradorEnVivo();
    pintarLinea(borrador);
    if(!vista||typeof vista.querySelectorAll!=='function')return;
    pintarVistaCatalogo(borrador);
    vista.querySelectorAll('.vista-anuncio').forEach(el=>{el.innerHTML=contenidoRecomendacionClase(borrador,{logoUrl:logoVista,vistaPrevia:true});});
    const sigla=valorCampo('siglas').split(',').map(x=>siglaAnuncio(x)).filter(Boolean)[0]||'';
    const nombre=sigla?(nombresRamosParaClases(valorCampo('tenant')||S.tenant)[sigla]||sigla):'Tu ramo';
    vista.querySelectorAll('.ramo-name').forEach(el=>{el.textContent=nombre;});
    vista.querySelectorAll('.ramo-sigla').forEach(el=>{el.textContent=sigla||'Sigla';});
  };
  // La tarjeta del catálogo, abierta, con el flyer que eligió (el guardado o el
  // que acaba de escoger, antes de subirlo). El botón no lleva a ninguna parte.
  let flyerVista='';
  const pintarVistaCatalogo=borrador=>{
    const caja=vista.querySelector('.vista-catalogo');
    if(!caja)return;
    const elegidas=valorCampo('siglas').split(',').map(x=>siglaAnuncio(x)).filter(Boolean);
    const siglasVista=elegidas.length?elegidas:['SIGLA'];
    const nombres=siglasVista.map(sg=>nombresRamosParaClases(valorCampo('tenant')||S.tenant)[sg]).filter(Boolean);
    caja.innerHTML=tarjetaCatalogoClase({...borrador,id:'vista-previa',titulo:borrador.titulo||'Tu clase',
      descripcion:valorCampo('descripcion').trim()||'Acá va la descripción de tu clase.',ramos_siglas:siglasVista,nombres_ramos:nombres,
      ...(t=>({contacto_tipo:t,contacto_valor:(v=>v&&v!==PREFIJO_CONTACTO_CLASE[t].trim()?v:EJEMPLO_CONTACTO_CLASE[t])(valorCampo('contacto').trim())}))(contactosPermitidosClase(pesosDeTexto(valorCampo('precio'))).includes(valorCampo('contacto-tipo'))?valorCampo('contacto-tipo'):'whatsapp'),flyer_path:flyerVista?'vista-previa':null},{abierta:true});
    const flyer=caja.querySelector('.catalogo-clase-flyer');
    if(flyer){flyer.removeAttribute('data-flyer');flyer.hidden=false;flyer.innerHTML=`<img src="${esc(flyerVista)}" alt="">`;}
    if(logoVista){const cabeza=caja.querySelector('.catalogo-clase-cabeza');if(cabeza)cabeza.insertAdjacentHTML('beforeend',`<div class="catalogo-clase-logo">${imgLogoClase(logoVista)}</div>`);}
    caja.querySelectorAll('a').forEach(a=>{a.removeAttribute('href');a.setAttribute('tabindex','-1');});
  };
  form.addEventListener('input',actualizarVista);form.addEventListener('change',actualizarVista);
  // El logo vive en la ficha: se pide una vez y se actualiza cuando lo cambian.
  if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('gradehub:logo-profesor',e=>{
    if(!form.isConnected)return;logoVista=e.detail||'';actualizarVista();
  });
  campoPesos(campo('precio'));
  // La campaña: días y fecha de término se ajustan entre sí, y el resumen
  // traduce el tope a algo concreto.
  const inicioC=campo('inicio'),diasC=campo('dias'),finC=campo('fin'),topeC=campo('tope'),resumenC=campo('campana-resumen');
  campoPesos(topeC);
  const baseCampana=()=>valorCampo('inicio')||hoyChileClase();
  const ajustarFin=()=>{const d=Number(valorCampo('dias'));if(finC&&Number.isSafeInteger(d)&&d>0)finC.value=sumarDiasFechaClase(baseCampana(),d-1);};
  const ajustarDias=()=>{const n=diasEntreFechasClase(baseCampana(),valorCampo('fin'));if(diasC&&Number.isFinite(n)&&n>=0)diasC.value=String(n+1);};
  const resumirCampana=()=>{
    if(!resumenC)return;
    const d=Number(valorCampo('dias')),tope=pesosDeTexto(valorCampo('tope'));
    if(!Number.isSafeInteger(d)||d<1||!Number.isSafeInteger(tope)){resumenC.textContent='';return;}
    const porDias=d*TARIFA_CAMPANA.dia,queda=tope-porDias;
    resumenC.textContent=queda<=0
      ?`Tu tope alcanza para ${Math.floor(tope/TARIFA_CAMPANA.dia)} días: la clase dejará de mostrarse antes de terminar.`
      :`${d} ${d===1?'día':'días'} suman ${pesosClase(porDias)}. Te quedan ${pesosClase(queda)} para personas: por ejemplo ${Math.floor(queda/TARIFA_CAMPANA.contacto)} contactos, o ${new Intl.NumberFormat('es-CL').format(Math.floor(queda/TARIFA_CAMPANA.vista))} personas que la ven.`;
  };
  if(inicioC)inicioC.addEventListener('input',()=>{ajustarFin();resumirCampana();});
  if(diasC)diasC.addEventListener('input',()=>{ajustarFin();resumirCampana();});
  if(finC)finC.addEventListener('input',()=>{ajustarDias();resumirCampana();});
  if(topeC)topeC.addEventListener('input',resumirCampana);
  ajustarFin();resumirCampana();
  // No reemplazar una campaña existente por los valores por omisión si falla
  // su lectura. El guardado se habilita solo después de recuperarla.
  const reintentarCampana=campo('reintentar-campana');
  const cargarCampanaGuardada=async()=>{
    campanaLista=false;
    const controles=[diasC,inicioC,finC,topeC,campo('guardar'),campo('enviar')].filter(Boolean);
    controles.forEach(c=>c.disabled=true);
    if(reintentarCampana)reintentarCampana.hidden=true;
    estado.textContent='Recuperando los días y el tope de tu campaña…';
    try{
      const c=await leerCampanaClase(id,{estricto:true});
      if(!form.isConnected)return;
      if(c){
        if(diasC)diasC.value=String(c.dias);
        if(inicioC)inicioC.value=c.inicio&&c.inicio>=hoyChileClase()?c.inicio:'';
        if(topeC)topeC.value=textoPesosEscrito(c.tope_clp);
      }
      ajustarFin();resumirCampana();campanaLista=true;
      controles.forEach(c=>c.disabled=false);
      estado.textContent='Borrador recuperado. Puedes seguir editándolo.';
    }catch(e){
      if(!form.isConnected)return;
      estado.textContent='No pudimos recuperar tu campaña. Reintenta antes de guardar para conservar sus días y su tope.';
      if(reintentarCampana)reintentarCampana.hidden=false;
    }
  };
  if(reintentarCampana)reintentarCampana.addEventListener('click',cargarCampanaGuardada);
  if(id)cargarCampanaGuardada();
  // "Otra…" abre su casilla de texto; cualquier otra opción la esconde.
  [['modalidad','modalidad-otra'],['ubicacion','ubicacion-otra']].forEach(([sel,texto])=>{
    const selector=campo(sel),caja=campo(texto);
    if(!selector||!caja)return;
    selector.addEventListener('change',()=>{caja.hidden=selector.value!=='otra';if(!caja.hidden&&typeof caja.focus==='function')caja.focus();});
  });
  const listaDetalles=campo('detalles'),agregarDetalle=campo('agregar-detalle');
  const filaDetalle=(d={})=>{
    if(!listaDetalles||typeof document==='undefined'||!document.createElement)return;
    const fila=document.createElement('div');fila.className='profesor-detalle';
    fila.innerHTML=`<input type="text" class="detalle-etiqueta" maxlength="${MAX_ETIQUETA_DETALLE}" placeholder="Duración" aria-label="Nombre del detalle" value="${esc(d.etiqueta||'')}">
      <input type="text" class="detalle-valor" maxlength="${MAX_VALOR_DETALLE}" placeholder="90 minutos" aria-label="Qué dice el detalle" value="${esc(d.valor||'')}">
      <button type="button" class="profesor-detalle-quitar" aria-label="Quitar este detalle">Quitar</button>`;
    fila.querySelector('.profesor-detalle-quitar').addEventListener('click',()=>{fila.remove();refrescarDetalles();actualizarVista();});
    listaDetalles.appendChild(fila);refrescarDetalles();
  };
  const refrescarDetalles=()=>{if(agregarDetalle&&listaDetalles&&listaDetalles.children)agregarDetalle.hidden=listaDetalles.children.length>=MAX_DETALLES_CLASE;};
  if(agregarDetalle)agregarDetalle.addEventListener('click',()=>{filaDetalle();const ultima=listaDetalles&&listaDetalles.lastElementChild;ultima&&ultima.querySelector('input').focus();});
  const leerDetalles=()=>listaDetalles&&typeof listaDetalles.querySelectorAll==='function'
    ?[...listaDetalles.querySelectorAll('.profesor-detalle')].map(f=>({etiqueta:f.querySelector('.detalle-etiqueta').value,valor:f.querySelector('.detalle-valor').value})):[];
  detallesClase(anuncio).forEach(d=>filaDetalle(d));
  actualizarVista();
  activarBuscadorRamosClase(form,campo);
  const cajaLogo=campo('logo');
  if(cajaLogo)renderLogoProfesor(cajaLogo);
  // WhatsApp parte con "+56 9 " escrito y se ordena con sus espacios. Si la
  // clase es gratis aparece el selector con Instagram y link de inscripción;
  // si deja de ser gratis, vuelve a WhatsApp.
  const contacto=campo('contacto'),tipoContacto=campo('contacto-tipo'),cajaTipo=campo('contacto-tipo-caja');
  const tipoActual=()=>{const t=tipoContacto?tipoContacto.value:'whatsapp';return contactosPermitidosClase(pesosDeTexto(valorCampo('precio'))).includes(t)?t:'whatsapp';};
  formatearAlEscribir(contacto,texto=>{const t=tipoActual();return t==='whatsapp'?textoWhatsappEscrito(texto):t==='instagram'?textoInstagramEscrito(texto):texto;});
  const ayudaContacto={whatsapp:'Tu número no aparece en el anuncio. El estudiante te escribe con un botón y el chat parte con «Hola, vi tu clase … en GradeHub».',
    instagram:'El botón del anuncio abre tu perfil de Instagram.',enlace:'El botón «Inscribirme» abre este link en una pestaña nueva.'};
  const etiquetaContacto={whatsapp:'Tu WhatsApp',instagram:'Tu Instagram',enlace:'Link de inscripción'};
  let tipoMostrado=null;const escritoPorCanal={};
  const refrescarContacto=()=>{
    const gratis=pesosDeTexto(valorCampo('precio'))===0;
    if(cajaTipo)cajaTipo.hidden=!gratis;
    const t=tipoActual();
    if(t===tipoMostrado)return;
    // Cada canal guarda lo suyo: al pasar de WhatsApp a Instagram el número
    // no queda bajo "Tu Instagram", y al volver reaparece tal como estaba.
    if(tipoMostrado!==null&&contacto){
      escritoPorCanal[tipoMostrado]=String(contacto.value||'');
      contacto.value=escritoPorCanal[t]||PREFIJO_CONTACTO_CLASE[t];
    }
    tipoMostrado=t;
    if(contacto){contacto.placeholder=EJEMPLO_CONTACTO_CLASE[t];if(typeof contacto.setAttribute==='function')contacto.setAttribute('inputmode',t==='whatsapp'?'tel':t==='enlace'?'url':'text');}
    const etiqueta=campo('contacto-etiqueta');if(etiqueta)etiqueta.textContent=etiquetaContacto[t];
    const ayuda=campo('contacto-ayuda');if(ayuda)ayuda.textContent=ayudaContacto[t];
  };
  if(tipoContacto&&typeof tipoContacto.addEventListener==='function')tipoContacto.addEventListener('change',refrescarContacto);
  if(campo('precio')&&typeof campo('precio').addEventListener==='function')campo('precio').addEventListener('input',refrescarContacto);
  refrescarContacto();
  const preview=form.querySelector('.profesor-flyer-preview');
  if(flyerActual)urlFlyerClase(flyerActual).then(url=>{if(url&&preview.isConnected){preview.querySelector('img').src=url;preview.hidden=false;flyerVista=url;actualizarVista();}});
  campo('flyer').addEventListener('change',()=>{
    const file=campo('flyer').files&&campo('flyer').files[0],validacion=validarFlyerClase(file);
    if(!validacion.ok){campo('flyer').value='';estado.textContent=validacion.error;return;}
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{if(!preview.isConnected)return;preview.querySelector('img').src=String(reader.result||'');preview.hidden=false;flyerVista=String(reader.result||'');actualizarVista();estado.textContent='Flyer listo para subir cuando guardes.';};
    reader.onerror=()=>{estado.textContent='No pudimos leer ese flyer. Elige otra imagen.';};
    reader.readAsDataURL(file);
  });
  form.querySelector('#pr-quitar-flyer').addEventListener('click',async()=>{
    if(!id||procesando)return;
    procesando=true;
    estado.textContent='Quitando flyer…';
    const resultado=await quitarFlyerClase(id);procesando=false;
    estado.textContent=resultado.ok?resultado.aviso||'Flyer quitado del borrador.':resultado.error;
    if(resultado.ok){flyerActual=null;campo('flyer').value='';preview.hidden=true;form.querySelector('#pr-quitar-flyer').hidden=true;flyerVista='';actualizarVista();}
  });
  // Un campo pendiente dentro de una sección cerrada no se puede mostrar:
  // se abre su sección antes de avisar o de llevar el foco ahí.
  const abrirSeccionDe=el=>{const d=el&&typeof el.closest==='function'?el.closest('details'):null;if(d)d.open=true;return el;};
  const enfocar=el=>{abrirSeccionDe(el);if(el&&typeof el.focus==='function')el.focus();};
  // Un número mal escrito se dice bajo su casilla, en rojo, y la pantalla se
  // lleva hasta ahí: el aviso de abajo del formulario solo no se ve en móvil.
  const errorContacto=campo('contacto-error');
  const marcarContacto=mensaje=>{
    const input=campo('contacto');
    if(errorContacto){errorContacto.textContent=mensaje;errorContacto.hidden=false;}
    if(input&&typeof input.setAttribute==='function')input.setAttribute('aria-invalid','true');
    enfocar(input);
    if(input&&typeof input.scrollIntoView==='function')input.scrollIntoView({block:'center'});
  };
  const limpiarContacto=()=>{
    if(errorContacto&&!errorContacto.hidden){errorContacto.hidden=true;errorContacto.textContent='';}
    const input=campo('contacto');if(input&&typeof input.removeAttribute==='function')input.removeAttribute('aria-invalid');
  };
  if(contacto&&typeof contacto.addEventListener==='function')contacto.addEventListener('input',limpiarContacto);
  const procesar=async enviar=>{
    if(procesando||!campanaLista)return;
    if(typeof form.querySelectorAll==='function')[...form.querySelectorAll(':invalid')].forEach(abrirSeccionDe);
    if(!form.reportValidity())return;
    const file=campo('flyer').files&&campo('flyer').files[0],validacion=validarFlyerClase(file);
    if(!validacion.ok){estado.textContent=validacion.error;campo('flyer').focus();return;}
    const campana=validarCampanaClase({dias:Number(valorCampo('dias')),inicio:valorCampo('inicio'),tope_clp:pesosDeTexto(valorCampo('tope'))});
    if(!campana.ok){estado.textContent=campana.error;enfocar(campo(campana.campo));return;}
    const datos={tenant:campo('tenant').value,ramos_siglas:campo('siglas').value.split(',').map(s=>s.trim()),
      criterios:{promedioMenorA:Number(campo('promedio').value),avanceMinimo:Number(campo('avance').value)},
      titulo:campo('titulo').value,descripcion:campo('descripcion').value,precio_clp:pesosDeTexto(campo('precio').value),
      pack_clases:campo('pack')?campo('pack').value.trim():'',
      modalidad:campo('modalidad').value,ubicacion:campo('ubicacion').value,
      modalidad_otra:campo('modalidad-otra')?campo('modalidad-otra').value:'',ubicacion_otra:campo('ubicacion-otra')?campo('ubicacion-otra').value:'',
      detalles:leerDetalles(),linea_datos:lineaParaGuardar(borradorEnVivo()),
      contacto_tipo:tipoActual(),contacto_valor:campo('contacto').value};
    procesando=true;
    const botones=[form.querySelector('#pr-guardar'),form.querySelector('#pr-enviar')];botones.forEach(b=>b.disabled=true);
    estado.textContent='Guardando borrador…';
    try{
      const guardado=await guardarBorradorClase(datos,id);
      if(!guardado.ok){estado.textContent=guardado.error;if(guardado.campo==='contacto_valor'){marcarContacto(guardado.error);return;}if(guardado.campo){const mapa={ramos_siglas:'siglas-buscar',criterios:'promedio',precio_clp:'precio',pack_clases:'pack',contacto_tipo:'contacto-tipo',contacto_valor:'contacto',modalidad_otra:'modalidad-otra',ubicacion_otra:'ubicacion-otra',detalles:'agregar-detalle'};enfocar(campo(mapa[guardado.campo]||guardado.campo));}return;}
      id=guardado.anuncio.id;
      const guardadaCampana=await guardarCampanaClase(id,campana.datos);
      if(!guardadaCampana.ok&&!guardadaCampana.falta){estado.textContent='Tu clase se guardó, pero '+(guardadaCampana.error||'no se guardaron los días y el tope. No se envió a revisión.');return;}
      if(file){estado.textContent='Borrador guardado. Subiendo flyer…';const subida=await subirFlyerClase(id,file);
        if(!subida.ok){estado.textContent='Borrador guardado, pero '+subida.error;return;}
        flyerActual=subida.path;campo('flyer').value='';form.querySelector('#pr-quitar-flyer').hidden=false;
      }
      if(enviar){estado.textContent='Enviando a revisión…';const respuesta=await enviarBorradorClase(id);
        if(!respuesta.ok){estado.textContent=respuesta.error;if(respuesta.campo==='contacto_valor')marcarContacto(respuesta.error);return;}
        raiz.innerHTML='<div class="modal-title" id="modal-titulo">En revisión</div><p class="profesor-info" role="status">Recibimos tu anuncio. Nadie lo verá hasta que GradeHub lo revise y apruebe.</p>'+(guardadaCampana.falta||respuesta.sqlAnterior?'<p class="profesor-info" role="status">Los días y el tope todavía no se guardaron. GradeHub debe confirmarlos contigo antes de publicar.</p>':'');return;
      }
      estado.textContent='Borrador guardado. Puedes volver después o enviarlo a revisión.'+(guardadaCampana.falta?' Los días y el tope aún no se guardaron; deben confirmarse antes de publicar.':'');
    }catch(e){estado.textContent='No pudimos completar la acción. Revisa si tu borrador quedó guardado e intenta de nuevo.';
    }finally{procesando=false;botones.forEach(b=>{if(b.isConnected)b.disabled=false;});}
  };
  form.addEventListener('submit',e=>{e.preventDefault();procesar(false);});
  form.querySelector('#pr-guardar').addEventListener('click',()=>procesar(false));
  form.querySelector('#pr-enviar').addEventListener('click',()=>procesar(true));
}

// ─── RECOMENDACIÓN EN INICIO ────────────────────────────────────────────────
//
// La segunda puerta de docs/marketplace-clases.md. Una clase cuyo público
// calza con uno de tus ramos aparece junto a ese ramo en Inicio, con su
// etiqueta de publicidad. Reglas que no se negocian:
//
// - Se decide en el navegador con `seleccionarClaseApoyo`: se descargan los
//   anuncios públicos de tu universidad y se comparan acá con tus ramos y notas.
//   Nada de eso viaja para elegir.
// - Solo en Inicio, nunca en la ficha del ramo, la Agenda ni el ingreso de notas.
// - Una en la mañana y una en la tarde (decisión de Lucas del 2026-09-25). Lo
//   único que gasta la franja es cerrarla con la X: recargar o volver a entrar
//   la muestra de nuevo, la misma clase (ajuste del 2026-09-26; antes recargar
//   la hacía desaparecer hasta la franja siguiente). La primera vez que cierras
//   una clase, se esconde hasta la próxima franja; la segunda vez, esa clase no
//   vuelve más en este dispositivo, y recién ahí se le dice.
// - No dice "reprobando" ni diagnostica: ofrece apoyo para el ramo.
// - El cierre y el día viven en `gradehub_marketplace_v1`, aparte de
//   gradehub_v1: apagar esto no toca el estado académico.
//
// RECOMENDACIONES_CLASES_ACTIVAS es el interruptor. Apagarlo esconde el banner
// sin tocar el catálogo, que es la puerta abierta a todos.
const RECOMENDACIONES_CLASES_ACTIVAS=true;
const CLAVE_MARKETPLACE='gradehub_marketplace_v1';
const MAX_DESCARTADOS_CLASES=200;

function leerEstadoMarketplace(){
  try{
    const v=JSON.parse(localStorage.getItem(CLAVE_MARKETPLACE)||'{}');
    return v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  }catch(e){return {};}
}
function guardarEstadoMarketplace(estado){
  try{localStorage.setItem(CLAVE_MARKETPLACE,JSON.stringify(estado));}catch(e){}
}
function diaLocalClases(ahora=Date.now()){
  const d=new Date(ahora);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// Mañana hasta las 14:00 y tarde desde ahí, en la hora del dispositivo.
const HORA_TARDE_CLASES=14;
function franjaClases(ahora=Date.now()){
  return diaLocalClases(ahora)+(new Date(ahora).getHours()<HORA_TARDE_CLASES?'-manana':'-tarde');
}
// Pura: recibe anuncios, ramos y el estado guardado, y devuelve la
// recomendación de esta franja (o null) junto con el estado que hay que guardar.
// Una apertura de la app = una carga de la página. Volver a Inicio dentro de la
// misma apertura no cambia el banner; abrir la app de nuevo muestra la
// siguiente de las clases que calzan (pedido de Lucas del 2026-09-30).
const VISITA_CLASES=Date.now().toString(36)+Math.random().toString(36).slice(2);
function recomendacionDelDia(anuncios,ramos,tenant,estado,ahora=Date.now(),visita=VISITA_CLASES){
  const franja=franjaClases(ahora),e=estado||{};
  // Cerrada con la X: hasta la próxima franja, aunque se vuelva a abrir.
  if(e.franja===franja&&e.cerrada)return {sel:null,estado:e};
  // Misma apertura: la misma clase, si sigue calzando. Si subiste una nota y
  // dejó de calzar, desaparece en vez de quedarse pegada.
  if(e.visita===visita&&e.anuncioId){
    const sel=seleccionarClaseApoyo((anuncios||[]).filter(a=>a&&a.id===e.anuncioId),ramos,tenant,{descartados:definitivasClases(e),ahora});
    return {sel,estado:e};
  }
  // Apertura nueva: la siguiente en la rotación. `aperturas` cuenta las que ya
  // mostraron algo, así que la primera vez sale la primera.
  const aperturas=Number.isSafeInteger(e.aperturas)&&e.aperturas>=0?e.aperturas:0;
  const sel=seleccionarClaseApoyo(anuncios,ramos,tenant,{descartados:definitivasClases(e),ahora,turno:aperturas});
  // Si no calza ninguna, no se anota nada: una clase publicada más tarde tiene
  // que poder aparecer.
  if(!sel)return {sel:null,estado:e};
  return {sel,estado:{...e,franja,visita,anuncioId:sel.anuncio.id,cerrada:false,aperturas:aperturas+1}};
}

// Las clases cerradas dos veces. La lista `descartados` de la versión anterior
// se ignora: ahí bastaba cerrarla una vez, y con la regla nueva eso no alcanza.
function definitivasClases(e){return Array.isArray(e&&e.descartadasDefinitivas)?e.descartadasDefinitivas:[];}
// Devuelve true si con este cierre la clase queda descartada para siempre.
function descartarRecomendacionClase(anuncioId,ahora=Date.now()){
  const estado=leerEstadoMarketplace();
  const cierres={...(estado.cierres&&typeof estado.cierres==='object'?estado.cierres:{})};
  cierres[anuncioId]=(Number(cierres[anuncioId])||0)+1;
  const definitiva=cierres[anuncioId]>=2;
  const descartadasDefinitivas=definitiva?[...new Set([...definitivasClases(estado),anuncioId])].slice(-MAX_DESCARTADOS_CLASES):definitivasClases(estado);
  guardarEstadoMarketplace({...estado,cierres,descartadasDefinitivas,franja:franjaClases(ahora),anuncioId:null,cerrada:true});
  return definitiva;
}

let anunciosRecomendacion={tenant:null,lista:null,pidiendo:false};
function cargarAnunciosRecomendacion(tenant,alTerminar){
  if(anunciosRecomendacion.pidiendo)return;
  anunciosRecomendacion={tenant,lista:null,pidiendo:true};
  cargarAnunciosClases(tenant).then(lista=>{
    if(anunciosRecomendacion.tenant!==tenant)return;
    anunciosRecomendacion={tenant,lista:Array.isArray(lista)?lista:[],pidiendo:false};
    alTerminar();
  }).catch(()=>{anunciosRecomendacion={tenant,lista:[],pidiendo:false};});
}

const RECOMENDACIONES_VISTAS=new Set();
function observarRecomendacionClase(banner,anuncio,sigla){
  const clave=claveMedicionClase(anuncio.id);
  if(typeof IntersectionObserver!=='function'||RECOMENDACIONES_VISTAS.has(clave))return;
  let timer=null;
  const obs=new IntersectionObserver(entradas=>{
    const e=entradas[entradas.length-1];
    if(e.isIntersecting&&e.intersectionRatio>=IMPRESION_VISIBLE){
      if(!timer)timer=setTimeout(()=>{
        timer=null;
        if(!banner.isConnected||RECOMENDACIONES_VISTAS.has(clave))return;
        RECOMENDACIONES_VISTAS.add(clave);obs.disconnect();
        registrarMetricaAnuncio(anuncio.id,'impresion',sigla);
        registrarAlcanceAnuncio(anuncio.id,'recomendacion');
      },IMPRESION_MS);
    }else if(timer){clearTimeout(timer);timer=null;}
  },{threshold:[IMPRESION_VISIBLE]});
  obs.observe(banner);
}

// La llama renderHome después de pintar los ramos. Si los anuncios todavía no
// llegan, los pide y vuelve a pintar solo el banner cuando llegan.
// La línea bajo el título: formato, lugar y precio, lo que el profesor llenó.
// Los datos que pueden ir bajo el título, en el orden en que se muestran.
function opcionesLineaClase(anuncio){
  const a=anuncio||{},out=[];
  const mod=textoOpcionClase(MODALIDADES_CLASE,a.modalidad,a.modalidad_otra);
  if(mod)out.push({clave:'modalidad',nombre:'Formato',texto:mod});
  const ubi=textoOpcionClase(UBICACIONES_CLASE,a.ubicacion,a.ubicacion_otra);
  if(ubi)out.push({clave:'ubicacion',nombre:'Dónde',texto:ubi});
  if(Number(a.precio_clp)>0||esClaseGratis(a))out.push({clave:'precio',nombre:'Precio',texto:precioClase(a)});
  detallesClase(a).forEach(d=>out.push({clave:'detalle:'+d.etiqueta.trim(),nombre:d.etiqueta.trim(),texto:d.valor.trim()}));
  return out;
}
function lineaDatosClase(a){
  const elegidas=Array.isArray(a&&a.linea_datos)?a.linea_datos:LINEA_CLASE_POR_OMISION;
  return opcionesLineaClase(a).filter(o=>elegidas.includes(o.clave)).slice(0,MAX_LINEA_CLASE).map(o=>o.texto).join(' · ');
}
// El mismo contenido para el banner de Inicio y para la vista previa que ve el
// profesor al armar su clase: lo que ve uno es exactamente lo que verá el otro.
function contenidoRecomendacionClase(anuncio,{logoUrl='',vistaPrevia=false}={}){
  const a=anuncio||{},linea=lineaDatosClase(a);
  return `<button type="button" class="clase-apoyo-abrir"${vistaPrevia?' tabindex="-1" aria-hidden="true"':''}>
      <span class="clase-apoyo-texto">
        <span class="ca-cabeza"><small>Publicidad · Clase particular</small><strong>${esc(a.titulo||'Tu clase')}</strong></span>
        <span class="ca-pie"><span class="clase-apoyo-datos">${esc(linea||'Formato · Lugar · Precio')}</span><span class="clase-apoyo-ver">Ver clase ›</span></span>
      </span>
    </button>
    <span class="clase-apoyo-logo" aria-hidden="true"${logoUrl?'':' hidden'}>${logoUrl?imgLogoClase(logoUrl):''}</span>
    <button type="button" class="clase-apoyo-cerrar" aria-label="No mostrar esta clase"${vistaPrevia?' tabindex="-1"':''}>
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>`;
}

function pintarRecomendacionClase(contenedor){
  if(!RECOMENDACIONES_CLASES_ACTIVAS||!contenedor||!currentUser||!supabaseClient||!S||!S.tenant)return;
  contenedor.querySelectorAll('.clase-apoyo').forEach(b=>b.remove());
  contenedor.querySelectorAll('.tiene-clase-apoyo').forEach(f=>{f.classList.remove('tiene-clase-apoyo','junto-der','junto-izq');f.style.removeProperty('--info-mitad');});
  if(anunciosRecomendacion.tenant!==S.tenant||anunciosRecomendacion.lista===null){
    cargarAnunciosRecomendacion(S.tenant,()=>{if(contenedor.isConnected)pintarRecomendacionClase(contenedor);});
    return;
  }
  const {sel,estado}=recomendacionDelDia(anunciosRecomendacion.lista,S.ramos,S.tenant,leerEstadoMarketplace());
  guardarEstadoMarketplace(estado);
  if(!sel)return;
  const fila=[...contenedor.querySelectorAll('.ramo-row')].find(f=>f.dataset.ramoId===String(sel.ramo.id));
  if(!fila)return;
  const {anuncio,ramo}=sel,sigla=siglaRamoParaClases(ramo);
  const banner=document.createElement('aside');
  banner.className='clase-apoyo';
  banner.setAttribute('aria-label','Publicidad: clase particular');
  banner.innerHTML=contenidoRecomendacionClase(anuncio);
  banner.querySelector('.clase-apoyo-abrir').addEventListener('click',()=>{
    registrarMetricaAnuncio(anuncio.id,'clic',sigla);
    abrirClaseRecomendada(anuncio,ramo,sigla);
  });
  banner.querySelector('.clase-apoyo-cerrar').addEventListener('click',()=>{
    const definitiva=descartarRecomendacionClase(anuncio.id);
    fila.classList.remove('tiene-clase-apoyo','junto-der','junto-izq');
    banner.remove();
    if(definitiva&&typeof showToast==='function')showToast('Listo, no te la volvemos a mostrar');
  });
  // El logo del profesor, si tiene uno aprobado. Llega después: el banner no
  // espera a Storage para aparecer, y sin logo simplemente no se muestra.
  logosDeAnuncios([anuncio.id]).then(async logos=>{
    const ruta=logos.get(anuncio.id),caja=banner.querySelector('.clase-apoyo-logo');
    if(!ruta||!caja)return;
    const url=await urlFlyerClase(ruta);
    if(!url||!banner.isConnected)return;
    caja.innerHTML=imgLogoClase(url);caja.hidden=false;
  }).catch(()=>{});
  fila.classList.add('tiene-clase-apoyo');
  // En el DOM el banner va siempre justo después de su ramo: así se lee en
  // orden y en celular (una columna) queda pegado debajo. En la grilla se
  // ubica aparte, en colocarRecomendacionEnGrilla.
  fila.after(banner);
  alinearRecomendacionConRamo(contenedor,fila,banner,{colocar:true});
  observarRecomendacionClase(banner,anuncio,sigla);
}

// En la grilla el ramo y su clase se estiran al alto de la fila. El texto de
// los dos queda centrado, y el título de la clase se alinea con el nombre del
// ramo y sus datos con la sigla. Se mide en pantalla porque un nombre de ramo
// puede ocupar una o dos líneas; se vuelve a medir si cambia el tamaño.
// En la grilla de escritorio la clase ocupa UNA casilla junto a su ramo: la
// de la derecha, o la de la izquierda si el ramo está en la última columna.
// Ramo y clase se fijan en su fila y columna, y el resto de los ramos fluye
// alrededor; el ramo queda exactamente donde estaba sin la clase.
//
// Antes se metía el banner antes o después del ramo en el DOM, con las
// columnas contadas una sola vez. Con el ramo en la última columna, meterlo
// antes empujaba al ramo a la fila siguiente, y la clase quedaba lejos de su
// ramo, con el texto encima de otro (pasó el 2026-09-26 con Dinámica en la
// tercera columna). Ahora se recalcula si cambia el ancho.
function columnasGrillaRamos(contenedor){
  try{
    const cs=getComputedStyle(contenedor);
    if(cs.display!=='grid')return 1;
    // Con la grilla dibujada el valor viene en píxeles, una por columna. Sin
    // dibujar (pantalla oculta) viene como la regla escrita: no se adivina.
    const t=String(cs.gridTemplateColumns||'').trim();
    return /^[\d.]+px( [\d.]+px)*$/.test(t)?t.split(' ').length:0;
  }catch(e){return 1;}
}
function colocarRecomendacionEnGrilla(contenedor,fila,banner){
  const columnas=columnasGrillaRamos(contenedor);
  if(!columnas)return;
  const casillas=[...contenedor.children].filter(el=>el!==banner);
  const i=casillas.indexOf(fila);
  const derecha=columnas>1&&i>=0&&i%columnas<columnas-1;
  const enGrilla=columnas>1&&i>=0;
  banner.classList.toggle('en-casilla',enGrilla);
  banner.classList.toggle('a-la-derecha',enGrilla&&derecha);
  banner.classList.toggle('a-la-izquierda',enGrilla&&!derecha);
  fila.classList.toggle('junto-der',enGrilla&&derecha);
  fila.classList.toggle('junto-izq',enGrilla&&!derecha);
  if(!enGrilla){['--ca-fila','--ca-col-ramo','--ca-col-clase'].forEach(v=>{fila.style.removeProperty(v);banner.style.removeProperty(v);});return;}
  const filaGrilla=Math.floor(i/columnas)+1,col=i%columnas+1;
  [fila,banner].forEach(el=>el.style.setProperty('--ca-fila',String(filaGrilla)));
  fila.style.setProperty('--ca-col-ramo',String(col));
  banner.style.setProperty('--ca-col-clase',String(derecha?col+1:col-1));
}

function alinearRecomendacionConRamo(contenedor,fila,banner,{colocar=false}={}){
  let obs=null;
  const medir=()=>{
    if(!banner.isConnected||!fila.isConnected){if(obs)obs.disconnect();return;}
    if(colocar)colocarRecomendacionEnGrilla(contenedor,fila,banner);
    const info=fila.querySelector('.ramo-info');
    if(info)fila.style.setProperty('--info-mitad',(info.offsetHeight/2)+'px');
    const nombre=fila.querySelector('.ramo-name'),meta=fila.querySelector('.ramo-meta');
    const cabeza=banner.querySelector('.ca-cabeza strong'),pie=banner.querySelector('.clase-apoyo-datos');
    banner.style.setProperty('--ajuste-titulo','0px');banner.style.setProperty('--ajuste-datos','0px');
    // En la vista previa del profesor la grilla va achicada: las distancias en
    // pantalla se pasan a las de la tarjeta sin achicar.
    const escala=(fila.offsetWidth&&fila.getBoundingClientRect().width/fila.offsetWidth)||1;
    if(nombre&&cabeza)banner.style.setProperty('--ajuste-titulo',Math.round((nombre.getBoundingClientRect().top-cabeza.getBoundingClientRect().top)/escala)+'px');
    if(meta&&pie)banner.style.setProperty('--ajuste-datos',Math.round((meta.getBoundingClientRect().top-pie.getBoundingClientRect().top)/escala)+'px');
  };
  if(typeof ResizeObserver==='function'){obs=new ResizeObserver(medir);obs.observe(contenedor);}
  requestAnimationFrame(medir);
}

async function abrirClaseRecomendada(anuncio,ramo,sigla){
  const raiz=document.getElementById('modal-content');
  if(!raiz)return;
  logosCatalogoClases=await logosDeAnuncios([anuncio.id]);
  raiz.innerHTML=`<div class="catalogo-clases">
      <div class="catalogo-clases-head"><div><div class="modal-title" id="modal-titulo">Clase particular</div></div><button type="button" class="settings-cerrar" onclick="closeModal()">Cerrar</button></div>
      <div class="catalogo-clases-resultados">${tarjetaCatalogoClase(anuncio,{sigla,abierta:true})}</div>
      <button type="button" class="btn-cancel clase-apoyo-mas" onclick="openCatalogoClases()">Ver todas las clases</button>
    </div>`;
  activarTarjetasClases(raiz);
  registrarInteraccionAnuncio(anuncio.id,'apertura');
  openModal();
}

if(typeof document!=='undefined'){
  const entradaProfesor=document.getElementById('um-profesor');
  if(entradaProfesor)entradaProfesor.addEventListener('click',()=>umGo(openEspacioProfesor));
}

// ─── ADMINISTRACIÓN DE CLASES ───────────────────────────────────────────────
//
// Una pestaña que aparece solo en cuentas de admin.administradores (pedido de
// Lucas del 2026-09-25). Que aparezca o no es cosmético: cada dato y cada
// acción pasa por funciones del servidor que exigen estar en la lista Y haber
// entrado con el segundo factor (supabase/administradores.sql). Por eso la
// página parte por renderPuertaDosPasos.
let soyAdministradorCache=false;
async function cargarSoyAdministrador(){
  if(!supabaseClient||!currentUser)return false;
  try{
    const {data,error}=await supabaseClient.rpc('soy_administrador');
    soyAdministradorCache=!error&&data===true;
  }catch(e){soyAdministradorCache=false;}
  return soyAdministradorCache;
}
function esAdministrador(){return soyAdministradorCache;}

async function renderAdmin(){
  const raiz=document.getElementById('admin-body');
  if(!raiz)return;
  if(typeof renderPuertaDosPasos!=='function'){raiz.innerHTML='<p class="profesor-info">No disponible.</p>';return;}
  await renderPuertaDosPasos(raiz,{titulo:'Entra con tu segundo factor',alPasar:()=>pintarPanelAdmin(raiz)});
}

// Qué pasa con un anuncio hoy, en palabras de quien administra.
function estadoAdminAnuncio(a,costo,ahora=Date.now()){
  const vig=vigenciaAnuncio(a,ahora);
  if(vig==='publicado'&&costo&&costo.agotada)return ['Llegó al tope','agotado'];
  return [(ESTADOS_ANUNCIO[vig]||[vig])[0],vig];
}
function resumenAdminClases(profesores,ahora=Date.now()){
  const r={profesores:0,pendientes:0,suspendidos:0,activas:0,programadas:0,revision:0,gastado:0,cobrado:0,deuda:0};
  for(const p of profesores||[]){
    if(p.estado==='aprobado')r.profesores++;else if(p.estado==='pendiente')r.pendientes++;else if(p.estado==='suspendido')r.suspendidos++;
    for(const a of p.anuncios||[]){
      const vig=vigenciaAnuncio(a,ahora),costo=costoCampanaClase(a.campana);
      if(vig==='publicado')r.activas++;else if(vig==='programado')r.programadas++;else if(vig==='en_revision')r.revision++;
      if(costo)r.gastado+=costo.total;
      const cobros=Array.isArray(a.cobros)?a.cobros:(a.cobro?[a.cobro]:[]);
      for(const c of cobros){
        if(c.estado==='cobrado')r.cobrado+=c.monto_clp;
        if(c.estado==='deuda')r.deuda+=c.monto_clp;
      }
    }
  }
  return r;
}
function editorCobroAdmin(anuncioId,publicadoAt,estado,monto){
  return `<div class="admin-cobro" data-admin-cobro="${esc(anuncioId)}" data-publicado-at="${esc(publicadoAt)}"><span>Cobro</span>
    <select data-cobro-estado aria-label="Estado del cobro">${[['pendiente','Pendiente'],['cobrado','Cobrado'],['deuda','En deuda']].map(([v,t])=>`<option value="${v}"${v===estado?' selected':''}>${t}</option>`).join('')}</select>
    <input type="text" inputmode="numeric" data-cobro-monto aria-label="Monto" value="${esc(textoPesosEscrito(monto))}">
    <button type="button" class="clase-accion" data-cobro-guardar>Guardar</button></div>`;
}
function filaAdminAnuncio(a,ahora=Date.now()){
  const costo=costoCampanaClase(a.campana),[estado,clase]=estadoAdminAnuncio(a,costo,ahora);
  const vig=vigenciaAnuncio(a,ahora),publicado=!!a.publicado_at;
  const cobro=a.cobro&&a.cobro.estado||'pendiente',monto=a.cobro?a.cobro.monto_clp:(costo?costo.total:0);
  const fecha=t=>t?new Date(t).toLocaleDateString('es-CL',{day:'numeric',month:'short'}):'';
  const anteriores=(a.cobros||[]).filter(c=>c.publicado_at!==a.publicado_at);
  return `<article class="admin-anuncio" data-admin-anuncio="${esc(a.id)}">
    <div class="admin-anuncio-top"><strong>${esc(a.titulo||'Sin título')}</strong><span class="clase-estado clase-estado-${esc(clase)}">${esc(estado)}</span></div>
    <p class="clase-card-meta">${esc((a.ramos_siglas||[]).join(' · '))} · ${esc(precioClase(a))}${publicado?` · ${fecha(a.publicado_at)} → ${fecha(a.vence_at)}`:''}</p>
    ${costo?`<p class="admin-anuncio-costo"><b>${pesosClase(costo.total)}</b>${costo.tope!==null?` de ${pesosClase(costo.tope)}`:' · sin tope'}</p>
      <p class="clase-sin-datos">${esc(lineaCostoCampanaClase(costo))}</p>`:''}
    <div class="admin-anuncio-acciones">
      ${publicado?editorCobroAdmin(a.id,a.publicado_at,cobro,monto):''}
      ${vig==='publicado'||vig==='programado'?`<button type="button" class="clase-accion" data-admin-pausar="${esc(a.id)}">Pausar aviso</button>`:''}
    </div>
    ${anteriores.length?`<details><summary>Cobros anteriores (${anteriores.length})</summary>${anteriores.map(c=>
      `<div><p class="clase-card-meta">Publicación del ${esc(new Date(c.publicado_at).toLocaleString('es-CL'))} · ${c.estado==='deuda'?'En deuda':'Cobrado'} · ${pesosClase(c.monto_clp)}</p>${editorCobroAdmin(a.id,c.publicado_at,c.estado,c.monto_clp)}</div>`).join('')}</details>`:''}
  </article>`;
}
function tarjetaAdminProfesor(p,ahora=Date.now()){
  const estados={aprobado:'Aprobado',pendiente:'Esperando revisión',suspendido:'Pausado',rechazado:'Rechazado'};
  const anuncios=p.anuncios||[];
  const gastado=anuncios.reduce((n,a)=>{const c=costoCampanaClase(a.campana);return n+(c?c.total:0);},0);
  const accion=p.estado==='aprobado'?`<button type="button" class="clase-accion" data-admin-profesor="${esc(p.user_id)}" data-estado="suspendido">Pausar profesor</button>`
    :p.estado==='suspendido'?`<button type="button" class="clase-accion" data-admin-profesor="${esc(p.user_id)}" data-estado="aprobado">Reactivar</button>`:'';
  return `<section class="admin-profesor">
    <div class="admin-profesor-top"><div><h3>${esc(p.nombre||'Sin nombre')}</h3><p class="clase-card-meta">${esc(p.correo||'')}</p></div>
      <span class="clase-estado clase-estado-${esc(p.estado)}">${esc(estados[p.estado]||p.estado)}</span></div>
    <p class="clase-card-meta">${anuncios.length} ${anuncios.length===1?'anuncio':'anuncios'} · lleva ${pesosClase(gastado)}</p>
    ${accion}
    ${anuncios.length?`<div class="admin-anuncios">${anuncios.map(a=>filaAdminAnuncio(a,ahora)).join('')}</div>`:''}
  </section>`;
}
async function marcarCobroAdmin(args){
  const actual=await supabaseClient.rpc('admin_marcar_cobro_publicacion',args);
  if(!actual.error){compatibilidadSqlClases.cobros=false;return actual;}
  if(!sqlClasesDesactualizado(actual.error))return actual;
  compatibilidadSqlClases.cobros=true;
  // El RPC antiguo no recibe fecha. Nunca usarlo para un cobro histórico ni
  // para una fila que otra pestaña ya renovó. Se vuelve a leer antes de guardar.
  const panel=await supabaseClient.rpc('admin_panel_clases');
  if(panel.error)return panel;
  const anuncio=(panel.data||[]).flatMap(p=>p.anuncios||[]).find(a=>a.id===args.p_anuncio_id);
  if(!anuncio||!args.p_publicado_at||Date.parse(anuncio.publicado_at)!==Date.parse(args.p_publicado_at))
    return {error:{message:'La publicación cambió o es histórica. Actualiza el panel y aplica el SQL antes de editar ese cobro.'}};
  const {p_anuncio_id,p_estado,p_monto_clp}=args;
  return supabaseClient.rpc('admin_marcar_cobro',{p_anuncio_id,p_estado,p_monto_clp});
}
async function pintarPanelAdmin(raiz){
  raiz.innerHTML='<p class="profesor-info" role="status">Cargando…</p>';
  let profesores;
  try{
    const {data,error}=await supabaseClient.rpc('admin_panel_clases');
    if(error){console.warn('No se pudo cargar la administración:',error.code||'',error.message||error);
      raiz.innerHTML=`<p class="profesor-info" role="alert">${error.code==='42501'?'Esta cuenta no tiene acceso de administración.':'No pudimos cargar la administración. Intenta de nuevo.'}</p>`;return;}
    profesores=Array.isArray(data)?data:[];
    if(profesores.some(p=>(p.anuncios||[]).some(a=>!Array.isArray(a.cobros))))compatibilidadSqlClases.cobros=true;
  }catch(e){raiz.innerHTML='<p class="profesor-info" role="alert">No pudimos cargar la administración. Intenta de nuevo.</p>';return;}
  const ahora=Date.now(),r=resumenAdminClases(profesores,ahora);
  const kpi=(t,v,d)=>`<div class="clase-num"><span>${t}</span><b>${v}</b><small>${d}</small></div>`;
  raiz.innerHTML=`${compatibilidadSqlClases.campanas||compatibilidadSqlClases.cobros?`<p class="profesor-info" role="status">${esc(AVISO_SQL_CLASES)}</p>`:''}<div class="clase-nums clases-kpis">
      ${kpi('Profesores',r.profesores,`${r.pendientes} esperando · ${r.suspendidos} pausados`)}
      ${kpi('Campañas activas',r.activas,`${r.programadas} programadas · ${r.revision} en revisión`)}
      ${kpi('Gastado',pesosClase(r.gastado),'lo que costaría')}
      ${kpi('Cobrado',pesosClase(r.cobrado),`${pesosClase(r.deuda)} en deuda`)}
    </div>
    <p class="clase-privacidad">Aprobar profesores y publicar anuncios sigue siendo desde el SQL Editor. Cada acción de esta página queda registrada.</p>
    ${profesores.length?profesores.map(p=>tarjetaAdminProfesor(p,ahora)).join(''):'<p class="clase-sin-datos">Todavía no hay profesores.</p>'}`;
  const repintar=()=>pintarPanelAdmin(raiz);
  const llamar=async(fn,args,ok)=>{
    const {error}=await supabaseClient.rpc(fn,args);
    if(error){console.warn('Acción de administración rechazada:',error.code||'',error.message||error);showToast('No se pudo: '+(error.message||'error'),true);return;}
    showToast(ok);repintar();
  };
  raiz.querySelectorAll('[data-admin-pausar]').forEach(b=>b.addEventListener('click',()=>
    showConfirm('¿Pausar este aviso?','Deja de mostrarse al tiro. Para volver, el profesor lo manda a revisión otra vez.',
      ()=>llamar('admin_pausar_anuncio',{p_anuncio_id:b.dataset.adminPausar},'Aviso pausado'),{label:'Pausar',danger:false})));
  raiz.querySelectorAll('[data-admin-profesor]').forEach(b=>b.addEventListener('click',()=>{
    const pausar=b.dataset.estado==='suspendido';
    showConfirm(pausar?'¿Pausar a este profesor?':'¿Reactivar a este profesor?',
      pausar?'Todos sus avisos dejan de mostrarse al tiro. No se borra nada y se puede revertir.':'Sus avisos publicados y vigentes vuelven a mostrarse.',
      ()=>llamar('admin_estado_profesor',{p_user_id:b.dataset.adminProfesor,p_estado:b.dataset.estado},pausar?'Profesor pausado':'Profesor reactivado'),
      {label:pausar?'Pausar':'Reactivar',danger:false});
  }));
  raiz.querySelectorAll('[data-admin-cobro]').forEach(fila=>{
    const guardar=fila.querySelector('[data-cobro-guardar]'),monto=fila.querySelector('[data-cobro-monto]');
    if(monto)campoPesos(monto);
    if(guardar)guardar.addEventListener('click',async()=>{
      const estado=fila.querySelector('[data-cobro-estado]').value,valor=pesosDeTexto(monto.value);
      if(estado!=='pendiente'&&!Number.isSafeInteger(valor)){showToast('Escribe el monto',true);return;}
      if(guardar.disabled)return;
      guardar.disabled=true;
      try{
        const resultado=await marcarCobroAdmin({p_anuncio_id:fila.dataset.adminCobro,p_publicado_at:fila.dataset.publicadoAt,
          p_estado:estado,p_monto_clp:estado==='pendiente'?null:valor});
        if(resultado.error){showToast(resultado.error.message||'No se pudo guardar el cobro.',true);return;}
        showToast('Cobro guardado'+(compatibilidadSqlClases.cobros?' con el SQL anterior':''));await repintar();
      }catch(e){showToast('No pudimos guardar el cobro. Intenta de nuevo.',true);}
      finally{if(guardar.isConnected)guardar.disabled=false;}
    });
  });
}
