// Qué puede hacer un agente conectado a GradeHub, declarado en un solo lugar.
//
// Vive separado del endpoint a propósito: el permiso es la parte que no puede
// escaparse por descuido, así que se declara como dato y se comprueba con un
// test, en vez de quedar repartido en los `if` de cada handler.
//
// LA REGLA QUE MANDA: un agente NO escribe notas. Puede verlas todas, pero la
// nota la teclea el estudiante. No es prudencia — es lo que sostiene el
// producto: si una nota puede entrar sin que él la haya puesto, su promedio
// deja de ser suyo y ya no hay cómo notar que está mal. Una pauta equivocada se
// ve de un vistazo contra el programa; una nota equivocada, no.
//
// Lo destructivo tampoco: borrar cuenta, ramos, pautas o notas. Un agente que
// se equivoca al leer un PDF cuesta una corrección; uno que borra, cuesta el
// semestre.

export const HERRAMIENTAS = [
  {
    nombre: 'listar_ramos',
    tipo: 'lectura',
    resumen: 'Los ramos del semestre con su promedio actual, cuánto llevan evaluado y si están en riesgo.',
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
    args: { ramo: 'nombre o sigla', evaluaciones: '[{nombre, peso, casillas}]', fuente: 'de dónde salió' },
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
  'escribir, editar o borrar notas',
  'borrar la cuenta',
  'borrar ramos, pautas o evaluaciones',
  'cambiar el correo o la contraseña',
  'leer o modificar datos de otra persona',
];

export const esLectura = h => h.tipo === 'lectura';
export const NOMBRES = HERRAMIENTAS.map(h => h.nombre);
