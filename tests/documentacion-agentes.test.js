// La guía de arranque es parte de la infraestructura de colaboración. Si queda
// describiendo archivos que ya se separaron, el siguiente agente busca en el
// lugar equivocado y puede perder cambios de otro carril al resolver conflictos.
const fs=require('fs');
const path=require('path');
const raiz=path.join(__dirname,'..');
const leer=f=>fs.readFileSync(path.join(raiz,f),'utf8');
let ok=0,fail=0;
const chk=(nombre,cond)=>{if(cond){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}};

const scripts=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js'];
const index=leer('index.html');
const cargados=[...index.matchAll(/<script src="([^?\"]+)/g)].map(m=>m[1]);
chk('index carga todos los scripts principales en orden',JSON.stringify(cargados.slice(-scripts.length))===JSON.stringify(scripts));

const agents=leer('AGENTS.md');
chk('AGENTS apunta el render principal a render-main.js',/pantalla principal\s*\|\s*`render-main\.js`/.test(agents));
chk('AGENTS apunta auth y sync a app-session.js',/auth y sync a Supabase\s*\|\s*`app-session\.js`/.test(agents));
const agentsPlano=agents.replace(/\s+/g,' ');
chk('AGENTS enumera los scripts en el orden real',agentsPlano.includes('`data.js` → `engine.js` → `app.js` → `app-session.js` → `render-main.js` → `render-agenda.js`'));
chk('AGENTS no deja tareas ya resueltas como pendientes',!agents.includes('Nadie puede cambiar su correo')&&!agents.includes('Faltan colores de fondo elegibles.'));

const readme=leer('README.md');
chk('README documenta los cortes de sesión y render',/\| `app-session\.js` \|/.test(readme)&&/\| `render-main\.js` \|/.test(readme));
chk('README conserva el orden real de los scripts',scripts.every((f,i)=>readme.indexOf('`'+f+'`')>=0&&(i===0||readme.indexOf('`'+scripts[i-1]+'`')<readme.indexOf('`'+f+'`'))));

const estado=leer('bin/estado.sh');
chk('estado mide todos los scripts que se cargan',scripts.every(f=>estado.includes(f)));
chk('estado distingue npm ausente de una suite fallida',estado.includes('command -v npm')&&estado.includes('SKIP'));

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
