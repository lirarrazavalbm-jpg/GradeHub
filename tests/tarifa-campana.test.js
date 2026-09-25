// Cuánto cuesta una campaña de clases (decisión de Lucas del 2026-09-25):
// $100 por día visible y, por PERSONA, $10 si la vio, $50 si la abrió y
// $1.000 si contactó. El profesor pone un tope y nunca paga más que eso.
//
// El servidor cuenta y tiene su propia tarifa (tarifa_campana_clp). Si la de
// la app se desalinea, el profesor vería un costo distinto del que se cobraría.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ctx={console,Intl};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','marketplace.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','clases_particulares.sql'),'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== La misma tarifa en la app y en el servidor ===');
const tarifaSql=(sql.match(/function public\.tarifa_campana_clp[\s\S]*?\$\$;/)||[''])[0];
const t=run('TARIFA_CAMPANA');
chk('la app cobra $100, $10, $50 y $1.000',t.dia===100&&t.vista===10&&t.apertura===50&&t.contacto===1000);
chk('el servidor dice lo mismo',['dia','vista','apertura','contacto'].every(k=>new RegExp(`when '${k}' then ${t[k]}\\b`).test(tarifaSql)));

console.log('\n=== La cuenta ===');
ctx.__c={dias_cobrados:6,vistas:120,aperturas:15,contactos:4,tope_clp:10000};
let c=run('costoCampanaClase(__c)');
chk('suma cada concepto',c.bruto===6*100+120*10+15*50+4*1000&&c.total===6550&&!c.agotada);
chk('lo dice con palabras',run('lineaCostoCampanaClase(costoCampanaClase(__c))')===
  '120 personas te vieron ($1.200) · 15 la abrieron ($750) · 4 te contactaron ($4.000) · 6 días publicada ($600)');
ctx.__c={dias_cobrados:10,vistas:300,aperturas:40,contactos:9,tope_clp:10000};
c=run('costoCampanaClase(__c)');
chk('nunca pasa del tope',c.bruto>10000&&c.total===10000&&c.agotada);
ctx.__c={dias_cobrados:3,vistas:5,aperturas:0,contactos:0,tope_clp:null};
chk('un anuncio de antes, sin tope, no se topea',run('costoCampanaClase(__c)').total===350&&!run('costoCampanaClase(__c)').agotada);
chk('sin campaña no hay costo que inventar',run('costoCampanaClase(null)')===null);
ctx.__c={dias_cobrados:-2,vistas:1.5,aperturas:'x',contactos:null,tope_clp:5000};
chk('números imposibles cuentan como cero',run('costoCampanaClase(__c)').bruto===0);

console.log('\n=== Días, inicio y tope ===');
const hoy=Date.parse('2026-09-25T15:00:00Z');ctx.__hoy=hoy;
const val=e=>{ctx.__e=e;return run('validarCampanaClase(__e,__hoy)');};
chk('10 días sin fecha parten al aprobarse',(r=>r.ok&&r.datos.dias===10&&r.datos.inicio===null&&r.datos.tope_clp===10000)(val({dias:10,tope_clp:10000})));
chk('se puede programar para después',val({dias:5,inicio:'2026-10-01',tope_clp:5000}).ok);
chk('ni cero días ni más de 60',!val({dias:0,tope_clp:5000}).ok&&!val({dias:61,tope_clp:5000}).ok);
chk('una fecha que ya pasó no',!val({dias:5,inicio:'2026-09-20',tope_clp:5000}).ok);
chk('hoy sí, en hora de Chile',val({dias:5,inicio:'2026-09-25',tope_clp:5000}).ok);
chk('el tope va de $1.000 a $5.000.000',!val({dias:5,tope_clp:999}).ok&&!val({dias:5,tope_clp:5000001}).ok&&val({dias:5,tope_clp:1000}).ok);
chk('las fechas se cuentan en días calendario',run("diasEntreFechasClase('2026-10-01','2026-10-10')")===9&&run("sumarDiasFechaClase('2026-10-30',3)")==='2026-11-02');

console.log('\n=== El servidor ===');
chk('la campaña se paga por persona, una vez por anuncio y tipo',/primary key \(anuncio_id, user_id, tipo\)/.test(sql));
chk('no cuentan el profesor ni una cuenta sin ramos',/cuenta_para_campana[\s\S]*?autor_id = p_user_id[\s\S]*?user_ramos where user_id = p_user_id/.test(sql));
chk('un anuncio publicado no cambia su tope ni sus días',/function public\.anuncio_propio[\s\S]*?t\.estado in \('borrador', 'en_revision', 'pausado'\)/.test(sql)&&
  /anuncio_campanas_update_propia[\s\S]*?anuncio_propio\(anuncio_id, true\)/.test(sql));

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail?1:0);
