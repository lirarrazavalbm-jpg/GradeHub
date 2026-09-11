// Volver después de un mes y no acordarse de si se entró con Google o con
// correo termina en un "contraseña incorrecta" que no es tal: la cuenta existe,
// pero se creó por el otro camino. La marca dice cuál fue.
const fs=require('fs'),path=require('path');
const raiz=path.join(__dirname,'..');
const ses=fs.readFileSync(path.join(raiz,'app-session.js'),'utf8');
const css=fs.readFileSync(path.join(raiz,'styles.css'),'utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== Se guarda el método, nunca el correo ===');
// Esta pantalla se ve en computadores compartidos: de un correo a la vista se
// deduce quién lo usa. Solo se guarda cuál de los dos caminos fue.
const recordar=(ses.match(/function recordarMetodoLogin[\s\S]*?\n\}/)||[''])[0];
chk('la función solo escribe lo que recibe', /setItem\(CLAVE_ULTIMO_LOGIN,metodo\)/.test(recordar));
chk('y nadie le pasa el correo',
  !/recordarMetodoLogin\((email|correo\.value|[^'")\s]*mail)/i.test(ses));
chk('los dos únicos valores son los dos métodos',
  /recordarMetodoLogin\('correo'\)/.test(ses) && /recordarMetodoLogin\(provider\)/.test(ses));

console.log('\n=== Sobrevive al cierre de sesión, que es cuando sirve ===');
// Guardado dentro del estado de la app se iría junto con la sesión, justo
// cuando hace falta. Va en su propia clave.
chk('usa una clave propia y no el estado de la app',
  /CLAVE_ULTIMO_LOGIN='gradehub_ultimo_login'/.test(ses) && !/S\.ultimoLogin/.test(ses));
chk('y no revienta si el navegador no deja guardar',
  /function recordarMetodoLogin[\s\S]{0,200}catch\(e\)/.test(ses) &&
  /function ultimoMetodoLogin[\s\S]{0,200}catch\(e\)\{return null;?\}/.test(ses));

console.log('\n=== La marca aparece donde corresponde ===');
chk('se pinta al mostrar la pantalla de login',
  /classList\.add\('active'\);\s*\n\s*marcarUltimoLogin\(\);/.test(ses));
chk('sin nada guardado no aparece nada',
  /function marcarUltimoLogin[\s\S]{0,300}if\(!metodo\)return;/.test(ses));
// Repintar no puede dejar dos marcas pegadas.
chk('y no se acumula al repintar',
  /querySelectorAll\('\.auth-ultimo'\)[\s\S]{0,80}remove\(\)/.test(ses));

console.log('\n=== Va encima del método, no dentro del botón ===');
// Dentro del botón de Google quedaba gris sobre gris y le partía el texto en
// dos líneas.
chk('se inserta como hermano, no como hijo', /insertBefore\(marca,destino\)/.test(ses));
chk('y el estilo no depende de ir dentro del botón', !/\.oauth-btn \.auth-ultimo/.test(css));
chk('el texto usa un color con contraste propio', /\.auth-ultimo\{[^}]*color:var\(--fg3\)/.test(css));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
