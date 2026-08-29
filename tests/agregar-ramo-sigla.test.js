const fs=require('fs');

let fail=0;
function chk(nombre,ok){
  if(ok)console.log('  OK  ',nombre);
  else{console.error('  FAIL',nombre);fail++;}
}

const app=fs.readFileSync('app.js','utf8');
const modal=app.match(/function openAddRamoModal\(\)\{([\s\S]*?)\n\}/);

console.log('\n=== Agregar ramo también descubre las siglas UC ===');
chk('el modal conserva la búsqueda de catálogo',!!modal&&/renderCatalogResults\(input\.value\)/.test(modal[1]));
chk('la etiqueta invita a buscar por nombre o sigla',!!modal&&/Nombre o sigla/.test(modal[1]));
chk('el ejemplo muestra una sigla UC real',!!modal&&/IIC2333/.test(modal[1]));

if(fail){console.error(`\nFAIL: ${fail}`);process.exit(1);}
console.log('\nPASS: 3');
