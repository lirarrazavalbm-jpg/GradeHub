// Una pauta leída por un agente puede tener un peso mal extraído. Esta suite
// fija la frontera: se rechaza antes de guardarla y, si está sana, sigue
// pendiente hasta que la persona la confirma y recién entonces aporta al
// consenso. No llama Supabase: el SQL se aplica manualmente.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const leer=(env,archivo)=>{
  const ruta=process.env[env]||path.join(raiz,archivo);
  try{return fs.readFileSync(ruta,'utf8');}catch(e){return '';}
};
const herramientas=leer('GRADEHUB_HERRAMIENTAS','functions/mcp/herramientas.js');
const endpoint=leer('GRADEHUB_MCP','functions/mcp/[[ruta]].js');
const sql=leer('GRADEHUB_SQL','supabase/agente_propuestas.sql');
const app=leer('GRADEHUB_APP','app.js');
const session=leer('GRADEHUB_SESSION','app-session.js');
let ok=0,fail=0;
const chk=(nombre,condicion)=>{console.log(`  ${condicion?'OK  ':'FAIL'} ${nombre}`);if(condicion)ok++;else fail++;};

function cargarHerramientas(){
  const codigo=herramientas
    .replace(/^export const /gm,'const ')
    .replace(/^export function /gm,'function ');
  const ctx={};vm.createContext(ctx);vm.runInContext(`${codigo};globalThis.out={HERRAMIENTAS,validarPropuestaPauta:typeof validarPropuestaPauta==='function'?validarPropuestaPauta:null};`,ctx);
  return ctx.out||{};
}
const {HERRAMIENTAS=[],validarPropuestaPauta}=cargarHerramientas();
const valida={ramo:'IIC2333',fuente:'Programa del curso, sección Evaluaciones',evaluaciones:[
  {nombre:'Interrogación 1',peso:30},{nombre:'Interrogación 2',peso:30},{nombre:'Examen',peso:40},
]};

console.log('\n=== El agente recibe un contrato que puede cumplir ===');
const pauta=HERRAMIENTAS.find(h=>h.nombre==='proponer_pauta');
chk('evaluaciones se declara como arreglo MCP, no como texto para interpretar',!!pauta&&pauta.args.evaluaciones.type==='array'&&pauta.args.evaluaciones.items.properties.peso.type==='number');
chk('una pauta de 100% con fuente pasa la validación local',typeof validarPropuestaPauta==='function'&&validarPropuestaPauta(valida)===null);
chk('un peso que no suma 100 se rechaza con una explicación',typeof validarPropuestaPauta==='function'&&/deben sumar 100/.test(validarPropuestaPauta({...valida,evaluaciones:[{nombre:'Prueba',peso:60}]} )||''));
chk('un nombre vacío no se guarda',typeof validarPropuestaPauta==='function'&&/nombre/.test(validarPropuestaPauta({...valida,evaluaciones:[{nombre:'',peso:100}]})||''));
chk('dos nombres iguales aunque cambie la mayúscula se rechazan',typeof validarPropuestaPauta==='function'&&/no repitas/.test(validarPropuestaPauta({...valida,evaluaciones:[{nombre:'Control 1',peso:50},{nombre:'control 1',peso:50}]})||''));

console.log('\n=== La base conserva una propuesta pendiente, no una pauta aplicada ===');
chk('la tabla muere con la cuenta y tiene RLS activa',/agent_pauta_proposals[\s\S]{0,260}references auth\.users\(id\) on delete cascade/i.test(sql)&&/alter table public\.agent_pauta_proposals enable row level security/i.test(sql));
chk('la RPC valida nombres, duplicados y suma antes de insertar',/Propuesta inválida: no repitas una evaluación/i.test(sql)&&/abs\(v_total-100\)/.test(sql)&&/insert into public\.agent_pauta_proposals/i.test(sql));
chk('solo el token vigente del agente puede guardar una propuesta',/from public\.agent_links[\s\S]{0,120}expires_at > now\(\)/i.test(sql)&&/proponer_pauta_agente\(text, text, text, jsonb, text\).*to anon, authenticated/i.test(sql));
chk('la persona dueña lista y resuelve su propia propuesta',/where user_id = auth\.uid\(\) and status = 'pendiente'/i.test(sql)&&/where id=p_id and user_id=auth\.uid\(\) and status='pendiente'/i.test(sql));

console.log('\n=== Confirmar es el único momento que modifica el semestre y reporta ===');
chk('el MCP guarda por RPC y devuelve el error corregible al agente',/rpc\('proponer_pauta_agente'/.test(endpoint)&&/validarPropuestaPauta\(args\)/.test(endpoint)&&/error\(id, -32602, propuesta\.error\)/.test(endpoint));
chk('al entrar se muestra la pauta completa pendiente, sin bloquear las notas',/cargarPropuestasPautaAgente\(\{mostrar:true\}\)/.test(session)&&/No se han aplicado/.test(app)&&/Fuente:/.test(app));
chk('aplicar exige confirmación y conserva notas por nombre',/showConfirm\(`¿Aplicar la pauta de \$\{ramo\.nombre\}\?`/.test(app)&&/fusionarPauta\(ramo,nuevas\)/.test(app));
chk('la confirmación, no la propuesta, alimenta catalog_reports',/async function aportarPropuestaAlCatalogo/.test(app)&&/rpc\('submit_catalog_report'/.test(app)&&/await resolverPropuestaPauta\(id,'aplicada'\)/.test(app));
chk('descartar no toca ramos ni notas',/Se elimina esta propuesta pendiente\. No cambia tus ramos ni tus notas\./.test(app)&&/resolverPropuestaPauta\(id,'descartada'\)/.test(app));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
