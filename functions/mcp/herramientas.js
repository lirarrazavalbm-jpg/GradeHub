// Qué puede hacer un agente conectado a GradeHub, declarado en un solo lugar.
//
// Vive separado del endpoint a propósito: el permiso es la parte que no puede
// escaparse por descuido, así que se declara como dato y se comprueba con un
// test, en vez de quedar repartido en los `if` de cada handler.
//
// LA REGLA QUE MANDA: un agente NO escribe notas. Puede verlas todas y puede
// PROPONER una, pero la que queda guardada la acepta el estudiante, con el
// valor y la evaluación a la vista. No es prudencia — es lo que sostiene el
// producto: si una nota puede entrar sin que él la haya visto, su promedio deja
// de ser suyo y ya no hay cómo notar que está mal. Una pauta equivocada se ve
// de un vistazo contra el programa; una nota equivocada, no.
//
// Por eso `proponer_notas` no es una excepción a la regla sino su forma: la
// propuesta nace 'pendiente', no toca el ramo al llegar, y la app la muestra
// completa con aceptar, editar y rechazar. Lo que no existe es un camino que
// escriba una nota sin ese paso.
//
// Lo destructivo tampoco: borrar cuenta, ramos, pautas o notas. Un agente que
// se equivoca al leer un PDF cuesta una corrección; uno que borra, cuesta el
// semestre.

