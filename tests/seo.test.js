// Los archivos que hablan con los buscadores. Ninguno se ve en la app, así que
// si se rompen nadie lo nota: el sitio simplemente deja de indexarse bien.
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== robots.txt ===');
const robots = leer('robots.txt');
chk('permite indexar la app', /User-agent: \*/.test(robots) && /Allow: \//.test(robots));
chk('no bloquea el sitio entero por accidente', !/^Disallow: \/$/m.test(robots));
chk('apunta al sitemap con URL absoluta', /Sitemap: https:\/\/gradehub\.cl\/sitemap\.xml/.test(robots));

console.log('\n=== sitemap.xml ===');
const sitemap = leer('sitemap.xml');
// El namespace es sitemapS.org, en plural. Con el singular el archivo parsea
// igual pero Google lo rechaza, y no hay forma de notarlo desde acá.
chk('usa el namespace correcto (sitemaps.org, plural)',
  /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sitemap));
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
chk('lista las dos páginas reales', urls.length === 2);
chk('todas absolutas y en https', urls.every(u => u.startsWith('https://gradehub.cl/')));
// Una URL en el sitemap que no existe le dice al buscador que el sitio está mal
// mantenido. Se comprueba contra los archivos del repo.
chk('cada URL corresponde a un archivo que existe',
  urls.every(u => {
    const ruta = u.replace('https://gradehub.cl/', '') || 'index.html';
    return fs.existsSync(path.join(raiz, ruta));
  }));

console.log('\n=== Metadatos de las dos páginas ===');
[['index.html', 'la app'], ['privacidad.html', 'la política']].forEach(([f, que]) => {
  const html = leer(f);
  const titulo = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
  const desc = (html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
  chk(`${que} tiene título propio (${titulo.slice(0, 34)}…)`, titulo.length > 15);
  chk(`${que} tiene descripción`, desc.length > 50);
});
// Dos páginas con el mismo título compiten entre sí en los resultados.
chk('los títulos son distintos entre sí',
  (leer('index.html').match(/<title>([^<]+)</) || [])[1] !== (leer('privacidad.html').match(/<title>([^<]+)</) || [])[1]);

console.log('\n=== El schema declara lo que la app es ===');
const ld = (leer('index.html').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
chk('el JSON-LD parsea', (() => { try { JSON.parse(ld); return true; } catch (e) { return false; } })());
const datos = JSON.stringify(JSON.parse(ld));
chk('se declara como WebApplication', /"WebApplication"/.test(datos));
// LocalBusiness sería falso: GradeHub no tiene local, ni dirección, ni horario.
// Declararlo para "cumplir un checklist" es mentirle a un buscador.
chk('NO se declara como LocalBusiness', !/LocalBusiness/.test(datos));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
