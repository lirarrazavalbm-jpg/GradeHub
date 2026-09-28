// Vistas reutilizables de la propuesta. Sin red ni estado persistido.
// Se apoyan en los formatters y tarjetas reales de marketplace.js.
function estadoOperativoClase(profesor,anuncio,ahora=Date.now()){
  const vig=vigenciaAnuncio(anuncio,ahora),costo=costoCampanaClase(anuncio.campana);
  if(vig==='en_revision')return {clave:'revision',texto:'Por revisar'};
  if(vig==='borrador')return {clave:'borrador',texto:'Borrador'};
  if(vig==='expirado')return {clave:'finalizada',texto:'Finalizada'};
  if(profesor.estado!=='aprobado')return {clave:'pausada',texto:'Profesor suspendido'};
  if(vig==='pausado')return {clave:'pausada',texto:'Pausada'};
  if(costo&&costo.agotada)return {clave:'tope',texto:'Tope alcanzado'};
  if(vig==='programado')return {clave:'programada',texto:'Programada'};
  return {clave:'activa',texto:'Activa'};
}
function etiquetaOperativaClase(estado){return `<span class="gh-estado gh-estado-${esc(estado.clave)}">${esc(estado.texto)}</span>`;}
function filasOperativasClases(profesores){return profesores.flatMap(p=>(p.anuncios||[]).map(a=>({profesor:p,anuncio:a,estado:estadoOperativoClase(p,a)})));}
function resumenOperativoClases(profesores){
  const filas=filasOperativasClases(profesores),cobros=filas.flatMap(f=>Array.isArray(f.anuncio.cobros)?f.anuncio.cobros:(f.anuncio.cobro?[f.anuncio.cobro]:[]));
  return {activas:filas.filter(f=>f.estado.clave==='activa').length,revision:filas.filter(f=>f.estado.clave==='revision').length,
    deuda:cobros.filter(c=>c.estado==='deuda').reduce((n,c)=>n+c.monto_clp,0),cobrado:cobros.filter(c=>c.estado==='cobrado').reduce((n,c)=>n+c.monto_clp,0)};
}
function cabeceraMercado(titulo,descripcion,extra=''){
  return `<header class="gh-cabecera"><div><p class="gh-ceja">CLASES PARTICULARES</p><h1>${esc(titulo)}</h1><p class="gh-bajada">${esc(descripcion)}</p></div>${extra}</header>`;
}
function resumenOperativoHTML(profesores){
  const r=resumenOperativoClases(profesores);
  return `<div class="gh-resumen" aria-label="Resumen de administración">
    <div><span>Visibles ahora</span><strong>${r.activas}<small> campañas</small></strong><p>Publicadas y bajo su tope</p></div>
    <div><span>Por revisar</span><strong>${r.revision}<small> ${r.revision===1?'anuncio':'anuncios'}</small></strong><p>Esperan una decisión</p></div>
    <div><span>Deuda registrada</span><strong>${pesosClase(r.deuda)}</strong><p>Incluye publicaciones anteriores</p></div>
    <div><span>Cobrado</span><strong>${pesosClase(r.cobrado)}</strong><p>Historial de pagos registrados</p></div>
  </div>`;
}
function filaOperativaHTML({profesor:p,anuncio:a,estado}){
  const c=costoCampanaClase(a.campana);
  return `<button class="gh-fila" data-campana="${esc(a.id)}" aria-label="Abrir campaña: ${esc(a.titulo)}">
    <span class="gh-fila-identidad"><span class="gh-inicial" aria-hidden="true">${esc(p.nombre.slice(0,1))}</span><span><b>${esc(a.titulo)}</b><small>${esc(p.nombre)} · ${esc(a.ramos_siglas.join(' · '))}</small></span></span>
    ${etiquetaOperativaClase(estado)}<span class="gh-fila-importe">${c?pesosClase(c.total):'—'}<small>Costo estimado</small></span><span class="gh-flecha" aria-hidden="true">↗</span>
  </button>`;
}
function tarjetaMercadoHTML(anuncio,profesor,opciones={}){
  return `<div class="gh-oferta"><div class="gh-profesor-linea"><span class="gh-inicial" aria-hidden="true">${esc(profesor.nombre.slice(0,1))}</span><span>${esc(profesor.nombre)}<small>Profesor aprobado en GradeHub</small></span></div>${tarjetaCatalogoClase(anuncio,opciones)}</div>`;
}
function detalleOperativoHTML(profesor,a,{administrar=true}={}){
  const c=costoCampanaClase(a.campana),estado=estadoOperativoClase(profesor,a);
  const fecha=t=>t?new Date(t).toLocaleDateString('es-CL',{day:'numeric',month:'short',year:'numeric'}):'Al aprobarse';
  const progreso=c&&c.tope?Math.min(100,Math.round(c.total/c.tope*100)):0;
  return `<div class="gh-detalle-cabecera"><p class="gh-ceja">CAMPAÑA · ${esc(a.ramos_siglas.join(' / '))}</p><h2>${esc(a.titulo)}</h2><p>${esc(profesor.nombre)}</p>${etiquetaOperativaClase(estado)}</div>
    ${c?`<section class="gh-presupuesto"><div><span>Costo estimado · publicación actual</span><strong>${pesosClase(c.total)} <small>de ${pesosClase(c.tope)}</small></strong></div><progress max="100" value="${progreso}" aria-label="Presupuesto utilizado"></progress><p>${progreso}% del tope · ${fecha(a.publicado_at)} — ${fecha(a.vence_at)}</p><p class="gh-nota">Durante el piloto no se cobra. Este importe muestra lo que costaría.</p></section>
    <div class="gh-desglose"><div><strong>${a.campana.vistas}</strong><span>La vieron</span></div><div><strong>${a.campana.aperturas}</strong><span>La abrieron</span></div><div><strong>${a.campana.contactos}</strong><span>Contactaron</span></div><div><strong>${a.campana.dias_cobrados}</strong><span>Días publicados</span></div></div>`:''}
    <details class="gh-detalle-seccion"><summary>Ver el anuncio como estudiante</summary>${tarjetaCatalogoClase(a,{abierta:true})}</details>
    ${administrar?`<section class="gh-detalle-seccion"><h3>Cobros e historial</h3><p class="gh-nota">Los cobros registrados se mantienen entre publicaciones.</p>${filaAdminAnuncio(a)}</section>`:''}`;
}
