// ─── RENDER · AGENDA ────────────────────────────────────────────────────────
// La agenda depende del estado y helpers globales de app.js, pero vive aparte
// para que sus cambios de producto no agranden el núcleo de la aplicación.
// Solo se sugieren evaluaciones sin fecha que todavía no se han rendido: una
// nota histórica sin fecha no necesita volver a aparecer como pendiente.
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
    html+=`<button class="ag-missing-dates" onclick="abrirFechaAgenda(agendaSinFecha()[0])">
      <span class="ag-missing-dates-icon" aria-hidden="true"><svg class="ic" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/></svg></span>
      <span class="ag-missing-dates-copy"><strong>${sinFecha.length} evaluación${sinFecha.length!==1?'es':''} sin fecha</strong><small>Parte por ${esc(primera.cat.nombre)} · ${esc(primera.ramo.nombre)}</small></span>
      <span class="ag-missing-dates-action">Agendar</span>
    </button>`;
  }
  if(pendientes.length>0){
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
