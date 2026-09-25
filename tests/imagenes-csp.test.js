// Las imágenes de clases (flyers y logos) viven en Supabase Storage y se
// muestran con una URL firmada de ese dominio. Si la CSP no lo permite en
// img-src, el navegador las bloquea y queda el ícono de imagen rota.
//
// Pasó el 2026-09-25: el primer anuncio publicado mostró el logo roto, y los
// flyers llevaban así desde que existen sin que nadie lo notara, porque ningún
// anuncio se había publicado todavía.
const fs=require('fs'),path=require('path');
const raiz=path.join(__dirname,'..');
const headers=fs.readFileSync(path.join(raiz,'_headers'),'utf8');
const sesion=fs.readFileSync(path.join(raiz,'app-session.js'),'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const supabase=(sesion.match(/https:\/\/[a-z0-9]+\.supabase\.co/)||[])[0];
chk('app-session.js declara el proyecto de Supabase',!!supabase);
const img=(headers.match(/img-src([^;]*)/)||[])[1]||'';
chk('la CSP permite imágenes de ese proyecto (flyers y logos)',!!supabase&&img.split(/\s+/).includes(supabase));
chk('y no abre img-src a cualquier dominio',!/(^|\s)(\*|https:)(\s|$)/.test(img));
console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
