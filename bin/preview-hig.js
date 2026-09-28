// Genera un solo HTML sin red; reutiliza las fuentes de la app y de la propuesta.
const fs=require('node:fs'),path=require('node:path');
const raiz=path.join(__dirname,'..');
const fuentes={__ESTILOS__:'styles.css',__MARKETPLACE__:'marketplace.js',__VISTAS_CSS__:'marketplace-vistas.css',__VISTAS_JS__:'marketplace-vistas.js'};
const html=fs.readFileSync(path.join(__dirname,'muestra-hig.html'),'utf8').replace(/__ESTILOS__|__MARKETPLACE__|__VISTAS_CSS__|__VISTAS_JS__/g,k=>fs.readFileSync(path.join(raiz,fuentes[k]),'utf8').replace(/<\/script/gi,'<\\/script'));
const destino=path.resolve(process.argv[2]||'/tmp/gradehub-muestra-hig.html');
if(destino.startsWith(raiz+path.sep))throw Error('Genera la muestra fuera del repositorio.');
fs.mkdirSync(path.dirname(destino),{recursive:true});fs.writeFileSync(destino,html);console.log(destino);