export const HERRAMIENTAS = [
  {
    nombre: 'listar_ramos',
    tipo: 'lectura',
    resumen: 'Los ramos del semestre con su sigla, promedio actual, cuánto llevan evaluado (en %) y si están en riesgo. La sigla viene null cuando no la tenemos guardada.',
  },
  {
    // La primera llamada de cualquier conversación. Existe porque encadenar
    // tres herramientas para saber de qué se está hablando es caro, y lo caro
    // no se llama: el agente contesta con lo que recuerda y se equivoca.
    nombre: 'estado_semestre',
    tipo: 'lectura',
    resumen: 'Todo el semestre en una llamada: promedio general, cada ramo con su nota, cuánto lleva evaluado, si está en riesgo y qué necesita para aprobar, más lo que viene con fecha. Úsala apenas la conversación toque un ramo, una prueba, el promedio o cuánto le falta.',
    args: { dias: 'cuántos días hacia adelante mirar las evaluaciones con fecha (por defecto 14)' },
  },
  {
    // Pensada para que el agente la corra sola, en una tarea programada: es lo
    // que convierte el conector en un mensaje del domingo en vez de una
    // consulta que hay que acordarse de hacer. Por eso viene resumida y no
    // cruda: es lo que el agente necesita para escribir dos frases útiles.
    nombre: 'resumen_para_hoy',
    tipo: 'lectura',
    resumen: 'El resumen corto del momento: qué hay hoy, qué viene en los próximos días, qué ramos están en riesgo, qué evaluaciones ya pasaron y siguen sin nota, y dónde rinde más estudiar. Sirve para el repaso diario o semanal, aunque nadie haya preguntado nada.',
    args: { dias: 'cuántos días hacia adelante mirar (por defecto 7)' },
  },
  {
    // La pregunta que ningún otro dato del estudiante puede contestar: no es
    // qué nota tiene, es qué pasa si le va de cierta forma. El cálculo queda
    // acá por lo mismo que `que_necesito_para_aprobar`: casillas, descartes,
    // compuertas y ramo vinculado ya se equivocaron adentro de la app.
    nombre: 'simular',
    tipo: 'lectura',
    resumen: 'Qué pasaría con un ramo si sacara ciertas notas: promedio final, si aprueba y qué compuertas quedan sin cumplir. No guarda nada. Sin notas, responde la otra mitad: cuánto mueve la nota final cada evaluación que queda, para saber dónde conviene poner las horas.',
    args: {
      ramo: 'nombre o sigla',
      notas: {
        type: 'array',
        description: 'Notas hipotéticas. No se guardan: solo se calcula con ellas.',
        maxItems: 60,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['evaluacion', 'valor'],
          properties: {
            evaluacion: { type: 'string', description: 'Nombre de la evaluación tal como está en el ramo' },
            valor: { type: 'number', description: 'Nota entre 1,0 y 7,0' },
            casilla: { type: 'integer', minimum: 1, maximum: 100, description: 'Cuál de las notas de esa evaluación, si tiene varias' },
          },
        },
      },
      meta: 'nota objetivo para decir si alcanza (por defecto 4,0)',
    },
  },
  {
    nombre: 'ver_ramo',
    tipo: 'lectura',
    resumen: 'Un ramo con sus evaluaciones, ponderaciones y las notas que ya tiene.',
    args: { ramo: 'nombre o sigla' },
  },
  {
    nombre: 'evaluaciones_proximas',
    tipo: 'lectura',
    resumen: 'Qué viene y cuándo, ordenado por fecha, con cuánto pesa cada una.',
    args: { dias: 'cuántos días mirar hacia adelante (por defecto 30)' },
  },
  {
    nombre: 'que_necesito_para_aprobar',
    tipo: 'lectura',
    // El cálculo va del lado de GradeHub y no se deja que el agente lo rehaga
    // con los datos crudos: las casillas declaradas, los descartes, las
    // compuertas y el ramo vinculado son cuatro reglas que ya se equivocaron
    // acá adentro. Un agente que las reinventa se equivoca igual, pero sin
    // tests que lo atajen.
    resumen: 'Qué promedio necesita en lo que le queda de un ramo para llegar a una meta.',
    args: { ramo: 'nombre o sigla', meta: 'nota objetivo (por defecto 4,0)' },
  },
  {
    nombre: 'proponer_pauta',
    tipo: 'propuesta',
    // No aplica nada: deja la pauta esperando y la app la muestra completa la
    // próxima vez que el estudiante abra, para que confirme contra el programa
    // que él mismo subió. Sin ese paso, un peso mal leído queda calculando su
    // promedio durante meses sin que nada falle.
    resumen: 'Propone las evaluaciones y ponderaciones de un ramo, sacadas de un programa. Queda pendiente hasta que el estudiante la confirme en la app.',
    args: {
      ramo: 'nombre o sigla de un ramo que la persona ya tenga agregado',
      evaluaciones: {
        type: 'array',
        description: 'Evaluaciones extraídas del programa. Los pesos deben sumar 100.',
        minItems: 1,
        maxItems: 30,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['nombre', 'peso'],
          properties: {
            nombre: { type: 'string', description: 'Nombre de la evaluación' },
            peso: { type: 'number', description: 'Porcentaje de la nota final' },
            casillas: { type: 'integer', minimum: 2, maximum: 100, description: 'Cantidad de notas que se promedian, si el programa la declara' },
          },
        },
      },
      fuente: 'De qué documento o sección del programa salió la estructura',
    },
  },
  {
    nombre: 'proponer_notas',
    tipo: 'propuesta',
    // Igual que proponer_pauta: deja la propuesta esperando. La diferencia con
    // escribir la nota es la confirmación, así que la confirmación es el
    // producto: la app muestra qué evaluación, qué valor y de dónde salió.
    resumen: 'Propone notas para las evaluaciones de un ramo (por ejemplo, leídas de un correo o de una foto de la pauta). No las guarda: quedan pendientes y el estudiante las acepta, edita o rechaza en la app.',
    args: {
      ramo: 'nombre o sigla de un ramo que la persona ya tenga agregado',
      notas: {
        type: 'array',
        description: 'Notas propuestas, una por evaluación.',
        minItems: 1,
        maxItems: 60,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['evaluacion', 'valor'],
          properties: {
            evaluacion: { type: 'string', description: 'Nombre de la evaluación tal como está en el ramo' },
            valor: { type: 'number', description: 'Nota entre 1,0 y 7,0' },
            casilla: { type: 'integer', minimum: 1, maximum: 100, description: 'Cuál de las notas de esa evaluación, si tiene varias' },
          },
        },
      },
      fuente: 'De dónde salió la nota: el correo, la publicación del curso, la foto',
    },
  },
  {
    nombre: 'proponer_fechas',
    tipo: 'propuesta',
    // El calendario del curso vive en un PDF, en un correo o en una
    // publicación, y transcribir diez fechas a mano es justo lo que nadie hace.
    // Sin fechas la Agenda queda vacía, así que esto es lo que la llena.
    resumen: 'Propone fechas (y hora) para las evaluaciones de un ramo, leídas del calendario del curso. No las guarda: quedan pendientes y el estudiante las acepta, edita o rechaza en la app.',
    args: {
      ramo: 'nombre o sigla de un ramo que la persona ya tenga agregado',
      fechas: {
        type: 'array',
        description: 'Fechas propuestas, una por evaluación.',
        minItems: 1,
        maxItems: 60,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['evaluacion', 'fecha'],
          properties: {
            evaluacion: { type: 'string', description: 'Nombre de la evaluación tal como está en el ramo' },
            fecha: { type: 'string', description: 'Fecha en formato AAAA-MM-DD' },
            hora: { type: 'string', description: 'Hora en formato HH:MM, si el calendario la dice' },
            casilla: { type: 'integer', minimum: 1, maximum: 100, description: 'Cuál de las evaluaciones de ese grupo, si tiene varias (el Control 2, por ejemplo)' },
          },
        },
      },
      fuente: 'De dónde salió el calendario: el programa, el correo, la publicación del curso',
    },
  },
  {
    nombre: 'agregar_ramo',
    tipo: 'escritura',
    resumen: 'Agrega un ramo al semestre. Sin notas: solo el ramo y, si se sabe, su pauta.',
    args: { nombre: 'nombre del ramo', sigla: 'opcional' },
  },
];

