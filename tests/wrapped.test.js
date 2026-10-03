// El Wrapped tiene que decir los mismos números que Inicio y no aparecer antes
// de tiempo. La pauta de ejemplo va acá adentro, no sale del catálogo.
const fs=require('fs'),vm=require('vm');
process.env.TZ='America/Santiago';
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js']
  .map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
function el(){let html='';const n={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false;}},children:[],dataset:{},
  addEventListener(){},appendChild(h){return h;},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return el();},querySelectorAll(){return [];},focus(){},remove(){}};
  Object.defineProperty(n,'innerHTML',{get(){return html;},set(v){html=String(v);}});return n;}
const ids={};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:id=>ids[id]||(ids[id]=el()),createElement:el,addEventListener(){},removeEventListener(){},documentElement:el(),querySelector(){return el();},querySelectorAll(){return [];},body:el()},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
let fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(!c)fail++;};
const run=code=>vm.runInContext(code,ctx);

const ramo=(nombre,cats)=>({id:nombre,nombre,color:'#000',categorias:cats.map(([cn,peso,notas],i)=>({id:nombre+i,nombre:cn,peso,directNota:true,notas:notas.map((v,j)=>({id:nombre+i+'-'+j,nombre:cn,valor:v}))})),gates:[]});
ctx.__ramos=[
  ramo('Micro',[['Solemne 1',50,[6.5]],['Solemne 2',50,[5.5]]]),
  ramo('Conta',[['Solemne 1',50,[3.0]],['Solemne 2',50,[4.0]]]),
  ramo('Vacío',[['Examen',100,[]]]),
];
const d=run('datosWrapped(__ramos)');
chk('cuenta solo notas con valor',d.nNotas===4);
chk('un ramo sin notas no entra',d.nRamos===2);
chk('el promedio es el mismo gpa() de Inicio',Math.abs(d.gpa-run('gpa(__ramos)'))<1e-9);
chk('mejor nota 6,5 de Micro',d.mejor.valor===6.5&&d.mejor.ramo==='Micro');
chk('estrella Micro, el que más costó Conta',d.estrella.r.nombre==='Micro'&&d.dificil.r.nombre==='Conta');
chk('aprobando cuenta con el mismo criterio del semáforo',d.aprobando===1);
chk('sin notas no hay Wrapped',run('datosWrapped([])')===null);

ctx.__uno=[ctx.__ramos[0]];
chk('con un ramo no se repite como "el que más costó"',run('datosWrapped(__uno)').dificil===null);

const final=run('slidesWrapped(datosWrapped(__ramos),{uni:{total:11,mejorQue:70}},"2026-2")').pop();
chk('la tarjeta para compartir no nombra el ramo que más costó',!JSON.stringify(final).includes('Conta'));
chk('la tarjeta incluye la comparación con la universidad',JSON.stringify(final).includes('70%'));

ctx.__ramos[0].nombre='<img src=x onerror=alert(1)>';
chk('los nombres se escapan',!run('JSON.stringify(slidesWrapped(datosWrapped(__ramos),null,"x"))').includes('<img'));

// Ventana de esta campaña: diciembre y enero, según el calendario de Chile.
chk('no aparece el 30 de noviembre',!run('wrappedDisponible(new Date(2026,10,30))'));
chk('aparece el 1 de diciembre',run('wrappedDisponible(new Date(2026,11,1))'));
chk('se va el 1 de febrero',!run('wrappedDisponible(new Date(2027,1,1))'));

// Las piezas visuales dicen lo mismo que los números.
ctx.__ramos[0].nombre='Micro';
const d2=run('datosWrapped(__ramos)');
chk('la grilla tiene un punto por nota',d2.notasColores.length===d2.nNotas);
chk('el ranking va de mejor a peor',d2.ranking.map(x=>x.nombre).join()==='Micro,Conta');
const cifra=run('cifraWrapped("5.6",1)');
chk('la cifra que cuenta termina en el texto que formateó la app',/data-hasta="5.6"/.test(cifra)&&/data-desde="1"/.test(cifra)&&/>5\.6<\/span>/.test(cifra));
chk('VoiceOver lee la cifra final, no el conteo',/aria-hidden="true"/.test(cifra)&&/class="wrapped-oculto">5\.6</.test(cifra));
chk('un porcentaje cuenta con su signo',/data-suf="%"/.test(run('cifraWrapped("84%")')));
const todas=JSON.stringify(run('slidesWrapped(datosWrapped(__ramos),{curso:{ramo:"Micro",mejorQue:84,total:26},uni:{total:121,mejorQue:71}},"2026-2")'));
chk('promedio con arco, estrella con ranking y comparaciones con regla',/wrapped-arco/.test(todas)&&/wrapped-ranking/.test(todas)&&(todas.match(/wrapped-regla/g)||[]).length===2);
chk('el arco no usa colores del semáforo',!/var\(--(green|yellow|red)/.test(run('arcoWrapped(3.2)')));

// HIG, Accessibility: un gesto necesita una alternativa, y el texto tiene que
// poder agrandarse al 200% sin que nada se salga de la pantalla.
const render=fs.readFileSync(raiz+'render-main.js','utf8'),css=fs.readFileSync(raiz+'styles.css','utf8');
chk('VoiceOver y teclado tienen Anterior y Siguiente',/data-paso="-1"[^>]*>Anterior</.test(render)&&/data-paso="1"[^>]*>Siguiente</.test(render));
chk('los números gigantes no crecen con el texto del sistema',/\.wrapped-big\{font-size:clamp\(\d+px,[^;]*\d+px\)/.test(css));
chk('la pantalla se desplaza si el texto grande no cabe',/\.wrapped-slide\{[^}]*overflow-y:auto/.test(css));

const sql=fs.readFileSync(raiz+'supabase/universidad_posicion.sql','utf8');
chk('SQL: exige sesión',/uid is null/.test(sql));
chk('SQL: mínimo de cinco personas',/n < 5/.test(sql));
// `from public` solo no alcanza en Supabase: `anon` tiene su propio EXECUTE.
chk('SQL: solo authenticated la ejecuta (anon revocado aparte)',/revoke all on function public\.universidad_posicion\(text\) from public, anon;/.test(sql)&&/to authenticated;/.test(sql));
chk('SQL: no crea tablas nuevas',!/create table/i.test(sql));

if(fail){console.log(`\n${fail} fallaron`);process.exit(1);}
