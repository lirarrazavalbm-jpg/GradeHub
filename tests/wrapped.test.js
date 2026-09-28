// El Wrapped tiene que decir los mismos números que Inicio y no aparecer antes
// de tiempo. La pauta de ejemplo va acá adentro, no sale del catálogo.
const fs=require('fs'),vm=require('vm');
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

// El 20 y no antes: los exámenes y recuperativos tienen que estar ingresados.
chk('no aparece el 19 de diciembre',!run('wrappedDisponible(new Date(2026,11,19))'));
chk('aparece el 20 de diciembre',run('wrappedDisponible(new Date(2026,11,20))'));
chk('se va en marzo',!run('wrappedDisponible(new Date(2027,2,1))'));

const sql=fs.readFileSync(raiz+'supabase/universidad_posicion.sql','utf8');
chk('SQL: exige sesión',/uid is null/.test(sql));
chk('SQL: mínimo de cinco personas',/n < 5/.test(sql));
chk('SQL: solo authenticated la ejecuta',/revoke all on function public\.universidad_posicion\(text\) from public/.test(sql)&&/to authenticated;/.test(sql));
chk('SQL: no crea tablas nuevas',!/create table/i.test(sql));

if(fail){console.log(`\n${fail} fallaron`);process.exit(1);}
