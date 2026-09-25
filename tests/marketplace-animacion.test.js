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
  // La vista previa del profesor ya no es una tarjeta propia con su línea:
  // desde el 2026-09-25 replica Inicio (el ramo con su línea y la clase en la
  // casilla vecina) con el mismo contenido que ve el estudiante. La línea
  // lateral de la muestra de bin/ sigue con el gesto de Inicio.
  const bandaDemo=regla(demo,'.ad::before');
  check('la línea de la muestra comparte el estado inicial y origen de Inicio',
    /transform:scaleY\(\.6\)/.test(bandaHome)&&/transform:scaleY\(\.6\)/.test(bandaDemo)&&/transform-origin:center/.test(bandaDemo));
  check('el gesto usa la misma escala y tokens de Inicio',
    /var\(--motion-fast\) var\(--ease-out\)/.test(bandaDemo)&&
    /--motion-fast:160ms/.test(demo)&&/--ease-out:cubic-bezier\(\.22,1,\.36,1\)/.test(demo));
  check('la vista previa del profesor usa el mismo contenido que el banner de Inicio',
    /contenidoRecomendacionClase\(borrador/.test(fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8')));
  check('los paneles de formulario no se anuncian como tarjetas accionables',
    !/\.panel:hover\s*\{[^}]*transform:/.test(demo)&&!/\.profesor-form:hover\s*\{[^}]*transform:/.test(css));
  console.log(`Animación del anuncio OK: ${n}`);
}catch(e){console.error('FAIL:',e.message);process.exitCode=1;}
