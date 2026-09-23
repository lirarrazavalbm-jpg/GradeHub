// ─── REGISTRO COMUNITARIO DE PROFESORES ────────────────────────────────────
//
// Este registro es distinto del marketplace de clases particulares. Acá se
// habla del profesor institucional de un ramo y sección. La app nunca manda
// notas, promedios ni el nombre del estudiante: Supabase usa auth.uid() solo
// para contar una cuenta una vez y comprobar quién puede dejar una reseña.

const PROFESOR_NOMBRE_MAX=100;
const PROFESOR_COMENTARIO_MAX=1000;
const profesorEstadoCache=new Map();
let profesoresListaTimer=null;
let profesoresListaSolicitud=0;
let profesorRatingElegido=0;

function limpiarTextoProfesor(valor,maximo){
  return [...String(valor==null?'':valor)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,'')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,'')
    .replace(/\s+/g,' ').trim()].slice(0,maximo).join('');
}

function normalizarNombreProfesor(valor){
  return limpiarTextoProfesor(valor,PROFESOR_NOMBRE_MAX).toLocaleLowerCase('es')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9ñ]+/g,' ').replace(/\s+/g,' ').trim();
}

// Espeja la tolerancia del SQL para que el formulario pueda explicar por qué
// dos aportes se consideran iguales. La decisión real se toma en Supabase.
function coincidenNombresProfesor(a,b){
  const x=normalizarNombreProfesor(a),y=normalizarNombreProfesor(b);
  if(!x||!y)return false;
  if(x===y)return true;
  if(x[0]!==y[0]||Math.abs(x.length-y.length)>4)return false;
  const anterior=Array(y.length+1).fill(0).map((_,i)=>i);
  for(let i=1;i<=x.length;i++){
    let diag=anterior[0];anterior[0]=i;
    for(let j=1;j<=y.length;j++){
      const arriba=anterior[j],izq=anterior[j-1];
      anterior[j]=Math.min(arriba+1,izq+1,diag+(x[i-1]===y[j-1]?0:1));
      diag=arriba;
    }
  }
  return anterior[y.length]/Math.max(x.length,y.length)<=0.22;
}

function profesorIdSeguro(valor){return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(valor||''));}
function seccionProfesorRamo(r){
  const n=Number(r&&r.seccion);
  return Number.isInteger(n)&&n>0&&n<=999?n:null;
}
function claveProfesorRamo(r){
  const sigla=typeof siglaParaCurso==='function'?siglaParaCurso(r):null;
  if(sigla)return String(sigla).trim().toUpperCase().slice(0,80);
  return normalizarNombreProfesor(r&&r.nombre).slice(0,80);
}
function identidadProfesorRamo(r){
  return {tenant:String(S&&S.tenant||''),ramoClave:claveProfesorRamo(r),
    ramoNombre:limpiarTextoProfesor(r&&r.nombre,120),seccion:seccionProfesorRamo(r),
    // GradeHub ya usa semester() al archivar. Reutilizar ese período evita que
    // la sección 2 de un semestre le gane para siempre a la sección 2 siguiente.
    periodo:typeof semester==='function'?semester():''};
}

function promedioProfesor(valor){
  const n=Number(valor);return Number.isFinite(n)&&n>=1&&n<=5?n:null;
}
function estrellasProfesor(valor,{botones=false}={}){
  const n=promedioProfesor(valor)||0;
  return `<span class="doc-estrellas${botones?' is-buttons':''}" aria-label="${n?`${n.toFixed(1)} de 5 estrellas`:'Sin reseñas'}">${[1,2,3,4,5].map(i=>botones
    ?`<button type="button" data-doc-star="${i}" aria-label="${i} estrella${i===1?'':'s'}" aria-pressed="${i===profesorRatingElegido?'true':'false'}">${i<=profesorRatingElegido?'★':'☆'}</button>`
    :`<span aria-hidden="true" class="${i<=Math.round(n)?'on':''}">★</span>`).join('')}</span>`;
}
function resumenRatingProfesor(promedio,total){
  const n=promedioProfesor(promedio),cantidad=Math.max(0,Number(total)||0);
  return `<div class="doc-rating">${estrellasProfesor(n)}<span>${n?n.toFixed(1):'Sin nota'}${cantidad?` · ${cantidad} reseña${cantidad===1?'':'s'}`:''}</span></div>`;
}

