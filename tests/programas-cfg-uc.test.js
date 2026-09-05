// Dos programas de Formación General recibidos en septiembre de 2026 no pueden
// llegar como pauta vacía. El test fija solo los datos que las fuentes declaran:
// no convierte fechas antiguas ni siglas pendientes en datos actuales.
const fs=require('fs'),vm=require('vm'),path=require('path');
const dataPath=process.env.GRADEHUB_TEST_DATA||path.join(__dirname,'..','data.js');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(dataPath,'utf8'),ctx);
const presets=vm.runInContext('PRESETS_UC',ctx);
let ok=0,fail=0;
const chk=(nombre,condicion)=>{console.log(`  ${condicion?'OK  ':'FAIL'} ${nombre}`);if(condicion)ok++;else fail++;};
const pesos=p=>p.evals.reduce((total,e)=>total+e[1],0);
const conFechas=p=>p.evals.some(e=>e[2]&&e[2].fecha);

console.log('\n=== Programas de Formación General UC ===');
const sorda=presets['Fundamentos Básicos de Cultura Sorda y Lengua de Señas Chilena'];
chk('Cultura Sorda conserva sus siete evaluaciones y el 100%',!!sorda&&sorda.creditos===10&&pesos(sorda)===100&&sorda.evals.map(e=>e[1]).join('|')==='10|20|15|15|30|5|5');
chk('Cultura Sorda no convierte el calendario antiguo en fechas vigentes',!!sorda&&!sorda.periodo&&!conFechas(sorda));

const noir=presets['El misterioso caso del curso de ficción policial (Edición especial Santiago Negro)'];
chk('Ficción policial conserva su estructura ponderada',!!noir&&noir.creditos===10&&pesos(noir)===100&&noir.evals.map(e=>e[0]).join('|')==='Controles de lectura|Exposiciones orales|Co evaluación|Participación en foros|Dossier Santiago Negro');
chk('los tres controles quedan como casillas del bloque, no como pesos inventados',!!noir&&noir.evals[0][1]===30&&noir.evals[0][2].slots===3&&noir.evals[0][2].slotLabel==='Control');
chk('Ficción policial conserva la regla de asistencia sin fingir que se calcula',!!noir&&!noir.periodo&&!conFechas(noir)&&noir.reglasDelCurso.some(r=>r.includes('75%')));

const ciudadania=presets['Ciudadanía y Derechos humanos: Enfoques interdisciplinarios'];
chk('Ciudadanía y Derechos Humanos conserva sus cuatro evaluaciones y el 100%',!!ciudadania&&ciudadania.periodo==='2026-2'&&ciudadania.creditos===10&&pesos(ciudadania)===100&&ciudadania.evals.map(e=>e[1]).join('|')==='30|30|30|10');
chk('Ciudadanía solo agenda la entrega inequívoca del ensayo',!!ciudadania&&ciudadania.evals[1][2].fecha==='2026-10-27'&&ciudadania.evals.filter(e=>e[2]&&e[2].fecha).length===1&&ciudadania.reglasDelCurso.some(r=>r.includes('60%')));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
