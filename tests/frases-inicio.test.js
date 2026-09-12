// El saludo de Inicio acompaña el uso diario sin ocupar una segunda línea ni
// cambiar cada vez que la pantalla se vuelve a dibujar.
// Para probar contra main: GRADEHUB_ROOT=/ruta/al/arbol-anterior node tests/frases-inicio.test.js
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=process.env.GRADEHUB_ROOT||path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const render=fs.readFileSync(path.join(root,'render-main.js'),'utf8');

let passed=0,failed=0;
const check=(label,ok)=>{console.log(`${ok?'OK':'ERROR'} ${label}`);ok?passed++:failed++;};
const block=(app.match(/const FRASES_INICIO=\[[\s\S]*?\n\];[\s\S]*?function fraseInicio\([\s\S]*?\n\}/)||[])[0]||'';
check('existe una selección propia para las frases de Inicio',!!block);

if(block){
  const ctx={};
  vm.runInNewContext(`${block}\nglobalThis.frases=FRASES_INICIO;`,ctx);
  check('hay variedad sin convertir el saludo en una cita larga',ctx.frases.length>=5&&new Set(ctx.frases).size===ctx.frases.length&&ctx.frases.every(x=>x.length<=42));
  const manana=new Date(2026,8,11,8,0),noche=new Date(2026,8,11,23,30),otroDia=new Date(2026,8,12,8,0);
  check('la frase no cambia al volver a dibujar durante el mismo día',ctx.fraseInicio(manana)===ctx.fraseInicio(noche));
  check('la selección puede avanzar al día siguiente',ctx.fraseInicio(manana)!==ctx.fraseInicio(otroDia));
}

check('Home reemplaza el saludo horario y conserva el nombre destacado',
  /home-greeting[^\n]+fraseInicio\(\)[^\n]+greet-name[^\n]+esc\(first\)/.test(render)&&
  !/home-greeting[^\n]+greeting\(\)/.test(render));

console.log(`\n${passed} correctas; ${failed} errores`);
process.exit(failed?1:0);
