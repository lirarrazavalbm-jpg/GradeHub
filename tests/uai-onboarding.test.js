// La UAI existía como tenant pero oculta y sin ninguna carrera declarable: quien
// estudiaba ahí no podía ni elegir su universidad. Ahora entra por el mismo
// camino que la UAndes —declarar carrera y armar los ramos a mano, que es el
// camino del 95%— y queda lista para recibir sus mallas cuando se transcriban.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const ctx={console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz+'data.js','utf8')+';globalThis.T=TENANTS;globalThis.CD=CARRERAS_DECLARABLES;',ctx);
const app=fs.readFileSync(process.env.GRADEHUB_APP||raiz+'app.js','utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== La UAI se puede elegir ===');
chk('el tenant ya no está oculto', !ctx.T.uai.oculto);
chk('tiene carreras declarables', (ctx.CD.uai||[]).length >= 20);
chk('ninguna promete una malla que no existe', (ctx.CD.uai||[]).every(c=>!c.malla));
// Nombres exactos de la página oficial de mallas, no inventados ni normalizados.
chk('están las que publica la UAI',
  ['Derecho','Psicología','Ingeniería Comercial','Ingeniería Civil en Bioingeniería']
    .every(n=>(ctx.CD.uai||[]).some(c=>c.n===n)));

console.log('\n=== El cargador de mallas sirve a cualquier universidad ===');
// Antes hablaba solo de la UC: el archivo, la global y la condición del paso 5
// estaban escritos a mano para ese tenant. La UAI habría necesitado repetir los
// tres, que es exactamente como este repo se ha equivocado antes.
chk('hay una tabla de archivo por universidad', /ARCHIVO_MALLAS\s*=\s*\{[^}]*uai:/.test(app));
chk('la búsqueda de mallas extra no está atada a la UC', /function mallasExtraDe\(tenant\)/.test(app));
chk('el paso 5 pide el archivo del tenant que corresponda', /cargarMallasUC\(selectedTenant\)/.test(app));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
