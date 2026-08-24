// Evaluaciones todavía pendientes que no aparecen en la línea de tiempo porque
// les falta fecha. Se ofrecen como acción, no como un dato perdido.
function agendaSinFecha(){
  const out=[];
  S.ramos.forEach(r=>(r.categorias||[]).forEach(c=>{
    if(!categoriaEximida(r,c)&&!c.fecha&&avgPond(c.notas)===null)out.push({ramo:r,cat:c});
  }));
  return out;
}

function abrirFechaAgenda(item){
  if(!item)return;
  openRamo(item.ramo.id);
  setTimeout(()=>openEditCatModal(item.cat.id),320);
}

// El orden es una preferencia de lectura de esta sesión, no un dato académico.
// No entra a S ni a gradehub_v1: cambiar cómo se mira la Agenda no justifica
// una migración del estado que ya tienen los estudiantes en producción.
const AGENDA_ORDENES=['recomendado','fecha','peso'];
let agendaOrdenActual='recomendado';
let agendaDetalleAbierto=null;

function ordenarAgenda(pendientes,orden='recomendado'){
  const criterio=AGENDA_ORDENES.includes(orden)?orden:'recomendado';
  return [...pendientes].sort((a,b)=>{
    if(criterio==='fecha'){
      const porFecha=a.fecha.localeCompare(b.fecha);
      return porFecha||b.score-a.score;
    }
    if(criterio==='peso'){
      const porPeso=(b.cat.peso||0)-(a.cat.peso||0);
      return porPeso||a.fecha.localeCompare(b.fecha)||b.score-a.score;
    }
    // Es exactamente el comparador que usaba renderAgenda antes de ofrecer
    // alternativas. "Recomendado" nombra el comportamiento, no lo reescribe.
    return b.score-a.score;
  });
}

function destacadasAgenda(pendientes,orden='recomendado'){
  return ordenarAgenda(pendientes,orden).slice(0,2);
}

function cambiarOrdenAgenda(orden){
  if(!AGENDA_ORDENES.includes(orden)||orden===agendaOrdenActual)return;
  agendaOrdenActual=orden;
  renderAgenda();
}

// Ordenar es un control secundario: se decide una vez y después se mira la
// lista. Tenía una franja propia con su etiqueta, así que competía de igual a
// igual con las evaluaciones. Ahora viaja en la misma línea del encabezado de
// sección, que es donde se espera un control de vista, y devuelve esa franja
// entera al contenido.
function agendaOrdenHTML(activo=agendaOrdenActual){
  const opciones=[['recomendado','Recomendado'],['fecha','Fecha'],['peso','Peso']];
  return `<div class="ag-order-options" role="group" aria-label="Ordenar evaluaciones pendientes">
      ${opciones.map(([valor,label])=>`<button type="button" class="ag-order-option${activo===valor?' active':''}" aria-pressed="${activo===valor?'true':'false'}" onclick="cambiarOrdenAgenda('${valor}')">${label}</button>`).join('')}
    </div>`;
}

function focoAgendaCopy(e){
  if(e.estadoAgenda==='esperando_nota'||e.estadoAgenda==='requiere_revision')return 'Fecha pasada: agrega la nota o corrige la fecha.';
  if(e.dias===0)return 'Es hoy. Revisa lo esencial y llega con lo importante resuelto.';
  if(e.dias<=2)return `Faltan ${e.dias} día${e.dias!==1?'s':''}: es lo que más te conviene atender ahora.`;
  if(e.necesita!==null&&e.necesita>5.0)return `Te exige ${nf(e.necesita)} en lo pendiente para aprobar: adelántate.`;
  return `${cuandoTexto(e.dias)} · combina cercanía, peso y cómo vas en el ramo.`;
}

function razonDestacadaAgenda(e){
  if(e.estadoAgenda==='esperando_nota'||e.estadoAgenda==='requiere_revision')return focoAgendaCopy(e);
  if(e.necesita!==null&&e.necesita>7.05)return 'Con lo pendiente ya no alcanza para aprobar el ramo.';
  if(e.necesita!==null&&e.necesita>5.0)return `Necesitas ${nf(e.necesita)} en lo pendiente para aprobar.`;
  if(e.avg!==null&&r2(e.avg)<4.0)return `Vas ${fmt(e.avg)} en el ramo: conviene prepararla con tiempo.`;
  if((e.cat.peso||0)>=30)return `Define ${r2(e.cat.peso||0)}% del ramo.`;
  return focoAgendaCopy(e);
}