// Lo que un agente no puede hacer, escrito para que el test lo pueda comprobar
// y para que quien agregue una herramienta nueva se tope con la lista.
export const PROHIBIDO = [
  // Proponerlas sí. Lo que no existe es un camino que las guarde sin que la
  // persona las haya visto y aceptado en la app.
  'escribir, editar o borrar notas sin que la persona lo confirme',
  'borrar la cuenta',
  'borrar ramos, pautas o evaluaciones',
  'cambiar el correo o la contraseña',
  'leer o modificar datos de otra persona',
];

export const esLectura = h => h.tipo === 'lectura';
export const NOMBRES = HERRAMIENTAS.map(h => h.nombre);

const normalizarNombre = texto => String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Esta comprobación da al agente una respuesta útil antes de llamar a
// Supabase. La RPC repite todas estas reglas: el agente puede saltarse este
// archivo, pero no puede saltarse la frontera del servidor.
// Las notas se validan acá y no en la base: los rangos y los nombres son del
// dominio, y un error tiene que volver como mensaje MCP que el agente pueda
// leer y corregir, no como una excepción de Postgres.
export function validarPropuestaNotas(args) {
  const fuente = String(args && args.fuente || '').trim();
  const notas = args && args.notas;
  if (!fuente) return 'Propuesta inválida: di de dónde salió la nota (el correo, la publicación del curso, la foto).';
  if (!Array.isArray(notas) || notas.length < 1 || notas.length > 60) return 'Propuesta inválida: entrega entre 1 y 60 notas.';
  const vistas = new Set();
  for (const n of notas) {
    const evaluacion = String(n && n.evaluacion || '').trim();
    const valor = Number(n && n.valor);
    const casilla = n && n.casilla;
    if (!evaluacion) return 'Propuesta inválida: cada nota necesita el nombre de su evaluación.';
    // La escala chilena es 1,0 a 7,0. Un 0 o un 8 no es una nota baja o alta:
    // es un dato mal leído, y aceptarlo lo mete en el promedio de alguien.
    if (!Number.isFinite(valor) || valor < 1 || valor > 7) return `Propuesta inválida: "${evaluacion}" tiene una nota fuera de la escala 1,0 a 7,0.`;
    if (casilla != null && (!Number.isInteger(casilla) || casilla < 1 || casilla > 100)) return 'Propuesta inválida: la casilla debe ser un entero entre 1 y 100.';
    const clave = normalizarNombre(evaluacion) + '#' + (casilla == null ? '' : casilla);
    if (vistas.has(clave)) return `Propuesta inválida: hay dos notas para "${evaluacion}" en la misma casilla.`;
    vistas.add(clave);
  }
  return null;
}