function errorProfesorTexto(error){
  const msg=String(error&&error.message||'');
  if(/does not exist|schema cache|could not find the function/i.test(msg))
    return 'El registro de profesores todavía no está disponible. Tus ramos y notas no cambiaron.';
  if(/sin sesi[oó]n|jwt|token/i.test(msg))return 'Tu sesión venció. Vuelve a iniciar sesión para continuar.';
  return 'No pudimos cargar el registro. Revisa tu conexión e intenta de nuevo.';
}
async function profesorRpc(nombre,args={}){
  if(!supabaseClient||!currentUser)throw new Error('sin sesión');
  let respuesta=await supabaseClient.rpc(nombre,args);
  if(respuesta&&respuesta.error&&/sin sesi[oó]n|jwt|token/i.test(respuesta.error.message||'')){
    try{await supabaseClient.auth.refreshSession();}catch(e){}
    respuesta=await supabaseClient.rpc(nombre,args);
  }
  if(respuesta&&respuesta.error)throw respuesta.error;
  return respuesta?respuesta.data:null;
}

function filaEstadoProfesor(data){
  const fila=Array.isArray(data)?data[0]:data;
  if(!fila||typeof fila!=='object')return null;
  return {
    profesorId:profesorIdSeguro(fila.profesor_id)?fila.profesor_id:null,
    nombre:limpiarTextoProfesor(fila.nombre_publico,PROFESOR_NOMBRE_MAX),
    confirmaciones:Math.max(0,Number(fila.confirmaciones)||0),
    promedio:promedioProfesor(fila.promedio),totalResenas:Math.max(0,Number(fila.total_resenas)||0),
    miNombre:limpiarTextoProfesor(fila.mi_nombre,PROFESOR_NOMBRE_MAX),
    puedeResenar:fila.puede_resenar===true
  };
}

function bloqueProfesorRamoHTML(r,estado){
  const id=identidadProfesorRamo(r);
  if(!id.seccion)return `<section class="doc-ramo" aria-labelledby="doc-ramo-title">
    <div class="doc-section-head"><div><span class="doc-eyebrow">Profesor del curso</span><h2 id="doc-ramo-title">Falta tu sección</h2></div></div>
    <p>Agrega la sección de este ramo para que los aportes correspondan al curso correcto.</p>
    <button type="button" class="doc-secondary" onclick="openEditRamoModal()">Agregar sección</button>
  </section>`;
  if(estado&&estado.profesorId)return `<section class="doc-ramo" aria-labelledby="doc-ramo-title">
    <div class="doc-section-head"><div><span class="doc-eyebrow">Profesor · sección ${id.seccion} · ${esc(id.periodo)}</span><h2 id="doc-ramo-title">${esc(estado.nombre)}</h2></div><span class="doc-consenso">${estado.confirmaciones} confirmaciones</span></div>
    ${resumenRatingProfesor(estado.promedio,estado.totalResenas)}
    <div class="doc-actions"><button type="button" class="doc-primary" onclick="openProfesorDetalle('${esc(estado.profesorId)}')">Ver reseñas</button></div>
    <details class="doc-aporte"><summary>${estado.miNombre?'Cambiar mi aporte':'¿No es tu profesor?'}</summary>
      <label for="doc-ramo-nombre">Nombre del profesor</label>
      <div class="doc-inline"><input id="doc-ramo-nombre" maxlength="${PROFESOR_NOMBRE_MAX}" autocomplete="off" value="${esc(estado.miNombre)}"><button type="button" onclick="aportarProfesorRamo('${esc(r.id)}')">Guardar</button></div>
      <small>Si el consenso cambia, la ficha se actualiza. Tu identidad no se publica.</small>
    </details>
  </section>`;
  return `<section class="doc-ramo" aria-labelledby="doc-ramo-title">
    <div class="doc-section-head"><div><span class="doc-eyebrow">Profesor · sección ${id.seccion} · ${esc(id.periodo)}</span><h2 id="doc-ramo-title">Ayuda a confirmar quién hace este ramo</h2></div></div>
    <p>Se publica recién cuando 3 estudiantes de esta sección coinciden. Las tildes y diferencias pequeñas de escritura no separan el consenso.</p>
    <label for="doc-ramo-nombre">Nombre del profesor</label>
    <div class="doc-inline"><input id="doc-ramo-nombre" maxlength="${PROFESOR_NOMBRE_MAX}" autocomplete="off" placeholder="Ej: María José Pérez" value="${esc(estado&&estado.miNombre||'')}"><button type="button" onclick="aportarProfesorRamo('${esc(r.id)}')">${estado&&estado.miNombre?'Actualizar':'Aportar'}</button></div>
    <small>${estado&&estado.miNombre?`Tu aporte está guardado. Aún no llegan a 3 coincidencias.`:'Tu nombre y tus notas nunca aparecen en la ficha.'}</small>
  </section>`;
}