function agendaDestacadaHTML(e,posicion){
  if(!e)return '';
  const f=formatEventDate(e.fecha);
  return `<button class="ag-priority-card ${e.nivel}" style="--ag-course:${esc(e.ramo.color)}" onclick="openRamo('${esc(e.ramo.id)}')">
    <span class="ag-priority-bar" aria-hidden="true"></span>
    <div class="ag-priority-top">
      <span class="ag-priority-rank ${e.nivel}">${posicion===0?'Tu foco ahora':'Siguiente'}</span>
      <span class="ag-priority-weight">${r2(e.cat.peso||0)}%</span>
    </div>
    <div class="ag-priority-date">${cuandoTexto(e.dias)} <span>· ${f.day} ${f.mon}${e.hora?' · '+esc(e.hora):''}</span></div>
    <div class="ag-priority-name">${esc(e.cat.nombre)}</div>
    <div class="ag-priority-course"><span class="ag-ramo-dot" style="background:${esc(e.ramo.color)}"></span>${esc(e.ramo.nombre)}</div>
    <div class="ag-priority-reason">${razonDestacadaAgenda(e)}</div>
  </button>`;
}

function agendaEventoKey(e){
  return `${e.ramo.id}--${e.cat.id}`.replace(/[^a-zA-Z0-9_-]/g,'-');
}

// La Agenda conoce la nota necesaria como promedio de TODO lo pendiente. Si
// quedan varias evaluaciones, presentarla como "la nota que necesitas aquí"
// sería una precisión falsa: depende de cómo le vaya en las demás.
function referenciaEvaluacionAgenda(e){
  const descarte=reglaDescarteConCantidadAbierta(e.ramo);
  if(descarte)return {
    titulo:'Todavía no hay una meta exacta',
    texto:`Depende de cuántas notas entren en ${descarte.nombre}.`,
  };
  if(e.necesita===null)return {
    titulo:'Todavía no hay una meta calculable',
    texto:'Completa la pauta del ramo para estimar cuánto necesitas.',
  };
  if(e.necesita>7.05)return {
    titulo:'No alcanza solo con lo pendiente',
    texto:'Abre el ramo para revisar alternativas y reglas de aprobación.',
  };
  if(e.necesita<=1.0)return {
    titulo:'Tienes margen para aprobar',
    texto:'Incluso un promedio bajo en lo pendiente mantiene el ramo sobre 4,0.',
  };
  return {
    titulo:`${nf(e.necesita)} para aprobar`,
    texto:`Necesitas ${nf(e.necesita)} promedio en lo pendiente para llegar a 4,0.`,
  };
}

function siguienteEvaluacionAgenda(actual,pendientes){
  const cronologia=ordenarAgenda(pendientes,'fecha');
  const indice=cronologia.findIndex(e=>agendaEventoKey(e)===agendaEventoKey(actual));
  return indice>=0?cronologia[indice+1]||null:null;
}

function detalleEvaluacionAgendaHTML(e,pendientes){
  const referencia=referenciaEvaluacionAgenda(e);
  const siguiente=siguienteEvaluacionAgenda(e,pendientes);
  const key=agendaEventoKey(e);
  const despues=siguiente?{
    titulo:siguiente.cat.nombre,
    texto:`${cuandoTexto(siguiente.dias)} · ${siguiente.ramo.nombre}`,
  }:{
    titulo:'Nada más agendado',
    texto:'Es la última evaluación pendiente con fecha.',
  };
  return `<div class="ag-event-detail" id="ag-detail-${key}" role="region" aria-labelledby="ag-trigger-${key}" hidden>
    <div class="ag-event-detail-block">
      <span class="ag-event-detail-label">Tu referencia</span>
      <strong>${esc(referencia.titulo)}</strong>
      <span>${esc(referencia.texto)}</span>
    </div>
    <div class="ag-event-detail-block">
      <span class="ag-event-detail-label">Después</span>
      <strong>${esc(despues.titulo)}</strong>
      <span>${esc(despues.texto)}</span>
    </div>
    <button type="button" class="ag-event-course" onclick="openRamo('${esc(e.ramo.id)}')">Ver ramo</button>
  </div>`;
}

