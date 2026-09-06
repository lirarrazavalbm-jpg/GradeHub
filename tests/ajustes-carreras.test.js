// Ajustes ofrecía TRES carreras en la UC —plan común, Comercial y "Otra"— cuando
// el onboarding ofrece las 71 declarables. Quien entraba declarando Odontología
// y después abría Ajustes no encontraba su carrera por ninguna parte: la pantalla
// donde se corrigen los datos no podía representar lo que la otra sí dejó elegir.
//
// Con 71 opciones la lista tampoco se recorre con el dedo, así que va con
// buscador, el mismo que ya existía en el paso 3 del onboarding.
const fs=require('fs');
const raiz=__dirname+'/../';
const app=fs.readFileSync(process.env.GRADEHUB_APP||raiz+'app.js','utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== Ajustes ofrece lo mismo que el onboarding ===');
const grid=(app.match(/function renderSettingsCarreraGrid\(\)\{[\s\S]*?\n  \}/)||[''])[0];
chk('la grilla sale de las carreras declarables, no de las tres con malla',
  /carrerasDeclarables\(settingsTenant\)/.test(grid) && !/Object\.entries\(carrerasFor\(settingsTenant\)\)/.test(grid));
chk('y filtra por lo que se escribe', /settingsCarreraFiltro/.test(grid));
chk('existe el campo de búsqueda', /id="s-carrera-buscar"/.test(app));

console.log('\n=== Una carrera sin malla igual se puede declarar ===');
// El código carga los ramos; el nombre es lo único que hay cuando no tenemos su
// malla. Guardar solo el código dejaba a 69 carreras sin manera de registrarse.
chk('se guarda también el nombre declarado', /S\.carreraNombre=settingsCarreraNombre/.test(app));
chk('y hay salida para lo que no está en la lista', /Usar «/.test(grid));

console.log('\n=== La lista viene colapsada ===');
// Setenta y un botones empujaban el resto de Ajustes fuera de la pantalla para
// cambiar un dato que casi nadie toca dos veces.
chk('sin búsqueda solo se muestra la carrera elegida',
  /todas\.filter\(elegidaDe\)/.test(grid));
chk('y una carrera declarada a mano tampoco desaparece',
  /settingsCarreraNombre\)\{/.test(grid));

console.log('\n=== Cambiar de universidad no deja restos ===');
chk('al cambiar de tenant se limpian código, nombre y filtro',
  /settingsCarrera=null;settingsCarreraNombre=null/.test(app) && /settingsCarreraFiltro=''/.test(app));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
