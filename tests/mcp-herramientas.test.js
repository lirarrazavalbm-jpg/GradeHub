// Las seis herramientas del MCP, incluidos los caminos que no son el feliz.
//
// Nace de una auditoría del conector el 2026-09-12. El hallazgo que la motivó:
// `listar_ramos` prometía en su descripción "promedio actual, cuánto llevan
// evaluado y si están en riesgo" y devolvía nombre, créditos y un conteo. Nada
// falla cuando eso pasa —el agente recibe un JSON válido— y el resultado es que
// contesta sobre datos que no tiene.
//
// Lo segundo: un ramo inexistente salía dentro de un resultado EXITOSO con una
// clave `error` adentro. Para un cliente MCP eso es una respuesta válida.
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// `estado` es lo que devuelve la RPC agente_datos: el estado del dueño de ESE
// token y de nadie más. `null` simula token vencido o revocado.
function servidor(estado) {
  const llamadas = [];
  const ctx = {
    console, Response, structuredClone,
    HERRAMIENTAS: [], NOMBRES: ['estado_semestre', 'simular', 'listar_ramos', 'ver_ramo', 'evaluaciones_proximas', 'que_necesito_para_aprobar', 'proponer_pauta', 'agregar_ramo'],
    validarPropuestaPauta: () => null,
    fetch: async (url, options) => { llamadas.push({ url, options }); return { ok: true, json: async () => structuredClone(estado) }; },
    module: { exports: {} }, exports: {},
  };
  vm.createContext(ctx);
  vm.runInContext(leer('engine.js'), ctx, { filename: 'engine.js' });
  ctx.motorCompartido = { gh_crearCalculoRamo: ctx.module.exports.gh_crearCalculoRamo };
  const src = leer('functions/mcp/[[ruta]].js').replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
  vm.runInContext(src + '\n;globalThis.__mcp={onRequestPost};', ctx, { filename: 'mcp.js' });
  return { llamadas, llamar: ctx.__mcp.onRequestPost };
}
const TOKEN = 'c'.repeat(64);
async function tool(estado, name, args) {
  const s = servidor(estado);
  const r = await s.llamar({
    params: { ruta: [TOKEN] },
    request: { json: async () => ({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args || {} } }) },
  });
  return { cuerpo: await r.json(), llamadas: s.llamadas };
}
const salida = c => JSON.parse(c.result.content[0].text);

// Un ramo con 60% rendido (dos notas) y 40% pendiente.
const ramo = (nombre, notas, extra = {}) => ({
  id: nombre, nombre, gates: [], origen: { tenant: 'uc', ramoKey: extra.ramoKey || nombre }, creditos: 10,
  categorias: [
    { id: nombre + 'a', nombre: 'Prueba 1', peso: 30, directNota: true, notas: [{ id: nombre + 'n1', nombre: 'Prueba 1', valor: notas[0], peso: 1 }] },
    { id: nombre + 'b', nombre: 'Prueba 2', peso: 30, directNota: true, notas: [{ id: nombre + 'n2', nombre: 'Prueba 2', valor: notas[1], peso: 1 }] },
    { id: nombre + 'c', nombre: 'Examen', peso: 40, directNota: true, fecha: '2099-01-01', notas: [] },
  ], ...extra,
});

