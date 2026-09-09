// Un semestre entra al historial por dos puertas —archivar el actual o cargar uno
// anterior a mano— y no salía por ninguna. Quien se equivocaba en el año al
// cargarlo quedaba con esa fila para siempre: no se podía renombrar ni borrar, y
// seguía contando en su promedio de carrera. No lanza ningún error; simplemente
// no existe la salida, así que el test la ejerce en vez de mirar el texto.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const app=fs.readFileSync(process.env.GRADEHUB_APP||raiz+'app.js','utf8');
const render=fs.readFileSync(raiz+'render-main.js','utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const saca=n=>(app.match(new RegExp('\\nfunction '+n+'\\([\\s\\S]*?\\n\\}'))||[''])[0];

// Se arma el mínimo que estas funciones tocan: el estado y los avisos.
let guardados=0,toasts=[],pedidos=[];
const campo={value:''};
const ctx={
  S:{tenant:'uc',historial:[
    {id:'a',label:'2024-1',manual:true,ramos:[{id:'r1'},{id:'r2'}]},
    {id:'b',label:'2024-2',ramos:[{id:'r3'}]}
  ]},
  save:()=>{guardados++;},track:()=>{},closeModal:()=>{},renderHome:()=>{},renderStats:()=>{},
  showToast:m=>toasts.push(m),
  showConfirm:(t,d,fn)=>{pedidos.push({t,d,fn});},
  esc:v=>String(v),
  document:{getElementById:()=>campo},openModal:()=>{}
};
vm.createContext(ctx);
['borrarHistorial','pedirBorrarHistorial','confirmRenombrarHist'].forEach(n=>{
  const src=saca(n);
  if(!src){console.log('  FAIL falta la función '+n);fail++;return;}
  vm.runInContext(src,ctx);
});
const corre=expr=>{try{return vm.runInContext(expr,ctx);}catch(e){console.log('  (error) '+e.message);return undefined;}};

console.log('=== Un semestre del historial se puede eliminar ===');
corre("pedirBorrarHistorial('a')");
// Borrar un semestre entero se pregunta antes: son notas de años que nadie va a
// volver a transcribir.
chk('primero pregunta, no borra al toque', pedidos.length===1 && ctx.S.historial.length===2);
chk('el aviso dice cuánto se pierde', /2 ramos/.test(pedidos[0]?.d||'') && /promedio de carrera/.test(pedidos[0]?.d||''));
if(pedidos[0])pedidos[0].fn();
chk('al confirmar, el semestre desaparece', ctx.S.historial.length===1 && !ctx.S.historial.some(h=>h.id==='a'));
chk('y no se lleva a los demás por delante', ctx.S.historial[0]?.id==='b');
chk('queda guardado en disco', guardados===1);

console.log('\n=== Y se le puede corregir de qué semestre es ===');
// El caso real: el año quedó mal al cargarlo. No se escribe de nuevo —cada quien
// escribía lo que se le ocurría— sino que se elige año y período.
['nombreVerano','cortoPeriodo','etiquetaSemestre','parseEtiquetaSemestre','anioActualSemestre',
 'aniosSemestre','selectorSemestreHTML','openRenombrarHistModal','repintarSelectorHistRename',
 'setAnioHistRename','setPeriodoHistRename','confirmRenombrarHist','semester'].forEach(n=>{
  const src=saca(n);
  if(!src){console.log('  FAIL falta la función '+n);fail++;return;}
  vm.runInContext(src,ctx);
});
vm.runInContext((app.match(/\nconst PERIODOS_SEMESTRE=\[[\s\S]*?\n\];/)||[''])[0],ctx);
vm.runInContext((app.match(/\nlet histRename=[^\n]*/)||[''])[0],ctx);

// Se abre sobre el semestre que ya estaba, para no obligar a elegir de nuevo.
corre("openRenombrarHistModal('b')");
chk('se abre en el semestre que la tarjeta ya tenía',
  corre('histRename.anio')===2024 && corre('histRename.periodo')==='2');
corre("setAnioHistRename('2023')");corre("setPeriodoHistRename('1')");
corre("confirmRenombrarHist('b')");
chk('el semestre elegido queda con la forma de siempre', ctx.S.historial[0]?.label==='2023-1');

// El verano no es "1" ni "2". En la UC se llama TAV; a otra universidad no se le
// presta ese término.
ctx.S.tenant='uc';
chk('en la UC el verano es la TAV', corre("etiquetaSemestre(2024,'v')")==='TAV 2024');
ctx.S.tenant='fen';
chk('en otra universidad se nombra sin pedirle el término prestado a la UC',
  corre("etiquetaSemestre(2024,'v')")==='Verano 2024');

// Ida y vuelta: lo que se guarda se vuelve a leer al reabrir el selector.
ctx.S.tenant='uc';
chk('lo guardado se vuelve a leer', JSON.stringify(corre("parseEtiquetaSemestre(etiquetaSemestre(2022,'v'))"))==='{"anio":2022,"periodo":"v"}');
chk('y también lo que dejó el archivado automático', JSON.stringify(corre("parseEtiquetaSemestre('2025-2')"))==='{"anio":2025,"periodo":"2"}');
// Un semestre cargado a mano antes del selector puede traer cualquier texto: ahí
// no se adivina, se parte del año en curso.
chk('un texto viejo cualquiera no rompe nada', corre("parseEtiquetaSemestre('primero 2024')")===null);

const sel=corre("selectorSemestreHTML(2024,'v','setA','setP')")||'';
chk('el selector ofrece las tres opciones y marca la elegida',
  /Primer semestre/.test(sel) && /Segundo semestre/.test(sel) && /TAV/.test(sel) && /sem-btn sel[\s\S]*TAV/.test(sel));
chk('y ofrece años para atrás, no solo el actual', (corre('aniosSemestre(0)')||[]).length>=10);

// Y el semestre nuevo se elige igual, no se escribe: era el otro lado del mismo
// problema —quien tipeaba mal el año quedaba con esa fila para siempre—.
chk('al cargar un semestre anterior también se elige, no se escribe',
  /<div class="sem-picker" id="m-hist-sem">\$\{selectorSemestreHTML\(histManual\.anio/.test(app) && !/id="m-hist-label"/.test(app));
chk('y lo guardado sale del selector', /const label=etiquetaSemestre\(histManual\.anio,histManual\.periodo\);/.test(app));

console.log('\n=== Se llega a las dos acciones desde el historial ===');
chk('la tarjeta del semestre las ofrece',
  /pedirBorrarHistorial\('\$\{esc\(h\.id\)\}'\)/.test(render) && /openRenombrarHistModal\('\$\{esc\(h\.id\)\}'\)/.test(render));

console.log('\n=== Un semestre cargado a mano no dice "Sem. undefined" ===');
// No viene de ningún semestre de carrera: el archivado sí trae el número, el
// manual no, y el template lo imprimía igual.
const linea=render.split('\n').find(l=>l.includes('margin-top:3px')&&l.includes('ramosHistorial.length'))||'';
const tpl=linea.slice(linea.indexOf('">')+2, linea.lastIndexOf('</div>'));
const pinta=(cs,n)=>{try{return vm.runInNewContext('`'+tpl+'`',{h:{careerSemestre:cs},ramosHistorial:{length:n}});}catch(e){return '';}};
chk('el manual solo muestra sus ramos', pinta(undefined,3)==='3 ramos');
chk('el archivado sigue mostrando su semestre', pinta(4,3)==='Sem. 4 · 3 ramos');
chk('y un ramo no se escribe en plural', pinta(undefined,1)==='1 ramo');

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
