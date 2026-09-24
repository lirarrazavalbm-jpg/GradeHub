// Ningún lugar de la app puede mostrar la nota necesaria redondeada al más
// cercano. Tiene que ir siempre hacia arriba, con `nfNecesaria`.
//
// Este test existe porque el arreglo se hizo a medias. Se corrigieron cinco
// lugares en app.js y render-main.js, se anunció como terminado, y quedaron
// CUATRO en render-agenda.js — que es donde Lucas lo seguía viendo mal. El
// error fue buscar en los archivos donde uno cree que está, en vez de en
// todos.
//
// Por eso la comprobación recorre los tres archivos que dibujan, y no una
// lista escrita a mano de dónde mirar: una lista a mano se vuelve a quedar
// corta exactamente igual.
const fs=require('fs'),path=require('path');
const raiz=path.join(__dirname,'..');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const ARCHIVOS=['app.js','render-main.js','render-agenda.js'];
// Una línea es sospechosa si habla de lo que se necesita Y formatea un número
// con algo que no sea `nfNecesaria`.
const sospechosa=l=>/necesit/i.test(l) && /\bnf\(|\bfmt\(|toFixed\(/.test(l) && !/nfNecesaria/.test(l);
// `resumenMetaCalculadora` ya entrega su texto formateado —incluidos los dos
// decimales del caso inalcanzable, que ahí sirven para explicar POR QUÉ no
// alcanza— así que quien lo imprime no vuelve a formatear.
const permitida=l=>/metaCalculada\.texto|resumenMetaCalculadora/.test(l);

console.log('\n=== Nadie muestra la nota necesaria con otro formateador ===');
const hallazgos=[];
ARCHIVOS.forEach(f=>{
  fs.readFileSync(path.join(raiz,f),'utf8').split('\n').forEach((l,i)=>{
    if(sospechosa(l)&&!permitida(l))hallazgos.push(`${f}:${i+1}  ${l.trim().slice(0,90)}`);
  });
});
chk('ningún archivo formatea la nota necesaria a mano'+(hallazgos.length?'\n       → '+hallazgos.join('\n       → '):''),
  hallazgos.length===0);

console.log('\n=== Y el formateador existe y redondea hacia arriba ===');
const app=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
chk('nfNecesaria está definida', /function nfNecesaria\(/.test(app));
chk('y usa Math.ceil, no Math.round', /function nfNecesaria\([\s\S]{0,300}?Math\.ceil/.test(app));

console.log('\n=== Se usa en los tres archivos que dibujan ===');
ARCHIVOS.forEach(f=>{
  const txt=fs.readFileSync(path.join(raiz,f),'utf8');
  chk(`${f} la usa`, txt.includes('nfNecesaria'));
});

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail?1:0);
