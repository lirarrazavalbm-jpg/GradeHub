// Qué pone la Agenda arriba como "Tu foco ahora".
//
// Esto no lanza excepciones: ordena mal y el estudiante estudia lo que no era.
// El error real que lo motivó: la urgencia iba por tramos y el último era "más
// de 30 días", así que algo a cinco semanas y algo a cuatro meses valían lo
// mismo. Entre dos evaluaciones lejanas solo competía el peso, y un examen de
// 30% en diciembre aparecía como el foco por sobre una interrogación de 15% en
// septiembre.
//
// Se prueba el ORDEN, no el número: el puntaje es un detalle de implementación
// y fijarlo obligaría a reescribir el test cada vez que se ajusta la curva.
const fs = require('fs'), vm = require('vm');
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n');
const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
  requestAnimationFrame: f => setTimeout(() => f(0), 0), cancelAnimationFrame: clearTimeout, performance: { now: () => 0 },
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const withPriority = vm.runInContext('withPriority', ctx);
const estadoEventoAgenda = vm.runInContext('estadoEventoAgenda', ctx);
const funcionAgenda = nombre => vm.runInContext(`typeof ${nombre} === 'function' ? ${nombre} : null`, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// La fecha se arma con los componentes LOCALES, no con toISOString(). Esa
// devuelve UTC: en Chile, pasadas las 20:00, `iso(-1)` daba hoy en vez de ayer
// y los chequeos de "vencida" empezaban a fallar solos. Un test que depende de
// la hora a la que se corre no prueba nada y hace perder la tarde.
const iso = d => {
  const x = new Date(); x.setDate(x.getDate() + d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
// notas: [] deja el ramo sin promedio → riesgo 0. Para un ramo en riesgo se
// pasa una nota baja, que es como llega de verdad desde la app.
const evento = (nombre, dias, peso, notaDelRamo) => {
  const cat = { id: 'c-' + nombre, nombre, peso, notas: [] };
  const otras = notaDelRamo == null ? [] :
    [{ id: 'previa-' + nombre, nombre: 'Previa', peso: 100 - peso, notas: [{ id: 'n', nombre: 'n', valor: notaDelRamo, peso: 1 }] }];
  return { fecha: iso(dias), pending: true, cat, ramo: { id: 'r-' + nombre, nombre: 'Ramo', categorias: [cat, ...otras], gates: [] } };
};
const gana = (a, b) => withPriority(a).score > withPriority(b).score;

console.log('\n=== La cercanía manda; el peso y el riesgo modulan ===');
// El caso exacto que se reportó.
chk('una interrogación de 15% en un mes le gana a un examen de 30% en cuatro',
  gana(evento('I1', 43, 15), evento('Examen', 120, 30)));
chk('y también a otra de 20% a diez semanas',
  gana(evento('I1', 43, 15), evento('I2', 71, 20)));
// La clase de error, no solo ese caso: por lejos que esté, el peso no compra
// el primer lugar. Con la fórmula aditiva anterior, todos estos fallaban.
chk('10% en dos días le gana a 30% en dos semanas',
  gana(evento('cerca', 2, 10), evento('lejos', 14, 30)));
chk('5% hoy le gana a 40% en dos meses',
  gana(evento('hoy', 0, 5), evento('lejos', 60, 40)));
chk('dos lejanas ya no empatan: a igual peso, gana la más cercana',
  gana(evento('a', 45, 20), evento('b', 120, 20)));

console.log('\n=== Una fecha pasada sin nota deja de competir con lo que viene ===');
chk('el Control 1 de 10% de mañana le gana al Lab 1 de 5% de hace cuatro días',
  gana(evento('Control 1', 1, 10), evento('Lab 1', -4, 5)));
chk('esperar una nota no compra prioridad aunque la evaluación fuera pesada',
  gana(evento('proxima', 30, 1), evento('pasada', -1, 100, 2.0)));
chk('a igual fecha, más peso sube', gana(evento('pesada', 7, 30), evento('liviana', 7, 10)));
chk('a igual fecha y peso, el ramo en riesgo sube',
  gana(evento('riesgo', 7, 20, 2.0), evento('sana', 7, 20, 6.5)));

console.log('\n=== El riesgo avisa, pero no convierte diciembre en "ahora" ===');
chk('un ramo reprobado no trae al frente su evaluación a cuatro meses',
  gana(evento('cerca', 25, 10), evento('lejos', 120, 40, 2.0)));

console.log('\n=== El nivel visual sigue midiendo lo mismo ===');
// Los cortes viejos estaban escritos contra los escalones de urgencia (85, 35).
// Al pasar a curva continua, "urgencia>=85" habría cambiado de significar dos
// días a significar cinco sin que nadie lo decidiera.
chk('una fecha pasada sin nota usa un estado neutral de espera',
  withPriority(evento('x', -1, 10)).nivel === 'espera' &&
  withPriority(evento('x', -1, 10)).estadoAgenda === 'esperando_nota');
chk('hasta seis semanas sigue siendo una demora posible de la nota',
  withPriority(evento('x', -42, 10)).estadoAgenda === 'esperando_nota');
chk('después de seis semanas pide revisar el dato sin volver al foco',
  withPriority(evento('x', -43, 10)).nivel === 'revision' &&
  withPriority(evento('x', -43, 10)).estadoAgenda === 'requiere_revision' &&
  gana(evento('proxima', 30, 1), evento('vieja', -90, 100)));
chk('crítica: dos días o menos y 20% o más', withPriority(evento('x', 2, 20)).nivel === 'critica');
chk('alta: dos días o menos con poco peso', withPriority(evento('x', 1, 5)).nivel === 'alta');
chk('alta: ramo reprobado', withPriority(evento('x', 10, 5, 2.0)).nivel === 'alta');
chk('media: dentro de dos semanas', withPriority(evento('x', 14, 5)).nivel === 'media');
chk('baja: lejos y liviana', withPriority(evento('x', 90, 10)).nivel === 'baja');

console.log('\n=== Las dos formas de evaluación reconocen la espera de nota ===');
vm.runInContext(`S={ramos:[{
  id:'formas',nombre:'Ramo',color:'#2563eb',gates:[],categorias:[
    {id:'categoria',nombre:'Lab 1',peso:5,fecha:'${iso(-4)}',directNota:true,notas:[]},
    {id:'grupo',nombre:'Casos',peso:5,directNota:false,notas:[
      {id:'nota-propia',nombre:'Caso 1',valor:null,peso:1,fecha:'${iso(-3)}'}
    ]},
    {id:'proxima',nombre:'Control 1',peso:10,fecha:'${iso(1)}',directNota:true,notas:[]},
    {id:'vieja',nombre:'Evaluación antigua',peso:10,fecha:'${iso(-90)}',directNota:true,notas:[]}
  ]
}]};`, ctx);
const formasPasadas=vm.runInContext('agendaEvents()',ctx).map(withPriority);
chk('la categoría con fecha queda esperando nota',
  formasPasadas.some(e=>e.cat.id==='categoria'&&e.estadoAgenda==='esperando_nota'));
chk('la nota con fecha propia queda esperando nota',
  formasPasadas.some(e=>e.nota&&e.nota.id==='nota-propia'&&e.estadoAgenda==='esperando_nota'));
chk('una evaluación con nota conserva el tercer estado',
  estadoEventoAgenda({...evento('lista',-2,20),pending:false})==='con_nota');
chk('una fecha de hace tres meses queda marcada para revisión',
  formasPasadas.some(e=>e.cat.id==='vieja'&&e.estadoAgenda==='requiere_revision'));
stub.innerHTML='';
vm.runInContext('renderAgenda()',ctx);
const esperaHTML=stub.innerHTML;
const antesDeFechasPasadas=esperaHTML.slice(0,esperaHTML.indexOf('Fechas pasadas sin nota'));
chk('el caso real pone Control 1 en el foco y saca Lab 1 de las prioridades',
  /Tu foco ahora[\s\S]*Control 1/.test(antesDeFechasPasadas)&&!/Lab 1/.test(antesDeFechasPasadas));
chk('las fechas pasadas quedan visibles en un bloque secundario',
  /Fechas pasadas sin nota/.test(esperaHTML)&&/ag-waiting/.test(esperaHTML));
chk('el texto no afirma que la evaluación se rindió',
  /Si ya la rendiste/.test(esperaHTML)&&/Si se movió/.test(esperaHTML));
chk('deja a mano completar la nota o corregir la fecha',
  /Completar nota|Poner nota/.test(esperaHTML)&&/Corregir fecha/.test(esperaHTML));
chk('lo realmente antiguo aparece primero y pide revisar la fecha',
  /ag-waiting-row needs-review[\s\S]*Revisar fecha[\s\S]*Evaluación antigua/.test(esperaHTML));
chk('el resumen deja de acusarlas como vencidas',!/vencida/i.test(esperaHTML));
const cssEspera=fs.readFileSync(__dirname+'/../styles.css','utf8');
chk('la espera no reutiliza el rojo semántico',
  !/\.ag-row-when\.vencida\s*\{[^}]*var\(--red\)/.test(cssEspera)&&
  /\.ag-row-when\.espera\s*\{[^}]*var\(--fg3\)/.test(cssEspera)&&
  !/\.ag-waiting-row\.needs-review\s*\{[^}]*(?:--red|--yellow)/.test(cssEspera));

console.log('\n=== La Agenda permite cambiar el orden sin perder su criterio propio ===');
const ordenarAgenda = funcionAgenda('ordenarAgenda');
const destacadasAgenda = funcionAgenda('destacadasAgenda');
const agendaOrdenHTML = funcionAgenda('agendaOrdenHTML');
const pendientes = [
  evento('cercana', 3, 10),
  evento('pesada', 40, 50),
  evento('intermedia', 12, 20),
].map(withPriority);
const nombres = xs => xs.map(e => e.cat.nombre).join(',');
chk('Recomendado conserva exactamente el orden por score que ya existía',
  !!ordenarAgenda && nombres(ordenarAgenda(pendientes, 'recomendado')) === nombres([...pendientes].sort((a,b)=>b.score-a.score)));
chk('Fecha pone primero lo que ocurre antes',
  !!ordenarAgenda && nombres(ordenarAgenda(pendientes, 'fecha')) === 'cercana,intermedia,pesada');
chk('Peso pone primero el porcentaje más alto',
  !!ordenarAgenda && nombres(ordenarAgenda(pendientes, 'peso')) === 'pesada,intermedia,cercana');
chk('las dos destacadas salen del criterio completo de fecha, peso y nota necesaria',
  !!destacadasAgenda && destacadasAgenda(pendientes).length === 2 &&
  nombres(destacadasAgenda(pendientes)) === nombres([...pendientes].sort((a,b)=>b.score-a.score).slice(0,2)));

const controles = agendaOrdenHTML ? agendaOrdenHTML('recomendado') : '';
chk('el selector ofrece Recomendado, Fecha y Peso',
  /Recomendado/.test(controles) && />Fecha</.test(controles) && />Peso</.test(controles));
chk('el orden activo se expone a tecnologías de asistencia',
  /aria-pressed="true"/.test(controles) && /role="group"/.test(controles));
// El control de orden dejó de tener franja propia: ahora viaja en la misma
// línea del encabezado "Próximos 7 días". Las comprobaciones de antes fijaban
// la forma vieja —la etiqueta "Orden", el grid de tres columnas, la media query
// que escondía la etiqueta en teléfono— y esa forma es justamente la que la
// cola pedía cambiar por ocupar demasiado. Lo que se sigue protegiendo es la
// intención, no el marcado.
const cssAgenda = fs.readFileSync(__dirname + '/../styles.css', 'utf8');
const reglaCSSAgenda = selector => {
  const literal=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp('(^|[\\n}{])('+literal+')\\{').exec(cssAgenda);
  const exacto=match?match.index+match[1].length:-1;
  return exacto<0?'':cssAgenda.slice(exacto,cssAgenda.indexOf('}',exacto)+1);
};
const reglaOpciones = reglaCSSAgenda('.ag-order-options');
const reglaOpcion = reglaCSSAgenda('.ag-order-option');
const reglaActiva = reglaCSSAgenda('.ag-order-option.active');
const reglaEncabezado = reglaCSSAgenda('.ag-week-hd .ag-order-options');

chk('el control no ocupa una franja propia: va dentro del encabezado',
  !/\.ag-order\{/.test(cssAgenda) && !/class="ag-order"/.test(controles));
chk('y se va al extremo, después del título y el conteo',
  /margin-left:auto/.test(reglaEncabezado));
chk('el grupo no le impone un ancho fijo a la fila',
  !/(?:width|flex-basis):\s*\d+px/.test(reglaOpciones));
chk('los tres botones ocupan columnas iguales sin escribir un ancho fijo',
  /display:inline-grid/.test(reglaOpciones) && /grid-template-columns:repeat\(3,1fr\)/.test(reglaOpciones));
chk('Recomendado no puede cortarse ni desbordarse hacia el botón vecino',
  /white-space:nowrap/.test(reglaOpcion) && /min-width:max-content/.test(reglaOpcion));
// Delgado, pero no tanto como para no poder tocarlo. 34px es el patrón de un
// segmented control —iOS usa 32— y equivocarse cambia una vista, no borra nada.
const altoOpcion=Number((reglaOpcion.match(/min-height:(\d+)px/)||[])[1]);
chk('el control secundario queda delgado sin volverse intocable',
  altoOpcion>=32 && altoOpcion<=36);
// El semáforo de esta app significa aprobado / al borde / reprobado. El nivel de
// urgencia mide otra cosa —pocos días y harto peso— y llegó a pintarse con los
// mismos rojo y ámbar: "Tu foco ahora" en rojo se lee como "vas mal en esta
// evaluación", que puede ser falso. Es la confusión exacta que la regla del
// semáforo existe para evitar, y por eso queda fijada.
const rankCritica = reglaCSSAgenda('.ag-priority-rank.critica');
const rankAlta = reglaCSSAgenda('.ag-priority-rank.alta');
chk('la urgencia no se pinta con el rojo del semáforo',
  !/var\(--red\)/.test(rankCritica) && !/var\(--red\)/.test(rankAlta));
chk('ni con el ámbar',
  !/var\(--yellow\)/.test(rankCritica) && !/var\(--yellow\)/.test(rankAlta));
// Y sigue estando en el dato, porque es lo que ordena la lista.
chk('el nivel se conserva para ordenar', withPriority(evento('x', 2, 20)).nivel === 'critica');

chk('el activo se distingue por superficie, contorno y acento',
  /background:var\(--card\)/.test(reglaActiva) && /box-shadow:/.test(reglaActiva) && /color:var\(--primary\)/.test(reglaActiva));

console.log('\n=== Completar fechas sigue disponible sin competir con las prioridades ===');
vm.runInContext(`S={ramos:[{
  id:'agenda-ui',nombre:'Ramo agenda',color:'#2563eb',gates:[],categorias:[
    {id:'con-fecha',nombre:'Prueba fechada',peso:30,fecha:'${iso(3)}',notas:[]},
    {id:'sin-fecha',nombre:'Prueba sin fecha',peso:20,notas:[]}
  ]
}]};`, ctx);
stub.innerHTML = '';
vm.runInContext('renderAgenda()', ctx);
chk('el bloque sin fecha se renderiza después de las evaluaciones destacadas',
  stub.innerHTML.indexOf('ag-undated') > stub.innerHTML.indexOf('ag-priority-grid'));

console.log('\n=== Cada evaluación explica lo justo sin convertir la Agenda en otro dashboard ===');
const siguienteEvaluacionAgenda = funcionAgenda('siguienteEvaluacionAgenda');
const referenciaEvaluacionAgenda = funcionAgenda('referenciaEvaluacionAgenda');
const detalleEvaluacionAgendaHTML = funcionAgenda('detalleEvaluacionAgendaHTML');
const proximoDetalleAgenda = funcionAgenda('proximoDetalleAgenda');
const detalleActual = withPriority(evento('actual', 3, 25, 3.5));
const detalleSiguiente = withPriority(evento('siguiente', 8, 20));
const detalleLejano = withPriority(evento('lejano', 20, 40));
const cronologia = [detalleLejano, detalleActual, detalleSiguiente];
chk('qué viene después se decide por fecha aunque la Agenda esté ordenada por peso',
  !!siguienteEvaluacionAgenda && siguienteEvaluacionAgenda(detalleActual, cronologia).cat.nombre === 'siguiente');
const referencia = referenciaEvaluacionAgenda ? referenciaEvaluacionAgenda(detalleActual) : null;
chk('la meta no promete una nota exacta para una evaluación cuando depende de varias',
  !!referencia && /promedio en lo pendiente/i.test(referencia.texto) && !/en esta evaluación/i.test(referencia.texto));
const detalleHTML = detalleEvaluacionAgendaHTML ? detalleEvaluacionAgendaHTML(detalleActual, cronologia) : '';
chk('el detalle prioriza la referencia académica y la evaluación siguiente',
  /Tu referencia/.test(detalleHTML) && /Después/.test(detalleHTML) && /siguiente/.test(detalleHTML));
chk('el peso no se repite dentro del detalle porque ya está visible en la tarjeta',
  !/>25%</.test(detalleHTML));
chk('el detalle conserva un acceso explícito al ramo',
  /Ver ramo/.test(detalleHTML));
chk('abrir otra evaluación reemplaza la anterior y tocar la misma la cierra',
  !!proximoDetalleAgenda && proximoDetalleAgenda('uno', 'dos') === 'dos' && proximoDetalleAgenda('uno', 'uno') === null);

const eventoRendido={...evento('ya-rendida',-3,20),pending:false,notas:[{id:'nota-rendida',nombre:'I1',valor:5.4,peso:1}]};
const detalleRendido=detalleEvaluacionAgendaHTML ? detalleEvaluacionAgendaHTML(eventoRendido,[detalleSiguiente]) : '';
chk('una evaluación rendida explica la nota registrada, no una meta que ya no necesita',
  /Nota registrada/.test(detalleRendido) && /5\.4/.test(detalleRendido) && !/para aprobar/.test(detalleRendido));
chk('una evaluación rendida mantiene la próxima evaluación a mano',
  /Después/.test(detalleRendido) && /siguiente/.test(detalleRendido));
const agendaRendidaHTML=funcionAgenda('agendaRendidaHTML');
chk('la fila rendida sigue siendo un botón nativo para abrir y cerrar con teclado',
  !!agendaRendidaHTML && /<button type="button"/.test(agendaRendidaHTML(eventoRendido)));
const agendaEventoKey = funcionAgenda('agendaEventoKey');
const mismoGrupoA={...evento('caso',3,10),nota:{id:'caso-a',nombre:'Caso 1',valor:null,peso:1}};
const mismoGrupoB={...evento('caso',5,10),nota:{id:'caso-b',nombre:'Caso 2',valor:null,peso:1}};
chk('dos evaluaciones fechadas de una misma categoría no comparten panel desplegable',
  !!agendaEventoKey && agendaEventoKey(mismoGrupoA)!==agendaEventoKey(mismoGrupoB));

const toggleAgendaDetalle = funcionAgenda('toggleAgendaDetalle');
let segundoTop = 300, desplazamiento = null;
const detalleUno = { hidden: true }, detalleDos = { hidden: true };
const botonFalso = top => ({ atributos: {}, setAttribute(k,v) { this.atributos[k]=v; }, getBoundingClientRect() { return { top: top() }; } });
const botonUno = botonFalso(() => 120), botonDos = botonFalso(() => segundoTop);
const itemFalso = (key, boton, detalle, alCerrar) => {
  const clases = new Set();
  const item = {
    dataset: { agendaKey: key }, firstElementChild: boton,
    classList: { toggle(nombre, activo) { const tenia=clases.has(nombre); activo?clases.add(nombre):clases.delete(nombre); if(tenia&&!activo&&alCerrar)alCerrar(); } },
    querySelector() { return detalle; },
  };
  boton.closest = () => item;
  return item;
};
const itemUno = itemFalso('uno', botonUno, detalleUno, () => { segundoTop-=150; });
const itemDos = itemFalso('dos', botonDos, detalleDos);
const bodyAgendaFalso = { querySelectorAll() { return [itemUno,itemDos]; } };
ctx.document.getElementById = id => id === 'agenda-body' ? bodyAgendaFalso : stub;
ctx.window.scrollBy = (_x,y) => { desplazamiento=y; };
ctx.requestAnimationFrame = f => f();
if(toggleAgendaDetalle){ toggleAgendaDetalle(botonUno); toggleAgendaDetalle(botonDos); }
chk('en el DOM solo queda un detalle abierto y aria-expanded refleja el estado',
  detalleUno.hidden && !detalleDos.hidden && botonUno.atributos['aria-expanded'] === 'false' && botonDos.atributos['aria-expanded'] === 'true');
chk('cerrar una tarjeta anterior compensa el salto de la evaluación recién tocada',
  desplazamiento === -150);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