async function renderProfesorRamo(r){
  const raiz=document.getElementById('ramo-profesor');if(!raiz||!r)return;
  const identidad=identidadProfesorRamo(r);
  if(!identidad.seccion){raiz.innerHTML=bloqueProfesorRamoHTML(r,null);return;}
  const llave=[identidad.tenant,identidad.ramoClave,identidad.seccion,identidad.periodo].join('|');
  raiz.innerHTML='<section class="doc-ramo is-loading" aria-live="polite">Buscando al profesor de esta sección…</section>';
  try{
    const guardado=profesorEstadoCache.get(llave);
    let estado=guardado&&Date.now()-guardado.at<60000?guardado.estado:null;
    if(!guardado||Date.now()-guardado.at>=60000){
      const data=await profesorRpc('profesor_ramo_estado',{p_tenant:identidad.tenant,p_ramo_clave:identidad.ramoClave,p_seccion:identidad.seccion,p_periodo:identidad.periodo});
      estado=filaEstadoProfesor(data);profesorEstadoCache.set(llave,{estado,at:Date.now()});
    }
    if(!raiz.isConnected||currentRamoId!==r.id)return;
    raiz.innerHTML=bloqueProfesorRamoHTML(r,estado);
  }catch(e){
    if(!raiz.isConnected||currentRamoId!==r.id)return;
    raiz.innerHTML=`<section class="doc-ramo is-error"><b>Registro no disponible</b><p>${esc(errorProfesorTexto(e))}</p></section>`;
  }
}

async function aportarProfesorRamo(ramoId){
  const r=(S.ramos||[]).find(x=>x.id===ramoId);if(!r)return;
  const identidad=identidadProfesorRamo(r),input=document.getElementById('doc-ramo-nombre');
  const nombre=limpiarTextoProfesor(input&&input.value,PROFESOR_NOMBRE_MAX);
  if(!identidad.seccion){showToast('Agrega la sección antes de aportar',true);return;}
  if(normalizarNombreProfesor(nombre).length<3){showToast('Escribe el nombre completo del profesor',true);input&&input.focus();return;}
  const boton=input&&input.parentElement&&input.parentElement.querySelector('button');
  if(boton){boton.disabled=true;boton.textContent='Guardando…';}
  try{
    await profesorRpc('profesor_reportar',{p_tenant:identidad.tenant,p_ramo_clave:identidad.ramoClave,p_ramo_nombre:identidad.ramoNombre,p_seccion:identidad.seccion,p_periodo:identidad.periodo,p_nombre:nombre});
    profesorEstadoCache.delete([identidad.tenant,identidad.ramoClave,identidad.seccion,identidad.periodo].join('|'));
    track('profesor_aportado',{tenant:identidad.tenant});
    showToast('Tu aporte quedó guardado');renderProfesorRamo(r);
  }catch(e){showToast(errorProfesorTexto(e),true);if(boton){boton.disabled=false;boton.textContent='Guardar';}}
}