function agendaEventoHTML(e,contenido,pendientes,tipo='row'){
  const key=agendaEventoKey(e);
  return `<div class="ag-event ag-event-${tipo}" data-agenda-key="${key}">
    ${contenido}
    <span class="ag-event-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m8 10 4 4 4-4"/></svg></span>
    ${detalleEvaluacionAgendaHTML(e,pendientes)}
  </div>`;
}

function proximoDetalleAgenda(actual,nuevo){
  return actual===nuevo?null:nuevo;
}

function toggleAgendaDetalle(trigger){
  const item=trigger&&trigger.closest?trigger.closest('.ag-event'):null;
  const body=document.getElementById('agenda-body');
  if(!item||!body)return;
  const topAntes=trigger.getBoundingClientRect?trigger.getBoundingClientRect().top:null;
  const nuevo=proximoDetalleAgenda(agendaDetalleAbierto,item.dataset.agendaKey);
  agendaDetalleAbierto=nuevo;

  body.querySelectorAll('.ag-event').forEach(candidato=>{
    const boton=candidato.firstElementChild;
    const detalle=candidato.querySelector('.ag-event-detail');
    const abierto=!!nuevo&&candidato.dataset.agendaKey===nuevo;
    candidato.classList.toggle('expanded',abierto);
    if(boton)boton.setAttribute('aria-expanded',abierto?'true':'false');
    if(detalle)detalle.hidden=!abierto;
  });

  // Al cerrar una tarjeta anterior situada arriba, la tocada subiría varios
  // centímetros. Compensar esa diferencia conserva el punto de lectura móvil.
  if(Number.isFinite(topAntes)&&trigger.getBoundingClientRect&&typeof window.scrollBy==='function'){
    requestAnimationFrame(()=>{
      const topDespues=trigger.getBoundingClientRect().top;
      window.scrollBy(0,topDespues-topAntes);
    });
  }
}

function activarDetallesAgenda(body){
  body.querySelectorAll('.ag-event').forEach(item=>{
    const trigger=item.firstElementChild;
    const key=item.dataset.agendaKey;
    if(!trigger||!key)return;
    const chevron=item.querySelector('.ag-event-chevron');
    const chevronAnterior=trigger.querySelector('.chevron-r');
    if(chevronAnterior)chevronAnterior.remove();
    if(chevron)trigger.appendChild(chevron);
    trigger.removeAttribute('onclick');
    trigger.classList.add('ag-event-trigger');
    trigger.id=`ag-trigger-${key}`;
    trigger.setAttribute('aria-expanded','false');
    trigger.setAttribute('aria-controls',`ag-detail-${key}`);
    trigger.addEventListener('click',()=>toggleAgendaDetalle(trigger));
  });
}

function resumenSemanaAgenda(pendientes){
  const semana=pendientes.filter(e=>e.dias>=0&&e.dias<=7);
  if(!semana.length)return null;
  return {cantidad:semana.length,peso:r2(semana.reduce((total,e)=>total+(e.cat.peso||0),0))};
}

function resumenSemanaHTML(pendientes){
  const resumen=resumenSemanaAgenda(pendientes);
  if(!resumen)return '';
  return `<div class="ag-list-hd ag-week-hd">
    <span class="section-hd-title">Próximos 7 días</span>
    <span class="ag-count">${resumen.cantidad} eval. · ${resumen.peso}%</span>
    ${agendaOrdenHTML(agendaOrdenActual)}
  </div>`;
}

