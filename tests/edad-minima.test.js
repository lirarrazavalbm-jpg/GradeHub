// Nadie crea una cuenta sin declarar que tiene la edad mínima.
//
// No hay casilla: el paso 1 avisa junto al botón que continuar es declararlo.
// Eso obliga a que tres textos digan lo mismo —el aviso, los términos y el
// comentario de la columna—, porque si uno queda en otra edad la declaración
// deja de sostenerse. Este test es el que los amarra.
//
// La reja vive en el onboarding y NO en el formulario de correo, porque por el
// onboarding pasan también las cuentas de Google, que nunca ven ese
// formulario. Ese mismo motivo hace que la aceptación de los términos se
// registre ahí: hasta el 2026-09-23 solo se anotaba en el camino del correo, y
// quien entraba con Google quedaba sin constancia.
//
// 16 es decisión de Martín, no un mínimo legal: COPPA pide 13 y la Ley 21.719
// chilena 14. Los cubre a los dos.
const EDAD_MINIMA = 16;
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

// El aviso vive DENTRO del paso 1, que es el que tiene el botón Continuar: si
// se fuera a otro paso, alguien declararía algo que nunca leyó.
const paso1Crudo=(html.match(/<div class="ob-step" data-step="1">[\s\S]*?data-step="2"/)||[''])[0];
chk('el paso 1 avisa que continuar es declarar la edad',
  /Al continuar declaras que tienes/.test(paso1Crudo));
chk(`y la edad del aviso es ${EDAD_MINIMA}`,
  new RegExp('<b>'+EDAD_MINIMA+' años o más</b>').test(paso1Crudo));
chk('el aviso enlaza los términos y la política',
  /href="\/terminos\.html"/.test(paso1Crudo)&&/href="\/privacidad\.html"/.test(paso1Crudo));
chk('no quedó ninguna casilla de edad que marcar',!/id="ob-edad"/.test(html));
// Y el paso 1 sigue pidiendo lo único que pide: el nombre.
chk('sin nombre, el paso 1 no se da por válido',val('obStepValid')(1,{nombre:''})===false);
chk('con nombre, sí',val('obStepValid')(1,{nombre:'Persona Sintética'})===true);

// Los tres textos que tienen que decir la misma edad.
const terminos=fs.readFileSync(path.join(raiz,'terminos.html'),'utf8');
chk('los términos declaran la misma edad mínima',
  new RegExp('tener '+EDAD_MINIMA+' años o más').test(terminos));
chk('y explican que no se pide fecha de nacimiento',
  /No pedimos tu fecha de nacimiento/.test(terminos));
chk('el comentario de la columna dice la misma edad',
  new RegExp('declaró tener '+EDAD_MINIMA+' años o más').test(sql));
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
