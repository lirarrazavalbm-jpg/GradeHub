// El catálogo UC se consulta fuera de la app y solo produce un borrador
// revisable. Este test usa HTML sintético: ningún programa ni pauta real queda
// fijado como fixture del repositorio.
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const script = process.env.GRADEHUB_SCRIPT || path.join(raiz, 'bin', 'proponer-pautas-uc.js');
let modulo;
try { modulo = require(script); }
catch (error) {
  console.error('FAIL: el script offline de catálogo UC debe existir y poder importarse.');
  process.exit(1);
}
const { decodificarCatalogo, extraerEstructura, generarBorrador } = modulo;
let fallos = 0;
function chk(nombre, condicion) {
  if (condicion) console.log('OK  ' + nombre);
  else { console.error('FAIL ' + nombre); fallos++; }
}

const conPorcentajes = `<!doctype html><pre>
V. ESTRATEGIAS EVALUATIVAS
- 3 Interrogaciones (60%)
-Pruebas: 30%
-Examen: 10%
VI. BIBLIOGRAFÍA
</pre>`;
const estructura = extraerEstructura(conPorcentajes);
chk('lee formatos con guion, paréntesis y dos puntos', estructura.estado === 'propuesta' && estructura.total === 100);
chk('conserva que el programa declaró tres interrogaciones sin repartir su peso',
  estructura.filas[0].nombre === 'Interrogaciones' && estructura.filas[0].peso === 60 && estructura.filas[0].detalleDetectado?.cantidad === 3);

const desglosado = extraerEstructura(`<!doctype html><pre>
V. ESTRATEGIAS EVALUATIVAS
Evaluaciones sumativas: 60%
Prueba 1: 20%
Prueba 2: 20%
Trabajo: 20%
Examen: 40%
VI. BIBLIOGRAFÍA
</pre>`);
chk('no suma dos veces un agregado cuando sus subítems lo desglosan completo',
  desglosado.estado === 'propuesta' && desglosado.total === 100 && !desglosado.filas.some(f => /sumativas/i.test(f.nombre)));

const sinDatos = extraerEstructura(`<!doctype html><pre>
V. ESTRATEGIAS EVALUATIVAS
Pruebas. Controles en horario de ayudantías.
VI. BIBLIOGRAFÍA
</pre>`);
chk('un programa sin porcentajes queda como sin datos y no como propuesta', sinDatos.estado === 'sin_datos');

const revisar = extraerEstructura(`<!doctype html><pre>
V. ESTRATEGIAS EVALUATIVAS
Prueba: 40%
Examen: 30%
VI. BIBLIOGRAFÍA
</pre>`);
chk('una suma distinta de 100% queda para revisión humana', revisar.estado === 'revisar_a_mano' && revisar.total === 70);

const encabezadoSimple = extraerEstructura(`<!doctype html><pre>
V.EVALUACION DE APRENDIZAJES
-Controles: 30%
-Pruebas: 40%
-Examen: 30%
VI.BIBLIOGRAFÍA
</pre>`);
chk('reconoce el encabezado simple que usa el catálogo de Administración',
  encabezadoSimple.estado === 'propuesta' && encabezadoSimple.total === 100);

const latin1 = Buffer.from('<pre>V. ESTRATEGIAS EVALUATIVAS\n-Evaluación: 100%\nVI. BIBLIOGRAFÍA</pre>', 'latin1');
chk('decodifica el catálogo latino sin degradar la tilde', /Evaluación/.test(decodificarCatalogo(latin1)));

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'gradehub-catalogo-uc-'));
try {
  const fixtures = path.join(temporal, 'html');
  fs.mkdirSync(fixtures);
  fs.writeFileSync(path.join(temporal, 'data.js'), `
    const MALLA_UC={PC:{'1':['Curso sin preset','Curso con preset']}};
    const CREDITOS_UC={'Curso sin preset':[10,'MAT0001'],'Curso con preset':[10,'FIS0001']};
    const PRESETS_UC={'Curso con preset':{periodo:'2026-2',evals:[['Interrogación 1',25],['Interrogación 2',25],['Controles',20],['Examen',30]]}};
  `);
  fs.writeFileSync(path.join(fixtures, 'MAT0001.html'), conPorcentajes);
  fs.writeFileSync(path.join(fixtures, 'FIS0001.html'), `<!doctype html><pre>
    V. ESTRATEGIAS EVALUATIVAS
    Interrogaciones: 60%
    Examen: 40%
    VI. BIBLIOGRAFÍA
  </pre>`);
  (async () => {
    const borrador = await generarBorrador({ dataPath: path.join(temporal, 'data.js'), fixtureDir: fixtures, siglas: null, delay: 0 });
    const propuesta = borrador.propuestas[0];
    chk('solo propone la pauta del curso que no tiene preset', borrador.propuestas.length === 1 && propuesta.sigla === 'MAT0001');
    chk('cada propuesta deja período sin declarar y fuente fechada para revisión',
      propuesta.periodo === null && /catalogo\.uc\.cl/.test(propuesta.fuente.url) && /^\d{4}-\d\d-\d\dT/.test(propuesta.fuente.consultadoEn));
    chk('un preset existente no se pisa y su diferencia queda reportada',
      borrador.existentes.length === 1 && borrador.existentes[0].sigla === 'FIS0001' && borrador.existentes[0].comparacion.coincide === false);
    if (fallos) process.exitCode = 1;
  })().catch(error => { console.error(error); process.exitCode = 1; });
} finally {
  // La promesa termina antes de que Node salga; no borrar estas fixtures antes
  // porque generarBorrador las lee de forma asíncrona.
  process.on('exit', () => fs.rmSync(temporal, { recursive: true, force: true }));
}
