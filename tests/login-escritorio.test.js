// El login de escritorio usa el espacio completo sin desordenar la versión móvil.
// En un notebook mantiene dos columnas; en una pantalla ancha, las estadísticas
// pasan a una tercera y el formulario queda realmente al centro.
const fs=require('fs');
const path=require('path');
const raiz=process.env.GRADEHUB_ROOT||path.join(__dirname,'..');
const css=fs.readFileSync(path.join(raiz,'styles.css'),'utf8');
const html=fs.readFileSync(path.join(raiz,'index.html'),'utf8');

let ok=0,fail=0;
const chk=(nombre,cumple)=>{if(cumple){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}};

console.log('\n=== Login ordenado en escritorio ===');
chk('el bloque completo centra sus hijos, incluido el logo',/#screen-auth \.ob-wrap\{[^}]*justify-items:center/.test(css));
chk('la muestra ocupa la columna izquierda completa',/#screen-auth \.auth-preview\{[^}]*grid-column:1[^}]*justify-self:stretch/.test(css));
chk('la derecha muestra una miniatura de la página de estadísticas',/class="auth-stats-preview"/.test(html)&&/Avance del semestre/.test(html)&&/Tu prioridad hoy/.test(html));
chk('en pantallas anchas hay tres columnas equivalentes',/@media\(min-width:1280px\)[\s\S]*?#screen-auth \.ob-wrap\{grid-template-columns:repeat\(3,/.test(css));
chk('y esa miniatura pasa a la tercera',/@media\(min-width:1280px\)[\s\S]*?#screen-auth \.auth-stats-preview\{[^}]*grid-column:3/.test(css));
chk('el texto chico forma un pie que cruza todas las columnas',/\.auth-legal-row\{[^}]*grid-column:1\/-1/.test(css));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
