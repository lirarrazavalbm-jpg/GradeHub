// ─── CLASES PARTICULARES · DATOS Y PRIVACIDAD ───────────────────────────────
//
// Este archivo no pinta interfaz ni publica anuncios todavía. Solo es la
// frontera de datos para la sección futura: trae el catálogo completo de
// anuncios activos de una universidad y decide LOCALMENTE qué ramos calzan.
// La lista de ramos, las notas y cualquier señal de rendimiento no salen del
// dispositivo para segmentar anuncios.

const METRICAS_ANUNCIO = new Set(['impresion', 'clic', 'contacto']);
const CAMPOS_PUBLICOS_ANUNCIO = 'id,tenant,ramos_siglas,criterios,modalidad,ubicacion,precio_clp,descripcion,contacto_tipo,contacto_valor,estado,publicado_at,vence_at,created_at';

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
// Los ejemplos $1.000/$2.000 viven en la muestra, no son precios de producción.
// Esto no factura: los eventos actuales no miden alcance único. Sin medición
// real, null significa desconocido y nunca se transforma en cero usuarios.
function cotizarCampanaClases(criterios,tarifas,{elegibles=null,alcanzados=null,presupuestoClp=null}={}){
  if(!criteriosClaseValidos(criterios)||!Array.isArray(tarifas))return null;
  if([elegibles,alcanzados,presupuestoClp].some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0)))return null;
  const aplicables=tarifas.filter(t=>t&&criteriosClaseValidos(t.criterios)&&
    Number.isSafeInteger(t.precioPorCuenta)&&t.precioPorCuenta>0&&
    criterios.promedioMenorA<=t.criterios.promedioMenorA&&criterios.avanceMinimo>=t.criterios.avanceMinimo);
  if(!aplicables.length)return null;
  const precioPorCuenta=Math.max(...aplicables.map(t=>t.precioPorCuenta));
  const cupo=presupuestoClp===null?null:Math.floor(presupuestoClp/precioPorCuenta);
  const alcanceCotizado=elegibles===null?null:Math.min(elegibles,cupo??Infinity);
  const costoEstimado=alcanceCotizado===null?null:alcanceCotizado*precioPorCuenta;
  const costoPorAlcance=alcanzados===null?null:Math.min(alcanzados,cupo??Infinity)*precioPorCuenta;
  if([costoEstimado,costoPorAlcance].some(n=>n!==null&&!Number.isSafeInteger(n)))return null;
  return {precioPorCuenta,elegibles,alcanzados,alcanceCotizado,costoEstimado,costoPorAlcance,presupuestoClp};
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

// La RPC aplica el mínimo de cinco EVENTOS en el servidor. Esta función no
// replica ni relaja el umbral: si no hay filas, simplemente no hay un corte
// seguro para mostrar todavía.
async function resumenMetricasAnuncio(anuncioId){
  if(!supabaseClient||!currentUser||!anuncioId)return [];
  const {data,error}=await supabaseClient.rpc('resumen_metricas_anuncio',{p_anuncio_id:anuncioId});
  if(error){console.warn('No se pudieron cargar las métricas del anuncio:',error.message||error);return [];}
  return Array.isArray(data)?data:[];
}
