// Render de las vistas principales. Carga después de app.js: usa sus datos y helpers globales.

function renderHome(){
  const g=gpa(S.ramos);
  const gpael=document.getElementById('home-gpa');
  const emptyHint=document.getElementById('gpa-empty-hint');
  const gpaSub=document.getElementById('home-gpa-sub');
  const gpaMethod=document.getElementById('home-gpa-method');
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
    // Los íconos van en SVG como todo el resto: '↕' y '↓' son caracteres con
    // presentación emoji y muchos sistemas los dibujan a color, así que
    // quedaban como emoji sueltos en una interfaz que no usa ninguno. `.ic`
    // mide 1em y ya está alineado para ir dentro de una línea de texto.
    const labels={manual:'Manual',avg:'Por nota',name:'A-Z'};
    const iconos={
      manual:'<path d="M7 6h13M7 12h13M7 18h13"/><circle cx="3.5" cy="6" r=".8" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r=".8" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r=".8" fill="currentColor" stroke="none"/>',
      avg:'<path d="M5 6h14M8 12h11M11 18h8"/>',
      name:'<path d="M5 7h6M5 17h6M16 5v14M13 16l3 3 3-3"/>'
    };
    const label=labels[S.sortMode]||labels.manual;
    sortBtn.innerHTML=`<span>${label}</span><svg class="ic sort-mode-icon" viewBox="0 0 24 24" aria-hidden="true">${iconos[S.sortMode]||iconos.manual}</svg>`;
    sortBtn.setAttribute('aria-label',`Orden actual: ${label}. Cambiar orden`);
  }

  const simGlobalBtn=document.getElementById('sim-global-btn');
  if(S.ramos.length===0){
    gpael.textContent='·';gpael.className='gpa-num empty';
    gpaSub.style.display='none';gpaMethod.style.display='none';emptyHint.style.display='block';
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
      // Transparencia: el modo se explica sin pedir que alguien invente SCT.
      const detalle=descripcionMetodoGpa(S.ramos);
      if(detalle)msg+='\n'+detalle.texto;
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
  const detalleMetodo=descripcionMetodoGpa(S.ramos);
  if(detalleMetodo){
    gpaMethod.textContent=detalleMetodo.texto;
    gpaMethod.style.display='block';
  }else gpaMethod.style.display='none';

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
    const maxInsights=2;
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

  const c=document.getElementById('home-ramos');
  // La lista sigue montada mientras la persona entra a un ramo. Leer el avance
  // anterior desde esas filas permite distinguir un cierre real de un ramo que
  // ya venía en 100%, sin guardar estado nuevo ni repetir el efecto en cada render.
  const progresosAnteriores=new Map([...c.querySelectorAll('.ramo-row[data-progress]')]
    .map(fila=>[fila.dataset.ramoId,Number(fila.dataset.progress)]));
  c.innerHTML='';
  ramos.forEach(r=>{
    const avg=ramoAvg(r);const nc=r.categorias.length;
    // La lista ya se vació. Si una integración dejó una categoría sin el
    // arreglo `notas`, ese ramo sigue siendo parte del semestre: se muestra
    // como sin notas en vez de borrar visualmente todos los ramos.
    const nn=r.categorias.reduce((a,cat)=>a+(Array.isArray(cat.notas)?cat.notas.length:0),0);
    const prog=ramoProgress(r);
    const completo=prog.pct===100;
    const recienCerrado=ramoRecienCerrado(progresosAnteriores.get(r.id),prog.pct);
    let metaHtml;
    if(nc===0){
      metaHtml=`<span class="ramo-meta-text">Sin evaluaciones</span>`;
    } else if(nn===0){
      metaHtml=`<span class="ramo-meta-text">${nc} ${nc===1?'evaluación':'evaluaciones'}</span>`;
    } else {
      const pctLabel=completo?'100% · cerrado':`${prog.pct}% evaluado`;
      metaHtml=`<div class="ramo-progress${completo?' is-complete':''}${recienCerrado?' just-completed':''}" aria-hidden="true"><div class="ramo-progress-fill" style="transform:scaleX(${prog.pct/100})"></div></div><span class="ramo-meta-text${completo?' is-complete':''}">${pctLabel}</span>`;
    }
    const div=document.createElement('div');div.className='ramo-row';div.dataset.ramoId=r.id;div.onclick=()=>openRamo(r.id);
    div.dataset.progress=String(prog.pct);
    if(S.sortMode==='manual')div.dataset.reorderable='true';
    div.style.setProperty('--ramo-tint',r.color);
    const control=S.sortMode==='manual'
      ? `<button type="button" class="ramo-drag-handle" aria-label="Mantén presionado para mover ${esc(r.nombre)}" title="Mantén presionado para mover">
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="18" r="1" fill="currentColor" stroke="none"/></svg>
        </button>`
      : '<span class="chevron-r">›</span>';
    div.innerHTML=`
      <div class="ramo-band" style="background:${esc(r.color)}"></div>
      <div class="ramo-info"><div class="ramo-name">${esc(r.nombre)}</div><div class="ramo-meta">${metaHtml}</div></div>
      <div class="ramo-nota ${colorClass(avg)}" style="--grade-color:${getColor(avg)}">${fmt(avg)}</div>${control}`;
    c.appendChild(div);
  });
  if(S.sortMode==='manual')activarReordenRamos(c);
}
function renderRamo(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r){goHome();return;}
  document.getElementById('grade-gpa-echo')?.remove();
  document.getElementById('ramo-title').textContent=r.nombre;
  const avg=ramoAvg(r);
  const calculo=calculoRamoConCompuertas(r);
  const recuperativo=estadoRecuperativo(r,calculo);
  const descartes=calculo.res.drops||[];
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
  const periodoEl=document.getElementById('pauta-periodo');
  if(periodoEl){
    const info=infoPeriodoPauta(r);
    if(!info){periodoEl.style.display='none';periodoEl.innerHTML='';}
    else{
      const etiqueta=info.periodo?`Pauta del ${esc(info.periodo)}`:'Pauta oficial · período sin confirmar';
      const nota=info.estadoPeriodo==='vencido'?' · fechas no incluidas':'';
      periodoEl.className='pauta-periodo'+(info.estadoPeriodo==='vencido'?' is-vencida':'');
      periodoEl.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z"/></svg><span>${etiqueta}${nota}</span>`;
      periodoEl.style.display='inline-flex';
    }
  }

  // Chip nota mínima para el 4.0
  const chipEl=document.getElementById('ramo-min-chip');
  if(r.categorias.length>0){
    const categoriasActivas=resumenCategoriasCalculadas(r,calculo);
    const eximicion=estadoEximicion(r);
    const totalPeso=categoriasActivas.reduce((a,c)=>a+c.peso,0);
    let pesoConNotas=0,sumaPonderada=0;
    categoriasActivas.forEach(c=>{if(c.valor!==null&&c.valor!==undefined){pesoConNotas+=c.peso;sumaPonderada+=c.valor*c.peso;}});
    const pesoSinNotas=totalPeso-pesoConNotas;
    // ¿Hay un piso de nota activo? (sección calificada bajo su mínimo → topa la final)
    const gateHit=gatesActivas(r)[0]||null;
    const pctPendiente=totalPeso>0?Math.round(pesoSinNotas/totalPeso*100):0;
    if(eximicion&&eximicion.activa){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip';
      chipEl.textContent='Exento/a del Examen · puedes registrar una nota si lo rendiste';
    } else if(gateHit){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip bad';
      chipEl.textContent=gateHit.grupo
        ? `${gateHit.nombre} va ${fmt(gateHit.actual)} (mín. ${nf(gateHit.min)}): topa tu nota final`
        : `${gateHit.nombre} bajo ${nf(gateHit.min)}: repruebas pese al promedio`;
    } else if(recuperativo&&recuperativo.motivo==='pendiente'){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip warn';chipEl.textContent='Puedes rendir examen recuperativo';
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
    pw.style.display='flex';pw.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg><div>Las evaluaciones suman <b>${r2(tp)}%</b> — ajústalas para que sumen 100%</div>`;
  } else {pw.style.display='none';}

  // La pauta oficial cambió y este ramo sigue con la vieja. No se toca nada sin
  // que el estudiante apriete: es su ramo y su promedio va a cambiar.
  const pcw=document.getElementById('pauta-cambio');
  if(pcw){
    const cambio=cambioDePauta(r);
    if(cambio){
      const cuantos=cambio.cambios.length;
      pcw.style.display='flex';pcw.className='weight-setup-nudge';
      pcw.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></svg><div><b>La pauta oficial de este ramo cambió.</b><br>${cuantos} ${cuantos===1?'evaluación distinta':'evaluaciones distintas'} a lo que tienes hoy. Tu promedio se calcula con lo que tienes ahora.<div style="margin-top:8px;"><button type="button" class="rep-link" style="width:auto;padding:7px 12px;margin:0;" onclick="verCambioDePauta('${esc(r.id)}')">Ver qué cambia</button></div></div>`;
    }else if(r.consensoRespaldos){
      // Esta pauta la reportaron estudiantes, no sale de un programa oficial.
      // Decirlo es la diferencia entre una pauta y una ponderación inventada.
      pcw.style.display='flex';pcw.className='weight-setup-nudge';
      pcw.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></svg><div><b>Pauta reportada por estudiantes.</b><br>La enviaron ${r.consensoRespaldos} personas de tu universidad y coincidieron. No la sacamos del programa oficial: compárala con la de tu curso y corrígela si no calza.</div>`;
    }else{pcw.style.display='none';pcw.innerHTML='';}
  }

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

  const aw=document.getElementById('ausencias-justificadas-warning');
  const ausencias=calculo.ausencias;
  if(aw&&ausencias){
    const porId=new Map((r.categorias||[]).map(c=>[c.id,c.nombre]));
    const etiqueta=x=>x.tipo==='traspaso'
      ? `<b>${esc(porId.get(x.desdeId)||'Esta evaluación')}</b>: su ${r2((r.categorias.find(c=>c.id===x.desdeId)||{}).peso||0)}% pasa a <b>${esc(porId.get(x.haciaId)||'otra evaluación')}</b>.`
      : `<b>${esc(porId.get(x.desdeId)||'Esta evaluación')}</b> se reemplaza por <b>${esc(porId.get(x.haciaId)||'otra evaluación')}</b>.`;
    const declaradas=new Set(r.ausenciasJustificadas||[]);
    const reglas=[...(r.reglasAusenciaJustificada?.reemplazos||[]).map(x=>({...x,tipo:'reemplazo'})),...(r.reglasAusenciaJustificada?.traspasos||[]).map(x=>({...x,tipo:'traspaso'}))];
    const disponibles=reglas.filter(x=>!declaradas.has(x.desdeId)&&avgPond((r.categorias.find(c=>c.id===x.desdeId)||{}).notas)===null);
    const bloques=[];
    if(ausencias.activas.length)bloques.push(`<b>Ausencia justificada aplicada.</b><br>${ausencias.activas.map(etiqueta).join('<br>')}`);
    if(ausencias.pendientes.length)bloques.push(`<b>La ausencia quedó anotada, pero todavía no se aplica.</b><br>${ausencias.pendientes.map(x=>`Falta la nota de <b>${esc(porId.get(x.haciaId)||'la evaluación de reemplazo')}</b>.`).join('<br>')}`);
    if(ausencias.inactivas.length)bloques.push(`<b>Tu declaración se conserva, pero ya no se aplica.</b><br>${ausencias.inactivas.map(x=>x.motivo==='tiene_nota'?`<b>${esc(porId.get(x.desdeId)||'Esta evaluación')}</b> ahora tiene una nota. <button type="button" onclick="corregirAusenciaJustificada('${esc(x.desdeId)}')">Corregir declaración</button>`:'La pauta cambió y ya no podemos ubicar esa evaluación.').join('<br>')}`);
    if(disponibles.length)bloques.push(`<b>¿Faltaste con justificativo aprobado?</b><br>${disponibles.map(x=>`<button type="button" onclick="declararAusenciaJustificada('${esc(x.desdeId)}')">${esc(porId.get(x.desdeId)||'Marcar ausencia')}</button>`).join(' ')}`);
    if(bloques.length){aw.style.display='flex';aw.className='weight-setup-nudge';aw.style.width='auto';aw.style.margin='12px 20px';aw.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></svg><div>${bloques.join('<div style="height:10px;"></div>')}</div>`;}
    else{aw.style.display='none';aw.innerHTML='';}
  }else if(aw){aw.style.display='none';aw.innerHTML='';}

  const rw=document.getElementById('recuperativo-warning');
  if(rw&&recuperativo){
    rw.style.display='flex';rw.className='weight-setup-nudge';rw.style.width='auto';rw.style.margin='12px 20px';
    let texto='',acciones='';
    if(recuperativo.motivo==='pendiente'){
      texto=`<b>¿Rendiste el examen recuperativo?</b><br>Tu promedio final es ${nf(recuperativo.final)}. Elige solo si lo aprobaste o no.`;
      acciones=`<button type="button" onclick="declararRecuperativo('aprobado')">Aprobé</button><button type="button" onclick="declararRecuperativo('reprobado')" style="margin-left:14px;">No aprobé</button>`;
    }else if(recuperativo.motivo==='aprobado'){
      texto=`<b>Recuperativo aprobado.</b><br>Tu nota final queda en ${nf(recuperativo.valor)}.`;
      acciones='<button type="button" onclick="corregirRecuperativo()">Cambiar respuesta</button>';
    }else if(recuperativo.motivo==='reprobado'){
      texto=`<b>Recuperativo reprobado.</b><br>Tu nota final se mantiene en ${nf(recuperativo.valor)}.`;
      acciones='<button type="button" onclick="corregirRecuperativo()">Cambiar respuesta</button>';
    }else if(recuperativo.declaracion){
      const causa=recuperativo.motivo==='incompleto'
        ? 'faltan evaluaciones por registrar'
        : recuperativo.motivo==='compuerta'
        ? 'un requisito incumplido limitó tu nota final'
        : `al corregir tus notas tu promedio quedó en ${nf(recuperativo.final)}, fuera del rango`;
      texto=`<b>Tu declaración del recuperativo se conserva, pero ya no se aplica.</b><br>Esto pasa porque ${causa}.`;
      acciones='<button type="button" onclick="corregirRecuperativo()">Cambiar respuesta</button>';
    }else{rw.style.display='none';rw.innerHTML='';}
    if(rw.style.display!=='none')rw.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></svg><div>${texto}${acciones}</div>`;
  }else if(rw){rw.style.display='none';rw.innerHTML='';}

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
      // Quien corrigió la pauta oficial ya hizo el trabajo: sabe cuál es la
      // buena. A esa persona no se le pregunta si algo no calza —ya no calzó—,
      // se le pide el dato. El resto sigue viendo la pregunta de siempre.
      const txt=document.getElementById('ramo-report-text');
      if(txt)txt.textContent=pautaEditada(r)
        ?'Corregiste esta pauta · compártela con tu curso'
        :'¿Esta pauta no calza con tu curso? Repórtala';
    }else{rep.style.display='none';rep.onclick=null;}
  }

  const cl=document.getElementById('cat-list');cl.innerHTML='';
  const delCatalogo=pautaCatalogoSinOficial(r);
  const addCatBtn=document.querySelector('.add-cat-btn');
  if(addCatBtn){
    const armar=r.categorias.length===0&&delCatalogo;
    addCatBtn.textContent=armar?'Armar mi pauta':'Agregar evaluaciones';
    addCatBtn.setAttribute('aria-label',armar?'Armar mi pauta con nombres y porcentajes':'Agregar evaluaciones');
  }
  if(r.categorias.length===0){
    // Un ramo del catálogo sin pauta oficial NO es lo mismo que uno que el
    // estudiante creó a mano. En el primero la app le prometió el ramo y le
    // quedó debiendo las evaluaciones, y decírselo es más honesto que un
    // "Sin evaluaciones" que parece que él no hizo algo.
    const titulo=delCatalogo?'Todavía no tenemos la pauta de este ramo':'Sin evaluaciones';
    const sub=delCatalogo
      ? 'La puedes armar con tu programa: agrega evaluaciones y porcentajes. El promedio funciona igual y, si quieres, después puedes compartirla con otros estudiantes.'
      : 'Agrega tus pruebas, controles o tareas con su porcentaje del ramo. Puedes incluir la fecha para que aparezcan en la Agenda.';
    cl.innerHTML=`<div class="empty" style="padding:32px 20px;">
      <div class="empty-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div>
      <div class="empty-title">${titulo}</div>
      <div class="empty-sub">${sub}</div>
    </div>`;
  }
  r.categorias.forEach(cat=>{
    const fechaChip=cat.fecha?`<span class="cat-fecha-chip">${esc(fechaHoraCorta(cat.fecha,cat.hora))}</span>`:'';
    const exenta=categoriaEximida(r,cat);
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
              <div class="eval-row-weight">${r2(cat.peso)}% · promedio de ${cat.slots}${notasCount?` · ${notasCount}/${cat.slots} ingresadas`:''}${fechaChip?' · '+fechaChip:''}${exenta?' · exento/a':''}</div>
            </div>
            <div class="ramo-nota ${colorClass(av)}" style="--grade-color:${getColor(av)};min-width:auto;font-size:1.1875rem;">${fmt(av)}</div>
            <span aria-hidden="true" style="color:var(--fg3);font-size:0.6875rem;margin-left:6px;">${isOpen?'▲':'▼'}</span>
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
          <div class="eval-row-weight">${r2(cat.peso)}% de la nota final${fechaChip?' · '+fechaChip:''}${exenta?' · exento/a':''}</div>
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
      `<p style="font-size:0.8125rem;color:var(--fg3);text-align:center;padding:10px 0;">Sin notas aún</p>`:
      cat.notas.map(n=>{
        const descartada=notasDescartadas.has(n.id);
        return `
        <div class="nota-row${descartada?' nota-row-dropped':''}">
          <button class="nota-row-name" aria-label="Editar nota ${esc(n.nombre)}" onclick="openEditNotaModal('${cat.id}','${n.id}');event.stopPropagation();" style="background:none;border:none;cursor:pointer;text-align:left;padding:0;font-family:inherit;font-size:0.875rem;color:var(--fg2);flex:1;">${esc(n.nombre)}</button>
          ${n.peso!==1?`<span class="nota-row-pond">${n.peso}%</span>`:''}
          ${descartada?'<span class="nota-row-drop-tag">No cuenta</span>':''}
          ${n.fecha?`<span class="cat-fecha-chip">${esc(fechaCorta(n.fecha))}</span>`:''}
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
        <span style="font-size:1rem;font-weight:700;color:${getColor(catAvg)}">${fmt(catAvg)}</span>
        <button aria-label="Eliminar evaluación ${esc(cat.nombre)}" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;min-width:44px;min-height:44px;background:var(--red-bg);border:none;border-radius:8px;padding:0;cursor:pointer;color:var(--red);font-size:0.8125rem;" onclick="confirmDeleteCat('${cat.id}');event.stopPropagation();"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
        <button aria-label="${isOpen?'Colapsar':'Expandir'} ${esc(cat.nombre)}" aria-expanded="${isOpen?'true':'false'}" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;min-width:44px;min-height:44px;background:var(--muted);border:none;border-radius:8px;padding:0;cursor:pointer;color:var(--fg2);font-size:0.6875rem;" onclick="toggleCat('${cat.id}');event.stopPropagation();">${isOpen?'▲':'▼'}</button>
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
function renderStats(){
  const body=document.getElementById('stats-body');const g=gpa(S.ramos);
  const heroTitle=document.getElementById('stats-hero-title');
  let totalNotas=0,ramosAprobados=0,ramosEnRiesgo=0,ramosReprobados=0;
  S.ramos.forEach(r=>{
    const avg=ramoAvg(r);
    if(avg!==null){
      const v=r2(avg);
      if(v>=5.0)ramosAprobados++;
      else if(v>=4.0)ramosEnRiesgo++;
      else ramosReprobados++;
    }
    r.categorias.forEach(cat=>{cat.notas.forEach(n=>{
      if(n.valor!==null)totalNotas++;
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
    // El porcentaje lo dice el número grande y NADIE más. Estaba tres veces en
    // la misma tarjeta —la píldora del encabezado, el número grande y otra vez
    // al final del detalle—, así que el ojo lo leía como tres datos distintos
    // que casualmente coincidían.
    //
    // Y el del detalle además estaba mal: `avance.evaluado` es la SUMA de los
    // pesos ya evaluados de todos los ramos, no un porcentaje. Con diez ramos
    // el total ronda los 1000, así que "21% del peso evaluado" era en realidad
    // un 2%. El porcentaje es `avance.pct` y ya está arriba.
    const lectura=diff===null
      ? `Todavía no tienes un semestre archivado con el que compararte.`
      : Math.abs(diff)<0.05?`Vas igual que en ${previo.label||'el semestre anterior'}.`:`Vas ${nf(Math.abs(diff),2)} puntos ${tendencia} ${previo.label||'el semestre anterior'}.`;
    const detalle=diff===null
      ? `${totalNotas} nota${totalNotas!==1?'s':''} ingresada${totalNotas!==1?'s':''}`
      : `Promedio actual ${nf(g)} · antes ${nf(previo.gpa)}`;
    html+=`
    <div class="section-hd" style="padding:6px 20px 8px;">
      <span class="section-hd-title">Lectura del semestre</span>
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
    ${(()=>{
      // Mejor y peor nota del semestre estaban acá. Se ven bien y no deciden
      // nada: saber que tu mejor nota fue un 6,8 en octubre no cambia qué haces
      // mañana. Lo que sigue son las dos preguntas que el estudiante sí tiene.
      const proy=proyeccionSemestre(S.ramos);
      const falta=loQueFaltaPorRamo(S.ramos);
      let out='';
      if(proy){
        out+=`
        <div class="section-hd" style="padding:0 20px 8px;">
          <span class="section-hd-title">Hasta dónde puedes llegar</span>
        </div>
        <div class="stat-card" style="margin:0 20px 16px;">
          <div class="stat-label">Tu promedio final va a caer acá</div>
          <div class="stat-val" style="margin-top:4px;">
            <span style="color:${getColor(proy.piso)}">${nf(proy.piso)}</span>
            <span style="color:var(--fg3);font-weight:600;"> a </span>
            <span style="color:${getColor(proy.techo)}">${nf(proy.techo)}</span>
          </div>
          <div class="stat-sub" style="margin-top:6px;">El piso es sacar 1,0 en todo lo que te queda; el techo, 7,0 en todo. Incluye las reglas de tus ramos que topan la nota.</div>
        </div>`;
      }
      if(falta.length){
        const fila=x=>{
          // Sobre 7,0 el ramo ya no se salva sólo con lo pendiente. Decirlo así
          // es más honesto que mostrar un 7,4 que nadie puede sacar.
          const imposible=x.necesita>7.05;
          const valor=imposible?'—':fmt(Math.max(1,x.necesita));
          // NO se tiñe con el semáforo, y no es un descuido. El semáforo dice
          // aprobado / al borde / reprobado, y esto no es una nota obtenida sino
          // una exigencia: pintarlo con la misma escala deja "necesitas 5,1" en
          // verde y "necesitas 3,7" en naranjo, o sea el color diciendo lo
          // contrario de lo que significa. El orden ya comunica la urgencia —el
          // más exigente arriba— y el rojo queda para lo único que sí es una
          // mala noticia: que ya no alcance.
          const color=imposible?'var(--red)':'var(--fg)';
          const sub=imposible
            ? 'Ya no alcanza sólo con lo pendiente'
            : x.abierto
              ? `Vas ${fmt(x.avg)} · puede bajar según cuántos controles te tomen`
              : `Vas ${fmt(x.avg)} en lo evaluado`;
          return `<button class="ag-row" onclick="openRamo('${esc(x.ramo.id)}')">
            <span class="ag-row-bar" style="background:${esc(x.ramo.color)}"></span>
            <div class="ag-row-main">
              <div class="ag-row-name">${esc(x.ramo.nombre)}</div>
              <div class="ag-row-sub">${sub}</div>
            </div>
            <span class="ramo-nota" style="--grade-color:${color};color:${color};min-width:auto;">${valor}</span>
          </button>`;
        };
        out+=`
        <div class="section-hd" style="padding:0 20px 8px;">
          <span class="section-hd-title">Qué necesitas para aprobar</span>
        </div>
        <div style="padding:0 20px;">
          <p style="font-size:0.8125rem;color:var(--fg2);line-height:1.45;margin:0 0 10px;">Promedio que tienes que sacar en lo que te queda de cada ramo. El más exigente va primero.</p>
          ${falta.map(fila).join('')}
        </div>`;
      }
      return out;
    })()}
    </div>`;
  }

  // Historial de semestres
  if(S.historial && S.historial.length>0){
    const validos=S.historial.filter(h=>h&&Array.isArray(h.ramos));
    if(validos.length>0){
      html+=`<div class="section-hd stats-history-heading" style="padding:0 20px 8px;"><span class="section-hd-title">Historial</span></div>`;
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
                <div style="font-size:0.96875rem;font-weight:700;color:var(--fg);letter-spacing:-.01em;">${esc(h.label)}</div>
                <div style="font-size:0.75rem;color:var(--fg3);margin-top:3px;">Sem. ${h.careerSemestre} · ${h.ramos.length} ramos</div>
              </div>
              <span class="hist-gpa" style="color:${gpaColor}">${h.gpa!==null?nf(h.gpa):'—'}</span>
              <span style="color:var(--fg3);font-size:0.6875rem;">${isOpen?'▲':'▼'}</span>
            </div>
            <div class="hist-body${isOpen?' open':''}">
              ${ramosRows||'<p style="font-size:0.8125rem;color:var(--fg3);">Sin ramos</p>'}
            </div>
          </div>`;
      });
    }
  }

  body.innerHTML=html;
}
