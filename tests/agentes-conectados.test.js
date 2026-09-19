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
// La pantalla usa dos globales del propio app.js: el escapador y los mensajes
// que el estudiante le copia a su agente. Se cargan en el mismo contexto en vez
// de simularlos, para que este test siga mirando el texto real.
const contexto={currentUser:{id:'sintetico'}};
const iPrompts=app.indexOf('const PROMPTS_AGENTE = {');
vm.runInNewContext(app.slice(iPrompts,app.indexOf('\n};',iPrompts)+3)+';this.PROMPTS_AGENTE=PROMPTS_AGENTE;',contexto);
vm.runInNewContext(app.match(/function esc\([^]*?\n\}/)[0]+';this.esc=esc;',contexto);
const panel=vm.runInNewContext('(function(section){'+app.slice(inicio,fin)+'})',contexto);
const html=panel('agentes');
chk('la pantalla solo ofrece vincular por URL, sin comandos ni código temporal',
  /onclick="crearUrlAgente\(\)"/.test(html)&&
  !/agent-alt|s-agent-code|crearCodigoAgente|ChatGPT|Claude|Gemini|Codex|Generar código|corre comandos/.test(html));
const iPrompt=html.indexOf('onclick="copiarPromptConectorAgente()"');
const iNombre=html.indexOf('id="s-agent-url-nombre"');
const iCrear=html.indexOf('onclick="crearUrlAgente()"');
chk('primero entrega un mensaje y después pide nombre y crea la URL',
  iPrompt>-1&&iPrompt<iNombre&&iNombre<iCrear);
chk('el mensaje le pide al agente explicar dónde va el conector',
  /Explícame paso a paso dónde debo agregar un conector o servidor MCP/.test(html));
chk('advierte que la URL no se manda por el chat',
  /No me pidas que envíe la URL por el chat/.test(html)&&/no la envíes por el chat/.test(app));
chk('el botón copia el mismo mensaje que se muestra',
  /async function copiarPromptConectorAgente\(\)[\s\S]*?s-agent-prompt-text[\s\S]*?navigator\.clipboard\.writeText\(texto\)/.test(app));
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

console.log('\n=== Los mensajes que se le copian a un agente ===');
const P=contexto.PROMPTS_AGENTE;
chk('hay uno para el repaso semanal, uno para la próxima evaluación y uno para el semestre',
  !!(P&&P.repaso&&P.proxima&&P.plan.texto)&&new Set([P.repaso.texto,P.proxima.texto,P.plan.texto]).size===3);
// Un mensaje de una línea devuelve una respuesta genérica. Estos piden datos
// concretos, y por eso son largos.
chk('los tres son mensajes de verdad, no una frase',
  P.repaso.texto.length>400&&P.proxima.texto.length>600&&P.plan.texto.length>600);
chk('el repaso pide lo que solo GradeHub sabe',
  /pesa|pondera/i.test(P.repaso.texto)&&/riesgo/i.test(P.repaso.texto)&&/sin nota|registr/i.test(P.repaso.texto));
chk('el del plan parte por la fecha de hoy y termina en semanas',
  /hoy/i.test(P.plan.texto)&&/semana/i.test(P.plan.texto)&&/sim[uú]l/i.test(P.plan.texto));
// La próxima evaluación es la pregunta del lunes: cuándo es, cuánto pesa y qué
// me conviene sacarme. Sin fechas cargadas no hay nada que planificar, así que
// tiene que decirlo en vez de inventar una.
chk('el de la próxima evaluación cuenta los días, pesa y simula notas',
  /d[ií]as/i.test(P.proxima.texto)&&/pesa/i.test(P.proxima.texto)&&/sim[uú]l/i.test(P.proxima.texto)&&
  /4,0/.test(P.proxima.texto)&&/(sin|ninguna) evaluaci[oó]n con fecha|no tengo ninguna evaluaci[oó]n/i.test(P.proxima.texto));
// La regla que sostiene todo: un agente que rellena una ponderación que no
// está en GradeHub devuelve un promedio que parece real.
chk('los tres prohíben inventar y piden avisar cuando falta un dato',
  [P.repaso.texto,P.proxima.texto,P.plan.texto].every(t=>/no (inventes|la inventes)/i.test(t)&&/(pídemel|dime qué falta|dime cuál|ayúdame a poner)/i.test(t)));
// Un desplegable y un botón, no tres tarjetas: la sección se usa una vez y no
// puede ocupar media pantalla de Ajustes.
chk('los tres están en un solo desplegable, con un botón para copiar',
  /id="s-agent-prompt-pick"/.test(html)&&
  Object.values(P).every(p=>html.includes(p.titulo))&&
  (html.match(/<option value="(repaso|proxima|plan)"/g)||[]).length===3&&
  (html.match(/onclick="copiarPromptAgente\(\)"/g)||[]).length===1);
chk('el mensaje elegido se ve antes de copiarlo',
  /id="s-agent-prompt-texto"/.test(html)&&html.includes(P.repaso.texto.slice(0,40)));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
