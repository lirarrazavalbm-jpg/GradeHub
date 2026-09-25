// Las funciones para aprobar profesores y publicar clases no pueden quedar al
// alcance del navegador.
//
// Supabase expone el esquema `public` por su API y concede EXECUTE a anon y
// authenticated sobre toda función nueva que se cree ahí. Una función de
// administración en `public` —o una `security definer` en cualquier parte—
// sería un botón de "publícame gratis" para cualquier cuenta. Nada falla al
// aplicarla: se nota cuando alguien la llama.
//
// El recorrido completo (postular, aprobar, publicar, suspender, borrar la
// cuenta) se probó contra un Postgres local con el SQL real; esto fija las
// condiciones que lo hacen seguro para que no se pierdan en una edición.
const fs = require('fs'), path = require('path');
const archivo = path.join(__dirname, '..', 'supabase', 'admin_clases.sql');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const sql = fs.readFileSync(archivo, 'utf8')
  .split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

const funciones = [...sql.matchAll(/create\s+or\s+replace\s+function\s+([\w.]+)\s*\(/gi)].map(m => m[1]);
chk('define las cuatro funciones de administración',
  ['admin.pendientes', 'admin.revisar_profesor', 'admin.publicar_anuncio', 'admin.devolver_anuncio']
    .every(f => funciones.includes(f)));
chk('todas viven en el esquema admin, ninguna en public',
  funciones.length > 0 && funciones.every(f => f.startsWith('admin.')));
chk('ninguna es security definer', !/security\s+definer/i.test(sql));
chk('el esquema se le quita a anon y authenticated',
  /revoke\s+all\s+on\s+schema\s+admin\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql));
chk('las funciones se le quitan a anon y authenticated',
  /revoke\s+all\s+on\s+all\s+functions\s+in\s+schema\s+admin\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql));
chk('el revoke de funciones va después de crearlas',
  sql.search(/revoke\s+all\s+on\s+all\s+functions/i) > sql.search(/function\s+admin\.devolver_anuncio/i));
chk('no concede nada a nadie', !/\bgrant\b/i.test(sql));

// El cargo no tiene default: 0 tiene que ser una decisión escrita, no un olvido.
const firma = (sql.match(/function\s+admin\.publicar_anuncio\s*\(([^)]*)\)/i) || [])[1] || '';
chk('publicar_anuncio pide el cargo sin valor por omisión',
  /p_cargo_clp\s+integer\s*(,|$)/i.test(firma) && !/p_cargo_clp\s+integer\s+default/i.test(firma));

// La tabla de publicaciones guarda cobros: se va con el anuncio (y este, con la cuenta).
chk('las publicaciones se borran con el anuncio',
  /anuncio_id\s+uuid\s+not\s+null\s+references\s+public\.tutor_anuncios\(id\)\s+on\s+delete\s+cascade/i.test(sql));
chk('la tabla de publicaciones tiene RLS y ningún permiso',
  /alter\s+table\s+admin\.anuncio_publicaciones\s+enable\s+row\s+level\s+security/i.test(sql) &&
  /revoke\s+all\s+on\s+admin\.anuncio_publicaciones\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql));

// Es aditivo: no toca tablas ni políticas que ya están en producción.
chk('no altera tablas existentes', !/alter\s+table\s+public\./i.test(sql));
chk('no crea ni borra políticas', !/\b(create|drop)\s+policy\b/i.test(sql));

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
