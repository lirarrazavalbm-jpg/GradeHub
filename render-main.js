// Render de las vistas principales. Carga después de app.js: usa sus datos y helpers globales.

// Las recorrecciones pendientes, arriba de los ramos.
//
// Vivían solo en la Agenda y en la ficha del ramo, o sea había que ir a
// buscarlas. Una recorrección con plazo es lo contrario: si te enteras cuando
// abres el ramo, ya puede ser tarde.
//
// El rojo de acá NO es el del semáforo. No dice nada sobre la nota —de hecho la
// nota ya está puesta— sino que se te acaba el plazo para reclamarla. Por eso
// usa `--red` como los errores y el "ya no alcanza" de la calculadora, y nunca
// las clases `good`/`warn`/`bad`, que sí significan aprobado, al borde y
// reprobado.
function renderRecorreccionesHome(){
  const caja=document.getElementById('home-recorrecciones');
  if(!caja)return;
  const items=typeof recorreccionesPendientes==='function'?recorreccionesPendientes():[];
  if(!items.length){caja.style.display='none';caja.innerHTML='';return;}
  const urgentes=items.filter(x=>x.dias!==null&&x.dias<=RECORRECCION_DIAS_URGENTE);
  const plazo=x=>{
    const derecho=textoPlazoRecorreccion(x.plazo);
    if(x.dias===null)return derecho;
    if(x.dias<0)return `${derecho} · venció hace ${Math.abs(x.dias)} ${Math.abs(x.dias)===1?'día':'días'}`;
    if(x.dias===0)return `${derecho} · vence hoy`;
    if(x.dias===1)return `${derecho} · queda 1 día`;
    return `${derecho} · quedan ${x.dias} días`;
  };
  caja.style.display='block';
  caja.className='home-recorrecciones'+(urgentes.length?' urgente':'');
  caja.innerHTML=`
    <div class="home-recorrecciones-hd">
      <span class="section-hd-title">Por mandar a recorregir</span>
      <span class="ag-count">${items.length}</span>
    </div>
    ${items.map(x=>`<article class="home-recorreccion-row${x.dias!==null&&x.dias<=RECORRECCION_DIAS_URGENTE?' urgente':''}" role="button" tabindex="0" onclick="openRamo('${esc(x.ramo.id)}')">
      <div>
        <strong>${esc(nombreNotaCasilla(x.ramo,x.cat,x.nota))}</strong>
        <span>${esc(x.ramo.nombre)} · ${esc(plazo(x))}</span>
      </div>
    </article>`).join('')}`;
}
function renderHome(){
  renderPropuestasPautaHome();
  renderRecorreccionesHome();
  renderWrappedHome();
  const g=gpa(S.ramos);
  const gpael=document.getElementById('home-gpa');
  const emptyHint=document.getElementById('gpa-empty-hint');
  const gpaSub=document.getElementById('home-gpa-sub');
  const gpaMethod=document.getElementById('home-gpa-method');
  const ramosHd=document.getElementById('ramos-hd');
  const tagsEl=document.getElementById('gpa-tags');
  const deltaEl=document.getElementById('gpa-delta');
  const first=(S.userName||'').split(' ')[0]||'';
  document.getElementById('home-greeting').innerHTML=`${fraseInicio()}${first?', <span class="greet-name">'+esc(first)+'</span>':''}`;
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
    // Las insight cards se pintan más abajo; al salir acá quedaban las del
    // semestre recién archivado, apuntando a ramos que ya no existen.
    const ins=document.getElementById('home-insights');
    if(ins){ins.innerHTML='';ins.style.display='none';}
    ramosHd.style.display='none';document.getElementById('home-ramos').innerHTML='';return;
  }
  emptyHint.style.display='none';gpaSub.style.display='block';ramosHd.style.display='flex';
  // El simulador global tiene sentido con 2+ ramos (con 1 es igual al del ramo)
  if(simGlobalBtn)simGlobalBtn.style.display=S.ramos.length>=2?'flex':'none';

  if(g!==null){
    // La nota oficial, su color y la distancia al siguiente nivel parten del
    // mismo redondeo a una décima. El decimal va atenuado con el mismo gradient.
    const rounded=fmtPromedio(g);
    const sep=rounded.indexOf('.');
    const entera=rounded.slice(0,sep);
    const decimal=rounded.slice(sep);
    gpael.innerHTML=`${entera}<span class="gpa-decimal">${decimal}</span>`;
    gpael.className='gpa-num '+colorClass(g)+claseNotaEspecial(g);
    gpael.style.setProperty('--grade-color',getColor(g));
    gpael.onclick=()=>{
      const oficial=notaFinalOficial(g);
      const umbrales=[4.0,5.0,6.0,7.0];
      const next=umbrales.find(u=>u>oficial+0.001);
      let msg=`Promedio redondeado: ${fmtPromedio(g)}`;
      if(next!==undefined){
        msg+=`  ·  ${nf(Math.max(0,next-0.05-g),2)} para redondear a ${nf(next)}`;
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
  const periodoActual=semester();
  const detalleActual=`${S.ramos.length} ${S.ramos.length===1?'ramo':'ramos'}`
    +(modo==='creditos'?` · ${cr} créditos`:'');
  // El costado derecho del promedio estaba vacío. Llevar aquí el contexto que
  // ya aparecía debajo equilibra el bloque sin inventar otra estadística.
  gpaSub.innerHTML=`<strong>${esc(periodoActual)}</strong><span>${detalleActual}</span>`;
  gpaSub.style.display=S.ramos.length?'flex':'none';
  const detalleMetodo=descripcionMetodoGpa(S.ramos);
  if(detalleMetodo){
    gpaMethod.textContent=detalleMetodo.texto;
    gpaMethod.style.display='block';
  }else if(g===null){
    gpaMethod.textContent='Abre un ramo para ingresar tu primera nota.';
    gpaMethod.style.display='block';
  }else gpaMethod.style.display='none';

  // Chips de estado — contexto exclusivo del promedio general
  if(tagsEl){
    let good=0,warn=0,bad=0,pend=0;
    S.ramos.forEach(r=>{const a=ramoAvg(r),nivel=a===null?'neutral':nivelRamo(r,a);if(nivel==='neutral')pend++;else if(nivel==='good')good++;else if(nivel==='warn')warn++;else bad++;});
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
      deltaEl.innerHTML=`<strong>${arrow} ${nf(abs,2)}</strong><span>vs. ${esc(last.label||'semestre anterior')}</span>`;
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
        <div class="insight-card" role="button" tabindex="0" style="--insight-color:${esc(ne.ramo.color)}" onclick="openRamo('${esc(ne.ramo.id)}')">
          <div class="insight-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/></svg></div>
          <div class="insight-body">
            <div class="insight-label">Próxima evaluación</div>
            <div class="insight-title">${esc(ne.nombre)} · ${esc(ne.ramo.nombre)}</div>
            <div class="insight-meta"><span class="strong">${daysLabel}</span></div>
          </div>
          <span class="chevron-r">›</span>
        </div>`);
    }
    const risky=mostRiskyRamo();
    if(risky){
      // El caso sin salida no se pinta como una advertencia más: si ya no se
      // puede aprobar con lo que queda, la etiqueta y el color tienen que
      // decirlo, no pedir una nota que no existe en la escala.
      const warnColor=(risky.imposible||!notaAprobadaRamo(risky.ramo,risky.avg))?'#ff7a8f':'#ffcf5c';
      cards.push(`
        <div class="insight-card" role="button" tabindex="0" style="--insight-color:${warnColor}" onclick="openRamo('${esc(risky.ramo.id)}')">
          <div class="insight-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".8" fill="currentColor"/></svg></div>
          <div class="insight-body">
            <div class="insight-label">${risky.imposible?'Ya no alcanza':'Ramo en riesgo'}</div>
            <div class="insight-title">${esc(risky.ramo.nombre)}</div>
            <div class="insight-meta">${risky.imposible
              ?'Con lo que queda por rendir ya no se llega a 4,0'
              :`Necesitas <span class="strong">${nfNecesaria(risky.needed)}</span> promedio en lo pendiente para aprobar`}</div>
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
          <div class="insight-card" role="button" tabindex="0" style="--insight-color:${noteColor}" onclick="openRamo('${esc(lg.ramo.id)}')">
            <div class="insight-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
            <div class="insight-body">
              <div class="insight-label">Última nota</div>
              <div class="insight-title">${esc(lg.cat.nombre)} · ${esc(lg.ramo.nombre)}</div>
              <div class="insight-meta"><span class="strong">${textoCalificacionNota(lg.nota)}</span></div>
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
      const pctLabel=completo?'100%':`${prog.pct}% evaluado`;
      metaHtml=`<span class="ramo-meta-text${completo?' is-complete':''}">${pctLabel}</span>`;
    }
    const sig=siglaDeRamo(r);
    const div=document.createElement('div');div.className='ramo-row';div.dataset.ramoId=r.id;div.onclick=()=>openRamo(r.id);
    div.dataset.progress=String(prog.pct);
    div.style.setProperty('--ramo-progress-scale',String(prog.pct/100));
    if(nn>0){
      div.classList.add('has-progress');
      if(completo)div.classList.add('is-complete');
      if(recienCerrado)div.classList.add('just-completed');
    }
    if(S.sortMode==='manual')div.dataset.reorderable='true';
    div.style.setProperty('--ramo-tint',r.color);
    const control=S.sortMode==='manual'
      ? `<button type="button" class="ramo-drag-handle" aria-label="Mantén presionado para mover ${esc(r.nombre)}" title="Mantén presionado para mover">
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="18" r="1" fill="currentColor" stroke="none"/></svg>
        </button>`
      : '<span class="chevron-r">›</span>';
    div.innerHTML=`
      <div class="ramo-band" aria-hidden="true" style="background:${esc(r.color)}"></div>
      <div class="ramo-info"><button type="button" class="ramo-name">${esc(r.nombre)}</button><div class="ramo-meta">${sig?`<span class="ramo-sigla">${esc(sig)}</span>`:''}${metaHtml}</div></div>
      <div class="ramo-grade-action"><div class="ramo-nota ${colorClassRamo(r,avg)}" style="--grade-color:${getColorRamo(r,avg)}">${fmtPromedio(avg)}</div>${control}</div>
      ${nc>0?'<span class="ramo-progress-track" aria-hidden="true"><span class="ramo-progress-fill"></span></span>':''}`;
    c.appendChild(div);
  });
  if(S.sortMode==='manual')activarReordenRamos(c);
  // Publicidad de clases junto al ramo que calza. Vive en marketplace.js y
  // decide en el navegador; si no hay nada que mostrar, no pinta nada.
  if(typeof pintarRecomendacionClase==='function')pintarRecomendacionClase(c);
}
// Si las reglas del programa están desplegadas es una preferencia de lectura de
// esta sesión, igual que el orden de la Agenda: no entra a S ni a gradehub_v1.
// Plegar un texto no justifica migrar el estado guardado de nadie.
const reglasRamoAbiertas={};
function toggleReglasRamo(id){
  reglasRamoAbiertas[id]=!reglasRamoAbiertas[id];
  renderRamo();
}
function renderRamo(){
  const r=S.ramos.find(x=>x.id===currentRamoId);if(!r){goHome();return;}
  document.getElementById('grade-gpa-echo')?.remove();
  document.getElementById('ramo-title').textContent=r.nombre;
  const avg=ramoAvg(r);
  const calculo=calculoRamoConCompuertas(r);
  const recuperativo=estadoRecuperativo(r,calculo);
  const eximicion=estadoEximicion(r);
  const descartes=calculo.res.drops||[];
  const avgEl=document.getElementById('ramo-hero-avg');
  if(avg!==null){
    const s=fmtPromedio(avg);const dot=s.indexOf('.');
    avgEl.innerHTML=`${s.slice(0,dot)}<span class="ramo-decimal">${s.slice(dot)}</span>`;
    avgEl.className='ramo-num '+colorClassRamo(r,avg)+claseNotaEspecial(avg);
    avgEl.style.setProperty('--grade-color',getColorRamo(r,avg));
  } else {
    avgEl.textContent='Sin notas';avgEl.className='ramo-num empty';
  }
  const tp=r.categorias.reduce((a,c)=>a+c.peso,0);
  const categoriasVisibles=r.categorias.filter(c=>!(eximicion&&eximicion.activa&&eximicion.regla.ocultaEvaluacion===true&&eximicion.examenId===c.id));
  const crTxt=(r.seccion?` · Sección ${r.seccion}`:'')+(r.creditos?` · ${r.creditos} créditos`:'');
  document.getElementById('ramo-hero-sub').textContent=categoriasVisibles.length===0
    ?('Agrega evaluaciones para comenzar'+crTxt)
    :`${categoriasVisibles.length} ${categoriasVisibles.length===1?'evaluación':'evaluaciones'} · ${r2(tp)}% ponderado${crTxt}`;
  const periodoEl=document.getElementById('pauta-periodo');
  if(periodoEl){
    const info=infoPeriodoPauta(r);
    if(!info){periodoEl.style.display='none';periodoEl.innerHTML='';}
    else{
      const etiqueta=info.periodo?`Pauta del ${esc(info.periodo)}`:'Con pauta · período sin confirmar';
      const nota=info.estadoPeriodo==='vencido'?' · fechas no incluidas':'';
      periodoEl.className='pauta-periodo'+(info.estadoPeriodo==='vencido'?' is-vencida':'');
      periodoEl.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z"/></svg><span>${etiqueta}${nota}</span>`;
      periodoEl.style.display='inline-flex';
    }
  }

  // Notas que un agente propuso para ESTE ramo. Van acá y no en una bandeja
  // aparte porque la decisión se toma mirando el ramo: qué evaluación es, qué
  // nota tiene ahora y de dónde dice el agente que salió la nueva.
  const propEl=document.getElementById('notas-propuestas');
  if(propEl){
    const pendientes=typeof propuestasNotasDeRamo==='function'?propuestasNotasDeRamo(r):[];
    const pendientesFechas=typeof propuestasFechasDeRamo==='function'?propuestasFechasDeRamo(r):[];
    if(!pendientes.length&&!pendientesFechas.length){propEl.style.display='none';propEl.innerHTML='';}
    else{
      propEl.style.display='block';
      propEl.innerHTML=pendientes.map(p=>{
        const filas=p.notas.map(n=>{
          const cat=(r.categorias||[]).find(c=>normName(c.nombre)===normName(n.evaluacion));
          const actual=cat?(cat.notas||[]).find(x=>typeof x.valor==='number'&&(n.casilla?x.slot===n.casilla:true)):null;
          // Se muestra la nota que ya está, si la hay: aceptar una propuesta
          // que PISA un 6,2 con un 4,0 es una decisión distinta de anotar una
          // casilla vacía, y no se puede tomar sin ver las dos.
          return `<div class="prop-fila"><span class="prop-eval">${esc(n.evaluacion)}${n.casilla?` · casilla ${n.casilla}`:''}</span>`+
            `<span class="prop-valor">${actual?`<s>${nf(actual.valor)}</s> → `:''}${nf(n.valor)}</span></div>`;
        }).join('');
        return `<div class="prop-notas-card">
          <div class="prop-notas-head"><b>Un agente propone ${p.notas.length} nota${p.notas.length!==1?'s':''}</b><span>Nada se aplicó todavía.</span></div>
          <div class="prop-notas-lista">${filas}</div>
          <div class="prop-notas-fuente">Según el agente: ${esc(p.fuente)}</div>
          <div class="prop-notas-btns">
            <button type="button" class="ramo-action primary" onclick="aplicarPropuestaNotas('${esc(p.id)}')">Aceptar</button>
            <button type="button" class="ramo-action" onclick="abrirEditarPropuestaNotas('${esc(p.id)}')">Editar</button>
            <button type="button" class="ramo-action" onclick="confirmarDescartarPropuestaNotas('${esc(p.id)}')">Rechazar</button>
          </div>
        </div>`;
      }).join('')+pendientesFechas.map(p=>{
        const filas=p.fechas.map(f=>{
          const cat=(r.categorias||[]).find(c=>normName(c.nombre)===normName(f.evaluacion));
          const actual=f.casilla
            ? (cat&&(cat.notas||[]).find(x=>x.slot===f.casilla)||null)
            : cat;
          // La fecha que ya está, si la hay. Mover una prueba que ya estaba
          // agendada es otra decisión que ponerle fecha a una que no tenía.
          const antes=actual&&actual.fecha?formatEventDate({fecha:actual.fecha,hora:actual.hora||null}):'';
          const nueva=formatEventDate({fecha:f.fecha,hora:f.hora||null});
          return `<div class="prop-fila"><span class="prop-eval">${esc(f.evaluacion)}${f.casilla?` · casilla ${f.casilla}`:''}</span>`+
            `<span class="prop-valor">${antes?`<s>${esc(antes)}</s> → `:''}${esc(nueva)}</span></div>`;
        }).join('');
        return `<div class="prop-notas-card">
          <div class="prop-notas-head"><b>Un agente propone ${p.fechas.length} fecha${p.fechas.length!==1?'s':''}</b><span>Nada se aplicó todavía.</span></div>
          <div class="prop-notas-lista">${filas}</div>
          <div class="prop-notas-fuente">Según el agente: ${esc(p.fuente)}</div>
          <div class="prop-notas-btns">
            <button type="button" class="ramo-action primary" onclick="aplicarPropuestaFechas('${esc(p.id)}')">Aceptar</button>
            <button type="button" class="ramo-action" onclick="abrirEditarPropuestaFechas('${esc(p.id)}')">Editar</button>
            <button type="button" class="ramo-action" onclick="confirmarDescartarPropuestaFechas('${esc(p.id)}')">Rechazar</button>
          </div>
        </div>`;
      }).join('');
    }
  }

  // Chip nota mínima para el 4.0
  const chipEl=document.getElementById('ramo-min-chip');
  if(r.categorias.length>0){
    const categoriasActivas=resumenCategoriasCalculadas(r,calculo);
    const totalPeso=categoriasActivas.reduce((a,c)=>a+c.peso,0);
    // ¿Hay un piso de nota activo? (sección calificada bajo su mínimo → topa la final)
    const gateHit=gatesActivas(r)[0]||null;
    // Cuánto falta por rendir, contando CASILLAS y no categorías.
    //
    // Antes salía de `pesoSinNotas`, que da una categoría por cerrada apenas
    // tiene una nota. En Laboratorio de Dinámica —Controles 10% en 5 casillas,
    // Informes 70% en 6, Evaluación de pares 20% en 6— con UN control y UN
    // informe puestos contaba el 80% como rendido y anunciaba "falta 20%",
    // cuando iban 2 de 17 evaluaciones.
    //
    // `emptyLeaves` son las hojas sin nota, con su peso efectivo ya repartido
    // entre las casillas de su categoría, y suman 1 sobre el ramo entero.
    const pendientes=(calculo.res&&calculo.res.emptyLeaves)||[];
    const pesoPendiente=pendientes.reduce((s,l)=>s+(Number(l.effectiveWeight)||0),0);
    const pctPendiente=Math.round(pesoPendiente*100);
    if(eximicion&&eximicion.activa){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip';
      chipEl.textContent=`Te eximiste del ${eximicion.regla.evaluacion}`;
    } else if(gateHit){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip bad';
      chipEl.textContent=gateHit.grupo
        ? `${gateHit.nombre} va ${fmtPromedio(gateHit.actual)} (mín. ${nf(gateHit.min)}): topa tu nota final`
        : `${gateHit.nombre} bajo ${nf(gateHit.min)}: repruebas pese al promedio`;
    } else if(recuperativo&&recuperativo.motivo==='pendiente'){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip warn';chipEl.textContent='Puedes rendir examen recuperativo';
    } else if(ramoCompletamenteEvaluado(r) && notaAprobadaRamo(r,avg)){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip good';chipEl.textContent='✓ Aprobado';
    } else if(ramoCompletamenteEvaluado(r)){
      chipEl.style.display='inline-flex';
      chipEl.className='ramo-chip bad';chipEl.textContent='✕ Reprobado';
    } else if(totalPeso>0){
      // La cuenta sale de `notaNecesaria`, no de una fórmula escrita acá.
      //
      // Acá vivía la última copia a mano —`(4*totalPeso - sumaPonderada) /
      // pesoSinNotas`— y se equivocaba de dos formas a la vez. Repartía por
      // categoría entera, así que "Controles" con 4 casillas y 2 notas contaba
      // como cerrada: `pesoSinNotas` daba 0 y la ficha decía "✕ Reprobado" a
      // alguien que todavía aprobaba con 4,65. Y apuntaba al 4,00 bruto en vez
      // del 3,95 que redondea a 4,0 (#447), así que pedía una décima de más que
      // Estadísticas para el mismo ramo.
      //
      // `notaNecesaria` sabe de casillas declaradas, descartes, compuertas y
      // del ramo vinculado. Es la misma que usan Estadísticas y la calculadora:
      // que el número salga de un solo lugar es la única forma de que no haya
      // dos respuestas a la misma pregunta.
      const needed=notaNecesaria(r);
      if(needed===null){
        chipEl.style.display='none';
      } else if(avg!==null && needed<=1.0){
        // Ya no puede reprobar con lo pendiente → aprobación asegurada
        chipEl.style.display='inline-flex';
        chipEl.className='ramo-chip good';chipEl.textContent=`Va aprobando · falta ${pctPendiente}%`;
      } else if(needed>7){
        chipEl.style.display='inline-flex';
        chipEl.className='ramo-chip bad';chipEl.textContent='Ya no es posible aprobar';
      } else {
        chipEl.style.display='inline-flex';
        chipEl.className='ramo-chip warn';chipEl.textContent=`Necesitas ${nfNecesaria(needed)} en lo pendiente para aprobar`;
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
      pcw.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></svg><div><b>La pauta de este ramo cambió.</b><br>${cuantos} ${cuantos===1?'evaluación distinta':'evaluaciones distintas'} a lo que tienes hoy. Tu promedio se calcula con lo que tienes ahora.<div style="margin-top:8px;"><button type="button" class="rep-link" style="width:auto;padding:7px 12px;margin:0;" onclick="verCambioDePauta('${esc(r.id)}')">Ver qué cambia</button></div></div>`;
    }else if(r.consensoRespaldos){
      // Esta pauta la reportaron estudiantes, no sale de un programa oficial.
      // Decirlo es la diferencia entre una pauta y una ponderación inventada.
      pcw.style.display='flex';pcw.className='weight-setup-nudge';
      pcw.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></svg><div><b>Pauta reportada por estudiantes.</b><br>La enviaron ${r.consensoRespaldos} personas de tu universidad y coincidieron. No la sacamos del programa del curso: compárala con la tuya y corrígela si no calza.</div>`;
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
    // El texto completo ocupaba media pantalla en cada carga de la ficha, todo
    // el rato, aunque el estudiante ya lo hubiera leído. Va plegado.
    //
    // Pero plegado tiene que seguir DICIENDO que existe: esto explica por qué
    // su promedio puede no calzar con el del profesor, y esconderlo del todo
    // sería peor que ocuparle espacio. Por eso el resumen lleva la cuenta.
    const total=noCalcula.length+delCurso.length;
    const resumen=`${total} regla${total!==1?'s':''} del programa que el promedio no incluye`;
    const abierto=reglasRamoAbiertas[r.id]===true;
    ncw.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></svg><div>
      <button type="button" class="reglas-toggle" aria-expanded="${abierto?'true':'false'}" onclick="toggleReglasRamo('${esc(r.id)}')">
        <span>${resumen}</span>
        <span class="reglas-chevron" aria-hidden="true">${abierto?'▲':'▼'}</span>
      </button>
      <div class="reglas-cuerpo${abierto?' open':''}">${bloques.join('<div style="height:10px;"></div>')}<span style="display:block;margin-top:6px;">Compáralo con la pauta del curso.</span></div>
    </div>`;
  }else{ncw.style.display='none';ncw.innerHTML='';}

  // Cada pauta pide algo que la app no puede comprobar —Biocel, asistencia de
  // Taller; Matemáticas Avanzadas II UAI, haber rendido todo— y lo declara en
  // `confirmar`. Antes el texto de Biocel estaba fijo acá y se le mostraba a
  // cualquier ramo. Llegar al promedio solo habilita la confirmación: nunca
  // afirma la eximición sola.
  const ew=document.getElementById('eximicion-warning');
  if(ew&&eximicion&&eximicion.regla.requiereConfirmacion===true){
    let texto='',accion='';
    if(eximicion.puedeConfirmar){
      texto=`<b>Por tus notas, puedes eximirte del ${esc(eximicion.regla.evaluacion)}.</b><br>Confirma que ingresaste todas tus notas previas al examen${eximicion.regla.confirmar?` y que ${esc(eximicion.regla.confirmar)}`:''}.`;
      accion='<button type="button" onclick="confirmarEximicionActual()">Confirmar eximición</button>';
    }else if(eximicion.activa){
      texto=`<b>Te eximiste del ${esc(eximicion.regla.evaluacion)}.</b><br>Ya no aparece entre tus evaluaciones pendientes y tu nota de presentación queda como nota final.`;
      accion='<button type="button" onclick="corregirEximicionActual()">Corregir confirmación</button>';
    }else if(eximicion.confirmada){
      const causa=eximicion.razon==='incompleto'
        ? 'Todavía faltan notas previas al examen.'
        : eximicion.razon==='minimo_categoria'
          ? `Ya no se cumple el mínimo de ${nf(eximicion.minimoFallido.min)} en ${esc(eximicion.minimoFallido.evaluacion)}.`
          : eximicion.razon==='examen_rendido'
            ? `El ${esc(eximicion.regla.evaluacion)} tiene una nota ingresada y vuelve a formar parte del cálculo.`
            : `Tu nota de presentación quedó bajo ${nf(eximicion.regla.min)}.`;
      texto=`<b>Tu confirmación se conserva, pero ya no se aplica.</b><br>${causa} Si vuelves a cumplir las condiciones, la eximición se activa sola.`;
      accion='<button type="button" onclick="corregirEximicionActual()">Corregir confirmación</button>';
    }
    if(texto){
      ew.style.display='flex';ew.className='weight-setup-nudge eximicion-note';
      ew.innerHTML=`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/></svg><div>${texto}<div style="margin-top:8px;">${accion}</div></div>`;
    }else{ew.style.display='none';ew.innerHTML='';}
  }else if(ew){ew.style.display='none';ew.innerHTML='';}

  // Contador de faltas: solo si el estudiante lo encendió en Editar ramo. Es
  // su registro, no una regla del programa, así que no toca el promedio.
  const fw=document.getElementById('faltas-contador');
  if(fw){
    if(!faltasActivas(r)){fw.style.display='none';fw.innerHTML='';}
    else{
      const {cantidad,limite}=r.faltas;
      const quedan=limite!=null?limite-cantidad:null;
      const detalle=limite==null?'Anota cada clase a la que no fuiste.'
        :quedan>1?`Te quedan ${quedan} de ${limite}.`
        :quedan===1?`Te queda 1 de ${limite}.`
        :quedan===0?`Llegaste al máximo de ${limite}.`
        :`Pasaste el máximo de ${limite} por ${-quedan}.`;
      fw.style.display='flex';
      fw.className='faltas-card'+(quedan!==null&&quedan<0?' is-excedido':quedan===0?' is-limite':'');
      fw.innerHTML=`<div class="faltas-txt"><span class="faltas-titulo">Faltas</span><span class="faltas-detalle">${detalle}</span></div>
        <div class="faltas-ctrl">
          <button type="button" class="faltas-btn" onclick="cambiarFaltas(-1)" aria-label="Restar una falta" ${cantidad===0?'disabled':''}><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
          <span class="faltas-num" aria-live="polite">${cantidad}</span>
          <button type="button" class="faltas-btn" onclick="cambiarFaltas(1)" aria-label="Sumar una falta" ${cantidad>=FALTAS_MAX?'disabled':''}><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>
        </div>`;
    }
  }

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
  // Va sin await: es una lectura de red y la ficha ya está pintada.
  pintarConsensoDisponible(r);

  const rep=document.getElementById('ramo-report');
  if(rep){
    // Reportar catálogo corrige una pauta oficial. Las pautas que la persona
    // armó por su cuenta ya se aportan al consenso al quedar completas.
    const oficial=r.origen&&r.origen.tenant&&presetRamo(r.nombre,r.origen.tenant,r.origen.carrera);
    if(r.categorias.length&&oficial){
      rep.style.display='flex';
      rep.onclick=()=>openReportModal(r.id);
      // Este formulario sirve para avisar una corrección de la oficial y
      // agregar contexto; la pauta propia completa ya aporta por sí sola.
      const txt=document.getElementById('ramo-report-text');
      if(txt)txt.textContent=pautaEditada(r)
        ?'Corregiste la pauta oficial · agrega un reporte'
        :'¿La pauta oficial no calza con tu curso? Repórtala';
    }else{rep.style.display='none';rep.onclick=null;}
  }

  const cl=document.getElementById('cat-list');cl.innerHTML='';
  const delCatalogo=pautaCatalogoSinOficial(r);
  const addCatBtn=document.querySelector('.add-cat-btn');
  if(addCatBtn){
    const armar=r.categorias.length===0&&delCatalogo;
    addCatBtn.textContent=armar?'Armar mi pauta':'Editar evaluaciones';
    addCatBtn.setAttribute('aria-label',armar?'Armar mi pauta con nombres y porcentajes':'Editar evaluaciones');
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
    // `normalize()` repara lo que llega al abrir la app, pero una integración
    // futura puede escribir una categoría después. La ficha debe mostrar esa
    // evaluación vacía —no borrar visualmente toda la pauta— hasta que se
    // pueda corregir el dato.
    const notas=Array.isArray(cat.notas)?cat.notas:[];
    const ausencia=ausenciaDeEvaluacion(r,cat);
    const justificada=ausencia?.declarada&&!ausencia.inactiva;
    const detalleAusencia=ausencia?.declarada?`<button type="button" class="ausencia-estado" onclick="openDetalleAusenciaJustificada('${esc(cat.id)}');event.stopPropagation()"><strong>${ausencia.inactiva?'Declaración no aplicada':'Justificada'}</strong><span>${esc(ausencia.texto)}</span></button>`:'';
    const fechaChip=cat.fecha?`<span class="cat-fecha-chip">${esc(fechaHoraCorta(cat.fecha,cat.hora))}</span>`:'';
    const exenta=categoriaEximida(r,cat);
    // La categoría sigue guardada intacta. Solo se oculta mientras la
    // confirmación esté activa, para que corregirla la haga reaparecer.
    if(exenta&&eximicion&&eximicion.regla.ocultaEvaluacion===true)return;
    // Sección de preset: fila directa, solo escribir la nota (estilo simulador)
    if(cat.directNota){
      // Preset con varios espacios (ej: Laboratorio = 3 notas que se promedian) — COLAPSABLE
      if(cat.slots&&cat.slots>1){
        const av=avgPond(notas);
        // Vacío parte compacto, pero al guardar la primera nota (o dejar una
        // anotada para después) hay algo concreto que revisar. `openCats` solo
        // toma el control después de que la persona abrió o cerró a mano.
        const isOpen=openCats[cat.id]===undefined?notas.length>0:openCats[cat.id];
        const wrap=document.createElement('div');wrap.className='eval-group';
        if(av!=null)wrap.style.borderLeftColor=getColor(av);
        let rows='';
        // Se dibujan las casillas declaradas Y las que quedaron más allá.
        //
        // Al bajar las casillas de una categoría —de 3 controles a 2, por
        // ejemplo— la nota del tercero se quedaba guardada y SEGUÍA contando en
        // el promedio, pero dejaba de dibujarse: con 7,0 · 7,0 · 1,0 la ficha
        // mostraba dos sietes y un promedio de 5,0, sin nada que explicara la
        // diferencia. `normalize` tampoco la limpiaba al recargar.
        //
        // No se deja de contar, porque eso cambiaría el promedio de cuentas
        // reales sin que nadie lo pidiera, y es una nota que la persona escribió.
        // Se muestra, que es lo que hizo el #235 con las notas que salen de una
        // pauta oficial: quedan a la vista para que su dueño decida.
        const slotMax=notas.reduce((m,n)=>Number.isInteger(n.slot)?Math.max(m,n.slot):m,-1);
        const casillas=Math.max(cat.slots,slotMax+1);
        for(let i=0;!justificada&&i<casillas;i++){
          const sobra=i>=cat.slots;
          const nota=notas.find(n=>n.slot===i);const v=(nota&&nota.valor!=null)?nota.valor:null;
          const etiqueta=etiquetaCasilla(r,cat,i);
          // La fecha de la casilla, cuando la tiene. El botón abre el editor de
          // ESA casilla: hasta ahora el grupo solo dejaba escribir el número, y
          // la fecha solo existía para el grupo entero —"Controles" el mismo
          // día—, que no es como se rinden.
          // `formatEventDate` devuelve {day,mon,dow} para la Agenda, no un texto:
          // metido en la plantilla salía "[object Object]" bajo la casilla. El
          // formato corto de la ficha es el mismo que usa el chip del grupo.
          const fSub=nota&&nota.fecha?fechaHoraCorta(nota.fecha,nota.hora):'';
          const recorreccion=nota&&nota.recorreccionPendiente===true;
          const textoRecorreccion=recorreccion?textoPlazoRecorreccion(plazoRecorreccion(nota,cat,S.tenant)):'';
          rows+=`<div class="eval-sub${sobra?' eval-sub-sobra':''}">
            <button type="button" class="eval-sub-open" onclick="event.stopPropagation();abrirCasilla('${cat.id}',${i})" title="Fecha y detalle de ${esc(etiqueta)}" aria-label="Fecha y detalle de ${esc(etiqueta)}">
              <span class="eval-sub-name">${esc(etiqueta)}</span>
              ${sobra?'<span class="eval-sub-aviso">sobra en la pauta · sigue contando</span>':(fSub?`<span class="eval-sub-fecha">${esc(fSub)}</span>`:'<span class="eval-sub-fecha vacia">sin fecha</span>')}
              ${recorreccion?`<span class="recorreccion-chip">Falta mandar${textoRecorreccion!=='sin plazo calculable'?` · ${esc(textoRecorreccion)}`:''}</span>`:''}
            </button>
            <input class="eval-row-input sm" inputmode="${inputModeNota()}" autocapitalize="characters" maxlength="3" placeholder="—" value="${v!=null?textoCalificacionNota(nota):''}" style="color:${v!=null?getColor(v):'var(--fg)'}" onchange="setSlotNota('${cat.id}',${i},this.value)" onclick="event.stopPropagation();" aria-label="${esc(etiqueta)}"/>
          </div>`;
        }
        // Casillas con nota, no notas: un duplicado de la misma casilla no es
        // una evaluación más. normalize ya los limpia, pero el contador no
        // puede depender de que eso haya corrido.
        // Cuenta casillas CON NOTA. Antes contaba casillas registradas, y una
        // casilla creada solo para ponerle fecha —sin nota todavía— se sumaba
        // al "2/3 ingresadas" sin que hubiera ninguna nota nueva.
        const notasCount=new Set(notas.filter(n=>Number.isInteger(n.slot)&&n.valor!=null).map(n=>n.slot)).size
          || notas.filter(n=>n&&n.valor!=null).length;
        wrap.innerHTML=`
          <div class="eval-group-hd" role="button" tabindex="0" aria-expanded="${isOpen?'true':'false'}" onclick="toggleCat('${cat.id}')">
            <div style="flex:1;min-width:0;">
              <div class="eval-row-name">${esc(cat.nombre)}</div>
              <div class="eval-row-weight">${r2(cat.peso)}% · promedio de ${cat.slots}${notasCount?` · ${notasCount}/${cat.slots} ingresadas`:''}${fechaChip?' · '+fechaChip:''}${exenta?' · exento/a':''}</div>
            </div>
            <div class="ramo-nota ${justificada?'':colorClass(av)}" style="--grade-color:${getColor(av)};min-width:auto;font-size:${justificada?'.8125':'1.1875'}rem;">${justificada?'Justificada':fmtPromedio(av)}</div>
            <span aria-hidden="true" style="color:var(--fg3);font-size:0.6875rem;margin-left:6px;">${isOpen?'▲':'▼'}</span>
          </div>
          <div class="eval-group-body${isOpen||justificada?' open':''}">${justificada?detalleAusencia:rows+detalleAusencia}</div>`;
        cl.appendChild(wrap);
        return;
      }
      const g=notas[0]?notas[0].valor:null;
      const recorreccion=notas[0]&&notas[0].recorreccionPendiente===true;
      const textoRecorreccion=recorreccion?textoPlazoRecorreccion(plazoRecorreccion(notas[0],cat,S.tenant)):'';
      const row=document.createElement('div');row.className='eval-row';
      if(g!=null)row.style.borderLeftColor=getColor(g);
      row.innerHTML=`
        <div class="eval-row-info" role="button" tabindex="0" onclick="openEditCatModal('${cat.id}')" style="cursor:pointer;">
          <div class="eval-row-name">${esc(cat.nombre)}</div>
          <div class="eval-row-weight">${r2(cat.peso)}% de la nota final${fechaChip?' · '+fechaChip:''}${exenta?' · exento/a':''}${recorreccion?` <span class="recorreccion-chip">Falta mandar${textoRecorreccion!=='sin plazo calculable'?` · ${esc(textoRecorreccion)}`:''}</span>`:''}</div>
        </div>
        ${justificada?'':`<input class="eval-row-input" inputmode="${inputModeNota()}" autocapitalize="characters" maxlength="3" placeholder="—" value="${g!=null?textoCalificacionNota(notas[0]):''}" style="color:${g!=null?getColor(g):'var(--fg)'}" onchange="setDirectNota('${cat.id}',this.value)" onclick="event.stopPropagation();" aria-label="Nota de ${esc(cat.nombre)}"/>`}
        ${detalleAusencia}`;
      cl.appendChild(row);
      return;
    }
    const descarte=descartes.find(d=>d.nodeId===cat.id);
    const calculoCategoria=(calculo.res?.breakdown||[]).find(b=>b.id===cat.id);
    const catAvg=calculoCategoria?.value??avgPond(notas);
    // Una lista abierta parte desplegada, y esto es un arreglo, no un gusto.
    //
    // Antes solo se abría sola si había un descarte. O sea una categoría de
    // "varias notas" creada a mano quedaba plegada SIEMPRE: vacía escondía el
    // "+ Agregar nota", que vive adentro, así que no había forma visible de
    // poner la primera; y con notas las escondía también, o sea el estudiante
    // guardaba una y desaparecía de la vista.
    //
    // Es el reporte de tres personas distintas —"le pongo que son varias notas
    // y no me aparece después", "si saco que son varias notas vuelven a
    // aparecer todos"— y explica las cuentas que tienen la pauta armada y
    // ninguna nota guardada.
    //
    // La rama de arriba, la de casillas fijas, ya se abría cuando tenía notas.
    // Eran dos comportamientos distintos para lo mismo sin ninguna razón.
    // `openCats` sigue mandando apenas la persona abre o cierra a mano.
    const isOpen=openCats[cat.id]===undefined?true:openCats[cat.id];
    // La pauta oficial sigue siendo una referencia del programa: no se ofrece
    // borrar una evaluación completa por accidente. Si la persona ya la
    // corrigió, recupera ese control sobre su propia versión. Las filas que la
    // pauta dejó atrás también se pueden limpiar sin tocar lo oficial.
    const pautaOficialIntacta=!pautaCatalogoSinOficial(r)&&!!r.pautaHuella&&!pautaEditada(r);
    const puedeEliminar=!pautaOficialIntacta||!!cat.fueraDePauta;
    const notasDescartadas=new Set((descarte?.dropped||[]).map(n=>n.id));
    const explicacionDescarte=descarte?`<div class="drop-rule-note">${esc(textoDescarte(cat,descarte))}</div>`:'';
    const card=document.createElement('div');card.className='cat-card';
    const notasHTML=notas.length===0?
      `<p style="font-size:0.8125rem;color:var(--fg3);text-align:center;padding:10px 0;">Sin notas aún</p>`:
      notas.map(n=>{
        const descartada=notasDescartadas.has(n.id);
        const textoRecorreccion=n.recorreccionPendiente===true?textoPlazoRecorreccion(plazoRecorreccion(n,cat,S.tenant)):'';
        return `
        <div class="nota-row${descartada?' nota-row-dropped':''}">
          <button class="nota-row-name" aria-label="Editar nota ${esc(n.nombre)}" onclick="openEditNotaModal('${cat.id}','${n.id}');event.stopPropagation();" style="background:none;border:none;cursor:pointer;text-align:left;padding:0;font-family:inherit;font-size:0.875rem;color:var(--fg2);flex:1;">${esc(n.nombre)}</button>
          ${n.peso!==1?`<span class="nota-row-pond">${n.peso}%</span>`:''}
          ${descartada?'<span class="nota-row-drop-tag">No cuenta</span>':''}
          ${n.recorreccionPendiente===true?`<span class="recorreccion-chip">Falta mandar${textoRecorreccion!=='sin plazo calculable'?` · ${esc(textoRecorreccion)}`:''}</span>`:''}
          ${n.fecha?`<span class="cat-fecha-chip">${esc(fechaCorta(n.fecha))}</span>`:''}
          <span class="nota-row-val" style="color:${getColor(n.valor)}">${textoCalificacionNota(n)}</span>
          <button class="nota-row-del" aria-label="Eliminar nota ${esc(n.nombre)}" onclick="deleteNota('${cat.id}','${n.id}');event.stopPropagation();">✕</button>
        </div>`;
      }).join('');
    card.innerHTML=`
      <div class="cat-header">
        <div class="cat-info" role="button" tabindex="0" onclick="openEditCatModal('${cat.id}')" style="cursor:pointer;">
          <div class="cat-name">${esc(cat.nombre)}</div>
          <div class="cat-peso-tag">${cat.peso}% del ramo · ${notas.length} nota${notas.length!==1?'s':''}${fechaChip?' · '+fechaChip:''}</div>
        </div>
        <span style="font-size:1rem;font-weight:700;color:${justificada?'var(--fg2)':getColor(catAvg)}">${justificada?'Justificada':fmtPromedio(catAvg)}</span>
        ${puedeEliminar?`<button aria-label="Eliminar evaluación ${esc(cat.nombre)}" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;min-width:44px;min-height:44px;background:var(--red-bg);border:none;border-radius:8px;padding:0;cursor:pointer;color:var(--red);font-size:0.8125rem;" onclick="confirmDeleteCat('${cat.id}');event.stopPropagation();"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>`:''}
        <button aria-label="${isOpen?'Colapsar':'Expandir'} ${esc(cat.nombre)}" aria-expanded="${isOpen?'true':'false'}" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;min-width:44px;min-height:44px;background:var(--muted);border:none;border-radius:8px;padding:0;cursor:pointer;color:var(--fg2);font-size:0.6875rem;" onclick="toggleCat('${cat.id}');event.stopPropagation();">${isOpen?'▲':'▼'}</button>
      </div>
      <div class="cat-body${isOpen?' open':''}">
        ${explicacionDescarte}
        ${justificada?detalleAusencia:notasHTML+detalleAusencia}
        ${justificada?'':`<button class="add-nota-btn" onclick="openAddNotaModal('${cat.id}');event.stopPropagation();">+ Agregar nota</button>`}
      </div>`;
    cl.appendChild(card);
  });
}

// Formato corto de fecha para chips: "15 mar"
// Se pinta aparte porque depende de una respuesta del servidor. Mientras no
// llega, la sección no existe: no se muestra un esqueleto ni un "cargando" para
// algo que la mayoría de las veces no va a tener nada que decir.
// Una frase entera, no un número suelto. Antes decía "75%" con "POR SOBRE"
// debajo y no se entendía: podía leerse como un 75% por sobre alguien, o como
// estar por sobre un 75. La frase completa no deja dónde equivocarse.
//
// Habla de COMPAÑEROS, no del total: `curso_posicion` calcula el porcentaje
// contra los OTROS (total - 1), así que poner el total correría el denominador y
// el número diría algo distinto de lo que es. La cuenta sigue a la vista a
// propósito: con cinco participantes el porcentaje solo puede ser 0, 25, 50, 75
// o 100, y sin saber cuántos son suena mucho más fino de lo que es.
//
// "Igual o por sobre": los empates cuentan a favor (ver curso_posicion.sql). Con
// un 7 en un curso lleno de sietes decía "por sobre el 44%" y se leía como que
// la mitad te ganaba, cuando nadie te ganaba.
//
// La frase es la misma para 0 y para 100. "Todos" o "ninguno" sería categórico
// sobre un número redondeado: 199 de 200 también llega acá como 100.
function frasePosicionCurso(mejorQue,total){
  const otros=Math.max(Number(total)-1,0);
  return `Igual o por sobre el <b>${Number(mejorQue)}%</b> de tus ${otros} compañeros`;
}

async function pintarPosicionesCurso(){
  const box=document.getElementById('stats-curso');
  if(!box)return;
  await subirNotasCurso();
  const pos=await cargarPosicionesCurso();
  const filas=(S.ramos||[]).filter(r=>r&&r.sigla&&pos&&pos[r.id]);
  if(!filas.length){
    // Con menos de cinco no hay comparación posible, y es el caso normal al
    // principio. Se dice por qué en vez de dejar un hueco.
    box.innerHTML=`<p class="stats-curso-vacio">Cuando al menos cinco personas lleven uno de tus ramos, vas a ver acá cómo te va respecto del resto. Nadie ve tu nota ni tu nombre.</p>`;
    return;
  }
  box.innerHTML=filas.map(r=>{
    const p=pos[r.id];
    return `<div class="stats-curso-row">
      <span class="stats-curso-color" style="background:${esc(r.color)}"></span>
      <span class="stats-curso-main"><strong>${esc(r.nombre)}</strong><small class="stats-curso-frase">${frasePosicionCurso(p.mejorQue,p.total)}</small></span>
    </div>`;
  }).join('');
}

function renderStats(){
  const body=document.getElementById('stats-body');const g=gpa(S.ramos);
  const heroTitle=document.getElementById('stats-hero-title');
  let totalNotas=0;
  S.ramos.forEach(r=>{
    r.categorias.forEach(cat=>{cat.notas.forEach(n=>{
      if(n.valor!==null)totalNotas++;
    });});
  });

  // Hero title dinámico
  if(heroTitle){
    heroTitle.textContent=totalNotas===0?'Este semestre':`Sem. ${S.careerSemestre} · ${semester()}`;
  }

  let html='';
  // Cada sección se arma por separado y se emite al final en el orden que el
  // estudiante haya dejado, saltando las que escondió. Vive en el scope de la
  // función porque el historial se construye en otro bloque.
  const piezas={};
  if(totalNotas===0){
    const ramosConPauta=S.ramos.filter(r=>Array.isArray(r.categorias)&&r.categorias.length>0).length;
    const evaluaciones=S.ramos.reduce((n,r)=>n+(Array.isArray(r.categorias)?r.categorias.length:0),0);
    html+=`<div class="ag-empty" style="margin:20px 20px 0;">
      <div class="ag-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="52" height="52" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 56h48"/><rect x="12" y="34" width="8" height="18" rx="1.5"/><rect x="28" y="22" width="8" height="30" rx="1.5"/><rect x="44" y="14" width="8" height="38" rx="1.5"/>
        </svg>
      </div>
      <div class="ag-empty-title">${S.ramos.length?'Parte con tu primera nota':'Agrega tu primer ramo'}</div>
      <div class="ag-empty-desc">${S.ramos.length?`Tienes ${S.ramos.length} ${S.ramos.length===1?'ramo':'ramos'} y ${evaluaciones} ${evaluaciones===1?'evaluación configurada':'evaluaciones configuradas'}. Ingresa una nota desde Inicio para ver cuánto necesitas en cada ramo.`:'Puedes buscarlo desde Inicio. Acá verás tu avance cuando ingreses notas.'}</div>
      ${ramosConPauta<S.ramos.length?`<div class="ag-empty-desc" style="margin-top:8px;">Falta configurar las evaluaciones de ${S.ramos.length-ramosConPauta} ${S.ramos.length-ramosConPauta===1?'ramo':'ramos'}.</div>`:''}
    </div>`;
  } else {
    const avance=avanceEvaluaciones(S.ramos);
    const historialPrevio=lecturaHistorialPrevio(S.historial);
    const previo=historialPrevio.previo;
    const diff=previo&&g!==null?g-previo.gpa:null;
    const tendencia=diff===null?'':Math.abs(diff)<0.05?'igual que':diff>0?'sobre':'bajo';
    const lectura=diff===null
      ? historialPrevio.estado==='sin_notas'
        ? 'Tu semestre archivado todavía no tiene notas para compararlo.'
        : 'Todavía no tienes un semestre archivado con el que compararte.'
      : Math.abs(diff)<0.05?`Vas igual que en ${esc(previo.label||'el semestre anterior')}.`:`Vas ${nf(Math.abs(diff),2)} puntos ${tendencia} ${esc(previo.label||'el semestre anterior')}.`;
    const avanceTail=Math.min(14,100-avance.pct);
    const falta=loQueFaltaPorRamo(S.ramos);
    const filaNecesidad=x=>{
      const imposible=x.necesita>7.05;
      const valor=imposible?'—':nfNecesaria(Math.max(1,x.necesita));
      const color=imposible?'var(--red)':'var(--fg)';
      const sub=imposible
        ? 'Ya no alcanza solo con lo pendiente'
        : x.abierto
          ? `Vas ${fmtPromedio(x.avg)} · puede bajar según cuántas notas te tomen`
          : `Vas ${fmtPromedio(x.avg)} en lo evaluado`;
      return `<button class="ag-row stats-priority-row" onclick="openRamo('${esc(x.ramo.id)}')">
        <span class="ag-row-bar" style="background:${esc(x.ramo.color)}"></span>
        <div class="ag-row-main">
          <div class="ag-row-name">${esc(x.ramo.nombre)}</div>
          <div class="ag-row-sub">${sub}</div>
        </div>
        <div class="stats-priority-value"><span style="color:${color};">${valor}</span><small>${imposible?'sin salida':'necesitas'}</small></div>
      </button>`;
    };
    piezas.ritmo=`
    <div class="section-hd" style="padding:6px 20px 8px;">
      <span class="section-hd-title">Avance del semestre</span>
    </div>
    <div class="stat-card stats-progress-card${avance.pct===100?' is-complete':''} stats-situation-card" role="progressbar" aria-label="${avance.pct}% de las evaluaciones evaluado" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${avance.pct}" style="--stats-progress:${avance.pct}%;--stats-progress-end:${Math.min(100,avance.pct+avanceTail)}%;margin:0 20px 16px;">
      <div class="stats-situation-top">
        <div><div class="stat-val stats-situation-value">${avance.pct}%</div><div class="stat-sub">del peso evaluable ya tiene nota</div></div>
        <div class="stats-situation-progress"><span>${totalNotas}</span><small>nota${totalNotas!==1?'s':''} ingresada${totalNotas!==1?'s':''}</small></div>
      </div>
      <div class="stats-situation-reading">${lectura}</div>
    </div>
    `;
    {
      const proy=proyeccionSemestre(S.ramos);
      // Se muestran solo 3, ordenados por lo que exigen. Es a propósito —una
      // lista de ocho ramos deja de ser una prioridad— pero hay que DECIRLO:
      // un estudiante que no encuentra su ramo acá concluye que la app se lo
      // olvidó, no que está cuarto en la fila.
      if(falta.length){
        piezas.prioridades=`
        <div class="section-hd" style="padding:0 20px 8px;">
          <span class="section-hd-title">Tus prioridades hoy</span>
        </div>
        <div style="padding:0 20px;">
          <p style="font-size:0.8125rem;color:var(--fg2);line-height:1.45;margin:0 0 10px;">${
            falta.length>3
              ? `Los 3 de tus ${falta.length} ramos que más nota te exigen en lo pendiente. Los demás te piden menos. Tócalos para revisar su pauta.`
              : 'Lo que te exige cada ramo en lo pendiente. Tócalos para revisar su pauta.'
          }</p>
          ${falta.slice(0,3).map(filaNecesidad).join('')}
        </div>`;
      }

      // Cómo va respecto de quienes cursan lo mismo. La sección se pinta vacía
      // y se rellena cuando el servidor responde: bloquear Estadísticas hasta
      // que vuelva una comparación dejaría la pantalla en blanco por algo
      // secundario.
      piezas.curso=`
        <div class="section-hd" style="padding:20px 20px 8px;">
          <span class="section-hd-title">Cómo vas respecto a los demás</span>
        </div>
        <div id="stats-curso" class="stats-curso"></div>`;
      if(proy){
        piezas.rango=`
        <div class="section-hd" style="padding:20px 20px 8px;">
          <span class="section-hd-title">Rango del semestre</span>
        </div>
        <div class="stat-card stats-range-card" style="margin:0 20px 16px;">
          <div class="stat-label">Tu promedio final puede quedar entre</div>
          <div class="stat-val" style="margin-top:4px;">
            <span style="color:${getColor(proy.piso)}">${nf(proy.piso)}</span>
            <span style="color:var(--fg3);font-weight:600;"> y </span>
            <span style="color:${getColor(proy.techo)}">${nf(proy.techo)}</span>
          </div>
          <div class="stat-sub" style="margin-top:6px;">El rango considera sacar entre 1,0 y 7,0 en todo lo pendiente, incluidas las reglas que pueden topar una nota.</div>
        </div>`;
      }
    }
  }

  // Historial de semestres. El encabezado y el botón para cargar uno anterior van
  // aunque el historial esté vacío: quien llega en cuarto semestre necesita
  // justamente eso, y si solo apareciera con historial ya existente no lo vería
  // nunca.
  {
    const validos=(S.historial||[]).filter(h=>h&&Array.isArray(h.ramos));
    let hist=`<div class="section-hd stats-history-heading" style="padding:0 20px 8px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span class="section-hd-title">Historial</span>
      <button type="button" class="stats-hist-add" onclick="openSemestreAnteriorModal()">+ Semestre anterior</button>
    </div>`;
    if(!validos.length){
      hist+=`<p class="stats-hist-vacio">Agrega las notas finales de semestres anteriores para incluirlos en tu promedio de carrera.</p>`;
    }
    if(validos.length>0){
      validos.forEach(h=>{
        const isOpen=openHist[h.id];
        const historialGpa=gpaHistorial(h);
        const gpaColor=historialGpa!==null?getColor(historialGpa):'var(--fg3)';
        const ramosHistorial=h.ramos.filter(r=>r&&typeof r==='object');
        const ramosRows=ramosHistorial.map(r=>{
          const avg=histRamoAvg(r,h.ramos);
          const editado=typeof r.avgOverride==='number';
          return `<button class="hist-ramo-row" onclick="openEditHistRamoModal('${esc(h.id)}','${esc(r.id)}')" aria-label="Editar promedio de ${esc(r.nombre)}">
            <span class="hist-ramo-name">${esc(r.nombre)}${r.creditos?`<span class="hist-cr">${r.creditos} cr</span>`:''}${editado?'<span class="hist-edited" title="Corregido a mano">editado</span>':''}</span>
            <span class="hist-ramo-val" style="color:${getColorRamo(r,avg)}">${fmtPromedio(avg)}</span>
            <svg class="ic hist-pencil" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>`;
        }).join('');
        hist+=`
          <div class="hist-card">
            <div class="hist-header" role="button" tabindex="0" onclick="toggleHist('${h.id}')">
              <div style="flex:1;">
                <div style="font-size:0.96875rem;font-weight:700;color:var(--fg);letter-spacing:-.01em;">${esc(h.label)}</div>
                <div style="font-size:0.75rem;color:var(--fg3);margin-top:3px;">${Number.isFinite(h.careerSemestre)?`Sem. ${h.careerSemestre} · `:''}${ramosHistorial.length} ramo${ramosHistorial.length!==1?'s':''}</div>
              </div>
              <span class="hist-gpa" style="color:${gpaColor}">${historialGpa!==null?fmtPromedio(historialGpa):'—'}</span>
              <span style="color:var(--fg3);font-size:0.6875rem;">${isOpen?'▲':'▼'}</span>
            </div>
            <div class="hist-body${isOpen?' open':''}">
              ${ramosRows||'<p style="font-size:0.8125rem;color:var(--fg3);">Sin ramos</p>'}
              <div class="hist-acciones">
                <button type="button" class="hist-accion" onclick="openRenombrarHistModal('${esc(h.id)}')">Cambiar nombre</button>
                <button type="button" class="hist-accion hist-accion-del" onclick="pedirBorrarHistorial('${esc(h.id)}')">Eliminar semestre</button>
              </div>
            </div>
          </div>`;
      });
    }
    piezas.historial=hist;
  }

  // Las secciones se emiten en el orden que dejó el estudiante y sin las que
  // escondió. Una sección que no existe en este semestre —no hay proyección, no
  // hay nada urgente— simplemente no está en `piezas` y se salta sola.
  ordenSecciones().forEach(id=>{
    if(seccionOculta(id))return;
    if(piezas[id])html+=piezas[id];
  });

  body.innerHTML=html;
  // El HTML ya está en pantalla; la comparación se rellena cuando el servidor
  // conteste. Sin await: Estadísticas no espera por una sección secundaria.
  if(!seccionOculta('curso'))pintarPosicionesCurso();
}

// ─── WRAPPED: EL SEMESTRE EN HISTORIAS ───────────────────────────────────────
// Al cierre del semestre, Inicio ofrece un resumen en pantallas que se pasan
// tocando, como las historias. Se arma en el navegador con lo que ya está en
// `S`: no se guarda nada ni se migra nada. La comparación con el resto sale de
// `curso_posicion` y `universidad_posicion`, que solo devuelven porcentajes y
// solo desde cinco personas.
//
// Sale el 20 de diciembre y no antes: para entonces ya están las notas de
// exámenes y recuperativos, y un resumen con el examen pendiente dice un
// promedio que todavía puede cambiar. Decisión de Martín del 2026-09-28.
// Las pruebas fuerzan el reloj: ninguna URL revela la sorpresa antes de fecha.
const WRAPPED_DESDE='2026-12-20',WRAPPED_HASTA='2027-03-01';
function wrappedDisponible(hoy){
  const d=hoy||new Date();
  const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return iso>=WRAPPED_DESDE&&iso<WRAPPED_HASTA;
}

// El semestre en curso si tiene notas; si ya se archivó, el último archivado
// (el historial guarda lo más reciente al inicio).
function ramosWrapped(){
  const conNota=rs=>ramosDelPromedio(rs||[]).some(r=>ramoAvg(r,undefined,rs)!==null);
  if(conNota(S.ramos))return {ramos:S.ramos,actual:true,label:semester()};
  const h=(S.historial||[])[0];
  return h&&conNota(h.ramos)?{ramos:h.ramos,actual:false,label:h.label||'Semestre archivado'}:null;
}

// Todo sale de `ramoAvg` y `gpa`: son las únicas fórmulas de promedio que hay,
// y el resumen tiene que decir los mismos números que Inicio.
function datosWrapped(ramos){
  const lista=ramosDelPromedio(ramos).map(r=>({r,avg:ramoAvg(r,undefined,ramos)})).filter(x=>x.avg!==null);
  if(!lista.length)return null;
  let mejor=null,nNotas=0;
  lista.forEach(({r})=>(r.categorias||[]).forEach(c=>(c.notas||[]).forEach(n=>{
    if(typeof n.valor!=='number')return;
    nNotas++;
    if(!mejor||n.valor>mejor.valor)mejor={valor:n.valor,ramo:r.nombre,evaluacion:n.nombre||c.nombre};
  })));
  const orden=[...lista].sort((a,b)=>b.avg-a.avg);
  return {
    gpa:gpa(ramos),nRamos:lista.length,nNotas,mejor,
    colores:lista.map(x=>x.r.color),
    // Un color por nota, en orden de ramo: la grilla del semestre.
    notasColores:lista.flatMap(({r})=>(r.categorias||[]).flatMap(c=>(c.notas||[]).filter(n=>typeof n.valor==='number').map(()=>r.color))),
    ranking:orden.map(x=>({nombre:x.r.nombre,color:x.r.color,avg:x.avg})),
    aprobando:lista.filter(x=>notaAprobadaRamo(x.r,x.avg)).length,
    estrella:orden[0],
    // Con un solo ramo, "el que más te costó" sería la misma estrella.
    dificil:orden.length>1?orden[orden.length-1]:null,
  };
}

// Solo para el semestre en curso: es el que tiene promedios en `curso_notas`.
// Si el servidor no contesta o no llegan a cinco, esas pantallas no aparecen.
function posicionWrappedValida(f){
  return f&&Number.isInteger(f.total)&&f.total>=5&&Number.isFinite(f.mejorQue)&&f.mejorQue>=0&&f.mejorQue<=100;
}
async function comparacionWrapped(){
  if(!supabaseClient||!currentUser)return null;
  const cuenta=currentUser.id,tenant=S.tenant,out={};
  const vigente=()=>currentUser&&currentUser.id===cuenta&&S.tenant===tenant;
  try{
    await subirNotasCurso();
    if(!vigente())return null;
    invalidarPosicionesCurso();
    const pos=await cargarPosicionesCurso()||{};
    if(!vigente()){invalidarPosicionesCurso();return null;}
    const top=(S.ramos||[]).filter(r=>posicionWrappedValida(pos[r.id])).sort((a,b)=>pos[b.id].mejorQue-pos[a.id].mejorQue)[0];
    if(top)out.curso={ramo:top.nombre,total:pos[top.id].total,mejorQue:pos[top.id].mejorQue};
  }catch(e){} // La comparación es opcional, incluso si esa RPC no está aplicada.
  if(!vigente())return null;
  try{
    const {data,error}=await supabaseClient.rpc('universidad_posicion',{p_tenant:tenant});
    if(!vigente())return null;
    const f=Array.isArray(data)?data[0]:data;
    const uni=f&&{total:f.total,mejorQue:f.mejor_que};
    if(!error&&posicionWrappedValida(uni))out.uni=uni;
  }catch(e){}
  return vigente()?out:null;
}

// ─── Piezas visuales de cada pantalla ───
// Todo lo que llevan adentro es texto ya escapado o números que calculó la app.
// Son decorado con `aria-hidden`: lo que importa también está dicho en palabras.

// Una cifra que cuenta desde `desde` hasta su valor cuando aparece la pantalla.
// El texto final es SIEMPRE el que ya formateó la app (`fmtPromedio`, `fmt`):
// el conteo anima el camino y nunca redondea distinto. VoiceOver lee la copia
// oculta, no cada número intermedio.
function cifraWrapped(texto,desde){
  const m=/^(\d+(?:\.\d+)?)(%?)$/.exec(texto);
  if(!m)return esc(texto);
  const dec=(m[1].split('.')[1]||'').length;
  return `<span class="wrapped-cifra" aria-hidden="true" data-hasta="${m[1]}" data-desde="${desde||0}" data-dec="${dec}" data-suf="${m[2]}">${texto}</span><span class="wrapped-oculto">${texto}</span>`;
}
// Un punto por nota, del color de su ramo: el semestre entero de un vistazo.
function grillaWrapped(colores){
  return `<div class="wrapped-grilla" aria-hidden="true">${colores.slice(0,80).map((c,i)=>`<span style="--c:${esc(c)};--d:${2+i*.12}"></span>`).join('')}</div>`;
}
// El promedio sobre la escala chilena, de 1,0 a 7,0, con la marca del 4,0. El
// arco va en blanco: el semáforo no se usa como decorado.
function arcoWrapped(g){
  const t=Math.min(Math.max((g-1)/6,0),1),x=100-80*Math.cos(Math.PI*t),y=100-80*Math.sin(Math.PI*t);
  return `<svg class="wrapped-arco" viewBox="0 0 200 118" aria-hidden="true">
    <path class="pista" d="M20 100A80 80 0 0 1 180 100" pathLength="100"/>
    <path class="valor" d="M20 100A80 80 0 0 1 180 100" pathLength="100" style="--v:${(t*100).toFixed(1)}"/>
    <line x1="100" y1="12" x2="100" y2="28"/><text x="100" y="9" text-anchor="middle">4,0</text>
    <text x="20" y="116" text-anchor="middle">1,0</text><text x="180" y="116" text-anchor="middle">7,0</text>
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/>
  </svg>`;
}
// Los ramos ordenados por promedio. La línea de color a la izquierda es la
// misma que en Inicio: el color del ramo vive ahí y no tiñe la barra.
function rankingWrapped(ranking){
  return `<ol class="wrapped-ranking" aria-hidden="true">${ranking.slice(0,5).map((x,i)=>`
    <li class="${i===0?'top':''}" style="--c:${esc(x.color)};--d:${3+i/2};--v:${Math.max((x.avg-1)/6,.02).toFixed(3)}">
      <span>${esc(x.nombre)}</span><b>${fmtPromedio(x.avg)}</b><i></i></li>`).join('')}</ol>`;
}
// Una regla de 0 a 100 con "Tú" encima. Se lee como posición, no como nota.
function reglaWrapped(p){
  return `<div class="wrapped-regla" aria-hidden="true" style="--p:${Math.min(Math.max(p,0),100)}">
    <div class="pista"><i></i></div><b>Tú</b><span>0%</span><span>100%</span></div>`;
}

// Cada pantalla es texto ya escapado. La última es la que se comparte, así que
// lleva solo lo que uno querría mostrar: nada del ramo que más costó.
function slidesWrapped(d,comp,label){
  const s=[],pl=n=>n!==1?'s':'';
  // `short` ("FEN", "UC"): "En toda U. de Chile · FEN" no se dice así.
  const u=esc((TENANTS[S.tenant]&&TENANTS[S.tenant].short)||'tu universidad');
  const nombre=esc((S.userName||'').split(' ')[0]||'');
  s.push({tipo:'portada',k:esc(label),titulo:nombre?`${nombre}, este fue tu semestre`:'Este fue tu semestre',sub:'Tus notas, contadas de otra forma.'});
  s.push({k:'Este semestre ingresaste',big:cifraWrapped(String(d.nNotas)),sub:`nota${pl(d.nNotas)} en ${d.nRamos} ramo${pl(d.nRamos)}`,viz:grillaWrapped(d.notasColores)});
  if(d.gpa!==null)s.push({k:'Tu promedio',big:cifraWrapped(fmtPromedio(d.gpa),1),sub:`${d.aprobando} de ${d.nRamos} ramo${pl(d.nRamos)} con promedio de aprobación`,viz:arcoWrapped(d.gpa)});
  if(d.mejor)s.push({tipo:'destello',k:'Tu mejor nota',big:cifraWrapped(fmt(d.mejor.valor),1),sub:`${d.mejor.valor>=7?'Nada más que decir.<br>':''}${esc(d.mejor.evaluacion)} · ${esc(d.mejor.ramo)}`});
  s.push({k:'Tu ramo estrella',titulo:esc(d.estrella.r.nombre),sub:`Tu mejor promedio: ${fmtPromedio(d.estrella.avg)}.`,viz:d.ranking.length>1?rankingWrapped(d.ranking):''});
  // "Lo sacaste adelante" solo si de verdad lo aprobó: el resumen no celebra
  // lo que el semáforo pinta rojo.
  if(d.dificil)s.push({k:'El que más pelea dio',titulo:esc(d.dificil.r.nombre),big:cifraWrapped(fmtPromedio(d.dificil.avg),1),
    sub:!ramoCompletamenteEvaluado(d.dificil.r)?'Todavía quedan evaluaciones por registrar.':notaAprobadaRamo(d.dificil.r,d.dificil.avg)?'Y lo sacaste adelante.':'Un semestre no define a nadie.'});
  if(comp&&comp.curso)s.push({k:`En ${esc(comp.curso.ramo)}`,big:cifraWrapped(comp.curso.mejorQue+'%'),
    sub:frasePosicionCurso(comp.curso.mejorQue,comp.curso.total).replace(/<\/?b>/g,'')+'.',viz:reglaWrapped(comp.curso.mejorQue)});
  // El servidor compara el promedio simple de los ramos, no el ponderado de
  // Inicio (ver universidad_posicion.sql): por eso la frase dice "tus ramos".
  if(comp&&comp.uni)s.push({k:`En toda ${u}`,big:cifraWrapped(comp.uni.mejorQue+'%'),
    sub:`Con el promedio simple de tus ramos con sigla quedas igual o por sobre el ${comp.uni.mejorQue}% de otras ${comp.uni.total-1} personas de ${u} en GradeHub.`,viz:reglaWrapped(comp.uni.mejorQue)});
  const filas=[];
  if(d.mejor)filas.push(['Mejor nota',fmt(d.mejor.valor)]);
  filas.push(['Ramo estrella',esc(d.estrella.r.nombre)]);
  if(comp&&comp.uni)filas.push([`En ${u}`,`sobre el ${comp.uni.mejorQue}%`]);
  s.push({tipo:'final',k:esc(label),big:d.gpa!==null?fmtPromedio(d.gpa):null,filas});
  return s;
}

const ICONO_CERRAR='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
// El ícono de compartir de iOS: cuadrado abierto con la flecha hacia arriba.
const ICONO_COMPARTIR='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16"/></svg>';

let _wrapped=null,_wrappedAbriendo=false;
async function abrirWrapped(){
  const base=wrappedDisponible()&&ramosWrapped();if(!base||_wrapped||_wrappedAbriendo)return;
  _wrappedAbriendo=true;
  const cuenta=currentUser&&currentUser.id,tenant=S.tenant;
  // El foco se guarda ANTES de desactivar el botón: desactivarlo se lo quita,
  // y al cerrar volvía al body en vez de al botón que lo abrió.
  const foco=document.activeElement;
  const btn=document.getElementById('home-wrapped-btn');
  const etiqueta=btn&&btn.querySelector('span');
  if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true');etiqueta.textContent='Preparando…';}
  const comp=base.actual?await Promise.race([comparacionWrapped(),new Promise(r=>setTimeout(()=>r(null),4000))]):null;
  if(btn){btn.disabled=false;btn.removeAttribute('aria-busy');etiqueta.textContent='Ver mi semestre';}
  _wrappedAbriendo=false;
  const actual=ramosWrapped();
  if(!wrappedDisponible()||(currentUser&&currentUser.id)!==cuenta||S.tenant!==tenant||!actual||actual.ramos!==base.ramos)return;
  const datos=datosWrapped(base.ramos);if(!datos)return;
  const slides=slidesWrapped(datos,comp,base.label);
  track('wrapped_open',{pantallas:slides.length});
  const ov=document.createElement('div');
  ov.className='wrapped';
  ov.dataset.dir='adelante';
  ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Tu semestre en GradeHub');
  ov.innerHTML=`<span class="wrapped-luz a"></span><span class="wrapped-luz b"></span><span class="wrapped-luz c"></span>
    <span class="wrapped-tinta a"></span><span class="wrapped-tinta b"></span>
    <div class="wrapped-barras"></div>
    <button class="wrapped-cerrar wrapped-vidrio" type="button" aria-label="Cerrar">${ICONO_CERRAR}</button>
    <div class="wrapped-slide" aria-live="polite"></div>
    <div class="wrapped-pasos"><button type="button" data-paso="-1">Anterior</button><button type="button" data-paso="1">Siguiente</button></div>`;
  // Tocar el tercio izquierdo vuelve, el resto avanza: igual que las historias.
  // Los botones "Anterior" y "Siguiente" hacen lo mismo para VoiceOver y el
  // teclado, que no tienen cómo tocar un tercio de pantalla (HIG, Accessibility:
  // "Offer alternatives to gestures").
  ov.addEventListener('click',e=>{
    if(e.target.closest('.wrapped-cerrar'))return cerrarWrapped();
    if(e.target.closest('.wrapped-compartir'))return compartirWrapped();
    if(e.target.closest('.wrapped-descargar'))return descargarWrapped();
    const b=e.target.closest('[data-paso]');
    pasarWrapped(b?Number(b.dataset.paso):e.clientX<ov.clientWidth/3?-1:1);
  });
  arrastreWrapped(ov);
  document.addEventListener('keydown',teclaWrapped);
  document.body.appendChild(ov);
  const fondo=[...document.body.children].filter(el=>el!==ov).map(el=>({el,inert:el.inert}));
  fondo.forEach(({el})=>{el.inert=true;});
  _wrapped={ov,slides,i:0,foco,fondo,imagen:null,archivo:null,imagenTerminada:false};
  pintarWrapped();
  ov.querySelector('.wrapped-cerrar').focus();
}

// Deslizar hacia abajo cierra, que es lo que se espera en iOS (HIG, Modality).
// La pantalla sigue al dedo 1:1 y se encoge como una tarjeta que se suelta
// (HIG, Motion: el movimiento sigue al gesto). Al soltar decide la velocidad
// además de la distancia: un tirón rápido cierra aunque haya sido corto. Solo
// arranca con el contenido arriba del todo, para no pelearle el scroll a una
// pantalla con el texto agrandado.
function arrastreWrapped(ov){
  let y0=null,dy=0,t0=0,v=0,yPrev=0,tPrev=0;
  const pintar=y=>{
    const k=Math.min(y,400)/400;
    if(movimientoReducido())return;
    ov.style.transform=y?`translateY(${y}px) scale(${1-k*.08})`:'';
    ov.style.borderRadius=y?`${Math.round(k*36)}px`:'';
  };
  ov.addEventListener('touchstart',e=>{
    y0=ov.querySelector('.wrapped-slide').scrollTop>0?null:e.touches[0].clientY;
    dy=0;v=0;yPrev=y0;tPrev=t0=e.timeStamp;
    ov.style.transition='none';
  },{passive:true});
  ov.addEventListener('touchmove',e=>{
    if(y0===null)return;
    const y=e.touches[0].clientY;
    if(e.timeStamp>tPrev)v=(y-yPrev)/(e.timeStamp-tPrev);
    yPrev=y;tPrev=e.timeStamp;
    dy=Math.max(0,y-y0);
    pintar(dy);
  },{passive:true});
  ov.addEventListener('touchend',()=>{
    if(y0===null)return;
    y0=null;
    if(movimientoReducido()){if(dy>120||(dy>24&&v>.6))cerrarWrapped(true);return;}
    ov.style.transition='transform var(--motion-base) var(--ease-out),border-radius var(--motion-base) var(--ease-out)';
    if(dy>120||(dy>24&&v>.6)){ov.style.transform='translateY(100%) scale(.92)';setTimeout(()=>cerrarWrapped(true),220);}
    else pintar(0);
  });
  ov.addEventListener('touchcancel',()=>{
    y0=null;dy=0;v=0;ov.style.transform='';ov.style.borderRadius='';ov.style.transition='';
  });
}

function pintarWrapped(){
  if(!wrappedDisponible())return cerrarWrapped(true);
  const {ov,slides,i}=_wrapped,s=slides[i];
  // Las tres luces del fondo cambian de lugar en cada pantalla: es lo que hace
  // sentir que se avanzó, sin mover el texto de su sitio.
  ov.dataset.tono=String(i%4);
  ov.querySelector('.wrapped-barras').innerHTML=slides.map((_,j)=>`<span class="${j<i?'on':j===i?'ahora':''}"></span>`).join('');
  // `--d` escalona la entrada: primero de qué se habla, después el número.
  let d=0;const p=(cls,html)=>html?`<p class="${cls}" style="--d:${d++}">${html}</p>`:'';
  const caja=ov.querySelector('.wrapped-slide');
  caja.scrollTop=0;
  if(s.tipo==='final'){
    caja.innerHTML=`<div class="wrapped-tarjeta" style="--d:0">
        <div class="wrapped-tarjeta-marca"><img src="logo.svg" alt="" width="28" height="28"><span>GradeHub</span><em>${s.k}</em></div>
        ${s.big?`<p class="wrapped-tarjeta-big">${s.big}<small>promedio del semestre</small></p>`:''}
        <div class="wrapped-filas">${s.filas.map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>
        <p class="wrapped-marca">gradehub.cl</p>
      </div>
      <div class="wrapped-acciones" style="--d:2">
        <button class="wrapped-compartir wrapped-vidrio" type="button" disabled>${ICONO_COMPARTIR}<span>Preparando imagen…</span></button>
        <button class="wrapped-descargar wrapped-vidrio" type="button" disabled>Descargar imagen</button>
        <p class="wrapped-pie">o saca un pantallazo</p>
      </div>`;
    // La imagen se prepara al llegar, no al tocar: Safari exige que el menú de
    // compartir se abra en el mismo toque, y dibujarla ahí lo haría esperar.
    prepararImagenWrapped(s);
    actualizarCompartirWrapped();
    return;
  }
  const portada=s.tipo==='portada';
  caja.innerHTML=(portada?`<p class="wrapped-poster" aria-hidden="true">${s.k}</p>`:'')
    +p('wrapped-k',s.k)+p('wrapped-titulo',s.titulo)
    +(s.big?(s.tipo==='destello'?`<div class="wrapped-destello" style="--d:${d++}"><span class="wrapped-rayos"></span><p class="wrapped-big">${s.big}</p></div>`:p('wrapped-big',s.big)):'')
    +p('wrapped-sub',s.sub)
    +(s.viz?`<div class="wrapped-viz" style="--d:${d++}">${s.viz}</div>`:'')
    +(portada?p('wrapped-pie','Toca para seguir'):'');
  contarWrapped(caja,i);
}

// Las cifras cuentan cuando les llega su turno en la entrada escalonada. Si la
// persona avanza antes de que termine, el conteo se abandona: nunca hay que
// esperar a una animación (HIG, Motion: "Let people cancel motion").
function contarWrapped(caja,i){
  if(movimientoReducido())return;
  caja.querySelectorAll('.wrapped-cifra').forEach(el=>{
    const hasta=Number(el.dataset.hasta),desde=Number(el.dataset.desde),dec=Number(el.dataset.dec),suf=el.dataset.suf;
    const final=el.textContent,retraso=(Number((el.closest('[style*="--d"]')||{style:{getPropertyValue:()=>0}}).style.getPropertyValue('--d'))||0)*80;
    const dur=650;let t0=null;
    el.textContent=desde.toFixed(dec)+suf;
    const paso=t=>{
      if(!_wrapped||_wrapped.i!==i||!el.isConnected)return;
      if(t0===null)t0=t+retraso;
      const k=Math.min(Math.max((t-t0)/dur,0),1),e=1-Math.pow(1-k,3);
      el.textContent=k<1?(desde+(hasta-desde)*e).toFixed(dec)+suf:final;
      if(k<1)requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
}

function pasarWrapped(paso){
  if(!_wrapped)return;
  const i=_wrapped.i+paso;
  if(i>=_wrapped.slides.length)return cerrarWrapped();
  if(i<0)return;
  _wrapped.i=i;
  // La entrada viene del lado hacia donde se avanzó: adelante entra desde la
  // derecha, atrás desde la izquierda (HIG: consistencia espacial).
  _wrapped.ov.dataset.dir=paso>0?'adelante':'atras';
  pintarWrapped();
}
function teclaWrapped(e){
  if(!_wrapped)return;
  if(e.key==='Tab'){
    const botones=[..._wrapped.ov.querySelectorAll('button:not(:disabled)')];
    const indice=botones.indexOf(document.activeElement);
    if(botones.length&&(indice<0||(e.shiftKey?indice===0:indice===botones.length-1))){
      e.preventDefault();botones[e.shiftKey?botones.length-1:0].focus();
    }
  }else if(e.key==='Escape')cerrarWrapped();
  else if(e.key===' '&&e.target&&e.target.closest('button'))return; // La barra activa el botón enfocado.
  else if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();pasarWrapped(1);}
  else if(e.key==='ArrowLeft')pasarWrapped(-1);
}
// Sale por el mismo camino por el que entró: hacia abajo y desvaneciéndose.
// `yaSalio` es para el arrastre, que ya lo sacó de la pantalla con el dedo.
function cerrarWrapped(yaSalio){
  if(!_wrapped||_wrapped.saliendo)return;
  _wrapped.saliendo=true;
  document.removeEventListener('keydown',teclaWrapped);
  const {ov,foco,fondo}=_wrapped;
  const fin=()=>{ov.remove();fondo.forEach(({el,inert})=>{el.inert=inert;});_wrapped=null;if(foco&&foco.isConnected&&foco.focus)foco.focus();};
  if(yaSalio===true||movimientoReducido())return fin();
  ov.classList.add('saliendo');
  setTimeout(fin,220);
}

// ─── Compartir: la tarjeta final como imagen de historia (1080×1920) ───
// Se dibuja en un canvas con los mismos datos y colores que la tarjeta. Los
// colores salen de la pantalla ya pintada (`wrapped-tinta`), así que siguen el
// tema; si el navegador no sabe leerlos, quedan los de respaldo.
function textoPlano(html){return new DOMParser().parseFromString(`<p>${html}</p>`,'text/html').body.textContent||'';}
async function imagenWrapped(s){
  const W=1080,H=1920,cv=document.createElement('canvas');cv.width=W;cv.height=H;
  const ctx=cv.getContext('2d');
  // Safari anterior a roundRect también puede exportar la misma tarjeta.
  const tarjetaRedonda=(x,y,w,h,r)=>{
    if(ctx.roundRect){ctx.roundRect(x,y,w,h,r);return;}
    ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  };
  const color=(sel,prop,resp)=>{
    const el=_wrapped&&_wrapped.ov.querySelector(sel);
    const v=el?getComputedStyle(el)[prop]:'';
    ctx.fillStyle=resp;ctx.fillStyle=v||resp;return ctx.fillStyle;
  };
  const fondo=color('.wrapped-tarjeta','backgroundColor','#0b1f22'),base=color('.wrapped','backgroundColor','#0a1a1c');
  const luzA=color('.wrapped-tinta.a','color','#1f6f73'),luzB=color('.wrapped-tinta.b','color','#3b3f8f'),brillo=color('.wrapped-tarjeta-big','color','#c9f4f2');
  ctx.fillStyle=base;ctx.fillRect(0,0,W,H);
  const luz=(x,y,r,c)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);};
  luz(180,260,900,luzA);luz(980,1700,1000,luzB);
  // La tarjeta: material sólido, esquinas de 64px.
  const x=72,y=360,w=W-144,h=1240;
  ctx.fillStyle=fondo;ctx.beginPath();tarjetaRedonda(x,y,w,h,64);ctx.fill();
  // El brillo de la esquina, recortado a la tarjeta, como en pantalla.
  ctx.save();ctx.clip();
  const g=ctx.createRadialGradient(x+w-60,y+40,0,x+w-60,y+40,560);g.addColorStop(0,luzB);g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(x,y,w,h);ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=3;ctx.beginPath();tarjetaRedonda(x,y,w,h,64);ctx.stroke();
  const fuente=(peso,px,redonda)=>`${peso} ${px}px ${redonda?'ui-rounded,':''}-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif`;
  const logo=await new Promise(r=>{const im=new Image();im.onload=()=>r(im);im.onerror=()=>r(null);im.src='logo.svg';});
  if(logo)ctx.drawImage(logo,x+72,y+72,72,72);
  ctx.fillStyle='#fff';ctx.textBaseline='alphabetic';
  ctx.font=fuente(700,48);ctx.fillText('GradeHub',x+(logo?168:72),y+126);
  ctx.font=fuente(600,40);ctx.textAlign='right';ctx.fillText(textoPlano(s.k),x+w-72,y+126);ctx.textAlign='left';
  let cy=y+470;
  if(s.big){
    ctx.fillStyle=brillo;ctx.font=fuente(800,300,true);ctx.fillText(s.big,x+60,cy);
    ctx.fillStyle='#fff';ctx.font=fuente(600,44);ctx.fillText('promedio del semestre',x+72,cy+80);
    cy+=230;
  }
  ctx.font=fuente(500,46);
  s.filas.forEach(([a,b])=>{
    ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+72,cy-70);ctx.lineTo(x+w-72,cy-70);ctx.stroke();
    ctx.fillStyle='#fff';ctx.font=fuente(500,46);ctx.fillText(textoPlano(a),x+72,cy);
    ctx.font=fuente(800,50);ctx.textAlign='right';
    let v=textoPlano(b);while(ctx.measureText(v).width>w-460&&v.length>4)v=v.slice(0,-2)+'…';
    ctx.fillText(v,x+w-72,cy);ctx.textAlign='left';
    cy+=150;
  });
  ctx.fillStyle='#fff';ctx.font=fuente(800,52);ctx.fillText('gradehub.cl',x+72,y+h-80);
  const blob=await new Promise(r=>cv.toBlob(r,'image/png'));
  return blob?new File([blob],'mi-semestre-gradehub.png',{type:'image/png'}):null;
}
// Preparar fuera del gesto; el toque llama share directamente con un File listo.
function prepararImagenWrapped(s){
  if(_wrapped.imagen)return;
  const estado=_wrapped;
  estado.imagen=imagenWrapped(s).catch(()=>null).then(archivo=>{
    if(_wrapped!==estado)return;
    estado.archivo=archivo;estado.imagenTerminada=true;actualizarCompartirWrapped();
  });
}
function actualizarCompartirWrapped(){
  if(!_wrapped)return;
  const listo=!!_wrapped.archivo,caja=_wrapped.ov.querySelector('.wrapped-slide');
  const boton=caja.querySelector('.wrapped-compartir'),descarga=caja.querySelector('.wrapped-descargar');
  if(!boton)return;
  boton.disabled=!listo;descarga.disabled=!listo;
  boton.querySelector('span').textContent=listo?'Compartir':_wrapped.imagenTerminada?'Imagen no disponible':'Preparando imagen…';
}
function descargarWrapped(){
  if(!_wrapped||!_wrapped.archivo||!wrappedDisponible())return;
  const archivo=_wrapped.archivo,a=document.createElement('a'),url=URL.createObjectURL(archivo);
  a.href=url;a.download=archivo.name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function compartirWrapped(){
  if(!_wrapped||!_wrapped.archivo||!wrappedDisponible())return;
  const estado=_wrapped,archivo=estado.archivo;
  track('wrapped_share',{});
  try{
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[archivo]})){
      await navigator.share({files:[archivo],title:'Mi semestre en GradeHub'});
      return;
    }
  }catch(e){if(e&&e.name==='AbortError')return;}
  // Si el navegador rechaza archivos también se puede guardar la historia.
  if(_wrapped===estado)descargarWrapped();
}

function renderWrappedHome(){
  const caja=document.getElementById('home-wrapped');
  if(!caja)return;
  const base=wrappedDisponible()&&ramosWrapped();
  if(!base){caja.style.display='none';caja.innerHTML='';if(_wrapped)cerrarWrapped(true);return;}
  caja.style.display='grid';
  caja.innerHTML=`<div class="home-wrapped-texto">
      <span class="home-wrapped-k">Ya está listo</span>
      <strong>Tu ${esc(base.label)}, en historias</strong>
      <small>Tus números, tu mejor nota y cómo te fue al lado del resto.</small>
      <button id="home-wrapped-btn" type="button"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg><span>Ver mi semestre</span></button>
    </div>
    <div class="home-wrapped-pila" aria-hidden="true"><span></span><span></span><span><b>${esc(base.label)}</b></span></div>`;
  document.getElementById('home-wrapped-btn').addEventListener('click',abrirWrapped);
}