function agendaSinFechaHTML(sinFecha){
  if(!sinFecha.length)return '';
  const primera=sinFecha[0];
  return `<section class="ag-undated" aria-label="Evaluaciones sin fecha">
    <div class="ag-undated-copy">
      <span class="ag-undated-kicker">Por completar</span>
      <strong>${sinFecha.length} evaluación${sinFecha.length!==1?'es':''} sin fecha</strong>
      <span>Parte por ${esc(primera.cat.nombre)} · ${esc(primera.ramo.nombre)}</span>
    </div>
    <button type="button" class="ag-undated-action" onclick="abrirFechaAgenda(agendaSinFecha()[0])">Agregar fecha</button>
  </section>`;
}

function completarNotaDesdeAgenda(ramoId,catId,notaId){
  openRamo(ramoId);
  // La nota con fecha propia ya existe y se edita; una categoría con varias
  // notas abre el modal para agregar otra. La evaluación directa queda visible
  // en la ficha con su campo de nota listo para escribir.
  setTimeout(()=>{
    if(notaId)openEditNotaModal(catId,notaId);
    else{
      const r=S.ramos.find(x=>x.id===ramoId);
      const c=r&&(r.categorias||[]).find(x=>x.id===catId);
      if(c&&c.directNota===false)openAddNotaModal(catId);
    }
  },320);
}

function corregirFechaDesdeAgenda(ramoId,catId,notaId){
  openRamo(ramoId);
  setTimeout(()=>{
    if(notaId)openEditNotaModal(catId,notaId);
    else openEditCatModal(catId);
  },320);
}

function agendaFechasPasadasHTML(eventos){
  if(!eventos.length)return '';
  const ordenados=[...eventos].sort((a,b)=>{
    const revisarA=a.estadoAgenda==='requiere_revision'?1:0;
    const revisarB=b.estadoAgenda==='requiere_revision'?1:0;
    return revisarB-revisarA||b.fecha.localeCompare(a.fecha);
  });
  return `<section class="ag-waiting" aria-label="Fechas pasadas sin nota">
    <div class="ag-waiting-head">
      <div>
        <span class="ag-waiting-kicker">Por completar</span>
        <strong>Fechas pasadas sin nota</strong>
      </div>
      <span class="ag-count">${ordenados.length}</span>
    </div>
    <p class="ag-waiting-help">Si ya la rendiste, agrega la nota cuando llegue. Si se movió, corrige o quita la fecha.</p>
    <div class="ag-waiting-list">${ordenados.map(e=>{
      const f=formatEventDate(e.fecha);
      const notaId=e.nota?e.nota.id:'';
      const revisar=e.estadoAgenda==='requiere_revision';
      return `<article class="ag-waiting-row${revisar?' needs-review':''}">
        <span class="ag-row-bar" style="background:${esc(e.ramo.color)}"></span>
        <div class="ag-waiting-copy">
          <span class="ag-waiting-meta">${revisar?'<b>Revisar fecha</b>':''}<span>${cuandoTexto(e.dias)} · ${f.day} ${f.mon}</span></span>
          <strong>${esc(e.nota?e.nota.nombre:e.cat.nombre)}</strong>
          <span>${esc(e.ramo.nombre)}</span>
        </div>
        <div class="ag-waiting-actions">
          <button type="button" class="ag-waiting-primary" onclick="completarNotaDesdeAgenda('${esc(e.ramo.id)}','${esc(e.cat.id)}','${esc(notaId)}')">${e.nota?'Completar nota':'Poner nota'}</button>
          <button type="button" class="ag-waiting-secondary" onclick="corregirFechaDesdeAgenda('${esc(e.ramo.id)}','${esc(e.cat.id)}','${esc(notaId)}')">Corregir fecha</button>
        </div>
      </article>`;
    }).join('')}</div>
  </section>`;
}

