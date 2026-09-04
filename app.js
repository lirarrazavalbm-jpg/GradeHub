// ─── ANALYTICS ───────────────────────────────────────────────────────────────
// Google Analytics 4. El script va en index.html; si no cargó, esto no hace nada.
//
// REGLA: acá NUNCA van datos del usuario. Ni notas, ni nombres de ramos o
// evaluaciones, ni nada que escriba él. Solo conteos, banderas y el tenant.
// Queremos saber si la app se usa, no qué le fue mal a quién.
// tests/analitica.test.js falla si alguien manda una clave prohibida.
function track(event, params){
  try{ if(typeof gtag==='function') gtag('event', event, params||{}); }catch(e){}
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'gradehub_v1';
// Nombres de ramos y evaluaciones: 40 cortaba nombres oficiales a mitad de
// palabra. 80 cubre holgadamente el catálogo actual y mantiene el dato acotado.
const NOMBRE_MAX = 80;
// De quién es la caché local. Evita que un usuario vea los datos del anterior
// si comparten navegador y la carga desde la nube falla.
const CACHE_OWNER_KEY = 'gradehub_cache_owner';
function setCacheOwner(uid){try{if(uid)localStorage.setItem(CACHE_OWNER_KEY,uid);}catch(e){}}
function getCacheOwner(){try{return localStorage.getItem(CACHE_OWNER_KEY);}catch(e){return null;}}

// El período se declara solo cuando el programa lo dice. La pauta de pesos no
// caduca con él, pero una fecha fija sí: `2026-2` deja de ser una fecha útil al
// comenzar enero de 2027. `desconocido` no se traduce como vigente ni vencido;
// sin período confirmado, la app conserva ponderaciones y no precarga fechas.
function estadoPeriodoPauta(periodo,ahora){
  const m=typeof periodo==='string'&&periodo.match(/^(\d{4})-([12])$/);
  if(!m)return 'desconocido';
  const fecha=ahora&&typeof ahora.getTime==='function'?ahora:new Date();
  const anio=Number(m[1]),semestre=Number(m[2]);
  const fin=Date.UTC(semestre===1?anio:anio+1,semestre===1?7:0,1);
  return fecha.getTime()<fin?'vigente':'vencido';
}
function definicionPreset(nombre,tenant,carrera){
  if(tenant==='fen'){
    const clave=claveCatalogo(nombre,Object.keys(PRESETS_FEN),'fen');
    return clave?PRESETS_FEN[clave]:null;
  }
  if(tenant!=='uc'||!presetUcDisponible(nombre,carrera))return null;
  const clave=claveUc(nombre);
  return clave?PRESETS_UC[clave]:null;
}
function periodoDePreset(def){return !Array.isArray(def)&&def&&typeof def.periodo==='string'?def.periodo:null;}
function infoPeriodoPauta(r){
  if(!r||!r.origen||!r.origen.tenant)return null;
  const def=definicionPreset(r.nombre,r.origen.tenant,r.origen.carrera);
  const evals=Array.isArray(def)?def:(def&&def.evals||[]);
  if(!evals.length)return null;
  const periodo=periodoDePreset(def);
  return {periodo,estadoPeriodo:estadoPeriodoPauta(periodo)};
}

// Las fechas del programa se agregaron después de que miles de ramos ya
// existían, y  solo mira nombre y peso: una fecha nueva no cuenta
// como "la pauta cambió", así que el aviso de actualizar nunca se dispara por
// ella y el ramo se quedaría sin fecha para siempre. Por eso se rellena al
// cargar, igual que la pauta pendiente de acá abajo.
//
// SOLO rellena lo que está vacío. La fecha que escribió el estudiante manda
// sobre la nuestra: puede saber algo que el programa no dice —un cambio
// anunciado en clases, la fecha real de su sección— y pisarla sería moverle la
// Agenda por debajo.
//
// Las cuentas creadas antes de guardar `origen` sí pueden haber recibido una
// pauta oficial, pero hoy se ven igual que un ramo manual. No les inventamos
// esa procedencia: solo usamos el contexto de la cuenta SI la estructura que
// ya tienen coincide completa y en orden con el programa actual. Así una pauta
// manual con el mismo nombre, pero distinta, queda intacta.
function pautaCalzaParaFechas(r,evals){
  const cats=catsDePauta(r&&r.categorias);
  return cats.length===evals.length&&cats.every((c,i)=>{
    const [nombre,peso]=evals[i];
    return normName(c.nombre)===normName(nombre)&&r2(Number(c.peso)||0)===r2(Number(peso)||0);
  });
}
function origenParaFechasOficiales(r,contexto){
  if(r&&r.origen&&r.origen.tenant)return r.origen;
  if(!r||!contexto||!contexto.tenant||!Array.isArray(r.categorias))return null;
  const def=definicionPreset(r.nombre,contexto.tenant,contexto.carrera);
  const evals=Array.isArray(def)?def:(def&&def.evals||[]);
  return def&&pautaCalzaParaFechas(r,evals)?contexto:null;
}
function completarFechasOficiales(r,contexto){
  const origen=origenParaFechasOficiales(r,contexto);
  if(!origen)return;
  const def=definicionPreset(r.nombre,origen.tenant,origen.carrera);
  if(!def||estadoPeriodoPauta(periodoDePreset(def))!=='vigente')return;
  const evals=Array.isArray(def)?def:(def.evals||[]);
  const porNombre=new Map();
  evals.forEach(([nom,,extra])=>{if(extra&&extra.fecha)porNombre.set(normName(nom),extra.fecha);});
  if(!porNombre.size)return;
  r.categorias.forEach(c=>{
    if(c.fecha)return;
    // `fechaQuitada` distingue "nunca tuvo fecha" de "el estudiante la borró".
    // Sin esa marca las dos se ven igual —ambas son null— y el relleno volvía a
    // poner la fecha oficial en cada carga: quitarla era imposible, la
    // evaluación reaparecía en la Agenda al recargar y no había forma de que la
    // app se enterara de que esa prueba se movió o no va.
    if(c.fechaQuitada)return;
    const f=porNombre.get(normName(c.nombre));
    if(f){c.fecha=f;c.fechaOrigen='catalogo';c.fechaQuitada=false;}
  });
}

// HH:MM en 24 h. El input[type=time] ya entrega este formato, pero por acá
// también entran respaldos importados y datos de la nube: se valida igual.
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ORIGENES_FECHA=new Set(['usuario','catalogo','calendario','desconocido']);

function origenFechaSeguro(origen){return ORIGENES_FECHA.has(origen)?origen:null;}

// El consenso futuro solo puede contar una decisión explícita del estudiante.
// Catálogo e importación ayudan a llenar la Agenda, pero nunca son un voto.
function fechaAportaRespaldo(item){return !!item&&item.fechaOrigen==='usuario';}
function horaAportaRespaldo(item){return !!item&&item.horaOrigen==='usuario';}

function fechasOficialesRamo(r){
  if(!r||!r.origen||!r.origen.tenant)return new Map();
  const def=definicionPreset(r.nombre,r.origen.tenant,r.origen.carrera);
  const evals=Array.isArray(def)?def:(def&&def.evals||[]);
  const fechas=new Map();
  evals.forEach(([nombre,,extra])=>{if(extra&&extra.fecha)fechas.set(normName(nombre),extra.fecha);});
  return fechas;
}

// Se corre al leer y solo cambia la copia local. No llama a save(): así las
// cuentas antiguas no sincronizan todas juntas al publicar este cambio; los
// campos viajan a la nube con la próxima edición normal de cada persona.
function migrarOrigenesFecha(r){
  const oficiales=fechasOficialesRamo(r);
  (r.categorias||[]).forEach(c=>{
    c.fechaOrigen=c.fecha?(origenFechaSeguro(c.fechaOrigen)||(oficiales.get(normName(c.nombre))===c.fecha?'catalogo':'desconocido')):null;
    c.horaOrigen=c.hora?(origenFechaSeguro(c.horaOrigen)||'desconocido'):null;
    c.fechaQuitada=!!c.fechaQuitada;c.horaQuitada=!!c.horaQuitada;
    (c.notas||[]).forEach(n=>{
      n.fechaOrigen=n.fecha?(origenFechaSeguro(n.fechaOrigen)||'desconocido'):null;
      n.horaOrigen=n.hora?(origenFechaSeguro(n.horaOrigen)||'desconocido'):null;
      n.fechaQuitada=!!n.fechaQuitada;n.horaQuitada=!!n.horaQuitada;
    });
  });
}

// Editar o confirmar vuelve la fecha una decisión del estudiante. Al quitarla,
// la marca persiste para que ni el catálogo ni una futura sugerencia la reponga.
function marcarFechaUsuario(item,fecha,hora){
  const teniaHora=!!item.hora;
  item.fecha=fecha||null;
  item.hora=item.fecha&&HORA_RE.test(hora||'')?hora:null;
  if(item.fecha){item.fechaOrigen='usuario';item.fechaQuitada=false;}
  else{item.fechaOrigen=null;item.fechaQuitada=true;}
  if(item.hora){item.horaOrigen='usuario';item.horaQuitada=false;}
  else{item.horaOrigen=null;if(teniaHora)item.horaQuitada=true;}
  if(!item.fecha){item.hora=null;item.horaOrigen=null;item.horaQuitada=true;}
  return item;
}

function copiarRecuperativo(regla){
  if(!regla||!Number.isFinite(regla.min)||!Number.isFinite(regla.max)||!Number.isFinite(regla.nota)||regla.min>regla.max)return null;
  return {min:regla.min,max:regla.max,nota:regla.nota};
}
function copiarReglasAusenciaIds(regla){
  if(!regla)return null;
  const copiar=lista=>(Array.isArray(lista)?lista:[]).filter(x=>x&&typeof x.desdeId==='string'&&typeof x.haciaId==='string').map(x=>({desdeId:x.desdeId,haciaId:x.haciaId}));
  const reemplazos=copiar(regla.reemplazos),traspasos=copiar(regla.traspasos);
  return reemplazos.length||traspasos.length?{reemplazos,traspasos}:null;
}
function resolverReglasAusencia(def,categorias){
  const declaracion=!Array.isArray(def)&&def&&def.ausenciasJustificadas;
  if(!declaracion||!Array.isArray(categorias))return null;
  const idDe=nombre=>{const c=categorias.find(x=>normName(x.nombre)===normName(nombre));return c&&c.id;};
  const resolver=lista=>(Array.isArray(lista)?lista:[]).map(x=>({desdeId:idDe(x.desde),haciaId:idDe(x.hacia)})).filter(x=>x.desdeId&&x.haciaId);
  const reemplazos=resolver(declaracion.reemplazos),traspasos=resolver(declaracion.traspasos);
  return reemplazos.length||traspasos.length?{reemplazos,traspasos}:null;
}
function ausenciasDeclaradas(raw){return [...new Set((Array.isArray(raw)?raw:[]).filter(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(id)))];}

function normalize(data) {
  // Rellena campos que podrían faltar (ediciones parciales, imports, etc.)
  data.ramos = (data.ramos || []).map(r => ({
    ...r,
    id: idSeguro(r.id),
    color: r.color || '#2563eb',
    // Créditos SCT — opcional. Si todos los ramos lo tienen, el promedio se pondera.
    // El 0 se conserva: es un dato exacto, no un faltante. Ver tieneCreditos().
    creditos: (typeof r.creditos === 'number' && r.creditos >= 0) ? r.creditos : null,
    // De qué catálogo (universidad + carrera) salió este ramo. null = creado a mano.
    origen: (r.origen && r.origen.tenant) ? {tenant:r.origen.tenant, carrera:r.origen.carrera||null, ramoKey:claveCanonica(typeof r.origen.ramoKey==='string'&&r.origen.ramoKey.trim()?r.origen.ramoKey.trim():ramoKey(r.nombre,r.origen.tenant,r.origen.carrera),r.origen.tenant,r.origen.carrera)} : null,
    // Otro ramo aporta parte de esta nota (el laboratorio de Dinámica).
    aporta: (r.aporta && r.aporta.ramo && r.aporta.peso) ? {ramo:r.aporta.ramo, peso:r.aporta.peso, min:r.aporta.min} : null,
    // La forma de la pauta tal como se la dimos. Si difiere de las categorías
    // actuales, el estudiante la editó y su versión manda.
    pautaHuella: typeof r.pautaHuella === 'string' ? r.pautaHuella : null,
    // La regla oficial y lo que el estudiante declaró son distintos: la regla
    // se puede actualizar desde catálogo; la declaración nunca se inventa.
    recuperativo: copiarRecuperativo(r.recuperativo),
    recuperativoRendido: ['aprobado','reprobado'].includes(r.recuperativoRendido) ? r.recuperativoRendido : null,
    // La regla viene del programa; la declaración solo dice qué ausencia fue
    // aprobada. Sin declaración, una cuenta anterior calcula exactamente igual.
    reglasAusenciaJustificada: copiarReglasAusenciaIds(r.reglasAusenciaJustificada),
    ausenciasJustificadas: ausenciasDeclaradas(r.ausenciasJustificadas),
    categorias: (r.categorias || []).map(c => ({
      ...c,
      id: idSeguro(c.id),
      ponderaNotas: c.ponderaNotas ?? false,
      // `slots` declara casillas fijas. Una versión anterior guardaba por error
      // `directNota:false` junto a `slots`, con lo que la ficha los trataba como
      // una lista abierta y nunca dibujaba las casillas. Se corrige al cargar:
      // no cambia notas, pesos ni cálculo, solo recupera la forma que la persona
      // acababa de declarar. Sin cantidad conocida, `directNota:false` conserva
      // la lista abierta para controles cuyo número todavía no se sabe.
      directNota: Number.isInteger(c.slots) && c.slots > 1 ? true : (c.directNota ?? ((c.notas || []).length <= 1)),
      fecha: c.fecha || null, // opcional, ISO YYYY-MM-DD, se ingresa en el modal de categoría
      // La hora va APARTE de la fecha y nunca dentro de ella. Hay miles de
      // evaluaciones guardadas con `fecha` sola: convertirla a fecha-y-hora
      // sería reinterpretar en silencio lo que ya está escrito, y las que no
      // tienen hora quedarían todas a medianoche. Sin fecha no significa nada,
      // así que se descarta.
      hora: (c.fecha && HORA_RE.test(c.hora || '')) ? c.hora : null,
      fechaOrigen: c.fecha?origenFechaSeguro(c.fechaOrigen):null,
      horaOrigen: (c.fecha && HORA_RE.test(c.hora || ''))?origenFechaSeguro(c.horaOrigen):null,
      fechaQuitada: !c.fecha && c.fechaQuitada===true,
      horaQuitada: !(c.fecha && HORA_RE.test(c.hora || '')) && c.horaQuitada===true,
      notas: (c.notas || []).map(n => ({
        id: idSeguro(n.id),
        nombre: n.nombre || 'Nota',
        hora: (n.fecha && HORA_RE.test(n.hora || '')) ? n.hora : null,
        valor: n.valor ?? (typeof n === 'number' ? n : null),
        peso: n.peso || 1,
        // Las casillas fijas se identifican por posición, no por el nombre.
        // Si se pierde `slot` al recargar, Informe 0 sigue guardado pero ya no
        // puede volver a dibujarse en ninguna de las seis casillas.
        ...(Number.isInteger(n.slot) ? {slot:n.slot} : {}),
        // Una nota puede tener su propia fecha y todavía no tener valor: es una
        // evaluación que viene. La fecha de la categoría sirve cuando todo el
        // grupo cae el mismo día; no alcanza para "Casos y ensayos", que son
        // varios casos repartidos por el semestre.
        fecha: n.fecha || null,
        fechaOrigen: n.fecha?origenFechaSeguro(n.fechaOrigen):null,
        horaOrigen: (n.fecha && HORA_RE.test(n.hora || ''))?origenFechaSeguro(n.horaOrigen):null,
        // Igual que en una categoría: si alguien quita una fecha propia, no es
        // un hueco que el catálogo o un importador pueda rellenar por su cuenta.
        fechaQuitada: !n.fecha && n.fechaQuitada===true,
        horaQuitada: !(n.fecha && HORA_RE.test(n.hora || '')) && n.horaQuitada===true,
      }))
    }))
  }));
  // Entre el 30 de agosto y este arreglo, normalize descartaba `slot` de las
  // notas de una categoría con casillas fijas. Recuperamos solo las que se
  // pueden identificar sin ambigüedad por su nombre exacto (Informe 0, Control
  // 2, etc.); una nota con otro nombre no se asigna a ojo.
  data.ramos.forEach(r=>(r.categorias||[]).forEach(c=>{
    if(!Number.isInteger(c.slots)||c.slots<=1)return;
    (c.notas||[]).forEach(n=>{
      if(Number.isInteger(n.slot)&&n.slot>=0&&n.slot<c.slots)return;
      const nombre=normName(n.nombre||'');
      const slot=Array.from({length:c.slots},(_,i)=>i)
        .find(i=>normName(etiquetaCasilla(r,c,i))===nombre);
      if(slot!==undefined)n.slot=slot;
    });
    // Y el destrozo que dejó ese mismo defecto: mientras `slot` se perdía,
    // `setSlotNota` no encontraba la nota anterior —limpia con
    // `filter(n=>n.slot!==slot)`— y agregaba otra. Reescribir Informe 0 seis
    // veces dejaba SEIS notas de la misma casilla.
    //
    // No es cosmético. `avgPond` las promedia todas, así que quien escribió 5,0
    // y después 6,0 tiene 5,5 de nota en esa categoría: el promedio del ramo
    // está malo. Y el contador y el avance las cuentan como casillas rendidas,
    // que es por qué un ramo con una nota decía 6/6 y 70% evaluado.
    //
    // Se conserva la ÚLTIMA de cada casilla: `setSlotNota` agrega al final, así
    // que es la más reciente y la que el estudiante quiso dejar. Las anteriores
    // eran intentos pisados, no notas distintas.
    const vistas=new Map();
    (c.notas||[]).forEach(n=>{if(Number.isInteger(n.slot))vistas.set(n.slot,n);});
    if(vistas.size<(c.notas||[]).filter(n=>Number.isInteger(n.slot)).length){
      c.notas=(c.notas||[]).filter(n=>!Number.isInteger(n.slot)||vistas.get(n.slot)===n);
    }
  }));
  // Las pautas oficiales llegan DESPUÉS de que el estudiante agregó el ramo.
  // Hasta acá el preset solo se aplicaba al crearlo, así que quien tenía
  // Introducción a la Programación desde antes se quedaba en "Sin evaluaciones"
  // para siempre, aunque su pauta ya estuviera publicada. No falla nada: el
  // ramo simplemente nunca se entera. Por eso se rellena al cargar.
  data.ramos.forEach(r => {
    migrarOrigenesFecha(r);
    const p = pautaPendiente(r);
    if (p) { r.categorias = p.categorias; r.gates = p.gates; r.aporta = p.aporta || null; r.recuperativo = p.recuperativo || null; r.reglasAusenciaJustificada=p.reglasAusenciaJustificada||null; r.pautaHuella = huellaPauta(p.categorias); }
    // La regla es aditiva y no cambia ningún promedio sin una declaración. Así
    // los ramos oficiales ya creados también pueden ofrecer el recuperativo,
    // sin reinterpretar notas ni tocar ramos manuales.
    const recuperativoOficial=copiarRecuperativo(definicionPresetDelRamo(r)?.recuperativo);
    if(!r.recuperativo&&recuperativoOficial)r.recuperativo=recuperativoOficial;
    // Igual que el recuperativo, la regla llega a los ramos oficiales creados
    // antes de publicarla, sin activar nada por sí sola.
    if(!r.reglasAusenciaJustificada){
      const reglaAusencia=resolverReglasAusencia(definicionPresetDelRamo(r),r.categorias);
      if(reglaAusencia)r.reglasAusenciaJustificada=reglaAusencia;
    }
    // Los créditos tenían el mismo problema que la pauta y era peor, porque no
    // se nota: `creditosDe` solo corría al CREAR el ramo, así que quien agregó
    // Introducción a la Programación antes de que su crédito estuviera en la
    // tabla se quedaba con `creditos:null` para siempre. La app le pedía
    // "agrega créditos" por un dato que sí tenemos.
    //
    // Y no es cosmético: el promedio general se pondera por créditos SOLO si
    // todos los ramos con nota los tienen. Un ramo sin créditos hace caer a
    // toda la cuenta a promedio simple, que es otro número.
    //
    // Solo se rellena si está vacío y si el ramo vino del catálogo: un crédito
    // escrito a mano por el estudiante manda sobre la tabla.
    if ((r.creditos === null || r.creditos === undefined) && r.origen && r.origen.tenant) {
      const cr = creditosDe(r.nombre, r.origen.tenant, null);
      if (typeof cr === 'number') r.creditos = cr;
    }
    completarFechasOficiales(r,{tenant:data.tenant,carrera:data.carrera});
  });
  data.onboardingDone = Boolean(data.onboardingDone);
  data.careerSemestre = Number(data.careerSemestre) || 1;
  data.userName = data.userName || '';
  // Lo que el estudiante DECLARÓ que estudia. Es lo único que hay cuando su
  // carrera no tiene malla, y es el dato que dice qué malla construir después.
  data.carreraNombre = typeof data.carreraNombre === 'string' && data.carreraNombre.trim()
    ? data.carreraNombre.trim().slice(0, 120) : null;
  // El historial guarda ramos completos y sus ids llegan a los mismos atributos
  // onclick (`toggleHist('<id>')`), así que necesita el mismo saneo. Antes se
  // aceptaba tal cual: un respaldo importado con historial era el mismo agujero.
  data.historial = (Array.isArray(data.historial) ? data.historial : []).map(h => ({
    ...h,
    id: idSeguro(h.id),
    ramos: (h.ramos || []).map(r => ({
      ...r,
      id: idSeguro(r.id),
      categorias: (r.categorias || []).map(c => ({
        ...c,
        id: idSeguro(c.id),
        notas: (c.notas || []).map(n => ({...n, id: idSeguro(n.id)})),
      })),
    })),
  }));
  data.carrera = data.carrera || null;
  data.tenant = data.tenant || 'fen';
  // Las dos menciones de Ing. Comercial se fusionaron: se elige más adelante en
  // la carrera, así que del 1º al 4º eran idénticas.
  if(data.carrera==='IC-CE'||data.carrera==='IC-AE')data.carrera='IC';
  data.modo = ['claro','oscuro'].includes(data.modo) ? data.modo : 'sistema';
  data.acento = ACENTOS[data.acento] ? data.acento : 'turquesa';
  data.fondo = FONDOS[data.fondo] ? data.fondo : 'neutro';
  data.sortMode = ['manual','avg','name'].includes(data.sortMode) ? data.sortMode : 'manual';
  return data;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { data: normalize(JSON.parse(raw)) };
  } catch(e) {}
  return { data: null };
}

// ─── MARCA DE UNIVERSIDAD ────────────────────────────────────────────────────
// Los datos (TENANTS, TENANT_GLYPHS) están en data.js.

// Contenido de la marca: el SVG si está registrado, si no la sigla.
function tenantMark(code){
  const g=TENANT_GLYPHS[code];
  if(g)return `<svg class="tenant-glyph" viewBox="0 0 48 48">${g}</svg>`;
  const t=TENANTS[code];
  const txt=(t&&(t.mono||t.short))||'?';
  return `<span class="tenant-mono" data-len="${txt.length}">${esc(txt)}</span>`;
}

// Con caja teñida — onboarding
function tenantBadge(code,cls){
  if(!TENANTS[code])return '';
  return `<span class="tenant-badge ${cls||''}" style="--tb:var(--primary)" aria-hidden="true">`
    +tenantMark(code)+'</span>';
}

// Compacta — junto al wordmark de GradeHub en la topbar
function tenantGlyphBare(code){
  if(!TENANTS[code])return '';
  return `<span class="brand-tenant" style="--tb:var(--primary)" aria-hidden="true">`
    +tenantMark(code)+'</span>';
}
let selectedTenant='fen';

// ─── IDENTIDAD VISUAL · APLICACIÓN ───────────────────────────────────────────
// La universidad no altera la paleta. Su identidad vive en sus datos y en el
// monograma; estos tokens son los mismos para toda persona que usa GradeHub.

// Universidades que se ofrecen al elegir. Una oculta sigue apareciendo si el
// estudiante ya la tiene seleccionada, para no dejarlo sin su opción actual.
function tenantsVisibles(actual){
  return Object.entries(TENANTS).filter(([code,cfg])=>!cfg.oculto||code===actual);
}

// Escribe la identidad como CSS custom properties en :root. Todos los
// componentes leen estas variables, sin condicionales de universidad.
// Modo de color: 'sistema' sigue al sistema operativo, 'claro' y 'oscuro' lo
// fuerzan. El atributo data-modo en :root es lo que hace que el CSS forzado le
// gane a la media query (ver el bloque de temas en styles.css).
function modoColor(){
  const m=S&&S.modo;
  return m==='claro'||m==='oscuro'?m:'sistema';
}
function prefersDark(){
  const m=modoColor();
  if(m==='claro')return false;
  if(m==='oscuro')return true;
  return !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function aplicarModo(){
  const m=modoColor();
  const r=document.documentElement;
  if(m==='sistema')r.removeAttribute('data-modo'); else r.setAttribute('data-modo',m);
}
function setModo(m){
  S.modo=(m==='claro'||m==='oscuro')?m:'sistema';
  save();aplicarModo();applyTheme();track('set_modo',{modo:S.modo});
  const g=document.getElementById('s-modo-grid');if(g)renderModoGrid();
}
function setAcento(acento){
  S.acento=ACENTOS[acento]?acento:'turquesa';
  save();applyTheme();track('set_acento',{acento:S.acento});
  const g=document.getElementById('s-acento-grid');if(g)renderAcentoGrid();
}
function setFondo(fondo){
  S.fondo=FONDOS[fondo]?fondo:'neutro';
  save();applyTheme();track('set_fondo',{fondo:S.fondo});
  const g=document.getElementById('s-fondo-grid');if(g)renderFondoGrid();
}
function applyTheme(){
  aplicarModo();
  const th=ACENTOS[(S&&S.acento)||'turquesa']||GRADEHUB_THEME;
  const r=document.documentElement.style;
  const dark=prefersDark();
  const modo=dark?'oscuro':'claro';
  const fondo=FONDOS[(S&&S.fondo)||'neutro']||FONDOS.neutro;
  const surf=fondo[modo];
  const sem=SEMAFORO[modo];
  // Acentos: valen en ambos modos
  r.setProperty('--primary',dark?(th.darkPrimary||th.primary):th.primary);
  r.setProperty('--primary-fg',dark?(th.darkPrimaryFg||th.primaryFg):th.primaryFg);
  r.setProperty('--primary-light',dark?th.darkPrimaryLight:th.primaryLight);
  r.setProperty('--accent',th.accent);
  r.setProperty('--secondary',dark?(th.darkSecondary||th.secondary||th.accent):(th.secondary||th.accent));
  r.setProperty('--green',sem.green);
  r.setProperty('--green-bg',sem.greenBg);
  r.setProperty('--green-border',sem.greenBorder);
  r.setProperty('--yellow',sem.yellow);
  r.setProperty('--yellow-bg',sem.yellowBg);
  r.setProperty('--red',sem.red);
  r.setProperty('--red-bg',sem.redBg);
  SURFACE_KEYS.forEach(k=>r.setProperty('--'+k,surf[k]));
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',surf.bg);
}
// Si el sistema cambia de claro a oscuro, recalcular las superficies del tema
if(window.matchMedia){
  const mq=window.matchMedia('(prefers-color-scheme: dark)');
  const onChange=()=>applyTheme();
  if(mq.addEventListener)mq.addEventListener('change',onChange);
  else if(mq.addListener)mq.addListener(onChange);
}

// Paleta de colores de ramo. Es UNA sola para los cuatro temas: el color
// identifica al ramo, no decora la universidad (ver el comentario en data.js).
// Solo aplica a ramos NUEVOS — los existentes conservan el que ya tienen.
function chartColors(){return COLORS;}

// Siguiente color sugerido: rota la paleta del tema evitando repetir si se puede
// Color sugerido para un ramo. Primero su familia (ver FAMILIAS_COLOR en
// data.js); si no calza, uno estable derivado del nombre, para que el mismo
// ramo se vea igual en la app de dos compañeros. El estudiante puede cambiarlo
// siempre — esto es solo el punto de partida.
function colorDeFamilia(nombre){
  const n=normName(nombre);
  const f=FAMILIAS_COLOR.find(([re])=>re.test(n));
  return f?f[1]:null;
}
function colorEstable(nombre){
  const pal=chartColors();
  const n=normName(nombre);
  let h=0;
  for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))>>>0;
  return pal[h%pal.length];
}
function nextRamoColor(nombre){
  const pal=chartColors();
  const usados=new Set((S&&S.ramos?S.ramos:[]).map(r=>r.color));
  if(nombre){
    // La familia SUGIERE, no impone. Si el color de la familia ya lo tiene otro
    // ramo del estudiante, se cede: distinguir un ramo de otro pesa más que
    // agrupar por materia. Micro I y Macro I son economía los dos, pero en la
    // lista tienen que verse distintos — esa fue la queja original.
    const fam=colorDeFamilia(nombre);
    if(fam&&!usados.has(fam))return fam;
    const est=colorEstable(nombre);
    if(!usados.has(est))return est;
  }
  const libre=pal.find(c=>!usados.has(c));
  return libre||pal[(S&&S.ramos?S.ramos.length:0)%pal.length];
}

// ─── CATÁLOGO · ACCESO ───────────────────────────────────────────────────────
// Carreras, mallas y portales viven en data.js. Acá solo se elige cuál aplica
// según el tenant.
// Todas las carreras que se pueden DECLARAR, con las que tienen malla primero.
// Si no tenemos la oferta de esa universidad, cae a las que sí tienen malla:
// nunca devuelve vacío, porque un paso obligatorio sin opciones deja al
// estudiante encerrado en el onboarding.
function carrerasDeclarables(t){
  const lista=(typeof CARRERAS_DECLARABLES!=='undefined'&&CARRERAS_DECLARABLES[t])||null;
  if(lista&&lista.length)return lista.slice().sort((a,b)=>(b.malla?1:0)-(a.malla?1:0)||a.n.localeCompare(b.n,'es'));
  return Object.entries(carrerasFor(t)).filter(([c])=>c!=='OTRA').map(([malla,n])=>({n,malla}));
}
function carrerasFor(t){
  if(t==='uc')return CARRERAS_UC;
  if(t==='uai')return CARRERAS_UAI;
  if(t==='uandes')return CARRERAS_UANDES;
  return CARRERAS;
}
// Solo devuelve una malla si la tenemos verificada para ESA universidad. El
// default era `MALLA`, la de la FEN: cualquier universidad que no fuera UC
// recibía las mallas de Economía y Negocios de la Chile. Con dos tenants
// visibles no se notaba; al agregar el tercero, sí.
function mallaFor(t){
  if(t==='uc')return MALLA_UC;
  if(t==='fen')return MALLA;
  return {};   // sin malla verificada: el estudiante arma sus ramos
}
function selectTenant(t){
  selectedTenant=t;selectedCarrera=null;applyTheme();renderTenantPick();initCarreraGrid();checkOb();
  // En onboarding avanzamos solo: el usuario ve la selección y pasa al siguiente paso
  if(typeof obStep!=='undefined' && obStep===2 && document.getElementById('screen-onboard').classList.contains('active')){
    setTimeout(()=>{if(obStep===2)obNext();},260);
  }
}
function renderTenantPick(){
  const g=document.getElementById('tenant-grid');if(!g)return;g.innerHTML='';
  tenantsVisibles(selectedTenant).forEach(([code,cfg])=>{
    const b=document.createElement('button');
    b.className='tenant-opt'+(code===selectedTenant?' sel':'');
    b.style.setProperty('--tb','var(--primary)');
    b.innerHTML=`${tenantBadge(code,'lg')}
      <span class="tenant-opt-info">
        <span class="tenant-opt-name">${esc(cfg.name)}</span>
        <span class="tenant-opt-sub">${esc(cfg.sub||'')}</span>
      </span>`;
    b.onclick=()=>selectTenant(code);
    g.appendChild(b);
  });
}

function portalFor(tenant){return tenant==='uc'?PORTAL_UC:PORTAL;}

// ─── ESTADO ──────────────────────────────────────────────────────────────────
let S={ramos:[],userName:'',careerSemestre:1,carrera:null,tenant:'fen',onboardingDone:false,historial:[],sortMode:'manual',modo:'sistema',acento:'turquesa',fondo:'neutro'};
let currentRamoId=null,openCats={},selectedSem=1,selectedCarrera=null,selectedCarreraNombre=null,carreraFiltro='',modalColor=COLORS[0];
let openHist={};

let _toastTimer=null;
function showToast(msg,isError=false){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.style.background=isError?'var(--red)':'var(--fg)';
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>t.classList.remove('show'),2800);
}
// ¿Está disponible localStorage? (en sandbox/preview o navegación privada puede estar bloqueado)
let _storageOK=true;
try{const k='__fen_test__';localStorage.setItem(k,'1');localStorage.removeItem(k);}
catch(e){_storageOK=false;}

function save(){
  if(_storageOK){
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify(S));
    }catch(e){
      const lleno = e && (e.name==='QuotaExceededError' || e.code===22 || e.code===1014 || /quota|exceeded/i.test(e.message||''));
      if(lleno){
        showToast('<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> Almacenamiento lleno',true);
      }else{
        // localStorage dejó de estar disponible → seguimos en memoria + nube, sin spamear
        _storageOK=false;
        console.warn('localStorage no disponible:',e);
      }
    }
  }
  syncToCloud();
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
// Los ids se interpolan dentro de atributos onclick ("toggleCat('<id>')"), así
// que un id con comillas se sale de la llamada y el resto se ejecuta como JS.
// `uid()` solo produce [a-z0-9], pero un id NO siempre lo genera la app: al
// importar un respaldo se conserva el que venga en el JSON, y `esExportValido`
// solo comprueba que `ramos` sea un arreglo. Pegar un respaldo ajeno bastaba
// para ejecutar código con la sesión de Supabase en localStorage.
//
// Se saneia en la frontera: un id que no calce se reemplaza por uno nuevo. Es
// preferible a escapar en cada uno de los 30 sitios de render, porque olvidar
// uno vuelve a abrir el agujero entero.
// La expresión va adentro a propósito: `normalize` se ejecuta al cargar los
// datos, antes de que este trozo del archivo se haya evaluado, y un `const`
// externo estaría en zona muerta temporal. Reventaría el arranque de la app.
function idSeguro(v){return (typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v))?v:uid();}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
// Redondea a 2 decimales para evitar errores de punto flotante en comparaciones
function r2(n){return Math.round(n*100)/100;}
// El semáforo conserva sus categorías: una nota bajo 4,0 no puede parecerse a
// una aprobada. Dentro de cada categoría sí graduamos el color para que 1,0 y
// 3,9, por ejemplo, no se sientan igual de urgentes.
function colorClass(n){if(n===null||isNaN(n))return'neutral';const v=r2(n);return v>=5.0?'good':v>=4.0?'warn':'bad';}
function notaHue(n){
  const v=Math.max(1,Math.min(7,Number(n)));
  // Tres bandas semánticas, con saltos visibles al aprobar (4,0) y al salir
  // de la zona de riesgo (5,0). 1,0→0° rojo; 4,0→48° ámbar; 6,0→142° verde.
  //
  // El verde llega a su tope en 6,0, no en 7,0: un 7 es excepcional, y
  // reservarle el mejor verde dejaba a todas las notas que sí se sacan los
  // estudiantes en verdes apagados. De 6,0 a 7,0 el color se queda arriba.
  if(v<4)return(v-1)*18/3;
  if(v<5)return 48+(v-4)*12;
  return 105+Math.min(v-5,1)*37;
}
function notaUrgente(n){return Number(n)<=1.05;}
function notaPerfecta(n){return Number(n)>=6.95;}
function claseNotaEspecial(n){return notaUrgente(n)?' grade-urgent':notaPerfecta(n)?' grade-perfect':'';}
function getColor(n){
  if(n===null||isNaN(n))return'var(--fg3)';
  if(notaUrgente(n))return'hsl(352 100% var(--grade-urgent-light))';
  // El 7,0 NO cambia de matiz: se queda en el verde de aprobado, más vivo. El
  // oro que tenía antes era hsl(43…), el mismo matiz exacto que el ámbar de "al
  // borde" (#ffc94d es hue 42°), así que la nota perfecta se pintaba del color
  // del peligro. El adorno dorado ahora va en un anillo alrededor, en styles.css:
  // rodea el número pero nunca lo colorea, y por eso no puede confundirse con un
  // estado.
  if(notaPerfecta(n))return'hsl(142 92% var(--grade-perfect-light))';
  return`hsl(${notaHue(n).toFixed(1)} 84% var(--grade-light))`;
}
function fmt(n){return n===null?'·':n.toFixed(1);}
// Formato numérico con 1 decimal por defecto (usa punto, no coma)
function nf(n,dec){return n.toFixed(dec==null?1:dec);}

// ─── MOMENTO DE LA NOTA ──────────────────────────────────────────────────────
// El cálculo ya ocurrió antes de llegar acá. Estas funciones solo representan
// visualmente el cambio para que el resultado no aparezca como un reemplazo
// silencioso. Mientras el número se mueve, su color corresponde al valor que
// se está mostrando; así el semáforo nunca comunica un estado falso.
let pendingGpaFeedback=null;
function movimientoReducido(){return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
function duracionMovimiento(token){
  const raw=getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n=parseFloat(raw);
  if(!Number.isFinite(n))return 0;
  return raw.endsWith('ms')?n:raw.endsWith('s')?n*1000:0;
}
function promedioMarkup(valor,tipo){
  const s=nf(valor);const dot=s.indexOf('.');
  const decimal=tipo==='ramo'?'ramo-decimal':'gpa-decimal';
  return `${s.slice(0,dot)}<span class="${decimal}">${s.slice(dot)}</span>`;
}
function pintarPromedio(el,valor,tipo,efecto){
  el.innerHTML=promedioMarkup(valor,tipo);
  el.className=`${tipo==='ramo'?'ramo-num':'gpa-num'} ${colorClass(valor)}${claseNotaEspecial(valor)}${efecto?' '+efecto:''}`;
  el.style.setProperty('--grade-color',getColor(valor));
}
function cambioDeUmbral(antes,despues){return antes!==null&&despues!==null&&colorClass(antes)!==colorClass(despues);}
function cambioDePromedio(antes,despues){return antes!==null&&despues!==null&&Math.abs(antes-despues)>.0001;}
function animarPromedio(el,antes,despues,tipo){
  if(!el||despues===null)return;
  const cruzaUmbral=cambioDeUmbral(antes,despues);
  const duracion=duracionMovimiento('--motion-base');
  if(!cambioDePromedio(antes,despues)||movimientoReducido()||!duracion){
    pintarPromedio(el,despues,tipo,antes===null&&!movimientoReducido()?'grade-value-arrival':'');
    return;
  }
  const inicio=performance.now();
  const paso=ahora=>{
    const progreso=Math.min((ahora-inicio)/duracion,1);
    // ease-out: se siente inmediato al escribir, sin convertir la nota en espera.
    const eased=1-Math.pow(1-progreso,3);
    const valor=antes+(despues-antes)*eased;
    pintarPromedio(el,valor,tipo,'grade-value-changing');
    if(progreso<1){requestAnimationFrame(paso);return;}
    pintarPromedio(el,despues,tipo,cruzaUmbral?'grade-threshold-crossed':'');
    if(cruzaUmbral)window.setTimeout(()=>el.classList.remove('grade-threshold-crossed'),duracion);
  };
  requestAnimationFrame(paso);
}
function mostrarEcoGpa(antes,despues){
  if(!cambioDePromedio(antes,despues))return;
  document.getElementById('grade-gpa-echo')?.remove();
  const fila=document.querySelector('.ramo-hero-num-row');if(!fila)return;
  const eco=document.createElement('span');
  eco.id='grade-gpa-echo';eco.className='grade-gpa-echo';eco.setAttribute('role','status');
  eco.textContent=`Promedio general ${nf(antes)} → ${nf(despues)}`;
  fila.appendChild(eco);
}
// Parser de notas: acepta "6.5", "6,5", "65" (autocorrige a 6.5), "70" → 7.0.
// Devuelve un número con 1 decimal en rango [1.0, 7.0], o NaN si inválido.
function parseNota(raw){
  const txt=String(raw==null?'':raw).trim().replace(',','.');
  if(txt==='')return NaN;
  let v=parseFloat(txt);
  if(isNaN(v))return NaN;
  // Auto-corrección: "65"/"70"/"45" → 6.5/7.0/4.5 (enteros de 2 dígitos sin punto).
  // Solo hasta 70 para evitar ambigüedad — "77" queda como error de input, no 7.7.
  if(!txt.includes('.') && Number.isInteger(v) && v>=10 && v<=70){
    v=v/10;
  }
  if(v<1||v>7)return NaN;
  return Math.round(v*10)/10;
}
// initials recibe texto plano; esc() se aplica después sobre el resultado
function initials(s){return s.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();}
// ─── ADAPTADOR FENnotas → árbol del motor ────────────────────────────────────
// Las casillas declaradas viven en la estructura de cálculo, no en S. Así una
// categoría de seis informes con solo el Informe 0 sigue teniendo cinco hojas
// pendientes para la meta, pero no se inventan notas ni se sincroniza nada.
function hojasCategoria(c){
  const notas=Array.isArray(c&&c.notas)?c.notas:[];
  const slots=Number.isInteger(c&&c.slots)&&c.slots>1?c.slots:0;
  if(!slots)return notas.map(n=>({id:n.id,name:n.nombre,weight:(n.peso||1),type:'leaf'}));
  // Una reescritura de la misma casilla es una corrección, no otra entrega.
  // `setSlotNota` ya deja solo la última al guardar; este Map protege también
  // respaldos antiguos o importados que todavía traen las dos versiones.
  const porSlot=new Map(),sinSlot=[];
  notas.forEach(n=>{
    if(Number.isInteger(n.slot)&&n.slot>=0&&n.slot<slots)porSlot.set(n.slot,n);
    else sinSlot.push(n);
  });
  const reales=[...porSlot.values(),...sinSlot];
  const ids=new Set(reales.map(n=>n.id));
  const hojas=reales.map(n=>({id:n.id,name:n.nombre,weight:(n.peso||1),type:'leaf'}));
  for(let slot=0;slot<slots;slot++){
    if(porSlot.has(slot))continue;
    let id=`__gh_pendiente_slot__${c.id}__${slot}`;
    while(ids.has(id))id+='_';
    ids.add(id);
    hojas.push({id,name:`${c.nombre} pendiente ${slot+1}`,weight:1,type:'leaf'});
  }
  return hojas;
}
// Convierte un ramo (categorias→notas) en la estructura del motor. Resultado de
// ramoAvg idéntico al cálculo histórico: las hojas sin valor no entran al promedio.
function ramoToStructure(r){
  return {__meta:{grade_scale:{min:1,max:7},rounding:{decimals:2},passing_grade:4.0},
    id:'final',name:r.nombre||'Ramo',type:'group',aggregation_rule:'weighted_average',
    children:categoriasVigentes(r).map(c=>({id:c.id,name:c.nombre,weight:c.peso,type:'group',aggregation_rule:'weighted_average',
      // dropLowest viene del preset ("se elimina el 25% de los controles
      // rendidos"). Sin la clave el motor no descarta nada, así que los ramos
      // manuales y los presets que no la declaran calculan igual que siempre.
      drop_lowest:c.dropLowest||null,
      children:hojasCategoria(c)}))};
}
function gradesOf(r){const g={};(r.categorias||[]).forEach(c=>(c.notas||[]).forEach(n=>{if(n.valor!==null&&n.valor!==undefined)g[n.id]=n.valor;}));return g;}

function avgPond(notas){let tv=0,tp=0;notas.forEach(n=>{if(n.valor!==null){tv+=n.valor*(n.peso||1);tp+=(n.peso||1);}});return tp>0?tv/tp:null;}
// Una eximición no agrega una evaluación ni cambia sus pesos: solo marca que
// una evaluación existente ya no se debe rendir. La regla llega del preset y
// se consulta por `origen`, así también funciona para ramos oficiales que se
// crearon antes de que la regla existiera. Un ramo manual del mismo nombre no
// recibe excepciones del catálogo.
function definicionPresetDelRamo(ramo){
  const origen=ramo&&ramo.origen;
  if(!origen||!origen.tenant)return null;
  if(origen.tenant==='fen'){
    const nombre=Object.keys(PRESETS_FEN).find(n=>normName(n)===normName(ramo.nombre));
    return nombre?PRESETS_FEN[nombre]:null;
  }
  if(origen.tenant!=='uc'||!presetUcDisponible(ramo.nombre,origen.carrera))return null;
  const nombre=claveUc(ramo.nombre);
  return nombre?PRESETS_UC[nombre]:null;
}
// El nombre colectivo de una categoría no siempre es el de cada entrega.
// Ejemplo oficial: el Lab de Dinámica tiene la categoría "Informes", pero sus
// casillas son Informe 0 a Informe 5 porque también existe el Lab 0 online.
// Se consulta el preset como respaldo para que los ramos ya creados antes de
// este campo se dibujen bien sin reescribir sus notas ni forzar una sync.
function detalleCasillas(ramo,cat){
  const def=definicionPresetDelRamo(ramo);
  const evals=Array.isArray(def)?def:(def&&def.evals||[]);
  const extra=(evals.find(([nombre])=>normName(nombre)===normName(cat&&cat.nombre))||[])[2]||{};
  return {
    nombre:typeof cat?.slotLabel==='string'?cat.slotLabel:(typeof extra.slotLabel==='string'?extra.slotLabel:cat.nombre),
    inicio:Number.isInteger(cat?.slotStart)?cat.slotStart:(Number.isInteger(extra.slotStart)?extra.slotStart:1),
  };
}
function etiquetaCasilla(ramo,cat,slot){
  const detalle=detalleCasillas(ramo,cat);
  return `${detalle.nombre} ${detalle.inicio+slot}`;
}
function promedioCompletoSinDescarte(cat){
  const objetivo=Number.isInteger(cat&&cat.slots)&&cat.slots>1?cat.slots:1;
  const notas=(cat&&cat.notas||[]).filter(n=>typeof n.valor==='number');
  // Cuatro de cinco no son una aproximación suficiente para decidir que el
  // Examen deja de ser obligatorio.
  //
  // Y por eso se cuentan CASILLAS con nota, no notas: dos valores de la misma
  // casilla son un dato pisado, no dos controles rendidos. Contando notas, tres
  // controles con dos reescrituras parecían cinco y la app podía declarar a
  // alguien exento del Examen —con un promedio sacado de intentos repetidos—
  // por un dato que él nunca escribió. De todos los lugares donde ese error
  // aparecía, este es el que manda a una persona a no rendir una prueba.
  //
  // Y no basta con CONTAR casillas: también hay que promediar una sola por
  // casilla. Contando bien pero promediando todo, un intento viejo de 1,0
  // arrastraba el promedio y negaba una eximición que sí correspondía — el
  // error al revés, igual de malo.
  const porCasilla=new Map();
  notas.forEach(n=>{if(Number.isInteger(n.slot))porCasilla.set(n.slot,n);});
  const vigentes=objetivo>1
    ? (porCasilla.size?[...porCasilla.values()]:notas)
    : notas;
  const rendidas=objetivo>1&&porCasilla.size?porCasilla.size:notas.length;
  if(rendidas<objetivo)return null;
  return avgPond(vigentes);
}
function estadoEximicion(ramo){
  const def=definicionPresetDelRamo(ramo);
  const regla=!Array.isArray(def)&&def&&def.eximicion;
  if(!regla||!Array.isArray(regla.segun)||regla.ignoraDescartes!==true)return null;
  const categorias=ramo.categorias||[];
  const examen=categorias.find(c=>normName(c.nombre)===normName(regla.evaluacion));
  if(!examen)return null;
  if(avgPond(examen.notas)!==null)return {activa:false,pendiente:false,examenId:examen.id,razon:'examen_rendido'};
  const fuentes=regla.segun.map(nombre=>categorias.find(c=>normName(c.nombre)===normName(nombre))).filter(Boolean);
  if(fuentes.length!==regla.segun.length)return null;
  const promedios=fuentes.map(promedioCompletoSinDescarte);
  if(promedios.some(p=>p===null))return {activa:false,pendiente:true,examenId:examen.id};
  const pesoTotal=fuentes.reduce((s,c)=>s+(Number(c.peso)||0),0);
  const promedio=pesoTotal>0?fuentes.reduce((s,c,i)=>s+promedios[i]*(Number(c.peso)||0),0)/pesoTotal:null;
  return {activa:promedio!==null&&promedio>=regla.min,pendiente:false,examenId:examen.id,promedio,regla};
}
function categoriaEximida(ramo,cat){const estado=estadoEximicion(ramo);return !!(estado&&estado.activa&&estado.examenId===cat.id);}
function categoriasVigentes(ramo){return (ramo&&ramo.categorias||[]).filter(c=>!categoriaEximida(ramo,c));}
function estadoAusenciasJustificadas(ramo){
  if(!ramo||!ramo.reglasAusenciaJustificada)return null;
  return gh_prepararAusenciasJustificadas(ramoToStructure(ramo),gradesOf(ramo),ramo.reglasAusenciaJustificada,ramo.ausenciasJustificadas);
}
// Promedio ponderado de un subconjunto de categorías (para compuertas de grupo).
// Devuelve null si ninguna del grupo tiene nota todavía.
function avgDeGrupo(r,catIds){
  const set=new Set(catIds||[]);
  let num=0,den=0;
  (r.categorias||[]).forEach(c=>{
    if(!set.has(c.id))return;
    const a=avgPond(c.notas);
    if(a===null)return;
    num+=a*(c.peso||0);den+=(c.peso||0);
  });
  return den>0?num/den:null;
}
function avgDeGrupoCalculado(res,estructura,catIds){
  const valores=new Map((res.breakdown||[]).map(n=>[n.id,n.value]));
  const nodos=new Map((estructura.children||[]).map(n=>[n.id,n]));
  let num=0,den=0;
  (catIds||[]).forEach(id=>{
    const peso=Number((nodos.get(id)||{}).weight)||0,valor=valores.get(id);
    if(peso>0&&valor!==null&&valor!==undefined){num+=valor*peso;den+=peso;}
  });
  return den>0?num/den:null;
}

// ramoAvg pasa por el motor y luego aplica los pisos de nota del ramo.
// Dos tipos de compuerta:
//   min_grade_required → una evaluación bajo su mínimo topa la final en `cap`
//   group_min          → el promedio de un CONJUNTO de evaluaciones bajo su
//                        mínimo topa la final. Con cap:'self' el tope es el
//                        propio promedio del grupo (regla "la nota más baja
//                        entre los dos requisitos", común en FEN).
function calculoRamoConCompuertas(r){
  const ausencias=estadoAusenciasJustificadas(r);
  const estructura=ausencias?ausencias.estructura:ramoToStructure(r);
  const notas=ausencias?ausencias.notas:gradesOf(r);
  const res=calculateFinalGrade(estructura,notas);
  let v=res.raw,limitadoPorCompuerta=false;
  if(v!==null && Array.isArray(r.gates)){
    for(const g of r.gates){
      if(g.type==='min_grade_required'){
        const node=res.breakdown.find(b=>b.id===g.catId);
        if(node && node.value!==null && node.value < g.min){
          const siguiente=Math.min(v,g.cap);if(siguiente<v)limitadoPorCompuerta=true;v=siguiente;
        }
      } else if(g.type==='group_min'){
        const ga=avgDeGrupoCalculado(res,estructura,g.catIds);
        if(ga!==null && ga < g.min){
          const tope=(g.cap==='self')?ga:g.cap;
          const siguiente=Math.min(v,tope);if(siguiente<v)limitadoPorCompuerta=true;v=siguiente;
        }
      }
    }
  }
  return {res,valor:v,limitadoPorCompuerta,estructura,notas,ausencias};
}
// El árbol del motor solo conoce las notas que ya existen. Una categoría con
// `slots:5` y cuatro notas no deja una quinta hoja vacía, así que una regla que
// exige ramo completo debe contar también las casillas declaradas en la pauta.
function ramoCompletamenteEvaluado(r,calculo){
  const cubiertas=new Set((calculo&&calculo.ausencias&&calculo.ausencias.activas||[]).map(x=>x.desdeId));
  const categorias=categoriasVigentes(r);
  return categorias.length>0&&categorias.every(c=>{
    if(cubiertas.has(c.id))return true;
    const objetivo=Number.isInteger(c.slots)&&c.slots>1?c.slots:1;
    return (c.notas||[]).filter(n=>typeof n.valor==='number').length>=objetivo;
  });
}
function estadoRecuperativo(r,calculo){
  const regla=copiarRecuperativo(r&&r.recuperativo);if(!regla)return null;
  const base=calculo||calculoRamoConCompuertas(r);
  return gh_estadoRecuperativo(base.valor,ramoCompletamenteEvaluado(r,base),base.limitadoPorCompuerta,regla,r.recuperativoRendido);
}
function resumenCategoriasCalculadas(r,calculo){
  const base=calculo||calculoRamoConCompuertas(r);
  const valores=new Map((base.res.breakdown||[]).map(n=>[n.id,n.value]));
  return (base.estructura.children||[]).filter(c=>(Number(c.weight)||0)>0).map(c=>({id:c.id,nombre:c.name,peso:Number(c.weight)||0,valor:valores.get(c.id)}));
}
function ramoAvg(r,visitados){
  const base=calculoRamoConCompuertas(r);
  const recuperativo=estadoRecuperativo(r,base);
  const v=recuperativo?recuperativo.valor:base.valor;
  return combinarConRamoVinculado(r,v,visitados);
}

// ─── UN RAMO QUE APORTA A OTRO ───────────────────────────────────────────────
// Dinámica y su laboratorio son dos cursos con dos actas, pero una sola nota
// final: NF = 0,7·NFC + 0,3·NL, y si cualquiera de los dos baja de 4,0, la
// final es la MENOR de las dos. Tenerlos como dos ramos sueltos obligaba al
// estudiante a hacer esa cuenta a mano cada vez que ingresaba una nota.
//
// El vínculo se declara en el dato (`aporta` en el preset) y no con un `if` de
// ramo en el código: el día que aparezca otro par cátedra/laboratorio —hay dos
// más en la malla— es agregar una línea a data.js.
function ramoVinculado(r){
  if(!r||!r.aporta||!r.aporta.ramo)return null;
  const objetivo=normName(r.aporta.ramo);
  return (S.ramos||[]).find(x=>x!==r&&normName(x.nombre)===objetivo)||null;
}
// `visitados` corta una referencia circular: si alguien declarara A→B y B→A,
// sin esto la recursión no termina y la app se cae al primer render.
function combinarConRamoVinculado(r,propio,visitados){
  const link=r&&r.aporta;
  if(!link||propio===null)return propio;
  const vistos=visitados||new Set();
  if(vistos.has(r.id))return propio;
  vistos.add(r.id);
  const otro=ramoVinculado(r);
  if(!otro)return propio;                      // todavía no agregó el laboratorio
  const externo=ramoAvg(otro,vistos);
  if(externo===null)return propio;             // el laboratorio aún no tiene notas
  const p=(link.peso||0)/100;
  let v=propio*(1-p)+externo*p;
  // "Si NL ≤ 4,0 o NFC ≤ 4,0, entonces NF = min(NFC, NL)."
  if(typeof link.min==='number'&&(propio<link.min||externo<link.min))v=Math.min(propio,externo);
  return v;
}
// Los descartes vienen del motor, pero se explican en la evaluación donde
// ocurren. La nota sigue visible: solo no participa en ese promedio.
function textoDescarte(cat,descarte){
  const notas=descarte.dropped||[];
  const cantidad=notas.length;
  const lista=notas.map(n=>`${n.name} (${fmt(n.value)})`).join(', ');
  const regla=cat.dropLowest||{};
  let redondeo='';
  if(typeof regla.fraction==='number'){
    const porcentaje=Math.round(regla.fraction*100);
    redondeo=` Con ${descarte.rendidas} evaluaciones rendidas, el ${porcentaje}% equivale a ${cantidad} ${cantidad===1?'nota':'notas'}: se redondea hacia abajo.`;
  }
  return `El programa descarta ${cantidad===1?'la nota más baja':'las notas más bajas'} de esta evaluación. ${lista} ${cantidad===1?'no cuenta':'no cuentan'} en este promedio.${redondeo}`;
}

// Compuertas incumplidas, para explicarlas en la UI
function gatesActivas(r){
  const calculo=calculoRamoConCompuertas(r);
  const valores=new Map((calculo.res.breakdown||[]).map(n=>[n.id,n.value]));
  const out=[];
  (r.gates||[]).forEach(g=>{
    if(g.type==='min_grade_required'){
      const c=(r.categorias||[]).find(x=>x.id===g.catId);
      if(!c)return;
      const a=valores.get(c.id);
      if(a!==null&&a<g.min)out.push({nombre:g.nombre||c.nombre,actual:a,min:g.min,cap:g.cap});
    } else if(g.type==='group_min'){
      const ga=avgDeGrupoCalculado(calculo.res,calculo.estructura,g.catIds);
      if(ga!==null&&ga<g.min){
        // con cap:'self' el tope es el propio promedio del grupo
        out.push({nombre:g.nombre||'Requisito',actual:ga,min:g.min,cap:(g.cap==='self')?ga:g.cap,grupo:true});
      }
    }
  });
  return out;
}
// Promedio general. En Chile el PPA se pondera por créditos (SCT), no es simple.
// Si TODOS los ramos con nota tienen créditos → ponderado. Si no → simple.
// Mezclar ambos daría un número engañoso, así que se prefiere lo predecible.
// Un ramo que APORTA a otro no entra por su cuenta al promedio general: su
// nota ya está adentro de la del ramo al que aporta. El Laboratorio de
// Dinámica contaba dos veces —una dentro de Dinámica y otra como ramo suelto—,
// y encima sus 0 SCT hacían caer el PPA a promedio simple, así que un curso de
// cero créditos terminaba pesando igual que uno de diez. Nada de eso falla:
// solo entrega un promedio más alto o más bajo del real.
function esAporteDeOtroRamo(r,ramos){
  if(!r)return false;
  const n=normName(r.nombre);
  return (ramos||[]).some(x=>x!==r&&x.aporta&&x.aporta.ramo&&normName(x.aporta.ramo)===n);
}
function ramosDelPromedio(ramos){
  return (ramos||[]).filter(r=>!esAporteDeOtroRamo(r,ramos));
}
// ¿Sabemos cuántos créditos vale este ramo?
//
// 0 SCT es un dato conocido y exacto, no un faltante: en Ingeniería UC valen 0
// los tres laboratorios de Física y Práctica I. Preguntar por `> 0` los trataba
// como "no tenemos el dato", y con eso UN laboratorio bastaba para tumbar el
// promedio ponderado de todo el semestre a promedio simple — justo lo que la
// tabla de créditos existe para evitar.
function tieneCreditos(r){return typeof r.creditos==='number'&&r.creditos>=0;}

function gpaMode(ramos){
  const conNota=ramosDelPromedio(ramos).filter(r=>ramoAvg(r)!==null);
  if(conNota.length===0)return 'empty';
  return conNota.every(tieneCreditos)?'creditos':'simple';
}
function gpa(ramos){
  const conNota=ramosDelPromedio(ramos).filter(r=>ramoAvg(r)!==null);
  if(conNota.length===0)return null;
  // `map` pasa (elemento, índice, array), así que `conNota.map(ramoAvg)` metía
  // el índice en el segundo parámetro de `ramoAvg(r,visitados)`. Del segundo
  // ramo en adelante `visitados` valía un número y `vistos.has(...)` reventaba,
  // tumbando el render entero. La lambda pasa un solo argumento a propósito.
  const simple=()=>{const a=conNota.map(r=>ramoAvg(r));return a.reduce((x,y)=>x+y,0)/a.length;};
  if(gpaMode(ramos)==='creditos'){
    let num=0,den=0;
    conNota.forEach(r=>{const a=ramoAvg(r);num+=a*r.creditos;den+=r.creditos;});
    // Todo lo rendido vale 0 SCT (un semestre de puros laboratorios): no hay con
    // qué ponderar, pero el estudiante igual tiene notas y merece ver su
    // promedio. Antes devolvía null y la pantalla quedaba sin número.
    return den>0?num/den:simple();
  }
  return simple();
}
// Total de créditos inscritos (solo cuenta los que tienen el dato)
function totalCreditos(ramos){
  return ramos.reduce((s,r)=>s+(tieneCreditos(r)?r.creditos:0),0);
}
// La precisión del PPA depende de que cada ramo ya evaluado tenga SCT. Esto
// solo identifica los datos pendientes para guiar al estudiante: no cambia
// cómo gpa() calcula ni interpreta el promedio.
function ramosSinCreditosParaPpa(ramos){
  return ramosDelPromedio(ramos).filter(r=>ramoAvg(r)!==null&&!tieneCreditos(r));
}
// El modo simple no es un error: es la respuesta honesta mientras falta un SCT
// oficial. Esta función solo lo explica; nunca cambia gpa(), créditos ni ramos.
function descripcionMetodoGpa(ramos){
  const modo=gpaMode(ramos);
  if(modo==='creditos')return{modo,texto:'Promedio ponderado por créditos.'};
  if(modo!=='simple')return null;
  const sinCreditos=ramosSinCreditosParaPpa(ramos);
  const primero=sinCreditos[0];
  if(!primero)return{modo,texto:'Promedio simple.'};
  const faltante=sinCreditos.length===1
    ?`falta el crédito oficial de ${primero.nombre}`
    :`faltan los créditos oficiales de ${primero.nombre} y ${sinCreditos.length-1} más`;
  return{modo,texto:`Promedio simple porque ${faltante}. Cuando estén disponibles, se calculará ponderado por créditos.`};
}
function semester(){
  const now=new Date(),m=now.getMonth(),y=now.getFullYear();
  // Ene-Feb = cierre del semestre anterior → año-1 S2
  if(m<=1)return`${y-1}-2`;
  if(m<=6)return`${y}-1`;
  return`${y}-2`;
}
// Tramos según uso chileno: la tarde se estira hasta las 20:00, y de madrugada
// sigue siendo "buenas noches" (no "buenos días" a las 3 AM).
function greeting(){
  const h=new Date().getHours();
  if(h<6)return 'Buenas noches';
  if(h<12)return 'Buenos días';
  if(h<20)return 'Buenas tardes';
  return 'Buenas noches';
}

// ─── SUPABASE / AUTH ───────────────────────────────────────────────────────────
// Credenciales del proyecto GradeHub. La publishable key es pública por diseño.
// Nunca poner la sb_secret_... acá — esa solo se usa en servidores.
// Largo mínimo de contraseña al CREAR o CAMBIAR una. Supabase trae 6 por
// defecto; súbelo también en el panel (Auth → Policies) o el servidor sigue
// aceptando 6 aunque el cliente no lo ofrezca.

// ─── INIT ────────────────────────────────────────────────────────────────────
const {data:loaded} = loadData();
if(loaded){S={...S,...loaded};}
selectedTenant=S.tenant||'fen';applyTheme();
// Estado del onboarding por pasos. Va acá y no junto a sus funciones porque
// boot() lo usa al arrancar: con `let` más abajo caía en la zona muerta temporal
// y la app crasheaba si Supabase no cargaba.
let obStep=1;
const OB_TOTAL=5;
// Etiquetas fijas nuestras, de lista cerrada: no son texto del estudiante, y
// hacen legible el embudo sin tener que traducir números mirando el código.
const OB_ETAPAS=['nombre','universidad','carrera','semestre','ramos'];
// Hasta qué paso llegó en ESTA pasada por el onboarding. El embudo cuenta
// cuántos alcanzan cada paso, así que cada uno se emite una sola vez: si
// volver atrás y volver a avanzar reemitiera, los primeros pasos saldrían
// inflados y la caída real quedaría escondida.
let obMaxPasoVisto=0;
let obRamos=[],obRamosKey='',obManualOpen=false,obManualError='';

initSemGrid();renderTenantPick();initCarreraGrid();
document.getElementById('ob-name').addEventListener('input',checkOb);


function initSemGrid(){
  const g=document.getElementById('sem-grid');g.innerHTML='';
  for(let i=1;i<=11;i++){
    const b=document.createElement('button');
    b.className='sem-btn'+(i===selectedSem?' sel':'');
    b.textContent=i+'°';
    b.onclick=()=>{selectedSem=i;initSemGrid();checkOb();};
    g.appendChild(b);
  }
}
// Con 71 carreras en la UC una grilla de botones no se puede recorrer. Es una
// lista buscable, y las que tienen malla van arriba marcadas: son el caso
// común y tienen que estar a un toque, pero el resto ahora EXISTE — antes un
// estudiante de Derecho no tenía cómo decir qué estudiaba.
function initCarreraGrid(){
  const g=document.getElementById('carrera-grid');if(!g)return;g.innerHTML='';
  const todas=carrerasDeclarables(selectedTenant);
  const q=normName(carreraFiltro||'');
  const vistas=q?todas.filter(c=>normName(c.n).includes(q)):todas;
  // Una carrera declarable no puede quedar escondida en un paso obligatorio.
  // 71 opciones son largas, pero el buscador sigue arriba y cada una tiene que
  // existir también para quien recorre la lista con el dedo.
  vistas.forEach(c=>{
    const elegida=c.malla?c.malla===selectedCarrera:(!selectedCarrera&&c.n===selectedCarreraNombre);
    const b=document.createElement('button');
    b.className='carrera-opt'+(elegida?' sel':'');
    b.innerHTML=esc(c.n)+(c.malla?' <span class="carrera-tiene-malla">tu malla se carga sola</span>':'');
    b.onclick=()=>{
      // `carrera` sigue siendo el código de la malla y manda en todo lo que ya
      // existe. `carreraNombre` es lo declarado, y es lo único que hay cuando
      // no tenemos su malla.
      selectedCarrera=c.malla||null;selectedCarreraNombre=c.n;
      initCarreraGrid();checkOb();
      if(typeof obStep!=='undefined' && obStep===3 && document.getElementById('screen-onboard').classList.contains('active')){
        setTimeout(()=>{if(obStep===3)obNext();},260);
      }
    };
    g.appendChild(b);
  });
  // La lista oficial envejece: una carrera nueva no puede dejar a alguien sin
  // poder declararse en un paso obligatorio. Que la búsqueda haya encontrado
  // algo parecido no prueba que sea SU carrera, así que la salida no depende de
  // que la lista quede vacía.
  if(q){
    const b=document.createElement('button');
    b.className='carrera-opt'+(!selectedCarrera&&carreraFiltro.trim()===selectedCarreraNombre?' sel':'');
    b.innerHTML='Usar «'+esc(carreraFiltro.trim())+'»';
    b.onclick=()=>{selectedCarrera=null;selectedCarreraNombre=carreraFiltro.trim();initCarreraGrid();checkOb();};
    g.appendChild(b);
  }
}
function filtrarCarreras(v){carreraFiltro=v;initCarreraGrid();}
// ─── ONBOARDING POR PASOS ────────────────────────────────────────────────────

// La validación es independiente por paso: la lista sugerida nunca obliga a
// tomar un ramo, y cada pantalla solo exige su propio dato.
function obStepValid(step,datos){
  const d=datos||{
    nombre:(document.getElementById('ob-name')||{}).value||'',
    tenant:selectedTenant,carrera:selectedCarrera,semestre:selectedSem,
    carreraNombre:selectedCarreraNombre
  };
  if(step===1)return !!String(d.nombre||'').trim();
  if(step===2)return !!d.tenant;
  if(step===3)return !!(d.carrera||String(d.carreraNombre||'').trim());
  if(step===4)return !!d.semestre;
  if(step===5)return true;
  return false;
}
function obProgressPct(step){return Math.round(step/OB_TOTAL*100);}

function obRamosActuales(){return ((mallaFor(selectedTenant)[selectedCarrera]||{})[selectedSem]||[]);}
function prepararObRamos(){
  const key=[selectedTenant,selectedCarrera,selectedSem].join(':');
  if(key===obRamosKey)return;
  obRamosKey=key;obManualOpen=false;
  obRamos=obRamosActuales().map(nombre=>({nombre,manual:false}));
  renderObCoursePicker();
}
function obTieneRamo(nombre){return obRamos.some(r=>normName(r.nombre)===normName(nombre));}
// encodeURIComponent deja el apóstrofo intacto. Como el valor entra en un
// literal JS delimitado por comillas simples dentro del atributo, se codifica
// también para que un nombre manual no pueda cerrar el handler.
function obCodificarNombre(nombre){return encodeURIComponent(nombre).replace(/'/g,'%27');}
function obToggleRamo(nombre,checked){
  if(checked&&!obTieneRamo(nombre))obRamos.push({nombre,manual:false});
  if(!checked)obRamos=obRamos.filter(r=>normName(r.nombre)!==normName(nombre));
  renderObCoursePicker();obRender();
}
function obToggleRamoCodificado(nombre,checked){obToggleRamo(decodeURIComponent(nombre),checked);}
function obAgregarCatalogo(nombre){
  if(!obTieneRamo(nombre))obRamos.push({nombre,manual:false});
  renderObCoursePicker();obRender();
}
function obAgregarCatalogoCodificado(nombre){obAgregarCatalogo(decodeURIComponent(nombre));}
function obToggleManual(){obManualOpen=!obManualOpen;obManualError='';renderObCoursePicker();}
function obAgregarManual(){
  const input=document.getElementById('ob-manual-name');
  const nombre=(input&&input.value||'').trim();
  if(!nombre){
    obManualError='Escribe el nombre del ramo para agregarlo.';
    const error=document.getElementById('ob-manual-error');
    if(error){error.textContent=obManualError;error.hidden=false;}
    if(input){input.setAttribute('aria-invalid','true');input.focus();}
    return false;
  }
  if(!obTieneRamo(nombre))obRamos.push({nombre,manual:true});
  obManualError='';obManualOpen=false;renderObCoursePicker();obRender();
  return true;
}
function obRamosVisibles(sugeridos,elegidos){
  const visibles=[...(sugeridos||[])];
  (elegidos||[]).forEach(r=>{
    const nombre=typeof r==='string'?r:(r&&r.nombre);
    if(nombre&&!visibles.some(n=>normName(n)===normName(nombre)))visibles.push(nombre);
  });
  return visibles;
}
// Ingeniería UC se separa por majors después del plan común. La app conoce
// muchos de esos ramos por su tabla de SCT, pero no puede asumir un major por
// semestre: sería cargarle cursos que quizá nunca toma.
function obCoursePickerIntro(sugeridos){
  if(selectedTenant==='uc'&&selectedCarrera==='ING-PC'&&selectedSem>=5){
    return 'Desde 5° Ingeniería UC se separa por major. No asumimos cuál tomas: busca por nombre o sigla de tu horario y arma este semestre a tu medida.';
  }
  if(!selectedCarrera&&selectedCarreraNombre){
    return `Todavía no tenemos una malla verificada para ${esc(selectedCarreraNombre)}. Puedes armar tu semestre buscando ramos de tu universidad o agregando los de tu horario.`;
  }
  return sugeridos.length
    ? 'Partimos con una sugerencia según tu avance. Puedes sumar ramos de cualquier otro semestre.'
    : 'No tenemos ramos sugeridos para este semestre. Busca los de tu horario o agrégalos a mano.';
}
function obCourseSearchLabel(){return selectedTenant==='uc'?'Buscar por nombre o sigla':'Buscar otro ramo';}
function obCourseSearchPlaceholder(){return selectedTenant==='uc'?'Ej.: IIC2333, Termodinámica':'Ej.: Inglés IV, Cálculo II';}
function obCatalogMeta(r){
  const lugar=r.semestre>0?`${r.semestre}° semestre`
    :r.fuente==='catalogo-ingenieria'?'catálogo de Ingeniería UC'
      :r.fuente==='curso-uc'?'curso UC fuera de malla':'fuera de malla';
  return `${r.sigla?esc(r.sigla)+' · ':''}${lugar}${r.tienePreset?' · con ponderaciones oficiales':''}`;
}
function renderObCoursePicker(){
  const box=document.getElementById('ob-course-picker');if(!box)return;
  const sugeridos=obRamosActuales();
  const visibles=obRamosVisibles(sugeridos,obRamos);
  const rows=visibles.length?visibles.map(nombre=>`
    <label style="display:flex;align-items:center;gap:11px;padding:10px 2px;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" ${obTieneRamo(nombre)?'checked':''} onchange="obToggleRamoCodificado('${obCodificarNombre(nombre)}',this.checked)" style="width:18px;height:18px;flex-shrink:0;accent-color:var(--primary);"/>
      <span class="course-picker-selected-name">${esc(nombre)}</span>
    </label>`).join(''):
    '';
  box.innerHTML=`
    <div class="course-picker">
      <p class="course-picker-intro">${obCoursePickerIntro(sugeridos)}</p>
      <div class="course-picker-section">
        <label class="modal-label">${sugeridos.length?`Sugeridos para ${selectedSem}°`:'Tu semestre'}</label>
        ${rows}
      </div>
      <div class="course-picker-section">
        <label class="modal-label" for="ob-course-search">${obCourseSearchLabel()}</label>
        <div class="course-picker-search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><input id="ob-course-search" type="text" placeholder="${obCourseSearchPlaceholder()}" maxlength="${NOMBRE_MAX}" autocomplete="off" autocapitalize="none"/></div>
        <div id="ob-course-results"></div>
      </div>
      <button class="course-picker-manual" type="button" onclick="obToggleManual()">¿No aparece? Agregar un ramo a mano</button>
      ${obManualOpen?`<div class="course-picker-search" style="margin-top:8px;"><input id="ob-manual-name" type="text" placeholder="Ej.: Electivo de cine" maxlength="${NOMBRE_MAX}" autocomplete="off" aria-describedby="ob-manual-error"/><button type="button" onclick="obAgregarManual()" style="border:0;background:none;color:var(--primary);font:inherit;font-weight:700;">Agregar</button></div><p id="ob-manual-error" role="alert"${obManualError?'':' hidden'} style="margin:6px 0 0;font-size:0.8125rem;color:var(--red);">${esc(obManualError)}</p>`:''}
    </div>`;
  const search=document.getElementById('ob-course-search');
  if(search){const pintar=()=>renderObCourseResults(search.value);search.addEventListener('input',pintar);pintar();}
  const manual=document.getElementById('ob-manual-name');
  if(manual){
    manual.addEventListener('keydown',e=>{if(e.key==='Enter')obAgregarManual();});
    manual.addEventListener('input',()=>{
      if(!obManualError)return;
      obManualError='';manual.removeAttribute('aria-invalid');
      const error=document.getElementById('ob-manual-error');
      if(error){error.textContent='';error.hidden=true;}
    });
  }
}
function renderObCourseResults(q){
  const box=document.getElementById('ob-course-results');if(!box)return;
  const term=(q||'').trim();if(!term){box.innerHTML='';return;}
  const res=searchCatalog(term,selectedTenant,selectedCarrera,selectedSem).slice(0,6);
  if(!res.length){box.innerHTML='<p class="course-picker-reassurance">No aparece en tu malla. Puedes agregarlo a mano.</p>';return;}
  box.innerHTML=res.map(r=>{
    const tengo=obTieneRamo(r.nombre),otro=r.semestre>0&&r.semestre!==selectedSem;
    return `<button class="course-picker-result" type="button" ${tengo?'disabled':`onclick="obAgregarCatalogoCodificado('${obCodificarNombre(r.nombre)}')"`}>
      <span class="course-picker-result-info"><span class="course-picker-result-name">${esc(r.nombre)}</span><span class="course-picker-result-meta">${obCatalogMeta(r)}</span></span>
      <span class="chevron-r">${tengo?'✓':'+'}</span>
    </button>${otro?'<p class="course-picker-reassurance">Que sea de otro semestre está bien.</p>':''}`;
  }).join('');
}

// Un evento por paso ALCANZADO. Sin esto solo se sabe cuántos terminaron, no
// dónde se fue el que no terminó — y "se aburrió eligiendo carrera" y "no
// encontró sus ramos" se arreglan distinto.
function obTrackPaso(){
  if(obStep<=obMaxPasoVisto)return;
  obMaxPasoVisto=obStep;
  track('onboarding_step',{paso:obStep,etapa:OB_ETAPAS[obStep-1]});
}
// Entrar al onboarding reinicia el embudo: si alguien cierra sesión y entra con
// otra cuenta sin recargar, su paso 1 tiene que volver a contarse.
function obIniciar(){obStep=1;obMaxPasoVisto=0;obRender();}

function obRender(){
  if(obStep===5)prepararObRamos();
  obTrackPaso();
  document.querySelectorAll('.ob-step').forEach(el=>{
    el.style.display=(Number(el.dataset.step)===obStep)?'block':'none';
  });
  const bar=document.getElementById('ob-progress-bar');
  if(bar)bar.style.transform='scaleX('+(obProgressPct(obStep)/100)+')';
  const back=document.getElementById('ob-back');
  if(back)back.style.visibility=obStep>1?'visible':'hidden';
  const next=document.getElementById('ob-next');
  if(next){
    next.textContent=obStep===OB_TOTAL?(obRamos.length?`Continuar con ${obRamos.length} ramo${obRamos.length!==1?'s':''}`:'Continuar sin ramos'):'Continuar';
    next.disabled=!obStepValid(obStep);
  }
  // Foco automático en el input del paso 1
  if(obStep===1){setTimeout(()=>{const i=document.getElementById('ob-name');if(i)i.focus();},80);}
}

function obNext(){
  if(!obStepValid(obStep))return;
  if(obStep<OB_TOTAL){obStep++;obRender();}
  else completeOnboarding();
}
function obBack(){if(obStep>1){obStep--;obRender();}}

// checkOb se llama desde los grids y el input: solo refresca el estado del botón
function checkOb(){
  const next=document.getElementById('ob-next');
  if(next)next.disabled=!obStepValid(obStep);
}

// Devuelve el PRIMER paso obligatorio que quedó sin responder, o 0 si están
// todos. Es `obStepValid` recorrido entero: lo que habilita cada botón es lo
// mismo que exige el final, por construcción y no por acuerdo.
function obPasoIncompleto(){
  for(let paso=1;paso<=OB_TOTAL;paso++)if(!obStepValid(paso))return paso;
  return 0;
}

function completeOnboarding(){
  const name=document.getElementById('ob-name').value.trim();
  // UNA sola fuente de verdad para "¿se puede seguir?": la misma función que
  // decide si el botón va habilitado. Antes esta guarda derivaba su propia
  // condición y exigía `selectedCarrera` —el código de la malla— mientras el
  // paso 3 se conformaba con la carrera declarada por nombre. Las dos se
  // desincronizaron y dejaron encerradas a 69 de las 71 carreras de la UC: el
  // botón decía "Continuar con N ramos", se apretaba y no pasaba nada.
  //
  // Mientras se pregunte acá lo mismo que se preguntó para habilitar el botón,
  // ese desacuerdo no puede volver a existir. Y si algún día pasa igual, se
  // dice: un paso obligatorio sin responder devuelve a su pantalla en vez de
  // dejar al estudiante apretando un botón muerto.
  const pasoIncompleto=obPasoIncompleto();
  if(pasoIncompleto){
    obStep=pasoIncompleto;obRender();
    showToast('Falta un dato para crear tu cuenta',true);
    return;
  }
  S.userName=name;S.careerSemestre=selectedSem;S.carrera=selectedCarrera;S.carreraNombre=selectedCarreraNombre;S.tenant=selectedTenant;
  obRamos.forEach(item=>{
    if(S.ramos.some(r=>normName(r.nombre)===normName(item.nombre)))return;
    const preset=!item.manual?presetRamo(item.nombre,selectedTenant,selectedCarrera):null;
    S.ramos.push({id:uid(),nombre:item.nombre,color:nextRamoColor(item.nombre),origen:item.manual?null:origenActual(item.nombre),creditos:creditosDe(item.nombre,selectedTenant,preset),categorias:preset?preset.categorias:[],gates:preset?preset.gates:[],aporta:preset?preset.aporta:null,recuperativo:preset?preset.recuperativo:null,pautaHuella:preset?huellaPauta(preset.categorias):null});
  });
  S.onboardingDone=true;save();
  syncProfile();
  // `carrera` es un código de una lista cerrada y puede viajar. El nombre
  // declarado NO: es texto escrito por el estudiante y la analítica no recibe
  // texto suyo — lo prohíbe tests/analitica.test.js y lo promete la política.
  // La bandera dice lo único que la analítica necesita: si le pudimos cargar la
  // malla o no. Quién estudia qué se cuenta en la base, no acá.
  track('onboarding_complete',{semestre:selectedSem,carrera:selectedCarrera,con_malla:!!selectedCarrera,ramos:obRamos.length});
  enterApp();
  const oficiales=obRamos.filter(item=>!item.manual&&!!presetRamo(item.nombre,selectedTenant,selectedCarrera)).length;
  mostrarRamosCargados(obRamos.length,oficiales);
}
function mostrarRamosCargados(cantidad,oficiales){
  const modal=document.getElementById('modal-content');
  if(!cantidad){
    modal.innerHTML=`
      <div class="modal-title">Sin ramos por ahora</div>
      <div class="courses-loaded">
        <p style="font-size:0.8125rem;color:var(--fg2);line-height:1.5;margin:0;">Cuando tengas tu carga, agrégala desde la malla o busca cada ramo.</p>
      </div>
      <div class="modal-btns"><button class="btn-confirm" onclick="closeModal();openAddRamoModal()">Agregar ramo</button></div>`;
    openModal();return;
  }

  const ramosTxt=`${cantidad} ramo${cantidad!==1?'s':''} agregado${cantidad!==1?'s':''}`;
  const oficialesTxt=`${oficiales} ramo${oficiales!==1?'s':''} con pauta oficial`;
  const pendientes=cantidad-oficiales;
  let titulo,principal,detalle;
  if(oficiales===cantidad){
    titulo='Pautas oficiales listas';
    principal=oficialesTxt;
    detalle='Los porcentajes ya están configurados. Cuando tengas una nota, ingrésala en el ramo.';
  }else if(oficiales>0){
    titulo='Pautas oficiales listas';
    principal=oficialesTxt;
    detalle=`En esos ramos, los porcentajes ya están configurados. En los otros ${pendientes}, agrega evaluaciones y sus porcentajes antes de ingresar notas.`;
  }else{
    titulo='Tus ramos están agregados';
    principal=ramosTxt;
    detalle='Antes de ingresar una nota, agrega las evaluaciones y sus porcentajes en cada ramo.';
  }
  modal.innerHTML=`
    <div class="modal-title">${titulo}</div>
    <div class="courses-loaded">
      <div class="courses-loaded-count">${principal}</div>
      <p style="font-size:0.8125rem;color:var(--fg2);line-height:1.5;margin:0;">${detalle}</p>
      ${oficiales?`<p style="font-size:0.75rem;color:var(--fg3);margin:2px 0 0;">${ramosTxt}</p>`:''}
    </div>
    <div class="modal-btns"><button class="btn-confirm" onclick="closeModal()">Ver mis ramos</button></div>`;
  openModal();
}
function showMainApp(){
  applyTheme();
  document.getElementById('screen-onboard').classList.remove('active');
  document.getElementById('bottom-nav').style.display='flex';
  document.querySelector('.app').classList.add('tab-mode');
  renderHome();renderStats();renderAgenda(); // los 3 siempre montados
  showTab('home');
}
const NAV_TABS=['stats','home','agenda']; // orden izq→der para swipe
let currentTab='home';
let currentTabIdx=1;

function setTabTransforms(idx, dragPx){
  const drag=dragPx||0;
  NAV_TABS.forEach((tab,i)=>{
    const el=document.getElementById('screen-'+tab);
    if(!el)return;
    el.style.transform=`translate3d(calc(${(i-idx)*100}% + ${drag}px), 0, 0)`;
  });
}

function showTab(tab,skipAnim){
  if(NAV_TABS.includes(tab)){
    // Modo tab: snap del carrusel
    ['ramo','auth','onboard','reset'].forEach(s=>{const el=document.getElementById('screen-'+s);if(el)el.classList.remove('active');});
    ['nav-home','nav-stats','nav-agenda'].forEach(n=>{const el=document.getElementById(n);if(el){el.classList.remove('active');el.removeAttribute('aria-current');}});
    currentTab=tab;currentTabIdx=NAV_TABS.indexOf(tab);
    setTabTransforms(currentTabIdx,0);
    const nb=document.getElementById('nav-'+tab);if(nb){nb.classList.add('active');nb.setAttribute('aria-current','page');}
    // Refresca la tab visible (por si cambiaron datos)
    if(tab==='home')renderHome();
    else if(tab==='stats')renderStats();
    else if(tab==='agenda')renderAgenda();
    track('screen_view',{screen_name:tab});
  } else {
    // Modo overlay (ramo, auth, etc.)
    ['ramo','auth','onboard','reset'].forEach(s=>{const el=document.getElementById('screen-'+s);if(el)el.classList.remove('active');});
    const el=document.getElementById('screen-'+tab);
    if(el)el.classList.add('active');
  }
}
function goHome(){showTab('home');}

// Drag continuo entre tabs — tipo historia de Instagram.
// El track sigue el dedo durante touchmove, snappea a next/prev/actual en touchend.
(function initSwipeNav(){
  let sx=0,sy=0,st=0,tracking=false,decided=false,horizontal=false,dragging=false;
  const HORIZ_LOCK=8;      // px para decidir dirección
  const SNAP_RATIO=0.22;   // 22% del viewport para snap a next/prev
  const SNAP_VELOCITY=0.5; // px/ms → velocity flick para snap con menos distancia
  function viewportW(){return document.querySelector('.app').clientWidth||window.innerWidth;}
  function onStart(e){
    if(!NAV_TABS.includes(currentTab))return;
    // Ignorar en overlays activos
    const overlays=['screen-ramo','screen-auth','screen-onboard','screen-reset'];
    for(const id of overlays){const o=document.getElementById(id);if(o&&o.classList.contains('active'))return;}
    const t=(e.touches&&e.touches[0])||e;
    const el=e.target;
    if(el.closest && el.closest('input,textarea,button,select,.modal-sheet,[role="slider"],input[type=range],.sim-cats,.hist-body'))return;
    sx=t.clientX;sy=t.clientY;st=Date.now();
    tracking=true;decided=false;horizontal=false;dragging=false;
  }
  function onMove(e){
    if(!tracking)return;
    const t=(e.touches&&e.touches[0])||e;
    const dx=t.clientX-sx,dy=t.clientY-sy;
    if(!decided){
      if(Math.abs(dx)<HORIZ_LOCK && Math.abs(dy)<HORIZ_LOCK)return;
      decided=true;
      horizontal=Math.abs(dx)>Math.abs(dy);
      if(horizontal){
        dragging=true;
        document.querySelector('.app').classList.add('dragging');
      } else {
        tracking=false;
        return;
      }
    }
    if(!dragging)return;
    // Prevenir scroll vertical mientras arrastramos horizontal
    if(e.cancelable)e.preventDefault();
    // Aplicar drag con resistencia en los bordes
    let effective=dx;
    if((currentTabIdx===0 && dx>0) || (currentTabIdx===NAV_TABS.length-1 && dx<0)){
      effective=dx*0.35; // rubber-band
    }
    setTabTransforms(currentTabIdx,effective);
  }
  function onEnd(e){
    if(!tracking){document.querySelector('.app').classList.remove('dragging');return;}
    tracking=false;
    if(!dragging){document.querySelector('.app').classList.remove('dragging');return;}
    dragging=false;
    document.querySelector('.app').classList.remove('dragging');
    const t=(e.changedTouches&&e.changedTouches[0])||e;
    const dx=t.clientX-sx,dt=Date.now()-st;
    const vw=viewportW(),velocity=Math.abs(dx)/Math.max(dt,1);
    const shouldSnap=Math.abs(dx)>vw*SNAP_RATIO || velocity>SNAP_VELOCITY;
    let next=currentTabIdx;
    if(shouldSnap){
      if(dx<0 && currentTabIdx<NAV_TABS.length-1)next=currentTabIdx+1;
      else if(dx>0 && currentTabIdx>0)next=currentTabIdx-1;
    }
    showTab(NAV_TABS[next]);
  }
  document.addEventListener('touchstart',onStart,{passive:true});
  document.addEventListener('touchmove',onMove,{passive:false});
  document.addEventListener('touchend',onEnd,{passive:true});
  document.addEventListener('touchcancel',onEnd,{passive:true});
})();

// ─── ORDEN MANUAL DE RAMOS ─────────────────────────────────────────────────
// En touch, mover al primer contacto vuelve imposible hacer scroll desde una
// tarjeta. La espera separa las dos intenciones: deslizar antes de 420 ms sigue
// siendo scroll; sostener activa el arrastre. Mouse no necesita esa defensa.
const RAMO_LONG_PRESS_MS=420;
const RAMO_MOVE_TOLERANCE=8;
function esperaReordenRamo(pointerType){return pointerType==='touch'?RAMO_LONG_PRESS_MS:0;}
function movimientoCancelaReorden(dx,dy){return Math.hypot(dx,dy)>RAMO_MOVE_TOLERANCE;}

function guardarOrdenRamos(ids){
  if(!Array.isArray(ids)||ids.length!==S.ramos.length||new Set(ids).size!==ids.length)return false;
  const porId=new Map(S.ramos.map(r=>[r.id,r]));
  if(ids.some(id=>!porId.has(id)))return false;
  if(ids.every((id,i)=>S.ramos[i].id===id))return false;
  S.ramos=ids.map(id=>porId.get(id));
  save();
  track('reorder_ramos',{count:S.ramos.length});
  return true;
}

function anunciar(texto){
  let el=document.getElementById('anuncio-a11y');
  if(!el){
    el=document.createElement('div');
    el.id='anuncio-a11y';
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    el.style.cssText='position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
    document.body.appendChild(el);
  }
  // Vaciar primero: repetir el mismo texto no dispara el anuncio de nuevo.
  el.textContent='';
  setTimeout(()=>{el.textContent=texto;},30);
}

// Mueve el NODO en vez de volver a dibujar la lista, igual que hace el arrastre
// al soltar. Antes se llamaba a renderHome() y se intentaba devolver el foco al
// asa en el fotograma siguiente, pero el asa ya no era la misma —el render la
// había reemplazado— y el foco terminaba en el body. Quien mueve con teclado
// tenía que volver a tabular hasta el ramo para dar el segundo paso, o sea
// reordenar tres ramos costaba tres recorridos completos.
function moverRamoConTeclado(id,delta){
  if(S.sortMode!=='manual')return;
  const cont=document.getElementById('home-ramos');
  if(!cont)return;
  const filas=[...cont.querySelectorAll('.ramo-row')];
  const desde=filas.findIndex(el=>el.dataset.ramoId===id),hasta=desde+delta;
  if(desde<0||hasta<0||hasta>=filas.length)return;
  if(delta>0)cont.insertBefore(filas[hasta],filas[desde]);
  else cont.insertBefore(filas[desde],filas[hasta]);
  if(!guardarOrdenRamos([...cont.querySelectorAll('.ramo-row')].map(el=>el.dataset.ramoId))){
    renderHome();return;
  }
  // Mover algo con el teclado no se ve: sin esto, quien usa lector de pantalla
  // oye el nombre del ramo pero nunca dónde quedó.
  const fila=filas[desde];
  const nombre=(fila.querySelector('.ramo-name')||{}).textContent||'El ramo';
  anunciar(`${nombre}, posición ${hasta+1} de ${filas.length}`);
}

function activarReordenRamos(container){
  const scroll=container.closest('.scroll');
  [...container.querySelectorAll('.ramo-drag-handle')].forEach(handle=>{
    const row=handle.closest('.ramo-row');
    let timer=null,drag=null,startX=0,startY=0;

    function moverGhost(x,y){
      if(!drag)return;
      drag.x=x;drag.y=y;
      drag.ghost.style.left=(x-drag.offsetX)+'px';
      drag.ghost.style.top=(y-drag.offsetY)+'px';
    }

    function reubicar(x,y){
      if(!drag)return;
      moverGhost(x,y);
      if(scroll){
        const sr=scroll.getBoundingClientRect();
        if(y<sr.top+64)scroll.scrollTop-=12;
        else if(y>sr.bottom-64)scroll.scrollTop+=12;
      }
      const hit=document.elementFromPoint(x,y);
      const target=hit&&hit.closest&&hit.closest('#home-ramos .ramo-row');
      if(!target||target===row||target.parentElement!==container)return;
      const filas=[...container.querySelectorAll('.ramo-row')];
      const desde=filas.indexOf(row),hasta=filas.indexOf(target);
      if(desde<hasta)container.insertBefore(row,target.nextSibling);
      else container.insertBefore(row,target);
    }

    function iniciar(x,y){
      if(drag||S.sortMode!=='manual')return;
      const rect=row.getBoundingClientRect();
      const ghost=row.cloneNode(true);
      ghost.classList.add('ramo-drag-ghost');
      ghost.setAttribute('aria-hidden','true');
      ghost.style.width=rect.width+'px';
      document.body.appendChild(ghost);
      drag={ghost,offsetX:x-rect.left,offsetY:y-rect.top,x,y};
      row.classList.add('ramo-drag-source');
      container.classList.add('ramo-reordering');
      document.body.classList.add('ramo-drag-active');
      moverGhost(x,y);
    }

    function terminar(){
      clearTimeout(timer);timer=null;
      if(!drag)return;
      drag.ghost.remove();drag=null;
      row.classList.remove('ramo-drag-source');
      container.classList.remove('ramo-reordering');
      document.body.classList.remove('ramo-drag-active');
      guardarOrdenRamos([...container.querySelectorAll('.ramo-row')].map(el=>el.dataset.ramoId));
    }

    handle.addEventListener('touchstart',e=>{
      if(e.touches.length!==1)return;
      e.stopPropagation();
      const t=e.touches[0];startX=t.clientX;startY=t.clientY;
      clearTimeout(timer);
      timer=setTimeout(()=>iniciar(startX,startY),esperaReordenRamo('touch'));
    },{passive:true});
    handle.addEventListener('touchmove',e=>{
      if(e.touches.length!==1)return;
      const t=e.touches[0];
      if(!drag&&movimientoCancelaReorden(t.clientX-startX,t.clientY-startY)){
        clearTimeout(timer);timer=null;
        return; // no preventDefault: este gesto sigue siendo scroll
      }
      if(!drag)return;
      e.preventDefault();e.stopPropagation();
      reubicar(t.clientX,t.clientY);
    },{passive:false});
    handle.addEventListener('touchend',e=>{e.stopPropagation();terminar();},{passive:true});
    handle.addEventListener('touchcancel',terminar,{passive:true});

    handle.addEventListener('mousedown',e=>{
      if(e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      iniciar(e.clientX,e.clientY);
      const move=ev=>{ev.preventDefault();reubicar(ev.clientX,ev.clientY);};
      const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);terminar();};
      document.addEventListener('mousemove',move);
      document.addEventListener('mouseup',up);
    });
    handle.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();});
    handle.addEventListener('contextmenu',e=>e.preventDefault());
    handle.addEventListener('keydown',e=>{
      const delta=(e.key==='ArrowUp'||e.key==='ArrowLeft')?-1:(e.key==='ArrowDown'||e.key==='ArrowRight')?1:0;
      if(!delta)return;
      e.preventDefault();e.stopPropagation();moverRamoConTeclado(row.dataset.ramoId,delta);
    });
  });
}

function cycleSortMode(){
  S.sortMode=S.sortMode==='manual'?'avg':S.sortMode==='avg'?'name':'manual';
  save();renderHome();
}

function openRamo(id){
  currentRamoId=id;
  ['home','stats','agenda'].forEach(s=>document.getElementById('screen-'+s).classList.remove('active'));
  ['nav-home','nav-stats','nav-agenda'].forEach(n=>document.getElementById(n).classList.remove('active'));
  document.getElementById('screen-ramo').classList.add('active');
  const r=S.ramos.find(x=>x.id===id);
  track('view_ramo',{del_catalogo:!!(r&&r.origen)});
  renderRamo();
}
function horaCorta(hora){return HORA_RE.test(hora||'')?hora:'';}
function fechaHoraCorta(iso,hora){
  const h=horaCorta(hora);
  return fechaCorta(iso)+(h?' · '+h:'');
}
function fechaCorta(iso){
  const meses=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const d=new Date(iso+'T00:00:00');
  return `${d.getDate()} ${meses[d.getMonth()]}`;
}
function declararRecuperativo(resultado){
  if(!['aprobado','reprobado'].includes(resultado))return;
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  const estado=estadoRecuperativo(r);
  if(!estado||!estado.puedeDeclarar){showToast('El recuperativo ya no aplica a esta nota',true);return;}
  r.recuperativoRendido=resultado;save();renderRamo();
}
function corregirRecuperativo(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r||!r.recuperativoRendido)return;
  r.recuperativoRendido=null;save();renderRamo();
}
function declararAusenciaJustificada(catId){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  const regla=r.reglasAusenciaJustificada;
  const declarable=[...(regla&&regla.reemplazos||[]),...(regla&&regla.traspasos||[])].some(x=>x.desdeId===catId);
  const cat=(r.categorias||[]).find(c=>c.id===catId);
  if(!declarable||!cat||avgPond(cat.notas)!==null){showToast('Esa ausencia ya no se puede aplicar a tu pauta',true);return;}
  if(!Array.isArray(r.ausenciasJustificadas))r.ausenciasJustificadas=[];
  if(!r.ausenciasJustificadas.includes(catId))r.ausenciasJustificadas.push(catId);
  save();track('declarar_ausencia_justificada');renderRamo();
}
function corregirAusenciaJustificada(catId){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  r.ausenciasJustificadas=(r.ausenciasJustificadas||[]).filter(id=>id!==catId);
  save();renderRamo();
}
function toggleCat(id){openCats[id]=!openCats[id];renderRamo();}
// Nota por espacio en secciones multi-nota (ej: Laboratorio 1/2/3).
// ─── EL TECLADO NO PUEDE TAPAR LO QUE ESTÁS ESCRIBIENDO ──────────────────────
// En el teléfono, el teclado se come la mitad de abajo de la pantalla. Al tocar
// una casilla que está en esa mitad, quedaba escondida detrás: se escribía a
// ciegas, sin ver la nota ni el nombre de la evaluación. Pasa sobre todo en las
// evaluaciones desplegables largas —Participación de Programación abre diez
// casillas, 618px de alto— donde casi cualquiera cae abajo.
//
// El navegador a veces la sube solo, pero dentro de un contenedor con scroll
// propio (`.scroll`) suele dejarla justo bajo el borde del teclado, que se ve
// igual que no hacer nada.
//
// `visualViewport` es lo único que sabe el alto REAL con el teclado abierto:
// window.innerHeight no cambia cuando el teclado aparece.
// El scroll no puede subir un campo que ya está al final del contenido: no hay
// nada abajo contra lo que empujar. La última casilla de una evaluación es
// justo ese caso, y es la que más se toca al ponerse al día. Por eso primero se
// le presta al contenedor el alto que el teclado tapó, y recién después se
// sube el campo.
function espacioTeclado(){
  const vp=window.visualViewport;
  return vp?Math.max(0,Math.round(window.innerHeight-vp.height-(vp.offsetTop||0))):0;
}
function contenedorDesplazable(el){
  return (el.closest&&(el.closest('.modal-sheet')||el.closest('.scroll')))||null;
}
function asegurarVisibleSobreTeclado(el){
  if(!el||!el.getBoundingClientRect)return;
  const cont=contenedorDesplazable(el);
  const oculto=espacioTeclado();
  if(cont&&oculto>0)cont.style.paddingBottom=oculto+'px';
  const alto=window.innerHeight-oculto;
  const r=el.getBoundingClientRect();
  // Margen para que no quede pegada al borde del teclado, sino con aire.
  // Sin `behavior:'smooth'`: la animación no llegaba a correr antes de que el
  // teclado terminara de subir, así que el campo se quedaba tapado igual. Y de
  // paso respeta a quien pidió menos movimiento.
  if(r.bottom>alto-16||r.top<8){
    try{el.scrollIntoView({block:'center'});}
    catch(e){el.scrollIntoView(false);}
  }
}
function soltarEspacioTeclado(){
  document.querySelectorAll('.scroll,.modal-sheet').forEach(c=>{c.style.paddingBottom='';});
}

// Delegado: se engancha una vez y cubre todo lo que se dibuje después, sin que
// cada render tenga que acordarse.
document.addEventListener('focusin',e=>{
  const el=e.target;
  if(!el||!el.matches||!el.matches('input,textarea,select'))return;
  // El teclado tarda en aparecer, y antes de que aparezca la cuenta da bien y
  // no se hace nada. Se mide después.
  setTimeout(()=>{
    // Si ya se fue a otro campo, que ese otro se encargue: mover la pantalla por
    // uno que quedó atrás es peor que no hacer nada.
    if(el.isConnected&&(document.activeElement===el||document.activeElement===document.body))asegurarVisibleSobreTeclado(el);
  },320);
});
// Al cerrarse el teclado el préstamo se devuelve, o queda un hueco en blanco al
// final de la pantalla que nadie explica.
document.addEventListener('focusout',()=>{
  setTimeout(()=>{
    const a=document.activeElement;
    if(!a||!a.matches||!a.matches('input,textarea,select'))soltarEspacioTeclado();
  },120);
});
window.visualViewport&&window.visualViewport.addEventListener('resize',()=>{
  if(espacioTeclado()===0)soltarEspacioTeclado();
});

function setSlotNota(catId,slot,raw){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  const cat=r.categorias.find(c=>c.id===catId);if(!cat)return;
  const promedioAntes=ramoAvg(r);const gpaAntes=gpa(S.ramos);
  const txt=String(raw||'').trim();
  cat.notas=cat.notas.filter(n=>n.slot!==slot);
  if(txt!==''){
    const val=parseNota(txt);
    if(!isNaN(val))cat.notas.push({id:uid(),nombre:etiquetaCasilla(r,cat,slot),valor:val,peso:1,slot});
  }
  save();track('set_nota_slot');renderRamo();
  const notaValida=txt!==''&&!isNaN(parseNota(txt));
  if(notaValida){
    const promedioDespues=ramoAvg(r);const gpaDespues=gpa(S.ramos);
    animarPromedio(document.getElementById('ramo-hero-avg'),promedioAntes,promedioDespues,'ramo');
    if(cambioDePromedio(gpaAntes,gpaDespues)){
      pendingGpaFeedback={antes:gpaAntes,despues:gpaDespues};
      mostrarEcoGpa(gpaAntes,gpaDespues);
    }
    showToast(lecturaDespuesDeNota(r));
  }
}
// Nota directa para secciones de preset: crea/actualiza/borra la única nota.
function setDirectNota(catId,raw){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  const cat=r.categorias.find(c=>c.id===catId);if(!cat)return;
  const promedioAntes=ramoAvg(r);const gpaAntes=gpa(S.ramos);
  const txt=String(raw||'').trim();
  if(txt===''){cat.notas=[];}
  else{
    const val=parseNota(txt);
    if(!isNaN(val))cat.notas=[{id:(cat.notas[0]&&cat.notas[0].id)||uid(),nombre:cat.nombre,valor:val,peso:1}];
  }
  save();track('set_nota_directa');renderRamo();
  const notaValida=txt!==''&&!isNaN(parseNota(txt));
  if(notaValida){
    const promedioDespues=ramoAvg(r);const gpaDespues=gpa(S.ramos);
    animarPromedio(document.getElementById('ramo-hero-avg'),promedioAntes,promedioDespues,'ramo');
    if(cambioDePromedio(gpaAntes,gpaDespues)){
      pendingGpaFeedback={antes:gpaAntes,despues:gpaDespues};
      mostrarEcoGpa(gpaAntes,gpaDespues);
    }
    showToast(lecturaDespuesDeNota(r));
  }
}
function confirmDeleteRamo(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  showConfirm(`Eliminar "${r.nombre}"`,`Se eliminarán todas las secciones y notas. Esta acción no se puede deshacer.`,()=>{
    track('delete_ramo');S.ramos=S.ramos.filter(x=>x.id!==currentRamoId);save();goHome();
  });
}
function confirmDeleteCat(catId){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  const cat=r.categorias.find(c=>c.id===catId);if(!cat)return;
  showConfirm(`Eliminar "${cat.nombre}"`,`Se eliminarán todas las notas de esta evaluación.`,()=>{
    r.categorias=r.categorias.filter(c=>c.id!==catId);save();renderRamo();
  });
}
function deleteNota(catId,notaId){
  const r=S.ramos.find(x=>x.id===currentRamoId);const cat=r.categorias.find(c=>c.id===catId);
  cat.notas=cat.notas.filter(n=>n.id!==notaId);save();renderRamo();
}

// ─── RAMOS DE LA MALLA ───────────────────────────────────────────────────────
function mallaFaltantes(){
  if(!S.carrera) return [];
  const ramos=(mallaFor(S.tenant)[S.carrera]||{})[S.careerSemestre]||[];
  return ramos.filter(n=>!S.ramos.some(r=>r.nombre.toLowerCase()===n.toLowerCase()));
}
function maybeOfferMalla(){
  if(mallaFaltantes().length) openMallaModal();
}
let _mallaSel={}, _mallaList=[];
function openMallaModal(){
  if(!S.carrera){showToast('Primero elige tu carrera en Configuración');return;}
  _mallaList=mallaFaltantes();
  if(!_mallaList.length){
    const hayMalla=Object.keys((mallaFor(S.tenant)[S.carrera]||{})).length>0;
    showToast(hayMalla?'Ya tienes los ramos obligatorios de tu semestre':'Aún no tenemos la malla de tu carrera — agrega tus ramos con el botón +');
    return;
  }
  _mallaSel={};_mallaList.forEach(n=>_mallaSel[n]=true);
  const rows=_mallaList.map((n,i)=>`
    <label style="display:flex;align-items:center;gap:11px;padding:10px 2px;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" checked onchange="toggleMalla(${i},this.checked)" style="width:18px;height:18px;flex-shrink:0;accent-color:var(--primary);"/>
      <span style="font-size:0.875rem;color:var(--fg);">${esc(n)}${findPresetName(n,S.tenant,S.carrera)?' <svg class=\"ic\" style=\"color:var(--yellow);width:12px;height:12px;vertical-align:-1px;\" viewBox=\"0 0 24 24\" aria-label=\"Ponderaciones oficiales precargadas\"><path d=\"M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z\" fill=\"currentColor\" stroke=\"none\"/></svg>':''}</span>
    </label>`).join('');
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17A2.5 2.5 0 0 1 6.5 2z"/></svg> Ramos de tu ${S.careerSemestre}° semestre</div>
    <p style="font-size:0.8125rem;color:var(--fg2);margin-bottom:4px;">${esc(carrerasFor(S.tenant)[S.carrera]||'')}</p>
    <p style="font-size:0.75rem;color:var(--fg3);margin-bottom:10px;">Desmarca los que no estés tomando. Los electivos los agregas aparte.</p>
    <div style="max-height:42vh;overflow-y:auto;margin-bottom:12px;">${rows}</div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Ahora no</button>
      <button class="btn-confirm" id="malla-btn" onclick="confirmAddMalla()">Agregar</button>
    </div>`;
  openModal();updateMallaBtn();
}
function toggleMalla(i,checked){const n=_mallaList[i];if(n!==undefined)_mallaSel[n]=checked;updateMallaBtn();}
function updateMallaBtn(){
  const btn=document.getElementById('malla-btn');if(!btn)return;
  const c=_mallaList.filter(n=>_mallaSel[n]).length;
  btn.disabled=c===0;btn.textContent=c?`Agregar ${c} ramo${c!==1?'s':''}`:'Agregar';
}

// Devuelve {categorias, gates} para un ramo del catálogo, o null.
// Las ponderaciones salen de PRESETS_FEN / PRESETS_UC (data.js): acá solo se
// traducen a categorías y compuertas con ids frescos.
// La pauta que a este ramo le corresponde y todavía no tiene. Devuelve null
// salvo que NO haya nada que perder: solo se rellena un ramo del catálogo que
// está completamente vacío. Si el estudiante ya escribió aunque sea una
// evaluación propia, no se toca — su pauta a mano manda sobre la nuestra.
// ─── CUANDO LA PAUTA OFICIAL CAMBIA ─────────────────────────────────────────
// Un preset se copia al ramo cuando se crea y después queda congelado. Si más
// tarde corregimos el programa —un examen que pasa de 20% a 30%— el estudiante
// se queda con los pesos viejos para siempre y su promedio deja de ser el real.
// No falla nada: el número simplemente empieza a estar equivocado.
//
// La huella es la FORMA de la pauta: nombre y peso de cada evaluación, en
// orden. No incluye ids (son aleatorios) ni notas (son del estudiante). Sirve
// para responder la única pregunta que importa antes de tocar nada: ¿esta
// pauta sigue siendo la que le dimos, o el estudiante la editó?
function huellaPauta(cats){
  return (cats||[]).map(c=>`${c.nombre}:${r2(Number(c.peso)||0)}`).join('|');
}

// Una evaluación que la pauta oficial dejó de tener, pero que el estudiante
// alcanzó a llenar, se queda guardada con sus notas en 0%. Sigue siendo suya y
// se ve en la ficha, pero NO es parte de la pauta: no entra en la huella ni en
// lo que se le reporta al catálogo. Sin esta distinción, la pauta se vería
// eternamente distinta de la oficial y la app ofrecería el mismo cambio para
// siempre.
function catsDePauta(cats){return (cats||[]).filter(c=>!c.fueraDePauta);}

// ¿El estudiante corrigió la pauta que le dimos?
//
// cambioDePauta() ya calcula esto para callarse —cuando la editó, su versión
// manda y no se le ofrece nada—. Pero esa persona es justo la que tiene el dato
// que al catálogo le falta: agarró nuestra pauta oficial y la arregló. Hasta
// acá la app se daba cuenta y no le decía nada.
function pautaEditada(r){
  if(!r||!r.pautaHuella)return false;
  const cats=catsDePauta(r.categorias);
  return cats.length>0&&huellaPauta(cats)!==r.pautaHuella;
}

// Devuelve el cambio pendiente, o null. Null significa las tres cosas buenas:
// no hay pauta oficial, ya está al día, o el estudiante la editó a mano —y en
// ese caso su versión manda sobre la nuestra, sin preguntar ni avisar.
function cambioDePauta(r){
  if(!r||!r.origen||!r.origen.tenant||!r.pautaHuella)return null;
  const nombre=findPresetName(r.nombre,r.origen.tenant,r.origen.carrera);
  if(!nombre)return null;
  const p=presetRamo(nombre,r.origen.tenant,r.origen.carrera);
  if(!p)return null;
  const actual=huellaPauta(catsDePauta(r.categorias));
  if(actual!==r.pautaHuella)return null;      // la editó: no se opina
  const oficial=huellaPauta(p.categorias);
  if(oficial===actual)return null;            // al día
  // Qué cambia exactamente, para poder mostrárselo antes de que decida.
  const antes=new Map(catsDePauta(r.categorias).map(c=>[c.nombre,Number(c.peso)||0]));
  const despues=new Map((p.categorias||[]).map(c=>[c.nombre,Number(c.peso)||0]));
  const cambios=[];
  antes.forEach((peso,nom)=>{
    if(!despues.has(nom))cambios.push({tipo:'se-va',nombre:nom,antes:peso});
    else if(r2(despues.get(nom))!==r2(peso))cambios.push({tipo:'peso',nombre:nom,antes:peso,despues:despues.get(nom)});
  });
  despues.forEach((peso,nom)=>{ if(!antes.has(nom))cambios.push({tipo:'llega',nombre:nom,despues:peso}); });
  // Una evaluación que desaparece se llevaba las notas que el estudiante había
  // escrito ahí. Ya no: se conservan aparte. Igual hay que decírselo, porque su
  // ficha va a quedar con una evaluación en 0% que la pauta oficial no tiene.
  const notasFueraDePauta=cambios.filter(c=>c.tipo==='se-va')
    .some(c=>((r.categorias.find(x=>x.nombre===c.nombre)||{}).notas||[])
      .some(n=>typeof n.valor==='number'));
  return {preset:p,cambios,notasFueraDePauta};
}

// Le muestra el cambio antes de decidir. Sin esto, "Actualizar" sería pedirle
// que confíe a ciegas en que le movamos el promedio.
function verCambioDePauta(ramoId){
  const r=(S.ramos||[]).find(x=>x.id===ramoId);if(!r)return;
  const cambio=cambioDePauta(r);if(!cambio)return;
  const fila=c=>{
    if(c.tipo==='peso')return `<li><b>${esc(c.nombre)}</b>: ${r2(c.antes)}% → <b>${r2(c.despues)}%</b></li>`;
    if(c.tipo==='llega')return `<li><b>${esc(c.nombre)}</b>: nueva, ${r2(c.despues)}%</li>`;
    return `<li><b>${esc(c.nombre)}</b>: ya no está en la pauta oficial</li>`;
  };
  const aviso=cambio.notasFueraDePauta
    ? `<p class="modal-desc" style="margin-top:10px;">Alguna de las evaluaciones que desaparecen tiene notas tuyas. <b>No se borran</b>: quedan en tu ficha con sus notas y en 0%, así no mueven tu promedio.</p>`
    : `<p class="modal-desc" style="margin-top:10px;">Tus notas se conservan: se reconocen por el nombre de la evaluación.</p>`;
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">La pauta oficial cambió</div>
    <p class="modal-desc">Esto es lo que cambia respecto de lo que tienes hoy en <b>${esc(r.nombre)}</b>.</p>
    <ul style="margin:10px 0 0;padding-left:18px;font-size:0.875rem;color:var(--fg2);line-height:1.6;">${cambio.cambios.map(fila).join('')}</ul>
    ${aviso}
    <div class="modal-btns" style="margin-top:16px;">
      <button type="button" class="btn-cancel" onclick="closeModal()">Dejar como está</button>
      <button type="button" class="btn-confirm" onclick="aplicarPautaNueva('${esc(r.id)}')">Actualizar</button>
    </div>`;
  openModal();
}

// Aplica la pauta nueva conservando las notas por NOMBRE de evaluación: es lo
// único estable entre las dos versiones, porque los ids se generan de nuevo.
// El cambio de datos va aparte de la interfaz: así se puede probar sin montar
// medio navegador, que es lo que obliga a hacer una función que cierra modales.
function actualizarPauta(ramoId){
  const r=(S.ramos||[]).find(x=>x.id===ramoId);if(!r)return false;
  const cambio=cambioDePauta(r);if(!cambio)return false;
  // Por NOMBRE NORMALIZADO, no exacto: una pauta retranscrita cambia mayúsculas,
  // tildes o un espacio sin querer, y con igualdad estricta "Solemne 1" y
  // "solemne 1" eran evaluaciones distintas — la nota se iba por un acento.
  // Los ids no sirven: el preset los genera de nuevo cada vez.
  // Entran TAMBIÉN las huérfanas de una actualización anterior: si el programa
  // vuelve a incluir una evaluación que había sacado, sus notas vuelven con
  // ella en vez de quedar duplicadas —la vieja en 0% y la nueva vacía—. Las de
  // la pauta van después a propósito: si por lo que sea coinciden en nombre,
  // manda la que está viva.
  fusionarPauta(r,cambio.preset.categorias);
  r.gates=cambio.preset.gates;
  r.aporta=cambio.preset.aporta||null;
  r.recuperativo=cambio.preset.recuperativo||null;
  r.reglasAusenciaJustificada=cambio.preset.reglasAusenciaJustificada||null;
  r.pautaHuella=huellaPauta(catsDePauta(r.categorias));
  return true;
}

// Cambia las evaluaciones de un ramo CONSERVANDO lo que el estudiante escribió.
// Vive aparte porque el trato con sus notas es el mismo venga la pauta de donde
// venga: del programa oficial o de lo que reportaron sus compañeros. Una nota
// es suya y no se pierde porque nosotros cambiemos de fuente.
function fusionarPauta(r,nuevas){
  const nombresAusencia=new Map((r.categorias||[]).map(c=>[c.id,normName(c.nombre)]));
  const viejas=new Map([...(r.categorias||[]).filter(c=>c.fueraDePauta),...catsDePauta(r.categorias)]
    .map(c=>[normName(c.nombre),c]));
  r.categorias=nuevas.map(c=>{
    const k=normName(c.nombre),vieja=viejas.get(k);
    viejas.delete(k);
    return {...c,notas:(vieja&&vieja.notas)||[]};   // `c` no trae fueraDePauta: revivir la limpia
  });
  // Lo que la pauta nueva ya no tiene NO se borra. La pauta es nuestra; la nota
  // es del estudiante, y la escribió porque rindió esa evaluación. Se queda en
  // 0%, así no mueve el promedio, y sigue estando donde la dejó. Las que quedaron
  // vacías sí se van: no hay nada que conservar y ensucian la ficha.
  viejas.forEach(v=>{
    const conValor=(v.notas||[]).filter(n=>typeof n.valor==='number');
    if(conValor.length)r.categorias.push({...v,peso:0,notas:conValor,fueraDePauta:true});
  });
  // Un cambio de pauta genera ids nuevos. La declaración pertenece a
  // una evaluación por su nombre, no al id efímero; si esa evaluación ya no
  // existe la conservamos como inactiva, igual que una fecha quitada a mano.
  r.ausenciasJustificadas=(r.ausenciasJustificadas||[]).map(id=>{
    const nombre=nombresAusencia.get(id);
    const nueva=(r.categorias||[]).find(c=>normName(c.nombre)===nombre);
    return nueva?nueva.id:id;
  });
}
function aplicarPautaNueva(ramoId){
  if(!actualizarPauta(ramoId))return;
  save();track('pauta_actualizada');closeModal();renderRamo();
  showToast('Pauta actualizada — tus notas se conservaron');
}

function pautaPendiente(r){
  if(!r||!r.origen||!r.origen.tenant)return null;
  if((r.categorias||[]).length||(r.gates||[]).length)return null;
  const nombre=findPresetName(r.nombre,r.origen.tenant,r.origen.carrera);
  return nombre?presetRamo(nombre,r.origen.tenant,r.origen.carrera):null;
}
function presetRamo(nombre,tenant,carrera,ahora){
  const def=definicionPreset(nombre,tenant,carrera);if(!def)return null;
  const evals=Array.isArray(def)?def:(def.evals||[]);
  // Un programa puede traer reglas oficiales sin publicar ponderaciones. No se
  // inventa una pauta vacía: sus reglas se muestran por reglasDelPreset().
  if(!evals.length)return null;
  const periodo=periodoDePreset(def);
  const estadoPeriodo=estadoPeriodoPauta(periodo,ahora);
  const incluirFechas=estadoPeriodo==='vigente';
  const categorias=[],gates=[];
  const porNombre={};
  evals.forEach(([nom,peso,extra])=>{
    const id=uid();
    const cat={id,nombre:nom,peso,ponderaNotas:false,directNota:true,notas:[]};
    if(extra&&extra.slots)cat.slots=extra.slots;
    if(extra&&typeof extra.slotLabel==='string')cat.slotLabel=extra.slotLabel;
    if(extra&&Number.isInteger(extra.slotStart))cat.slotStart=extra.slotStart;
    if(extra&&extra.lista)cat.directNota=false;
    if(extra&&extra.dropLowest)cat.dropLowest=extra.dropLowest;
    // Una pauta de 2026-2 puede seguir siendo buena para sus porcentajes en
    // 2027-1, pero sus días de prueba no. Nunca se inventa una fecha nueva: si
    // el período venció o no se conoce, simplemente no se ofrece.
    if(extra&&extra.fecha&&incluirFechas){cat.fecha=extra.fecha;cat.fechaOrigen='catalogo';}
    categorias.push(cat);porNombre[nom]=id;
    if(extra&&extra.min)gates.push({type:'min_grade_required',catId:id,min:extra.min,cap:extra.cap,nombre:nom});
  });
  const aporta=(!Array.isArray(def)&&def.aporta)?{...def.aporta}:null;
  (!Array.isArray(def)&&def.grupos||[]).forEach(g=>{
    const ids=g.evals.map(n=>porNombre[n]).filter(Boolean);
    if(ids.length)gates.push({type:'group_min',catIds:ids,min:g.min,cap:g.cap,nombre:g.nombre});
  });
  const recuperativo=!Array.isArray(def)?copiarRecuperativo(def.recuperativo):null;
  const reglasAusenciaJustificada=resolverReglasAusencia(def,categorias);
  return {categorias,gates,aporta,recuperativo,reglasAusenciaJustificada,periodo,estadoPeriodo,
    creditos:(!Array.isArray(def)&&typeof def.creditos==='number')?def.creditos:null};
}

function confirmAddMalla(){
  const elegidos=_mallaList.filter(n=>_mallaSel[n]);
  if(!elegidos.length)return;
  elegidos.forEach(n=>{
    // Por findPresetName y no por el nombre crudo: la malla dice
    // "Filosofía: ¿Para Qué?" y el preset "Filosofía: ¿para qué?". Buscando
    // exacto no calzaban, así que el ramo se agregaba sin pauta — con la
    // estrella de "pauta oficial" al lado, porque el selector SÍ normaliza.
    const presetName=findPresetName(n,S.tenant,S.carrera);
    const preset=presetName?presetRamo(presetName,S.tenant,S.carrera):null;
    S.ramos.push({id:uid(),nombre:n,color:nextRamoColor(n),origen:origenActual(n),categorias:preset?preset.categorias:[],gates:preset?preset.gates:[],aporta:preset?preset.aporta:null,recuperativo:preset?preset.recuperativo:null,pautaHuella:preset?huellaPauta(preset.categorias):null});
  });
  save();track('add_malla_ramos',{count:elegidos.length,carrera:S.carrera,sem:S.careerSemestre});
  closeModal();
  if(document.getElementById('screen-home').classList.contains('active'))renderHome();
  showToast(`✓ ${elegidos.length} ramo${elegidos.length!==1?'s':''} agregado${elegidos.length!==1?'s':''}`);
}

// Un solo campo: lo que el estudiante escribe es a la vez la búsqueda en su
// malla y el nombre del ramo si no está ahí. Créditos y color se editan
// después en la ficha del ramo — pedirlos acá era pedir una decisión en el
// peor momento, cuando todavía no tiene el ramo.
function openAddRamoModal(){
  const hayCatalogo=catalogRamos(S.tenant,S.carrera).length>0;
  const uni=(TENANTS[S.tenant]&&TENANTS[S.tenant].short)||'';
  const buscaPorSigla=S.tenant==='uc';
  const etiquetaRamo=buscaPorSigla?'Nombre o sigla del ramo':'Nombre del ramo';
  const ejemploRamo=buscaPorSigla?'Ej.: IIC2333 o Cálculo II':'Ej.: Microeconomía I';
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Agregar ramo</div>
    <label class="modal-label">${etiquetaRamo}${hayCatalogo&&uni?` <span style="text-transform:none;font-weight:500;color:var(--fg3);letter-spacing:0;">· lo buscamos en la malla ${esc(uni)}</span>`:''}</label>
    <div class="modal-input"><input type="text" id="m-ramo-search" placeholder="${ejemploRamo}" maxlength="${NOMBRE_MAX}" autocomplete="off" autocapitalize="none" aria-describedby="m-ramo-error"/></div>
    <p id="m-ramo-error" role="alert" hidden style="margin:7px 0 0;font-size:0.75rem;line-height:1.4;color:var(--red);"></p>
    ${hayCatalogo?'<div id="m-ramo-results" class="cat-results"></div>':''}
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" id="m-add-ramo-btn" onclick="confirmAddRamo()">Agregar ramo</button>
    </div>`;
  openModal();

  const input=document.getElementById('m-ramo-search');
  setTimeout(()=>{input.focus();},100);
  const pintar=()=>{
    limpiarErrorCampo('m-ramo-search','m-ramo-error');
    if(hayCatalogo)renderCatalogResults(input.value);
  };
  input.addEventListener('input',pintar);
  input.addEventListener('keydown',e=>{if(e.key==='Enter')confirmAddRamo();});
  pintar();
}

// Resultados de búsqueda del catálogo. Solo ramos de la universidad y carrera
// del estudiante — nunca de otra casa de estudios.
function renderCatalogResults(q){
  const box=document.getElementById('m-ramo-results');if(!box)return;
  const yaTengo=new Set(S.ramos.map(r=>normName(r.nombre)));
  const res=searchCatalog(q,S.tenant,S.carrera,S.careerSemestre).slice(0,6);
  if(res.length===0){
    box.innerHTML=`<div class="cat-empty">${q&&q.trim()?'No está en tu malla — lo agregamos como ramo tuyo.':'Sin ramos en el catálogo.'}</div>`;
    return;
  }
  box.innerHTML=res.map(r=>{
    const tengo=yaTengo.has(normName(r.nombre));
    return `<button class="cat-hit${tengo?' ya':''}" ${tengo?'disabled':`onclick="addFromCatalog('${esc(r.nombre).replace(/'/g,"\\'")}')"`}>
      <span class="cat-hit-info">
        <span class="cat-hit-name">${esc(r.nombre)}</span>
        <span class="cat-hit-meta">${r.semestre}° semestre${r.tienePreset?' · con ponderaciones':''}</span>
      </span>
      ${tengo?'<span class="cat-hit-tag">ya lo tienes</span>'
             :(r.tienePreset?'<svg class="ic cat-hit-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z" fill="currentColor" stroke="none"/></svg>':'<span class="chevron-r">+</span>')}
    </button>`;
  }).join('');
}

// Agrega directo desde el catálogo, con sello de procedencia y preset si existe
function addFromCatalog(nombre){
  const presetName=findPresetName(nombre,S.tenant,S.carrera);
  const preset=presetName?presetRamo(presetName,S.tenant,S.carrera):null;
  S.ramos.push({
    id:uid(),nombre:presetName||nombre,color:nextRamoColor(presetName||nombre),
    creditos:creditosDe(nombre,S.tenant,preset),origen:origenActual(presetName||nombre),
    categorias:preset?preset.categorias:[],gates:preset?preset.gates:[],aporta:preset?preset.aporta:null,recuperativo:preset?preset.recuperativo:null,pautaHuella:preset?huellaPauta(preset.categorias):null,
  });
  save();track('add_ramo_catalogo',{preset:!!preset});
  closeModal();renderHome();
  showToast(preset?'Agregado con sus ponderaciones':'Ramo agregado');
}
function renderModalColors(){
  const c=document.getElementById('m-colors');if(!c)return;c.innerHTML='';
  chartColors().forEach(col=>{
    const d=document.createElement('div');d.className='color-dot'+(col===modalColor?' sel':'');d.style.background=col;
    d.onclick=()=>{modalColor=col;renderModalColors();};c.appendChild(d);
  });
}
// Matching tolerante: ignora tildes y mayúsculas para encontrar el preset.
function normName(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}

// El mismo ramo escrito con y sin número. Hay programas que numeran el primero
// de una serie que en la malla va sin número: "Contabilidad I" es la
// "Contabilidad" del catálogo. Ese estudiante se quedaba sin pauta oficial, sin
// créditos y sin sigla, teniendo el ramo correcto y escribiéndolo distinto.
//
// Dos límites, y ninguno es cosmético. Solo el PRIMERO: "Contabilidad II" es
// otro ramo. Y solo si "X I" no es un ramo de verdad de esa universidad —en FEN
// conviven "Gestión de Personas" (2º) con "Gestión de Personas I" (5º), y pasa
// igual con Marketing, Finanzas y Métodos Cuantitativos. Darle a esos la pauta
// del otro sería calcular el promedio con las ponderaciones equivocadas.
//
// La malla es la que manda sobre qué nombres existen de verdad. Es un literal
// que no cambia en ejecución, así que se recorre una vez por universidad.
const _nombresMalla={};
function ramoDeLaMalla(nombre,tenant){
  if(!_nombresMalla[tenant]){
    const set=new Set(),mallas=mallaFor(tenant)||{};
    for(const c in mallas)for(const s in mallas[c])(mallas[c][s]||[]).forEach(n=>set.add(normName(n)));
    _nombresMalla[tenant]=set;
  }
  return _nombresMalla[tenant].has(normName(nombre));
}

// El nombre canónico de un ramo que se llama de dos formas, o null. La tabla
// vive en data.js y son pares confirmados uno por uno contra el código del
// ramo: acá no se deduce nada.
function sinonimoDe(nombre,tenant){
  const tabla=(typeof SINONIMOS!=='undefined'&&SINONIMOS[tenant])||{};
  const n=normName(nombre);
  const k=Object.keys(tabla).find(x=>normName(x)===n);
  return k?tabla[k]:null;
}

// Busca `nombre` entre `claves` por nombre normalizado. Los dos rescates son
// intentos POSTERIORES: una coincidencia exacta siempre manda.
function claveCatalogo(nombre,claves,tenant){
  const n=normName(nombre);
  const exacta=claves.find(k=>normName(k)===n);
  if(exacta)return exacta;
  const otro=sinonimoDe(nombre,tenant);
  if(otro){
    const porSinonimo=claves.find(k=>normName(k)===normName(otro));
    if(porSinonimo)return porSinonimo;
  }
  if(!/\s+i$/.test(n)||ramoDeLaMalla(nombre,tenant))return null;
  const base=n.replace(/\s+i$/,'');
  return claves.find(k=>normName(k)===base)||null;
}

// Créditos SCT de un ramo. Primero el preset —si existe, es el dato de su
// programa oficial— y si no, la tabla de créditos de la universidad.
//
// Existe porque los dos datos tienen vidas distintas: las ponderaciones cambian
// cada semestre y hay 10 pautas para 88 ramos FEN, pero los créditos casi no
// cambian y de Ingeniería UC están los 146. Atar el crédito al preset dejaba sin
// PPA ponderado a todo el que cargara su malla, que es casi todo el mundo.
//
// Devuelve null cuando no se sabe. OJO: 0 no es null. Un laboratorio de 0 SCT es
// un dato conocido y exacto; null es "no lo tenemos". Confundirlos es lo que
// haría que un ramo sin dato se colara al promedio con peso cero.
const CREDITOS_POR_TENANT={uc:CREDITOS_UC,fen:CREDITOS_FEN};
function creditosDe(nombre,tenant,preset){
  if(preset&&typeof preset.creditos==='number')return preset.creditos;
  const tabla=CREDITOS_POR_TENANT[tenant];
  if(!tabla)return null;
  const clave=claveCatalogo(nombre,Object.keys(tabla),tenant);
  return clave?tabla[clave][0]:null;
}

// Identificador oficial de un ramo UC. La carrera solo sirve para resolver un
// nombre ambiguo al momento de encontrar su sigla; una vez resuelto, el
// consenso se agrupa por universidad + sigla, nunca por carrera ni semestre.
function siglaUC(nombre,carrera){
  const tabla=SIGLAS_UC[carrera];
  if(!tabla)return null;
  const clave=claveCatalogo(nombre,Object.keys(tabla),'uc');
  return clave?tabla[clave]:null;
}

// \u2500\u2500\u2500 CAT\u00c1LOGO DE RAMOS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Capa de consulta sobre MALLA/PRESETS. Todo ramo del cat\u00e1logo pertenece a un
// par (universidad, carrera): nunca se le ofrece a un alumno de la UC un ramo
// que solo existe en la malla de la UANDES.
function catalogKey(tenant,carrera){return (tenant||'')+':'+(carrera||'');}
function siglaCatalogoUC(nombre){
  const fila=typeof CREDITOS_UC!=='undefined'&&CREDITOS_UC[nombre];
  return fila&&typeof fila[1]==='string'?fila[1]:null;
}

function catalogRamos(tenant,carrera){
  const porCarrera=(mallaFor(tenant)||{})[carrera];
  if(!porCarrera)return [];
  const out=[],vistos=new Set();
  Object.keys(porCarrera).sort((a,b)=>Number(a)-Number(b)).forEach(sem=>{
    (porCarrera[sem]||[]).forEach(nombre=>{
      const k=normName(nombre);
      if(vistos.has(k))return;
      vistos.add(k);
      out.push({nombre,semestre:Number(sem),sigla:tenant==='uc'?siglaCatalogoUC(nombre):null,
                tienePreset:!!findPresetName(nombre,tenant,carrera)});
    });
  });
  return out;
}

// Todos los ramos de la universidad, no solo los de tu carrera. Un alumno de
// Control de Gestión puede estar cursando un ramo que solo figura en la malla
// de Comercial, y antes no había forma de encontrarlo. Incluye las mallas que
// ya no se ofrecen al elegir carrera (Contador Auditor): dejaron la oferta,
// no el catálogo.
//
// `propio` marca si el ramo está en la malla del estudiante — se usa para
// ordenar, no para esconder.
function catalogRamosUniversidad(tenant,carreraPropia){
  const mallas=mallaFor(tenant)||{};
  const propios=new Set(catalogRamos(tenant,carreraPropia).map(r=>normName(r.nombre)));
  const out=[],vistos=new Set();
  Object.keys(mallas).forEach(car=>{
    const porSem=mallas[car]||{};
    Object.keys(porSem).sort((a,b)=>Number(a)-Number(b)).forEach(sem=>{
      (porSem[sem]||[]).forEach(nombre=>{
        const k=normName(nombre);
        if(vistos.has(k))return;
        vistos.add(k);
        out.push({nombre,semestre:Number(sem),propio:propios.has(k),sigla:tenant==='uc'?siglaCatalogoUC(nombre):null,
                  tienePreset:!!findPresetName(nombre,tenant,carreraPropia)||!!findPresetName(nombre,tenant,car)});
      });
    });
  });
  // Un ramo con pauta oficial que no está en ninguna malla existía y nadie
  // podía encontrarlo: el catálogo se arma solo desde las mallas, así que
  // "Revelación y Fe" o "Principios Ecológicos y Medio Ambiente" no aparecían
  // al escribir. La pauta funcionaba —tecleando el nombre completo y exacto—
  // pero para eso hay que saber de antemano que existe. Los OFG y electivos no
  // van en la malla a propósito, porque son una elección y no un ramo de todos;
  // eso no es razón para esconder su pauta.
  presetsFueraDeMalla(tenant,carreraPropia).forEach(nombre=>{
    const k=normName(nombre);
    if(vistos.has(k))return;
    vistos.add(k);
    // semestre 0 = fuera de malla. No compite con los del semestre del
    // estudiante en el orden, porque no le corresponde a nadie en particular.
    out.push({nombre,semestre:0,propio:false,sigla:tenant==='uc'?siglaCatalogoUC(nombre):null,tienePreset:true});
  });
  // Y los cursos que existen sin pertenecer a un semestre ni traer pauta: los
  // optativos y OFG. Entran por el mismo camino que los presets fuera de
  // malla, con `tienePreset:false` porque no hay ponderaciones que prometer.
  // Sin esto el estudiante tiene que escribir "biocel" a mano y la app lo
  // guarda como un ramo inventado por él, sin sigla y sin forma de agrupar.
  if(tenant==='uc')CURSOS_UC.forEach(([sigla,nombre])=>{
    const k=normName(nombre);
    if(vistos.has(k))return;
    vistos.add(k);
    out.push({nombre,semestre:0,propio:false,sigla,fuente:'curso-uc',tienePreset:false});
  });
  // CREDITOS_UC ya viene del catálogo oficial de los 34 majors. No inventa
  // una malla ni dice a qué semestre corresponde: solo evita que Ingeniería
  // UC termine artificialmente en 4° y deja buscar por la sigla del horario.
  if(tenant==='uc')Object.entries(CREDITOS_UC).forEach(([nombre,[,sigla]])=>{
    const k=normName(nombre);
    if(vistos.has(k))return;
    vistos.add(k);
    out.push({nombre,semestre:0,propio:false,sigla,fuente:'catalogo-ingenieria',tienePreset:false});
  });
  return out;
}
// Nombres con pauta oficial que ESTE estudiante puede recibir de verdad. Se
// pregunta por findPresetName y no por las claves del registro: los presets UC
// son del plan común de Ingeniería y no valen para Comercial —"Cálculo I" de
// Comercial es otro curso—, así que listarlos sin filtrar pondría una estrella
// de "pauta oficial" sobre un ramo que después se agregaría vacío.
function presetsFueraDeMalla(tenant,carrera){
  const p=tenant==='fen'?PRESETS_FEN:(tenant==='uc'?PRESETS_UC:null);
  if(!p)return [];
  // findPresetName ya descarta los que solo traen reglas y no ponderaciones
  // (Cálculo II): si no hay pauta que ofrecer, no hay nada que mostrar acá.
  return Object.keys(p).filter(n=>!!findPresetName(n,tenant,carrera));
}

// B\u00fasqueda tolerante a tildes. Ordena: exacto > empieza con > contiene;
// a igualdad, primero los del semestre actual del estudiante.
function searchCatalog(q,tenant,carrera,semActual){
  const todos=catalogRamosUniversidad(tenant,carrera);
  const nq=normName(q);
  if(!nq)return todos.slice();
  const scored=[];
  todos.forEach(r=>{
    const n=normName(r.nombre),sigla=normName(r.sigla||'');
    let s=-1;
    if(n===nq||sigla===nq)s=0;
    else if(n.startsWith(nq)||sigla.startsWith(nq))s=1;
    else if(n.includes(nq)||sigla.includes(nq))s=2;
    else{
      // que "micro 1" encuentre "Microeconom\u00eda I"
      const tk=nq.split(/\s+/).filter(Boolean);
      if(tk.length>1&&tk.every(t=>n.includes(t)))s=3;
    }
    if(s>=0)scored.push({...r,_s:s});
  });
  scored.sort((a,b)=>{
    if(a._s!==b._s)return a._s-b._s;
    // Los de tu propia malla primero: son los más probables. Los de otras
    // carreras siguen apareciendo, solo más abajo.
    if(a.propio!==b.propio)return a.propio?-1:1;
    // Con pauta antes que sin ella. Al entrar los OFG y optativos al catálogo,
    // buscar "Ecolog" devolvía primero "Cristianismo y Crisis Ecológica" —el
    // alfabético desempataba— y dejaba abajo el único que trae ponderaciones
    // oficiales. Entre dos que calzan igual, sirve más el que llega con su
    // pauta puesta.
    if(a.tienePreset!==b.tienePreset)return a.tienePreset?-1:1;
    const da=Math.abs(a.semestre-(semActual||0)),db=Math.abs(b.semestre-(semActual||0));
    if(da!==db)return da-db;
    return a.nombre.localeCompare(b.nombre);
  });
  return scored;
}

// Sello de procedencia para un ramo creado desde el catálogo. La clave queda
// en el ramo, para que el servidor no tenga que duplicar las siglas de data.js.
function ramoKey(nombre,tenant,carrera){
  // Dos carreras que le dicen distinto al mismo ramo tienen que dar la misma
  // clave, o sus reportes no se juntan nunca y el consenso no llega a tres.
  nombre=sinonimoDe(nombre,tenant)||nombre;
  if(tenant!=='uc')return normName(nombre);
  const directa=siglaUC(nombre,carrera);if(directa)return directa;
  const credito=Object.keys(CREDITOS_UC||{}).find(n=>normName(n)===normName(nombre));
  return (credito&&CREDITOS_UC[credito]&&CREDITOS_UC[credito][1])||normName(nombre);
}
function origenActual(nombre){return {tenant:S.tenant,carrera:S.carrera,ramoKey:ramoKey(nombre,S.tenant,S.carrera)};}

// La clave de consenso se fija al CREAR el ramo y se guarda para que sobreviva
// a que el estudiante le cambie el nombre. Eso está bien y no se toca.
//
// Pero un sinónimo declarado DESPUÉS deja dos claves vivas para el mismo ramo,
// y sus reportes dejan de sumar entre sí: justo lo que el sinónimo venía a
// arreglar. Acá se canoniza la clave GUARDADA. No se recalcula desde el nombre
// —eso borraría lo que la clave protege— y no toca ninguna clave que no esté
// declarada como sinónimo.
function claveCanonica(clave,tenant,carrera){
  if(!clave)return clave;
  const tabla=(typeof SINONIMOS!=='undefined'&&SINONIMOS[tenant])||{};
  const alias=Object.keys(tabla).find(x=>normName(x)===normName(clave));
  return alias?ramoKey(tabla[alias],tenant,carrera):clave;
}

// \u2500\u2500\u2500 REPORTES DE CAT\u00c1LOGO \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Si a un estudiante le cambiaron las ponderaciones respecto de lo que trae el
// cat\u00e1logo, puede reportarlo. Cuando varios coinciden en la MISMA estructura,
// esa versi\u00f3n pasa a ser la sugerida para los dem\u00e1s.

// Estructura m\u00ednima y ordenada de un ramo, para comparar y contar consenso.
function estructuraDe(r){
  return catsDePauta(r.categorias)
    .map(c=>{
      const g=(r.gates||[]).find(x=>x.catId===c.id);
      // r2, no un decimal. Con un decimal, los tres Controles de Lectura de
      // Contabilidad (3,33 · 3,33 · 3,34) se reportaban como 3,3 y la pauta
      // sumaba 99,9: el modal abría bloqueado con "Falta 0.1%" sin que el
      // estudiante tocara nada, y la RPC la habría rechazado igual. El resto
      // del camino del reporte ya trabajaba con dos decimales —parsePesoReporte
      // usa r2—, así que el único que cortaba era este.
      const o={nombre:c.nombre,peso:r2(c.peso||0)};
      if(c.slots>1)o.slots=c.slots;
      if(g){o.min=g.min;o.cap=g.cap;}
      return o;
    })
    // Orden por nombre normalizado, NO por localeCompare(): sin locale fijo,
    // localeCompare usa el idioma del dispositivo y "Óptica" va antes de "Oral"
    // en español pero después en polaco. El orden viaja dentro de `estructura`
    // y de la huella, así que dos estudiantes con la MISMA pauta y distinto
    // idioma no agruparían nunca y el consenso no se formaría, en silencio.
    // El segundo criterio desempata los nombres que normalizan igual.
    .sort((a,b)=>{
      const ka=normName(a.nombre),kb=normName(b.nombre);
      if(ka!==kb)return ka<kb?-1:1;
      return a.nombre<b.nombre?-1:a.nombre>b.nombre?1:0;
    });
}

// Lo que de verdad se reporta: la pauta sin las evaluaciones en 0%.
//
// Una evaluación en 0% no aporta al promedio, así que no forma parte de la
// ponderación — pero sí rompía el consenso, que agrupa por estructura exacta.
// Pasó de verdad: cinco personas reportaron Métodos Matemáticos I diciendo
// exactamente lo mismo (tres de 20% y examen de 40%) y quedaron en cinco grupos
// de uno, porque a cada una le sobró la evaluación vieja de la pauta oficial y
// la dejó en 0% con un nombre distinto: "Solemne", "N", "O", "X". Cinco
// personas de acuerdo y consenso cero.
//
// Se filtra al ENVIAR y al comparar, no al armar el borrador: en el modal el
// estudiante tiene que poder ver una fila en 0% para subirla.
function estructuraParaConsenso(est){return (est||[]).filter(e=>Number(e.peso)>0);}

// Huella estable: dos reportes id\u00e9nticos producen la misma cadena.
function huellaEstructura(est){
  return est.map(e=>[normName(e.nombre),e.peso,e.slots||1,e.min||0,e.cap||0].join('~')).join('|');
}

// El reporte tiene su propio borrador: corregir lo que se envía al catálogo no
// puede cambiar la pauta, las notas ni los promedios guardados del estudiante.
let reporteDraft=[],reporteRamoId=null;
function estructuraReporte(r){return estructuraDe(r).map(e=>({...e}));}
function parsePesoReporte(raw){
  const txt=String(raw==null?'':raw).trim().replace(',','.');
  const n=Number(txt);
  return Number.isFinite(n)?r2(Math.max(0,Math.min(100,n))):0;
}
function aplicarPesoReporte(est,i,raw){
  if(!est||!est[i])return est;
  est[i]={...est[i],peso:parsePesoReporte(raw)};return est;
}
function estadoReporte(est){
  const total=r2((est||[]).reduce((s,e)=>s+(Number(e.peso)||0),0));
  const diferencia=r2(100-total);
  return {total,diferencia,lista:Math.abs(diferencia)<0.05};
}
function textoEstadoReporte(estado){
  if(estado.lista)return'Lista para enviar.';
  return estado.diferencia>0
    ?`Falta ${r2(estado.diferencia)}% para llegar a 100.`
    :`Te pasas por ${r2(Math.abs(estado.diferencia))}%.`;
}
function pintarEstadoReporte(){
  const estado=estadoReporte(reporteDraft);
  const total=document.getElementById('m-rep-total');
  const suma=document.getElementById('m-rep-suma');
  const balance=document.getElementById('m-rep-balance');
  if(total)total.className=`rep-total ${estado.lista?'ok':'warn'}`;
  if(suma)suma.textContent=`${r2(estado.total)}%`;
  if(balance){balance.textContent=textoEstadoReporte(estado);balance.className=`rep-balance ${estado.lista?'ok':'warn'}`;}
}
function actualizarReportePeso(i,input){
  if(!input)return;
  let limpio=String(input.value||'').replace(',','.').replace(/[^0-9.]/g,'');
  const punto=limpio.indexOf('.');
  if(punto>=0)limpio=limpio.slice(0,punto+1)+limpio.slice(punto+1).replace(/\./g,'').slice(0,1);
  if(Number(limpio)>100)limpio='100';
  input.value=limpio;
  aplicarPesoReporte(reporteDraft,i,limpio);pintarEstadoReporte();
}
function normalizarReportePeso(i,input){
  if(input&&reporteDraft[i])input.value=r2(reporteDraft[i].peso);
}

// La sigla de un reporte UC no puede depender solo de la malla que ya tenemos.
// Los majors aparecen en CREDITOS_UC antes de que exista su malla: si caen al
// nombre normalizado, dos ramos homónimos pueden formar consenso juntos. La
// tabla de créditos ya es el catálogo oficial que los identificó al buscarlos,
// así que sirve también para agrupar sus reportes sin cambiar datos guardados.
function siglaReporteUC(r){
  const o=r&&r.origen;
  if(!o||o.tenant!=='uc')return null;
  if(typeof o.ramoKey==='string'&&o.ramoKey.trim())return o.ramoKey;
  const clave=Object.keys(CREDITOS_UC).find(n=>normName(n)===normName(r.nombre));
  return (clave&&CREDITOS_UC[clave]&&CREDITOS_UC[clave][1])||siglaUC(r.nombre,o.carrera)||null;
}

// La clave del consenso identifica el ramo compartido, no el lugar que ocupa
// en una malla. En UC la sigla evita confundir cursos homónimos de facultades
// distintas; fuera de UC se conserva el nombre normalizado hasta tener otro
// identificador oficial equivalente.
function claveReporte(r){
  const o=r&&r.origen;
  return (o&&o.ramoKey)||siglaReporteUC(r)||ramoKey(r&&r.nombre,o&&o.tenant,o&&o.carrera);
}

function openReportModal(ramoId){
  const r=S.ramos.find(x=>x.id===(ramoId||currentRamoId));
  if(!r){showToast('No se encontr\u00f3 el ramo',true);return;}
  const est=estructuraReporte(r);
  if(est.length===0){showToast('Agrega las evaluaciones antes de reportar',true);return;}
  reporteDraft=est;reporteRamoId=r.id;
  const estado=estadoReporte(est);
  const filas=est.map((e,i)=>`
    <div class="rep-row">
      <label class="rep-name" for="m-rep-peso-${i}">${esc(e.nombre)}${e.slots?` <span class="rep-tag">${e.slots} notas</span>`:''}${e.min?` <span class="rep-tag">m\u00edn ${nf(e.min)}</span>`:''}</label>
      <span class="rep-peso-field"><input class="rep-peso-input" type="text" inputmode="decimal" id="m-rep-peso-${i}" name="ponderacion-${i}" value="${r2(e.peso)}" maxlength="5" autocomplete="off" aria-describedby="m-rep-balance" oninput="actualizarReportePeso(${i},this)" onblur="normalizarReportePeso(${i},this)"/><span class="rep-peso-suffix" aria-hidden="true">%</span></span>
    </div>`).join('');
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Reportar ponderaciones</div>
    <p style="font-size:0.8125rem;color:var(--fg2);line-height:1.5;margin-bottom:14px;">
      Ajusta los porcentajes de <b>${esc(r.nombre)}</b> para que calcen con tu curso. Si varios
      estudiantes reportan lo mismo, pasa a ser la versi\u00f3n sugerida del cat\u00e1logo.
    </p>
    <div class="rep-box">
      ${filas}
      <div class="rep-total ${estado.lista?'ok':'warn'}" id="m-rep-total" role="status" aria-live="polite" tabindex="-1">
        <span>Suma</span><span id="m-rep-suma">${r2(estado.total)}%</span>
      </div>
    </div>
    <p class="rep-balance ${estado.lista?'ok':'warn'}" id="m-rep-balance">${textoEstadoReporte(estado)}</p>
    <label class="modal-label" for="m-rep-nota" style="margin-top:16px;">Comentario <span style="text-transform:none;font-weight:500;color:var(--fg3);letter-spacing:0;">(opcional)</span></label>
    <div class="modal-input"><input type="text" id="m-rep-nota" placeholder="Ej: el profe cambi\u00f3 el examen a 40%" maxlength="120" autocomplete="off"/></div>
    <p style="font-size:0.71875rem;color:var(--fg3);line-height:1.45;margin:-4px 0 14px;">
      Se env\u00eda solo la estructura del ramo y tu universidad. Nunca tus notas.
    </p>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" id="m-rep-btn" onclick="enviarReporte('${esc(r.id)}')">Enviar reporte</button>
    </div>`;
  openModal();
}

async function enviarReporte(ramoId){
  const r=S.ramos.find(x=>x.id===ramoId);if(!r)return;
  const btn=document.getElementById('m-rep-btn');
  if(!supabaseClient||!currentUser){
    showToast('Necesitas tener sesi\u00f3n iniciada para reportar',true);return;
  }
  const est=estructuraParaConsenso(reporteRamoId===ramoId?reporteDraft.map(e=>({...e})):[]);
  const estado=estadoReporte(est);
  if(!est.length||!estado.lista){
    const total=document.getElementById('m-rep-total');if(total)total.focus();
    showToast(est.length?textoEstadoReporte(estado):'Vuelve a abrir el reporte',true);return;
  }
  const notaEl=document.getElementById('m-rep-nota');
  if(btn){btn.disabled=true;btn.textContent='Enviando\u2026';}
  try{
    const {error}=await supabaseClient.rpc('submit_catalog_report',{
      p_tenant:S.tenant,
      // Se conserva como contexto del reporte, pero no participa del consenso.
      p_carrera:(r.origen&&r.origen.carrera)||S.carrera,
      p_ramo:r.nombre,
      p_ramo_norm:normName(r.nombre),
      p_ramo_sigla:siglaReporteUC(r),
      p_estructura:est,
      p_huella:huellaEstructura(est),
      p_nota:(notaEl&&notaEl.value.trim())||null,
    });
    if(error)throw error;
    track('reporte_catalogo',{tenant:S.tenant});
    closeModal();
    reporteDraft=[];reporteRamoId=null;
    showToast('Gracias \u00b7 tu reporte qued\u00f3 registrado');
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent='Enviar reporte';}
    // Tabla no creada todav\u00eda \u2192 mensaje entendible en vez del error crudo
    const msg=/relation .* does not exist|schema cache/i.test(e.message||'')
      ? 'Los reportes a\u00fan no est\u00e1n habilitados en el servidor.'
      : 'No se pudo enviar. Revisa tu conexi\u00f3n.';
    showToast(msg,true);
  }
}

// Lee el consenso (solo agregados, sin datos de nadie) y avisa si el cat\u00e1logo
// que tiene el estudiante qued\u00f3 desactualizado respecto de lo que reporta el resto.
let _consensoCache=null;
async function cargarConsenso(){
  if(!supabaseClient||!currentUser)return null;
  if(_consensoCache)return _consensoCache;
  try{
    const {data,error}=await supabaseClient.rpc('catalog_consensus',{p_tenant:S.tenant});
    if(error)throw error;
    _consensoCache=data||[];
    return _consensoCache;
  }catch(e){return null;}
}

// \u00bfHay una versi\u00f3n con m\u00e1s respaldo que la que tiene este ramo?
async function consensoParaRamo(r){
  const cons=await cargarConsenso();
  if(!cons)return null;
  const mine=huellaEstructura(estructuraParaConsenso(estructuraDe(r)));
  const hit=cons.find(c=>c.ramo_key===claveReporte(r)&&c.huella!==mine);
  return hit||null;
}

// Un ramo CON pauta oficial no se toca solo aunque haya consenso: el programa
// manda. Pero callarse tampoco sirve — puede que la pauta oficial sea de otro
// semestre, o que el curso la haya cambiado, y los compañeros lo sepan antes que
// nosotros. Así que se ofrece: se le muestra, dice quiénes son cuántos, y decide.
async function pintarConsensoDisponible(r){
  const el=document.getElementById('consenso-disponible');
  if(!el)return;
  el.style.display='none';el.innerHTML='';
  if(!r||!r.categorias||!r.categorias.length)return;
  const hit=await consensoParaRamo(r);
  // El await deja pasar tiempo: si el estudiante ya se fue a otro ramo, no se
  // le pinta el aviso del anterior encima.
  if(!hit||currentRamoId!==r.id)return;
  const n=hit.respaldos;
  el.className='weight-setup-nudge';
  el.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></svg><div><b>${n} estudiantes de tu universidad reportan otra pauta.</b><br>Coincidieron entre ellos. No sale del programa oficial: mírala y decide tú.<div style="margin-top:8px;"><button type="button" class="rep-link" style="width:auto;padding:7px 12px;margin:0;" onclick="verConsensoDisponible('${esc(r.id)}')">Ver la que reportan</button></div></div>`;
  el.style.display='flex';
}

// Se la muestra ENTERA antes de que decida. Adoptarla le mueve el promedio, así
// que no se hace a ciegas — misma regla que verCambioDePauta().
async function verConsensoDisponible(ramoId){
  const r=(S.ramos||[]).find(x=>x.id===ramoId);if(!r)return;
  const hit=await consensoParaRamo(r);if(!hit)return;
  const pauta=pautaDeConsenso(hit.estructura);
  const fila=c=>`<li><b>${esc(c.nombre)}</b>: ${r2(c.peso)}%</li>`;
  const mias=new Set(catsDePauta(r.categorias).map(c=>normName(c.nombre)));
  const sePierden=catsDePauta(r.categorias)
    .filter(c=>!pauta.categorias.some(n=>normName(n.nombre)===normName(c.nombre)))
    .filter(c=>(c.notas||[]).some(x=>typeof x.valor==='number'));
  const aviso=sePierden.length
    ? `<p class="modal-desc" style="margin-top:10px;">${sePierden.length===1?'Una evaluación tuya':'Algunas evaluaciones tuyas'} con notas no está en esta pauta. <b>No se borran</b>: quedan en tu ficha en 0%, así no mueven tu promedio.</p>`
    : `<p class="modal-desc" style="margin-top:10px;">Tus notas se conservan: se reconocen por el nombre de la evaluación.</p>`;
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">La pauta que reportan tus compañeros</div>
    <p class="modal-desc">La enviaron <b>${hit.respaldos} estudiantes</b> de tu universidad por separado y coincidieron. <b>No la sacamos del programa oficial</b> — compárala con la de tu curso.</p>
    <ul style="margin:10px 0 0;padding-left:18px;font-size:0.875rem;color:var(--fg2);line-height:1.6;">${pauta.categorias.map(fila).join('')}</ul>
    ${aviso}
    <div class="modal-btns" style="margin-top:16px;">
      <button type="button" class="btn-cancel" onclick="closeModal()">Dejar la mía</button>
      <button type="button" class="btn-confirm" onclick="adoptarConsenso('${esc(r.id)}')">Usar esta</button>
    </div>`;
  openModal();
  return mias;
}

// El cambio de datos, aparte de la interfaz, para poder probarlo sin navegador.
function adoptarConsensoEnRamo(r,hit){
  const pauta=pautaDeConsenso(hit&&hit.estructura);
  if(!pauta.categorias.length)return false;
  fusionarPauta(r,pauta.categorias);
  r.gates=pauta.gates;
  // `pautaHuella` NO se actualiza, y es a propósito. Sigue apuntando a la que
  // le dimos nosotros, así que la pauta adoptada queda distinta de esa y
  // cambioDePauta() la lee como lo que es: una decisión del estudiante, que
  // manda sobre la nuestra. Sin esto, la app le ofrecería volver a la pauta
  // oficial que acaba de descartar — y de paso pautaEditada() se vuelve cierta,
  // así que el botón le pide compartirla y suma un respaldo más.
  // Queda marcada igual que la que se aplica sola: la ficha tiene que decir que
  // esto lo reportaron estudiantes y no un programa.
  r.consensoRespaldos=hit.respaldos;
  return true;
}
async function adoptarConsenso(ramoId){
  const r=(S.ramos||[]).find(x=>x.id===ramoId);if(!r)return;
  const hit=await consensoParaRamo(r);
  if(!hit||!adoptarConsensoEnRamo(r,hit))return;
  save();track('consenso_adoptado');closeModal();renderRamo();
  showToast('Pauta actualizada — tus notas se conservaron');
}

// Cuántas personas distintas tienen que reportar EXACTAMENTE la misma pauta
// para que se aplique sola. El SQL ya agrupa por (ramo, estructura, huella) y
// exige tres personas distintas —no tres reportes: quien reporta dos veces
// sigue contando como uno—, así que bajar este número no hace nada. Subirlo sí,
// y sin migrar: `respaldos` viene en cada fila del consenso.
const CONSENSO_AUTO=3;

// La estructura reportada, con la forma que usa el resto de la app. Espeja a
// presetRamo(), pero solo con lo que el reporte trae de verdad: pesos, `slots`
// y las compuertas de nota mínima. Fechas, grupos, descartes y `aporta` no
// viajan en el reporte, así que no se inventan acá.
function pautaDeConsenso(est){
  const categorias=[],gates=[];
  (est||[]).forEach(e=>{
    if(!e||!e.nombre)return;
    const id=uid(),slots=e.slots>1?e.slots:0;
    const cat={id,nombre:e.nombre,peso:Number(e.peso)||0,ponderaNotas:false,directNota:!!slots,notas:[]};
    if(slots)cat.slots=slots;
    categorias.push(cat);
    if(e.min)gates.push({type:'min_grade_required',catId:id,min:e.min,cap:e.cap,nombre:e.nombre});
  });
  return {categorias,gates};
}

// Rellena las pautas que FALTAN con lo que reportó el resto. Mismo criterio que
// pautaPendiente(): solo ramos del catálogo que están sin pauta.
//
// Por qué solo esos. Un ramo sin evaluaciones no tiene nada que pisar: no hay
// notas que perder ni una pauta que el estudiante haya escrito. En cuanto hay
// algo escrito, el código ya tiene decidido quién manda, y un consenso no lo
// cambia: si la pauta es oficial y cambió, cambioDePauta() se lo MUESTRA y
// espera, porque su promedio va a moverse; y si el estudiante la editó a mano,
// su versión manda sobre la nuestra. Una pauta reportada por tres personas que
// no conoce no puede pesar más que esas dos reglas.
//
// Queda el hueco: los ramos del catálogo que todavía no tienen programa
// transcrito. Ahí no hay nada que pisar y el consenso se aplica solo.
async function aplicarConsensoAuto(){
  const cons=await cargarConsenso();
  if(!cons||!cons.length)return 0;
  let puestas=0;
  (S.ramos||[]).forEach(r=>{
    if(!r.origen||!r.origen.tenant)return;          // ramo a mano: nadie reportó "Electivo de cine"
    if((r.categorias||[]).length||(r.gates||[]).length)return;
    if(pautaPendiente(r))return;                    // hay programa oficial esperando: ese manda
    const hit=cons.find(c=>c.ramo_key===claveReporte(r)&&c.respaldos>=CONSENSO_AUTO);
    if(!hit)return;
    const pauta=pautaDeConsenso(hit.estructura);
    if(!pauta.categorias.length)return;
    r.categorias=pauta.categorias;
    r.gates=pauta.gates;
    r.pautaHuella=huellaPauta(pauta.categorias);
    // Marca de origen: esta pauta NO sale de un programa oficial. La ficha lo
    // dice, y el día que transcribamos el programa, cambioDePauta() ofrece el
    // cambio como con cualquier otra pauta vieja.
    r.consensoRespaldos=hit.respaldos;
    puestas++;
  });
  if(puestas)save();
  return puestas;
}

// \u00bfEl ramo viene de otro cat\u00e1logo que el actual? (el estudiante se cambi\u00f3 de
// universidad o de carrera y arrastr\u00f3 ramos del anterior)
function ramoEsDeOtroCatalogo(r){
  if(!r||!r.origen)return false;
  return r.origen.tenant!==S.tenant||r.origen.carrera!==S.carrera;
}
// La malla y el registro de presets escriben el mismo ramo distinto: en la
// malla es "Filosofía: ¿Para Qué?" y la clave del preset es
// 'Filosofía: ¿para qué?'. Buscar por igualdad exacta hacía que el onboarding
// prometiera la estrella de pauta oficial —esa la calcula findPresetName, que
// sí normaliza— y después creara el ramo vacío. No falla nada: el estudiante
// entra y ve "Todavía no tenemos la pauta de este ramo" en un ramo que sí la
// tiene.
//
// No sirve reusar findPresetName acá: esa exige que el preset traiga
// ponderaciones y deja fuera a los que solo traen reglas, como Cálculo II.
function claveUc(nombre){
  return claveCatalogo(nombre,Object.keys(PRESETS_UC),'uc');
}
function presetUcDisponible(nombre,carrera){
  const clave=claveUc(nombre);if(!clave)return false;
  if(carrera==='ING-PC')return true;
  if(carrera!=='COM')return false;
  return PRESETS_UC_COM.some(n=>normName(n)===normName(clave));
}
function findPresetName(nombre,tenant,carrera){
  if(tenant==='fen')return claveCatalogo(nombre,Object.keys(PRESETS_FEN),'fen');
  if(tenant!=='uc'||!MALLA_UC[carrera])return null;
  // La estrella y el selector prometen ponderaciones precargadas. Un programa
  // que solo trae reglas (como Cálculo II) no debe fingir que las tiene, así
  // que esos quedan fuera de la búsqueda en vez de descartarse después.
  const conPauta=Object.keys(PRESETS_UC).filter(k=>{
    const def=PRESETS_UC[k],evals=Array.isArray(def)?def:(def.evals||[]);
    return evals.length&&presetUcDisponible(k,carrera);
  });
  return claveCatalogo(nombre,conPauta,'uc');
}
// Reglas oficiales informativas que todavía no podemos representar en el
// cálculo. Se recuperan por el origen del ramo para no inventarlas en manuales.
function reglasDelPreset(ramo,campo){
  const def=definicionPresetDelRamo(ramo);
  const lista=!Array.isArray(def)&&def&&def[campo];
  return Array.isArray(lista)?lista:[];
}
// Reglas que el motor todavía no sabe calcular: deuda nuestra, se van a ir.
function reglasNoCalculadas(ramo){return reglasDelPreset(ramo,'noCalcula');}
// Reglas del curso que el promedio NUNCA va a incluir. Decirle al estudiante
// "todavía no las calculamos" sería prometerle algo que no va a pasar: dependen
// de un dato que el programa no da, de algo que decide el profesor caso a caso,
// o son una aproximación deliberada del motor. No son una falta de la app.
function reglasDelCurso(ramo){return reglasDelPreset(ramo,'reglasDelCurso');}
function estadoPauta(categorias){
  const total=(categorias||[]).reduce((s,c)=>s+(Number(c.peso)||0),0);
  const diferencia=Math.round((100-total)*10)/10;
  return {total,diferencia,lista:Math.abs(diferencia)<0.05};
}

// Un ramo del catálogo sin preset no es un ramo "vacío" del estudiante: la
// app sí sabe qué curso es, pero todavía no tiene su programa transcrito. Esta
// distinción decide qué ayuda ofrecer sin inventar ponderaciones.
function pautaCatalogoSinOficial(r){
  return !!(r&&r.origen&&r.origen.tenant&&!presetRamo(r.nombre,r.origen.tenant,r.origen.carrera));
}
// ─── CONTROL DE PONDERACIÓN ──────────────────────────────────────────────────
// Input numérico + slider que se sincronizan. El slider salta de 5 en 5 (valores
// redondos, que es lo normal en una pauta); el input acepta cualquier entero.
// `excluirCatId` permite calcular cuánto % queda libre sin contarse a sí misma.
function pesoControlHTML(valor,excluirCatId){
  const v=Math.round(valor||30);
  const r=S.ramos.find(x=>x.id===currentRamoId);
  let usado=0;
  if(r)r.categorias.forEach(c=>{if(c.id!==excluirCatId)usado+=(c.peso||0);});
  const libre=Math.round((100-usado)*10)/10;
  return `
    <label class="modal-label">Ponderación en el ramo</label>
    <div class="peso-control">
      <div class="peso-field">
        <input type="text" inputmode="numeric" id="m-cat-peso-num" value="${v}" maxlength="3" aria-label="Ponderación en porcentaje"/>
        <span class="peso-pct">%</span>
      </div>
      <div class="peso-hint" id="m-peso-hint"></div>
    </div>
    <input type="range" min="0" max="100" step="5" value="${v}" id="m-cat-peso" class="peso-slider" aria-label="Ajustar ponderación"/>
    <div class="peso-marks" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
    <input type="hidden" id="m-peso-libre" value="${libre}"/>`;
}

// Conecta input ↔ slider y actualiza el hint de "cuánto queda"
function wirePesoControl(){
  const num=document.getElementById('m-cat-peso-num');
  const slider=document.getElementById('m-cat-peso');
  const hint=document.getElementById('m-peso-hint');
  const libre=parseFloat((document.getElementById('m-peso-libre')||{}).value)||0;
  if(!num||!slider)return;

  function refreshHint(v){
    if(!hint)return;
    const resto=Math.round((libre-v)*10)/10;
    if(Math.abs(resto)<0.05){
      hint.textContent='Las evaluaciones suman 100%';
      hint.className='peso-hint ok';
    }else if(resto>0){
      hint.textContent=`Faltan ${r2(resto)}% para completar 100%`;
      hint.className='peso-hint';
    }else{
      hint.textContent=`Te pasas por ${r2(Math.abs(resto))}%`;
      hint.className='peso-hint over';
    }
  }
  function setVal(v,fromInput){
    v=Math.max(0,Math.min(100,v));
    slider.value=String(Math.round(v/5)*5); // el slider siempre cae en múltiplo de 5
    if(!fromInput)num.value=String(Math.round(v));
    refreshHint(v);
  }
  // Escribir a mano: cualquier entero 0–100
  num.addEventListener('input',()=>{
    const raw=num.value.replace(/[^0-9]/g,'');
    if(raw!==num.value)num.value=raw;
    const v=parseInt(raw,10);
    if(!isNaN(v))setVal(v,true);
  });
  num.addEventListener('blur',()=>{
    let v=parseInt(num.value,10);
    if(isNaN(v)||v<=0)v=1;
    if(v>100)v=100;
    num.value=String(v);setVal(v,true);
  });
  // Mover el slider: salta de 5 en 5
  slider.addEventListener('input',()=>{
    const v=parseInt(slider.value,10);
    num.value=String(v);refreshHint(v);
  });
  refreshHint(parseInt(num.value,10)||0);
}

// Peso actual de una categoría (fallback si el input quedó vacío al editar)
function cat0Peso(catId){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return 30;
  const c=r.categorias.find(x=>x.id===catId);
  return c?c.peso:30;
}
// Lee el valor final del control (prioriza lo escrito a mano)
function readPesoControl(fallback){
  const num=document.getElementById('m-cat-peso-num');
  let v=num?parseInt(num.value,10):NaN;
  if(isNaN(v)){
    const slider=document.getElementById('m-cat-peso');
    v=slider?parseInt(slider.value,10):NaN;
  }
  if(isNaN(v)||v<=0)return fallback==null?30:fallback;
  return Math.min(100,v);
}

// Créditos: entero 1–60, o null si viene vacío/inválido
function parseCreditos(raw){
  const n=parseInt(String(raw==null?'':raw).trim(),10);
  return (!isNaN(n)&&n>0&&n<=60)?n:null;
}
function confirmAddRamo(){
  const name=document.getElementById('m-ramo-search').value.trim();
  if(!name){
    mostrarErrorCampo('m-ramo-search','m-ramo-error','Escribe el nombre o la sigla del ramo para agregarlo.');
    return false;
  }
  // Si el nombre coincide con un ramo del catálogo del tenant, carga sus ponderaciones oficiales.
  const presetName=findPresetName(name,S.tenant,S.carrera);
  const preset=presetName?presetRamo(presetName,S.tenant,S.carrera):null;
  const cr=creditosDe(presetName||name,S.tenant,preset);
  S.ramos.push({id:uid(),nombre:presetName||name,color:nextRamoColor(presetName||name),creditos:cr,origen:presetName?origenActual(presetName):null,categorias:preset?preset.categorias:[],gates:preset?preset.gates:[],aporta:preset?preset.aporta:null,recuperativo:preset?preset.recuperativo:null,pautaHuella:preset?huellaPauta(preset.categorias):null});
  save();track('add_ramo',{total_ramos:S.ramos.length,preset:!!preset,con_creditos:!!cr});closeModal();renderHome();
  showToast(preset?'Ponderaciones oficiales cargadas':'Ramo agregado');
}

// Fecha y hora van juntas en la interfaz porque así se piensan ("la I1 es el
// martes a las 14:00"), pero separadas en el dato. La hora queda deshabilitada
// mientras no haya fecha: una hora suelta no se puede poner en ninguna agenda.
function campoFechaHoraHTML(idBase,fecha,hora,conQuitar){
  const f=esc(fecha||''),h=esc(hora||'');
  return `<label class="modal-label">Fecha <span style="text-transform:none;font-weight:500;color:var(--fg3);letter-spacing:0;">(opcional — aparece en la Agenda)</span></label>
    <div class="modal-input" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <input type="date" id="${idBase}-fecha" value="${f}" autocomplete="off" style="flex:1 1 9.5rem;min-width:9rem;" oninput="sincronizarHora('${idBase}')"/>
      <input type="time" id="${idBase}-hora" value="${h}" autocomplete="off" aria-label="Hora (opcional)" style="flex:1 1 7rem;min-width:6.5rem;" ${fecha?'':'disabled'}/>
      ${conQuitar&&fecha?`<button type="button" onclick="limpiarFechaHora('${idBase}')" style="flex:0 0 auto;padding:10px 12px;background:var(--muted);border:none;border-radius:8px;color:var(--fg2);font-size:0.75rem;font-weight:600;cursor:pointer;">Quitar</button>`:''}
    </div>`;
}
// Quitar la fecha se lleva la hora: quedaría un dato que no se puede mostrar.
function sincronizarHora(idBase){
  const f=document.getElementById(idBase+'-fecha'),h=document.getElementById(idBase+'-hora');
  if(!f||!h)return;
  h.disabled=!f.value;
  if(!f.value)h.value='';
}
function limpiarFechaHora(idBase){
  const f=document.getElementById(idBase+'-fecha');
  if(f)f.value='';
  sincronizarHora(idBase);
}
function leerHora(idBase){
  const f=document.getElementById(idBase+'-fecha'),h=document.getElementById(idBase+'-hora');
  if(!f||!f.value||!h)return null;
  return HORA_RE.test(h.value||'')?h.value:null;
}

let addCatError='';
function mostrarErrorCampo(inputId,errorId,mensaje){
  const input=document.getElementById(inputId),error=document.getElementById(errorId);
  if(error){error.textContent=mensaje;error.hidden=false;}
  if(input){input.setAttribute('aria-invalid','true');input.focus();}
}
function limpiarErrorCampo(inputId,errorId){
  const input=document.getElementById(inputId),error=document.getElementById(errorId);
  if(input)input.removeAttribute('aria-invalid');
  if(error){error.textContent='';error.hidden=true;}
}
function openAddCatModal(prefillDate){
  addCatError='';
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Nueva evaluación</div>
    <label class="modal-label">Nombre</label>
    <div class="modal-input"><input type="text" id="m-cat-name" placeholder="Ej: Prueba 1, Tarea 2, Laboratorio" maxlength="${NOMBRE_MAX}" autocomplete="off" aria-describedby="m-cat-error"/></div>
    <p id="m-cat-error" role="alert" hidden style="margin:-6px 0 10px;font-size:0.8125rem;color:var(--red);"></p>
    ${pesoControlHTML(30,null)}
    <label class="modal-label" style="display:flex;align-items:center;gap:10px;text-transform:none;font-weight:500;letter-spacing:0;cursor:pointer;margin:2px 0 14px;line-height:1.35;">
      <input type="checkbox" id="m-cat-varias" style="width:18px;height:18px;flex-shrink:0;accent-color:var(--primary);"/>
      <span>Son varias notas que se promedian <span style="color:var(--fg3);">(controles, laboratorios, tareas)</span></span>
    </label>
    ${campoFechaHoraHTML('m-cat',prefillDate||'',null,false)}
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" id="m-add-cat-btn" onclick="confirmAddCat()">Agregar evaluación</button>
    </div>`;
  openModal();wirePesoControl();
  setTimeout(()=>document.getElementById('m-cat-name').focus(),100);
  document.getElementById('m-cat-name').addEventListener('input',()=>{if(addCatError){addCatError='';limpiarErrorCampo('m-cat-name','m-cat-error');}});
  document.getElementById('m-cat-name').addEventListener('keydown',e=>{if(e.key==='Enter')confirmAddCat();});
}
function confirmAddCat(){
  const input=document.getElementById('m-cat-name');
  const name=(input&&input.value||'').trim();
  const peso=readPesoControl(30);
  if(!name){addCatError='Escribe el nombre de la evaluación para agregarla.';mostrarErrorCampo('m-cat-name','m-cat-error',addCatError);return false;}
  const fechaInput=document.getElementById('m-cat-fecha');
  const fecha=(fechaInput&&fechaInput.value)?fechaInput.value:null;
  const r=S.ramos.find(x=>x.id===currentRamoId);
  // directNota: una evaluación es UNA nota que se escribe en su fila, igual que
  // en las pautas oficiales. Sin esto quedaba como una lista a la que había que
  // entrar para agregar notas adentro — una "Prueba 1" no tiene notas adentro,
  // tiene una nota. Sigue siendo lo que sale por defecto.
  //
  // Pero "Controles 20%" sí tiene varias notas adentro, y a mano no había forma
  // de decirlo: la casilla es el único camino que tiene el estudiante hacia la
  // tarjeta con "+ Agregar nota" que las pautas oficiales usan vía `lista:true`.
  const varias=!!(document.getElementById('m-cat-varias')||{}).checked;
  const hora=leerHora('m-cat');
  r.categorias.push({id:uid(),nombre:name,peso,fecha,hora,fechaOrigen:fecha?'usuario':null,horaOrigen:hora?'usuario':null,ponderaNotas:false,directNota:!varias,notas:[]});
  save();track('add_categoria',{peso,tiene_fecha:!!fecha,varias_notas:varias});closeModal();renderRamo();
}

// ─── PAUTA MANUAL ───────────────────────────────────────────────────────────
// El borrador vive solo mientras el modal está abierto: cancelar no toca la
// pauta real. Los pesos pueden quedar incompletos porque en semana 1 muchas
// veces todavía no está toda la información.
let pautaDraft=[];
let pautaDraftError='',pautaDraftErrorIndex=null,pautaDraftErrorTarget='';
function openPautaManualModal(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  // Además de normalizar al cargar, el editor tolera un ramo legado incompleto.
  // Es el camino mayoritario: los ramos sin preset parten sin evaluaciones.
  if(!Array.isArray(r.categorias))r.categorias=[];
  pautaDraft=r.categorias.map(c=>({id:c.id,nombre:c.nombre,peso:Number(c.peso)||0,tieneNotas:(c.notas||[]).length>0,varias:c.directNota===false||(Number.isInteger(c.slots)&&c.slots>1),cantidad:Number.isInteger(c.slots)&&c.slots>1?c.slots:null}));
  pautaDraftError='';pautaDraftErrorIndex=null;pautaDraftErrorTarget='';
  if(!pautaDraft.length)pautaDraft.push({id:null,nombre:'',peso:0,tieneNotas:false,varias:false,cantidad:null});
  renderPautaManualModal();openModal();
  setTimeout(()=>{const i=document.getElementById('m-pauta-nombre-0');if(i)i.focus();},100);
}
function pautaResumen(){
  const e=estadoPauta(pautaDraft);
  if(e.lista)return`✓ ${r2(e.total)} / 100% · pauta lista`;
  return e.diferencia>0?`${r2(e.total)} / 100% · faltan ${r2(e.diferencia)}%`:`${r2(e.total)} / 100% · te pasas por ${r2(Math.abs(e.diferencia))}%`;
}
// Las plantillas solo ahorran escribir nombres. Jamás sugieren pesos: cada
// estudiante debe confirmarlos contra el programa de su propio curso.
function plantillaPauta(tipo){
  const estructuras={
    'tres-solemnes':['Solemne 1','Solemne 2','Solemne 3','Examen'],
    'tres-pruebas':['Prueba 1','Prueba 2','Prueba 3','Examen'],
    'dos-pruebas':['Prueba 1','Prueba 2','Examen'],
    // Cálculo I, Álgebra Lineal y Cálculo II comparten esta forma. El
    // laboratorio sigue siendo un grupo de tres notas: repetirlo como tres
    // evaluaciones inventaría cómo se reparte su peso.
    'tres-interrogaciones-lab':['Interrogación 1','Interrogación 2','Interrogación 3',{nombre:'Laboratorio',varias:true,cantidad:3},'Examen'],
    // Introducción a la Programación combina evaluaciones grandes, tareas y
    // participación. Es una estructura para partir, no una pauta del curso.
    'dos-interrogaciones-tareas-participacion':['Interrogación 1','Interrogación 2',{nombre:'Tareas',varias:true,cantidad:3},'Participación','Examen'],
  };
  return (estructuras[tipo]||[]).map(fila=>{
    const def=typeof fila==='string'?{nombre:fila}:fila;
    return {id:null,nombre:def.nombre,peso:0,tieneNotas:false,varias:false,cantidad:null,...def};
  });
}
// En UC las evaluaciones se llaman pruebas, no solemnes. FEN conserva el
// término porque aparece así en sus programas oficiales. Solo alimenta el
// placeholder del campo: no arma ninguna estructura.
function ejemploEvaluacion(tenant){return tenant==='uc'?'Prueba':'Solemne';}

// Plantillas de estructura, POR TENANT — y FEN no tiene.
//
// El plan común de Ingeniería UC sí tiene una forma estable: tres
// interrogaciones y un examen, y así están sus cuatro presets. Ahí la plantilla
// ahorra tipeo real.
//
// En FEN no existe esa forma. De los diez programas oficiales transcritos, cada
// uno mezcla distinto solemnes, controles de lectura, controles de ejercicios,
// controles sorpresa, trabajos grupales y participación — y ninguno es "3
// solemnes + examen". Ofrecer esa plantilla empujaba a la mayoría a una
// estructura que después tenían que deshacer a mano.
function plantillasPauta(tenant){
  return tenant==='uc'
    ?[
      {tipo:'tres-pruebas',label:'3 pruebas + examen'},
      {tipo:'dos-pruebas',label:'2 pruebas + examen'},
      {tipo:'tres-interrogaciones-lab',label:'3 interrogaciones + laboratorio (3) + examen'},
      {tipo:'dos-interrogaciones-tareas-participacion',label:'2 interrogaciones + tareas (3) + participación + examen'},
    ]
    :[];
}
// Son atajos de escritura, no una pauta sugerida: el estudiante elige el
// nombre y siempre define sus propios pesos. UC y FEN usan vocabularios
// distintos en sus programas, por eso no se mezclan en la misma lista.
// Tres vocabularios, no dos. El tercero es el que faltaba: para una
// universidad que no conocemos NO se puede elegir entre el de la FEN y el de
// la UC — hay que no usar ninguno. Antes el default era el de FEN, así que a
// cualquier universidad nueva le habrían aparecido "Solemne 1, Solemne 2", que
// es la señal más rápida de que la app no es para ti.
//
// El neutro usa solo nombres que no pertenecen a una institución: nada de
// "Solemne" (FEN) ni de "Interrogación" (UC).
function sugerenciasEvaluacion(tenant){
  const comunes=['Laboratorio','Informe','Taller','Proyecto','Tarea','Presentación','Examen'];
  if(tenant==='uc')return ['Interrogación 1','Interrogación 2','Interrogación 3','Prueba 1','Prueba 2','Prueba 3','Control 1','Control 2','Control 3',...comunes];
  if(tenant==='fen')return ['Solemne 1','Solemne 2','Solemne 3','Control 1','Control 2','Control 3','Prueba sorpresa','Casos y ensayos','Trabajo individual','Trabajo en grupo','Participación',...comunes];
  return ['Prueba 1','Prueba 2','Prueba 3','Control 1','Control 2','Control 3',...comunes];
}
function opcionesSugerenciasEvaluacion(tenant){
  return sugerenciasEvaluacion(tenant).map(nombre=>`<option value="${esc(nombre)}"></option>`).join('');
}
function puedeUsarPlantillaPauta(){
  return pautaDraft.every(fila=>!fila.tieneNotas&&!fila.nombre.trim());
}
function aplicarPlantillaPauta(tipo){
  pautaDraft=plantillaPauta(tipo);if(!pautaDraft.length)return;
  renderPautaManualModal();
  setTimeout(()=>{const i=document.getElementById('m-pauta-peso-0');if(i)i.focus();},0);
}
// Una pauta de otro ramo sirve de referencia, no de copia de datos: se llevan
// solo los nombres y porcentajes, nunca notas, fechas, IDs ni reglas.
function ramosParaDuplicarPauta(ramos,ramoActualId){
  return (ramos||[]).filter(r=>r.id!==ramoActualId&&(r.categorias||[]).some(c=>String(c.nombre||'').trim()))
    .map(r=>({id:r.id,nombre:r.nombre,cantidad:r.categorias.filter(c=>String(c.nombre||'').trim()).length}));
}
function pautaDuplicada(ramo){
  return ((ramo&&ramo.categorias)||[]).filter(c=>String(c.nombre||'').trim())
    .map(c=>({id:null,nombre:String(c.nombre).trim(),peso:Number(c.peso)||0,tieneNotas:false,varias:c.directNota===false||(Number.isInteger(c.slots)&&c.slots>1),cantidad:Number.isInteger(c.slots)&&c.slots>1?c.slots:null}));
}
function textoConfirmarPautaDuplicada(origen,copia){
  const cantidad=copia.length;
  return `Vas a copiar ${cantidad} evaluaci${cantidad===1?'ón':'ones'} y sus porcentajes desde ${origen.nombre}. No se copian notas ni fechas. Podrás ajustarla antes de guardar.`;
}
function duplicarPautaDesdeRamo(){
  const origenId=(document.getElementById('m-pauta-origen')||{}).value;
  const origen=S.ramos.find(r=>r.id===origenId);const copia=pautaDuplicada(origen);
  if(!copia.length){showToast('Elige un ramo con evaluaciones',true);return;}
  showConfirm(`Usar la pauta de ${origen.nombre}`,textoConfirmarPautaDuplicada(origen,copia),()=>{
    pautaDraft=copia;renderPautaManualModal();
    setTimeout(()=>{const i=document.getElementById('m-pauta-peso-0');if(i)i.focus();},0);
  },{label:'Usar pauta'});
}
function renderPautaManualModal(){
  const fuentes=puedeUsarPlantillaPauta()?ramosParaDuplicarPauta(S.ramos,currentRamoId):[];
  const ejemplo=ejemploEvaluacion(S.tenant);
  const sugerencias=opcionesSugerenciasEvaluacion(S.tenant);
  const disponibles=plantillasPauta(S.tenant);
  const plantillas=(puedeUsarPlantillaPauta()&&disponibles.length)?`<div style="margin:0 0 12px;padding:11px 12px;border-radius:10px;background:var(--muted);">
    <div style="font-size:0.8125rem;font-weight:700;color:var(--fg);margin-bottom:7px;">Parte con una estructura</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap;">${disponibles.map(p=>`<button type="button" onclick="aplicarPlantillaPauta('${p.tipo}')" style="padding:8px 10px;border:1px solid var(--border);border-radius:9px;background:var(--bg);color:var(--fg);font:600 12px 'Onest',sans-serif;cursor:pointer;">${p.label}</button>`).join('')}</div>
    <div style="font-size:0.75rem;color:var(--fg2);line-height:1.4;margin-top:8px;">Los pesos quedan en 0%. Confírmalos con el programa del curso.</div>
  </div>`:'';
  const duplicar=fuentes.length?`<div style="margin:0 0 12px;padding:11px 12px;border-radius:10px;border:1px solid var(--border);">
    <div style="font-size:0.8125rem;font-weight:700;color:var(--fg);margin-bottom:4px;">¿Ya la tienes armada en otro ramo?</div>
    <div style="font-size:0.75rem;color:var(--fg2);line-height:1.4;margin-bottom:8px;">Copia evaluaciones y porcentajes. Tus notas y fechas no se copian.</div>
    <div style="display:flex;gap:7px;"><select id="m-pauta-origen" style="min-width:0;flex:1;padding:9px;border:1px solid var(--border);border-radius:9px;background:var(--bg2);color:var(--fg);font:inherit;"><option value="">Elige un ramo</option>${fuentes.map(r=>`<option value="${esc(r.id)}">${esc(r.nombre)} · ${r.cantidad} evaluación${r.cantidad!==1?'es':''}</option>`).join('')}</select><button type="button" onclick="duplicarPautaDesdeRamo()" style="padding:9px 11px;border:0;border-radius:9px;background:var(--primary);color:white;font:600 12px 'Onest',sans-serif;cursor:pointer;">Usar pauta</button></div>
  </div>`:'';
  const filas=pautaDraft.map((fila,i)=>{
    // El editor nunca decide un porcentaje. Solo calcula el resto y se lo
    // ofrece a la fila vacía que la persona eligió explícitamente.
    const resto=restoParaPautaFila(i);
    const errorEnFila=pautaDraftErrorIndex===i;
    const usarResto=fila.peso===0?`<button type="button" onclick="usarRestoPauta(${i})" style="margin-top:4px;padding:0;border:0;background:none;color:var(--primary);font:700 10px 'Onest',sans-serif;cursor:pointer;white-space:nowrap;">${resto>0?`Usar ${r2(resto)}%`:'Usar el resto'}</button>`:'';
    const cantidad=fila.varias?`<div style="grid-column:1 / -1;display:flex;align-items:center;gap:7px;padding:7px 9px;margin-top:-2px;border-radius:9px;background:var(--muted);font-size:0.75rem;color:var(--fg2);"><span style="flex:1;min-width:0;">Se promedian varias notas</span><label style="display:flex;align-items:center;gap:4px;white-space:nowrap;">Esperas <input type="text" inputmode="numeric" id="m-pauta-cantidad-${i}" value="${fila.cantidad||''}" placeholder="—" maxlength="3" oninput="actualizarPautaCantidad(${i},this.value)" aria-label="Cantidad esperada de notas para ${esc(fila.nombre||'evaluación')}" style="width:32px;padding:5px 4px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--fg);font:inherit;text-align:center;"/> notas</label></div>`:'';
    return `
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 64px 52px 30px;gap:6px;align-items:center;margin:8px 0;">
      <input type="text" id="m-pauta-nombre-${i}" value="${esc(fila.nombre)}" placeholder="Ej: ${ejemplo} ${i+1}" maxlength="${NOMBRE_MAX}" list="m-pauta-sugerencias" autocomplete="off" oninput="actualizarPautaNombre(${i},this.value)" onkeydown="pautaTecla(event,${i},'nombre')" ${errorEnFila&&pautaDraftErrorTarget==='nombre'?'aria-invalid="true" aria-describedby="m-pauta-error"':''} style="min-width:0;padding:11px 10px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg2);color:var(--fg);font:inherit;"/>
      <div style="position:relative;"><input type="text" inputmode="numeric" id="m-pauta-peso-${i}" value="${fila.peso||''}" placeholder="0" maxlength="3" oninput="actualizarPautaPeso(${i},this.value)" onkeydown="pautaTecla(event,${i},'peso')" aria-label="Peso de ${esc(fila.nombre||'evaluación')}" ${errorEnFila&&pautaDraftErrorTarget==='peso'?'aria-invalid="true" aria-describedby="m-pauta-error"':''} style="width:100%;box-sizing:border-box;padding:11px 23px 11px 10px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg2);color:var(--fg);font:inherit;"/><span style="position:absolute;right:9px;top:11px;color:var(--fg3);font-size:0.8125rem;pointer-events:none;">%</span>${usarResto}</div>
      <label title="Son varias notas que se promedian" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:40px;cursor:pointer;font-size:0.5625rem;color:var(--fg3);font-weight:700;line-height:1;">
        <input type="checkbox" ${fila.varias?'checked':''} onchange="actualizarPautaVarias(${i},this.checked)" aria-label="${esc(fila.nombre||'Evaluación')}: son varias notas que se promedian" style="width:17px;height:17px;accent-color:var(--primary);"/><span style="margin-top:2px;">VARIAS</span>
      </label>
      <button type="button" id="m-pauta-quitar-${i}" onclick="quitarPautaFila(${i})" title="${fila.tieneNotas?'Esta evaluación ya tiene notas':'Quitar evaluación'}" aria-label="Quitar evaluación" ${errorEnFila&&pautaDraftErrorTarget==='quitar'?'aria-invalid="true" aria-describedby="m-pauta-error"':''} style="height:40px;border:0;border-radius:10px;background:var(--muted);color:var(--fg2);font-size:1.25rem;cursor:pointer;">×</button>
      ${cantidad}
    </div>`;
  }).join('');
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Editar evaluaciones</div>
    <p style="font-size:0.8125rem;color:var(--fg2);line-height:1.45;margin:-4px 0 12px;">Escribe cada evaluación con el porcentaje que vale del ramo. Puedes guardar aunque te falten algunas; el resto solo se asigna cuando tú eliges la fila.</p>
    ${plantillas}
    ${duplicar}
    <datalist id="m-pauta-sugerencias">${sugerencias}</datalist>
    <div id="m-pauta-total" style="padding:10px 12px;border-radius:10px;background:var(--muted);color:var(--fg2);font-size:0.8125rem;font-weight:600;margin-bottom:10px;">${pautaResumen()}</div>
    <p id="m-pauta-error" role="alert"${pautaDraftError?'':' hidden'} style="margin:-3px 0 10px;font-size:0.8125rem;color:var(--red);">${esc(pautaDraftError)}</p>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 64px 52px 30px;gap:6px;font-size:0.6875rem;color:var(--fg3);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">
      <span>Evaluación</span><span>Peso</span><span title="Son varias notas que se promedian" style="text-align:center;">Notas</span><span></span>
    </div>
    <div>${filas}</div>
    <button type="button" onclick="agregarPautaFila()" style="width:100%;padding:10px;border:1px dashed var(--border2);border-radius:10px;background:none;color:var(--primary);font:600 13px 'Onest',sans-serif;cursor:pointer;">+ Otra evaluación</button>
    <div class="modal-btns" style="margin-top:14px;">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" onclick="guardarPautaManual()">Guardar</button>
    </div>`;
}
function limpiarErrorPauta(){
  pautaDraftError='';pautaDraftErrorIndex=null;pautaDraftErrorTarget='';
  const error=document.getElementById('m-pauta-error');if(error){error.textContent='';error.hidden=true;}
}
function mostrarErrorPauta(i,mensaje,target){
  pautaDraftError=mensaje;pautaDraftErrorIndex=i;pautaDraftErrorTarget=target;
  renderPautaManualModal();
  setTimeout(()=>{const control=document.getElementById(`m-pauta-${target}-${i}`);if(control)control.focus();},0);
}
function actualizarPautaNombre(i,valor){limpiarErrorPauta();if(pautaDraft[i])pautaDraft[i].nombre=valor;}
function actualizarPautaVarias(i,valor){
  if(!pautaDraft[i])return;
  pautaDraft[i].varias=!!valor;
  if(!valor)pautaDraft[i].cantidad=null;
  renderPautaManualModal();
}
function actualizarPautaCantidad(i,valor){
  if(!pautaDraft[i])return;
  const limpio=String(valor||'').replace(/[^0-9]/g,'');
  const cantidad=Math.min(100,parseInt(limpio,10)||0);
  pautaDraft[i].cantidad=cantidad>=2?cantidad:null;
  const input=document.getElementById('m-pauta-cantidad-'+i);if(input&&input.value!==limpio)input.value=limpio;
}
function restoParaPautaFila(i){
  const usado=pautaDraft.reduce((s,f,j)=>s+(j===i?0:(Number(f.peso)||0)),0);
  return r2(Math.max(0,100-usado));
}
function usarRestoPauta(i){
  if(!pautaDraft[i])return false;
  const resto=restoParaPautaFila(i);if(resto<=0){mostrarErrorPauta(i,'No queda porcentaje libre para repartir en esta evaluación.','peso');return false;}
  limpiarErrorPauta();
  pautaDraft[i].peso=resto;
  renderPautaManualModal();
  setTimeout(()=>{const input=document.getElementById('m-pauta-peso-'+i);if(input)input.focus();},0);
}
function actualizarPautaPeso(i,valor){
  limpiarErrorPauta();
  if(!pautaDraft[i])return;
  const limpio=String(valor||'').replace(/[^0-9]/g,'');
  const peso=Math.min(100,parseInt(limpio,10)||0);
  pautaDraft[i].peso=peso;
  const input=document.getElementById('m-pauta-peso-'+i);if(input&&input.value!==limpio)input.value=limpio;
  const total=document.getElementById('m-pauta-total');if(total)total.textContent=pautaResumen();
}
function agregarPautaFila(){
  pautaDraft.push({id:null,nombre:'',peso:0,tieneNotas:false,varias:false,cantidad:null});renderPautaManualModal();
  setTimeout(()=>{const i=document.getElementById('m-pauta-nombre-'+(pautaDraft.length-1));if(i)i.focus();},0);
}
function quitarPautaFila(i){
  if(!pautaDraft[i])return false;
  if(pautaDraft[i].tieneNotas){mostrarErrorPauta(i,'Esta evaluación ya tiene notas, por eso no se puede quitar.','quitar');return false;}
  const nombre=String(pautaDraft[i].nombre||'').trim();
  showConfirm(nombre?`¿Quitar "${nombre}"?`:'¿Quitar esta evaluación?',
    'Se quitará de esta pauta. Puedes volver a agregarla antes de guardar.',()=>{
      limpiarErrorPauta();
      pautaDraft.splice(i,1);if(!pautaDraft.length)pautaDraft.push({id:null,nombre:'',peso:0,tieneNotas:false,varias:false,cantidad:null});renderPautaManualModal();
    },{label:'Quitar evaluación',focusCancel:true});
  return true;
}
function pautaTecla(e,i,campo){
  if(e.key!=='Enter')return;e.preventDefault();
  if(campo==='nombre'){const p=document.getElementById('m-pauta-peso-'+i);if(p)p.focus();return;}
  const siguiente=document.getElementById('m-pauta-nombre-'+(i+1));
  if(siguiente)siguiente.focus();else agregarPautaFila();
}
function ofrecerCompartirPauta(r){
  showConfirm('¿Compartir esta pauta?',
    `Vas a revisar los nombres y porcentajes de ${r.nombre} antes de enviarlos. Si otras personas coinciden, puede ayudar a quienes toman el mismo ramo. Nunca tus notas ni fechas.`,
    ()=>openReportModal(r.id),
    {label:'Revisar antes de enviar',danger:false,focusCancel:true});
}
function guardarPautaManual(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  const estabaVacia=!(r.categorias||[]).some(c=>String(c.nombre||'').trim());
  const filas=pautaDraft.filter(f=>f.nombre.trim());
  const ids=new Set(filas.filter(f=>f.id).map(f=>f.id));
  r.categorias=r.categorias.filter(c=>ids.has(c.id)||(c.notas||[]).length>0);
  filas.forEach(f=>{
    const existente=f.id&&r.categorias.find(c=>c.id===f.id);
    const cantidadFija=f.varias&&Number.isInteger(f.cantidad)&&f.cantidad>1;
    // Pasar a fila simple una que ya tiene dos o más notas escondería todas
    // menos la primera, así que ahí se respeta lo que hay. Es la misma regla
    // que aplica normalize() al abrir la app.
    if(existente){
      existente.nombre=f.nombre.trim();existente.peso=f.peso;
      if(f.varias){
        // Cantidad declarada = casillas que la ficha puede mostrar y recorrer.
        // Sin cantidad, sigue siendo una lista abierta: no inventamos cuántos
        // controles habrá durante el semestre.
        existente.directNota=cantidadFija;
        if(cantidadFija)existente.slots=f.cantidad;
        else delete existente.slots;
      }
      else if((existente.notas||[]).length<=1){existente.directNota=true;delete existente.slots;}
    }
    else{
      const cat={id:uid(),nombre:f.nombre.trim(),peso:f.peso,ponderaNotas:false,directNota:!f.varias||cantidadFija,notas:[]};
      if(cantidadFija)cat.slots=f.cantidad;
      r.categorias.push(cat);
    }
  });
  const estado=estadoPauta(r.categorias);save();track('configurar_pauta',{evaluaciones:filas.length,total:estado.total});closeModal();renderRamo();
  showToast(estado.lista?'✓ Listo, ya suma 100%':'Guardado · puedes completar el resto después');
  // Se ofrece una sola vez, al pasar de sin pauta a pauta completa. Si la
  // persona prefiere no compartirla, el enlace de reporte queda disponible en
  // la ficha; no se le vuelve a interrumpir cada vez que corrige un porcentaje.
  if(estabaVacia&&estado.lista&&pautaCatalogoSinOficial(r))setTimeout(()=>ofrecerCompartirPauta(r),160);
}
function abrirPautaDesdeNota(){closeModal();setTimeout(openPautaManualModal,120);}

let addNotaError='';
function openAddNotaModal(catId){
  addNotaError='';
  const r=S.ramos.find(x=>x.id===currentRamoId);const cat=r.categorias.find(c=>c.id===catId);
  const pauta=estadoPauta(r.categorias);
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Nueva nota — ${esc(cat.nombre)}</div>
    ${pauta.lista?'':`<div class="weight-setup-nudge"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18"/><path d="M3 8h18"/><path d="M4 8l2 10h12l2-10"/></svg><div><b>Tu pauta suma ${r2(pauta.total)}%.</b><br>Esta nota se guarda igual. Completa el resto cuando tengas la pauta.<br><button type="button" onclick="abrirPautaDesdeNota()">Editar pauta</button></div></div>`}
    <label class="modal-label">Nombre</label>
    <div class="modal-input"><input type="text" id="m-nota-name" placeholder="Ej: Prueba 1" maxlength="${NOMBRE_MAX}" autocomplete="off" aria-describedby="m-nota-error"/></div>
    <p id="m-nota-error" role="alert" hidden style="margin:-6px 0 10px;font-size:0.8125rem;color:var(--red);"></p>
    <label class="modal-label">Nota (1.0 – 7.0) <span style="text-transform:none;font-weight:500;color:var(--fg3);letter-spacing:0;">— déjala vacía si todavía no la rindes</span></label>
    <div class="modal-input"><input type="text" inputmode="decimal" id="m-nota-val" placeholder="Ej: 5.5"/></div>
    ${campoFechaHoraHTML('m-nota','',null,false)}
    <div class="toggle-row">
      <div><div class="toggle-label">Ponderación personalizada</div><div class="toggle-sub">Por defecto se promedia simple</div></div>
      <label class="toggle"><input type="checkbox" id="m-pond-toggle" onchange="togglePondSlider()"/><span class="toggle-slider"></span></label>
    </div>
    <div id="pond-slider-wrap" style="display:none;margin-top:12px;">
      <label class="modal-label">Peso de esta nota: <span id="m-nota-peso-val">40</span>%</label>
      <input type="range" min="1" max="100" value="40" id="m-nota-peso" oninput="document.getElementById('m-nota-peso-val').textContent=this.value"/>
      <div class="slider-desc">Las notas se ponderan por el porcentaje asignado</div>
    </div>
    <div class="modal-btns" style="margin-top:14px;">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" id="m-add-nota-btn" onclick="confirmAddNota('${catId}')">Agregar nota</button>
    </div>`;
  openModal();
  setTimeout(()=>document.getElementById('m-nota-name').focus(),100);
  function checkValid(){
    const v=parseNota(document.getElementById('m-nota-val').value);
    const btn=document.getElementById('m-add-nota-btn');
    if(btn)btn.textContent=isNaN(v)?'Anotar como pendiente':'Agregar nota';
  }
  document.getElementById('m-nota-name').addEventListener('input',()=>{if(addNotaError){addNotaError='';limpiarErrorCampo('m-nota-name','m-nota-error');}checkValid();});
  document.getElementById('m-nota-val').addEventListener('input',checkValid);
}
function togglePondSlider(){
  document.getElementById('pond-slider-wrap').style.display=document.getElementById('m-pond-toggle').checked?'block':'none';
}
function confirmAddNota(catId){
  const input=document.getElementById('m-nota-name');
  const name=(input&&input.value||'').trim();
  const val=parseNota(document.getElementById('m-nota-val').value);
  // La nota puede quedar pendiente: se registra qué viene y cuándo, y el valor
  // se agrega al rendirla. `gradesOf` y `avgPond` ya ignoran las que no tienen
  // valor, así que una pendiente no arrastra el promedio hacia abajo.
  if(!name){addNotaError='Escribe el nombre de la nota para agregarla.';mostrarErrorCampo('m-nota-name','m-nota-error',addNotaError);return false;}
  const fechaNota=(document.getElementById('m-nota-fecha')||{}).value||null;
  const usaPond=document.getElementById('m-pond-toggle').checked;
  const peso=usaPond?parseInt(document.getElementById('m-nota-peso').value)||40:1;
  const r=S.ramos.find(x=>x.id===currentRamoId);const cat=r.categorias.find(c=>c.id===catId);
  const horaNota=leerHora('m-nota');
  cat.notas.push({id:uid(),nombre:name,valor:isNaN(val)?null:val,peso,fecha:fechaNota,hora:horaNota,fechaOrigen:fechaNota?'usuario':null,horaOrigen:horaNota?'usuario':null});
  openCats[catId]=true;save();track('add_nota',{ponderada:usaPond,pendiente:isNaN(val)});closeModal();renderRamo();
  // Si trae fecha entra a la Agenda, que vive en otra pantalla.
  if(typeof renderAgenda==='function')renderAgenda();
  showToast(isNaN(val)?'Anotada para el '+fechaCorta(fechaNota||'')+' — agrega la nota cuando la rindas':lecturaDespuesDeNota(r));
}

// ─── MENÚ DE USUARIO ─────────────────────────────────────────────────────────
function userInitial(){
  const n=(S.userName||'').trim();
  if(n)return n[0].toUpperCase();
  const e=currentUser&&currentUser.email?currentUser.email.trim():'';
  return e?e[0].toUpperCase():'?';
}
function refreshAvatar(){
  const av=document.getElementById('user-avatar');
  if(av)av.textContent=userInitial();
}
function toggleUserMenu(ev){
  if(ev)ev.stopPropagation();
  const m=document.getElementById('user-menu');
  m.classList.contains('open')?closeUserMenu():openUserMenu();
}
function openUserMenu(){
  const m=document.getElementById('user-menu');
  const b=document.getElementById('user-menu-backdrop');
  const av=document.getElementById('user-avatar');
  // Contenido dinámico
  document.getElementById('um-name').textContent=S.userName||'Tu cuenta';
  const mail=document.getElementById('um-mail');
  mail.textContent=currentUser&&currentUser.email?currentUser.email:'Sesión local';
  // Archivar solo tiene sentido con ramos cargados
  const arch=document.getElementById('um-archivar');
  if(arch)arch.style.display=S.ramos.length?'flex':'none';
  // Sin sesión no hay nada que cerrar
  const out=document.getElementById('um-logout'),sep=document.getElementById('um-sep-logout');
  const hay=!!currentUser;
  if(out)out.style.display=hay?'flex':'none';
  if(sep)sep.style.display=hay?'block':'none';

  m.classList.add('open');b.classList.add('open');
  if(av)av.setAttribute('aria-expanded','true');

  // Posicionar bajo el avatar, alineado a su borde derecho y dentro del viewport
  if(av){
    const r=av.getBoundingClientRect();
    const w=m.offsetWidth||250;
    const vw=window.innerWidth||document.documentElement.clientWidth||375;
    let left=r.right-w;
    left=Math.max(10,Math.min(left,vw-w-10));
    m.style.left=left+'px';
    m.style.top=(r.bottom+8)+'px';
  }
}
function closeUserMenu(){
  document.getElementById('user-menu').classList.remove('open');
  document.getElementById('user-menu-backdrop').classList.remove('open');
  const av=document.getElementById('user-avatar');
  if(av)av.setAttribute('aria-expanded','false');
}
// Cierra el menú y ejecuta la acción (deja que corra la animación de cierre)
function umGo(fn){
  closeUserMenu();
  setTimeout(()=>{try{fn();}catch(e){}},60);
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.getElementById('user-menu').classList.contains('open'))closeUserMenu();
});

function openSettings(){
  const initialSection=arguments[0];
  let settingsSem=S.careerSemestre;
  let settingsCarrera=S.carrera;
  let settingsName=S.userName;
  let settingsNameError='';
  // Se declara acá arriba: los render*Grid() se llaman antes de las definiciones
  // de función y con `let` más abajo caería en la zona muerta temporal (TDZ).
  let settingsTenant=S.tenant||'fen';
  const directSection=['perfil','academico','calendario','apariencia','sugerencias','datos'].includes(initialSection)?initialSection:'';
  let activeSection=directSection||(window.matchMedia('(min-width:768px)').matches?'perfil':'');
  const icons={
    perfil:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.8-3.4 3.5-5.3 7.5-5.3s6.7 1.9 7.5 5.3"/></svg>',
    academico:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    calendario:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
    apariencia:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    sugerencias:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></svg>',
    datos:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/></svg>',
    arrow:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>'
  };
  const sections=[
    ['Tu cuenta','perfil','Perfil','Tu nombre en GradeHub'],
    ['Estudio','academico','Información académica','Universidad, carrera y semestre'],
    ['Estudio','calendario','Calendario','Apple, Google y Outlook'],
    ['Preferencias','apariencia','Apariencia','Cómo se ve la app'],
    ['Ayuda','sugerencias','Sugerencias y comentarios','Cuéntanos qué mejorar'],
    ['Datos','datos','Datos y cuenta','Respaldos y acciones de cuenta']
  ];

  function guardarBtn(){return '<button class="btn-primary settings-save" id="s-save-btn" onclick="saveSettings()">Guardar cambios</button>';}
  function panel(section){
    if(section==='perfil')return `
      <label class="modal-label">Nombre para mostrar</label>
      <div class="settings-name-field">
        <div class="modal-input"><input type="text" id="s-name" value="${esc(settingsName)}" maxlength="30" autocomplete="off" aria-describedby="s-name-hint s-name-error"/></div>
        <p id="s-name-error" role="alert" ${settingsNameError?'':'hidden'} style="margin:7px 0 0;font-size:0.75rem;line-height:1.4;color:var(--red);">${esc(settingsNameError)}</p>
        <p class="settings-name-hint" id="s-name-hint">Aparece en el saludo de inicio.</p>
      </div>
      ${guardarBtn()}`;
    if(section==='academico')return `
      <label class="modal-label">Universidad</label>
      <div id="s-tenant-grid" class="s-tenant-grid"></div>
      <p class="settings-help">Cambia tu catálogo disponible. Tus ramos y notas no se tocan.</p>
      <label class="modal-label">Carrera</label>
      <div id="s-carrera-grid" class="settings-carrera-grid"></div>
      <label class="modal-label">Semestre de carrera</label>
      <div class="sem-grid" id="s-sem-grid"></div>
      ${guardarBtn()}`;
    if(section==='calendario')return `
      <p class="settings-help settings-help-top">Suscribe tus evaluaciones a Google Calendar, Apple Calendar u Outlook. Se agrega una vez y después se actualiza sola: si cambias una fecha acá, se corrige allá.</p>
      ${currentUser?`
      <label class="modal-label">Tu URL de suscripción</label>
      <div class="modal-input"><input type="text" id="s-cal-url" readonly value="Generando…" onclick="this.select()"/></div>
      <div class="settings-data-actions">
        <button type="button" onclick="copiarFeedCalendario()">Copiar URL</button>
        <button type="button" onclick="revocarFeedCalendario()">Generar una nueva</button>
      </div>
      <p class="settings-help">En Google Calendar: <b>Otros calendarios · + · Desde URL</b>. Google la consulta cada 8 a 24 horas, así que un cambio de fecha no aparece al tiro.</p>
      <p class="settings-help">Quien tenga esta URL puede ver tus ramos, tus evaluaciones y sus fechas. <b>Tus notas no salen nunca.</b> Si se te escapa, genera una nueva y la anterior deja de servir al instante.</p>`
      :`<p class="settings-help">Necesitas iniciar sesión: el feed va atado a tu cuenta, no a este dispositivo.</p>`}
      <div style="height:1px;background:var(--border);margin:22px 0 16px;"></div>
      <label class="modal-label">Traer fechas desde un calendario</label>
      <p class="settings-help" style="margin-top:0;">Sube un archivo <b>.ics</b> exportado desde tu calendario. Revisas cada coincidencia antes de agregarla; nunca cambia tus ponderaciones ni fechas que ya ajustaste.</p>
      <div class="settings-data-actions" style="margin-bottom:0;">
        <button type="button" onclick="abrirImportarCalendario()">Importar archivo .ics</button>
      </div>`;
    if(section==='apariencia')return `
      <p class="settings-help settings-help-top">Elige cómo prefieres ver GradeHub. Se guarda al elegir.</p>
      <div class="modo-grid" id="s-modo-grid"></div>
      <label class="modal-label accent-picker-label">Color de acento</label>
      <div class="accent-grid" id="s-acento-grid" role="radiogroup" aria-label="Color de acento"></div>
      <label class="modal-label accent-picker-label">Fondo</label>
      <div class="fondo-grid" id="s-fondo-grid" role="radiogroup" aria-label="Fondo de la app"></div>`;
    if(section==='sugerencias'){
      const contacto=`<p class="feedback-contact">¿Prefieres escribirnos por correo? <a id="feedback-contact" href="${esc(correoSugerenciaHref())}" onclick="actualizarCorreoSugerencia()">gradehub.app@gmail.com</a></p>`;
      return currentUser?`
      <p class="settings-help settings-help-top">¿Algo no se entiende, está fallando o podría ser mejor? Lo leemos nosotros.</p>
      <label class="modal-label" for="s-feedback-type">Tipo de comentario</label>
      <select class="feedback-select" id="s-feedback-type" onchange="actualizarCorreoSugerencia()">
        <option value="sugerencia">Tengo una sugerencia</option>
        <option value="problema">Encontré un problema</option>
        <option value="otro">Otro comentario</option>
      </select>
      <label class="modal-label" for="s-feedback-message">Cuéntanos</label>
      <textarea class="feedback-message" id="s-feedback-message" maxlength="2000" rows="7" placeholder="Escribe acá lo que te gustaría cambiar…" aria-describedby="s-feedback-help s-feedback-count" oninput="actualizarSugerencia();actualizarCorreoSugerencia()"></textarea>
      <div class="feedback-meta"><span class="feedback-help pending" id="s-feedback-help" aria-live="polite">Mínimo 3 caracteres · queda asociado a tu cuenta.</span><span id="s-feedback-count">0 / 2000</span></div>
      <button class="btn-primary feedback-send" id="s-feedback-send" type="button" onclick="enviarSugerencia()">Enviar comentario</button>
      ${contacto}`
      :`<div class="feedback-empty"><b>Necesitas iniciar sesión</b><p>Así evitamos spam y podemos entender a qué cuenta corresponde el comentario.</p></div>${contacto}`;
    }
    return `
      <p class="settings-help settings-help-top">Guarda una copia antes de cambiar de dispositivo.</p>
      <div class="settings-data-actions">
        <button type="button" onclick="exportarDatos()">Exportar mis datos</button>
        <button type="button" onclick="abrirImportar()">Importar datos</button>
      </div>
      ${currentUser?`<div class="settings-reset-zone" style="margin-top:0;margin-bottom:12px;">
        <label class="modal-label" for="s-account-email">Correo de acceso</label>
        <div class="modal-input"><input type="email" id="s-account-email" value="${esc(currentUser.email||'')}" maxlength="60" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" aria-describedby="s-account-email-help s-account-email-status"/></div>
        <p class="settings-help" id="s-account-email-help" style="margin:7px 0 10px;">Cámbialo al tiro. Revisa que esté bien escrito: lo usarás para entrar y recuperar tu cuenta.</p>
        <p id="s-account-email-status" role="alert" aria-live="polite" hidden style="margin:0 0 10px;font-size:0.75rem;line-height:1.4;"></p>
        <button type="button" class="settings-reset-btn" id="s-account-email-save" onclick="cambiarCorreoCuenta()">Cambiar correo</button>
      </div>`:''}
      <div class="settings-danger-zone">
        <div class="settings-danger-label">Zona sensible</div>
        <button type="button" class="settings-danger-btn" onclick="confirmarEliminarCuenta()">Eliminar mi cuenta</button>
        <p>Borra tu cuenta y todas tus notas, en este dispositivo y en la nube. No se puede deshacer.</p>
      </div>
      ${currentUser?`<div class="settings-reset-zone"><button type="button" class="settings-reset-btn" onclick="confirmResetApp()">Reiniciar app</button><p>Borra los datos de este dispositivo y cierra sesión. Tus notas en la nube se conservan.</p></div>`:`<div class="settings-danger-zone settings-reset-danger-zone"><div class="settings-danger-label">Zona sensible</div><button type="button" class="settings-danger-btn" onclick="confirmResetApp()">Reiniciar app</button><p>Borra todos tus datos de este dispositivo. No se puede deshacer.</p></div>`}
      <p class="settings-privacy"><a href="/terminos.html" target="_blank" rel="noopener">Términos de uso</a> · <a href="/privacidad.html" target="_blank" rel="noopener">Política de privacidad</a></p>`;
  }
  function renderSettings(){
    const nav=sections.map(([group,id,title,detail],i)=>`${!i||sections[i-1][0]!==group?`<div class="settings-nav-group">${group}</div>`:''}<button type="button" class="settings-nav-item${id===activeSection?' active':''}" data-settings-section="${id}"><span class="settings-nav-icon">${icons[id]}</span><span><b>${title}</b><small>${detail}</small></span><span class="settings-nav-chevron">›</span></button>`).join('');
    const current=sections.find(x=>x[1]===activeSection);
    document.getElementById('modal-content').innerHTML=`
      <div class="modal-title settings-modal-title${activeSection?' settings-mobile-hidden':''}">Ajustes</div>
      <div class="settings-shell${activeSection?' settings-detail-open':''}">
        <aside class="settings-nav" aria-label="Secciones de Ajustes">${nav}</aside>
        <section class="settings-detail" ${activeSection?'':'aria-hidden="true"'}>
          ${activeSection?`<div class="settings-detail-heading"><button type="button" class="settings-back" aria-label="Volver a Ajustes">${icons.arrow}<span>Ajustes</span></button><div><h2>${current[2]}</h2><p>${current[3]}</p></div></div><div class="settings-detail-body">${panel(activeSection)}</div>`:''}
        </section>
      </div>`;
    document.querySelectorAll('[data-settings-section]').forEach(b=>b.onclick=()=>{activeSection=b.dataset.settingsSection;renderSettings();});
    const back=document.querySelector('.settings-back');if(back)back.onclick=()=>{activeSection='';renderSettings();};
    if(activeSection==='academico'){renderSettingsSemGrid();renderSettingsTenantGrid();renderSettingsCarreraGrid();}
    if(activeSection==='apariencia'){renderModoGrid();renderAcentoGrid();renderFondoGrid();}
    if(activeSection==='calendario'&&currentUser)pintarFeedCalendario();
    if(activeSection==='perfil'){
      const inp=document.getElementById('s-name');
      if(inp){
        inp.addEventListener('input',()=>{settingsName=inp.value;if(settingsNameError){settingsNameError='';limpiarErrorCampo('s-name','s-name-error');}checkSave();});
        inp.addEventListener('keydown',e=>{if(e.key==='Enter')window.saveSettings();});
        setTimeout(()=>{inp.focus();inp.select();},100);
      }
    }
  }
  renderSettings();
  openModal();

  function checkSave(){
    const btn=document.getElementById('s-save-btn');
    // El nombre se valida al guardar para poder explicar qué falta. Dejar el
    // botón apagado convertía Enter y el toque en una acción que no respondía.
    if(btn){btn.disabled=false;btn.removeAttribute('aria-disabled');}
  }
  function renderModoGrid(){
    const g=document.getElementById('s-modo-grid');if(!g)return;g.innerHTML='';
    // 'sistema' primero: es el default y lo que la mayoría quiere.
    [['sistema','Sistema','Se adapta a cómo lo tienes configurado'],['claro','Claro',''],['oscuro','Oscuro','']]
      .forEach(([val,nom,sub])=>{
        const b=document.createElement('button');
        b.type='button';
        b.className='modo-opt'+(modoColor()===val?' sel':'');
        b.innerHTML=`<span class="modo-opt-name">${esc(nom)}</span>${sub?`<span class="modo-opt-sub">${esc(sub)}</span>`:''}`;
        b.onclick=()=>setModo(val);
        g.appendChild(b);
      });
  }
  window.renderModoGrid=renderModoGrid;
  function renderAcentoGrid(){
    const g=document.getElementById('s-acento-grid');if(!g)return;g.innerHTML='';
    Object.entries(ACENTOS).forEach(([key,cfg])=>{
      const b=document.createElement('button');
      b.type='button';b.className='accent-opt'+(S.acento===key?' sel':'');
      b.setAttribute('role','radio');b.setAttribute('aria-checked',S.acento===key?'true':'false');
      b.setAttribute('aria-label',cfg.nombre);
      b.innerHTML=`<span class="accent-swatch" style="--swatch-light:${esc(cfg.primary)};--swatch-dark:${esc(cfg.darkPrimary)}"></span><span>${esc(cfg.nombre)}</span>`;
      b.onclick=()=>setAcento(key);g.appendChild(b);
    });
  }
  window.renderAcentoGrid=renderAcentoGrid;
  function renderFondoGrid(){
    const g=document.getElementById('s-fondo-grid');if(!g)return;g.innerHTML='';
    Object.entries(FONDOS).forEach(([key,cfg])=>{
      const b=document.createElement('button');
      b.type='button';b.className='fondo-opt'+(S.fondo===key?' sel':'');
      b.setAttribute('role','radio');b.setAttribute('aria-checked',S.fondo===key?'true':'false');
      b.setAttribute('aria-label',cfg.nombre);
      b.innerHTML=`<span class="fondo-swatch" style="--swatch-light:${esc(cfg.claro.bg)};--swatch-dark:${esc(cfg.oscuro.bg)}"></span><span>${esc(cfg.nombre)}</span>`;
      b.onclick=()=>setFondo(key);g.appendChild(b);
    });
  }
  window.renderFondoGrid=renderFondoGrid;
  function renderSettingsSemGrid(){
    const g=document.getElementById('s-sem-grid');if(!g)return;g.innerHTML='';
    for(let i=1;i<=11;i++){
      const b=document.createElement('button');b.className='sem-btn'+(i===settingsSem?' sel':'');
      b.textContent=i+'°';b.onclick=()=>{settingsSem=i;renderSettingsSemGrid();};g.appendChild(b);
    }
  }
  // Universidad: cambia el tema al instante (preview) y recarga las carreras.
  // Solo se persiste al tocar "Guardar cambios".
  function renderSettingsTenantGrid(){
    const g=document.getElementById('s-tenant-grid');if(!g)return;g.innerHTML='';
    tenantsVisibles(settingsTenant).forEach(([code,cfg])=>{
      const b=document.createElement('button');
      b.className='s-tenant-btn'+(code===settingsTenant?' sel':'');
      b.innerHTML=`<span class="s-tenant-name">${esc(cfg.short)}</span>`;
      b.title=cfg.name;
      b.onclick=()=>{
        settingsTenant=code;
        // La carrera elegida puede no existir en la universidad nueva
        if(!carrerasFor(code)[settingsCarrera])settingsCarrera=null;
        renderSettingsTenantGrid();renderSettingsCarreraGrid();
      };
      g.appendChild(b);
    });
  }
  function renderSettingsCarreraGrid(){
    const g=document.getElementById('s-carrera-grid');if(!g)return;g.innerHTML='';
    Object.entries(carrerasFor(settingsTenant)).forEach(([code,label])=>{
      const b=document.createElement('button');b.className='carrera-opt'+(code===settingsCarrera?' sel':'');
      b.textContent=label;b.onclick=()=>{settingsCarrera=code;renderSettingsCarreraGrid();};g.appendChild(b);
    });
  }
  setTimeout(()=>{
    const inp=document.getElementById('s-name');
    if(inp){
      inp.addEventListener('input',checkSave);
      inp.addEventListener('keydown',e=>{if(e.key==='Enter')window.saveSettings();});
    }
  },120);
  window.saveSettings=function(){
    const name=settingsName.trim();
    if(!name){
      settingsNameError='Escribe tu nombre para guardar los cambios.';
      mostrarErrorCampo('s-name','s-name-error',settingsNameError);
      return false;
    }
    const cambioUni=settingsTenant!==S.tenant;
    S.userName=name;S.careerSemestre=settingsSem;S.carrera=settingsCarrera;S.tenant=settingsTenant;
    selectedTenant=settingsTenant;
    applyTheme();
    save();syncProfile();track('settings_saved',{cambio_universidad:cambioUni});
    closeModal();renderHome();renderStats();renderAgenda();
    showToast('Cambios guardados');
  };
}

// El correo es una alternativa al formulario, no una segunda cuenta opaca: el
// borrador lleva contexto que la persona reconoce y que nos ayuda a ubicarla.
// No van correo, UID, ramos ni notas: el remitente ya llega en el mail y los
// otros datos serían innecesarios o incómodos si la persona lo reenvía.
function correoSugerenciaHref(categoria='sugerencia',mensaje=''){
  const tipos={sugerencia:'Sugerencia',problema:'Problema',otro:'Comentario'};
  const tipo=tipos[categoria]||tipos.otro;
  const universidad=(TENANTS[S.tenant]||{}).name||'No indicada';
  const carrera=S.carreraNombre||S.carrera||'No indicada';
  const perfil=[
    `Nombre para mostrar: ${S.userName||'No indicado'}`,
    `Universidad: ${universidad}`,
    `Carrera: ${carrera}`,
    `Semestre: ${S.careerSemestre||'No indicado'}°`,
  ];
  const detalle=String(mensaje||'').trim();
  const cuerpo=['Hola, GradeHub:','',`Tipo: ${tipo}`,'',...perfil,'','Detalle:',detalle||''].join('\n');
  return `mailto:gradehub.app@gmail.com?subject=${encodeURIComponent(`GradeHub · ${tipo}`)}&body=${encodeURIComponent(cuerpo)}`;
}
function actualizarCorreoSugerencia(){
  const selector=document.getElementById('s-feedback-type');
  const campo=document.getElementById('s-feedback-message');
  const enlace=document.getElementById('feedback-contact');
  if(enlace)enlace.href=correoSugerenciaHref(selector?selector.value:'sugerencia',campo?campo.value:'');
}
function actualizarSugerencia(){
  const campo=document.getElementById('s-feedback-message');
  const cuenta=document.getElementById('s-feedback-count');
  const ayuda=document.getElementById('s-feedback-help');
  if(!campo)return;
  if(cuenta)cuenta.textContent=`${campo.value.length} / 2000`;
  const faltan=Math.max(0,3-campo.value.trim().length);
  if(ayuda){
    ayuda.textContent=faltan
      ?`Mínimo 3 caracteres · te ${faltan===1?'falta 1 carácter':'faltan '+faltan+' caracteres'} para enviarlo.`
      :'Queda asociado a tu cuenta para poder ayudarte.';
    ayuda.classList.toggle('pending',faltan>0);
  }
  if(!faltan)campo.removeAttribute('aria-invalid');
}
async function enviarSugerencia(){
  if(!supabaseClient||!currentUser){showToast('Necesitas iniciar sesión para enviar',true);return;}
  const campo=document.getElementById('s-feedback-message');
  const selector=document.getElementById('s-feedback-type');
  const boton=document.getElementById('s-feedback-send');
  const mensaje=campo?campo.value.trim():'';
  const categoria=selector&&['sugerencia','problema','otro'].includes(selector.value)?selector.value:'otro';
  if(!(mensaje.length>=3)){
    if(campo){campo.setAttribute('aria-invalid','true');actualizarSugerencia();campo.focus();}
    showToast('Escribe al menos 3 caracteres',true);return;
  }
  if(boton){boton.disabled=true;boton.textContent='Enviando…';}
  try{
    const {error}=await supabaseClient.from('user_feedback').insert({user_id:currentUser.id,categoria,mensaje});
    if(error)throw error;
    track('submit_feedback',{categoria});
    if(campo)campo.value='';
    actualizarSugerencia();
    showToast('Gracias · recibimos tu comentario');
  }catch(e){
    console.warn('No se pudo enviar el comentario:',e);
    showToast('No pudimos enviarlo. Intenta de nuevo.',true);
  }finally{
    if(boton){boton.disabled=false;boton.textContent='Enviar comentario';actualizarSugerencia();}
  }
}

// ─── HISTORIAL EDITABLE ──────────────────────────────────────────────────────
// El promedio de un ramo archivado se puede corregir a mano (avgOverride) sin
// tocar sus evaluaciones. Sirve cuando un profe cambia una nota después del cierre.
function histRamoAvg(r){
  if(r&&typeof r.avgOverride==='number')return r.avgOverride;
  return ramoAvg(r);
}
// Recalcula el promedio del semestre archivado respetando overrides y créditos
function recomputeHistGpa(h){
  const conNota=(h.ramos||[]).filter(r=>histRamoAvg(r)!==null);
  if(conNota.length===0){h.gpa=null;return;}
  const simple=()=>conNota.reduce((s,r)=>s+histRamoAvg(r),0)/conNota.length;
  if(conNota.every(tieneCreditos)){
    let num=0,den=0;
    conNota.forEach(r=>{num+=histRamoAvg(r)*r.creditos;den+=r.creditos;});
    h.gpa=den>0?num/den:simple();
  }else{
    h.gpa=simple();
  }
}

function openEditHistRamoModal(histId,ramoId){
  const h=S.historial.find(x=>x.id===histId);if(!h)return;
  const r=(h.ramos||[]).find(x=>x.id===ramoId);if(!r)return;
  const actual=histRamoAvg(r);
  const calculado=ramoAvg(r);
  const esOverride=typeof r.avgOverride==='number';
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">${esc(r.nombre)}</div>
    <p style="font-size:0.8125rem;color:var(--fg2);line-height:1.5;margin-bottom:16px;">
      Corrige el promedio final de este ramo en <b>${esc(h.label)}</b>. No se tocan sus evaluaciones.
    </p>
    <label class="modal-label">Promedio final (1.0 – 7.0)</label>
    <div class="modal-input"><input type="text" inputmode="decimal" id="m-hist-avg" value="${actual!==null?nf(actual):''}" placeholder="Ej: 5.4" maxlength="4"/></div>
    ${calculado!==null?`<p style="font-size:0.75rem;color:var(--fg3);margin:-6px 0 14px;">Calculado desde sus evaluaciones: <b>${fmt(calculado)}</b></p>`:''}
    <div id="m-hist-err" style="display:none;font-size:0.75rem;color:var(--red);margin:-6px 0 12px;"></div>
    <div class="modal-btns">
      ${esOverride?`<button class="btn-cancel" onclick="resetHistRamoAvg('${esc(histId)}','${esc(ramoId)}')">Restaurar</button>`:`<button class="btn-cancel" onclick="closeModal()">Cancelar</button>`}
      <button class="btn-confirm" onclick="confirmEditHistRamo('${esc(histId)}','${esc(ramoId)}')">Guardar</button>
    </div>`;
  openModal();
  setTimeout(()=>{const i=document.getElementById('m-hist-avg');if(i){i.focus();i.select();}},100);
  document.getElementById('m-hist-avg').addEventListener('keydown',e=>{if(e.key==='Enter')confirmEditHistRamo(histId,ramoId);});
}

function confirmEditHistRamo(histId,ramoId){
  const v=parseNota(document.getElementById('m-hist-avg').value);
  const err=document.getElementById('m-hist-err');
  if(isNaN(v)){
    if(err){err.textContent='Escribe una nota entre 1.0 y 7.0.';err.style.display='block';}
    return;
  }
  const h=S.historial.find(x=>x.id===histId);if(!h)return;
  const r=(h.ramos||[]).find(x=>x.id===ramoId);if(!r)return;
  r.avgOverride=v;
  recomputeHistGpa(h);
  save();track('edit_hist_ramo');closeModal();renderStats();
  showToast('Promedio actualizado');
}

function resetHistRamoAvg(histId,ramoId){
  const h=S.historial.find(x=>x.id===histId);if(!h)return;
  const r=(h.ramos||[]).find(x=>x.id===ramoId);if(!r)return;
  delete r.avgOverride;
  recomputeHistGpa(h);
  save();closeModal();renderStats();
  showToast('Se restauró el promedio calculado');
}

function confirmArchiveSemester(){
  const label=semester();
  const nr=S.ramos.length;
  const nn=S.ramos.reduce((a,r)=>a+r.categorias.reduce((b,c)=>b+c.notas.length,0),0);
  showConfirm(
    `Archivar ${label}`,
    `Se guardarán ${nr} ramo${nr!==1?'s':''} con ${nn} nota${nn!==1?'s':''} en el historial. El semestre actual quedará vacío para empezar de nuevo.`,
    ()=>{
      S.historial.unshift({
        id:uid(),label,archivedAt:Date.now(),
        careerSemestre:S.careerSemestre,
        gpa:gpa(S.ramos),
        ramos:JSON.parse(JSON.stringify(S.ramos))
      });
      S.ramos=[];save();track('archive_semester',{label});closeModal();renderHome();
    },
    {label:'Archivar',danger:false}
  );
}
// ─── EXPORTAR / IMPORTAR ─────────────────────────────────────────────────────
function exportarDatos(){
  const json=localStorage.getItem(STORAGE_KEY);
  if(!json){showToast('No hay datos para exportar');return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(json)
      .then(()=>showToast('✓ Datos copiados al portapapeles'))
      .catch(()=>_mostrarJsonManual(json));
  } else {
    _mostrarJsonManual(json);
  }
}
function _mostrarJsonManual(json){
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Exportar datos</div>
    <p style="font-size:0.8125rem;color:var(--fg2);margin-bottom:10px;">Copia todo este texto y pégalo al importar en el otro dispositivo.</p>
    <textarea id="export-text" readonly style="width:100%;height:120px;padding:10px;border:1.5px solid var(--border);border-radius:10px;font-size:0.6875rem;font-family:monospace;resize:none;background:var(--muted);color:var(--fg);">${esc(json)}</textarea>
    <div class="modal-btns" style="margin-top:12px;">
      <button class="btn-cancel" onclick="closeModal()">Cerrar</button>
      <button class="btn-confirm" onclick="document.getElementById('export-text').select();document.execCommand('copy');showToast('✓ Copiado');">Copiar</button>
    </div>`;
  openModal();
  setTimeout(()=>{const t=document.getElementById('export-text');if(t){t.focus();t.select();}},100);
}
function abrirImportar(){
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Importar datos</div>
    <p style="font-size:0.8125rem;color:var(--fg2);margin-bottom:10px;">Pega aquí el texto que exportaste desde el otro dispositivo. <b>Esto reemplazará tus datos actuales.</b></p>
    <textarea id="import-text" placeholder="Pega aquí tu código de exportación..." style="width:100%;height:120px;padding:10px;border:1.5px solid var(--border);border-radius:10px;font-size:0.6875rem;font-family:monospace;resize:none;background:var(--muted);color:var(--fg);"></textarea>
    <div class="modal-btns" style="margin-top:12px;">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" onclick="confirmarImportar()">Importar</button>
    </div>
    ${hayRespaldoPreImport()?`<p style="text-align:center;margin:14px 0 0;font-size:0.78125rem;">
      <button onclick="deshacerImport()" style="border:none;background:none;padding:0;cursor:pointer;font-family:'Onest',sans-serif;font-size:0.78125rem;font-weight:700;color:var(--primary);">Deshacer la última importación</button></p>`:''}`;
  openModal();
  setTimeout(()=>document.getElementById('import-text').focus(),100);
}
// Clave del respaldo automático previo a un import. Existe porque importar es
// la única acción de la app que destruye datos sin posible deshacer: reemplaza
// el estado local Y lo sube a la nube, así que también se lleva el respaldo.
const PRE_IMPORT_KEY='gradehub_v1_pre_import';

// Un export válido SIEMPRE trae la lista de ramos, aunque esté vacía. Exigirla
// es lo que distingue un export real de cualquier JSON que ande dando vueltas.
// Sin esto, pegar {"userName":"Ana"} borraba todos los ramos y la app decía
// "importado correctamente".
function esExportValido(o){
  return !!o && typeof o==='object' && !Array.isArray(o) && Array.isArray(o.ramos);
}
function contarNotas(ramos){
  return (ramos||[]).reduce((a,r)=>a+(r.categorias||[]).reduce((b,c)=>b+((c.notas||[]).length),0),0);
}

function confirmarImportar(){
  const text=(document.getElementById('import-text').value||'').trim();
  if(!text){showToast('Pega los datos primero',true);return;}

  let parsed;
  try{ parsed=JSON.parse(text); }
  catch(e){ showToast('Ese texto no es un respaldo de GradeHub',true); return; }

  if(!esExportValido(parsed)){
    showToast('Ese texto no es un respaldo de GradeHub',true);
    return;
  }

  const data=normalize(parsed);
  const actualR=S.ramos?S.ramos.length:0, actualN=contarNotas(S.ramos);
  const nuevoR=data.ramos.length, nuevoN=contarNotas(data.ramos);

  // Decir qué se pierde ANTES, con números. "Esto reemplazará tus datos" no
  // dimensiona nada; "vas a perder 3 ramos con 12 notas" sí.
  const detalle=actualR
    ? `Vas a reemplazar tus ${actualR} ramo${actualR!==1?'s':''} (${actualN} nota${actualN!==1?'s':''}) por ${nuevoR} ramo${nuevoR!==1?'s':''} (${nuevoN} nota${nuevoN!==1?'s':''}).\n\nGuardamos una copia de lo actual por si te arrepientes.`
    : `Se cargarán ${nuevoR} ramo${nuevoR!==1?'s':''} con ${nuevoN} nota${nuevoN!==1?'s':''}.`;

  showConfirm('Importar datos',detalle,()=>{
    // Respaldo antes de tocar nada. Si el import resulta ser el archivo
    // equivocado, esto es lo único que queda.
    try{ if(actualR) localStorage.setItem(PRE_IMPORT_KEY,JSON.stringify(S)); }catch(e){}
    S={...S,...data};
    save();track('import_data',{ramos:nuevoR});
    closeModal();
    showToast('✓ Datos importados');
    setTimeout(()=>location.reload(),1200);
  },{label:'Importar'});
}

// Deshacer el último import. La copia vive solo en este dispositivo.
function hayRespaldoPreImport(){
  try{ return !!localStorage.getItem(PRE_IMPORT_KEY); }catch(e){ return false; }
}
function deshacerImport(){
  let prev;
  try{ prev=JSON.parse(localStorage.getItem(PRE_IMPORT_KEY)||'null'); }catch(e){ prev=null; }
  if(!esExportValido(prev)){ showToast('No hay copia para restaurar',true); return; }
  const r=prev.ramos.length, n=contarNotas(prev.ramos);
  showConfirm('Deshacer importación',
    `Se restauran tus ${r} ramo${r!==1?'s':''} (${n} nota${n!==1?'s':''}) de antes de importar.`,()=>{
      S={...S,...normalize(prev)};
      try{ localStorage.removeItem(PRE_IMPORT_KEY); }catch(e){}
      save();track('undo_import');
      closeModal();
      showToast('✓ Datos restaurados');
      setTimeout(()=>location.reload(),1200);
    },{label:'Restaurar'});
}

// Eliminar la cuenta. Lo hace una función SECURITY DEFINER en la base
// (eliminar_mi_cuenta), no el cliente: borrar un usuario requiere privilegios
// que la sb_publishable_* no tiene y que no pueden vivir en el navegador.
//
// La función no recibe parámetros: usa auth.uid() del token de sesión, así que
// nadie puede borrar la cuenta de otro. Las tres tablas están en CASCADE, así
// que al irse el usuario se van sus notas, su perfil y sus reportes — la
// política de privacidad promete que no quedan copias y esto lo cumple.
//
// Tres confirmaciones a propósito: es la única acción de la app que destruye
// datos en el dispositivo Y en la nube a la vez. Reiniciar app, en comparación,
// conserva la nube.
function confirmarEliminarCuenta(){
  if(!currentUser){showToast('Primero inicia sesión',true);return;}
  const nRamos=(S.ramos||[]).length;
  const nNotas=contarNotas(S.ramos);
  const detalle=nRamos
    ? `Se borran tus ${nRamos} ramo${nRamos!==1?'s':''} con ${nNotas} nota${nNotas!==1?'s':''}, tu perfil y tu cuenta. En este dispositivo y en la nube.`
    : 'Se borra tu cuenta y todo lo asociado, en este dispositivo y en la nube.';
  showConfirm('Eliminar tu cuenta',detalle+'\n\nEsto no se puede deshacer.',()=>{
    // Segunda confirmación: la primera se aprieta sin leer.
    showConfirm('¿Seguro?','No hay forma de recuperar tus notas después de esto.\n\nSi solo quieres empezar de nuevo en este dispositivo, usa «Reiniciar app»: eso conserva tus notas en la nube.',()=>{
      // Esta última no repite el mismo gesto: vuelve a mostrar lo que se pierde,
      // deja Cancelar bajo el foco y mueve la acción destructiva a la izquierda.
      const impacto=nRamos
        ? `Vas a borrar ${nRamos} ramo${nRamos!==1?'s':''} y ${nNotas} nota${nNotas!==1?'s':''}, además de tu perfil y tu cuenta.`
        : 'Vas a borrar tu perfil y tu cuenta.';
      showConfirm('Última confirmación',impacto+'\n\nSe eliminarán de este dispositivo y de la nube. No se puede deshacer.',eliminarCuenta,{label:'Eliminar definitivamente',actionFirst:true,focusCancel:true});
    },{label:'Sí, eliminar mi cuenta'});
  },{label:'Continuar'});
}

async function eliminarCuenta(){
  if(!supabaseClient||!currentUser){showToast('Primero inicia sesión',true);return;}
  showToast('Eliminando tu cuenta…');
  try{
    const {error}=await supabaseClient.rpc('eliminar_mi_cuenta');
    if(error)throw error;
    track('delete_account');
    // Recién acá se limpia lo local: si el borrado en la nube falló, el
    // estudiante conserva sus notas en el dispositivo y puede reintentar.
    try{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(CACHE_OWNER_KEY);localStorage.removeItem(PRE_IMPORT_KEY);}catch(e){}
    try{await supabaseClient.auth.signOut();}catch(e){}
    showToast('Tu cuenta fue eliminada');
    setTimeout(()=>location.reload(),1400);
  }catch(e){
    console.warn('eliminarCuenta:',e);
    showToast('No pudimos eliminar tu cuenta. Escríbenos a gradehub.app@gmail.com',true);
  }
}

function confirmResetApp(){
  const conCuenta=!!currentUser;
  const desc=conCuenta
    ? 'Se borrarán los datos de este dispositivo y cerrarás sesión. Tus notas en la nube se conservan y vuelven al iniciar sesión.'
    : 'Se borrarán todos tus datos y volverás al inicio. Esta acción no se puede deshacer.';
  showConfirm('Reiniciar app',desc,async()=>{
    track('app_reset');
    localStorage.removeItem(STORAGE_KEY);
    if(conCuenta){try{await supabaseClient.auth.signOut();}catch(e){}}
    location.reload();
  },{label:'Reiniciar'});
}

// La vuelta la maneja un resorte, no una transición de duración fija: arranca
// del valor que hay en pantalla y hereda la velocidad del dedo, así no se nota
// la costura entre arrastrar y soltar. Amortiguación .8 y respuesta .3s son los
// valores de un drawer; el rebote leve se justifica porque atrás hubo un gesto
// con impulso.
let _sheetRaf=null,_sheetFin=null;
function sheetResorte(sheet,desde,velocidad){
  const ov=document.getElementById('modal');
  const w=2*Math.PI/0.3,z=0.8;
  let x=desde,v=velocidad,ultimo=performance.now();
  ov.classList.add('settling');
  const terminar=()=>{
    cancelAnimationFrame(_sheetRaf);_sheetFin=null;
    sheet.style.transform='';
    ov.classList.remove('settling');
  };
  _sheetFin=terminar;
  const paso=ahora=>{
    const dt=Math.min((ahora-ultimo)/1000,1/30);ultimo=ahora;
    v+=(-w*w*x-2*z*w*v)*dt;x+=v*dt;
    if(Math.abs(x)<0.5&&Math.abs(v)<20){terminar();return;}
    sheet.style.transform=`translateY(${x}px)`;
    _sheetRaf=requestAnimationFrame(paso);
  };
  _sheetRaf=requestAnimationFrame(paso);
}
// Con la pestaña escondida requestAnimationFrame se detiene y el sheet quedaría
// congelado a media altura hasta que el estudiante vuelva.
document.addEventListener('visibilitychange',()=>{if(document.hidden&&_sheetFin)_sheetFin();});

// Pasado el borde superior no hay a dónde ir. Frenar en seco se lee como "se
// colgó"; ceder cada vez menos se lee como "hasta acá llega".
function sheetGoma(exceso,alto){return (exceso*alto*0.55)/(alto+0.55*Math.abs(exceso));}

// Velocidad de los últimos ~100ms: lo que importa es cómo venía el dedo al
// soltar, no cómo empezó. Dos guardas — una ventana casi de cero divide por nada
// y manda el resorte fuera de pantalla, y ningún dedo pasa de unos 4000 px/s.
function sheetVelocidad(historia){
  const n=historia.length;
  if(n<2)return 0;
  const fin=historia[n-1];
  let ini=historia[n-2];
  for(let i=n-2;i>=0;i--){if(fin.t-historia[i].t>100)break;ini=historia[i];}
  const dt=(fin.t-ini.t)/1000;
  if(dt<0.008)return 0;
  return Math.max(-4000,Math.min(4000,(fin.y-ini.y)/dt));
}

// Pointer Events en vez de touch: el mismo código sirve para dedo, mouse y
// trackpad —en el escritorio el tirador no hacía nada—, y el capture mantiene
// el seguimiento aunque el puntero se salga del sheet.
// Tres cosas que un modal necesita y que no se ven mirando la pantalla:
//
//   1. Anunciarse por su nombre. La hoja decía aria-label="Ventana", así que un
//      lector de pantalla leía "Ventana, diálogo" en lugar de "Nueva
//      evaluación". El título ya está escrito en el modal; basta apuntarle.
//   2. Devolver el foco al cerrar. Quedaba dentro del modal cerrado, o sea en
//      un elemento invisible: quien navega con teclado tenía que volver a
//      recorrer la página para seguir donde estaba.
//   3. Asociar cada etiqueta con su campo. Se hace acá y no en las 33
//      plantillas: son todas el mismo patrón —una `.modal-label` seguida del
//      campo— y arreglarlo una vez cubre los modales que se escriban después.
function etiquetarCamposDelModal(raiz){
  if(!raiz||typeof raiz.querySelectorAll!=='function')return;
  raiz.querySelectorAll('label.modal-label:not([for])').forEach(lab=>{
    // Una etiqueta que ya envuelve su campo está asociada por anidamiento. Sin
    // esta guarda, la del checkbox "Son varias notas" se llevaba un `for` al
    // campo de FECHA que venía después: peor que no etiquetar, porque el lector
    // anuncia el campo equivocado con toda seguridad.
    if(lab.querySelector('input,select,textarea'))return;
    let el=lab.nextElementSibling,campo=null;
    while(el&&!campo){campo=el.matches&&el.matches('input,select,textarea')?el:el.querySelector&&el.querySelector('input,select,textarea');el=el.nextElementSibling;}
    if(!campo)return;
    if(!campo.id)campo.id='campo-'+Math.random().toString(36).slice(2,9);
    lab.setAttribute('for',campo.id);
  });
}
let _quienAbrioModal=null;

function openModal(){
  const ov=document.getElementById('modal');
  _quienAbrioModal=document.activeElement;
  ov.classList.add('open');
  const sheet=document.querySelector('.modal-sheet');
  const contenido=document.getElementById('modal-content');
  const titulo=contenido&&typeof contenido.querySelector==='function'?contenido.querySelector('.modal-title'):null;
  if(sheet&&typeof sheet.setAttribute==='function'){
    if(titulo){
      if(!titulo.id)titulo.id='modal-titulo';
      sheet.setAttribute('aria-labelledby',titulo.id);
      sheet.removeAttribute('aria-label');
    }else{
      sheet.removeAttribute('aria-labelledby');
      sheet.setAttribute('aria-label','Ventana');
    }
  }
  etiquetarCamposDelModal(contenido);
  sheet.scrollTop=0;
  cancelAnimationFrame(_sheetRaf);ov.classList.remove('settling');
  let startY=0,curY=0,startT=0,dragging=false,historia=[];
  sheet.onpointerdown=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    // Sobre un control el gesto es del control, no del sheet.
    if(e.target.closest('input,textarea,select,button,a,[contenteditable]'))return;
    cancelAnimationFrame(_sheetRaf);ov.classList.remove('settling');
    startY=e.clientY;curY=startY;startT=Date.now();dragging=sheet.scrollTop<=0;
    historia=[{y:e.clientY,t:performance.now()}];
    if(dragging){ov.classList.add('dragging');try{sheet.setPointerCapture(e.pointerId);}catch(_){}}
  };
  sheet.onpointermove=e=>{
    curY=e.clientY;
    if(!dragging)return;
    historia.push({y:e.clientY,t:performance.now()});
    if(historia.length>6)historia.shift();
    const dy=curY-startY;
    sheet.style.transform=`translateY(${dy>=0?dy:-sheetGoma(-dy,sheet.offsetHeight)}px)`;
  };
  const soltar=e=>{
    if(!dragging)return;dragging=false;
    ov.classList.remove('dragging');
    try{sheet.releasePointerCapture(e.pointerId);}catch(_){}
    const dy=curY-startY, ms=Math.max(1,Date.now()-startT);
    // Cierra por VELOCIDAD o por distancia, no solo por distancia. Antes exigía
    // 90px fijos: un flick rápido y corto —que es como se cierra un sheet en
    // serio— rebotaba en vez de cerrar. 0.11 px/ms es el umbral del playbook.
    if(dy/ms>0.11||dy>110)closeModal();
    else sheetResorte(sheet,dy>=0?dy:-sheetGoma(-dy,sheet.offsetHeight),sheetVelocidad(historia));
  };
  sheet.onpointerup=soltar;
  sheet.onpointercancel=soltar;
}
// El cierre no necesita JavaScript: `transition-behavior:allow-discrete` en el
// overlay hace que `display:none` se aplique AL FINAL de la transición, así que
// quitar `.open` basta para que el sheet baje y recién ahí desaparezca.
// La versión anterior de este arreglo llevaba una clase `.cerrando` y un
// `transitionend`; sobraba entera.
function closeModal(){
  const sheet=document.querySelector('.modal-sheet');
  cancelAnimationFrame(_sheetRaf);_sheetFin=null;
  document.getElementById('modal').classList.remove('settling','dragging');
  sheet.style.transform='';   // suelta lo que dejó el arrastre
  document.getElementById('modal').classList.remove('open');
  // El foco vuelve a quien abrió, salvo que ese elemento ya no exista (un
  // botón de una lista que se volvió a dibujar). Ahí se deja como está: mandarlo
  // al body a la fuerza es peor que dejarlo quieto.
  const volver=_quienAbrioModal;_quienAbrioModal=null;
  if(volver&&volver.isConnected&&typeof volver.focus==='function'&&volver!==document.body){
    try{volver.focus({preventScroll:true});}catch(e){volver.focus();}
  }
}
function closeModalOutside(e){if(e.target===document.getElementById('modal'))closeModal();}
// Cerrar con tecla Escape (confirmación tiene prioridad sobre el modal)
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(document.getElementById('confirm-overlay').classList.contains('open'))closeConfirm();
  else if(document.getElementById('modal').classList.contains('open'))closeModal();
});

let _confirmFn=null;
function showConfirm(title,desc,fn,opts){
  opts=opts||{};
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-desc').textContent=desc;
  _confirmFn=fn;
  const btn=document.getElementById('confirm-action');
  btn.textContent=opts.label||'Eliminar';
  btn.className=opts.danger===false?'btn-prim-sm':'btn-danger';
  btn.onclick=()=>{
    const confirmar=_confirmFn;
    closeConfirm();
    if(confirmar)confirmar();
  };
  const btns=btn.parentElement;
  btns.style.flexDirection=opts.actionFirst?'row-reverse':'row';
  document.getElementById('confirm-overlay').classList.add('open');
  setTimeout(()=>{
    const cancelar=btns.querySelector('.btn-cancel-sm');
    (opts.focusCancel&&cancelar?cancelar:btn).focus();
  },50);
}
function closeConfirm(){document.getElementById('confirm-overlay').classList.remove('open');}

// Cobertura real del semestre: contar notas no dice cuánto del ramo ya está
// decidido. Esta métrica usa las ponderaciones de las evaluaciones rendidas.
function avanceEvaluaciones(ramos){
  let total=0,evaluado=0;
  (ramos||[]).forEach(r=>{
    // El resumen del semestre usa exactamente el mismo criterio que Home.
    // Una categoría con seis casillas y una nota solo aporta una sexta parte
    // de su peso; si se contara completa, la barra afirmaría que el semestre
    // avanzó más de lo que realmente se ha evaluado.
    const progreso=ramoProgress(r);
    total+=progreso.total;
    evaluado+=progreso.total-progreso.pending;
  });
  return {total,evaluado,pct:total>0?Math.round(evaluado/total*100):0};
}
// confirmArchiveSemester agrega lo más reciente al inicio; nunca usar el último
// elemento del array para comparar el semestre actual.
function gpaHistorial(h){
  if(!h||typeof h!=='object')return null;
  if(typeof h.gpa==='number'&&Number.isFinite(h.gpa))return h.gpa;
  if(!Array.isArray(h.ramos))return null;
  // Un respaldo antiguo puede no traer la caché `gpa`. Recalcular al leer
  // recupera la comparación sin tocar el historial persistido ni subir una
  // migración masiva a cuentas que ya existen.
  try{
    const ramos=h.ramos.filter(r=>r&&typeof r==='object');
    const calculado=gpa(ramos);
    return typeof calculado==='number'&&Number.isFinite(calculado)?calculado:null;
  }catch(e){return null;}
}
function ultimoHistorialConGpa(historial){
  for(const h of historial||[]){
    const promedio=gpaHistorial(h);
    if(promedio!==null)return {...h,gpa:promedio};
  }
  return null;
}
function lecturaHistorialPrevio(historial){
  const previo=ultimoHistorialConGpa(historial);
  if(previo)return {previo,estado:'comparable'};
  const hayArchivado=(historial||[]).some(h=>h&&Array.isArray(h.ramos));
  return {previo:null,estado:hayArchivado?'sin_notas':'sin_historial'};
}

// ─── PROYECCIÓN DEL SEMESTRE ─────────────────────────────────────────────────
// Hasta dónde puede llegar el promedio con lo que TODAVÍA no se rinde.
//
// No se calcula a mano: se arma una copia del ramo con las evaluaciones
// pendientes rellenas y se la pasa al motor de siempre. Así el escenario
// respeta compuertas, descartes y el ramo que aporta nota a otro — hacer la
// cuenta aparte daría un número más simple y a veces mentiroso, justo en la
// pantalla que dice "hasta acá puedes llegar".
function ramoConPendientesEn(ramo,valor){
  return {...ramo,categorias:(ramo.categorias||[]).map(c=>{
    if(categoriaEximida(ramo,c))return c;
    const objetivo=Number.isInteger(c.slots)&&c.slots>1?c.slots:1;
    const puestas=(c.notas||[]).filter(n=>n.valor!==null&&n.valor!==undefined);
    if(puestas.length>=objetivo)return c;
    const faltan=objetivo-puestas.length;
    const relleno=Array.from({length:faltan},(_,i)=>({id:'sim-'+i,nombre:'sim',valor,peso:1}));
    return {...c,notas:[...puestas,...relleno]};
  })};
}

// Devuelve null cuando no hay nada que proyectar: sin ramos, o con todo rendido
// (ahí el promedio ya no es un rango, es un número y se muestra como tal).
function proyeccionSemestre(ramos){
  const lista=(ramos||[]).filter(r=>(r.categorias||[]).length);
  if(!lista.length)return null;
  const pendientes=lista.some(r=>categoriasVigentes(r).some(c=>{
    const objetivo=Number.isInteger(c.slots)&&c.slots>1?c.slots:1;
    return (c.notas||[]).filter(n=>n.valor!==null&&n.valor!==undefined).length<objetivo;
  }));
  if(!pendientes)return null;
  const piso=gpa(lista.map(r=>ramoConPendientesEn(r,1.0)));
  const techo=gpa(lista.map(r=>ramoConPendientesEn(r,7.0)));
  if(piso===null||techo===null)return null;
  return {piso,techo,recorrido:techo-piso};
}

// Qué necesita cada ramo en lo que le queda, ordenado por dificultad. Lo que
// pide 6,8 va primero: es donde hay que decidir hoy, no al final del semestre.
function loQueFaltaPorRamo(ramos){
  return (ramos||[]).map(r=>{
    const avg=ramoAvg(r);
    const necesita=notaNecesaria(r);
    return {ramo:r,avg,necesita,abierto:!!reglaDescarteConCantidadAbierta(r)};
  }).filter(x=>x.necesita!==null)
    .sort((a,b)=>b.necesita-a.necesita);
}

function toggleHist(id){openHist[id]=!openHist[id];renderStats();}

// ─── EDITAR RAMO ─────────────────────────────────────────────────────────────
let editRamoError='';
function openEditRamoModal(){
  const r=S.ramos.find(x=>x.id===currentRamoId);
  editRamoError='';
  modalColor=r.color;
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Editar ramo</div>
    <label class="modal-label">Nombre del ramo</label>
    <div class="modal-input"><input type="text" id="m-ramo-name" value="${esc(r.nombre)}" maxlength="${NOMBRE_MAX}" autocomplete="off" aria-describedby="m-ramo-error"/></div>
    <p id="m-ramo-error" role="alert" hidden style="margin:-6px 0 10px;font-size:0.8125rem;color:var(--red);"></p>
    <label class="modal-label">Créditos <span style="text-transform:none;font-weight:500;color:var(--fg3);letter-spacing:0;">(SCT — opcional)</span></label>
    <div class="modal-input"><input type="text" inputmode="numeric" id="m-ramo-creditos" value="${r.creditos!=null?r.creditos:''}" placeholder="Ej: 10" maxlength="3" autocomplete="off"/></div>
    <label class="modal-label">Color</label>
    <div class="color-row" id="m-colors"></div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" onclick="confirmEditRamo()">Guardar</button>
    </div>`;
  renderModalColors();openModal();
  setTimeout(()=>{const i=document.getElementById('m-ramo-name');i.focus();i.select();},100);
  document.getElementById('m-ramo-name').addEventListener('keydown',e=>{if(e.key==='Enter')confirmEditRamo();});
  document.getElementById('m-ramo-name').addEventListener('input',()=>{if(editRamoError){editRamoError='';limpiarErrorCampo('m-ramo-name','m-ramo-error');}});
}
function confirmEditRamo(){
  const input=document.getElementById('m-ramo-name');
  const name=(input&&input.value||'').trim();
  if(!name){editRamoError='Escribe el nombre del ramo para guardarlo.';mostrarErrorCampo('m-ramo-name','m-ramo-error',editRamoError);return false;}
  const r=S.ramos.find(x=>x.id===currentRamoId);
  r.nombre=name;r.color=modalColor;
  r.creditos=parseCreditos((document.getElementById('m-ramo-creditos')||{}).value);
  save();track('edit_ramo');closeModal();renderRamo();
}

// ─── EDITAR CATEGORÍA ────────────────────────────────────────────────────────
let editCatError='';
function openEditCatModal(catId){
  const r=S.ramos.find(x=>x.id===currentRamoId);
  const cat=r.categorias.find(c=>c.id===catId);
  editCatError='';
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Editar evaluación</div>
    <label class="modal-label">Nombre</label>
    <div class="modal-input"><input type="text" id="m-cat-name" value="${esc(cat.nombre)}" maxlength="${NOMBRE_MAX}" autocomplete="off" aria-describedby="m-cat-error"/></div>
    <p id="m-cat-error" role="alert" hidden style="margin:-6px 0 10px;font-size:0.8125rem;color:var(--red);"></p>
    ${pesoControlHTML(cat.peso,catId)}
    ${cat.slots>1?'':`<label class="modal-label" style="display:flex;align-items:center;gap:10px;text-transform:none;font-weight:500;letter-spacing:0;cursor:pointer;margin:2px 0 14px;line-height:1.35;${(cat.notas||[]).length>1?'opacity:.55;cursor:not-allowed;':''}">
      <input type="checkbox" id="m-cat-varias" ${cat.directNota===false?'checked':''} ${(cat.notas||[]).length>1?'disabled':''} style="width:18px;height:18px;flex-shrink:0;accent-color:var(--primary);"/>
      <span>Son varias notas que se promedian ${(cat.notas||[]).length>1?'<span style="color:var(--fg3);">(ya tiene varias notas: para volver a una sola, bórralas)</span>':'<span style="color:var(--fg3);">(controles, laboratorios, tareas)</span>'}</span>
    </label>`}
    ${campoFechaHoraHTML('m-cat',cat.fecha,cat.hora,true)}
    ${cat.fecha?`<a class="ramo-action" href="${esc(googleCalUrl(r,cat))}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;margin-bottom:14px;">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
      Agregar a Google Calendar
    </a>`:''}
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" onclick="confirmEditCat('${catId}')">Guardar</button>
    </div>`;
  openModal();wirePesoControl();
  setTimeout(()=>{const i=document.getElementById('m-cat-name');i.focus();i.select();},100);
  document.getElementById('m-cat-name').addEventListener('keydown',e=>{if(e.key==='Enter')confirmEditCat(catId);});
  document.getElementById('m-cat-name').addEventListener('input',()=>{if(editCatError){editCatError='';limpiarErrorCampo('m-cat-name','m-cat-error');}});
}
function confirmEditCat(catId){
  const input=document.getElementById('m-cat-name');
  const name=(input&&input.value||'').trim();
  if(!name){editCatError='Escribe el nombre de la evaluación para guardarla.';mostrarErrorCampo('m-cat-name','m-cat-error',editCatError);return false;}
  const peso=readPesoControl(cat0Peso(catId));
  const fechaInput=document.getElementById('m-cat-fecha');
  const fecha=(fechaInput&&fechaInput.value)?fechaInput.value:null;
  const r=S.ramos.find(x=>x.id===currentRamoId);
  const cat=r.categorias.find(c=>c.id===catId);
  cat.nombre=name;cat.peso=peso;marcarFechaUsuario(cat,fecha,leerHora('m-cat'));
  // La casilla no existe en las de casillas fijas (`slots`), y viene desactivada
  // cuando ya hay dos o más notas: volver a fila simple mostraría una y
  // escondería el resto sin decirlo.
  const casilla=document.getElementById('m-cat-varias');
  if(casilla&&!casilla.disabled)cat.directNota=!casilla.checked;
  save();track('edit_categoria',{tiene_fecha:!!fecha,varias_notas:cat.directNota===false});closeModal();renderRamo();
  // La Agenda vive en otra pantalla y no se enteraba: al quitarle la fecha a una
  // evaluación seguía apareciendo ahí hasta que algo más la redibujara. El peso
  // también cambia el promedio que muestra Home.
  if(typeof renderAgenda==='function')renderAgenda();
  if(typeof renderHome==='function')renderHome();
}

// ─── EDITAR NOTA ─────────────────────────────────────────────────────────────
let editNotaError='';
function openEditNotaModal(catId,notaId){
  editNotaError='';
  const r=S.ramos.find(x=>x.id===currentRamoId);
  const cat=r.categorias.find(c=>c.id===catId);
  const n=cat.notas.find(x=>x.id===notaId);
  const hasPond=n.peso!==1;
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Editar nota</div>
    <label class="modal-label">Nombre</label>
    <div class="modal-input"><input type="text" id="m-nota-name" value="${esc(n.nombre)}" maxlength="${NOMBRE_MAX}" autocomplete="off" aria-describedby="m-nota-error"/></div>
    <p id="m-nota-error" role="alert" hidden style="margin:-6px 0 10px;font-size:0.8125rem;color:var(--red);"></p>
    <label class="modal-label">Nota (1.0 – 7.0) <span style="text-transform:none;font-weight:500;color:var(--fg3);letter-spacing:0;">— vacía si todavía no la rindes</span></label>
    <div class="modal-input"><input type="text" inputmode="decimal" id="m-nota-val" value="${n.valor!==null?nf(n.valor):''}"/></div>
    ${campoFechaHoraHTML('m-nota',n.fecha,n.hora,true)}
    <div class="toggle-row">
      <div><div class="toggle-label">Ponderación personalizada</div><div class="toggle-sub">Por defecto se promedia simple</div></div>
      <label class="toggle"><input type="checkbox" id="m-pond-toggle" ${hasPond?'checked':''} onchange="togglePondSlider()"/><span class="toggle-slider"></span></label>
    </div>
    <div id="pond-slider-wrap" style="display:${hasPond?'block':'none'};margin-top:12px;">
      <label class="modal-label">Peso de esta nota: <span id="m-nota-peso-val">${n.peso}</span>%</label>
      <input type="range" min="1" max="100" value="${n.peso}" id="m-nota-peso" oninput="document.getElementById('m-nota-peso-val').textContent=this.value"/>
    </div>
    <div class="modal-btns" style="margin-top:14px;">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" id="m-edit-nota-btn" onclick="confirmEditNota('${catId}','${notaId}')">Guardar</button>
    </div>`;
  openModal();
  setTimeout(()=>document.getElementById('m-nota-name').focus(),100);
  document.getElementById('m-nota-name').addEventListener('input',()=>{if(editNotaError){editNotaError='';limpiarErrorCampo('m-nota-name','m-nota-error');}});
}
function confirmEditNota(catId,notaId){
  const input=document.getElementById('m-nota-name');
  const name=(input&&input.value||'').trim();
  const val=parseNota(document.getElementById('m-nota-val').value);
  // Igual que al crearla: sin valor queda pendiente. Es el camino de vuelta —
  // se anota la evaluación cuando se sabe la fecha y se completa al rendirla.
  if(!name){editNotaError='Escribe el nombre de la nota para guardarla.';mostrarErrorCampo('m-nota-name','m-nota-error',editNotaError);return false;}
  const fechaNota=(document.getElementById('m-nota-fecha')||{}).value||null;
  const usaPond=document.getElementById('m-pond-toggle').checked;
  const peso=usaPond?parseInt(document.getElementById('m-nota-peso').value)||40:1;
  const r=S.ramos.find(x=>x.id===currentRamoId);
  const cat=r.categorias.find(c=>c.id===catId);
  const n=cat.notas.find(x=>x.id===notaId);
  n.nombre=name;n.valor=isNaN(val)?null:Math.round(val*10)/10;n.peso=peso;marcarFechaUsuario(n,fechaNota,leerHora('m-nota'));
  save();track('edit_nota',{pendiente:isNaN(val)});closeModal();renderRamo();
  if(typeof renderAgenda==='function')renderAgenda();
  showToast(isNaN(val)?'Guardada como pendiente':lecturaDespuesDeNota(r));
}

// ─── CALCULADORA NOTA MÍNIMA ─────────────────────────────────────────────────
function openCalculadoraModal(){
  const r=S.ramos.find(x=>x.id===currentRamoId);

  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 7h8"/><path d="M8 12h3"/><path d="M8 16h3"/><path d="M15 12v5"/></svg> Calculadora</div>
    <p style="font-size:0.8125rem;color:var(--fg2);margin-bottom:14px;">¿Qué promedio necesitas en las evaluaciones que te faltan para llegar a tu meta?</p>
    <label class="modal-label">Promedio meta en el ramo</label>
    <div class="modal-input"><input type="text" inputmode="decimal" id="m-calc-target" placeholder="Ej: 5.5" oninput="calcResult()"/></div>
    <div id="calc-result" style="min-height:52px;margin-top:4px;"></div>
    <div class="modal-btns" style="margin-top:8px;">
      <button class="btn-cancel" onclick="closeModal()">Cerrar</button>
    </div>`;
  openModal();
  setTimeout(()=>document.getElementById('m-calc-target').focus(),100);

  window.calcResult=function(){
    const target=parseNota(document.getElementById('m-calc-target').value);
    const el=document.getElementById('calc-result');
    if(isNaN(target)||target<1||target>7){el.innerHTML='';return;}
    const descarteAbierto=reglaDescarteConCantidadAbierta(r);
    if(descarteAbierto){
      el.innerHTML=`<span style="color:var(--fg2)">No calculamos una nota mínima exacta mientras falte saber cuántas evaluaciones de <b>${esc(descarteAbierto.nombre)}</b> habrá. El programa descarta la peor nota, así que su efecto depende de las notas que todavía no existen.</span>`;
      return;
    }
    // Compuertas: si una sección con piso ya quedó bajo su mínimo, ninguna meta ≥4.0 es alcanzable.
    const gateHit=gatesActivas(r)[0]||null;
    if(gateHit&&target>gateHit.cap){
      el.innerHTML=`<span style="color:var(--red)"><b>${esc(gateHit.nombre)}</b> está bajo ${gateHit.min.toFixed(1)}: la nota queda topada en ${gateHit.cap.toFixed(1)}. Para llegar a ${target.toFixed(1)} primero debes subir esa evaluación.</span>`;
      return;
    }
    const estado=estadoParaNotaNecesaria(r);
    if(estado.total===0){el.innerHTML='';return;}
    const needed=notaNecesaria(r,target);
    if(needed===null){
      const avg=ramoAvg(r);
      if(avg!==null){
        const ok=avg>=target;
        el.innerHTML=`<span style="color:${ok?'var(--green)':'var(--red)'}">Tu promedio actual es <b>${avg.toFixed(2)}</b> — ${ok?'ya lo lograste.':`te faltan ${(target-avg).toFixed(2)} puntos y no quedan evaluaciones.`}</span>`;
      } else {el.innerHTML=`<span style="color:var(--fg3)">No hay notas ingresadas aún.</span>`;}
      return;
    }
    const neededR=r2(needed);
    const pendientes=calculoRamoConCompuertas(r).res.emptyLeaves;
    // Una categoría puede estar a medio rendir: "secciones sin notas" la
    // omitía por completo. Las hojas pendientes sí incluyen cada Informe,
    // Control o entrega que falte dentro del conjunto.
    const dondeTxt=pendientes.length===1
      ?`en <b>${esc(pendientes[0].name)}</b>`
      :'como promedio de las evaluaciones que te faltan';
    // Condición pendiente de piso (ej: Podcast sin nota aún)
    const condPend=(r.gates||[]).filter(g=>{if(g.type!=='min_grade_required')return false;const c=r.categorias.find(x=>x.id===g.catId);return c&&avgPond(c.notas)===null;}).map(g=>`<div style="font-size:0.75rem;color:var(--yellow);margin-top:8px;">Además, ${esc(g.nombre)} debe ser ≥ ${g.min.toFixed(1)} o repruebas pese al promedio.</div>`).join('');
    if(neededR>7){
      el.innerHTML=`<span style="color:var(--red)">Necesitarías un <b>${neededR.toFixed(1)}</b> — ya no es posible llegar a ${target.toFixed(1)}.</span>`;
    } else if(neededR<1){
      el.innerHTML=`<span style="color:var(--green)">Con cualquier nota llegas a ${target.toFixed(1)}.</span>${condPend}`;
    } else {
      const col=neededR>=5.5?'var(--yellow)':'var(--green)';
      el.innerHTML=`<div style="margin-top:4px;">Necesitas un promedio de<br/><b style="font-size:2rem;color:${col}">${neededR.toFixed(1)}</b><br/><span style="font-size:0.75rem;color:var(--fg3)">${dondeTxt}</span>${condPend}</div>`;
    }
  };
}

// ─── SIMULADOR DE ESCENARIOS ──────────────────────────────────────────────────
let simState={}; // { catId: [ {id, valor} ] }  — notas hipotéticas, no se guardan

// ─── SIMULADOR GLOBAL DE SEMESTRE ────────────────────────────────────────────
// Proyecta el promedio general moviendo la nota final de cada ramo con sliders.
// No toca datos: es exploración pura ("¿con qué promedio termino si...?").
let simGlobalState={}; // ramoId -> nota hipotética final

function openSimGlobalModal(){
  simGlobalState={};
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Simular el semestre</div>
    <p style="font-size:0.8125rem;color:var(--fg2);margin-bottom:16px;line-height:1.5;">Ajusta la nota final de cada ramo y mira cómo queda tu promedio general. Puedes escribirla directo. Nada de esto se guarda.</p>
    <div class="simg-hero">
      <div class="simg-hero-label">Promedio proyectado</div>
      <div class="simg-hero-num" id="simg-avg">—</div>
      <div id="simg-delta"></div>
    </div>
    <div class="simg-list" id="simg-list"></div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cerrar</button>
      <button class="btn-confirm" onclick="simGlobalReset()">Reiniciar todo</button>
    </div>`;
  openModal();
  renderSimGlobal();
  track('open_sim_global',{ramos:S.ramos.length});
}

function simGlobalReset(){simGlobalState={};renderSimGlobal();}

// El slider era imposible de apuntar: 60 pasos de 0,1 repartidos en el ancho de
// un teléfono, y con el dedo encima tapando el número. Ahora son dos botones de
// 0,1 y el número se escribe directo.
const SIM_MIN=1.0, SIM_MAX=7.0;
function simGlobalNormaliza(v){
  if(isNaN(v))return null;
  return Math.round(Math.min(SIM_MAX,Math.max(SIM_MIN,v))*10)/10;
}
// Punto de partida cuando el ramo no tiene nota todavía: el 4,0 es el número
// desde el que el estudiante piensa, no el 1,0.
function simGlobalBase(ramoId){
  if(simGlobalState[ramoId]!==undefined)return simGlobalState[ramoId];
  const r=S.ramos.find(x=>x.id===ramoId);
  const real=r?ramoAvg(r):null;
  return real!==null&&real!==undefined?real:4.0;
}
function simGlobalStep(ramoId,delta){
  simGlobalState[ramoId]=simGlobalNormaliza(simGlobalBase(ramoId)+delta);
  renderSimGlobal();
}
// Lo tecleado se lee en dos pasos, y el ORDEN es el arreglo.
//
// Antes iba directo al clamp, así que "55" no daba error: daba un 7,0
// silencioso, porque 55 está fuera de escala y el clamp lo baja al tope. El
// estudiante escribía su 5,5 y se llevaba un 7,0 sin que nada se lo dijera.
//
// Primero parseNota, que traduce lo que la gente escribe de verdad: coma
// ("5,5") y dos dígitos sin punto ("55" → 5,5). Solo lo que sigue fuera de
// escala después de eso pasa al clamp — que se queda, porque escribir "9" es
// querer el máximo, no querer nada, y eso ya estaba decidido.
function simGlobalDesdeTexto(raw){
  const n=parseNota(raw);
  if(!isNaN(n))return n;
  return simGlobalNormaliza(parseFloat(String(raw).replace(',','.')));
}
function simGlobalSet(ramoId,raw){
  const v=simGlobalDesdeTexto(raw);
  if(v===null)delete simGlobalState[ramoId];
  else simGlobalState[ramoId]=v;
  renderSimGlobal();
}
// Mientras escribe NO se vuelve a dibujar la lista: eso le arrancaría el foco
// del campo en la primera tecla. Solo se actualiza el proyectado de arriba.
function simGlobalTyping(ramoId,raw){
  const v=simGlobalDesdeTexto(raw);
  if(v===null)delete simGlobalState[ramoId];
  else simGlobalState[ramoId]=v;
  renderSimGlobalHero();
}

function simGlobalClear(ramoId){
  delete simGlobalState[ramoId];
  renderSimGlobal();
}

// Promedio proyectado: usa la nota hipotética si existe, si no la real del ramo
function simGlobalAvg(){
  const vals=S.ramos.map(r=>{
    if(simGlobalState[r.id]!==undefined)return simGlobalState[r.id];
    return ramoAvg(r);
  }).filter(v=>v!==null&&v!==undefined);
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}

function renderSimGlobal(){renderSimGlobalHero();renderSimGlobalList();}

function renderSimGlobalHero(){
  const real=gpa(S.ramos);
  const proj=simGlobalAvg();
  const hasSim=Object.keys(simGlobalState).length>0;

  const avgEl=document.getElementById('simg-avg');
  if(avgEl){
    avgEl.textContent=proj!==null?nf(proj,2):'—';
    avgEl.style.color=proj!==null?getColor(proj):'var(--fg3)';
  }

  const deltaEl=document.getElementById('simg-delta');
  if(deltaEl){
    if(proj!==null&&real!==null&&hasSim){
      const diff=proj-real;const abs=Math.abs(diff);
      const kind=abs<0.005?'flat':diff>0?'up':'down';
      const arrow=kind==='up'?'↑':kind==='down'?'↓':'·';
      deltaEl.className='simg-hero-delta '+kind;
      deltaEl.textContent=`${arrow} ${nf(abs,2)} vs ${nf(real,2)} actual`;
      deltaEl.style.display='inline-flex';
    } else {
      deltaEl.style.display='none';
    }
  }

}

function renderSimGlobalList(){
  const list=document.getElementById('simg-list');
  if(!list)return;
  list.innerHTML=S.ramos.map(r=>{
    const realAvg=ramoAvg(r);
    const hyp=simGlobalState[r.id];
    const shown=hyp!==undefined?hyp:realAvg;
    const isHyp=hyp!==undefined;
    const prog=ramoProgress(r);
    const metaLeft=realAvg!==null
      ? `Actual ${nf(realAvg)} · ${prog.pct}% evaluado`
      : (r.categorias.length?'Sin notas aún':'Sin evaluaciones');
    const id=esc(r.id);
    const val=shown!==null?nf(shown):'';
    const color=shown!==null?getColor(shown):'var(--fg3)';
    const tope=shown!==null&&shown>=SIM_MAX, piso=shown!==null&&shown<=SIM_MIN;
    return `
      <div class="simg-row">
        <div class="simg-row-hd">
          <div class="simg-row-name"><span class="simg-dot" style="background:${esc(r.color)}"></span><span>${esc(r.nombre)}</span></div>
        </div>
        <div class="simg-stepper">
          <button type="button" class="simg-step" ${piso?'disabled':''} onclick="simGlobalStep('${id}',-0.1)" aria-label="Bajar la nota de ${esc(r.nombre)}">−</button>
          <input class="simg-val ${isHyp?'hyp':'real'}" style="color:${color}" value="${val}" placeholder="—"
            inputmode="decimal" maxlength="4" aria-label="Nota simulada de ${esc(r.nombre)}"
            oninput="simGlobalTyping('${id}',this.value)"
            onchange="simGlobalSet('${id}',this.value)"
            onfocus="this.select()"/>
          <button type="button" class="simg-step" ${tope?'disabled':''} onclick="simGlobalStep('${id}',0.1)" aria-label="Subir la nota de ${esc(r.nombre)}">+</button>
        </div>
        <div class="simg-row-meta">
          <span>${metaLeft}</span>
          ${isHyp?`<button class="simg-reset" onclick="simGlobalClear('${id}')">Volver al real</button>`:'<span></span>'}
        </div>
      </div>`;
  }).join('');
}

function openSimuladorModal(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  simState={};
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg> Simular escenario</div>
    <p style="font-size:0.8125rem;color:var(--fg2);margin-bottom:14px;">Agrega notas hipotéticas y mira cómo quedaría tu promedio. No se guardan hasta que confirmes.</p>
    <div class="sim-proj">
      <div class="sim-proj-label">Promedio proyectado</div>
      <div class="sim-proj-num" id="sim-avg">—</div>
      <div id="sim-delta"></div>
    </div>
    <div class="sim-cats" id="sim-cats"></div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cerrar</button>
      <button class="btn-confirm" id="sim-commit-btn" onclick="simCommit()" disabled>Guardar como reales</button>
    </div>`;
  openModal();
  renderSimulador();
}

// Combina notas reales (con su peso) + hipotéticas (peso 1) de una categoría
function simCombinadas(c){
  return [...c.notas, ...((simState[c.id]||[]).map(s=>({valor:s.valor,peso:1})))];
}
function simCatAvg(c){return avgPond(simCombinadas(c));}
// Proyección del simulador: mismo motor y mismas compuertas que el promedio real.
// Mezcla notas reales + hipotéticas y delega en ramoAvg (gate-aware).
function simProjectedAvg(r){
  const merged={...r,categorias:r.categorias.map(c=>({...c,notas:simCombinadas(c).map((n,i)=>({id:n.id||('sim_'+c.id+'_'+i),nombre:n.nombre||'Nota',valor:n.valor,peso:n.peso||1}))}))};
  return ramoAvg(merged);
}

function renderSimulador(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  const real=ramoAvg(r);
  const proj=simProjectedAvg(r);
  const hasSim=Object.values(simState).some(arr=>arr&&arr.length);

  const avgEl=document.getElementById('sim-avg');
  avgEl.textContent=proj!==null?proj.toFixed(2):'—';
  avgEl.style.color=proj!==null?getColor(proj):'var(--fg3)';

  const deltaEl=document.getElementById('sim-delta');
  // ¿La proyección quedó topada por un piso de nota? Avisar el porqué.
  const gateHit=(r.gates||[]).find(g=>{if(g.type!=='min_grade_required')return false;const c=r.categorias.find(x=>x.id===g.catId);if(!c)return false;const a=avgPond(simCombinadas(c));return a!==null&&a<g.min;});
  if(gateHit&&proj!==null){
    deltaEl.className='sim-delta down';
    deltaEl.textContent=`${gateHit.nombre} bajo ${gateHit.min.toFixed(1)}: la nota queda topada en ${gateHit.cap.toFixed(1)}`;
    deltaEl.style.display='inline-block';
  } else if(proj!==null&&real!==null&&hasSim){
    const d=r2(proj-real);
    const cls=d>0?'up':d<0?'down':'flat';
    deltaEl.className='sim-delta '+cls;
    deltaEl.textContent=`${d>0?'+':''}${d.toFixed(2)} vs tu ${real.toFixed(2)} actual`;
    deltaEl.style.display='inline-block';
  } else if(real!==null){
    deltaEl.className='sim-delta flat';
    deltaEl.textContent=`Tu promedio actual: ${real.toFixed(2)}`;
    deltaEl.style.display='inline-block';
  } else {deltaEl.style.display='none';}

  const cb=document.getElementById('sim-commit-btn');if(cb)cb.disabled=!hasSim;

  document.getElementById('sim-cats').innerHTML=r.categorias.map(c=>{
    const catAvg=simCatAvg(c);
    const realChips=c.notas.map(n=>`<span class="sim-chip real">${esc(n.nombre)}: ${fmt(n.valor)}</span>`).join('');
    const hypChips=(simState[c.id]||[]).map(s=>`<span class="sim-chip hyp">${s.valor.toFixed(1)}<button class="sim-chip-x" onclick="simRemoveNota('${c.id}','${s.id}')" aria-label="Quitar nota hipotética">✕</button></span>`).join('');
    return `
      <div class="sim-cat">
        <div class="sim-cat-head">
          <div><div class="sim-cat-name">${esc(c.nombre)}</div><div class="sim-cat-meta">${c.peso}% del ramo</div></div>
          <div class="sim-cat-avg" style="color:${getColor(catAvg)}">${fmt(catAvg)}</div>
        </div>
        ${(realChips||hypChips)?`<div class="sim-chips">${realChips}${hypChips}</div>`:''}
        <div class="sim-add">
          <input type="text" inputmode="decimal" id="sim-in-${c.id}" placeholder="Nota hipotética (1.0–7.0)" onkeydown="if(event.key==='Enter')simAddNota('${c.id}')"/>
          <button onclick="simAddNota('${c.id}')">+ Agregar</button>
        </div>
      </div>`;
  }).join('');
}

function simAddNota(catId){
  const inp=document.getElementById('sim-in-'+catId);if(!inp)return;
  const val=parseNota(inp.value);
  if(isNaN(val)){showToast('Ingresa una nota entre 1.0 y 7.0',true);return;}
  if(!simState[catId])simState[catId]=[];
  simState[catId].push({id:uid(),valor:val});
  renderSimulador();
  setTimeout(()=>{const i=document.getElementById('sim-in-'+catId);if(i)i.focus();},30);
}
function simRemoveNota(catId,id){
  if(!simState[catId])return;
  simState[catId]=simState[catId].filter(s=>s.id!==id);
  renderSimulador();
}
function simCommit(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  const total=Object.values(simState).reduce((a,arr)=>a+(arr?arr.length:0),0);
  if(total===0)return;
  showConfirm('Guardar como notas reales',`Se agregarán ${total} nota${total!==1?'s':''} hipotética${total!==1?'s':''} como notas reales en este ramo.`,()=>{
    r.categorias.forEach(c=>{
      (simState[c.id]||[]).forEach(s=>{
        c.notas.push({id:uid(),nombre:'Simulada '+(c.notas.length+1),valor:s.valor,peso:1});
        openCats[c.id]=true;
      });
    });
    simState={};
    save();track('sim_commit',{notas:total});
    closeModal();renderRamo();
    showToast('✓ Notas agregadas');
  },{label:'Guardar',danger:false});
}

// ─── CONFIGURACIÓN EDITABLE ───────────────────────────────────────────────────
// ─── AGENDA DE EVALUACIONES ──────────────────────────────────────────────────
// Recolecta todas las categorías con fecha ingresada, las ordena y agrupa por
// proximidad. La ingesta de fechas se agrega en el modal de categoría (próximo batch).
// ─── INSIGHT HELPERS (cards inteligentes del home) ─────────────────────────
function nextExam(){
  const today=new Date();today.setHours(0,0,0,0);
  const day=86400000;
  let best=null;
  S.ramos.forEach(r=>{
    r.categorias.forEach(c=>{
      if(categoriaEximida(r,c))return;
      if(!c.fecha)return;
      const target=c.slots||1;
      if((c.notas||[]).length>=target)return; // ya evaluado
      const d=new Date(c.fecha+'T00:00:00');
      if(d<today)return; // vencido
      if(!best || d<best.date) best={ramo:r,cat:c,date:d};
    });
  });
  if(!best)return null;
  const daysUntil=Math.round((best.date-today)/day);
  return {ramo:best.ramo,cat:best.cat,date:best.date,daysUntil};
}

function latestGrade(){
  // Última nota "ingresada" (por orden en el array, aprox porque no guardamos timestamp)
  let last=null;
  S.ramos.forEach(r=>{
    r.categorias.forEach(c=>{
      (c.notas||[]).forEach(n=>{
        if(n.valor===null||n.valor===undefined)return;
        last={ramo:r,cat:c,nota:n};
      });
    });
  });
  return last;
}

function mostRiskyRamo(){
  // Ramo con avg bajo 5.0 y una nota mínima requerida clara para aprobar
  let best=null;
  S.ramos.forEach(r=>{
    if(r.categorias.length===0)return;
    const avg=ramoAvg(r);
    if(avg===null)return;
    if(r2(avg)>=5.0)return; // no está en riesgo
    const categorias=categoriasVigentes(r);
    const totalPeso=categorias.reduce((s,c)=>s+c.peso,0);
    let pesoConNotas=0,sumaPond=0;
    categorias.forEach(c=>{const a=avgPond(c.notas);if(a!==null){pesoConNotas+=c.peso;sumaPond+=a*c.peso;}});
    const pesoSinNotas=totalPeso-pesoConNotas;
    if(pesoSinNotas<=0)return; // ya evaluado todo
    const needed=(4.0*totalPeso-sumaPond)/pesoSinNotas;
    if(needed>7.05)return; // no alcanzable
    if(needed<=1.0)return; // trivial
    if(!best || needed>best.needed) best={ramo:r,avg,needed,pesoSinNotas};
  });
  return best;
}

// Progreso del ramo: % de peso evaluado
function ramoProgress(r){
  const categorias=categoriasVigentes(r);
  const total=categorias.reduce((s,c)=>s+c.peso,0);
  if(total<=0)return {pct:0,pending:0,total:0};
  let done=0;
  categorias.forEach(c=>{
    // Una categoría con casillas fijas se evalúa proporcionalmente: una de
    // seis notas de Informes no puede cerrar el 70% del ramo. Solo cuentan
    // notas con valor; una anotada con fecha para rendir después sigue pendiente.
    const notas=Array.isArray(c.notas)?c.notas:[];
    const objetivo=Number.isInteger(c.slots)&&c.slots>1?c.slots:1;
    // Se cuentan CASILLAS con nota, no notas: dos valores de la misma casilla
    // son un dato pisado, no dos evaluaciones rendidas. Sin esto, un duplicado
    // hace que el ramo se declare más evaluado de lo que está.
    const evaluadas=objetivo>1
      ? new Set(notas.filter(n=>typeof n.valor==='number'&&Number.isInteger(n.slot)).map(n=>n.slot)).size
      : notas.filter(n=>typeof n.valor==='number').length;
    done+=c.peso*Math.min(1,evaluadas/objetivo);
  });
  return {pct:Math.round(done/total*100),pending:total-done,total};
}
function ramoRecienCerrado(anterior,actual){return Number.isFinite(anterior)&&anterior<100&&actual===100;}

function agendaEvents(){
  const out=[];
  S.ramos.forEach(r=>{
    r.categorias.forEach(c=>{
      if(categoriaEximida(r,c))return;
      // Las notas con fecha propia son evaluaciones sueltas dentro del grupo:
      // "Casos y ensayos" puede tener tres casos en tres fechas distintas, y
      // cada uno tiene que poder aparecer en su día. Si la nota trae fecha,
      // manda la suya; la de la categoría vale para el grupo entero.
      (c.notas||[]).forEach(n=>{
        if(!n.fecha)return;
        out.push({
          fecha:n.fecha, hora:n.hora||null, ramo:r, cat:c, nota:n,
          pending:n.valor===null||n.valor===undefined,
          notas:[n], targetCount:1,
        });
      });
      if(!c.fecha)return;
      const conFechaPropia=(c.notas||[]).filter(n=>n.fecha).length;
      const notasCount=(c.notas||[]).length-conFechaPropia;
      const targetCount=c.slots||1;
      const pending=notasCount<targetCount;
      // Si TODAS las notas del grupo tienen su propia fecha, la del grupo ya no
      // aporta: mostrarla duplicaría lo mismo en otro día.
      if(conFechaPropia&&notasCount<=0&&(c.slots||0)<=conFechaPropia)return;
      out.push({
        fecha:c.fecha, hora:c.hora||null, ramo:r, cat:c, pending,
        notas:(c.notas||[]).filter(n=>!n.fecha), targetCount,
      });
    });
  });
  out.sort((a,b)=>a.fecha.localeCompare(b.fecha)||(a.hora||'').localeCompare(b.hora||''));
  return out;
}


function formatEventDate(iso){
  const meses=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const d=new Date(iso+'T00:00:00');
  return {day:d.getDate(),mon:meses[d.getMonth()],dow:['dom','lun','mar','mié','jue','vie','sáb'][d.getDay()]};
}


// ─── EXPORTAR AL CALENDARIO (.ics) ───────────────────────────────────────────
// Genera un archivo .ics estándar con todas las evaluaciones que tienen fecha.
// Funciona con Apple Calendar, Google Calendar, Outlook — cualquiera.
// Sin API, sin auth, sin backend: se arma en el navegador.

function icsEscape(s){
  return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
}
// El RFC dice máx 75 octetos por línea; se pliega con CRLF + espacio.
function icsFold(line){
  if(line.length<=73)return line;
  const out=[];let rest=line;
  out.push(rest.slice(0,73));rest=rest.slice(73);
  while(rest.length>72){out.push(' '+rest.slice(0,72));rest=rest.slice(72);}
  if(rest.length)out.push(' '+rest);
  return out.join('\r\n');
}
function isoOf(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function icsDate(iso){return iso.replace(/-/g,'');}
// YYYYMMDDTHHMMSS, sin Z: hora local flotante (ver buildICS).
function icsDateTime(iso,hora){return `${icsDate(iso)}T${String(hora).replace(':','')}00`;}
function sumaUnaHora(hora){
  const [h,m]=String(hora).split(':').map(Number);
  return `${String((h+1)%24).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function icsDatePlus1(iso){
  const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+1);
  return isoOf(d.getFullYear(),d.getMonth(),d.getDate()).replace(/-/g,'');
}


// ─── IMPORTAR FECHAS DESDE .ICS ─────────────────────────────────────────────
// Un .ics viene de fuera de GradeHub: se parsea como texto acotado, se propone
// y recién se aplica después de que la persona revise cada fila. Nunca toca
// pesos, notas ni una fecha existente.
const ICS_IMPORT_MAX_BYTES=512*1024;
const ICS_IMPORT_MAX_EVENTS=250;
const ICS_IMPORT_TITLE_MAX=180;
let icsImportDraft=[];

function bytesIcs(text){
  const value=String(text||'');
  return typeof TextEncoder==='function' ? new TextEncoder().encode(value).length : value.length;
}
function fechaDesdeIcs(value){
  const m=String(value||'').match(/^(\d{4})(\d{2})(\d{2})(?:T\d{4}(?:\d{2})?Z?)?$/);
  if(!m)return null;
  const y=Number(m[1]),mes=Number(m[2]),dia=Number(m[3]);
  const d=new Date(Date.UTC(y,mes-1,dia));
  if(d.getUTCFullYear()!==y||d.getUTCMonth()!==mes-1||d.getUTCDate()!==dia)return null;
  return m[1]+'-'+m[2]+'-'+m[3];
}
function desescaparIcs(value){
  return String(value||'')
    .replace(/\\n/gi,' ')
    .replace(/\\([\\;,])/g,'$1')
    .replace(/\\\\/g,'\\');
}
function parseIcsCalendario(text){
  if(typeof text!=='string'||!text.trim())throw new Error('El archivo está vacío');
  if(bytesIcs(text)>ICS_IMPORT_MAX_BYTES)throw new Error('El archivo supera el límite de 500 KB');
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text))throw new Error('El archivo contiene caracteres no válidos');

  const raw=text.replace(/\r\n?/g,'\n').split('\n');
  const lines=[];
  raw.forEach(line=>{
    if(line.length>2000)throw new Error('El archivo tiene una línea demasiado larga');
    if(/^[ \t]/.test(line)&&lines.length)lines[lines.length-1]+=line.slice(1);
    else lines.push(line);
  });
  if(!lines.includes('BEGIN:VCALENDAR')||!lines.includes('END:VCALENDAR'))throw new Error('No parece ser un calendario .ics');

  const blocks=[];let event=null;
  lines.forEach(line=>{
    if(line==='BEGIN:VEVENT'){
      if(event)throw new Error('El archivo tiene eventos mal cerrados');
      event=[];return;
    }
    if(line==='END:VEVENT'){
      if(!event)throw new Error('El archivo tiene eventos mal cerrados');
      blocks.push(event);event=null;return;
    }
    if(event)event.push(line);
  });
  if(event)throw new Error('El archivo tiene eventos sin cerrar');
  if(!blocks.length)throw new Error('No encontramos eventos en este calendario');
  if(blocks.length>ICS_IMPORT_MAX_EVENTS)throw new Error('El archivo trae más de 250 eventos');

  return blocks.map((block,index)=>{
    let summary='',start='';
    block.forEach(line=>{
      const cut=line.indexOf(':');if(cut<1)return;
      const key=line.slice(0,cut).split(';')[0].toUpperCase();
      const value=line.slice(cut+1);
      if(key==='SUMMARY'&&!summary)summary=desescaparIcs(value);
      if(key==='DTSTART'&&!start)start=value;
    });
    summary=summary.trim().replace(/\s+/g,' ');
    const fecha=fechaDesdeIcs(start);
    if(!summary||summary.length>ICS_IMPORT_TITLE_MAX||/[\u0000-\u001F\u007F]/.test(summary))throw new Error('El evento '+(index+1)+' no trae un título válido');
    if(!fecha)throw new Error('El evento '+(index+1)+' no trae una fecha válida');
    return {titulo:summary,fecha};
  });
}

function claveDestinoIcs(target){
  return target.ramo.id+'|'+target.cat.id+'|'+(target.nota?target.nota.id:'');
}
function destinosIcs(){
  const out=[];
  (S.ramos||[]).forEach(r=>(r.categorias||[]).forEach(cat=>{
    if(!cat.fecha&&!cat.fechaQuitada)out.push({ramo:r,cat,nota:null});
    (cat.notas||[]).forEach(nota=>{
      if(!nota.fecha&&!nota.fechaQuitada)out.push({ramo:r,cat,nota});
    });
  }));
  return out;
}
function etiquetaDestinoIcs(target){
  return target.ramo.nombre+' · '+(target.nota?target.nota.nombre:target.cat.nombre);
}
function prefijosEvaluacionIcs(nombre){
  const normal=normName(nombre).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(!normal)return [];
  const compact=normal.replace(/\s/g,'');
  const first=(normal.match(/^([a-z]+)\s*(\d+)?/)||[]);
  const word=first[1]||'',number=first[2]||'';
  const short=word.startsWith('interrogacion')?'i'
    :word.startsWith('solemne')?'s'
    :word.startsWith('examen')?'ex'
    :word.startsWith('prueba')?'p'
    :word.startsWith('control')?'c'
    :word.startsWith('laboratorio')?'l'
    :word.startsWith('tarea')?'t'
    :word.startsWith('quiz')?'q'
    :word.startsWith('evaluacion')?'ev'
    :word.slice(0,Math.min(3,word.length));
  return [...new Set([normal,compact,word+(number||''),short+(number||'')].filter(Boolean))];
}
function coincidenciaIcs(evento,targets){
  const title=normName(evento.titulo).replace(/[—–-]/g,' ').replace(/\s+/g,' ').trim();
  const matches=targets.filter(target=>{
    const ramo=normName(target.ramo.nombre);
    if(!ramo||!title.endsWith(ramo))return false;
    const prefijo=title.slice(0,title.length-ramo.length).trim();
    return prefijosEvaluacionIcs(target.nota?target.nota.nombre:target.cat.nombre).includes(prefijo);
  });
  return matches.length===1?claveDestinoIcs(matches[0]):null;
}
function prepararImportacionIcs(text){
  const targets=destinosIcs();
  return parseIcsCalendario(text).map(evento=>({...evento,target:coincidenciaIcs(evento,targets)}));
}
function aplicarPropuestasIcs(propuestas){
  const targets=new Map(destinosIcs().map(target=>[claveDestinoIcs(target),target]));
  const elegidas=(propuestas||[]).filter(p=>p&&p.target);
  if(!elegidas.length)return 0;
  const seen=new Set();
  elegidas.forEach(p=>{
    if(seen.has(p.target))throw new Error('Una evaluación no puede recibir dos fechas');
    seen.add(p.target);
    if(!targets.has(p.target))throw new Error('Una de las fechas ya no está disponible');
    if(!fechaDesdeIcs(String(p.fecha||'').replace(/-/g,'')))throw new Error('Una fecha propuesta no es válida');
  });
  elegidas.forEach(p=>{
    const target=targets.get(p.target);
    const item=target.nota||target.cat;
    item.fecha=p.fecha;item.fechaOrigen='calendario';item.fechaQuitada=false;
  });
  return elegidas.length;
}


function abrirImportarCalendario(){
  icsImportDraft=[];
  document.getElementById('modal-content').innerHTML=[
    '<div class="modal-title">Importar fechas desde un calendario</div>',
    '<p style="font-size:0.8125rem;color:var(--fg2);line-height:1.5;margin:0 0 14px;">Elige un archivo <b>.ics</b> exportado desde Apple, Google u Outlook. Primero revisas dónde va cada fecha: nada se guarda todavía.</p>',
    '<label class="modal-label" for="ics-file">Archivo de calendario</label>',
    '<div class="modal-input"><input type="file" id="ics-file" accept=".ics,text/calendar" aria-describedby="ics-file-help"/></div>',
    '<p id="ics-file-help" class="settings-help">Máximo 500 KB y 250 eventos. Solo usamos títulos y fechas para proponer evaluaciones; tus notas no se leen ni se modifican.</p>',
    '<div class="modal-btns" style="margin-top:14px;"><button class="btn-cancel" type="button" onclick="closeModal()">Cancelar</button></div>'
  ].join('');
  openModal();
  document.getElementById('ics-file').addEventListener('change',leerArchivoIcs);
}
function leerArchivoIcs(event){
  const file=event&&event.target&&event.target.files&&event.target.files[0];
  if(!file)return;
  if(file.size>ICS_IMPORT_MAX_BYTES){showToast('El archivo supera el límite de 500 KB',true);return;}
  file.text().then(text=>{
    icsImportDraft=prepararImportacionIcs(text);
    renderRevisionIcs();
  }).catch(()=>showToast('No pudimos leer ese archivo',true));
}
function opcionesDestinoIcs(selected,used){
  return ['<option value="">No importar</option>'].concat(destinosIcs().map(target=>{
    const key=claveDestinoIcs(target);
    const disabled=used.has(key)&&key!==selected?' disabled':'';
    return '<option value="'+esc(key)+'"'+(key===selected?' selected':'')+disabled+'>'+esc(etiquetaDestinoIcs(target))+'</option>';
  })).join('');
}
function renderRevisionIcs(){
  const used=new Set(icsImportDraft.map(item=>item.target).filter(Boolean));
  const rows=icsImportDraft.map((item,index)=>{
    const estado=item.target?'Coincidencia propuesta':'Sin asignar';
    return '<div style="padding:12px 0;border-bottom:1px solid var(--border);">'
      +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;"><b style="font-size:0.875rem;">'+esc(item.titulo)+'</b><span style="font-size:0.75rem;color:var(--fg3);white-space:nowrap;">'+esc(fechaCorta(item.fecha))+'</span></div>'
      +'<div style="font-size:0.75rem;color:var(--fg3);margin:4px 0 8px;">'+estado+'</div>'
      +'<div class="modal-input"><select aria-label="Asignar '+esc(item.titulo)+'" onchange="asignarDestinoIcs('+index+',this.value)">'+opcionesDestinoIcs(item.target,used)+'</select></div>'
      +'</div>';
  }).join('');
  document.getElementById('modal-content').innerHTML=[
    '<div class="modal-title">Revisa las fechas</div>',
    '<p style="font-size:0.8125rem;color:var(--fg2);line-height:1.5;margin:0 0 8px;">Las coincidencias son propuestas. Puedes cambiarlas, dejar una sin importar o asignar manualmente las que no calzaron.</p>',
    '<div style="max-height:48vh;overflow:auto;border-top:1px solid var(--border);">'+rows+'</div>',
    '<div class="modal-btns" style="margin-top:14px;"><button class="btn-cancel" type="button" onclick="closeModal()">Cancelar</button><button class="btn-confirm" type="button" onclick="confirmarImportarCalendario()">Agregar fechas elegidas</button></div>'
  ].join('');
}
function asignarDestinoIcs(index,target){
  if(!Number.isInteger(index)||!icsImportDraft[index])return;
  icsImportDraft[index].target=target||null;
  renderRevisionIcs();
}
function confirmarImportarCalendario(){
  let aplicadas=0;
  try{aplicadas=aplicarPropuestasIcs(icsImportDraft);}
  catch(error){showToast(error.message||'No pudimos aplicar esas fechas',true);return;}
  if(!aplicadas){showToast('Elige al menos una evaluación para importar',true);return;}
  save();
  if(typeof renderAgenda==='function')renderAgenda();
  const revisadas=icsImportDraft.length;
  icsImportDraft=[];
  closeModal();
  track('import_ics',{eventos:aplicadas,revisados:revisadas});
  showToast(aplicadas+' fecha'+(aplicadas===1?' agregada':'s agregadas'));
}



function buildICS(){
  const evs=agendaEvents();
  const stamp=new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
  const lines=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GradeHub//Evaluaciones//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:GradeHub — Evaluaciones',
    'X-WR-TIMEZONE:America/Santiago',
  ];
  evs.forEach(e=>{
    const peso=r2(e.cat.peso||0);
    const titulo=`${e.cat.nombre} — ${e.ramo.nombre}`;
    const desc=`Vale ${peso}% de ${e.ramo.nombre}.`+(e.pending?'':' Ya evaluada.');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.cat.id}-${e.ramo.id}@gradehub.app`);
    lines.push(`DTSTAMP:${stamp}`);
    // Con hora, el evento deja de ser de día completo. Se emite como hora
    // LOCAL FLOTANTE —sin Z y sin TZID—, que el RFC define como "la hora del
    // reloj de quien lo mira". Es lo correcto acá y además esquiva el problema
    // que hacía temer este cambio: Chile mueve el reloj en septiembre, así que
    // convertir a UTC obliga a saber el huso vigente EN LA FECHA DE LA PRUEBA, y
    // equivocarse corre la evaluación una hora. Flotante no se calcula: las
    // 14:00 son las 14:00.
    //
    // La hora de término no está en ningún dato: nadie dice cuánto dura una
    // prueba. Se usa una hora como convención visible, no como afirmación.
    if(e.hora){
      lines.push(`DTSTART:${icsDateTime(e.fecha,e.hora)}`);
      lines.push(`DTEND:${icsDateTime(e.fecha,sumaUnaHora(e.hora))}`);
    }else{
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.fecha)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDatePlus1(e.fecha)}`);
    }
    lines.push(icsFold(`SUMMARY:${icsEscape(titulo)}`));
    lines.push(icsFold(`DESCRIPTION:${icsEscape(desc)}`));
    lines.push('TRANSP:TRANSPARENT');
    // Recordatorio el día anterior a las 9:00 (solo para pendientes)
    if(e.pending){
      lines.push('BEGIN:VALARM');
      lines.push(e.hora?'TRIGGER:-P1D':'TRIGGER:-P1DT9H');
      lines.push('ACTION:DISPLAY');
      lines.push(icsFold(`DESCRIPTION:${icsEscape('Mañana: '+titulo)}`));
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ─── FEED SUSCRIBIBLE ────────────────────────────────────────────────────────
// El .ics de arriba es una foto: si después cambias una fecha, el archivo ya
// bajado no se entera. El feed es una URL que el calendario consulta solo, así
// que la suscripción se hace una vez y queda.
//
// El .ics lo arma una Cloudflare Pages Function (functions/cal/[token].js), no
// el navegador: Google lo pide desde sus servidores, sin sesión. El token sale
// de una RPC `security definer` y va en la ruta, que es el único lugar donde
// Google puede llevar un secreto.
let _feedUrl=null;

async function pedirFeedCalendario(regenerar){
  if(!supabaseClient||!currentUser)return null;
  const {data,error}=await supabaseClient.rpc(regenerar?'calendar_feed_revoke':'calendar_feed_token');
  if(error)throw error;
  _feedUrl=location.origin+'/cal/'+data;
  return _feedUrl;
}

async function pintarFeedCalendario(regenerar){
  const inp=document.getElementById('s-cal-url');if(!inp)return;
  inp.value=regenerar?'Generando una nueva…':'Generando…';
  try{
    inp.value=await pedirFeedCalendario(regenerar);
  }catch(e){
    inp.value='';
    showToast('No pudimos generar tu URL. Intenta de nuevo.',true);
  }
}

function copiarFeedCalendario(){
  const inp=document.getElementById('s-cal-url');
  if(!inp||!inp.value||!_feedUrl){showToast('Todavía se está generando',true);return;}
  navigator.clipboard.writeText(_feedUrl)
    .then(()=>{track('calendar_feed_copiado');showToast('URL copiada — pégala en tu calendario');})
    .catch(()=>{inp.select();showToast('Cópiala a mano: quedó seleccionada',true);});
}

// Regenerar rompe la suscripción que ya esté puesta en el calendario, así que se
// confirma: el estudiante tiene que volver a agregarla en Google.
function revocarFeedCalendario(){
  showConfirm('Generar una URL nueva',
    'La URL actual deja de funcionar al instante. Si ya la agregaste a tu calendario, vas a tener que volver a suscribirte con la nueva.',
    ()=>{track('calendar_feed_revocado');pintarFeedCalendario(true);},
    {label:'Generar nueva'});
}

// Importar un archivo .ics y suscribirse a una URL se parecen desde afuera,
// pero se comportan distinto. En especial, iOS mezcla una importación con un
// calendario existente aunque el archivo declare su propio nombre. La Agenda
// muestra esta elección antes de descargar para que esa diferencia sea visible.
function openAgendaCalendarOptions(){
  const tieneEventos=agendaEvents().length>0;
  const opcionesSalida=tieneEventos?`
    <p style="font-size:0.8125rem;color:var(--fg2);line-height:1.5;margin:0 0 14px;">
      La suscripción es la opción recomendada: <b>se actualiza sola</b> cuando cambias una fecha y queda como un calendario separado.
    </p>
    <button class="btn-primary" type="button" onclick="openCalendarSubscriptionFromAgenda()">Suscribirme al calendario</button>
    <div style="height:1px;background:var(--border);margin:20px 0 16px;"></div>
    <label class="modal-label">Exportar archivo .ics</label>
    <p class="settings-help" style="margin-top:0;">Es una copia del momento: si después cambias una fecha en GradeHub, el archivo no se actualiza.</p>
    <p class="settings-help"><b>En iPhone:</b> los eventos se agregan a un calendario que ya existe; no se crea uno nuevo.</p>
    <div class="settings-data-actions" style="margin-bottom:0;">
      <button type="button" onclick="exportCalendarSnapshotFromAgenda()">Exportar copia</button>
    </div>
    <div style="height:1px;background:var(--border);margin:20px 0 16px;"></div>`:
    `<p style="font-size:0.8125rem;color:var(--fg2);line-height:1.5;margin:0 0 14px;">
      Todavía no tienes fechas en GradeHub. Puedes traerlas desde tu calendario y revisarlas antes de agregarlas.
    </p>`;
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Conecta GradeHub y tu calendario</div>
    ${opcionesSalida}
    <label class="modal-label">Importar archivo .ics</label>
    <p class="settings-help" style="margin-top:0;">Trae fechas desde Apple, Google u Outlook. Revisas cada coincidencia antes de agregarla.</p>
    <div class="settings-data-actions" style="margin-bottom:0;">
      <button${tieneEventos?'':' class="btn-primary"'} type="button" onclick="abrirImportarCalendario()">Importar fechas</button>
    </div>`;
  openModal();
  track('calendar_options_opened');
}

function openCalendarSubscriptionFromAgenda(){
  track('calendar_subscription_from_agenda');
  closeModal();
  setTimeout(()=>openSettings('calendario'),220);
}

function exportCalendarSnapshotFromAgenda(){
  closeModal();
  exportarCalendario();
}

// Una evaluación suelta a Google Calendar, con un toque desde el teléfono.
//
// El .ics de acá arriba sirve para todos los calendarios, pero para meterlo a
// Google hay que entrar a calendar.google.com desde un computador e importar el
// archivo a mano — en el celular, que es donde está casi todo el mundo, la
// descarga no lleva a ninguna parte.
//
// Esto es la URL de plantilla de Google: abre el evento prellenado y el
// estudiante solo aprieta Guardar. Sin API, sin OAuth, sin backend y sin
// permisos nuevos: es un link. No sincroniza — si después cambias la fecha en
// GradeHub, el evento en Google se queda con la vieja.
function googleCalUrl(ramo,cat){
  if(!cat||!cat.fecha)return '';
  const p=new URLSearchParams({
    action:'TEMPLATE',
    text:`${cat.nombre} — ${ramo.nombre}`,
    dates:`${icsDate(cat.fecha)}/${icsDatePlus1(cat.fecha)}`,
    details:`Vale ${r2(cat.peso||0)}% de ${ramo.nombre}. Agendado desde GradeHub.`,
  });
  return 'https://calendar.google.com/calendar/render?'+p.toString();
}

function exportarCalendario(){
  const evs=agendaEvents();
  if(evs.length===0){showToast('Primero agrega fechas a tus evaluaciones',true);return;}
  try{
    const blob=new Blob([buildICS()],{type:'text/calendar;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='gradehub-evaluaciones.ics';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast(`${evs.length} ${evs.length===1?'evaluación exportada':'evaluaciones exportadas'}`);
    track('export_ics',{eventos:evs.length});
  }catch(err){
    showToast('No se pudo exportar el calendario',true);
  }
}

// ─── PRIORIDAD DE EVALUACIONES ───────────────────────────────────────────────
// La lista no ordena solo por fecha: pondera urgencia × peso × riesgo del ramo.
// Un examen de 40% en 5 días importa más que un control de 5% mañana.

function diasHasta(iso){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const d=new Date(iso+'T00:00:00');
  return Math.round((d-hoy)/86400000);
}

// Cuánto necesita el estudiante en lo que le queda para aprobar el ramo (o null)
function reglaDescarteConCantidadAbierta(ramo){
  return (ramo.categorias||[]).find(c=>c.dropLowest&&!Number.isInteger(c.slots))||null;
}
// Separa lo ya aportado de lo que sigue pendiente usando las hojas efectivas
// del motor. Para categorías abiertas se conserva el modelo previo: sin slots
// declarados no podemos inventar cuántas evaluaciones faltan, pero una categoría
// sin nota sigue representando todo su peso pendiente.
function estadoParaNotaNecesaria(ramo){
  const categorias=categoriasVigentes(ramo);
  const total=categorias.reduce((s,c)=>s+(Number(c.peso)||0),0);
  if(total<=0)return {total:0,conocido:0,pendiente:0};
  const estructura=ramoToStructure(ramo),notas=gradesOf(ramo);
  const pesos=gh_effWeights(estructura);
  const valores=new Map(resumenCategoriasCalculadas(ramo).map(c=>[c.id,c.valor]));
  let conocido=0,pesoConocido=0;
  categorias.forEach(c=>{
    const slots=Number.isInteger(c.slots)&&c.slots>1;
    if(!slots){
      const valor=valores.get(c.id),peso=Number(c.peso)||0;
      if(typeof valor==='number'){conocido+=valor*peso;pesoConocido+=peso;}
      return;
    }
    const grupo=estructura.children.find(h=>h.id===c.id);
    (grupo?.children||[]).forEach(hoja=>{
      const valor=notas[hoja.id],peso=(pesos[hoja.id]||0)*total;
      if(typeof valor==='number'){conocido+=valor*peso;pesoConocido+=peso;}
    });
  });
  return {total,conocido:conocido/total,pendiente:Math.max(0,1-pesoConocido/total)};
}
// La calculadora y la ficha preguntan por metas distintas, pero ambas tienen
// que contar las mismas casillas pendientes. `meta` deja que la calculadora
// reutilice el desglose por hojas en vez de volver a cerrar una categoría al
// aparecer su primera nota.
function notaNecesaria(ramo,meta){
  const objetivo=Number.isFinite(meta)?meta:4.0;
  const propio=estadoParaNotaNecesaria(ramo);
  if(propio.total<=0)return null;
  // Si otro ramo aporta parte de la nota (el laboratorio de Dinámica), sus
  // evaluaciones NO están en este árbol. Se traen con el mismo desglose de
  // hojas para no declarar cerrado un laboratorio con una sola entrega.
  const link=ramo.aporta;
  if(link&&link.peso){
    const p=link.peso/100;
    const otro=ramoVinculado(ramo);
    const externo=otro?estadoParaNotaNecesaria(otro):{conocido:0,pendiente:1};
    const conocido=propio.conocido*(1-p)+externo.conocido*p;
    const pendiente=propio.pendiente*(1-p)+externo.pendiente*p;
    return pendiente>0?(objetivo-conocido)/pendiente:null;
  }
  if(propio.pendiente<=0)return null;
  return (objetivo-propio.conocido)/propio.pendiente;
}

// Convierte una nota recién ingresada en una consecuencia académica concreta.
// El cálculo habla solo de lo que queda pendiente y respeta compuertas activas.
function lecturaDespuesDeNota(ramo){
  const avg=ramoAvg(ramo);
  if(avg===null)return 'Nota guardada';
  const gate=gatesActivas(ramo)[0];
  if(gate)return `${gate.nombre} quedó en ${fmt(gate.actual)} · nota topada en ${fmt(gate.cap)}`;
  const descarteAbierto=reglaDescarteConCantidadAbierta(ramo);
  if(descarteAbierto)return `Vas ${fmt(avg)} · la nota mínima depende de los próximos ${descarteAbierto.nombre.toLowerCase()}`;
  const necesita=notaNecesaria(ramo);
  if(necesita===null)return `Vas ${fmt(avg)} · ramo completamente evaluado`;
  if(necesita>7.05)return `Vas ${fmt(avg)} · ya no alcanza sólo con lo pendiente`;
  if(necesita<=1.0)return `Vas ${fmt(avg)} · tienes margen para aprobar`;
  if(r2(avg)>=5.0&&necesita<=4.0)return `Vas ${fmt(avg)} · buen margen en lo pendiente`;
  return `Vas ${fmt(avg)} · necesitas ${nf(necesita)} en lo pendiente para aprobar`;
}

// Hasta dónde llega "ahora". Un mes es lo que alguien alcanza a preparar y
// reorganizar; más allá, saber que un ramo va mal no cambia qué haces hoy.
const HORIZONTE_FOCO=30;

// Seis semanas cubren una demora académica larga sin convertir el resto del
// semestre en una espera silenciosa. Después de 42 días, la Agenda no asume
// que se rindió: pide revisar si falta la nota o si la fecha quedó obsoleta.
const DIAS_PARA_REVISAR_FECHA=42;

// La fecha describe cuándo estaba agendada una evaluación, no demuestra que se
// haya rendido. Una fecha pasada sin nota sigue pendiente para los cálculos,
// pero en la Agenda es otra clase de pendiente: espera confirmación o la nota,
// no compite con lo que todavía se puede estudiar.
function estadoEventoAgenda(e,dias){
  if(!e.pending)return 'con_nota';
  const d=Number.isFinite(dias)?dias:diasHasta(e.fecha);
  if(d<-DIAS_PARA_REVISAR_FECHA)return 'requiere_revision';
  return d<0?'esperando_nota':'por_venir';
}

function withPriority(e){
  const dias=diasHasta(e.fecha);
  const peso=e.cat.peso||0;
  const avg=ramoAvg(e.ramo);
  const necesita=notaNecesaria(e.ramo);
  const estadoAgenda=estadoEventoAgenda(e,dias);

  // Una fecha pasada sin nota no desaparece, pero tampoco puede ser "Tu foco
  // ahora": la nota suele llegar días después y la prueba puede haberse movido.
  // Todo evento por venir queda por encima, incluso si pesa poco o está lejos.
  if(estadoAgenda==='esperando_nota'||estadoAgenda==='requiere_revision'){
    const nivel=estadoAgenda==='requiere_revision'?'revision':'espera';
    return {...e,dias,score:-1000+dias,nivel,estadoAgenda,avg,necesita};
  }

  // Urgencia: decae de forma CONTINUA, con vida media de tres semanas.
  //
  // Antes eran tramos, y el último —"más de 30 días"— metía en la misma bolsa
  // algo a cinco semanas y algo a cuatro meses. Ahí el tiempo dejaba de existir
  // y entre dos evaluaciones lejanas solo competía el peso: un examen de 30% en
  // diciembre le ganaba a una interrogación de 15% en septiembre.
  const urgencia=100*Math.pow(2,-dias/21);

  // Riesgo: si el ramo va mal, sus evaluaciones suben de prioridad
  let riesgo=0;
  if(avg!==null){
    if(r2(avg)<4.0)riesgo=45;
    else if(r2(avg)<5.0)riesgo=20;
  }
  // Si necesita una nota alta en lo que queda, es una alerta real
  if(necesita!==null){
    if(necesita>6.0)riesgo+=30;
    else if(necesita>5.0)riesgo+=15;
  }

  // El riesgo del ramo reordena, pero solo dentro del horizonte que uno puede
  // preparar: avisar de un examen a cuatro meses porque el ramo va mal es
  // volver a poner algo lejano en el lugar de "ahora".
  const riesgoAplicado=(dias>=0&&dias<=HORIZONTE_FOCO)?riesgo:0;

  // Los tres factores se MULTIPLICAN, no se suman, y ese es el arreglo de
  // fondo. Sumando, `peso*1.2` valía 36 puntos fijos para un 30%: como la
  // urgencia tiende a cero con el tiempo, el peso terminaba ganando siempre si
  // la evaluación estaba lo bastante lejos. Multiplicando, la cercanía manda y
  // el peso y el riesgo modulan: un 30% pesa un 30% más que un 0%, esté donde
  // esté, pero nunca convierte diciembre en "ahora".
  const score=urgencia*(1+peso/100)*(1+riesgoAplicado/100);

  // Nivel legible para el color de la barra. Va por DÍAS y no por el valor de
  // `urgencia`: los cortes viejos (85, 35) eran los escalones de la escala
  // anterior, y con la curva continua "urgencia>=85" pasó de significar dos
  // días a significar cinco sin que nadie lo decidiera. Los umbrales en días
  // son los mismos de antes, ahora escritos como lo que siempre fueron.
  let nivel='baja';
  if(dias<=2&&peso>=20)nivel='critica';
  else if(riesgo>=45||dias<=2)nivel='alta';
  else if(dias<=14||peso>=30)nivel='media';

  return {...e,dias,score,nivel,estadoAgenda,avg,necesita};
}

function cuandoTexto(dias){
  if(dias<0)return dias===-1?'Ayer':`Hace ${Math.abs(dias)} días`;
  if(dias===0)return 'Hoy';
  if(dias===1)return 'Mañana';
  if(dias<=7)return `En ${dias} días`;
  if(dias<=13)return `En ${dias} días`;
  if(dias<=30){const sem=Math.round(dias/7);return `En ${sem} semana${sem!==1?'s':''}`;}
  const m=Math.round(dias/30);return `En ${m} mes${m!==1?'es':''}`;
}

function agendaItemHTML(e){
  const f=formatEventDate(e.fecha);
  const peso=r2(e.cat.peso||0);
  // Aviso solo cuando aporta: ramo en riesgo o nota exigente en lo pendiente.
  // Se pinta una sola vez por ramo (ver renderAgenda) para no repetirlo.
  let alerta='';
  if(!e.mostrarAlerta){
    alerta='';
  } else if(e.avg!==null&&r2(e.avg)<4.0&&e.necesita!==null&&e.necesita<=7.05){
    alerta=`<div class="ag-alert bad"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".8" fill="currentColor"/></svg>Vas ${fmt(e.avg)} · necesitas ${nf(e.necesita)} en lo que queda</div>`;
  } else if(e.necesita!==null&&e.necesita>5.0&&e.necesita<=7.05){
    alerta=`<div class="ag-alert warn"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".8" fill="currentColor"/></svg>Necesitas ${nf(e.necesita)} en lo que queda para aprobar</div>`;
  } else if(e.necesita!==null&&e.necesita>7.05){
    alerta=`<div class="ag-alert bad"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".8" fill="currentColor"/></svg>Ya no alcanza para aprobar este ramo</div>`;
  }
  return `<button class="ag-row ${e.nivel}" onclick="openRamo('${esc(e.ramo.id)}')">
    <span class="ag-row-bar" style="background:${esc(e.ramo.color)}"></span>
    <div class="ag-row-main">
      <div class="ag-row-top">
        <span class="ag-row-when ${e.nivel}">${cuandoTexto(e.dias)}</span>
        <span class="ag-row-date">${f.day} ${f.mon}${e.hora?' · '+esc(e.hora):''}</span>
        <span class="ag-row-peso ${peso>=30?'heavy':''}">${peso}%</span>
      </div>
      <div class="ag-row-name">${esc(e.cat.nombre)}</div>
      <div class="ag-row-sub"><span class="ag-ramo-dot" style="background:${esc(e.ramo.color)}"></span>${esc(e.ramo.nombre)}${e.avg!==null?` · vas ${fmt(e.avg)}`:''}</div>
      ${alerta}
    </div>
    <span class="chevron-r">›</span>
  </button>`;
}

// ─── SERVICE WORKER ──────────────────────────────────────────────────────────
// El SW guarda copias de los archivos para que la app abra al instante y sirva
// sin internet. El costo: después de un deploy el estudiante sigue con la
// versión anterior hasta que el SW nuevo toma el control, y la página que ya
// está abierta conserva el JS viejo aunque eso pase.
//
// Sin aviso, la única forma de ver una versión nueva es recargar DOS veces —
// la primera instala el SW, la segunda sirve los archivos nuevos. Nadie hace
// eso. Por eso acá se detecta el relevo y se ofrece recargar de una.
//
// No recargamos solos a propósito: el estudiante puede estar escribiendo una
// nota, y perdérsela por una actualización es peor que ver la versión vieja un
// rato más.
function avisarActualizacion(){
  const t=document.getElementById('toast-update');
  if(t){t.classList.add('show');return;}
  const d=document.createElement('div');
  d.id='toast-update';
  d.className='update-toast show';
  d.setAttribute('role','status');
  d.innerHTML=`<span>Hay una versión nueva.</span>`;
  const b=document.createElement('button');
  b.textContent='Actualizar';
  b.onclick=()=>{try{track('sw_update_accept');}catch(e){} location.reload();};
  d.appendChild(b);
  document.body.appendChild(d);
}

if('serviceWorker' in navigator){
  // Guardado ANTES de registrar: si ya había un controlador, un relevo posterior
  // es una actualización de verdad. En la primera visita no hay ninguno y el
  // relevo es solo la instalación inicial — ahí no hay nada que avisar.
  const habiaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(habiaControlador) avisarActualizacion();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        // El aviso de arriba solo podía dispararse durante una carga de página:
        // es `register()` quien hace al navegador comprobar si sw.js cambió. En
        // la app instalada en el teléfono eso casi nunca pasa —se abre desde el
        // ícono, queda en segundo plano y se vuelve a ella sin recargar—, así
        // que alguien podía usar la versión vieja durante días sin que nada se
        // lo dijera. El aviso existía y no llegaba a aparecer nunca.
        //
        // Al volver al primer plano se le pide al navegador que revise. Si hay
        // algo nuevo, el service worker se instala, toma el control y ahí sí
        // salta `controllerchange` con el aviso.
        let ultimaRevision = Date.now();
        document.addEventListener('visibilitychange', () => {
          if(document.visibilityState !== 'visible')return;
          // Con un mínimo entre revisiones: cambiar de app y volver es un gesto
          // constante, y cada revisión es una petición de red.
          if(Date.now() - ultimaRevision < 60000)return;
          ultimaRevision = Date.now();
          reg.update().catch(() => {});
        });
      })
      .catch(err => console.warn('SW no registrado:', err));
  });
}
