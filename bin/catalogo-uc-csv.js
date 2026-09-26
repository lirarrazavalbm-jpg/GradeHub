#!/usr/bin/env node
// Genera supabase/catalogo_uc.csv desde cursos-uc.js, para importarlo en la
// tabla public.catalogo_uc (ver supabase/catalogo_uc.sql).
//
//   node bin/catalogo-uc-csv.js
//
// La columna `busqueda` es el nombre como lo compara el buscador de la app:
// minúsculas, sin tildes y con los romanos en cifras ("Cálculo II" → "calculo
// 2"). Las reglas copian normName y normBusqueda de app.js;
// tests/catalogo-uc-servidor.test.js exige que den lo mismo para cada fila,
// así que si cambia una, este generador falla antes de subir un CSV distinto.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const ROMANOS = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12' };

function normName(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function normBusqueda(s) { return String(s || '').split(' ').map(t => ROMANOS[t] || t).join(' '); }
function busquedaDe(nombre) { return normBusqueda(normName(nombre)); }

function cursosUc() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'cursos-uc.js'), 'utf8') + '\nthis.__c = CURSOS_UC_FULL;', ctx);
  return ctx.__c;
}

function campo(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function filas() {
  const vistas = new Set();
  const out = [];
  for (const fila of cursosUc()) {
    if (!Array.isArray(fila)) continue;
    const [sigla, nombre, creditos] = fila;
    if (typeof sigla !== 'string' || !/^[A-Z0-9_]{3,12}$/.test(sigla)) continue;
    if (typeof nombre !== 'string' || !nombre.trim() || vistas.has(sigla)) continue;
    vistas.add(sigla);
    out.push({ sigla, nombre: nombre.trim(), creditos: Number.isInteger(creditos) ? creditos : null, busqueda: busquedaDe(nombre) });
  }
  return out;
}

if (require.main === module) {
  const lista = filas();
  const csv = ['sigla,nombre,creditos,busqueda']
    .concat(lista.map(f => [f.sigla, f.nombre, f.creditos, f.busqueda].map(campo).join(',')))
    .join('\n') + '\n';
  const destino = path.join(raiz, 'supabase', 'catalogo_uc.csv');
  fs.writeFileSync(destino, csv);
  console.log(`${lista.length} cursos → ${path.relative(raiz, destino)}`);
}

module.exports = { filas, busquedaDe };
