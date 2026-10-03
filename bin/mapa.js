#!/usr/bin/env node
// Navegación de lectura: ubicaciones calculadas desde el checkout, sin índice generado.
const fs=require('node:fs'),path=require('node:path');
const raiz=path.resolve(__dirname,'..');
const temas={
  calculo:{puntos:{'engine.js':['calculateFinalGrade','solveForTarget','ramoAvg','ramoToStructure','estadoEximicion'],'app.js':['gpa','notaAprobadaRamo']},tests:/calculo|compuertas|eximicion|gpa|casillas/,guia:'docs/guia-agentes.md · Modelo y cálculo'},
  sesion:{puntos:{'app-session.js':['boot','afterLogin','submitAuth','syncNow','cerrarSesion'],'app.js':['normalize']},tests:/auth|sync|sesion|cache/,guia:'docs/contexto.md · Seguridad'},
  ramos:{puntos:{'app.js':['obToggleRamo','renderObCoursePicker','presetRamo'],'render-main.js':['renderRamo']},tests:/onboarding|pauta|notas-sobreviven/},
  inicio:{puntos:{'render-main.js':['renderHome'],'app.js':['showTab','openModal']},tests:/home|inicio|teclado|movimiento/},
  estadisticas:{puntos:{'render-main.js':['renderStats'],'app.js':['gpaHistorial','histRamoAvg','ordenSecciones']},tests:/estadisticas|historial|semestre-anterior/},
  agenda:{puntos:{'render-agenda.js':['renderAgenda','agendaSinFecha'],'app.js':['icsFold']},tests:/agenda|calendario|ics/},
  wrapped:{puntos:{'render-main.js':['wrappedDisponible','ramosWrapped','datosWrapped','abrirWrapped','pasarWrapped','cerrarWrapped']},tests:/wrapped/},
  catalogos:{puntos:{'data.js':['TENANTS','MALLA','MALLA_UC','PRESETS_FEN','PRESETS_UC','PRESETS_UAI','CREDITOS_FEN','CREDITOS_UC'],'app.js':['pautaPresetSuficiente']},tests:/catalogo|creditos|vocabulario/,guia:'docs/guia-agentes.md · Catálogos; UC: docs/catalogo-uc-fase5.md'},
  clases:{puntos:{'marketplace.js':['renderBorradorProfesor','renderAdmin','recomendacionDelDia']},tests:/clases|marketplace|contacto|recomendacion/,guia:'docs/contexto.md · Marketplace de clases; docs/marketplace-clases.md'},
  mcp:{puntos:{'functions/mcp/herramientas.js':['HERRAMIENTAS','validarPropuestaNotas'],'functions/mcp/[[ruta]].js':['calculoPara','queNecesitoParaAprobar']},tests:/mcp/},
  visual:{puntos:{'app.js':['aplicarModo','applyTheme'],'data.js':['ACENTOS','FONDOS','SEMAFORO']},tests:/temas|movimiento|tactiles|contraste/,guia:'docs/diseno-editorial.md; styles.css: buscar selector con rg -n'},
  ocr:{puntos:{'app.js':['leerFotoHorario','codigosDeFotoHorario','abrirImportarHorarioBuscacursos']},tests:/ocr|buscacursos|foto-horario/,guia:'ocr/ contiene dependencias grandes; consultar rutas explícitas'},
  sql:{puntos:{'app-session.js':['syncNow']},tests:/sql|supabase|dos-pasos/,guia:'supabase/*.sql; docs/contexto.md · Seguridad'},
  contexto:{puntos:{},tests:null,guia:'docs/contexto.md: decisiones fechadas; git/PR/issues: estado actual'}
};
const fuentes=['data.js','engine.js','app.js','app-session.js','marketplace.js','render-main.js','render-agenda.js','functions/mcp/herramientas.js','functions/mcp/[[ruta]].js'];
const escapar=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function lineas(archivo){
  const completo=path.resolve(raiz,archivo);
  if(!completo.startsWith(raiz+path.sep)||!fs.existsSync(completo)||!fs.statSync(completo).isFile())throw Error('Archivo fuera del repo o inexistente: '+archivo);
  if(!fs.realpathSync(completo).startsWith(fs.realpathSync(raiz)+path.sep))throw Error('El enlace apunta fuera del repo: '+archivo);
  // No cargar archivos binarios ni configuraciones privadas por accidente.
  if(!/\.(js|md|sql|css|html|sh)$/.test(archivo)||archivo.split(/[\\/]/).some(p=>p.startsWith('.')))throw Error('Ruta no admitida para lectura de contexto: '+archivo);
  return fs.readFileSync(completo,'utf8').split('\n');
}
function definiciones(texto,nombre){
  if(!/^[A-Za-z_$][\w$]*$/.test(nombre))throw Error('El nombre debe ser un identificador JavaScript');
  const re=new RegExp('^\\s*(?:export\\s+)?(?:(?:async\\s+)?function\\s+'+escapar(nombre)+'\\s*\\(|(?:const|let|var)\\s+'+escapar(nombre)+'\\s*[=:])');
  return texto.flatMap((l,i)=>re.test(l)?[i+1]:[]);
}
function mapa(tema){
  const t=temas[tema];if(!t)throw Error('Tema desconocido: '+tema+'; ejecuta node bin/mapa.js');
  const salida=['Tema: '+tema],faltan=[];
  for(const [archivo,nombres] of Object.entries(t.puntos)){
    const texto=lineas(archivo);
    for(const nombre of nombres){const ns=definiciones(texto,nombre);if(!ns.length)faltan.push(archivo+' → '+nombre);ns.forEach(n=>salida.push(archivo+':'+n+' · '+nombre));}
  }
  if(faltan.length)throw Error('Mapa desactualizado; no se encontraron: '+faltan.join(', '));
  if(t.tests){
    const tests=fs.readdirSync(path.join(raiz,'tests')).filter(f=>f.endsWith('.test.js')&&t.tests.test(f)).sort();
    salida.push('Tests relacionados por nombre (no reemplazan npm test):');
    tests.slice(0,8).forEach(f=>salida.push('  tests/'+f));
    if(tests.length>8)salida.push('  … '+(tests.length-8)+' más; filtra con rg --files tests | rg "'+t.tests.source+'"');
  }
  if(t.guia)salida.push('Referencia: '+t.guia);
  return salida.join('\n');
}
function main(args){
  if(!args.length||args[0]==='--help'||args[0]==='-h')return [
    'Uso: node bin/mapa.js <tema>',
    'Temas: '+Object.keys(temas).join(', '),
    'Definición: node bin/mapa.js funcion ramoAvg',
    'Fragmento: node bin/mapa.js leer engine.js ramoAvg --lineas 45',
    'También: leer docs/contexto.md "Marketplace de clases" --lineas 80',
    'Máximo 120 líneas por fragmento. Sin red, cambios ni ejecución de la app.'
  ].join('\n');
  if(args[0]==='funcion'){
    if(args.length!==2)throw Error('Uso: node bin/mapa.js funcion <nombre>');
    const salida=fuentes.flatMap(f=>definiciones(lineas(f),args[1]).map(n=>f+':'+n+' · '+args[1]));
    if(!salida.length)throw Error('No hay definición en los módulos de entrada: '+args[1]+'; busca el archivo específico con rg -n');
    return salida.join('\n');
  }
  if(args[0]==='leer'){
    const [,archivo,ancla,opcion,cantidad]=args;
    if(!archivo||!ancla||(args.length!==3&&!(args.length===5&&opcion==='--lineas')))throw Error('Uso: node bin/mapa.js leer <archivo> <función, encabezado o línea> [--lineas 40]');
    const n=cantidad===undefined?40:Number(cantidad);
    if(!Number.isInteger(n)||n<1||n>120)throw Error('--lineas debe ser un entero entre 1 y 120');
    const texto=lineas(archivo);
    const desde=/^\d+$/.test(ancla)?Number(ancla)-1:archivo.endsWith('.md')?texto.findIndex(l=>/^#{1,6} /.test(l)&&l.includes(ancla)):definiciones(texto,ancla)[0]-1;
    if(!Number.isInteger(desde)||desde<0||desde>=texto.length)throw Error('Ancla no encontrada en '+archivo+': '+ancla);
    const hasta=Math.min(desde+n,texto.length);
    const salida=texto.slice(desde,hasta).map((l,i)=>`${desde+i+1}: ${l.length>240?l.slice(0,240)+' … [línea recortada; usa rg en el archivo]':l}`);
    if(hasta<texto.length)salida.push('… continúa en '+archivo+':'+(hasta+1));
    return salida.join('\n');
  }
  if(args.length!==1)throw Error('Argumentos inesperados; ejecuta node bin/mapa.js --help');
  return mapa(args[0]);
}
if(require.main===module){try{console.log(main(process.argv.slice(2)));}catch(e){console.error(e.message);process.exitCode=2;}}
module.exports={main,mapa,definiciones,temas};