function cursosProfesorSeguro(valor){
  let lista=valor;
  if(typeof lista==='string'){try{lista=JSON.parse(lista);}catch(e){lista=[];}}
  return (Array.isArray(lista)?lista:[]).map(c=>({ramo:limpiarTextoProfesor(c&&c.ramo,120),clave:limpiarTextoProfesor(c&&c.clave,80),seccion:Number(c&&c.seccion)||null,periodo:/^\d{4}-[12]$/.test(String(c&&c.periodo||''))?String(c.periodo):''})).filter(c=>c.ramo&&c.seccion);
}
function tarjetasProfesores(filas){
  return filas.map(f=>{
    const id=profesorIdSeguro(f.id)?f.id:'';if(!id)return '';
    const cursos=cursosProfesorSeguro(f.cursos);
    return `<button type="button" class="doc-card" onclick="openProfesorDetalle('${esc(id)}')">
      <span class="doc-card-main"><strong>${esc(limpiarTextoProfesor(f.nombre_publico,PROFESOR_NOMBRE_MAX))}</strong>${resumenRatingProfesor(f.promedio,f.total_resenas)}</span>
      <span class="doc-cursos">${cursos.slice(0,3).map(c=>`${esc(c.clave||c.ramo)} · sec. ${c.seccion}${c.periodo?` · ${esc(c.periodo)}`:''}`).join('<br>')}${cursos.length>3?`<br>+ ${cursos.length-3} más`:''}</span>
      <span class="doc-chevron" aria-hidden="true">›</span>
    </button>`;
  }).join('');
}

async function renderProfesores(){
  const raiz=document.getElementById('profesores-body');if(!raiz)return;
  const solicitud=++profesoresListaSolicitud;
  const busqueda=limpiarTextoProfesor((document.getElementById('profesores-buscar')||{}).value,100);
  raiz.innerHTML='<div class="doc-loading" aria-live="polite">Buscando profesores confirmados…</div>';
  try{
    const data=await profesorRpc('profesores_listar',{p_tenant:S.tenant,p_busqueda:busqueda||null});
    if(solicitud!==profesoresListaSolicitud)return;
    const filas=Array.isArray(data)?data:[];
    raiz.innerHTML=filas.length?`<div class="doc-list">${tarjetasProfesores(filas)}</div>`:
      `<div class="doc-empty"><div aria-hidden="true">☆</div><b>${busqueda?'No encontramos coincidencias':'Todavía no hay profesores confirmados'}</b><p>${busqueda?'Prueba con otro nombre o sigla.':'El registro crece cuando 3 estudiantes del mismo ramo y sección coinciden.'}</p></div>`;
  }catch(e){if(solicitud===profesoresListaSolicitud)raiz.innerHTML=`<div class="doc-empty is-error"><b>Registro no disponible</b><p>${esc(errorProfesorTexto(e))}</p><button type="button" class="doc-secondary" onclick="renderProfesores()">Reintentar</button></div>`;}
}
function buscarProfesores(){
  clearTimeout(profesoresListaTimer);profesoresListaTimer=setTimeout(renderProfesores,250);
}

