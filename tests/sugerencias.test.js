const fs=require('fs'),path=require('path');
const raiz=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
const sql=fs.readFileSync(path.join(raiz,'supabase/user_feedback.sql'),'utf8');
let fallos=0;
const chk=(nombre,ok)=>{console.log(`  ${ok?'OK  ':'FAIL'} ${nombre}`);if(!ok)fallos++;};

console.log('\n=== Sugerencias protegidas y borrables ===');
chk('la tabla referencia auth.users con borrado en cascada',
  /user_id\s+uuid[^,]*references\s+auth\.users\s*\(id\)\s+on delete cascade/i.test(sql));
chk('RLS está activa',/alter table public\.user_feedback enable row level security/i.test(sql));
chk('anon y authenticated pierden privilegios heredados',
  /revoke all on public\.user_feedback from public, anon, authenticated/i.test(sql));
chk('authenticated solo recibe INSERT',
  /grant insert\s*\(user_id, categoria, mensaje\)\s+on public\.user_feedback to authenticated/i.test(sql));
chk('INSERT exige que auth.uid sea el user_id',
  /for insert[\s\S]*to authenticated[\s\S]*with check\s*\(\(select auth\.uid\(\)\) = user_id\)/i.test(sql));
chk('mensaje tiene límite también en la base',
  /char_length\(btrim\(mensaje\)\) between 3 and 2000/i.test(sql));

console.log('\n=== La interfaz no filtra el comentario a analítica ===');
chk('el formulario exige sesión',/if\(!supabaseClient\|\|!currentUser\).*Necesitas iniciar sesión/s.test(app));
chk('la fila usa el id de la sesión',/user_id:currentUser\.id,categoria,mensaje/.test(app));
chk('analítica envía solo una categoría cerrada',/track\('submit_feedback',\{categoria\}\)/.test(app));
chk('analítica no recibe mensaje',! /track\('submit_feedback',[^)]*mensaje/.test(app));

console.log(fallos?`\nFAIL: ${fallos}`:'\nSugerencias OK');
process.exit(fallos?1:0);
