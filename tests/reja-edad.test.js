// Nadie crea una cuenta sin declarar que tiene la edad mínima.
//
// La reja vive en el paso 1 del onboarding y NO en el formulario de correo,
// porque por el onboarding pasan también las cuentas de Google, que nunca ven
// ese formulario. Ese mismo motivo hace que la aceptación de los términos se
// registre ahí: hasta el 2026-09-23 solo se anotaba en el camino del correo, y
// quien entraba con Google quedaba sin constancia.
//
// 14 y no 13: COPPA pone la línea en 13 para Estados Unidos y la Ley 21.719
// chilena en 14. Se toma la más alta, que cumple las dos.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const src=['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const html=fs.readFileSync(path.join(raiz,'index.html'),'utf8');
const sesion=fs.readFileSync(path.join(raiz,'app-session.js'),'utf8');
const sql=fs.readFileSync(path.join(raiz,'supabase/edad_declarada.sql'),'utf8');

const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},closest(){return null;},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
const val=e=>vm.runInContext(e,ctx);

let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n);}};

const base={nombre:'Persona Sintética',tenant:'fen',carrera:'IICG',semestre:2};
chk('sin declarar la edad, el paso 1 no se da por válido',val('obStepValid')(1,{...base,edad:false})===false);
chk('con el nombre y la declaración, sí',val('obStepValid')(1,{...base,edad:true})===true);
chk('y la edad sola tampoco basta: falta el nombre',val('obStepValid')(1,{nombre:'',edad:true})===false);
// obPasoIncompleto es lo que mira completeOnboarding antes de crear la cuenta:
// si la reja no estuviera ahí, el botón se podría saltar.
chk('el final del onboarding devuelve al paso 1 si falta la declaración',
  (()=>{val("selectedTenant='fen';selectedCarrera='IICG';selectedSem=2");
    return val('obPasoIncompleto')()===1;})());

chk('la casilla existe en el paso 1 del onboarding y dice 14 años',
  /id="ob-edad"/.test(html)&&/14 años o más/.test(html));
// El paso 1 declara la edad, no la pide: ni campo de fecha de nacimiento ni
// nada que identifique más de lo necesario para saber si alguien puede entrar.
const paso1=(html.match(/<div class="ob-step" data-step="1">[\s\S]*?data-step="2"/)||[''])[0].replace(/<!--[\s\S]*?-->/g,'');
chk('el paso 1 no pide fecha de nacimiento',!!paso1&&!/nacimiento|type="date"/i.test(paso1));
chk('la declaración queda registrada con su fecha',/edad_declarada_en:new Date\(\)\.toISOString\(\)/.test(sesion));
chk('y arrastra la aceptación de términos, para las cuentas de Google',
  /async function registrarDeclaracionEdad\(\)[\s\S]{0,600}registrarAceptacionLegal\(\)/.test(sesion));
chk('completeOnboarding la llama',/registrarDeclaracionEdad\(\);/.test(fs.readFileSync(path.join(raiz,'app.js'),'utf8')));
chk('la columna es aditiva y nullable: no toca las cuentas que ya existen',
  /add column if not exists edad_declarada_en timestamptz;/.test(sql)&&!/not null/i.test(sql));

console.log(`\n${ok} ok, ${fail} fail`);
if(fail)process.exit(1);