function fechaResenaProfesor(valor){
  const d=new Date(valor);if(isNaN(d.getTime()))return '';
  return new Intl.DateTimeFormat('es-CL',{month:'short',year:'numeric'}).format(d);
}
function detalleProfesorSeguro(data){
  const f=Array.isArray(data)?data[0]:data;if(!f||!profesorIdSeguro(f.id))return null;
  let resenas=f.resenas;if(typeof resenas==='string'){try{resenas=JSON.parse(resenas);}catch(e){resenas=[];}}
  let mia=f.mi_resena;if(typeof mia==='string'){try{mia=JSON.parse(mia);}catch(e){mia=null;}}
  return {id:f.id,nombre:limpiarTextoProfesor(f.nombre_publico,PROFESOR_NOMBRE_MAX),promedio:promedioProfesor(f.promedio),total:Math.max(0,Number(f.total_resenas)||0),cursos:cursosProfesorSeguro(f.cursos),puedeResenar:f.puede_resenar===true,miResena:mia&&typeof mia==='object'?mia:null,
    resenas:(Array.isArray(resenas)?resenas:[]).filter(x=>x&&profesorIdSeguro(x.id)).map(x=>({id:x.id,rating:Math.min(5,Math.max(1,Number(x.rating)||1)),comentario:limpiarTextoProfesor(x.comentario,PROFESOR_COMENTARIO_MAX),fecha:x.fecha,esMia:x.es_mia===true}))};
}
function formularioResenaProfesor(d){
  if(!d.puedeResenar&&!d.miResena)return '<p class="doc-review-lock">Para reseñar, primero tienes que confirmar a este profesor desde la ficha de uno de tus ramos y secciones.</p>';
  profesorRatingElegido=Number(d.miResena&&d.miResena.rating)||0;
  return `<section class="doc-review-form"><h3>${d.miResena?'Edita tu reseña':'Deja tu reseña'}</h3>
    <p>Tu reseña se publica como “Estudiante verificado”.</p>
    <div id="doc-rating-picker">${estrellasProfesor(profesorRatingElegido,{botones:true})}</div>
    <label for="doc-review-comment">Comentario <span>(opcional)</span></label>
    <textarea id="doc-review-comment" maxlength="${PROFESOR_COMENTARIO_MAX}" placeholder="Cuenta tu experiencia con respeto y detalles útiles.">${esc(limpiarTextoProfesor(d.miResena&&d.miResena.comentario,PROFESOR_COMENTARIO_MAX))}</textarea>
    <div class="doc-review-actions">${d.miResena?'<button type="button" class="doc-link-danger" onclick="eliminarMiResenaProfesor()">Eliminar</button>':''}<button type="button" class="doc-primary" id="doc-review-save" onclick="guardarResenaProfesor()">${d.miResena?'Guardar cambios':'Publicar reseña'}</button></div>
  </section>`;
}
let profesorDetalleActual=null;
function pintarProfesorDetalle(d){
  profesorDetalleActual=d;
  const contenido=document.getElementById('modal-content');if(!contenido)return;
  contenido.innerHTML=`<div class="doc-detail">
    <div class="modal-title">${esc(d.nombre)}</div>
    ${resumenRatingProfesor(d.promedio,d.total)}
    <div class="doc-detail-courses">${d.cursos.map(c=>`<span>${esc(c.ramo)} · sección ${c.seccion}${c.periodo?` · ${esc(c.periodo)}`:''}</span>`).join('')}</div>
    ${formularioResenaProfesor(d)}
    <section class="doc-reviews"><h3>Reseñas</h3>${d.resenas.length?d.resenas.map(x=>`<article class="doc-review">
      <div><b>Estudiante verificado${x.esMia?' · tú':''}</b><span>${'★'.repeat(x.rating)}${'☆'.repeat(5-x.rating)}${x.fecha?` · ${esc(fechaResenaProfesor(x.fecha))}`:''}</span></div>
      ${x.comentario?`<p>${esc(x.comentario)}</p>`:''}
      ${x.esMia?'':`<button type="button" onclick="reportarResenaProfesor('${esc(x.id)}')">Reportar</button>`}
    </article>`).join(''):'<p class="doc-no-reviews">Todavía no hay reseñas. La primera puede ser tuya.</p>'}</section>
  </div>`;
  contenido.querySelectorAll('[data-doc-star]').forEach(b=>b.addEventListener('click',()=>seleccionarRatingProfesor(Number(b.dataset.docStar))));
}
async function openProfesorDetalle(id){
  if(!profesorIdSeguro(id)){showToast('No encontramos a ese profesor',true);return;}
  document.getElementById('modal-content').innerHTML='<div class="doc-loading">Cargando ficha…</div>';openModal();
  try{
    const d=detalleProfesorSeguro(await profesorRpc('profesor_detalle',{p_profesor_id:id}));
    if(!d)throw new Error('ficha inválida');pintarProfesorDetalle(d);
  }catch(e){document.getElementById('modal-content').innerHTML=`<div class="modal-title">No pudimos abrir la ficha</div><p class="doc-modal-error">${esc(errorProfesorTexto(e))}</p><div class="modal-btns"><button class="btn-confirm" onclick="closeModal()">Cerrar</button></div>`;}
}
function seleccionarRatingProfesor(n){
  profesorRatingElegido=Math.min(5,Math.max(1,Number(n)||0));
  const picker=document.getElementById('doc-rating-picker');if(!picker)return;
  picker.innerHTML=estrellasProfesor(profesorRatingElegido,{botones:true});
  picker.querySelectorAll('[data-doc-star]').forEach(b=>b.addEventListener('click',()=>seleccionarRatingProfesor(Number(b.dataset.docStar))));
}
async function guardarResenaProfesor(){
  const d=profesorDetalleActual;if(!d||!profesorIdSeguro(d.id))return;
  if(!profesorRatingElegido){showToast('Elige entre 1 y 5 estrellas',true);return;}
  const comentario=limpiarTextoProfesor((document.getElementById('doc-review-comment')||{}).value,PROFESOR_COMENTARIO_MAX);
  const btn=document.getElementById('doc-review-save');if(btn){btn.disabled=true;btn.textContent='Guardando…';}
  try{
    await profesorRpc('profesor_resena_guardar',{p_profesor_id:d.id,p_rating:profesorRatingElegido,p_comentario:comentario||null});
    profesorEstadoCache.clear();track('profesor_resenado',{rating:profesorRatingElegido});showToast('Tu reseña quedó publicada');await openProfesorDetalle(d.id);
  }catch(e){showToast(errorProfesorTexto(e),true);if(btn){btn.disabled=false;btn.textContent='Guardar';}}
}
function eliminarMiResenaProfesor(){
  const d=profesorDetalleActual;if(!d)return;
  showConfirm('¿Eliminar tu reseña?','Se borran tus estrellas y comentario. Puedes volver a reseñar más adelante.',async()=>{
    try{await profesorRpc('profesor_resena_eliminar',{p_profesor_id:d.id});profesorEstadoCache.clear();showToast('Reseña eliminada');await openProfesorDetalle(d.id);}catch(e){showToast(errorProfesorTexto(e),true);}
  },{label:'Eliminar',danger:true});
}
function reportarResenaProfesor(id){
  if(!profesorIdSeguro(id))return;
  showConfirm('¿Reportar esta reseña?','El equipo podrá revisarla. Reportar no la oculta automáticamente.',async()=>{
    try{await profesorRpc('profesor_resena_reportar',{p_resena_id:id,p_motivo:'contenido inapropiado'});showToast('Reporte enviado');}catch(e){showToast(errorProfesorTexto(e),true);}
  },{label:'Reportar',danger:false});
}

if(typeof module!=='undefined'&&module.exports)module.exports={
  limpiarTextoProfesor,normalizarNombreProfesor,coincidenNombresProfesor,
  seccionProfesorRamo,promedioProfesor,cursosProfesorSeguro,detalleProfesorSeguro
};
