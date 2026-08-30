const fs=require('fs');

let fail=0;
function chk(nombre,ok){
  if(ok)console.log('  OK  ',nombre);
  else{console.error('  FAIL',nombre);fail++;}
}

const app=fs.readFileSync('app.js','utf8');
const modo=app.match(/\['sistema','Sistema','([^']*)'\]/);

console.log('\n=== Modo Sistema habla para cualquier dispositivo ===');
chk('la opción Sistema conserva una explicación',!!modo&&modo[1].trim().length>0);
chk('la explicación no nombra teléfonos, tablets ni computadores',!!modo&&!/teléfono|telefono|celular|móvil|movil|ipad|tablet|computador|ordenador/i.test(modo[1]));

if(fail){console.error(`\nFAIL: ${fail}`);process.exit(1);}
console.log('\nPASS: 2');
