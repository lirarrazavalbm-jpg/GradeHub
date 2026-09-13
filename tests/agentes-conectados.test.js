// La vinculación es revocable solo si el estudiante puede verla y cortarla.
// Este test revisa el contrato de la pantalla sin requerir Supabase real: la
// base se aplica manualmente antes de mergear, así que el CI no puede llamarla.
const fs=require('fs');
const raiz=__dirname+'/../';
const app=fs.readFileSync(process.env.GRADEHUB_APP||raiz+'app.js','utf8');
const css=fs.readFileSync(process.env.GRADEHUB_CSS||raiz+'styles.css','utf8');
let ok=0,fail=0;
const chk=(nombre,condicion)=>{console.log(`  ${condicion?'OK  ':'FAIL'} ${nombre}`);if(condicion)ok++;else fail++;};

console.log('\n=== Conectar un agente no deja un acceso permanente a la vista ===');
chk('Ajustes tiene una sección propia de agentes',/\['Tu cuenta','agentes','Agentes conectados'/.test(app)&&/section==='agentes'/.test(app));
// `rpcAgente(...)` es el envoltorio que reintenta una vez cuando el JWT venció;
// llama a la misma RPC. Lo que estas comprobaciones cuidan es que el dato venga
// de la base y no de un generador local, así que aceptan las dos formas.
const llamaRpc=(nombre,args='')=>new RegExp("(?:supabaseClient\\.rpc|rpcAgente)\\('"+nombre+"'"+args+"\\)").test(app);
chk('no quedan funciones, RPC ni temporizadores del camino por código',
  !/crearCodigoAgente|pintarCodigoAgente|instruccionesAgente|copiarInstruccionesAgente|detenerCodigoAgente|agenteCodigo|AGENTE_CODIGO|crear_codigo_agente|canjear_codigo_agente/.test(app));

// Ejecutar el panel real evita dar por eliminado un camino que solo cambió de texto.
const vm=require('vm');
const inicio=app.indexOf('    if(section===\'agentes\')return');
const fin=app.indexOf("    if(section==='sugerencias')",inicio);
const panel=vm.runInNewContext('(function(section){'+app.slice(inicio,fin)+'})',{currentUser:{id:'sintetico'}});
const html=panel('agentes');
chk('la pantalla solo ofrece vincular por URL, sin comandos ni código temporal',
  /onclick="crearUrlAgente\(\)"/.test(html)&&
  !/agent-alt|s-agent-code|crearCodigoAgente|Claude Code|Codex|Generar código|corre comandos/.test(html));
chk('quedan la lista revocable y las propuestas pendientes',
  /id="s-agent-list"/.test(html)&&/cargarAgentesConectados\(\)/.test(html)&&/cargarPropuestasPautaAgente/.test(html));
const sinSesion=vm.runInNewContext('(function(section){'+app.slice(inicio,fin)+'})',{currentUser:null})('agentes');
chk('sin sesión no ofrece crear una URL y explica cómo entrar',
  /Necesitas iniciar sesión/.test(sinSesion)&&!/onclick="crearUrlAgente/.test(sinSesion));

console.log('\n=== La persona ve y controla quién puede entrar ===');
chk('la lista sale de listar_agentes',llamaRpc('listar_agentes'));
chk('cada agente muestra conexión, último uso y vencimiento',/Conectado desde/.test(app)&&/Último uso/.test(app)&&/Vence/.test(app));
chk('la interfaz copia solo las columnas permitidas de la RPC',/agentesConectados=\(Array\.isArray\(data\)\?data:\[\]\)\.map\(a=>\{/.test(app)&&/const id=String\(a\.id\|\|''\)/.test(app)&&/created_at:a\.created_at\|\|null,last_used_at:a\.last_used_at\|\|null,expires_at:a\.expires_at\|\|null/.test(app));
chk('desconectar pide confirmación y revoca solo el id elegido',/function confirmarRevocarAgente/.test(app)&&/showConfirm\(`¿Desconectar/.test(app)&&llamaRpc('revocar_agente',',\\{p_id:id\\}'));

console.log('\n=== Los permisos se entienden antes de conectar ===');
// Se comprueban los CONCEPTOS y no la frase: el texto se reescribió al ordenar
// la pantalla y una comprobación literal convierte cualquier mejora de copy en
// un test rojo. Lo que no puede desaparecer es qué ve, qué puede hacer y el
// límite de las notas — eso es lo que la persona necesita leer antes de
// conectar algo a sus datos.
const explica=/<div class="agent-explainer">[\s\S]*?<\/div>/.exec(app);
chk('la pantalla explica qué puede hacer el agente',!!explica);
if(explica){
  const t=explica[0];
  chk('dice que ve ramos, notas y fechas',/ramos/i.test(t)&&/notas/i.test(t)&&/fechas/i.test(t));
  chk('dice que puede agregar un ramo y proponer una pauta',/agregar un ramo/i.test(t)&&/pauta/i.test(t));
  chk('y dice el límite: no escribe notas',/no puede escribir tus notas/i.test(t));
}
chk('la URL y las fichas siguen legibles en pantalla angosta',/\.agent-url-value\{[^}]*word-break:break-all/.test(css)&&/\.agent-link-heading b\{[^}]*text-overflow:ellipsis/.test(css));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