// Una fecha se valida por forma y por rango. Lo segundo importa: un año 2019 o
// 2031 en el calendario de un semestre es un dato mal leído, y una fecha mal
// puesta manda una evaluación al fondo de la Agenda o la saca de la vista.
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export function validarPropuestaFechas(args) {
  const fuente = String(args && args.fuente || '').trim();
  const fechas = args && args.fechas;
  if (!fuente) return 'Propuesta inválida: di de dónde salió el calendario (el programa, el correo, la publicación).';
  if (!Array.isArray(fechas) || fechas.length < 1 || fechas.length > 60) return 'Propuesta inválida: entrega entre 1 y 60 fechas.';
  const anioAhora = new Date().getUTCFullYear();
  const vistas = new Set();
  for (const f of fechas) {
    const evaluacion = String(f && f.evaluacion || '').trim();
    const fecha = String(f && f.fecha || '').trim();
    const hora = f && f.hora == null ? null : String(f.hora).trim();
    const casilla = f && f.casilla;
    if (!evaluacion) return 'Propuesta inválida: cada fecha necesita el nombre de su evaluación.';
    if (!FECHA_RE.test(fecha)) return `Propuesta inválida: "${evaluacion}" tiene una fecha que no es AAAA-MM-DD.`;
    const d = new Date(fecha + 'T00:00:00Z');
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) return `Propuesta inválida: "${evaluacion}" tiene una fecha que no existe.`;
    const anio = Number(fecha.slice(0, 4));
    if (anio < anioAhora - 1 || anio > anioAhora + 1) return `Propuesta inválida: "${evaluacion}" cae en ${anio}, fuera del año académico en curso.`;
    if (hora !== null && hora !== '' && !HORA_RE.test(hora)) return `Propuesta inválida: "${evaluacion}" tiene una hora que no es HH:MM.`;
    if (casilla != null && (!Number.isInteger(casilla) || casilla < 1 || casilla > 100)) return 'Propuesta inválida: la casilla debe ser un entero entre 1 y 100.';
    const clave = normalizarNombre(evaluacion) + '#' + (casilla == null ? '' : casilla);
    if (vistas.has(clave)) return `Propuesta inválida: hay dos fechas para "${evaluacion}" en la misma casilla.`;
    vistas.add(clave);
  }
  return null;
}

export function validarPropuestaPauta(args) {
  const fuente = String(args && args.fuente || '').trim();
  const evaluaciones = args && args.evaluaciones;
  if (!fuente) return 'Propuesta inválida: explica de qué documento o sección salió la pauta.';
  if (!Array.isArray(evaluaciones) || evaluaciones.length < 1 || evaluaciones.length > 30) return 'Propuesta inválida: entrega entre 1 y 30 evaluaciones.';
  const nombres = new Set();
  let suma = 0;
  for (const evaluacion of evaluaciones) {
    const nombre = String(evaluacion && evaluacion.nombre || '').trim();
    const peso = Number(evaluacion && evaluacion.peso);
    const casillas = evaluacion && evaluacion.casillas;
    const clave = normalizarNombre(nombre);
    if (!nombre || !Number.isFinite(peso) || peso <= 0 || peso > 100) return 'Propuesta inválida: cada evaluación necesita un nombre y un peso entre 0 y 100.';
    if (nombres.has(clave)) return 'Propuesta inválida: no repitas una evaluación con el mismo nombre.';
    if (casillas != null && (!Number.isInteger(casillas) || casillas < 2 || casillas > 100)) return 'Propuesta inválida: las casillas deben ser un entero entre 2 y 100.';
    nombres.add(clave);suma += peso;
  }
  if (Math.abs(suma - 100) >= 0.05) return `Propuesta inválida: los pesos suman ${suma}; deben sumar 100.`;
  return null;
}
