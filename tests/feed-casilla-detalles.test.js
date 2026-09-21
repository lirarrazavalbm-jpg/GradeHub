// Tres cosas que quedaron después de #407, que hizo que una casilla con fecha
// propia llegara al calendario. Las tres son sobre lo que el calendario DICE,
// no sobre si el evento aparece.
//
// La referencia es la Agenda: el .ics que se descarga sale de `agendaEvents`, y
// el feed suscribible lo rearma en SQL. Cuando los dos no dicen lo mismo, el
// calendario del estudiante muestra algo que la app no muestra.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const leer = f => fs.readFileSync(raiz + f, 'utf8');
let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const sql = leer('supabase/calendar_feed.sql'), app = leer('app.js'), fn = leer('functions/cal/[token].js');

console.log('=== La fecha del grupo no se duplica ===');
// Con las tres casillas fechadas, la fecha del grupo mostraría un cuarto evento
// que es el mismo en otro día. La Agenda ya lo omitía; el feed no.
chk('el feed cuenta casillas con y sin fecha para decidirlo',
  /where nullif\(x->>'fecha',''\) is not null\) > 0/.test(sql) &&
  /where nullif\(x->>'fecha',''\) is null\) = 0/.test(sql));
chk('y compara contra las casillas que el grupo declara',
  /coalesce\(nullif\(c->>'slots',''\)::int, 0\) <=/.test(sql));
chk('la Agenda corta por la misma regla, que es de donde sale',
  /if\(conFechaPropia&&notasCount<=0&&\(c\.slots\|\|0\)<=conFechaPropia\)return;/.test(app));

console.log('\n=== No se le inventa un peso a una entrega suelta ===');
// El porcentaje de UNA entrega solo existe si el grupo dice cuántas son y no
// descarta ninguna. Repetir el del grupo afirma que un control vale lo que
// valen los tres.
chk('la Agenda devuelve null cuando no se puede saber',
  /if\(c\.dropLowest\|\|!Number\.isInteger\(c\.slots\)\|\|c\.slots<1\)return null;/.test(app));
chk('el feed también manda null, no el peso del grupo',
  /then round\(coalesce\(\(c->>'peso'\)::numeric, 0\) \/ \(c->>'slots'\)::numeric, 2\)\s*\n\s*else null/.test(sql));
chk('el .ics descargado no escribe un porcentaje inventado',
  /Parte de «\$\{e\.cat\.nombre\}»/.test(app) && !/pesoEv==null\?\(e\.cat\.peso\|\|0\)/.test(app));
chk('el feed suscribible tampoco', /Parte de un grupo de evaluaciones de/.test(fn));
chk('y cuando sí se sabe, los dos siguen diciendo el porcentaje',
  /Vale \$\{r2\(pesoEv\)\}% de/.test(app) && /Vale \$\{f\.peso\}% de \$\{f\.ramo\}/.test(fn));

console.log('\n=== dropLowest: false no es descartar ===');
// `c->'dropLowest' is null` trataba un false explícito como si descartara, y le
// quitaba el peso a entregas que sí lo tienen.
chk('solo true cuenta como descarte',
  /\(c->'dropLowest'\) is distinct from 'true'::jsonb/.test(sql));

console.log('\n=== Una casilla sin nombre no sale como "null" ===');
chk('hereda el nombre del grupo',
  /coalesce\(nullif\(n->>'nombre',''\), c->>'nombre'\) as evaluacion/.test(sql));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
