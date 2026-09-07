// La huella es la identidad semántica del reporte. `estructura` solo conserva
// el texto que alguien escribió para poder mostrar una propuesta después.
// Agrupar por ambos divide votos iguales si varían mayúsculas o la redacción.
const fs=require('fs'),path=require('path');
const raiz=path.join(__dirname,'..');
const sql=fs.readFileSync(process.env.GRADEHUB_SQL||path.join(raiz,'supabase/catalog_consensus.sql'),'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const HUELLA='examen~40~1~3~3.9|solemne 1~20~1~0~0|solemne 2~20~1~0~0|solemne 3~20~1~0~0';
const REPORTES=[
  {user:'a',estructura:[{nombre:'Examen',peso:40,min:3,cap:3.9},{nombre:'Solemne 1',peso:20},{nombre:'Solemne 2',peso:20},{nombre:'Solemne 3',peso:20}]},
  {user:'b',estructura:[{nombre:'examen',peso:40,min:3,cap:3.9},{nombre:'solemne 1',peso:20},{nombre:'solemne 2',peso:20},{nombre:'solemne 3',peso:20}]},
  {user:'c',estructura:[{nombre:'EXAMEN',peso:40,min:3,cap:3.9},{nombre:'SOLEMNE 1',peso:20},{nombre:'SOLEMNE 2',peso:20},{nombre:'SOLEMNE 3',peso:20}]},
].map((r,i)=>({...r,huella:HUELLA,updatedAt:i}));

const mayorGrupo=clave=>Math.max(...Object.values(REPORTES.reduce((grupos,r)=>{
  const k=clave(r);grupos[k]=(grupos[k]||0)+1;return grupos;
},{})));

console.log('\n=== La huella, no la presentación, decide el consenso ===');
chk('las tres estructuras guardan nombres distintos',mayorGrupo(r=>JSON.stringify(r.estructura))===1);
chk('pero las tres personas coinciden en la misma huella',mayorGrupo(r=>r.huella)===3);

console.log('\n=== La RPC cuenta por la huella y conserva una muestra ===');
// El CTE `agrupados` es el único que decide el umbral. La estructura entra
// después, como muestra más reciente para pintar la propuesta; no como llave.
const agrupados=sql.match(/agrupados\s+as\s*\(([^]*?)\),\s*muestra\s+as/i)?.[1]||'';
const muestra=sql.match(/muestra\s+as\s*\(([^]*?)\)\s*select/i)?.[1]||'';
chk('el umbral agrupa por ramo y huella, no por el JSON completo',
  /group by\s+ramo_key\s*,\s*huella/i.test(agrupados)&&!/estructura/i.test(agrupados));
chk('la estructura se elige después como una muestra determinista',
  /distinct on\s*\(\s*ramo_key\s*,\s*huella\s*\)/i.test(muestra)&&/updated_at/i.test(muestra));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
