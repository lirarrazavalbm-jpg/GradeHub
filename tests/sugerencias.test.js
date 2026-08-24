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
  /id="feedback-contact"[^>]*>gradehub\.app@gmail\.com<\/a>/.test(app));

console.log('\n=== El correo llega con un borrador seguro ===');
const fnCorreo=(app.match(/function correoSugerenciaHref\([\s\S]*?\n\}\nfunction actualizarCorreoSugerencia/)||[])[0]||'';
const construyeCorreo=fnCorreo&&new Function('S','TENANTS',`${fnCorreo.replace(/\nfunction actualizarCorreoSugerencia$/,'')}\nreturn correoSugerenciaHref;`)({
  userName:'Ana & Beto',tenant:'uc',carreraNombre:'Ingeniería Comercial',carrera:'COM',careerSemestre:2,
},{uc:{name:'U. Católica · Ingeniería'}});
const borrador=construyeCorreo&&construyeCorreo('problema','El enlace <no> abre & necesito ayuda');
const urlCorreo=borrador&&new URL(borrador);
const asunto=urlCorreo&&urlCorreo.searchParams.get('subject');
const cuerpo=urlCorreo&&urlCorreo.searchParams.get('body');
chk('el asunto lleva la categoría elegida',asunto==='GradeHub · Problema');
chk('el cuerpo lleva un perfil reconocible y el detalle escrito',
  !!cuerpo&&['Nombre para mostrar: Ana & Beto','Universidad: U. Católica · Ingeniería','Carrera: Ingeniería Comercial','Semestre: 2°','El enlace <no> abre & necesito ayuda'].every(x=>cuerpo.includes(x)));
chk('el mailto escapa el contenido antes de ponerlo en la URL',
  !!borrador&&borrador.includes('%26')&&borrador.includes('%3Cno%3E')&&!borrador.includes('Ana & Beto'));
chk('el borrador no expone correo, UID, ramos ni notas',
  !!fnCorreo&&!/currentUser|\.id\b|ramos|categorias|notas|email/i.test(fnCorreo));
chk('el formulario sigue siendo la vía principal de envío',
  /from\('user_feedback'\)\.insert\(\{user_id:currentUser\.id,categoria,mensaje\}\)/.test(app));

console.log(fallos?`\nFAIL: ${fallos}`:'\nSugerencias OK');
process.exit(fallos?1:0);
