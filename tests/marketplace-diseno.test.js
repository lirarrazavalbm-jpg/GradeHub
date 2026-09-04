// El marketplace usa notas solo dentro del navegador. Este test cuida el
// contrato del diseño mientras la interfaz y el SQL se construyen en PRs separados.
const fs=require('fs'),path=require('path');
const doc=fs.readFileSync(path.join(__dirname,'../docs/marketplace-clases.md'),'utf8');
let ok=0,fail=0;
const chk=(nombre,pasa)=>{console.log(`  ${pasa?'OK  ':'FAIL'} ${nombre}`);if(pasa)ok++;else fail++;};

chk('la recomendación se decide localmente',/se decide \*\*en el navegador\*\*/.test(doc)&&/no recibe qué\s*ramos tiene la persona, qué promedio lleva/i.test(doc));
chk('la aceptación única es requisito de registro',/casilla obligatoria que ya acepta los términos/.test(doc)&&/no\s*se agrega un segundo control/i.test(doc)&&/Parte desmarcada/.test(doc)&&/Para crear la cuenta debe marcarla/.test(doc));
chk('las cuentas existentes reciben el mismo trato sin selector',/cuentas que ya existen reciben el mismo trato/.test(doc)&&/no aparece un selector en\s*Ajustes/i.test(doc)&&/no se crea una preferencia por cuenta/i.test(doc));
chk('los términos y la política se actualizan antes de activar la función',/Antes de activar la función, los términos y la\s+política tienen que/i.test(doc));
chk('las métricas no filtran riesgo ni identidad',/No incluyen `user_id`, correo, carrera, semestre, promedio, nota, estado de\s*consentimiento ni un indicador de riesgo/.test(doc));
chk('el SQL se reconoce como paso manual previo',/SQL aplicado manualmente/i.test(doc)&&/Cloudflare no ejecuta\s*SQL/i.test(doc));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
