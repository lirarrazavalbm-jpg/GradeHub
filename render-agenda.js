// Evaluaciones todavía pendientes que no aparecen en la línea de tiempo porque
// les falta fecha. Se ofrecen como acción, no como un dato perdido.
function agendaSinFecha(){
  const out=[];
  S.ramos.forEach(r=>(r.categorias||[]).forEach(c=>{
    if(!c.fecha&&avgPond(c.notas)===null)out.push({ramo:r,cat:c});
  }));
  return out;
}

function abrirFechaAgenda(item){
  if(!item)return;
  openRamo(item.ramo.id);
  setTimeout(()=>openEditCatModal(item.cat.id),320);
}

function focoAgendaCopy(e){
  if(e.dias<0)return 'Quedó pendiente. Registra la nota o revisa qué pasó antes de seguir.';
  if(e.dias===0)return 'Es hoy. Revisa lo esencial y llega con lo importante resuelto.';
  if(e.dias<=2)return `Faltan ${e.dias} día${e.dias!==1?'s':''}: es lo que más te conviene atender ahora.`;
  if(e.necesita!==null&&e.necesita>5.0)return `Te exige ${nf(e.necesita)} en lo pendiente para aprobar: adelántate.`;
  return `${cuandoTexto(e.dias)} · combina cercanía, peso y cómo vas en el ramo.`;
}

function focoAgendaHTML(e){
  if(!e)return '';
  return `<button class="ag-row ${e.nivel}" onclick="openRamo('${esc(e.ramo.id)}')">
    <span class="ag-row-bar" style="background:${esc(e.ramo.color)}"></span>
    <div class="ag-row-main">
      <div class="ag-row-top"><span class="ag-row-when ${e.nivel}">Tu foco ahora</span><span class="ag-row-date">${cuandoTexto(e.dias)}</span><span class="ag-row-peso">${r2(e.cat.peso||0)}%</span></div>
      <div class="ag-row-name">${esc(e.cat.nombre)}</div>
      <div class="ag-row-sub"><span class="ag-ramo-dot" style="background:${esc(e.ramo.color)}"></span>${esc(e.ramo.nombre)}</div>
      <div class="ag-alert">${focoAgendaCopy(e)}</div>
    </div>
    <span class="chevron-r">›</span>
  </button>`;
}

function resumenSemanaAgenda(pendientes){
  const semana=pendientes.filter(e=>e.dias>=0&&e.dias<=7);
  if(!semana.length)return null;
  return {cantidad:semana.length,peso:r2(semana.reduce((total,e)=>total+(e.cat.peso||0),0))};
}

function resumenSemanaHTML(pendientes){
  const resumen=resumenSemanaAgenda(pendientes);
  if(!resumen)return '';
  return `<div class="ag-list-hd"><span class="section-hd-title">Próximos 7 días</span><span class="ag-count">${resumen.cantidad} eval. · ${resumen.peso}%</span></div>`;
}

function renderAgenda(){
  const body=document.getElementById("agenda-body");if(!body)return;
  const events=agendaEvents();
  const sinFecha=agendaSinFecha();

  const expBtn=document.getElementById("agenda-export-btn");
  if(expBtn)expBtn.style.display=events.length?"block":"none";

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

  const pendientes=events.filter(e=>e.pending).map(withPriority);
  const hechas=events.filter(e=>!e.pending);
  pendientes.sort((a,b)=>b.score-a.score);

  // Subtítulo del hero: resume el estado en una línea
  const sub=document.getElementById('agenda-sub');
  if(sub){
    if(pendientes.length===0){
      sub.textContent='Todo al día';
    }else{
      const prox=pendientes.reduce((min,e)=>e.dias<min.dias?e:min,pendientes[0]);
      const vencidas=pendientes.filter(e=>e.dias<0).length;
      const partes=[`${pendientes.length} pendiente${pendientes.length!==1?'s':''}`];
      if(vencidas>0)partes.push(`${vencidas} vencida${vencidas!==1?'s':''}`);
      else if(prox.dias>=0)partes.push(`la próxima ${cuandoTexto(prox.dias).toLowerCase()}`);
      sub.textContent=partes.join(' · ');
    }
  }

  let html="";

  if(sinFecha.length){
    const primera=sinFecha[0];
    html+=`<button class="ag-row media" onclick="abrirFechaAgenda(agendaSinFecha()[0])">
      <span class="ag-row-bar" style="background:${esc(primera.ramo.color)}"></span>
      <div class="ag-row-main">
        <div class="ag-row-top"><span class="ag-row-when media">Fecha pendiente</span><span class="ag-row-peso">Agendar</span></div>
        <div class="ag-row-name">${sinFecha.length} evaluación${sinFecha.length!==1?'es':''} sin fecha</div>
        <div class="ag-row-sub"><span class="ag-ramo-dot" style="background:${esc(primera.ramo.color)}"></span>Parte por ${esc(primera.cat.nombre)} · ${esc(primera.ramo.nombre)}</div>
      </div>
      <span class="chevron-r">›</span>
    </button>`;
  }

  // Lo urgente arriba, sin agrupar: la lista ya viene ordenada por importancia
  if(pendientes.length>0){
    html+=focoAgendaHTML(pendientes[0]);
    html+=resumenSemanaHTML(pendientes);
    // La alerta de "necesitas X para aprobar" es del ramo, no de la evaluación:
    // se muestra solo en la más prioritaria de cada ramo para no repetirla.
    const ramosVistos=new Set();
    pendientes.forEach(e=>{
      e.mostrarAlerta=!ramosVistos.has(e.ramo.id);
      ramosVistos.add(e.ramo.id);
    });
    html+=pendientes.map(agendaItemHTML).join("");
  } else {
    html+=`<div class="ag-alldone">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
      <div><div class="ag-alldone-t">Nada pendiente.</div><div class="ag-alldone-s">Todas tus evaluaciones con fecha ya están rendidas.</div></div>
    </div>`;
  }

  if(hechas.length>0){
    hechas.sort((a,b)=>b.fecha.localeCompare(a.fecha));
    html+=`<div class="ag-list-hd" style="margin-top:26px;"><span class="section-hd-title">Ya rendidas</span><span class="ag-count">${hechas.length}</span></div>`;
    html+=hechas.map(e=>{
      const a=avgPond(e.notas);
      const f=formatEventDate(e.fecha);
      return `<button class="ag-row done" onclick="openRamo(\u0027${esc(e.ramo.id)}\u0027)">
        <span class="ag-row-bar" style="background:${esc(e.ramo.color)}"></span>
        <div class="ag-row-main">
          <div class="ag-row-top"><span class="ag-row-when done">${f.day} ${f.mon}</span><span class="ag-row-peso">${r2(e.cat.peso||0)}%</span></div>
          <div class="ag-row-name">${esc(e.cat.nombre)}</div>
          <div class="ag-row-sub"><span class="ag-ramo-dot" style="background:${esc(e.ramo.color)}"></span>${esc(e.ramo.nombre)}</div>
        </div>
        ${a!==null?`<span class="ramo-nota ${colorClass(a)}" style="min-width:auto;font-size:19px;">${fmt(a)}</span>`:""}
      </button>`;
    }).join("");
  }

  body.innerHTML=html;
}
