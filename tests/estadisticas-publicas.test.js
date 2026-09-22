// La línea "N estudiantes ya llevan sus notas acá" del login sale de una RPC
// pública. Pública quiere decir que la lee cualquiera sin sesión, así que solo
// puede devolver agregados: este test revienta si alguien le agrega una columna
// con datos de una persona, o si la pantalla la muestra con pocas cuentas.
const fs = require('fs');
const leer = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const sql = leer('supabase/estadisticas_publicas.sql'), app = leer('app-session.js'), html = leer('index.html');
let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const cuerpo = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;'));
// Ningún SELECT proyecta una fila o un campo: solo count(*) y sum(...).
const selects = cuerpo.replace(/--.*$/gm, '').match(/select\s+[^\n]+/g) || [];
chk('la RPC devuelve solo conteos (count/sum), nunca un campo', selects.length >= 4 && selects.every(s => /^select\s+(jsonb_build_object|count\(\*\)|sum\()/.test(s)) && !/user_id|email/.test(cuerpo));
chk('security definer + stable, y solo anon/authenticated pueden ejecutarla', /security definer/.test(sql) && /\bstable\b/.test(sql) && /grant execute on function public\.estadisticas_publicas\(\) to anon, authenticated/.test(sql));
chk('la app llama a esa RPC desde la pantalla de login', /rpc\('estadisticas_publicas'\)/.test(app) && /cargarEstadisticasPublicas\(\);/.test(app.slice(app.indexOf('function showAuthScreen'))));
chk('con pocas cuentas no se muestra nada', /MINIMO_CUENTAS_PARA_MOSTRAR=\d+/.test(app) && /data\.cuentas>=MINIMO_CUENTAS_PARA_MOSTRAR/.test(app));
chk('el elemento parte oculto', /<div class="auth-stats" id="auth-stats" hidden/.test(html));
// Y `hidden` tiene que ganarle al display de autor: si no, la banda vacía se ve
// mientras la RPC responde y para siempre cuando falla.
const css = leer('styles.css');
chk('oculto de verdad: hay una regla para [hidden]', /#screen-auth \.auth-stats\[hidden\]\{display:none;?\}/.test(css));
chk('sin números tampoco se muestra la tarjeta que los enmarca', /#screen-auth \.auth-proof:has\(\.auth-stats\[hidden\]\)\{display:none;?\}/.test(css));

console.log(`\n${ok} ok, ${fail} fail`);
if (fail) process.exit(1);
