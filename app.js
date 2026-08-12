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
// De quién es la caché local. Evita que un usuario vea los datos del anterior
// si comparten navegador y la carga desde la nube falla.
const CACHE_OWNER_KEY = 'gradehub_cache_owner';
function setCacheOwner(uid){try{if(uid)localStorage.setItem(CACHE_OWNER_KEY,uid);}catch(e){}}
function getCacheOwner(){try{return localStorage.getItem(CACHE_OWNER_KEY);}catch(e){return null;}}

function normalize(data) {
  // Rellena campos que podrían faltar (ediciones parciales, imports, etc.)
  data.ramos = (data.ramos || []).map(r => ({
    ...r,
    id: idSeguro(r.id),
    color: r.color || '#2563eb',
    // Créditos SCT — opcional. Si todos los ramos lo tienen, el promedio se pondera.
    creditos: (typeof r.creditos === 'number' && r.creditos > 0) ? r.creditos : null,
    // De qué catálogo (universidad + carrera) salió este ramo. null = creado a mano.
    origen: (r.origen && r.origen.tenant) ? {tenant:r.origen.tenant, carrera:r.origen.carrera||null} : null,
    categorias: (r.categorias || []).map(c => ({
      ...c,
      id: idSeguro(c.id),
      ponderaNotas: c.ponderaNotas ?? false,
      // Las evaluaciones creadas a mano antes de esto quedaron sin `directNota`
      // y se dibujaban como una lista en la que había que entrar. Se convierten
      // a fila simple SOLO si tienen 0 o 1 nota: con dos o más, la fila simple
      // mostraría una y escondería el resto, así que esas se dejan como están.
      directNota: c.directNota ?? (!c.slots && (c.notas || []).length <= 1),
      fecha: c.fecha || null, // opcional, ISO YYYY-MM-DD, se ingresa en el modal de categoría
      notas: (c.notas || []).map(n => ({
        id: idSeguro(n.id),
        nombre: n.nombre || 'Nota',
        valor: n.valor ?? (typeof n === 'number' ? n : null),
        peso: n.peso || 1,
      }))
    }))
  }));
  data.onboardingDone = Boolean(data.onboardingDone);
  data.careerSemestre = Number(data.careerSemestre) || 1;
  data.userName = data.userName || '';
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
function applyTheme(){
  aplicarModo();
  const th={...THEME_BASE,...GRADEHUB_THEME};
  const r=document.documentElement.style;
  const dark=prefersDark();
  // Acentos: valen en ambos modos
  r.setProperty('--primary',dark?(th.darkPrimary||th.primary):th.primary);
  r.setProperty('--primary-fg',dark?(th.darkPrimaryFg||th.primaryFg):th.primaryFg);
  r.setProperty('--primary-light',dark?th.darkPrimaryLight:th.primaryLight);
  r.setProperty('--accent',th.accent);
  r.setProperty('--secondary',dark?(th.darkSecondary||th.secondary||th.accent):(th.secondary||th.accent));
  r.setProperty('--green',th.success);
  r.setProperty('--yellow',th.warning);
  r.setProperty('--red',th.danger);
  // Superficies: solo en oscuro. En claro se quitan para que rija la base del CSS
  // (un fondo oscuro sobre texto oscuro sería ilegible).
  const surf=dark?th.dark:null;
  SURFACE_KEYS.forEach(k=>{
    const v=surf&&surf[k];
    if(v)r.setProperty('--'+k,v); else r.removeProperty('--'+k);
  });
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',(surf&&surf.bg)||'#05070a');
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
function carrerasFor(t){
  if(t==='uc')return CARRERAS_UC;
  if(t==='uai')return CARRERAS_UAI;
  if(t==='uandes')return CARRERAS_UANDES;
  return CARRERAS;
}
function mallaFor(t){
  if(t==='uc')return MALLA_UC;
  // Sin mallas oficiales verificadas todavía: el estudiante arma sus ramos
  if(t==='uai'||t==='uandes')return {};
  return MALLA;
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
let S={ramos:[],userName:'',careerSemestre:1,carrera:null,tenant:'fen',onboardingDone:false,historial:[],sortMode:'manual',modo:'sistema'};
let currentRamoId=null,openCats={},selectedSem=1,selectedCarrera=null,modalColor=COLORS[0];
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
// Convierte un ramo (categorias→notas) en la estructura del motor. Resultado de
// ramoAvg idéntico al cálculo histórico: no migra datos ni cambia números.
function ramoToStructure(r){
  return {__meta:{grade_scale:{min:1,max:7},rounding:{decimals:2},passing_grade:4.0},
    id:'final',name:r.nombre||'Ramo',type:'group',aggregation_rule:'weighted_average',
    children:(r.categorias||[]).map(c=>({id:c.id,name:c.nombre,weight:c.peso,type:'group',aggregation_rule:'weighted_average',
      // dropLowest viene del preset ("se elimina el 25% de los controles
      // rendidos"). Sin la clave el motor no descarta nada, así que los ramos
      // manuales y los presets que no la declaran calculan igual que siempre.
      drop_lowest:c.dropLowest||null,
      children:(c.notas||[]).map(n=>({id:n.id,name:n.nombre,weight:(n.peso||1),type:'leaf'}))}))};
}
function gradesOf(r){const g={};(r.categorias||[]).forEach(c=>(c.notas||[]).forEach(n=>{if(n.valor!==null&&n.valor!==undefined)g[n.id]=n.valor;}));return g;}

function avgPond(notas){let tv=0,tp=0;notas.forEach(n=>{if(n.valor!==null){tv+=n.valor*(n.peso||1);tp+=(n.peso||1);}});return tp>0?tv/tp:null;}
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

// ramoAvg pasa por el motor y luego aplica los pisos de nota del ramo.
// Dos tipos de compuerta:
//   min_grade_required → una evaluación bajo su mínimo topa la final en `cap`
//   group_min          → el promedio de un CONJUNTO de evaluaciones bajo su
//                        mínimo topa la final. Con cap:'self' el tope es el
//                        propio promedio del grupo (regla "la nota más baja
//                        entre los dos requisitos", común en FEN).
function ramoAvg(r){
  const res=calculateFinalGrade(ramoToStructure(r),gradesOf(r));
  let v=res.raw;
  if(v!==null && Array.isArray(r.gates)){
    for(const g of r.gates){
      if(g.type==='min_grade_required'){
        const node=res.breakdown.find(b=>b.id===g.catId);
        if(node && node.value!==null && node.value < g.min) v=Math.min(v,g.cap);
      } else if(g.type==='group_min'){
        const ga=avgDeGrupo(r,g.catIds);
        if(ga!==null && ga < g.min){
          const tope=(g.cap==='self')?ga:g.cap;
          v=Math.min(v,tope);
        }
      }
    }
  }
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
  const out=[];
  (r.gates||[]).forEach(g=>{
    if(g.type==='min_grade_required'){
      const c=(r.categorias||[]).find(x=>x.id===g.catId);
      if(!c)return;
      const a=avgPond(c.notas);
      if(a!==null&&a<g.min)out.push({nombre:g.nombre||c.nombre,actual:a,min:g.min,cap:g.cap});
    } else if(g.type==='group_min'){
      const ga=avgDeGrupo(r,g.catIds);
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
function gpaMode(ramos){
  const conNota=ramos.filter(r=>ramoAvg(r)!==null);
  if(conNota.length===0)return 'empty';
  return conNota.every(r=>typeof r.creditos==='number'&&r.creditos>0)?'creditos':'simple';
}
function gpa(ramos){
  const conNota=ramos.filter(r=>ramoAvg(r)!==null);
  if(conNota.length===0)return null;
  if(gpaMode(ramos)==='creditos'){
    let num=0,den=0;
    conNota.forEach(r=>{const a=ramoAvg(r);num+=a*r.creditos;den+=r.creditos;});
    return den>0?num/den:null;
  }
  const a=conNota.map(ramoAvg);
  return a.reduce((x,y)=>x+y,0)/a.length;
}
// Total de créditos inscritos (solo cuenta los que tienen el dato)
function totalCreditos(ramos){
  return ramos.reduce((s,r)=>s+(typeof r.creditos==='number'&&r.creditos>0?r.creditos:0),0);
}
// La precisión del PPA depende de que cada ramo ya evaluado tenga SCT. Esto
// solo identifica los datos pendientes para guiar al estudiante: no cambia
// cómo gpa() calcula ni interpreta el promedio.
function ramosSinCreditosParaPpa(ramos){
  return (ramos||[]).filter(r=>ramoAvg(r)!==null&&!(typeof r.creditos==='number'&&r.creditos>0));
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
const PASS_MIN = 8;

const SUPABASE_URL      = 'https://lsulsnswzesyekpsvlql.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JwBMAOR7iHW-gcRdLMGrYw_eCOISwqA';

let supabaseClient=null, currentUser=null, authMode='login';
try{
  if(window.supabase && SUPABASE_URL.startsWith('http')){
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  }
}catch(e){console.warn('Supabase no inicializado:',e);}

function freshState(){return{ramos:[],userName:'',careerSemestre:1,carrera:null,tenant:'fen',onboardingDone:false,historial:[],sortMode:'manual',modo:'sistema'};}

function authError(msg,kind){
  // kind: 'error' (default, rojo) | 'info' (neutro, para mensajes tipo "revisa tu correo")
  const el=document.getElementById('auth-error');
  el.textContent=msg||'';
  el.style.display=msg?'block':'none';
  el.style.color=kind==='info'?'var(--fg2)':'var(--red)';
}
function toggleAuthMode(){
  authMode=authMode==='login'?'signup':'login';
  document.getElementById('auth-sub').textContent=authMode==='login'?'Tus notas, tu promedio y cuánto te falta para aprobar.':'Crea tu cuenta gratis y guarda tus notas en la nube.';
  document.getElementById('auth-btn').textContent=authMode==='login'?'Iniciar sesión':'Crear cuenta';
  document.getElementById('auth-toggle').textContent=authMode==='login'?'¿No tienes cuenta? Crea una':'¿Ya tienes cuenta? Inicia sesión';
  document.getElementById('auth-pass').setAttribute('autocomplete',authMode==='login'?'current-password':'new-password');
  // Al iniciar sesión no se anuncia un mínimo: sería mentirle a quien creó su
  // cuenta cuando el mínimo era otro.
  document.getElementById('auth-pass').placeholder=authMode==='login'?'Tu contraseña':'Mínimo '+PASS_MIN+' caracteres';
  document.getElementById('auth-fp').style.display=authMode==='login'?'block':'none';
  authError('');
}
function showAuthScreen(){
  ['home','stats','agenda','ramo','onboard','reset'].forEach(s=>{const el=document.getElementById('screen-'+s);if(el)el.classList.remove('active');});
  document.getElementById('bottom-nav').style.display='none';
  document.getElementById('screen-auth').classList.add('active');
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
  obStep=1;obRender();
}
function enterApp(){
  document.getElementById('screen-auth').classList.remove('active');
  document.getElementById('screen-onboard').classList.remove('active');
  showMainApp();
}

function traduceAuthError(e){
  const m=((e&&e.message)||'').toLowerCase();
  if(m.includes('already')||m.includes('exists'))return 'Ese usuario ya existe. Inicia sesión.';
  if(m.includes('invalid login')||m.includes('credentials'))return 'Usuario o contraseña incorrectos.';
  if(m.includes('password'))return 'Contraseña inválida (mínimo 6 caracteres).';
  return 'No se pudo conectar. Revisa tu internet e intenta de nuevo.';
}

async function submitAuth(){
  const email=(document.getElementById('auth-user').value||'').trim().toLowerCase();
  const p=document.getElementById('auth-pass').value;
  authError('');
  const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(!emailRe.test(email)){authError('Ingresa un correo electrónico válido.');return;}
  // El mínimo se exige SOLO al crear la cuenta. Al iniciar sesión no se valida
  // el largo: quien se registró cuando el mínimo era 6 tiene que poder entrar,
  // y validarlo acá lo dejaría fuera de su propia cuenta con un error engañoso.
  if(authMode==='signup' && p.length<PASS_MIN){authError('La contraseña debe tener al menos '+PASS_MIN+' caracteres.');return;}
  if(!p){authError('Escribe tu contraseña.');return;}
  if(!supabaseClient){authError('Falta configurar Supabase (URL y clave) en el código.');return;}

  const btn=document.getElementById('auth-btn');const orig=btn.textContent;
  btn.disabled=true;btn.textContent='Cargando...';
  try{
    if(authMode==='signup'){
      const {data,error}=await supabaseClient.auth.signUp({email,password:p});
      if(error)throw error;
      if(data.user && Array.isArray(data.user.identities) && data.user.identities.length===0){
        authError('Ya existe una cuenta con ese correo. Inicia sesión.');btn.disabled=false;btn.textContent=orig;return;
      }
      if(!data.session){authError('Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.','info');btn.disabled=false;btn.textContent=orig;return;}
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
  if(p1.length<PASS_MIN){err.textContent='La contraseña debe tener al menos '+PASS_MIN+' caracteres.';err.style.display='block';return;}
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
      carrera:S.carrera||null,
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
    else {document.getElementById('screen-onboard').classList.add('active');obStep=1;obRender();}
    return;
  }
  // Suscribirse a cambios de auth: el evento PASSWORD_RECOVERY viene cuando
  // el usuario abre el link del correo de "olvidé mi contraseña".
  supabaseClient.auth.onAuthStateChange((event, session)=>{
    if(event==='PASSWORD_RECOVERY'){
      if(session)currentUser=session.user;
      showResetScreen();
    }
  });
  try{
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(session){
      currentUser=session.user;
      // Si venimos de un correo de recuperación, la URL trae "type=recovery" en el hash.
      // Mostrar la pantalla de nueva contraseña en vez de entrar directo a la app.
      if(location.hash.includes('type=recovery')){showResetScreen();return;}
      // Al volver de OAuth el hash trae los tokens: se limpia para no dejarlos a la vista
      if(location.hash.includes('access_token')){
        try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
      }
      await afterLogin();return;
    }
  }catch(e){}
  showAuthScreen();
}

// ─── INIT ────────────────────────────────────────────────────────────────────
const {data:loaded} = loadData();
if(loaded){S={...S,...loaded};}
selectedTenant=S.tenant||'fen';applyTheme();
// Estado del onboarding por pasos. Va acá y no junto a sus funciones porque
// boot() lo usa al arrancar: con `let` más abajo caía en la zona muerta temporal
// y la app crasheaba si Supabase no cargaba.
let obStep=1;
const OB_TOTAL=5;
let obRamos=[],obRamosKey='',obManualOpen=false;

initSemGrid();renderTenantPick();initCarreraGrid();
document.getElementById('ob-name').addEventListener('input',checkOb);
boot();

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
function initCarreraGrid(){
  const g=document.getElementById('carrera-grid');if(!g)return;g.innerHTML='';
  Object.entries(carrerasFor(selectedTenant)).forEach(([code,label])=>{
    const b=document.createElement('button');
    b.className='carrera-opt'+(code===selectedCarrera?' sel':'');
    b.textContent=label;
    b.onclick=()=>{
      selectedCarrera=code;initCarreraGrid();checkOb();
      if(typeof obStep!=='undefined' && obStep===3 && document.getElementById('screen-onboard').classList.contains('active')){
        setTimeout(()=>{if(obStep===3)obNext();},260);
      }
    };
    g.appendChild(b);
  });
}
// ─── ONBOARDING POR PASOS ────────────────────────────────────────────────────

// La validación es independiente por paso: la lista sugerida nunca obliga a
// tomar un ramo, y cada pantalla solo exige su propio dato.
function obStepValid(step,datos){
  const d=datos||{
    nombre:(document.getElementById('ob-name')||{}).value||'',
    tenant:selectedTenant,carrera:selectedCarrera,semestre:selectedSem
  };
  if(step===1)return !!String(d.nombre||'').trim();
  if(step===2)return !!d.tenant;
  if(step===3)return !!d.carrera;
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
function obToggleManual(){obManualOpen=!obManualOpen;renderObCoursePicker();}
function obAgregarManual(){
  const input=document.getElementById('ob-manual-name');
  const nombre=(input&&input.value||'').trim();if(!nombre)return;
  if(!obTieneRamo(nombre))obRamos.push({nombre,manual:true});
  obManualOpen=false;renderObCoursePicker();obRender();
}
function renderObCoursePicker(){
  const box=document.getElementById('ob-course-picker');if(!box)return;
  const sugeridos=obRamosActuales();
  const rows=sugeridos.length?sugeridos.map(nombre=>`
    <label style="display:flex;align-items:center;gap:11px;padding:10px 2px;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" ${obTieneRamo(nombre)?'checked':''} onchange="obToggleRamoCodificado('${encodeURIComponent(nombre)}',this.checked)" style="width:18px;height:18px;flex-shrink:0;accent-color:var(--primary);"/>
      <span style="font-size:14px;color:var(--fg);">${esc(nombre)}</span>
    </label>`).join(''):
    '<p class="course-picker-reassurance">No encontramos ramos sugeridos para este semestre. Puedes buscarlos o agregarlos a mano.</p>';
  box.innerHTML=`
    <div class="course-picker">
      <p class="course-picker-intro">Partimos con una sugerencia según tu avance. Puedes sumar ramos de cualquier otro semestre.</p>
      <div class="course-picker-section">
        <label class="modal-label">Sugeridos para ${selectedSem}° semestre</label>
        ${rows}
      </div>
      <div class="course-picker-section">
        <label class="modal-label" for="ob-course-search">Buscar otro ramo</label>
        <div class="course-picker-search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><input id="ob-course-search" type="text" placeholder="Ej.: Inglés IV, Cálculo II" maxlength="40" autocomplete="off" autocapitalize="none"/></div>
        <div id="ob-course-results"></div>
      </div>
      <button class="course-picker-manual" type="button" onclick="obToggleManual()">¿No aparece? Agregar un ramo a mano</button>
      ${obManualOpen?'<div class="course-picker-search" style="margin-top:8px;"><input id="ob-manual-name" type="text" placeholder="Ej.: Electivo de cine" maxlength="40" autocomplete="off"/><button type="button" onclick="obAgregarManual()" style="border:0;background:none;color:var(--primary);font:inherit;font-weight:700;">Agregar</button></div>':''}
    </div>`;
  const search=document.getElementById('ob-course-search');
  if(search){const pintar=()=>renderObCourseResults(search.value);search.addEventListener('input',pintar);pintar();}
  const manual=document.getElementById('ob-manual-name');
  if(manual)manual.addEventListener('keydown',e=>{if(e.key==='Enter')obAgregarManual();});
}
function renderObCourseResults(q){
  const box=document.getElementById('ob-course-results');if(!box)return;
  const term=(q||'').trim();if(!term){box.innerHTML='';return;}
  const res=searchCatalog(term,selectedTenant,selectedCarrera,selectedSem).slice(0,6);
  if(!res.length){box.innerHTML='<p class="course-picker-reassurance">No aparece en tu malla. Puedes agregarlo a mano.</p>';return;}
  box.innerHTML=res.map(r=>{
    const tengo=obTieneRamo(r.nombre),otro=r.semestre!==selectedSem;
    return `<button class="course-picker-result" type="button" ${tengo?'disabled':`onclick="obAgregarCatalogoCodificado('${encodeURIComponent(r.nombre)}')"`}>
      <span class="course-picker-result-info"><span class="course-picker-result-name">${esc(r.nombre)}</span><span class="course-picker-result-meta">${r.semestre}° semestre${r.tienePreset?' · con ponderaciones oficiales':''}</span></span>
      <span class="chevron-r">${tengo?'✓':'+'}</span>
    </button>${otro?'<p class="course-picker-reassurance">Que sea de otro semestre está bien.</p>':''}`;
  }).join('');
}

function obRender(){
  if(obStep===5)prepararObRamos();
  document.querySelectorAll('.ob-step').forEach(el=>{
    el.style.display=(Number(el.dataset.step)===obStep)?'block':'none';
  });
  const bar=document.getElementById('ob-progress-bar');
  if(bar)bar.style.width=obProgressPct(obStep)+'%';
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

function completeOnboarding(){
  const name=document.getElementById('ob-name').value.trim();if(!name||!selectedCarrera)return;
  S.userName=name;S.careerSemestre=selectedSem;S.carrera=selectedCarrera;S.tenant=selectedTenant;
  obRamos.forEach(item=>{
    if(S.ramos.some(r=>normName(r.nombre)===normName(item.nombre)))return;
    const preset=!item.manual?presetRamo(item.nombre,selectedTenant,selectedCarrera):null;
    S.ramos.push({id:uid(),nombre:item.nombre,color:nextRamoColor(item.nombre),origen:item.manual?null:origenActual(),creditos:creditosDe(item.nombre,selectedTenant,preset),categorias:preset?preset.categorias:[],gates:preset?preset.gates:[]});
  });
  S.onboardingDone=true;save();
  syncProfile();
  track('onboarding_complete',{semestre:selectedSem,carrera:selectedCarrera,ramos:obRamos.length});
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
        <p style="font-size:13px;color:var(--fg2);line-height:1.5;margin:0;">Cuando tengas tu carga, agrégala desde la malla o busca cada ramo.</p>
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
      <p style="font-size:13px;color:var(--fg2);line-height:1.5;margin:0;">${detalle}</p>
      ${oficiales?`<p style="font-size:12px;color:var(--fg3);margin:2px 0 0;">${ramosTxt}</p>`:''}
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

function renderHome(){
  const g=gpa(S.ramos);
  const gpael=document.getElementById('home-gpa');
  const emptyHint=document.getElementById('gpa-empty-hint');
  const gpaSub=document.getElementById('home-gpa-sub');
  const ramosHd=document.getElementById('ramos-hd');
  const tagsEl=document.getElementById('gpa-tags');
  const deltaEl=document.getElementById('gpa-delta');
  const first=(S.userName||'').split(' ')[0]||'';
  document.getElementById('home-greeting').innerHTML=`${greeting()}${first?', <span class="greet-name">'+esc(first)+'</span>':''}`;
  refreshAvatar();
  // Glifo de la universidad junto al wordmark
  const bg=document.getElementById('brand-glyph');
  if(bg){
    bg.innerHTML=tenantGlyphBare(S.tenant);
    const t=TENANTS[S.tenant];
    bg.title=t?t.name:'';
  }

  const sortBtn=document.getElementById('sort-btn');
  if(sortBtn){
    const labels={manual:'Manual ↕',avg:'Por nota ↓',name:'A-Z'};
    sortBtn.textContent=labels[S.sortMode]||labels.manual;
  }

  const simGlobalBtn=document.getElementById('sim-global-btn');
  if(S.ramos.length===0){
    gpael.textContent='·';gpael.className='gpa-num empty';
    gpaSub.style.display='none';emptyHint.style.display='block';
    if(tagsEl)tagsEl.style.display='none';
    if(deltaEl)deltaEl.style.display='none';
    if(simGlobalBtn)simGlobalBtn.style.display='none';
    const mb=document.getElementById('gpa-malla-btn');
    if(mb)mb.style.display=mallaFaltantes().length?'inline-flex':'none';
    ramosHd.style.display='none';document.getElementById('home-ramos').innerHTML='';return;
  }
  emptyHint.style.display='none';gpaSub.style.display='block';ramosHd.style.display='flex';
  // El simulador global tiene sentido con 2+ ramos (con 1 es igual al del ramo)
  if(simGlobalBtn)simGlobalBtn.style.display=S.ramos.length>=2?'flex':'none';

  if(g!==null){
    // Redondear a 1 decimal (formato universitario CL). Al tocar → exacto + distancia.
    // Siempre 1 decimal (5.0 no 5). Decimal atenuado con el mismo gradient.
    const rounded=nf(g); // ej "5.0" o "4.7"
    const sep=rounded.indexOf('.');
    const entera=rounded.slice(0,sep);
    const decimal=rounded.slice(sep);
    gpael.innerHTML=`${entera}<span class="gpa-decimal">${decimal}</span>`;
    gpael.className='gpa-num '+colorClass(g)+claseNotaEspecial(g);
    gpael.style.setProperty('--grade-color',getColor(g));
    gpael.onclick=()=>{
      const exacto=nf(g,2);
      const umbrales=[4.0,5.0,6.0,7.0];
      const next=umbrales.find(u=>u>g+0.005);
      let msg=`Exacto: ${exacto}`;
      if(next!==undefined){
        msg+=`  ·  ${nf(next-g,2)} para el ${nf(next)}`;
      }else{
        msg+=`  ·  máximo`;
      }
      // Transparencia: que se entienda si está ponderado por créditos o no
      msg+=gpaMode(S.ramos)==='creditos'?'\nPonderado por créditos':'\nPromedio simple · agrega créditos para ponderar';
      showToast(msg);
    };
    if(pendingGpaFeedback&&Math.abs(pendingGpaFeedback.despues-g)<.0001){
      animarPromedio(gpael,pendingGpaFeedback.antes,pendingGpaFeedback.despues,'gpa');
      pendingGpaFeedback=null;
    }
  }else{
    gpael.textContent='·';gpael.className='gpa-num empty';gpael.onclick=null;
  }
  const cr=totalCreditos(S.ramos);
  const modo=gpaMode(S.ramos);
  gpaSub.textContent=`${semester()} · ${S.ramos.length} ${S.ramos.length===1?'ramo':'ramos'}`
    +(modo==='creditos'?` · ${cr} créditos`:'');

  // Chips de estado — contexto exclusivo del promedio general
  if(tagsEl){
    let good=0,warn=0,bad=0,pend=0;
    S.ramos.forEach(r=>{const a=ramoAvg(r);if(a===null)pend++;else if(r2(a)>=5.0)good++;else if(r2(a)>=4.0)warn++;else bad++;});
    const parts=[];
    if(good)parts.push(`<span class="gpa-tag"><span class="gpa-tag-dot good"></span>${good} aprobado${good!==1?'s':''}</span>`);
    if(warn)parts.push(`<span class="gpa-tag"><span class="gpa-tag-dot warn"></span>${warn} en riesgo</span>`);
    if(bad)parts.push(`<span class="gpa-tag"><span class="gpa-tag-dot bad"></span>${bad} bajo 4.0</span>`);
    if(pend)parts.push(`<span class="gpa-tag"><span class="gpa-tag-dot neutral"></span>${pend} pendiente${pend!==1?'s':''}</span>`);
    tagsEl.innerHTML=parts.join('');
    tagsEl.style.display=parts.length?'flex':'none';
  }

  // Delta vs último semestre archivado (si existe)
  if(deltaEl){
    const last=ultimoHistorialConGpa(S.historial);
    const lastGpa=last?last.gpa:null;
    if(g!==null && lastGpa!==null){
      const diff=g-lastGpa;const abs=Math.abs(diff);
      const kind=abs<0.05?'flat':diff>0?'up':'down';
      const arrow=kind==='up'?'↑':kind==='down'?'↓':'·';
      deltaEl.className='gpa-delta '+kind;
      deltaEl.innerHTML=`${arrow} ${nf(abs,2)}`;
      deltaEl.title=`vs ${last.label||'semestre anterior'}`;
      deltaEl.style.display='inline-flex';
    }else{
      deltaEl.style.display='none';
    }
  }

  // Insight cards (arriba de la lista de ramos): próxima prueba, riesgo, última nota
  const insightsEl=document.getElementById('home-insights');
  if(insightsEl){
    const cards=[];
    const ne=nextExam();
    if(ne){
      const daysLabel=ne.daysUntil===0?'hoy':ne.daysUntil===1?'mañana':`en ${ne.daysUntil} días`;
      cards.push(`
        <div class="insight-card" style="--insight-color:${esc(ne.ramo.color)}" onclick="openRamo('${esc(ne.ramo.id)}')">
          <div class="insight-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/></svg></div>
          <div class="insight-body">
            <div class="insight-label">Próxima evaluación</div>
            <div class="insight-title">${esc(ne.cat.nombre)} · ${esc(ne.ramo.nombre)}</div>
            <div class="insight-meta"><span class="strong">${daysLabel}</span></div>
          </div>
          <span class="chevron-r">›</span>
        </div>`);
    }
    const risky=mostRiskyRamo();
    if(risky){
      const warnColor=r2(risky.avg)<4.0?'#ff7a8f':'#ffcf5c';
      cards.push(`
        <div class="insight-card" style="--insight-color:${warnColor}" onclick="openRamo('${esc(risky.ramo.id)}')">
          <div class="insight-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".8" fill="currentColor"/></svg></div>
          <div class="insight-body">
            <div class="insight-label">Ramo en riesgo</div>
            <div class="insight-title">${esc(risky.ramo.nombre)}</div>
            <div class="insight-meta">Necesitas <span class="strong">${nf(risky.needed)}</span> promedio en lo pendiente para aprobar</div>
          </div>
          <span class="chevron-r">›</span>
        </div>`);
    }
    // Si falta SCT en ramos ya evaluados, el promedio visible es simple. Llevo
    // directo al editor del primer ramo pendiente para completar el dato.
    const sinCreditos=ramosSinCreditosParaPpa(S.ramos);
    const maxInsights=2;
    if(g!==null&&sinCreditos.length>0&&cards.length<maxInsights){
      const primero=sinCreditos[0];
      cards.push(`
        <div class="insight-card" style="--insight-color:var(--primary)" onclick="openRamo('${esc(primero.id)}');setTimeout(openEditRamoModal,320)">
          <div class="insight-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18"/><path d="M3 8h18"/><path d="M4 8l2 10h12l2-10"/><path d="M8 8l1-4h6l1 4"/></svg></div>
          <div class="insight-body">
            <div class="insight-label">PPA más preciso</div>
            <div class="insight-title">Agrega créditos a ${sinCreditos.length===1?esc(primero.nombre):`${sinCreditos.length} ramos`}</div>
            <div class="insight-meta">Ahora tu promedio es simple · toca para corregirlo</div>
          </div>
          <span class="chevron-r">›</span>
        </div>`);
    }
    // Última nota: solo la muestro si NO hay próxima ni riesgo (para no saturar)
    if(cards.length===0){
      const lg=latestGrade();
      if(lg){
        const noteColor=getColor(lg.nota.valor);
        cards.push(`
          <div class="insight-card" style="--insight-color:${noteColor}" onclick="openRamo('${esc(lg.ramo.id)}')">
            <div class="insight-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
            <div class="insight-body">
              <div class="insight-label">Última nota</div>
              <div class="insight-title">${esc(lg.cat.nombre)} · ${esc(lg.ramo.nombre)}</div>
              <div class="insight-meta"><span class="strong">${nf(lg.nota.valor)}</span></div>
            </div>
            <span class="chevron-r">›</span>
          </div>`);
      }
    }
    insightsEl.innerHTML=cards.join('');
    insightsEl.style.display=cards.length?'block':'none';
  }

  let ramos=[...S.ramos];
  if(S.sortMode==='avg') ramos.sort((a,b)=>{const da=ramoAvg(a)??-1,db=ramoAvg(b)??-1;return db-da;});
  else if(S.sortMode==='name') ramos.sort((a,b)=>a.nombre.localeCompare(b.nombre));

  const c=document.getElementById('home-ramos');c.innerHTML='';
  ramos.forEach(r=>{
    const avg=ramoAvg(r);const nc=r.categorias.length;
    const nn=r.categorias.reduce((a,c)=>a+c.notas.length,0);
    const prog=ramoProgress(r);
    let metaHtml;
    if(nc===0){
      metaHtml=`<span class="ramo-meta-text">Sin evaluaciones</span>`;
    } else if(nn===0){
      metaHtml=`<span class="ramo-meta-text">${nc} ${nc===1?'evaluación':'evaluaciones'}</span>`;
    } else {
      const pctLabel=prog.pct===100?'completo':`${prog.pct}% evaluado`;
      metaHtml=`<div class="ramo-progress" aria-hidden="true"><div class="ramo-progress-fill" style="width:${prog.pct}%"></div></div><span class="ramo-meta-text">${pctLabel}</span>`;
    }
    const div=document.createElement('div');div.className='ramo-row';div.onclick=()=>openRamo(r.id);
    div.style.setProperty('--ramo-tint',r.color);
    div.innerHTML=`
      <div class="ramo-band" style="background:${esc(r.color)}"></div>
      <div class="ramo-info"><div class="ramo-name">${esc(r.nombre)}</div><div class="ramo-meta">${metaHtml}</div></div>
      <div class="ramo-nota ${colorClass(avg)}" style="--grade-color:${getColor(avg)}">${fmt(avg)}</div><span class="chevron-r">›</span>`;
    c.appendChild(div);
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
function renderRamo(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r){goHome();return;}
  document.getElementById('grade-gpa-echo')?.remove();
  document.getElementById('ramo-title').textContent=r.nombre;
  const avg=ramoAvg(r);
  const calculo=calculateFinalGrade(ramoToStructure(r),gradesOf(r));
  const descartes=calculo.drops||[];
  const avgEl=document.getElementById('ramo-hero-avg');
  if(avg!==null){
    const s=nf(avg);const dot=s.indexOf('.');
    avgEl.innerHTML=`${s.slice(0,dot)}<span class="ramo-decimal">${s.slice(dot)}</span>`;
    avgEl.className='ramo-num '+colorClass(avg)+claseNotaEspecial(avg);
    avgEl.style.setProperty('--grade-color',getColor(avg));
  } else {
    avgEl.textContent='Sin notas';avgEl.className='ramo-num empty';
  }
  const tp=r.categorias.reduce((a,c)=>a+c.peso,0);
  const crTxt=r.creditos?` · ${r.creditos} créditos`:'';
  document.getElementById('ramo-hero-sub').textContent=r.categorias.length===0
    ?('Agrega evaluaciones para comenzar'+crTxt)
    :`${r.categorias.length} ${r.categorias.length===1?'evaluación':'evaluaciones'} · ${r2(tp)}% ponderado${crTxt}`;

  // Chip nota mínima para el 4.0
  const chipEl=document.getElementById('ramo-min-chip');
  if(r.categorias.length>0){
    const totalPeso=r.categorias.reduce((a,c)=>a+c.peso,0);
    let pesoConNotas=0,sumaPonderada=0;
    r.categorias.forEach(c=>{const a=avgPond(c.notas);if(a!==null){pesoConNotas+=c.peso;sumaPonderada+=a*c.peso;}});
    const pesoSinNotas=totalPeso-pesoConNotas;
    // ¿Hay un piso de nota activo? (sección calificada bajo su mínimo → topa la final)
    const gateHit=gatesActivas(r)[0]||null;
    const pctPendiente=totalPeso>0?Math.round(pesoSinNotas/totalPeso*100):0;
    if(gateHit){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip bad';
      chipEl.textContent=gateHit.grupo
        ? `${gateHit.nombre} va ${fmt(gateHit.actual)} (mín. ${nf(gateHit.min)}): topa tu nota final`
        : `${gateHit.nombre} bajo ${nf(gateHit.min)}: repruebas pese al promedio`;
    } else if(pesoSinNotas===0 && avg!==null && r2(avg)>=4.0){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip good';chipEl.textContent='✓ Aprobado';
    } else if(pesoSinNotas===0){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip bad';chipEl.textContent='✕ Reprobado';
    } else if(totalPeso>0){
      const needed=(4.0*totalPeso-sumaPonderada)/pesoSinNotas;
      if(avg!==null && needed<=1.0){
        // Ya no puede reprobar con lo pendiente → aprobación asegurada
        chipEl.style.display='inline-flex';
        chipEl.className='ramo-chip good';chipEl.textContent=`Va aprobando · falta ${pctPendiente}%`;
      } else if(needed>7){
        chipEl.style.display='inline-flex';
        chipEl.className='ramo-chip bad';chipEl.textContent='Ya no es posible aprobar';
      } else {
        chipEl.style.display='inline-flex';
        chipEl.className='ramo-chip warn';chipEl.textContent=`Necesitas ${nf(needed)} en lo pendiente para aprobar`;
      }
    } else {chipEl.style.display='none';}
  } else {chipEl.style.display='none';}

  // Mostrar botones calculadora y simulador si hay secciones
  const hayCats=r.categorias.length>0;
  document.getElementById('calc-btn').style.display=hayCats?'inline-flex':'none';
  document.getElementById('sim-btn').style.display=hayCats?'inline-flex':'none';

  // Advertencia de ponderación
  const pw=document.getElementById('peso-warning');
  if(r.categorias.length>0 && Math.abs(tp-100)>0.05){
    pw.style.display='flex';pw.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg> Las evaluaciones suman <b style="margin:0 3px;">${r2(tp)}%</b> — ajústalas para que sumen 100%`;
  } else {pw.style.display='none';}

  // Algunas reglas del programa no caben aún en el motor. El promedio no está
  // "malo": simplemente no incorpora esas excepciones oficiales.
  const ncw=document.getElementById('no-calcula-warning');
  const noCalcula=reglasNoCalculadas(r);
  const delCurso=reglasDelCurso(r);
  if(noCalcula.length||delCurso.length){
    ncw.style.display='flex';ncw.className='weight-setup-nudge';
    const items=lista=>`<ul style="margin:6px 0 0;padding-left:17px;">${lista.map(regla=>`<li>${esc(regla)}</li>`).join('')}</ul>`;
    const bloques=[];
    if(delCurso.length)bloques.push(`<b>Reglas de tu curso que el promedio no incluye.</b><br>Están en el programa, pero dependen de información que la app no puede tener:${items(delCurso)}`);
    if(noCalcula.length)bloques.push(`<b>Reglas que todavía no calculamos.</b><br>Las vamos a incorporar. Por ahora el promedio no considera:${items(noCalcula)}`);
    ncw.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></svg><div>${bloques.join('<div style="height:10px;"></div>')}<span style="display:block;margin-top:6px;">Compáralo con la pauta del curso.</span></div>`;
  }else{ncw.style.display='none';ncw.innerHTML='';}

  // Reportar la pauta vivía escondido al fondo del modal de "Editar ramo",
  // debajo de Guardar y Cancelar. Nadie entra a editar el nombre de un ramo para
  // avisar que su pauta está mal. Va acá, al pie de las evaluaciones, que es
  // donde el estudiante se da cuenta.
  const rep=document.getElementById('ramo-report');
  if(rep){
    // Sin evaluaciones no hay nada que enviar: el reporte ES la estructura.
    if(r.categorias.length){
      rep.style.display='flex';
      rep.onclick=()=>openReportModal(r.id);
    }else{rep.style.display='none';rep.onclick=null;}
  }

  const cl=document.getElementById('cat-list');cl.innerHTML='';
  if(r.categorias.length===0){
    // Un ramo del catálogo sin pauta oficial NO es lo mismo que uno que el
    // estudiante creó a mano. En el primero la app le prometió el ramo y le
    // quedó debiendo las evaluaciones, y decírselo es más honesto que un
    // "Sin evaluaciones" que parece que él no hizo algo.
    const delCatalogo=!!(r.origen&&r.origen.tenant)&&!presetRamo(r.nombre,r.origen.tenant,r.origen.carrera);
    const titulo=delCatalogo?'Todavía no tenemos la pauta de este ramo':'Sin evaluaciones';
    const sub=delCatalogo
      ? 'Disculpa: el ramo está en la malla pero su pauta oficial todavía no. Agrega tus evaluaciones con su porcentaje y el promedio funciona igual — y después puedes reportárnosla para que la tengan los demás.'
      : 'Agrega tus pruebas, controles o tareas con su porcentaje del ramo. Puedes incluir la fecha para que aparezcan en la Agenda.';
    cl.innerHTML=`<div class="empty" style="padding:32px 20px;">
      <div class="empty-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div>
      <div class="empty-title">${titulo}</div>
      <div class="empty-sub">${sub}</div>
    </div>`;
  }
  r.categorias.forEach(cat=>{
    const fechaChip=cat.fecha?`<span class="cat-fecha-chip">${esc(fechaCorta(cat.fecha))}</span>`:'';
    // Sección de preset: fila directa, solo escribir la nota (estilo simulador)
    if(cat.directNota){
      // Preset con varios espacios (ej: Laboratorio = 3 notas que se promedian) — COLAPSABLE
      if(cat.slots&&cat.slots>1){
        const av=avgPond(cat.notas);const isOpen=openCats[cat.id];
        const wrap=document.createElement('div');wrap.className='eval-group';
        if(av!=null)wrap.style.borderLeftColor=getColor(av);
        let rows='';
        for(let i=0;i<cat.slots;i++){
          const nota=cat.notas.find(n=>n.slot===i);const v=(nota&&nota.valor!=null)?nota.valor:null;
          rows+=`<div class="eval-sub">
            <span class="eval-sub-name">${esc(cat.nombre)} ${i+1}</span>
            <input class="eval-row-input sm" inputmode="decimal" maxlength="3" placeholder="—" value="${v!=null?fmt(v):''}" style="color:${v!=null?getColor(v):'var(--fg)'}" onchange="setSlotNota('${cat.id}',${i},this.value)" onclick="event.stopPropagation();" aria-label="${esc(cat.nombre)} ${i+1}"/>
          </div>`;
        }
        const notasCount=cat.notas.length;
        wrap.innerHTML=`
          <div class="eval-group-hd" role="button" tabindex="0" aria-expanded="${isOpen?'true':'false'}" onclick="toggleCat('${cat.id}')">
            <div style="flex:1;min-width:0;">
              <div class="eval-row-name">${esc(cat.nombre)}</div>
              <div class="eval-row-weight">${r2(cat.peso)}% · promedio de ${cat.slots}${notasCount?` · ${notasCount}/${cat.slots} ingresadas`:''}${fechaChip?' · '+fechaChip:''}</div>
            </div>
            <div class="ramo-nota ${colorClass(av)}" style="--grade-color:${getColor(av)};min-width:auto;font-size:19px;">${fmt(av)}</div>
            <span aria-hidden="true" style="color:var(--fg3);font-size:11px;margin-left:6px;">${isOpen?'▲':'▼'}</span>
          </div>
          <div class="eval-group-body${isOpen?' open':''}">${rows}</div>`;
        cl.appendChild(wrap);
        return;
      }
      const g=cat.notas[0]?cat.notas[0].valor:null;
      const row=document.createElement('div');row.className='eval-row';
      if(g!=null)row.style.borderLeftColor=getColor(g);
      row.innerHTML=`
        <div class="eval-row-info" role="button" tabindex="0" onclick="openEditCatModal('${cat.id}')" style="cursor:pointer;">
          <div class="eval-row-name">${esc(cat.nombre)}</div>
          <div class="eval-row-weight">${r2(cat.peso)}% de la nota final${fechaChip?' · '+fechaChip:''}</div>
        </div>
        <input class="eval-row-input" inputmode="decimal" maxlength="3" placeholder="—" value="${g!=null?fmt(g):''}" style="color:${g!=null?getColor(g):'var(--fg)'}" onchange="setDirectNota('${cat.id}',this.value)" onclick="event.stopPropagation();" aria-label="Nota de ${esc(cat.nombre)}"/>`;
      cl.appendChild(row);
      return;
    }
    const descarte=descartes.find(d=>d.nodeId===cat.id);
    const calculoCategoria=calculo.breakdown.find(b=>b.id===cat.id);
    const catAvg=calculoCategoria?.value??avgPond(cat.notas);
    const isOpen=openCats[cat.id]===undefined?!!descarte:openCats[cat.id];
    const notasDescartadas=new Set((descarte?.dropped||[]).map(n=>n.id));
    const explicacionDescarte=descarte?`<div class="drop-rule-note">${esc(textoDescarte(cat,descarte))}</div>`:'';
    const card=document.createElement('div');card.className='cat-card';
    const notasHTML=cat.notas.length===0?
      `<p style="font-size:13px;color:var(--fg3);text-align:center;padding:10px 0;">Sin notas aún</p>`:
      cat.notas.map(n=>{
        const descartada=notasDescartadas.has(n.id);
        return `
        <div class="nota-row${descartada?' nota-row-dropped':''}">
          <button class="nota-row-name" aria-label="Editar nota ${esc(n.nombre)}" onclick="openEditNotaModal('${cat.id}','${n.id}');event.stopPropagation();" style="background:none;border:none;cursor:pointer;text-align:left;padding:0;font-family:inherit;font-size:14px;color:var(--fg2);flex:1;">${esc(n.nombre)}</button>
          ${n.peso!==1?`<span class="nota-row-pond">${n.peso}%</span>`:''}
          ${descartada?'<span class="nota-row-drop-tag">No cuenta</span>':''}
          <span class="nota-row-val" style="color:${getColor(n.valor)}">${fmt(n.valor)}</span>
          <button class="nota-row-del" aria-label="Eliminar nota ${esc(n.nombre)}" onclick="deleteNota('${cat.id}','${n.id}');event.stopPropagation();">✕</button>
        </div>`;
      }).join('');
    card.innerHTML=`
      <div class="cat-header">
        <div class="cat-info" role="button" tabindex="0" onclick="openEditCatModal('${cat.id}')" onkeydown="if(event.key==='Enter'){openEditCatModal('${cat.id}')}" style="cursor:pointer;">
          <div class="cat-name">${esc(cat.nombre)}</div>
          <div class="cat-peso-tag">${cat.peso}% del ramo · ${cat.notas.length} nota${cat.notas.length!==1?'s':''}${fechaChip?' · '+fechaChip:''}</div>
        </div>
        <span style="font-size:16px;font-weight:700;color:${getColor(catAvg)}">${fmt(catAvg)}</span>
        <button aria-label="Eliminar evaluación ${esc(cat.nombre)}" style="background:var(--red-bg);border:none;border-radius:8px;padding:5px 8px;cursor:pointer;color:var(--red);font-size:13px;" onclick="confirmDeleteCat('${cat.id}');event.stopPropagation();"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
        <button aria-label="${isOpen?'Colapsar':'Expandir'} ${esc(cat.nombre)}" aria-expanded="${isOpen?'true':'false'}" style="background:var(--muted);border:none;border-radius:8px;padding:5px 8px;cursor:pointer;color:var(--fg2);font-size:11px;" onclick="toggleCat('${cat.id}');event.stopPropagation();">${isOpen?'▲':'▼'}</button>
      </div>
      <div class="cat-body${isOpen?' open':''}">
        ${explicacionDescarte}
        ${notasHTML}
        <button class="add-nota-btn" onclick="openAddNotaModal('${cat.id}');event.stopPropagation();">+ Agregar nota</button>
      </div>`;
    cl.appendChild(card);
  });
}

// Formato corto de fecha para chips: "15 mar"
function fechaCorta(iso){
  const meses=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const d=new Date(iso+'T00:00:00');
  return `${d.getDate()} ${meses[d.getMonth()]}`;
}
function toggleCat(id){openCats[id]=!openCats[id];renderRamo();}
// Nota por espacio en secciones multi-nota (ej: Laboratorio 1/2/3).
function setSlotNota(catId,slot,raw){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  const cat=r.categorias.find(c=>c.id===catId);if(!cat)return;
  const promedioAntes=ramoAvg(r);const gpaAntes=gpa(S.ramos);
  const txt=String(raw||'').trim();
  cat.notas=cat.notas.filter(n=>n.slot!==slot);
  if(txt!==''){
    const val=parseNota(txt);
    if(!isNaN(val))cat.notas.push({id:uid(),nombre:cat.nombre+' '+(slot+1),valor:val,peso:1,slot});
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
      <span style="font-size:14px;color:var(--fg);">${esc(n)}${findPresetName(n,S.tenant,S.carrera)?' <svg class=\"ic\" style=\"color:var(--yellow);width:12px;height:12px;vertical-align:-1px;\" viewBox=\"0 0 24 24\" aria-label=\"Ponderaciones oficiales precargadas\"><path d=\"M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z\" fill=\"currentColor\" stroke=\"none\"/></svg>':''}</span>
    </label>`).join('');
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17A2.5 2.5 0 0 1 6.5 2z"/></svg> Ramos de tu ${S.careerSemestre}° semestre</div>
    <p style="font-size:13px;color:var(--fg2);margin-bottom:4px;">${esc(carrerasFor(S.tenant)[S.carrera]||'')}</p>
    <p style="font-size:12px;color:var(--fg3);margin-bottom:10px;">Desmarca los que no estés tomando. Los electivos los agregas aparte.</p>
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
function presetRamo(nombre,tenant,carrera){
  if(tenant==='fen'){
    const def=PRESETS_FEN[nombre];if(!def)return null;
    const categorias=[],gates=[];
    const porNombre={};
    def.evals.forEach(([nom,peso,extra])=>{
      const id=uid();
      const cat={id,nombre:nom,peso,ponderaNotas:false,directNota:true,notas:[]};
      if(extra&&extra.slots)cat.slots=extra.slots;
      if(extra&&extra.dropLowest)cat.dropLowest=extra.dropLowest;
      categorias.push(cat);porNombre[nom]=id;
      if(extra&&extra.min)gates.push({type:'min_grade_required',catId:id,min:extra.min,cap:extra.cap,nombre:nom});
    });
    (def.grupos||[]).forEach(g=>{
      const ids=g.evals.map(n=>porNombre[n]).filter(Boolean);
      if(ids.length)gates.push({type:'group_min',catIds:ids,min:g.min,cap:g.cap,nombre:g.nombre});
    });
    return {categorias,gates,creditos:def.creditos||null};
  }
  if(tenant!=='uc'||carrera!=='ING-PC')return null;
  const def=PRESETS_UC[nombre];if(!def)return null;
  const categorias=[],gates=[];
  def.forEach(([nom,peso,extra])=>{
    const id=uid();
    const cat={id,nombre:nom,peso,ponderaNotas:false,directNota:true,notas:[]};
    if(extra&&extra.slots)cat.slots=extra.slots;
    categorias.push(cat);
    if(extra&&extra.min)gates.push({type:'min_grade_required',catId:id,min:extra.min,cap:extra.cap,nombre:nom});
  });
  return {categorias,gates};
}

function confirmAddMalla(){
  const elegidos=_mallaList.filter(n=>_mallaSel[n]);
  if(!elegidos.length)return;
  elegidos.forEach(n=>{
    const preset=presetRamo(n,S.tenant,S.carrera);
    S.ramos.push({id:uid(),nombre:n,color:nextRamoColor(n),origen:origenActual(),categorias:preset?preset.categorias:[],gates:preset?preset.gates:[]});
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
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Agregar ramo</div>
    <label class="modal-label">Nombre del ramo${hayCatalogo&&uni?` <span style="text-transform:none;font-weight:500;color:var(--fg3);letter-spacing:0;">· lo buscamos en la malla ${esc(uni)}</span>`:''}</label>
    <div class="modal-input"><input type="text" id="m-ramo-search" placeholder="Ej: Microeconomía I" maxlength="40" autocomplete="off" autocapitalize="none"/></div>
    ${hayCatalogo?'<div id="m-ramo-results" class="cat-results"></div>':''}
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" id="m-add-ramo-btn" onclick="confirmAddRamo()" disabled>Agregar ramo</button>
    </div>`;
  openModal();

  const input=document.getElementById('m-ramo-search');
  setTimeout(()=>{input.focus();},100);
  const pintar=()=>{
    document.getElementById('m-add-ramo-btn').disabled=!input.value.trim();
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
    creditos:creditosDe(nombre,S.tenant,preset),origen:origenActual(),
    categorias:preset?preset.categorias:[],gates:preset?preset.gates:[],
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
const CREDITOS_POR_TENANT={uc:CREDITOS_UC};
function creditosDe(nombre,tenant,preset){
  if(preset&&typeof preset.creditos==='number')return preset.creditos;
  const tabla=CREDITOS_POR_TENANT[tenant];
  if(!tabla)return null;
  const clave=Object.keys(tabla).find(n=>normName(n)===normName(nombre));
  return clave?tabla[clave][0]:null;
}

// \u2500\u2500\u2500 CAT\u00c1LOGO DE RAMOS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Capa de consulta sobre MALLA/PRESETS. Todo ramo del cat\u00e1logo pertenece a un
// par (universidad, carrera): nunca se le ofrece a un alumno de la UC un ramo
// que solo existe en la malla de la UANDES.
function catalogKey(tenant,carrera){return (tenant||'')+':'+(carrera||'');}

function catalogRamos(tenant,carrera){
  const porCarrera=(mallaFor(tenant)||{})[carrera];
  if(!porCarrera)return [];
  const out=[],vistos=new Set();
  Object.keys(porCarrera).sort((a,b)=>Number(a)-Number(b)).forEach(sem=>{
    (porCarrera[sem]||[]).forEach(nombre=>{
      const k=normName(nombre);
      if(vistos.has(k))return;
      vistos.add(k);
      out.push({nombre,semestre:Number(sem),tienePreset:!!findPresetName(nombre,tenant,carrera)});
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
        out.push({nombre,semestre:Number(sem),propio:propios.has(k),
                  tienePreset:!!findPresetName(nombre,tenant,carreraPropia)||!!findPresetName(nombre,tenant,car)});
      });
    });
  });
  return out;
}

// B\u00fasqueda tolerante a tildes. Ordena: exacto > empieza con > contiene;
// a igualdad, primero los del semestre actual del estudiante.
function searchCatalog(q,tenant,carrera,semActual){
  const todos=catalogRamosUniversidad(tenant,carrera);
  const nq=normName(q);
  if(!nq)return todos.slice();
  const scored=[];
  todos.forEach(r=>{
    const n=normName(r.nombre);
    let s=-1;
    if(n===nq)s=0;
    else if(n.startsWith(nq))s=1;
    else if(n.includes(nq))s=2;
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
    const da=Math.abs(a.semestre-(semActual||0)),db=Math.abs(b.semestre-(semActual||0));
    if(da!==db)return da-db;
    return a.nombre.localeCompare(b.nombre);
  });
  return scored;
}

// Sello de procedencia para un ramo creado desde el cat\u00e1logo
function origenActual(){return {tenant:S.tenant,carrera:S.carrera};}

// \u2500\u2500\u2500 REPORTES DE CAT\u00c1LOGO \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Si a un estudiante le cambiaron las ponderaciones respecto de lo que trae el
// cat\u00e1logo, puede reportarlo. Cuando varios coinciden en la MISMA estructura,
// esa versi\u00f3n pasa a ser la sugerida para los dem\u00e1s.

// Estructura m\u00ednima y ordenada de un ramo, para comparar y contar consenso.
function estructuraDe(r){
  return (r.categorias||[])
    .map(c=>{
      const g=(r.gates||[]).find(x=>x.catId===c.id);
      const o={nombre:c.nombre,peso:Math.round((c.peso||0)*10)/10};
      if(c.slots>1)o.slots=c.slots;
      if(g){o.min=g.min;o.cap=g.cap;}
      return o;
    })
    .sort((a,b)=>a.nombre.localeCompare(b.nombre));
}

// Huella estable: dos reportes id\u00e9nticos producen la misma cadena.
function huellaEstructura(est){
  return est.map(e=>[normName(e.nombre),e.peso,e.slots||1,e.min||0,e.cap||0].join('~')).join('|');
}

function openReportModal(ramoId){
  const r=S.ramos.find(x=>x.id===(ramoId||currentRamoId));
  if(!r){showToast('No se encontr\u00f3 el ramo',true);return;}
  const est=estructuraDe(r);
  if(est.length===0){showToast('Agrega las evaluaciones antes de reportar',true);return;}
  const suma=est.reduce((s,e)=>s+e.peso,0);
  const filas=est.map(e=>`
    <div class="rep-row">
      <span class="rep-name">${esc(e.nombre)}${e.slots?` <span class="rep-tag">${e.slots} notas</span>`:''}${e.min?` <span class="rep-tag">m\u00edn ${nf(e.min)}</span>`:''}</span>
      <span class="rep-peso">${r2(e.peso)}%</span>
    </div>`).join('');
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Reportar ponderaciones</div>
    <p style="font-size:13px;color:var(--fg2);line-height:1.5;margin-bottom:14px;">
      Env\u00edas c\u00f3mo est\u00e1n configuradas <b>${esc(r.nombre)}</b> hoy en tu app. Si varios
      estudiantes reportan lo mismo, pasa a ser la versi\u00f3n sugerida del cat\u00e1logo.
    </p>
    <div class="rep-box">
      ${filas}
      <div class="rep-total ${Math.abs(suma-100)<0.05?'ok':'warn'}">
        <span>Suma</span><span>${r2(suma)}%</span>
      </div>
    </div>
    ${Math.abs(suma-100)>=0.05?`<p style="font-size:12px;color:var(--yellow);margin:10px 0 0;line-height:1.4;">Tus ponderaciones no suman 100%. Corr\u00edgelas antes de reportar para que el aporte sirva.</p>`:''}
    <label class="modal-label" style="margin-top:16px;">Comentario <span style="text-transform:none;font-weight:500;color:var(--fg3);letter-spacing:0;">(opcional)</span></label>
    <div class="modal-input"><input type="text" id="m-rep-nota" placeholder="Ej: el profe cambi\u00f3 el examen a 40%" maxlength="120" autocomplete="off"/></div>
    <p style="font-size:11.5px;color:var(--fg3);line-height:1.45;margin:-4px 0 14px;">
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
  const est=estructuraDe(r);
  const notaEl=document.getElementById('m-rep-nota');
  if(btn){btn.disabled=true;btn.textContent='Enviando\u2026';}
  try{
    const {error}=await supabaseClient.from('catalog_reports').upsert({
      user_id:currentUser.id,
      tenant:S.tenant,
      carrera:S.carrera,
      ramo:r.nombre,
      ramo_norm:normName(r.nombre),
      estructura:est,
      huella:huellaEstructura(est),
      nota:(notaEl&&notaEl.value.trim())||null,
    },{onConflict:'user_id,tenant,carrera,ramo_norm'});
    if(error)throw error;
    track('reporte_catalogo',{tenant:S.tenant});
    closeModal();
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
    const {data,error}=await supabaseClient.rpc('catalog_consensus',{p_tenant:S.tenant,p_carrera:S.carrera});
    if(error)throw error;
    _consensoCache=data||[];
    return _consensoCache;
  }catch(e){return null;}
}

// \u00bfHay una versi\u00f3n con m\u00e1s respaldo que la que tiene este ramo?
async function consensoParaRamo(r){
  const cons=await cargarConsenso();
  if(!cons)return null;
  const mine=huellaEstructura(estructuraDe(r));
  const hit=cons.find(c=>c.ramo_norm===normName(r.nombre)&&c.huella!==mine);
  return hit||null;
}

// \u00bfEl ramo viene de otro cat\u00e1logo que el actual? (el estudiante se cambi\u00f3 de
// universidad o de carrera y arrastr\u00f3 ramos del anterior)
function ramoEsDeOtroCatalogo(r){
  if(!r||!r.origen)return false;
  return r.origen.tenant!==S.tenant||r.origen.carrera!==S.carrera;
}
function findPresetName(nombre,tenant,carrera){
  const target=normName(nombre);
  if(tenant==='fen'){
    for(const k in PRESETS_FEN){if(normName(k)===target)return k;}
    return null;
  }
  if(tenant!=='uc'||carrera!=='ING-PC')return null;
  for(const k in PRESETS_UC){if(normName(k)===target)return k;}
  return null;
}
// Reglas oficiales informativas que todavía no podemos representar en el
// cálculo. Se recuperan por el origen del ramo para no inventarlas en manuales.
function reglasDelPreset(ramo,campo){
  const origen=ramo&&ramo.origen;
  if(!ramo||!origen||origen.tenant!=='fen')return [];
  const nombre=Object.keys(PRESETS_FEN).find(n=>normName(n)===normName(ramo.nombre));
  const lista=nombre&&PRESETS_FEN[nombre][campo];
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
  const name=document.getElementById('m-ramo-search').value.trim();if(!name)return;
  // Si el nombre coincide con un ramo del catálogo del tenant, carga sus ponderaciones oficiales.
  const presetName=findPresetName(name,S.tenant,S.carrera);
  const preset=presetName?presetRamo(presetName,S.tenant,S.carrera):null;
  const cr=creditosDe(presetName||name,S.tenant,preset);
  S.ramos.push({id:uid(),nombre:presetName||name,color:nextRamoColor(presetName||name),creditos:cr,origen:presetName?origenActual():null,categorias:preset?preset.categorias:[],gates:preset?preset.gates:[]});
  save();track('add_ramo',{total_ramos:S.ramos.length,preset:!!preset,con_creditos:!!cr});closeModal();renderHome();
  showToast(preset?'Ponderaciones oficiales cargadas':'Ramo agregado');
}

function openAddCatModal(prefillDate){
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Nueva evaluación</div>
    <label class="modal-label">Nombre</label>
    <div class="modal-input"><input type="text" id="m-cat-name" placeholder="Ej: Prueba 1, Tarea 2, Laboratorio" maxlength="40" autocomplete="off"/></div>
    ${pesoControlHTML(30,null)}
    <label class="modal-label">Fecha <span style="text-transform:none;font-weight:500;color:var(--fg3);letter-spacing:0;">(opcional — aparece en la Agenda)</span></label>
    <div class="modal-input"><input type="date" id="m-cat-fecha" value="${esc(prefillDate||'')}" autocomplete="off"/></div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" id="m-add-cat-btn" onclick="confirmAddCat()" disabled>Agregar evaluación</button>
    </div>`;
  openModal();wirePesoControl();
  setTimeout(()=>document.getElementById('m-cat-name').focus(),100);
  document.getElementById('m-cat-name').addEventListener('input',()=>{document.getElementById('m-add-cat-btn').disabled=!document.getElementById('m-cat-name').value.trim();});
  document.getElementById('m-cat-name').addEventListener('keydown',e=>{if(e.key==='Enter')confirmAddCat();});
}
function confirmAddCat(){
  const name=document.getElementById('m-cat-name').value.trim();
  const peso=readPesoControl(30);if(!name)return;
  const fechaInput=document.getElementById('m-cat-fecha');
  const fecha=(fechaInput&&fechaInput.value)?fechaInput.value:null;
  const r=S.ramos.find(x=>x.id===currentRamoId);
  // directNota: una evaluación es UNA nota que se escribe en su fila, igual que
  // en las pautas oficiales. Sin esto quedaba como una lista a la que había que
  // entrar para agregar notas adentro — una "Prueba 1" no tiene notas adentro,
  // tiene una nota.
  r.categorias.push({id:uid(),nombre:name,peso,fecha,ponderaNotas:false,directNota:true,notas:[]});
  save();track('add_categoria',{peso,tiene_fecha:!!fecha});closeModal();renderRamo();
}

// ─── PAUTA MANUAL ───────────────────────────────────────────────────────────
// El borrador vive solo mientras el modal está abierto: cancelar no toca la
// pauta real. Los pesos pueden quedar incompletos porque en semana 1 muchas
// veces todavía no está toda la información.
let pautaDraft=[];
function openPautaManualModal(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  // Además de normalizar al cargar, el editor tolera un ramo legado incompleto.
  // Es el camino mayoritario: los ramos sin preset parten sin evaluaciones.
  if(!Array.isArray(r.categorias))r.categorias=[];
  pautaDraft=r.categorias.map(c=>({id:c.id,nombre:c.nombre,peso:Number(c.peso)||0,tieneNotas:(c.notas||[]).length>0}));
  if(!pautaDraft.length)pautaDraft.push({id:null,nombre:'',peso:0,tieneNotas:false});
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
  const nombres=tipo==='tres-solemnes'
    ?['Solemne 1','Solemne 2','Solemne 3','Examen']
    :tipo==='tres-pruebas'
      ?['Prueba 1','Prueba 2','Prueba 3','Examen']
    :tipo==='dos-pruebas'
      ?['Prueba 1','Prueba 2','Examen']
      :[];
  return nombres.map(nombre=>({id:null,nombre,peso:0,tieneNotas:false}));
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
    ?[{tipo:'tres-pruebas',label:'3 pruebas + examen'},{tipo:'dos-pruebas',label:'2 pruebas + examen'}]
    :[];
}
// Son atajos de escritura, no una pauta sugerida: el estudiante elige el
// nombre y siempre define sus propios pesos. UC y FEN usan vocabularios
// distintos en sus programas, por eso no se mezclan en la misma lista.
function sugerenciasEvaluacion(tenant){
  const comunes=['Laboratorio','Informe','Taller','Proyecto','Tarea','Presentación','Examen'];
  return tenant==='uc'
    ?['Interrogación 1','Interrogación 2','Interrogación 3','Prueba 1','Prueba 2','Prueba 3','Control',...comunes]
    :['Solemne 1','Solemne 2','Solemne 3','Control 1','Control 2','Control 3','Prueba sorpresa','Casos y ensayos','Trabajo individual','Trabajo en grupo','Participación',...comunes];
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
    .map(c=>({id:null,nombre:String(c.nombre).trim(),peso:Number(c.peso)||0,tieneNotas:false}));
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
    <div style="font-size:13px;font-weight:700;color:var(--fg);margin-bottom:7px;">Parte con una estructura</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap;">${disponibles.map(p=>`<button type="button" onclick="aplicarPlantillaPauta('${p.tipo}')" style="padding:8px 10px;border:1px solid var(--border);border-radius:9px;background:var(--bg);color:var(--fg);font:600 12px 'Inter',sans-serif;cursor:pointer;">${p.label}</button>`).join('')}</div>
    <div style="font-size:12px;color:var(--fg2);line-height:1.4;margin-top:8px;">Los pesos quedan en 0%. Confírmalos con el programa del curso.</div>
  </div>`:'';
  const duplicar=fuentes.length?`<div style="margin:0 0 12px;padding:11px 12px;border-radius:10px;border:1px solid var(--border);">
    <div style="font-size:13px;font-weight:700;color:var(--fg);margin-bottom:4px;">¿Ya la tienes armada en otro ramo?</div>
    <div style="font-size:12px;color:var(--fg2);line-height:1.4;margin-bottom:8px;">Copia evaluaciones y porcentajes. Tus notas y fechas no se copian.</div>
    <div style="display:flex;gap:7px;"><select id="m-pauta-origen" style="min-width:0;flex:1;padding:9px;border:1px solid var(--border);border-radius:9px;background:var(--bg2);color:var(--fg);font:inherit;"><option value="">Elige un ramo</option>${fuentes.map(r=>`<option value="${esc(r.id)}">${esc(r.nombre)} · ${r.cantidad} evaluación${r.cantidad!==1?'es':''}</option>`).join('')}</select><button type="button" onclick="duplicarPautaDesdeRamo()" style="padding:9px 11px;border:0;border-radius:9px;background:var(--primary);color:white;font:600 12px 'Inter',sans-serif;cursor:pointer;">Usar pauta</button></div>
  </div>`:'';
  const filas=pautaDraft.map((fila,i)=>`
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 70px 32px;gap:8px;align-items:center;margin:8px 0;">
      <input type="text" id="m-pauta-nombre-${i}" value="${esc(fila.nombre)}" placeholder="Ej: ${ejemplo} ${i+1}" maxlength="40" list="m-pauta-sugerencias" autocomplete="off" oninput="actualizarPautaNombre(${i},this.value)" onkeydown="pautaTecla(event,${i},'nombre')" style="min-width:0;padding:11px 10px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg2);color:var(--fg);font:inherit;"/>
      <div style="position:relative;"><input type="text" inputmode="numeric" id="m-pauta-peso-${i}" value="${fila.peso||''}" placeholder="0" maxlength="3" oninput="actualizarPautaPeso(${i},this.value)" onkeydown="pautaTecla(event,${i},'peso')" aria-label="Peso de ${esc(fila.nombre||'evaluación')}" style="width:100%;box-sizing:border-box;padding:11px 23px 11px 10px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg2);color:var(--fg);font:inherit;"/><span style="position:absolute;right:9px;top:11px;color:var(--fg3);font-size:13px;pointer-events:none;">%</span></div>
      <button type="button" onclick="quitarPautaFila(${i})" ${fila.tieneNotas?'disabled title="No puedes borrar una evaluación que ya tiene notas"':''} aria-label="Quitar evaluación" style="height:40px;border:0;border-radius:10px;background:var(--muted);color:var(--fg2);font-size:20px;cursor:pointer;${fila.tieneNotas?'opacity:.35;cursor:not-allowed;':''}">×</button>
    </div>`).join('');
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Agregar evaluaciones</div>
    <p style="font-size:13px;color:var(--fg2);line-height:1.45;margin:-4px 0 12px;">Escribe cada evaluación con el porcentaje que vale del ramo. Puedes guardar aunque te falten algunas.</p>
    ${plantillas}
    ${duplicar}
    <datalist id="m-pauta-sugerencias">${sugerencias}</datalist>
    <div id="m-pauta-total" style="padding:10px 12px;border-radius:10px;background:var(--muted);color:var(--fg2);font-size:13px;font-weight:600;margin-bottom:10px;">${pautaResumen()}</div>
    <div>${filas}</div>
    <button type="button" onclick="agregarPautaFila()" style="width:100%;padding:10px;border:1px dashed var(--border2);border-radius:10px;background:none;color:var(--primary);font:600 13px 'Inter',sans-serif;cursor:pointer;">+ Otra evaluación</button>
    <div class="modal-btns" style="margin-top:14px;">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" onclick="guardarPautaManual()">Guardar</button>
    </div>`;
}
function actualizarPautaNombre(i,valor){if(pautaDraft[i])pautaDraft[i].nombre=valor;}
function actualizarPautaPeso(i,valor){
  if(!pautaDraft[i])return;
  const limpio=String(valor||'').replace(/[^0-9]/g,'');
  const peso=Math.min(100,parseInt(limpio,10)||0);
  pautaDraft[i].peso=peso;
  const input=document.getElementById('m-pauta-peso-'+i);if(input&&input.value!==limpio)input.value=limpio;
  const total=document.getElementById('m-pauta-total');if(total)total.textContent=pautaResumen();
}
function agregarPautaFila(){
  pautaDraft.push({id:null,nombre:'',peso:0,tieneNotas:false});renderPautaManualModal();
  setTimeout(()=>{const i=document.getElementById('m-pauta-nombre-'+(pautaDraft.length-1));if(i)i.focus();},0);
}
function quitarPautaFila(i){
  if(!pautaDraft[i]||pautaDraft[i].tieneNotas)return;
  pautaDraft.splice(i,1);if(!pautaDraft.length)pautaDraft.push({id:null,nombre:'',peso:0,tieneNotas:false});renderPautaManualModal();
}
function pautaTecla(e,i,campo){
  if(e.key!=='Enter')return;e.preventDefault();
  if(campo==='nombre'){const p=document.getElementById('m-pauta-peso-'+i);if(p)p.focus();return;}
  const siguiente=document.getElementById('m-pauta-nombre-'+(i+1));
  if(siguiente)siguiente.focus();else agregarPautaFila();
}
function guardarPautaManual(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r)return;
  const filas=pautaDraft.filter(f=>f.nombre.trim());
  const ids=new Set(filas.filter(f=>f.id).map(f=>f.id));
  r.categorias=r.categorias.filter(c=>ids.has(c.id)||(c.notas||[]).length>0);
  filas.forEach(f=>{
    const existente=f.id&&r.categorias.find(c=>c.id===f.id);
    if(existente){existente.nombre=f.nombre.trim();existente.peso=f.peso;}
    else r.categorias.push({id:uid(),nombre:f.nombre.trim(),peso:f.peso,ponderaNotas:false,directNota:true,notas:[]});
  });
  const estado=estadoPauta(r.categorias);save();track('configurar_pauta',{evaluaciones:filas.length,total:estado.total});closeModal();renderRamo();
  showToast(estado.lista?'✓ Listo, ya suma 100%':'Guardado · puedes completar el resto después');
}
function abrirPautaDesdeNota(){closeModal();setTimeout(openPautaManualModal,120);}

function openAddNotaModal(catId){
  const r=S.ramos.find(x=>x.id===currentRamoId);const cat=r.categorias.find(c=>c.id===catId);
  const pauta=estadoPauta(r.categorias);
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Nueva nota — ${esc(cat.nombre)}</div>
    ${pauta.lista?'':`<div class="weight-setup-nudge"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18"/><path d="M3 8h18"/><path d="M4 8l2 10h12l2-10"/></svg><div><b>Tu pauta suma ${r2(pauta.total)}%.</b><br>Esta nota se guarda igual. Completa el resto cuando tengas la pauta.<br><button type="button" onclick="abrirPautaDesdeNota()">Editar pauta</button></div></div>`}
    <label class="modal-label">Nombre</label>
    <div class="modal-input"><input type="text" id="m-nota-name" placeholder="Ej: Prueba 1" maxlength="40" autocomplete="off"/></div>
    <label class="modal-label">Nota (1.0 – 7.0)</label>
    <div class="modal-input"><input type="text" inputmode="decimal" id="m-nota-val" placeholder="Ej: 5.5"/></div>
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
      <button class="btn-confirm" id="m-add-nota-btn" onclick="confirmAddNota('${catId}')" disabled>Agregar nota</button>
    </div>`;
  openModal();
  setTimeout(()=>document.getElementById('m-nota-name').focus(),100);
  function checkValid(){
    const n=document.getElementById('m-nota-name').value.trim();
    const v=parseNota(document.getElementById('m-nota-val').value);
    document.getElementById('m-add-nota-btn').disabled=!n||isNaN(v);
  }
  document.getElementById('m-nota-name').addEventListener('input',checkValid);
  document.getElementById('m-nota-val').addEventListener('input',checkValid);
}
function togglePondSlider(){
  document.getElementById('pond-slider-wrap').style.display=document.getElementById('m-pond-toggle').checked?'block':'none';
}
function confirmAddNota(catId){
  const name=document.getElementById('m-nota-name').value.trim();
  const val=parseNota(document.getElementById('m-nota-val').value);
  if(!name||isNaN(val))return;
  const usaPond=document.getElementById('m-pond-toggle').checked;
  const peso=usaPond?parseInt(document.getElementById('m-nota-peso').value)||40:1;
  const r=S.ramos.find(x=>x.id===currentRamoId);const cat=r.categorias.find(c=>c.id===catId);
  cat.notas.push({id:uid(),nombre:name,valor:val,peso});
  openCats[catId]=true;save();track('add_nota',{ponderada:usaPond});closeModal();renderRamo();showToast(lecturaDespuesDeNota(r));
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
  let settingsSem=S.careerSemestre;
  let settingsCarrera=S.carrera;
  let settingsName=S.userName;
  // Se declara acá arriba: los render*Grid() se llaman antes de las definiciones
  // de función y con `let` más abajo caería en la zona muerta temporal (TDZ).
  let settingsTenant=S.tenant||'fen';
  let activeSection=window.matchMedia('(min-width:768px)').matches?'perfil':'';
  const icons={
    perfil:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.8-3.4 3.5-5.3 7.5-5.3s6.7 1.9 7.5 5.3"/></svg>',
    academico:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    apariencia:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    datos:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/></svg>',
    arrow:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>'
  };
  const sections=[
    ['Tu cuenta','perfil','Perfil','Tu nombre en GradeHub'],
    ['Estudio','academico','Información académica','Universidad, carrera y semestre'],
    ['Preferencias','apariencia','Apariencia','Cómo se ve la app'],
    ['Datos','datos','Datos y cuenta','Respaldos y acciones de cuenta']
  ];

  function guardarBtn(){return '<button class="btn-primary settings-save" id="s-save-btn" onclick="saveSettings()">Guardar cambios</button>';}
  function panel(section){
    if(section==='perfil')return `
      <label class="modal-label">Nombre para mostrar</label>
      <div class="settings-name-field">
        <div class="modal-input"><input type="text" id="s-name" value="${esc(settingsName)}" maxlength="30" autocomplete="off"/></div>
        <p class="settings-name-hint">Aparece en el saludo de inicio.</p>
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
    if(section==='apariencia')return `
      <p class="settings-help settings-help-top">Elige cómo prefieres ver GradeHub. Se guarda al elegir.</p>
      <div class="modo-grid" id="s-modo-grid"></div>`;
    return `
      <p class="settings-help settings-help-top">Guarda una copia antes de cambiar de dispositivo.</p>
      <div class="settings-data-actions">
        <button type="button" onclick="exportarDatos()">Exportar mis datos</button>
        <button type="button" onclick="abrirImportar()">Importar datos</button>
      </div>
      <div class="settings-danger-zone">
        <div class="settings-danger-label">Zona sensible</div>
        <button type="button" class="settings-danger-btn" onclick="confirmarEliminarCuenta()">Eliminar mi cuenta</button>
        <p>Borra tu cuenta y todas tus notas, en este dispositivo y en la nube. No se puede deshacer.</p>
      </div>
      ${currentUser?`<div class="settings-reset-zone"><button type="button" class="settings-reset-btn" onclick="confirmResetApp()">Reiniciar app</button><p>Borra los datos de este dispositivo y cierra sesión. Tus notas en la nube se conservan.</p></div>`:`<div class="settings-danger-zone settings-reset-danger-zone"><div class="settings-danger-label">Zona sensible</div><button type="button" class="settings-danger-btn" onclick="confirmResetApp()">Reiniciar app</button><p>Borra todos tus datos de este dispositivo. No se puede deshacer.</p></div>`}
      <p class="settings-privacy"><a href="/privacidad.html" target="_blank" rel="noopener">Política de privacidad</a></p>`;
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
    if(activeSection==='apariencia')renderModoGrid();
    if(activeSection==='perfil'){
      const inp=document.getElementById('s-name');
      if(inp){
        inp.addEventListener('input',()=>{settingsName=inp.value;checkSave();});
        inp.addEventListener('keydown',e=>{if(e.key==='Enter')window.saveSettings();});
        setTimeout(()=>{inp.focus();inp.select();},100);
      }
    }
  }
  renderSettings();
  openModal();

  function checkSave(){
    const btn=document.getElementById('s-save-btn');
    if(btn)btn.disabled=!settingsName.trim();
  }
  function renderModoGrid(){
    const g=document.getElementById('s-modo-grid');if(!g)return;g.innerHTML='';
    // 'sistema' primero: es el default y lo que la mayoría quiere.
    [['sistema','Sistema','Sigue a tu teléfono'],['claro','Claro',''],['oscuro','Oscuro','']]
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
    const name=settingsName.trim();if(!name)return;
    const cambioUni=settingsTenant!==S.tenant;
    S.userName=name;S.careerSemestre=settingsSem;S.carrera=settingsCarrera;S.tenant=settingsTenant;
    selectedTenant=settingsTenant;
    applyTheme();
    save();syncProfile();track('settings_saved',{cambio_universidad:cambioUni});
    closeModal();renderHome();renderStats();renderAgenda();
    showToast('Cambios guardados');
  };
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
  const todosConCreditos=conNota.every(r=>typeof r.creditos==='number'&&r.creditos>0);
  if(todosConCreditos){
    let num=0,den=0;
    conNota.forEach(r=>{num+=histRamoAvg(r)*r.creditos;den+=r.creditos;});
    h.gpa=den>0?num/den:null;
  }else{
    h.gpa=conNota.reduce((s,r)=>s+histRamoAvg(r),0)/conNota.length;
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
    <p style="font-size:13px;color:var(--fg2);line-height:1.5;margin-bottom:16px;">
      Corrige el promedio final de este ramo en <b>${esc(h.label)}</b>. No se tocan sus evaluaciones.
    </p>
    <label class="modal-label">Promedio final (1.0 – 7.0)</label>
    <div class="modal-input"><input type="text" inputmode="decimal" id="m-hist-avg" value="${actual!==null?nf(actual):''}" placeholder="Ej: 5.4" maxlength="4"/></div>
    ${calculado!==null?`<p style="font-size:12px;color:var(--fg3);margin:-6px 0 14px;">Calculado desde sus evaluaciones: <b>${fmt(calculado)}</b></p>`:''}
    <div id="m-hist-err" style="display:none;font-size:12px;color:var(--red);margin:-6px 0 12px;"></div>
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
    <p style="font-size:13px;color:var(--fg2);margin-bottom:10px;">Copia todo este texto y pégalo al importar en el otro dispositivo.</p>
    <textarea id="export-text" readonly style="width:100%;height:120px;padding:10px;border:1.5px solid var(--border);border-radius:10px;font-size:11px;font-family:monospace;resize:none;background:var(--muted);color:var(--fg);">${esc(json)}</textarea>
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
    <p style="font-size:13px;color:var(--fg2);margin-bottom:10px;">Pega aquí el texto que exportaste desde el otro dispositivo. <b>Esto reemplazará tus datos actuales.</b></p>
    <textarea id="import-text" placeholder="Pega aquí tu código de exportación..." style="width:100%;height:120px;padding:10px;border:1.5px solid var(--border);border-radius:10px;font-size:11px;font-family:monospace;resize:none;background:var(--muted);color:var(--fg);"></textarea>
    <div class="modal-btns" style="margin-top:12px;">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" onclick="confirmarImportar()">Importar</button>
    </div>
    ${hayRespaldoPreImport()?`<p style="text-align:center;margin:14px 0 0;font-size:12.5px;">
      <button onclick="deshacerImport()" style="border:none;background:none;padding:0;cursor:pointer;font-family:'Inter',sans-serif;font-size:12.5px;font-weight:700;color:var(--primary);">Deshacer la última importación</button></p>`:''}`;
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
function openModal(){
  const ov=document.getElementById('modal');
  ov.classList.add('open');
  const sheet=document.querySelector('.modal-sheet');
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
  (ramos||[]).forEach(r=>(r.categorias||[]).forEach(c=>{
    const peso=Number(c.peso)||0;
    total+=peso;
    if(avgPond(c.notas)!==null)evaluado+=peso;
  }));
  return {total,evaluado,pct:total>0?Math.round(evaluado/total*100):0};
}
// confirmArchiveSemester agrega lo más reciente al inicio; nunca usar el último
// elemento del array para comparar el semestre actual.
function ultimoHistorialConGpa(historial){
  return (historial||[]).find(h=>h&&typeof h.gpa==='number')||null;
}

function renderStats(){
  const body=document.getElementById('stats-body');const g=gpa(S.ramos);
  const heroTitle=document.getElementById('stats-hero-title');
  let totalNotas=0,mejorNota=null,peorNota=null,ramosAprobados=0,ramosEnRiesgo=0,ramosReprobados=0;
  S.ramos.forEach(r=>{
    const avg=ramoAvg(r);
    if(avg!==null){
      const v=r2(avg);
      if(v>=5.0)ramosAprobados++;
      else if(v>=4.0)ramosEnRiesgo++;
      else ramosReprobados++;
    }
    r.categorias.forEach(cat=>{cat.notas.forEach(n=>{
      if(n.valor===null)return;totalNotas++;
      // El nombre puede faltar en datos importados o antiguos: usar el de la evaluación
      const nom=n.nombre||cat.nombre||'Nota';
      if(!mejorNota||n.valor>mejorNota.valor)mejorNota={valor:n.valor,nombre:nom,ramo:r.nombre};
      if(!peorNota||n.valor<peorNota.valor)peorNota={valor:n.valor,nombre:nom,ramo:r.nombre};
    });});
  });

  // Hero title dinámico
  if(heroTitle){
    heroTitle.textContent=totalNotas===0?'Este semestre':`Sem. ${S.careerSemestre} · ${semester()}`;
  }

  let html='';
  if(totalNotas===0){
    html+=`<div class="ag-empty" style="margin:20px 20px 0;">
      <div class="ag-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="52" height="52" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 56h48"/><rect x="12" y="34" width="8" height="18" rx="1.5"/><rect x="28" y="22" width="8" height="30" rx="1.5"/><rect x="44" y="14" width="8" height="38" rx="1.5"/>
        </svg>
      </div>
      <div class="ag-empty-title">Aún no hay números que contar.</div>
      <div class="ag-empty-desc">Cuando agregues tus primeras notas, acá vas a ver tu promedio, ramos aprobados, mejores y peores notas, y todo el histórico.</div>
    </div>`;
  } else {
    const avance=avanceEvaluaciones(S.ramos);
    const previo=ultimoHistorialConGpa(S.historial);
    const diff=previo&&g!==null?g-previo.gpa:null;
    const tendencia=diff===null?'':Math.abs(diff)<0.05?'igual que':diff>0?'sobre':'bajo';
    const lectura=diff===null
      ? `${avance.pct}% del semestre ya tiene nota.`
      : Math.abs(diff)<0.05?`Vas igual que en ${previo.label||'el semestre anterior'}.`:`Vas ${nf(Math.abs(diff),2)} puntos ${tendencia} ${previo.label||'el semestre anterior'}.`;
    const detalle=diff===null
      ? `${totalNotas} nota${totalNotas!==1?'s':''} ingresada${totalNotas!==1?'s':''} · ${avance.evaluado}% del peso evaluado`
      : `Promedio actual ${nf(g)} · antes ${nf(previo.gpa)} · ${avance.pct}% evaluado`;
    html+=`
    <div class="section-hd" style="padding:6px 20px 8px;">
      <span class="section-hd-title">Lectura del semestre</span>
      <span class="ag-count">${avance.pct}%</span>
    </div>
    <div class="stat-card" style="margin:0 20px 16px;">
      <div class="stat-label">Avance de evaluaciones</div>
      <div class="stat-val" style="color:var(--primary);margin-top:4px;">${avance.pct}%</div>
      <div class="stat-sub" style="margin-top:6px;">${lectura}</div>
      <div class="stat-sub" style="margin-top:4px;">${detalle}</div>
    </div>
    <div class="section-hd" style="padding:6px 20px 8px;">
      <span class="section-hd-title">Resumen</span>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon-wrap"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg></div><div class="stat-label">Promedio</div><div class="stat-val" style="color:${getColor(g)}">${g!==null?nf(g):'—'}</div><div class="stat-sub">${gpaMode(S.ramos)==='creditos'?`ponderado · ${totalCreditos(S.ramos)} créditos`:`simple · ${S.ramos.length} ${S.ramos.length===1?'ramo':'ramos'}`}</div></div>
      <div class="stat-card"><div class="stat-icon-wrap"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></div><div class="stat-label">Notas</div><div class="stat-val">${totalNotas}</div><div class="stat-sub">ingresadas</div></div>
      <div class="stat-card"><div class="stat-icon-wrap stat-icon-good"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4 12 14l-3-3"/></svg></div><div class="stat-label">Aprobados</div><div class="stat-val" style="color:${ramosAprobados>0?'var(--green)':'var(--fg3)'}">${ramosAprobados}</div><div class="stat-sub">promedio ≥ 5.0</div></div>
      <div class="stat-card"><div class="stat-icon-wrap ${ramosReprobados>0?'stat-icon-bad':'stat-icon-warn'}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></div><div class="stat-label">En riesgo</div><div class="stat-val" style="color:${ramosReprobados>0?'var(--red)':ramosEnRiesgo>0?'var(--yellow)':'var(--fg3)'}">${ramosReprobados+ramosEnRiesgo}</div><div class="stat-sub">${ramosReprobados>0?ramosReprobados+' bajo 4.0':'entre 4.0 y 5.0'}</div></div>
    </div>
    <div class="section-hd" style="padding:0 20px 8px;">
      <span class="section-hd-title">Destacados</span>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon-wrap stat-icon-good"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/></svg></div><div class="stat-label">Mejor nota</div><div class="stat-val" style="color:var(--green)">${mejorNota?fmt(mejorNota.valor):'—'}</div>${mejorNota?`<div class="stat-sub">${esc(mejorNota.nombre)} · ${esc(mejorNota.ramo)}</div>`:''}</div>
      <div class="stat-card"><div class="stat-icon-wrap stat-icon-bad"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/></svg></div><div class="stat-label">Peor nota</div><div class="stat-val" style="color:var(--red)">${peorNota?fmt(peorNota.valor):'—'}</div>${peorNota?`<div class="stat-sub">${esc(peorNota.nombre)} · ${esc(peorNota.ramo)}</div>`:''}</div>
    </div>`;
  }

  // Historial de semestres
  if(S.historial && S.historial.length>0){
    const validos=S.historial.filter(h=>h&&Array.isArray(h.ramos));
    if(validos.length>0){
      html+=`<div class="section-hd" style="padding:0 20px 8px;"><span class="section-hd-title">Historial</span></div>`;
      validos.forEach(h=>{
        const isOpen=openHist[h.id];
        const gpaColor=h.gpa!==null?getColor(h.gpa):'var(--fg3)';
        const ramosRows=h.ramos.map(r=>{
          const avg=histRamoAvg(r);
          const editado=typeof r.avgOverride==='number';
          return `<button class="hist-ramo-row" onclick="openEditHistRamoModal('${esc(h.id)}','${esc(r.id)}')" aria-label="Editar promedio de ${esc(r.nombre)}">
            <span class="hist-ramo-name">${esc(r.nombre)}${r.creditos?`<span class="hist-cr">${r.creditos} cr</span>`:''}${editado?'<span class="hist-edited" title="Corregido a mano">editado</span>':''}</span>
            <span class="hist-ramo-val" style="color:${getColor(avg)}">${fmt(avg)}</span>
            <svg class="ic hist-pencil" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>`;
        }).join('');
        html+=`
          <div class="hist-card">
            <div class="hist-header" onclick="toggleHist('${h.id}')">
              <div style="flex:1;">
                <div style="font-size:15.5px;font-weight:700;color:var(--fg);letter-spacing:-.01em;">${esc(h.label)}</div>
                <div style="font-size:12px;color:var(--fg3);margin-top:3px;">Sem. ${h.careerSemestre} · ${h.ramos.length} ramos</div>
              </div>
              <span class="hist-gpa" style="color:${gpaColor}">${h.gpa!==null?nf(h.gpa):'—'}</span>
              <span style="color:var(--fg3);font-size:11px;">${isOpen?'▲':'▼'}</span>
            </div>
            <div class="hist-body${isOpen?' open':''}">
              ${ramosRows||'<p style="font-size:13px;color:var(--fg3);">Sin ramos</p>'}
            </div>
          </div>`;
      });
    }
  }

  body.innerHTML=html;
}
function toggleHist(id){openHist[id]=!openHist[id];renderStats();}

// ─── EDITAR RAMO ─────────────────────────────────────────────────────────────
function openEditRamoModal(){
  const r=S.ramos.find(x=>x.id===currentRamoId);
  modalColor=r.color;
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Editar ramo</div>
    <label class="modal-label">Nombre del ramo</label>
    <div class="modal-input"><input type="text" id="m-ramo-name" value="${esc(r.nombre)}" maxlength="40" autocomplete="off"/></div>
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
}
function confirmEditRamo(){
  const name=document.getElementById('m-ramo-name').value.trim();if(!name)return;
  const r=S.ramos.find(x=>x.id===currentRamoId);
  r.nombre=name;r.color=modalColor;
  r.creditos=parseCreditos((document.getElementById('m-ramo-creditos')||{}).value);
  save();track('edit_ramo');closeModal();renderRamo();
}

// ─── EDITAR CATEGORÍA ────────────────────────────────────────────────────────
function openEditCatModal(catId){
  const r=S.ramos.find(x=>x.id===currentRamoId);
  const cat=r.categorias.find(c=>c.id===catId);
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Editar evaluación</div>
    <label class="modal-label">Nombre</label>
    <div class="modal-input"><input type="text" id="m-cat-name" value="${esc(cat.nombre)}" maxlength="40" autocomplete="off"/></div>
    ${pesoControlHTML(cat.peso,catId)}
    <label class="modal-label">Fecha <span style="text-transform:none;font-weight:500;color:var(--fg3);letter-spacing:0;">(opcional — aparece en la Agenda)</span></label>
    <div class="modal-input" style="display:flex;gap:8px;align-items:center;">
      <input type="date" id="m-cat-fecha" value="${esc(cat.fecha||'')}" autocomplete="off" style="flex:1;"/>
      ${cat.fecha?`<button type="button" onclick="document.getElementById('m-cat-fecha').value='';" style="padding:8px 10px;background:var(--muted);border:none;border-radius:8px;color:var(--fg2);font-size:12px;font-weight:600;cursor:pointer;">Quitar</button>`:''}
    </div>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-confirm" onclick="confirmEditCat('${catId}')">Guardar</button>
    </div>`;
  openModal();wirePesoControl();
  setTimeout(()=>{const i=document.getElementById('m-cat-name');i.focus();i.select();},100);
  document.getElementById('m-cat-name').addEventListener('keydown',e=>{if(e.key==='Enter')confirmEditCat(catId);});
}
function confirmEditCat(catId){
  const name=document.getElementById('m-cat-name').value.trim();if(!name)return;
  const peso=readPesoControl(cat0Peso(catId));
  const fechaInput=document.getElementById('m-cat-fecha');
  const fecha=(fechaInput&&fechaInput.value)?fechaInput.value:null;
  const r=S.ramos.find(x=>x.id===currentRamoId);
  const cat=r.categorias.find(c=>c.id===catId);
  cat.nombre=name;cat.peso=peso;cat.fecha=fecha;
  save();track('edit_categoria',{tiene_fecha:!!fecha});closeModal();renderRamo();
}

// ─── EDITAR NOTA ─────────────────────────────────────────────────────────────
function openEditNotaModal(catId,notaId){
  const r=S.ramos.find(x=>x.id===currentRamoId);
  const cat=r.categorias.find(c=>c.id===catId);
  const n=cat.notas.find(x=>x.id===notaId);
  const hasPond=n.peso!==1;
  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title">Editar nota</div>
    <label class="modal-label">Nombre</label>
    <div class="modal-input"><input type="text" id="m-nota-name" value="${esc(n.nombre)}" maxlength="40" autocomplete="off"/></div>
    <label class="modal-label">Nota (1.0 – 7.0)</label>
    <div class="modal-input"><input type="text" inputmode="decimal" id="m-nota-val" value="${n.valor!==null?nf(n.valor):''}"/></div>
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
  function checkValid(){
    const v=parseNota(document.getElementById('m-nota-val').value);
    const nm=document.getElementById('m-nota-name').value.trim();
    document.getElementById('m-edit-nota-btn').disabled=!nm||isNaN(v);
  }
  document.getElementById('m-nota-name').addEventListener('input',checkValid);
  document.getElementById('m-nota-val').addEventListener('input',checkValid);
}
function confirmEditNota(catId,notaId){
  const name=document.getElementById('m-nota-name').value.trim();
  const val=parseNota(document.getElementById('m-nota-val').value);
  if(!name||isNaN(val))return;
  const usaPond=document.getElementById('m-pond-toggle').checked;
  const peso=usaPond?parseInt(document.getElementById('m-nota-peso').value)||40:1;
  const r=S.ramos.find(x=>x.id===currentRamoId);
  const cat=r.categorias.find(c=>c.id===catId);
  const n=cat.notas.find(x=>x.id===notaId);
  n.nombre=name;n.valor=Math.round(val*10)/10;n.peso=peso;
  save();track('edit_nota');closeModal();renderRamo();showToast(lecturaDespuesDeNota(r));
}

// ─── CALCULADORA NOTA MÍNIMA ─────────────────────────────────────────────────
function openCalculadoraModal(){
  const r=S.ramos.find(x=>x.id===currentRamoId);
  const totalPeso=r.categorias.reduce((a,c)=>a+c.peso,0);
  let pesoConNotas=0,sumaPonderada=0;
  r.categorias.forEach(c=>{const a=avgPond(c.notas);if(a!==null){pesoConNotas+=c.peso;sumaPonderada+=a*c.peso;}});
  const pesoSinNotas=totalPeso-pesoConNotas;

  document.getElementById('modal-content').innerHTML=`
    <div class="modal-title"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 7h8"/><path d="M8 12h3"/><path d="M8 16h3"/><path d="M15 12v5"/></svg> Calculadora</div>
    <p style="font-size:13px;color:var(--fg2);margin-bottom:14px;">¿Qué promedio necesitas en las secciones sin notas para llegar a tu meta?</p>
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
    if(pesoSinNotas===0){
      const avg=ramoAvg(r);
      if(avg!==null){
        const ok=avg>=target;
        el.innerHTML=`<span style="color:${ok?'var(--green)':'var(--red)'}">Tu promedio actual es <b>${avg.toFixed(2)}</b> — ${ok?'ya lo lograste.':`te faltan ${(target-avg).toFixed(2)} puntos y no quedan evaluaciones.`}</span>`;
      } else {el.innerHTML=`<span style="color:var(--fg3)">No hay notas ingresadas aún.</span>`;}
      return;
    }
    if(totalPeso===0||pesoSinNotas<=0){el.innerHTML='';return;}
    const needed=(target*totalPeso-sumaPonderada)/pesoSinNotas;
    const neededR=r2(needed);
    // Si falta una sola sección, nombrarla (más útil que "las secciones sin notas").
    const vacias=r.categorias.filter(c=>avgPond(c.notas)===null);
    const dondeTxt=vacias.length===1?`en <b>${esc(vacias[0].nombre)}</b>`:`en las secciones sin notas (${r2(pesoSinNotas)}% del ramo)`;
    // Condición pendiente de piso (ej: Podcast sin nota aún)
    const condPend=(r.gates||[]).filter(g=>{if(g.type!=='min_grade_required')return false;const c=r.categorias.find(x=>x.id===g.catId);return c&&avgPond(c.notas)===null;}).map(g=>`<div style="font-size:12px;color:var(--yellow);margin-top:8px;">Además, ${esc(g.nombre)} debe ser ≥ ${g.min.toFixed(1)} o repruebas pese al promedio.</div>`).join('');
    if(neededR>7){
      el.innerHTML=`<span style="color:var(--red)">Necesitarías un <b>${neededR.toFixed(1)}</b> — ya no es posible llegar a ${target.toFixed(1)}.</span>`;
    } else if(neededR<1){
      el.innerHTML=`<span style="color:var(--green)">Con cualquier nota llegas a ${target.toFixed(1)}.</span>${condPend}`;
    } else {
      const col=neededR>=5.5?'var(--yellow)':'var(--green)';
      el.innerHTML=`<div style="margin-top:4px;">Necesitas un promedio de<br/><b style="font-size:32px;color:${col}">${neededR.toFixed(1)}</b><br/><span style="font-size:12px;color:var(--fg3)">${dondeTxt}</span>${condPend}</div>`;
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
    <p style="font-size:13px;color:var(--fg2);margin-bottom:16px;line-height:1.5;">Ajusta la nota final de cada ramo y mira cómo queda tu promedio general. Puedes escribirla directo. Nada de esto se guarda.</p>
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
    <p style="font-size:13px;color:var(--fg2);margin-bottom:14px;">Agrega notas hipotéticas y mira cómo quedaría tu promedio. No se guardan hasta que confirmes.</p>
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
    const totalPeso=r.categorias.reduce((s,c)=>s+c.peso,0);
    let pesoConNotas=0,sumaPond=0;
    r.categorias.forEach(c=>{const a=avgPond(c.notas);if(a!==null){pesoConNotas+=c.peso;sumaPond+=a*c.peso;}});
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
  const total=r.categorias.reduce((s,c)=>s+c.peso,0);
  if(total<=0)return {pct:0,pending:0,total:0};
  let done=0;
  r.categorias.forEach(c=>{
    const a=avgPond(c.notas);
    if(a!==null)done+=c.peso;
  });
  return {pct:Math.round(done/total*100),pending:total-done,total};
}

function agendaEvents(){
  const out=[];
  S.ramos.forEach(r=>{
    r.categorias.forEach(c=>{
      if(!c.fecha)return;
      const notasCount=(c.notas||[]).length;
      const targetCount=c.slots||1;
      const pending=notasCount<targetCount;
      out.push({
        fecha:c.fecha, ramo:r, cat:c, pending,
        notas:c.notas||[], targetCount,
      });
    });
  });
  out.sort((a,b)=>a.fecha.localeCompare(b.fecha));
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
function icsDatePlus1(iso){
  const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+1);
  return isoOf(d.getFullYear(),d.getMonth(),d.getDate()).replace(/-/g,'');
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
    lines.push(`DTSTART;VALUE=DATE:${icsDate(e.fecha)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDatePlus1(e.fecha)}`);
    lines.push(icsFold(`SUMMARY:${icsEscape(titulo)}`));
    lines.push(icsFold(`DESCRIPTION:${icsEscape(desc)}`));
    lines.push('TRANSP:TRANSPARENT');
    // Recordatorio el día anterior a las 9:00 (solo para pendientes)
    if(e.pending){
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-P1DT9H');
      lines.push('ACTION:DISPLAY');
      lines.push(icsFold(`DESCRIPTION:${icsEscape('Mañana: '+titulo)}`));
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
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
function notaNecesaria(ramo){
  const total=ramo.categorias.reduce((s,c)=>s+c.peso,0);
  if(total<=0)return null;
  let pesoCon=0,suma=0;
  ramo.categorias.forEach(c=>{const a=avgPond(c.notas);if(a!==null){pesoCon+=c.peso;suma+=a*c.peso;}});
  const pesoSin=total-pesoCon;
  if(pesoSin<=0)return null;
  return (4.0*total-suma)/pesoSin;
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

function withPriority(e){
  const dias=diasHasta(e.fecha);
  const peso=e.cat.peso||0;
  const avg=ramoAvg(e.ramo);
  const necesita=notaNecesaria(e.ramo);

  // Urgencia: decae con los días. Lo vencido pesa más que todo.
  let urgencia;
  if(dias<0)urgencia=120;
  else if(dias===0)urgencia=100;
  else if(dias<=2)urgencia=85;
  else if(dias<=7)urgencia=60;
  else if(dias<=14)urgencia=35;
  else if(dias<=30)urgencia=18;
  else urgencia=8;

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

  const score=urgencia+peso*1.2+riesgo;

  // Nivel legible para el color de la barra
  let nivel='baja';
  if(dias<0)nivel='vencida';
  else if(urgencia>=85&&peso>=20)nivel='critica';
  else if(riesgo>=45||(urgencia>=85))nivel='alta';
  else if(urgencia>=35||peso>=30)nivel='media';

  return {...e,dias,score,nivel,avg,necesita};
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
        <span class="ag-row-date">${f.day} ${f.mon}</span>
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
      .catch(err => console.warn('SW no registrado:', err));
  });
}
