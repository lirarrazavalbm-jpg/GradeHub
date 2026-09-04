// ─── CLASES PARTICULARES · DATOS Y PRIVACIDAD ───────────────────────────────
//
// Este archivo no pinta interfaz ni publica anuncios todavía. Solo es la
// frontera de datos para la sección futura: trae el catálogo completo de
// anuncios activos de una universidad y decide LOCALMENTE qué ramos calzan.
// La lista de ramos, las notas y cualquier señal de rendimiento no salen del
// dispositivo para segmentar anuncios.

const METRICAS_ANUNCIO = new Set(['impresion', 'clic', 'contacto']);
const CAMPOS_PUBLICOS_ANUNCIO = 'id,tenant,ramos_siglas,modalidad,ubicacion,precio_clp,descripcion,contacto_tipo,contacto_valor,estado,publicado_at,vence_at,created_at';

function siglaAnuncio(sigla){
  return String(sigla||'').trim().toUpperCase();
}

function siglaRamoParaClases(ramo){
  const origen=ramo&&ramo.origen;
  if(!origen||!origen.tenant)return '';
  if(origen.tenant==='uc')return siglaAnuncio(origen.ramoKey);
  // FEN conserva `ramoKey` como nombre normalizado para el consenso de
  // ponderaciones. Para clases usamos una sigla solo cuando CREDITOS_FEN la
  // verificó; un ramo sin código no se fuerza a calzar con un aviso ajeno.
  if(origen.tenant==='fen'&&typeof CREDITOS_FEN!=='undefined'){
    const nombre=Object.keys(CREDITOS_FEN).find(n=>normName(n)===normName(ramo.nombre));
    return siglaAnuncio(nombre&&CREDITOS_FEN[nombre]&&CREDITOS_FEN[nombre][1]);
  }
  return '';
}

function ramosLocalesConSigla(ramos){
  const vistos=new Set();
  return (Array.isArray(ramos)?ramos:[]).map(siglaRamoParaClases)
    .filter(sigla=>sigla&& !vistos.has(sigla) && (vistos.add(sigla),true));
}

// Recibe anuncios ya descargados y ramos que YA viven en el navegador. Esta
// operación no llama a Supabase: mantenerla local es lo que protege que nadie
// pueda inferir qué ramo cursa, qué nota tiene o dónde necesita ayuda.
function anunciosParaRamosLocales(anuncios,ramos){
  const siglas=new Set(ramosLocalesConSigla(ramos));
  if(!siglas.size)return [];
  return (Array.isArray(anuncios)?anuncios:[]).map(anuncio=>{
    const coinciden=(Array.isArray(anuncio&&anuncio.ramos_siglas)?anuncio.ramos_siglas:[])
      .map(siglaAnuncio).filter(sigla=>siglas.has(sigla));
    return coinciden.length?{...anuncio,siglasCoincidentes:coinciden}:null;
  }).filter(Boolean);
}

// Pide solo el catálogo público de una universidad. No recibe `ramos` como
// parámetro ni lee S.ramos: esos datos nunca cruzan esta frontera de red.
async function cargarAnunciosClases(tenant){
  const universidad=String(tenant||'').trim();
  if(!supabaseClient||!universidad)return [];
  const ahora=new Date().toISOString();
  const {data,error}=await supabaseClient.from('tutor_anuncios')
    .select(CAMPOS_PUBLICOS_ANUNCIO)
    .eq('tenant',universidad)
    .eq('estado','publicado')
    .or(`vence_at.is.null,vence_at.gt.${ahora}`)
    .order('publicado_at',{ascending:false})
    .limit(60);
  if(error){console.warn('No se pudieron cargar las clases particulares:',error.message||error);return [];}
  return Array.isArray(data)?data:[];
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

// La RPC aplica el mínimo de cinco EVENTOS en el servidor. Esta función no
// replica ni relaja el umbral: si no hay filas, simplemente no hay un corte
// seguro para mostrar todavía.
async function resumenMetricasAnuncio(anuncioId){
  if(!supabaseClient||!currentUser||!anuncioId)return [];
  const {data,error}=await supabaseClient.rpc('resumen_metricas_anuncio',{p_anuncio_id:anuncioId});
  if(error){console.warn('No se pudieron cargar las métricas del anuncio:',error.message||error);return [];}
  return Array.isArray(data)?data:[];
}
