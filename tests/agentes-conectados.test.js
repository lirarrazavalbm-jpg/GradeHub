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
chk('el código se genera por la RPC y vence a los cinco minutos',llamaRpc('crear_codigo_agente')&&/AGENTE_CODIGO_MS=5\*60\*1000/.test(app));
chk('el contador explica que el código venció y permite generar otro',/Vence en \$\{min\}:\$\{seg\}/.test(app)&&/Este código venció\. Genera otro/.test(app)&&/Generar otro código/.test(app));
chk('el primer estado invita a generar y no finge que ya venció',/const vencido=!!agenteCodigoActual&&quedan<=0/.test(app)&&/vencido\?'Este código venció\. Genera otro para conectar un agente\.':'Genera un código temporal/.test(app)&&/btn\.disabled=false/.test(app));
chk('el código temporal no se guarda en el estado de la app ni en localStorage',!/agenteCodigoActual[\s\S]{0,240}(?:localStorage|S\.)/.test(app));

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
chk('el código y las fichas siguen legibles en pantalla angosta',/\.agent-code-value\{[^}]*font-variant-numeric:tabular-nums/.test(css)&&/\.agent-link-heading b\{[^}]*text-overflow:ellipsis/.test(css));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
