// Marcar los ramos del horario no debe reconstruir el selector completo.
// El checkbox ya refleja el clic; repintar todas las filas en cada cambio
// pierde la posición de scroll y vuelve lenta una selección de varios ramos.
const fs=require('fs'),vm=require('vm'),path=require('path');
const appPath=process.env.GRADEHUB_APP||path.join(__dirname,'..','app.js');
const app=fs.readFileSync(appPath,'utf8');
const match=app.match(/function obToggleRamo\(nombre,checked\)\{[\s\S]*?\n\}/);

let ok=0,fail=0;
function chk(nombre,cumple){
  if(cumple){ok++;console.log('  OK   '+nombre);}
  else{fail++;console.log('  FAIL '+nombre);}
}

console.log('\n=== Selección rápida de ramos en el onboarding ===');
chk('existe el handler de selección',!!match);

if(match){
  const ctx={
    obRamos:[],
    normName:s=>String(s||'').trim().toLowerCase(),
    repintados:0,actualizaciones:0,
  };
  ctx.obTieneRamo=nombre=>ctx.obRamos.some(r=>ctx.normName(r.nombre)===ctx.normName(nombre));
  ctx.renderObCoursePicker=()=>{ctx.repintados++;};
  ctx.obRender=()=>{ctx.actualizaciones++;};
  vm.createContext(ctx);
  vm.runInContext(match[0],ctx);

  vm.runInContext("obToggleRamo('Cálculo I',true)",ctx);
  chk('marcar agrega el ramo y actualiza el avance',ctx.obRamos.length===1&&ctx.actualizaciones===1);
  chk('marcar no reconstruye toda la lista',ctx.repintados===0);

  vm.runInContext("obToggleRamo('Cálculo I',false)",ctx);
  chk('desmarcar quita el ramo y actualiza el avance',ctx.obRamos.length===0&&ctx.actualizaciones===2);
  chk('desmarcar tampoco reconstruye toda la lista',ctx.repintados===0);
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
