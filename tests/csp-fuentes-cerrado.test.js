// El rediseño Editorial pasó a tipografía del sistema y quitó las etiquetas
// <link> de Google Fonts de todas las páginas. Quitarlas no basta: mientras el
// CSP siga autorizando fonts.googleapis.com en `style-src`, una inyección de
// HTML puede volver a traer una hoja de estilos desde ahí, y el navegador la
// aplicaría sin chistar. El permiso se cierra junto con su uso, no después.
//
// No falla nada al dejarlo abierto: la app se ve igual y nadie se entera. Por
// eso se fija acá.
const fs=require('fs'),path=require('path');
const raiz=path.join(__dirname,'..');
const headers=fs.readFileSync(path.join(raiz,'_headers'),'utf8');
// `_headers` comenta sus propias directivas, así que se busca la línea que
// declara la cabecera de verdad —la que trae `default-src`— y no la primera que
// mencione su nombre.
const csp=(headers.split('\n').find(l=>/Content-Security-Policy:/.test(l)&&/default-src/.test(l))||'');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== El CSP no autoriza lo que la app ya no usa ===');
chk('existe la cabecera', csp.length>0);
// Se miran las dos directivas que permitirían APLICAR una hoja o una fuente
// externa. `connect-src` mantiene el permiso a propósito: el service worker
// conserva su rama de fetch hacia esos dominios, y quitar uno sin el otro deja
// el CSP peleado con el código.
const directiva=n=>(csp.split(';').find(d=>d.trim().startsWith(n))||'');
chk('style-src no autoriza fonts.googleapis.com', !/fonts\.googleapis\.com/.test(directiva('style-src')));
chk('font-src no autoriza fonts.gstatic.com', !/fonts\.gstatic\.com/.test(directiva('font-src')));
chk('y las dos directivas siguen existiendo', directiva('style-src').length>0 && directiva('font-src').length>0);

// Y la otra mitad del trato: si alguien vuelve a meter una fuente externa en el
// HTML, este test lo obliga a reabrir el permiso a conciencia en vez de
// descubrir en producción que el navegador se la bloqueó.
console.log('\n=== Y las páginas no piden fuentes externas ===');
const paginas=['index.html','404.html','preguntas.html','privacidad.html','terminos.html']
  .filter(f=>fs.existsSync(path.join(raiz,f)));
chk('se revisaron las páginas del sitio', paginas.length>=4);
paginas.forEach(f=>{
  const html=fs.readFileSync(path.join(raiz,f),'utf8');
  chk(`${f} no descarga fuentes externas`, !/fonts\.(googleapis|gstatic)\.com/.test(html));
});

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
