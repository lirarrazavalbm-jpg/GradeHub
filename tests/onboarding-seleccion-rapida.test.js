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

console.log('\n=== Avanzar orienta; marcar conserva la posición ===');
const render=app.match(/function obRender\(\)\{[\s\S]*?\n\}/)[0];
let focoTitulo=0,focoCampo=0;
const titulo={focus(){focoTitulo++;}};
const wrap={scrollTop:250};
const pantalla={dataset:{},scrollTop:180,querySelector:s=>s==='.ob-wrap'?wrap:titulo};
const generico={style:{},focus(){focoCampo++;}};
const renderCtx={
  obStep:1,OB_TOTAL:5,obRamos:[],prepararObRamos(){},obTrackPaso(){},obProgressPct:s=>s*20,obStepValid:()=>true,
  setTimeout:fn=>fn(),
  document:{querySelectorAll:()=>[],getElementById:id=>id==='screen-onboard'?pantalla:generico},
};
vm.createContext(renderCtx);vm.runInContext(render,renderCtx);
vm.runInContext('obRender()',renderCtx);
chk('el primer paso enfoca su título sin abrir el teclado',focoTitulo===1&&focoCampo===0);
wrap.scrollTop=250;pantalla.scrollTop=180;renderCtx.obStep=2;
vm.runInContext('obRender()',renderCtx);
chk('avanzar devuelve el contenido arriba y enfoca el nuevo paso',focoTitulo===2&&wrap.scrollTop===0&&pantalla.scrollTop===0);
renderCtx.obStep=5;vm.runInContext('obRender()',renderCtx);
wrap.scrollTop=250;pantalla.scrollTop=180;const focoAntes=focoTitulo;
vm.runInContext('obRender()',renderCtx);
chk('actualizar la selección del mismo paso no roba foco ni scroll',focoTitulo===focoAntes&&wrap.scrollTop===250&&pantalla.scrollTop===180);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
