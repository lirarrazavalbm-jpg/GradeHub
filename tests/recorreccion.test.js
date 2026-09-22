// Una recorrección es un recordatorio sobre una nota existente. No cambia el
// cálculo, no inventa fecha y no se pierde al editar nuevamente la casilla.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=process.env.GRADEHUB_ROOT||path.join(__dirname,'..');
const src=['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return stub},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:stub,querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console,syncToCloud(){},renderAll(){},renderRamo(){},renderHome(){},renderAgenda(){},animarPromedio(){},mostrarEcoGpa(){},cambioDePromedio:()=>false,getComputedStyle:()=>({getPropertyValue:()=> '0ms'})};
vm.createContext(ctx);vm.runInContext(src,ctx);
ctx.animarPromedio=()=>{};ctx.mostrarEcoGpa=()=>{};ctx.cambioDePromedio=()=>false;
const run=s=>vm.runInContext(s,ctx);let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const estado={ramos:[{id:'r1',nombre:'Cálculo',color:'#123456',gates:[],categorias:[{id:'c1',nombre:'Controles',peso:100,directNota:true,slots:2,notas:[{id:'n1',nombre:'Control 1',valor:5.2,peso:1,slot:0,recorreccionPendiente:true},{id:'n2',nombre:'Control 2',valor:null,peso:1,slot:1,recorreccionPendiente:true}]}]}]};
run(`S=normalize(${JSON.stringify(estado)});currentRamoId='r1'`);

console.log('\n=== La marca no toca el cálculo ===');
const promedioMarcado=run('ramoAvg(S.ramos[0])'),gpaMarcado=run('gpa(S.ramos)');
run('delete S.ramos[0].categorias[0].notas[0].recorreccionPendiente');
chk('marcar no mueve el promedio del ramo',run('ramoAvg(S.ramos[0])')===promedioMarcado);
chk('ni mueve el GPA',run('gpa(S.ramos)')===gpaMarcado);

console.log('\n=== Solo una nota rendida puede quedar marcada ===');
run(`S=normalize(${JSON.stringify(estado)});currentRamoId='r1'`);
chk('normalize conserva la marca de la nota rendida',run('S.ramos[0].categorias[0].notas[0].recorreccionPendiente===true'));
chk('y descarta la marca de una evaluación sin nota',run('S.ramos[0].categorias[0].notas[1].recorreccionPendiente===undefined'));
chk('el control no aparece para una evaluación sin nota',run("controlRecorreccionHTML({valor:null,recorreccionPendiente:true})===''"));
chk('la opción explica cómo resolverla',/Desmárcalo cuando vuelva corregida/.test(run('controlRecorreccionHTML(S.ramos[0].categorias[0].notas[0])')));

console.log('\n=== Editar la nota conserva la marca ===');
ctx.save=()=>{};ctx.track=()=>{};ctx.showToast=()=>{};
ctx.setSlotNota('c1',0,'5,8');
chk('cambió el número',run('S.ramos[0].categorias[0].notas[0].valor===5.8'));
chk('la recorrección sigue pendiente',run('S.ramos[0].categorias[0].notas[0].recorreccionPendiente===true'));

console.log('\n=== La Agenda la muestra sin inventar una fecha ===');
const recs=JSON.parse(run('JSON.stringify(agendaRecorrecciones().map(e=>({nota:e.nota.nombre,fecha:e.nota.fecha||null})))'));
chk('aparece entre las recorrecciones',recs.length===1&&recs[0].nota==='Control 1');
chk('y sigue sin fecha',recs[0].fecha===null);
chk('no se mezcla con agendaEvents',run('agendaEvents().length===0'));
const html=run('agendaRecorreccionesHTML(agendaRecorrecciones())');
chk('la Agenda la presenta como recorrección',/Por mandar a recorregir/.test(html)&&/Control 1/.test(html));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
