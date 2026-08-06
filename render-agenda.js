function renderAgenda(){
  const body=document.getElementById("agenda-body");if(!body)return;
  const events=agendaEvents();

  const expBtn=document.getElementById("agenda-export-btn");
  if(expBtn)expBtn.style.display=events.length?"block":"none";

  if(events.length===0){
    const hayRamos=S.ramos.length>0;
    const primerRamo=hayRamos?S.ramos[0]:null;
    const title=hayRamos?"Organiza tu semestre.":"Empecemos por lo primero.";
    const desc=hayRamos
      ? "Agrega la fecha de tus pruebas, entregas y exámenes. Van a aparecer acá ordenadas por lo que más te conviene atender primero."
      : "Necesitas al menos un ramo con evaluaciones para empezar a llenar la agenda.";
    const ctaLabel=hayRamos?"Agregar evaluación":"Agregar mi primer ramo";
    const ctaAction=hayRamos?"openRamo(\u0027"+esc(primerRamo.id)+"\u0027);setTimeout(openAddCatModal,320);":"openAddRamoModal();";
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

  // Lo urgente arriba, sin agrupar: la lista ya viene ordenada por importancia
  if(pendientes.length>0){
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
