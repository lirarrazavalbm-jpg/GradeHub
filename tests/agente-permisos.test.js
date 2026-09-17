// Lo que un agente conectado puede y no puede hacer con la cuenta de alguien.
//
// El permiso está declarado como dato en functions/mcp/herramientas.js en vez de
// repartido en los `if` del endpoint, justamente para que se pueda comprobar
// acá. La regla que sostiene todo: un agente ve las notas y no las escribe. Si
// una nota puede entrar sin que el estudiante la teclee, su promedio deja de ser
// suyo y no hay manera de que note que está mal.
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

// El módulo es ESM (Pages Functions lo son) y este runner es CommonJS: se
// evalúa quitando los `export`, que es lo único que lo separa de un script.
const ctx = { module: {}, exports: {} };
vm.createContext(ctx);
vm.runInContext(leer('functions/mcp/herramientas.js').replace(/^export (const|function)/gm, '$1'), ctx);
const HERRAMIENTAS = vm.runInContext('HERRAMIENTAS', ctx);
const PROHIBIDO = vm.runInContext('PROHIBIDO', ctx);
const endpoint = leer('functions/mcp/[[ruta]].js');
const sql = leer('supabase/agente_mcp.sql');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('=== Ninguna herramienta ESCRIBE notas ===');
// Buscar la palabra "nota" en el resumen no sirve: `agregar_ramo` dice "Sin
// notas" justamente para aclarar que no las toca. Lo que se comprueba es la
// forma —qué argumentos recibe una herramienta capaz de escribir— y el verbo,
// que es donde se declararía la capacidad.
//
// `proponer_notas` recibe notas a propósito y no viola la regla: su tipo es
// 'propuesta', o sea que deja una fila pendiente y no toca el ramo. La regla
// nunca fue "el agente no nombra notas" sino "la nota que queda guardada la
// acepta el estudiante". Lo que sigue prohibido, y es lo que este test cuida,
// es que una herramienta de ESCRITURA reciba una nota: ahí sí entraría sola.
const recibeNota = HERRAMIENTAS.filter(h =>
  h.tipo === 'escritura' && Object.keys(h.args || {}).some(a => /^(nota|notas|valor|calificacion)$/i.test(a)));
chk('ninguna herramienta de escritura recibe una nota como argumento', recibeNota.length === 0);
if (recibeNota.length) recibeNota.forEach(h => console.log('       → ' + h.nombre));
const declaraEscribirNotas = HERRAMIENTAS.filter(h =>
  h.tipo === 'escritura' && /(agrega|guarda|escribe|registra|pone|ingresa)[^.]{0,30}\bnotas?\b/i.test(h.resumen));
chk('ninguna de escritura declara que agrega o guarda notas', declaraEscribirNotas.length === 0);

// Y la otra mitad de la regla: una herramienta que recibe notas TIENE que ser
// una propuesta. Sin esto, cambiarle el tipo a 'escritura' a proponer_notas
// pasaría sin que nada se queje.
const conNotas = HERRAMIENTAS.filter(h => Object.keys(h.args || {}).some(a => /^(nota|notas|valor|calificacion)$/i.test(a)));
chk('ninguna herramienta que recibe notas es de escritura',
  conNotas.length > 0 && conNotas.every(h => h.tipo === 'propuesta' || h.tipo === 'lectura'));
// Y tiene que decirle al agente que no las está guardando, porque es lo único
// que lo frena de prometerle al estudiante que ya quedaron. Vale igual para las
// hipotéticas de `simular`: recibe notas para calcular con ellas y botarlas.
chk('y su resumen dice que no las guarda',
  conNotas.every(h => /no las guarda|no guarda|queda[n]? pendiente|acepta|confirm/i.test(h.resumen)));
// La que recibe notas SIN ser propuesta solo puede ser de lectura, y lo que
// las lecturas pueden hacer está acotado por dónde se despachan: `despachar()`
// recibe el estado ya autorizado y los argumentos, nunca el token, así que
// ninguna de ellas tiene con qué escribir en Supabase aunque quisiera.
const fuenteEndpoint = fs.readFileSync(path.join(raiz, 'functions/mcp/[[ruta]].js'), 'utf8');
chk('las lecturas no reciben el token: no tienen con qué escribir',
  conNotas.filter(h => h.tipo === 'lectura').every(h => new RegExp(`if \\(nombre === '${h.nombre}'\\)`).test(fuenteEndpoint)) &&
  /function despachar\(nombre, estado, args\)/.test(fuenteEndpoint));
if (declaraEscribirNotas.length) declaraEscribirNotas.forEach(h => console.log('       → ' + h.nombre));
chk('la lista de lo prohibido nombra las notas', PROHIBIDO.some(p => /notas/i.test(p)));
chk('y nombra el borrado de la cuenta', PROHIBIDO.some(p => /borrar la cuenta/i.test(p)));

console.log('\n=== Nada destructivo, ni por descuido ===');
const destructivas = HERRAMIENTAS.filter(h => /\b(borrar|eliminar|quitar|vaciar)\b/i.test(h.nombre + ' ' + h.resumen));
chk('ninguna herramienta borra nada', destructivas.length === 0);
chk('el SQL no expone una función de borrado al agente',
  !/grant execute on function public\.(borrar|eliminar)/i.test(sql));

console.log('\n=== La pauta se propone, no se aplica ===');
const pauta = HERRAMIENTAS.find(h => h.nombre === 'proponer_pauta');
chk('proponer_pauta existe y es una propuesta, no una escritura', !!pauta && pauta.tipo === 'propuesta');
chk('y dice que espera la confirmación del estudiante', !!pauta && /confirm/i.test(pauta.resumen));

console.log('\n=== El endpoint solo despacha lo declarado ===');
chk('valida contra la lista de nombres', /NOMBRES\.includes\(nombre\)/.test(endpoint));
chk('el token no viaja en el cuerpo ni se acepta un user_id de fuera',
  !/params\.\s*user_?id/i.test(endpoint) && /params\.ruta/.test(endpoint));
chk('sin clave de servicio', !/sb_secret_/.test(endpoint));

console.log('\n=== El token caduca y se puede cortar ===');
chk('la vinculación vence', /expires_at/.test(sql) && /expires_at > now\(\)/.test(sql));
chk('el código de vinculación es de un solo uso', /delete from public\.agent_link_codes where codigo/.test(sql));
chk('hay cómo revocar desde la app', /create or replace function public\.revocar_agente/.test(sql));
chk('y las tablas mueren con la cuenta', (sql.match(/on delete cascade/gi) || []).length >= 2);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
