#!/usr/bin/env node
// Corre todos los tests de `tests/*.test.js`.
//
// Antes esto era una cadena de `&&` enumerada a mano en package.json: una
// línea de 2 KB que cada rama tenía que editar para agregar su test. Es el
// mismo defecto que tenía el `CACHE_NAME` de sw.js —un valor compartido que
// todas las ramas quieren escribir a la vez— y daba el mismo resultado: un
// conflicto por PR, mecánico, que hay que resolver a mano cada vez y en el que
// es fácil perder el test de otro sin que nadie lo note.
//
// Ahora los archivos se descubren solos. Un test nuevo se corre por existir, y
// nadie tiene que acordarse de registrarlo — que era la otra mitad del
// problema: un test que no está en la cadena no corre, y no falla nada que
// avise de eso.
//
// Para correr uno solo: `node tests/<archivo>.test.js`.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'tests');
const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();

// `sintaxis` va primero a propósito: si un archivo de la app no parsea, todo lo
// demás va a fallar por la misma causa y con mensajes peores.
archivos.sort((a, b) => (b === 'sintaxis.test.js') - (a === 'sintaxis.test.js'));

const fallaron = [];
for (const f of archivos) {
  console.log('\n──────── ' + f);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  // Un test puede fallar de dos formas y NO se ven igual: puede terminar con
  // código 1 después de imprimir sus FAIL, o puede reventar antes de imprimir
  // nada. La segunda no deja ninguna línea que buscar en la salida, así que se
  // reporta aparte — es exactamente el caso que hace inútil grepear por "FAIL".
  if (r.signal) fallaron.push(f + ' (murió con ' + r.signal + ')');
  else if (r.status !== 0) fallaron.push(f + ' (salió ' + r.status + ')');
}

console.log('\n════════════════════════════════════════');
if (fallaron.length) {
  console.log('FALLARON ' + fallaron.length + ' de ' + archivos.length + ':');
  fallaron.forEach(f => console.log('  · ' + f));
  process.exit(1);
}
console.log('Pasaron los ' + archivos.length + ' tests.');