function renderAgenda(){
  const body=document.getElementById("agenda-body");if(!body)return;
  agendaDetalleAbierto=null;
  const events=agendaEvents();
  const sinFecha=agendaSinFecha();

  const expBtn=document.getElementById("agenda-export-btn");
  // Importar fechas sirve justo cuando la Agenda aún no tiene ninguna. El menú
  // decide cuáles opciones de salida aplican; esconder el acceso lo volvería
  // inaccesible para su caso principal.
  if(expBtn)expBtn.style.display="block";

  if(events.length===0){
    const hayRamos=S.ramos.length>0;
    const primerRamo=hayRamos?S.ramos[0]:null;
    const primeraSinFecha=sinFecha[0];
    const title=primeraSinFecha?"Tu agenda está a un paso.":hayRamos?"Organiza tu semestre.":"Empecemos por lo primero.";
    const desc=primeraSinFecha
      ? `Tienes ${sinFecha.length} evaluación${sinFecha.length!==1?'es':''} pendiente${sinFecha.length!==1?'s':''} de agendar. Parte por ${esc(primeraSinFecha.cat.nombre)}.`
      : hayRamos
      ? "Agrega la fecha de tus pruebas, entregas y exámenes. Van a aparecer acá ordenadas por lo que más te conviene atender primero."
      : "Necesitas al menos un ramo con evaluaciones para empezar a llenar la agenda.";
    const ctaLabel=primeraSinFecha?"Poner primera fecha":hayRamos?"Agregar evaluación":"Agregar mi primer ramo";
    const ctaAction=primeraSinFecha?"abrirFechaAgenda(agendaSinFecha()[0])":hayRamos?"openRamo(\u0027"+esc(primerRamo.id)+"\u0027);setTimeout(openAddCatModal,320);":"openAddRamoModal();";
    body.innerHTML=`
      <div class="ag-empty">
        <div class="ag-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="52" height="52" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 16h40"/><path d="M12 32h40"/><path d="M12 48h26"/>
            <circle cx="6" cy="16" r="2.4" fill="currentColor" stroke="none"/>
            <circle cx="6" cy="32" r="2.4" fill="currentColor" stroke="none"/>
            <circle cx="6" cy="48" r="2.4" fill="currentColor" stroke="none"/>
          </svg>
        </div>
        <div class="ag-empty-title">${title}</div>
        <div class="ag-empty-desc">${desc}</div>
        <button class="ag-empty-cta" onclick="${ctaAction}">${ctaLabel}</button>
      </div>`;
    return;
  }

  const clasificados=events.map(e=>({...e,estadoAgenda:estadoEventoAgenda(e)}));
  const pendientes=clasificados.filter(e=>e.estadoAgenda!=='con_nota').map(withPriority);
  const porVenir=pendientes.filter(e=>e.estadoAgenda==='por_venir');
  const fechasPasadas=pendientes.filter(e=>e.estadoAgenda==='esperando_nota'||e.estadoAgenda==='requiere_revision');
  const fechasPorRevisar=fechasPasadas.filter(e=>e.estadoAgenda==='requiere_revision');
  const hechas=clasificados.filter(e=>e.estadoAgenda==='con_nota');
  const ordenadas=ordenarAgenda(porVenir,agendaOrdenActual);

  // Subtítulo del hero: resume el estado en una línea
  const sub=document.getElementById('agenda-sub');
  if(sub){
    if(porVenir.length===0&&fechasPasadas.length===0){
      sub.textContent='Todo al día';
    }else if(porVenir.length===0){
      sub.textContent=`${fechasPasadas.length} fecha${fechasPasadas.length!==1?'s':''} pasada${fechasPasadas.length!==1?'s':''} sin nota`;
    }else{
      const prox=porVenir.reduce((min,e)=>e.dias<min.dias?e:min,porVenir[0]);
      const partes=[`${porVenir.length} por venir`,`la próxima ${cuandoTexto(prox.dias).toLowerCase()}`];
      if(fechasPasadas.length)partes.push(`${fechasPasadas.length} sin nota`);
      if(fechasPorRevisar.length)partes.push(`${fechasPorRevisar.length} por revisar`);
      sub.textContent=partes.join(' · ');
    }
  }

  let html="";

  // Las dos primeras se leen antes de escanear la lista. El orden elegido
  // también decide cuáles son: "Recomendado" usa la mezcla académica existente;
  // Fecha y Peso son overrides explícitos del estudiante.
  if(porVenir.length>0){
    const destacadas=destacadasAgenda(porVenir,agendaOrdenActual);
    const restantes=ordenadas.slice(destacadas.length);
    html+=resumenSemanaHTML(porVenir);
    html+=`<div class="ag-priority-heading"><span class="section-hd-title">Tus prioridades</span><span class="ag-count">${destacadas.length}</span></div>`;
    // Las dos iban lado a lado, en mitades iguales. En 375px esa mitad no
    // alcanzaba para el contenido: "Métodos Matemáti", "es lo que más te
    // convie…". Y sobre todo, dos cosas del mismo tamaño no son una jerarquía:
    // si las dos gritan igual, el estudiante tiene que leer las dos para saber
    // cuál es primero. Ahora la primera ocupa el ancho y la segunda va debajo,
    // más contenida — se ve cuál manda antes de leer nada.
    html+=`<div class="ag-priority-stack">${destacadas.map((e,i)=>agendaEventoHTML(e,agendaDestacadaHTML(e,i),porVenir,i===0?'priority':'priority-sec')).join('')}</div>`;
    // La alerta de "necesitas X para aprobar" es del ramo, no de la evaluación:
    // se muestra solo en la más prioritaria de cada ramo para no repetirla.
    const ramosVistos=new Set(destacadas.map(e=>e.ramo.id));
    restantes.forEach(e=>{
      e.mostrarAlerta=!ramosVistos.has(e.ramo.id);
      ramosVistos.add(e.ramo.id);
    });
    if(restantes.length){
      html+=`<div class="ag-list-hd ag-rest-heading"><span class="section-hd-title">Después</span><span class="ag-count">${restantes.length}</span></div>`;
      html+=restantes.map(e=>agendaEventoHTML(e,agendaItemHTML(e),porVenir)).join("");
    }
  } else if(fechasPasadas.length>0){
    html+=`<div class="ag-alldone ag-no-upcoming">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
      <div><div class="ag-alldone-t">No tienes evaluaciones próximas.</div><div class="ag-alldone-s">Abajo puedes completar las fechas que ya pasaron.</div></div>
    </div>`;
  } else {
    html+=`<div class="ag-alldone">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
      <div><div class="ag-alldone-t">Nada pendiente.</div><div class="ag-alldone-s">Todas tus evaluaciones con fecha ya están rendidas.</div></div>
    </div>`;
  }

  // Las fechas pasadas sin nota siguen a mano, pero después de todo lo que aún
  // se puede preparar. No son "vencidas": la nota puede tardar y la fecha puede
  // haberse movido.
  html+=agendaFechasPasadasHTML(fechasPasadas);

  // Completar fechas sigue a un toque, después de los eventos que ya tienen una
  // fecha conocida. Antes ocupaba la primera tarjeta y competía con el foco.
  html+=agendaSinFechaHTML(sinFecha);

  if(hechas.length>0){
    hechas.sort((a,b)=>b.fecha.localeCompare(a.fecha));
    html+=`<div class="ag-list-hd" style="margin-top:26px;"><span class="section-hd-title">Ya rendidas</span><span class="ag-count">${hechas.length}</span></div>`;
    html+=hechas.map(e=>{
      const a=avgPond(e.notas);
      const f=formatEventDate(e.fecha);
      return `<button class="ag-row done" onclick="openRamo(\u0027${esc(e.ramo.id)}\u0027)">
        <span class="ag-row-bar" style="background:${esc(e.ramo.color)}"></span>
        <div class="ag-row-main">
          <div class="ag-row-top"><span class="ag-row-when done">${f.day} ${f.mon}${e.hora?' · '+esc(e.hora):''}</span><span class="ag-row-peso">${r2(e.cat.peso||0)}%</span></div>
          <div class="ag-row-name">${esc(e.cat.nombre)}</div>
          <div class="ag-row-sub"><span class="ag-ramo-dot" style="background:${esc(e.ramo.color)}"></span>${esc(e.ramo.nombre)}</div>
        </div>
        ${a!==null?`<span class="ramo-nota ${colorClass(a)}" style="--grade-color:${getColor(a)};min-width:auto;font-size:1.1875rem;">${fmt(a)}</span>`:""}
      </button>`;
    }).join("");
  }

  body.innerHTML=html;
  activarDetallesAgenda(body);
}
