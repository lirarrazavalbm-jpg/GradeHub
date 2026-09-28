// El deploy copia el repo a dist/ con exclusiones y después exige que dist/
// sea exactamente la lista `archivos_app`: si sobra o falta un archivo, no se
// publica nada. Esa comprobación solo corría en el deploy, DESPUÉS del merge:
// el 2026-09-28 un `.ignore` nuevo en la raíz frenó la publicación de una PR ya
// mergeada. Este test repite la cuenta sobre los archivos del repo para que el
// problema aparezca en la PR.
const fs=require('fs'),path=require('path'),{execSync}=require('child_process');
const raiz=path.join(__dirname,'..');
const y=fs.readFileSync(path.join(raiz,'.github/workflows/deploy.yml'),'utf8');
const exclusiones=[...y.matchAll(/--exclude '([^']+)'/g)].map(m=>m[1]);
const lista=(y.match(/archivos_app='([^']+)'/)||[])[1];
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
chk('el workflow declara exclusiones y la lista de archivos',exclusiones.length>0&&!!lista);
const app=(lista||'').split(/\s+/).filter(Boolean);
const comodin=p=>new RegExp('^'+p.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$');
const excluido=f=>{const partes=f.split('/');return exclusiones.some(e=>partes[0]===e||comodin(e).test(partes[partes.length-1])||comodin(e).test(f));};
let archivos=[];
try{archivos=execSync('git ls-files',{cwd:raiz,encoding:'utf8'}).split('\n').filter(Boolean);}catch(e){}
if(!archivos.length){console.log('  SKIP sin git');process.exit(0);}
const dist=archivos.filter(f=>!excluido(f));
const sobran=dist.filter(f=>!app.includes(f)),faltan=app.filter(f=>!dist.includes(f));
chk('no se publicaría nada fuera de la lista'+(sobran.length?': '+sobran.join(', '):''),!sobran.length);
chk('no falta ningún archivo de la app'+(faltan.length?': '+faltan.join(', '):''),!faltan.length);
console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
