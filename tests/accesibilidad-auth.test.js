// Los errores de autenticación se escriben en #auth-error desde submitAuth().
// Antes solo cambiaban texto y display: una persona que usa lector de pantalla
// podía quedarse en el botón sin enterarse de por qué el inicio no continuó.
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const tag=(html.match(/<div\s+id="auth-error"[^>]*>/)||[])[0]||'';
let fail=0;
const chk=(nombre,ok)=>{console.log(`  ${ok?'OK  ':'FAIL'} ${nombre}`);if(!ok)fail++;};

console.log('\n=== Errores de autenticación anunciables ===');
chk('el aviso de auth conserva una región viva',/\baria-live="assertive"/.test(tag));
chk('el aviso de auth se identifica como alerta',/\brole="alert"/.test(tag));

console.log(`\nPASS: ${2-fail}   FAIL: ${fail}`);
process.exit(fail?1:0);
