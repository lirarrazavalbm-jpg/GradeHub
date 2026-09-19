// Aplica uno o varios .sql de supabase/ contra un Postgres de verdad (PGlite)
// y muestra con qué forma queda la base. Sirve para mirar un archivo ANTES de
// pegarlo en el panel de Supabase, que es el único camino por el que estos
// archivos llegan a producción: ningún deploy los ejecuta.
//
//   npm run sql -- supabase/user_feedback.sql
//   npm run sql -- supabase/agente_propuestas.sql supabase/agente_ramos_propuestas.sql
//
// Varios archivos se aplican EN ORDEN, que es como se corrieron en producción:
// casi todos son incrementales y solos no aplican.
//
// QUÉ PRUEBA: que el archivo se aplique sin errores sobre una base limpia, y
// deja ver RLS, políticas, permisos, llaves foráneas y funciones resultantes.
// QUÉ NO PRUEBA: que producción se parezca a esto. La base real lleva meses de
// archivos aplicados a mano y esto arranca vacío cada vez. Un OK acá quiere
// decir "el archivo no tiene errores", nunca "producción quedó así".
const fs = require('node:fs');
const path = require('node:path');

const archivos = process.argv.slice(2);
if (!archivos.length) {
  console.error('Uso: npm run sql -- supabase/<archivo>.sql [más archivos, en orden]');
  process.exit(2);
}

(async () => {
  let PGlite;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
  } catch {
    console.error('Falta @electric-sql/pglite. Corre `npm install` y vuelve a intentar.');
    process.exit(2);
  }

  const raiz = path.join(__dirname, '..');
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, 'supabase-stubs.sql'), 'utf8'));

  for (const archivo of archivos) {
    try {
      await db.exec(fs.readFileSync(path.resolve(raiz, archivo), 'utf8'));
      console.log('OK   ' + archivo);
    } catch (e) {
      console.error('FALLÓ ' + archivo + '\n  ' + e.message);
      if (e.hint) console.error('  pista: ' + e.hint);
      process.exit(1);
    }
  }

  const tablas = await db.query(`
    select c.relname, c.relrowsecurity,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas,
           (select count(*) from information_schema.role_table_grants g
             where g.table_schema = 'public' and g.table_name = c.relname
               and g.grantee in ('anon', 'authenticated', 'PUBLIC')) as permisos
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by 1`);
  if (tablas.rows.length) {
    console.log('\ntabla                      RLS  políticas  permisos a anon/authenticated');
    for (const t of tablas.rows) {
      console.log('  ' + t.relname.padEnd(26) + (t.relrowsecurity ? 'sí ' : 'NO ') +
        String(t.politicas).padStart(6) + String(t.permisos).padStart(11));
    }
    // Una tabla sin RLS la lee cualquiera con la llave pública. Es el error que
    // más caro sale y el más fácil de no ver en un diff largo.
    const sinRls = tablas.rows.filter(t => !t.relrowsecurity).map(t => t.relname);
    if (sinRls.length) console.log('\n  ⚠ SIN RLS: ' + sinRls.join(', '));
  }

  const fks = await db.query(`
    select cl.relname as tabla, con.conname, con.confdeltype,
           (select nspname from pg_namespace where oid =
             (select relnamespace from pg_class where oid = con.confrelid)) as esquema_destino,
           (select relname from pg_class where oid = con.confrelid) as destino
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and con.contype = 'f' order by 1, 2`);
  const aUsuarios = fks.rows.filter(f => f.esquema_destino === 'auth' && f.destino === 'users');
  if (aUsuarios.length) {
    console.log('\nllaves hacia auth.users:');
    for (const f of aUsuarios) {
      // Sin cascada, los datos sobreviven al borrado de cuenta y la política de
      // privacidad pasa a ser mentira sin que falle nada.
      console.log('  ' + f.tabla.padEnd(26) + (f.confdeltype === 'c' ? 'borra en cascada' : '⚠ NO CASCADA (' + f.confdeltype + ')'));
    }
  }

  const fns = await db.query(`
    select p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' order by 1`);
  if (fns.rows.length) {
    console.log('\nfunciones:');
    for (const f of fns.rows) {
      console.log('  ' + (f.prosecdef ? 'definer' : 'invoker') + '  ' + f.proname + '(' + f.args + ')');
    }
  }

  console.log('\nAplicó sin errores. Esto NO dice que producción esté así: acá la base arrancó vacía.');
})();
