const fs=require('fs'),path=require('path');
const raiz=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
const css=fs.readFileSync(path.join(raiz,'styles.css'),'utf8');
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

console.log('\n=== El formulario explica cómo enviarlo ===');
const sendTag=(app.match(/<button[^>]*id="s-feedback-send"[^>]*>/)||[])[0]||'';
chk('el botón nace disponible para poder explicar un mensaje corto',
  !!sendTag&&!/\sdisabled(?:\s|>|=)/.test(sendTag));
chk('el mínimo de 3 caracteres está visible y conectado al campo',
  /id="s-feedback-message"[^>]*aria-describedby="s-feedback-help s-feedback-count"/.test(app)&&
  /id="s-feedback-help"[^>]*>Mínimo 3 caracteres/.test(app));
chk('un envío corto marca el campo, lo enfoca y explica el mínimo',
  /if\(!\(mensaje\.length>=3\)\)\{[\s\S]{0,320}aria-invalid[\s\S]{0,180}campo\.focus\(\)/.test(app));
chk('solo se deshabilita mientras envía y vuelve a habilitarse',
  /boton\.disabled=true;boton\.textContent='Enviando…'/.test(app)&&
  /finally\{[\s\S]{0,180}boton\.disabled=false/.test(app));
chk('el estado de envío deshabilitado sigue siendo legible',
  /\.feedback-send:disabled\{[^}]*opacity:\.(?:[6-9]\d|[6-9])/.test(css));
chk('ofrece el correo de contacto como alternativa',
  /href="mailto:gradehub\.app@gmail\.com"[^>]*>gradehub\.app@gmail\.com<\/a>/.test(app));

console.log(fallos?`\nFAIL: ${fallos}`:'\nSugerencias OK');
process.exit(fallos?1:0);
