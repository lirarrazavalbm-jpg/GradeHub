// Genera una muestra local autocontenida. No lee cuentas ni llama a Supabase.
// Usa las funciones reales: cambiar el cálculo o la segmentación cambia la demo.
const fs=require('node:fs'),path=require('node:path');
const raiz=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
const extraer=nombre=>{
  const texto=app.match(new RegExp('function '+nombre+'\\([^]*?\\n\\}'));
  if(!texto)throw new Error('No se encontró '+nombre);
  return texto[0];
};
const fuentes={
  __ENGINE__:fs.readFileSync(path.join(raiz,'engine.js'),'utf8'),
  __MARKETPLACE__:fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8'),
  __PROGRESS__:extraer('ramoProgress'),
};
const plantilla=fs.readFileSync(path.join(__dirname,'marketplace-demo.html'),'utf8');
const html=plantilla.replace(/__ENGINE__|__MARKETPLACE__|__PROGRESS__/g,clave=>fuentes[clave].replace(/<\/script/gi,'<\\/script'));
const destino=path.resolve(process.argv[2]||'/tmp/gradehub-marketplace-muestra.html');
if(destino.startsWith(raiz+path.sep))throw new Error('Genera la muestra fuera del repo para no publicarla con la app.');
fs.writeFileSync(destino,html);
console.log(destino);
