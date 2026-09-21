// La vista del anuncio comparte el gesto de la línea lateral de Inicio.
// Los paneles del formulario no se levantan: no son tarjetas clickeables.
const fs=require('node:fs'),path=require('node:path');
const raiz=path.join(__dirname,'..');
const css=fs.readFileSync(process.env.GRADEHUB_CSS||path.join(raiz,'styles.css'),'utf8');
const demo=fs.readFileSync(process.env.GRADEHUB_MARKETPLACE_DEMO||path.join(raiz,'bin/marketplace-demo.html'),'utf8');
let n=0;
function check(nombre,condicion){if(!condicion)throw Error(nombre);n++;}
const regla=(texto,selector)=>{
  const patron=new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*\\{([^}]*)\\}');
  return (texto.match(patron)||[])[1]||'';
};
try{
  const bandaHome=regla(css,'.ramo-band');
  const bandaProfesor=regla(css,'.profesor-vista::before');
  const bandaDemo=regla(demo,'.ad::before');
  check('la vista del profesor tiene línea de color propia',
    /position:relative/.test(regla(css,'.profesor-vista'))&&
    /background:var\(--primary\)/.test(bandaProfesor));
  check('la línea comparte el estado inicial y origen de Inicio',
    /transform:scaleY\(\.6\)/.test(bandaHome)&&
    [bandaProfesor,bandaDemo].every(b=>/transform:scaleY\(\.6\)/.test(b)&&/transform-origin:center/.test(b)));
  check('el gesto usa la misma escala y tokens de Inicio',
    [bandaProfesor,bandaDemo].every(b=>/var\(--motion-fast\) var\(--ease-out\)/.test(b))&&
    /--motion-fast:160ms/.test(demo)&&/--ease-out:cubic-bezier\(\.22,1,\.36,1\)/.test(demo));
  check('solo el cursor fino hace crecer la línea de ambas tarjetas',
    /@media\(hover:hover\) and \(pointer:fine\)\s*\{[^}]*\.profesor-vista:hover::before\s*\{[^}]*scaleX\(1\.65\) scaleY\(1\)/.test(css)&&
    /@media\(hover:hover\) and \(pointer:fine\)\s*\{[^}]*\.ad:hover::before\s*\{[^}]*scaleX\(1\.65\) scaleY\(1\)/.test(demo));
  check('movimiento reducido deja la línea quieta, pero mantiene el brillo',
    [css,demo].every(t=>/@media\(prefers-reduced-motion:reduce\)\s*\{[^}]*::before\s*\{[^}]*transform:none/.test(t)&&
      /@media\(prefers-reduced-motion:reduce\) and \(hover:hover\) and \(pointer:fine\)\s*\{[^}]*::before\s*\{[^}]*filter:brightness\(1\.2\)/.test(t)));
  check('los paneles de formulario no se anuncian como tarjetas accionables',
    !/\.panel:hover\s*\{[^}]*transform:/.test(demo)&&!/\.profesor-form:hover\s*\{[^}]*transform:/.test(css));
  console.log(`Animación del anuncio OK: ${n}`);
}catch(e){console.error('FAIL:',e.message);process.exitCode=1;}