(async () => {
  console.log('=== listar_ramos entrega lo que su descripción promete ===');
  const estado = { ramos: [ramo('Dinámica', [5.5, 6.0], { ramoKey: 'FIS1514' })] };
  let { cuerpo } = await tool(estado, 'listar_ramos');
  const fila = salida(cuerpo)[0];
  chk('trae el promedio actual', typeof fila.promedio === 'number');
  chk('trae cuánto lleva evaluado, en %', fila.avanceEvaluado === 60);
  chk('trae el riesgo', typeof fila.riesgo === 'string');
  chk('trae la sigla cuando se puede derivar', fila.sigla === 'FIS1514');
  chk('el conteo ya no se llama igual que el array de ver_ramo',
    fila.cantidadEvaluaciones === 3 && fila.evaluaciones === undefined);
  // La descripción es el contrato: si promete un dato, el dato tiene que venir.
  const desc = leer('functions/mcp/herramientas.js');
  const resumen = (desc.match(/nombre: 'listar_ramos'[\s\S]*?resumen: '([^']*)'/) || [])[1] || '';
  chk('la descripción nombra promedio, avance, riesgo y sigla',
    /promedio/i.test(resumen) && /evaluado/i.test(resumen) && /riesgo/i.test(resumen) && /sigla/i.test(resumen));

  console.log('\n=== La sigla no se inventa ===');
  ({ cuerpo } = await tool({ ramos: [ramo('Ramo A Mano', [4, 4], { ramoKey: 'ramo a mano' })] }, 'listar_ramos'));
  chk('sin código oficial guardado, viene null', salida(cuerpo)[0].sigla === null);

  console.log('\n=== Los cuatro estados de riesgo, con los umbrales de la app ===');
  const riesgoDe = async r => salida((await tool({ ramos: [r] }, 'listar_ramos')).cuerpo)[0].riesgo;
  chk('sin notas → sin_notas', await riesgoDe(ramo('X', [null, null])) === 'sin_notas');
  chk('promedio bajo 5,0 → en_riesgo', await riesgoDe(ramo('Y', [4.0, 4.2])) === 'en_riesgo');
  chk('promedio sobre 5,0 → bien', await riesgoDe(ramo('Z', [6.0, 6.5])) === 'bien');
  chk('exigencia sobre 7,05 → ya_no_alcanza', await riesgoDe(ramo('W', [1.0, 1.0])) === 'ya_no_alcanza');

  console.log('\n=== Un ramo que no existe llega como error, no como dato ===');
  ({ cuerpo } = await tool(estado, 'ver_ramo', { ramo: 'Ramo Inventado' }));
  chk('ver_ramo marca isError', cuerpo.result.isError === true);
  chk('y dice cuáles sí existen', salida(cuerpo).ramos.includes('Dinámica'));
  ({ cuerpo } = await tool(estado, 'que_necesito_para_aprobar', { ramo: 'No Existe' }));
  chk('que_necesito_para_aprobar también', cuerpo.result.isError === true);
  ({ cuerpo } = await tool(estado, 'que_necesito_para_aprobar', { ramo: 'Dinámica', meta: 9 }));
  chk('una meta fuera de la escala 1-7 también', cuerpo.result.isError === true);

  console.log('\n=== Y un caso feliz sigue sin marcarse como error ===');
  ({ cuerpo } = await tool(estado, 'ver_ramo', { ramo: 'Dinámica' }));
  chk('ver_ramo de un ramo real no lleva isError', cuerpo.result.isError === undefined);
  chk('trae sus evaluaciones como array', Array.isArray(salida(cuerpo).evaluaciones));
  ({ cuerpo } = await tool(estado, 'evaluaciones_proximas', { dias: 30 }));
  chk('evaluaciones_proximas devuelve una lista', Array.isArray(salida(cuerpo)));

  console.log('\n=== estado_semestre: todo el semestre en una llamada ===');
  {
    const conCreditos = { ramos: [ramo('Dinámica', [5.5, 6.0], { ramoKey: 'FIS1514' }), ramo('Cálculo II', [3.0, 3.5], { ramoKey: 'MAT1620' })] };
    ({ cuerpo } = await tool(conCreditos, 'estado_semestre'));
    const e = salida(cuerpo);
    chk('trae los dos ramos con promedio, avance, riesgo y sigla',
      e.ramos.length === 2 && e.ramos.every(r => typeof r.promedio === 'number' && r.avanceEvaluado === 60 && r.riesgo && 'sigla' in r));
    chk('contesta lo mismo que que_necesito_para_aprobar, sin pedirlo ramo por ramo',
      e.ramos[0].necesitaParaAprobar === salida((await tool(conCreditos, 'que_necesito_para_aprobar', { ramo: 'Dinámica' })).cuerpo).promedioNecesario);
    chk('el ramo con promedio bajo 5,0 sale en la lista de atención',
      e.atencion.includes('Cálculo II') && !e.atencion.includes('Dinámica'));
    chk('el promedio general se pondera por créditos cuando todos los tienen',
      e.promedioGeneral.modo === 'creditos' && Math.abs(e.promedioGeneral.valor - 4.5) < 0.001 && e.promedioGeneral.ramosConNota === 2);
    // La misma regla que gpa() en app.js: si a UNO le faltan créditos, el
    // promedio cae a simple en vez de ponderar con datos a medias.
    const sinCreditos = { ramos: [ramo('Dinámica', [5.5, 6.0]), { ...ramo('Cálculo II', [3.0, 3.5]), creditos: null }] };
    chk('y cae a simple si a un ramo con nota le faltan los créditos',
      salida((await tool(sinCreditos, 'estado_semestre')).cuerpo).promedioGeneral.modo === 'simple');
    // El laboratorio ya está contado dentro de Dinámica: contarlo aparte le
    // daba al mismo ramo dos votos en el promedio general.
    const conLab = { ramos: [{ ...ramo('Dinámica', [5.5, 6.0]), aporta: { ramo: 'Laboratorio de Dinámica', peso: 30, min: 4 } }, { ...ramo('Laboratorio de Dinámica', [7, 7]), creditos: 0 }] };
    chk('el ramo que aporta su nota a otro no entra dos veces al promedio',
      salida((await tool(conLab, 'estado_semestre')).cuerpo).promedioGeneral.ramosConNota === 1);
    ({ cuerpo } = await tool(conCreditos, 'estado_semestre', { dias: 1 }));
    chk('la ventana de fechas se respeta: el examen de 2099 no entra en 1 día',
      salida(cuerpo).proximas.length === 0 && salida(cuerpo).ventanaDias === 1);
  }

  console.log('\n=== simular: qué pasaría, sin guardar nada ===');
  {
    const estadoSim = { ramos: [ramo('Dinámica', [5.5, 6.0])] };
    ({ cuerpo } = await tool(estadoSim, 'simular', { ramo: 'Dinámica', notas: [{ evaluacion: 'Examen', valor: 2.0 }] }));
    const s1 = salida(cuerpo);
    chk('un 2,0 en el examen baja la nota final pero todavía aprueba',
      Math.abs(s1.promedioSimulado - 4.25) < 0.001 && s1.promedioSimulado < s1.promedioActual && s1.alcanzaLaMeta === true);
    chk('y con meta 5,0 el mismo escenario dice que no alcanza',
      salida((await tool(estadoSim, 'simular', { ramo: 'Dinámica', notas: [{ evaluacion: 'Examen', valor: 2.0 }], meta: 5 })).cuerpo).alcanzaLaMeta === false);
    const { llamadas: ll } = await tool(estadoSim, 'simular', { ramo: 'Dinámica', notas: [{ evaluacion: 'Examen', valor: 7 }] });
    chk('no escribe: la única llamada a Supabase es la de leer el estado',
      ll.length === 1 && ll[0].url.endsWith('/agente_datos'));
    ({ cuerpo } = await tool(estadoSim, 'simular', { ramo: 'Dinámica', notas: [{ evaluacion: 'Control sorpresa', valor: 5 }] }));
    chk('una evaluación que no existe se avisa con la lista de las que sí',
      /No encontré "Control sorpresa"/.test(salida(cuerpo).error) && /Prueba 1/.test(salida(cuerpo).error));
    ({ cuerpo } = await tool(estadoSim, 'simular', { ramo: 'Dinámica', notas: [{ evaluacion: 'Examen', valor: 9 }] }));
    chk('una nota fuera de la escala 1,0–7,0 se rechaza', /fuera de la escala/.test(salida(cuerpo).error));

    console.log('\n=== simular sin notas: dónde rinde estudiar ===');
    ({ cuerpo } = await tool(estadoSim, 'simular', { ramo: 'Dinámica' }));
    const imp = salida(cuerpo).impacto;
    chk('lista solo lo que queda pendiente', imp.length === 1 && imp[0].evaluacion === 'Examen');
    chk('dice cuánto mueve la nota final entre el mejor y el peor caso',
      Math.abs(imp[0].mueveLaFinal - 2.4) < 0.001 && imp[0].notaFinalSiSacas7 > imp[0].notaFinalSiSacas1);
    chk('y marca la evaluación que decide si aprueba', imp[0].decideAprobar === true);
    // Con dos pendientes, la que pesa más va primero: es el orden en que
    // conviene repartir las horas, y por eso no se devuelve en orden de pauta.
    const dos = { ramos: [{ ...ramo('X', [null, null]) }] };
    const impDos = salida((await tool(dos, 'simular', { ramo: 'X' })).cuerpo).impacto;
    chk('ordena por cuánto mueve la final, no por el orden de la pauta',
      impDos[0].evaluacion === 'Examen' && impDos[0].mueveLaFinal >= impDos[1].mueveLaFinal);
    // Sin el supuesto, con todo pendiente cada evaluación movería la final
    // entera —el promedio de lo rendido sería esa sola nota— y las tres
    // empatarían en 6,0. El número tiene que separar el examen de 40% de una
    // prueba de 30%.
    chk('y el supuesto hace comparables los números: 2,4 el examen, 1,8 cada prueba',
      Math.abs(impDos[0].mueveLaFinal - 2.4) < 0.001 && Math.abs(impDos[1].mueveLaFinal - 1.8) < 0.001);
  }

  console.log('\n=== Token vencido o revocado corta todo ===');
  for (const name of ['listar_ramos', 'ver_ramo', 'que_necesito_para_aprobar', 'proponer_pauta', 'agregar_ramo']) {
    const { cuerpo: c } = await tool(null, name, { ramo: 'Dinámica' });
    chk(`${name} con token muerto → error y sin datos`, !!c.error && c.result === undefined);
  }

  console.log('\n=== Una herramienta que no está en la lista blanca no corre ===');
  ({ cuerpo } = await tool(estado, 'borrar_todo'));
  chk('se rechaza por nombre', cuerpo.error && cuerpo.error.code === -32601);

  console.log('\n=== La consulta a la base no lleva user_id de la petición ===');
  const { llamadas } = await tool(estado, 'listar_ramos');
  const cuerpoRpc = JSON.parse(llamadas[0].options.body);
  chk('solo viaja el token', JSON.stringify(Object.keys(cuerpoRpc)) === '["p_token"]');
  chk('y es el de la ruta', cuerpoRpc.p_token === TOKEN);

  console.log('\n=== proponer_pauta valida del lado del servidor ===');
  const val = leer('functions/mcp/herramientas.js');
  chk('rechaza pesos que no suman 100', /suman \$\{suma\}; deben sumar 100/.test(val));
  chk('rechaza nombres repetidos', /no repitas una evaluación/.test(val));
  chk('exige decir de dónde salió', /explica de qué documento/.test(val));

  console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
  process.exit(fail ? 1 : 0);
})();
