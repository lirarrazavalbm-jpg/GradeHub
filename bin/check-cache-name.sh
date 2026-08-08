#!/usr/bin/env bash
# Revisa que el sellado del CACHE_NAME siga en pie.
#
# ANTES esta guarda exigía subir a mano un contador ('gradehub-vN') cuando
# cambiaba la app. Funcionaba mal por diseño: una sola línea que TODAS las ramas
# querían escribir. Seis conflictos, uno publicó un service worker con
# marcadores de conflicto adentro —no parseaba, así que no instalaba— y la
# última vez tres PRs reclamaron 'gradehub-v73' a la vez. La guarda los dejó
# pasar a los tres: comparaba contra la base del PR, no contra el main del
# momento del merge, así que el segundo y el tercero habrían publicado cambios
# de app sin cambiar el cache.
#
# AHORA el número no está en el repo. sw.js lleva el marcador 'gradehub-dev' y
# el deploy lo reemplaza por el SHA del commit
# (.github/workflows/deploy.yml → «Sellar el CACHE_NAME con el commit»).
# Ninguna rama escribe esa línea, así que no hay nada que colisione.
#
# Lo que queda por vigilar son las dos mitades del mecanismo, porque ninguna
# falla de forma visible:
#   - sin el marcador en sw.js, el deploy no tiene qué sellar;
#   - sin el sed en deploy.yml, se publica 'gradehub-dev' para siempre, el
#     cache nunca cambia y nadie recibe una actualización más.
#
# El mismo chequeo vive en tests/sintaxis.test.js, así que corre en todo `npm
# test`. Este script se queda porque AGENTS.md lo nombra y porque da el
# diagnóstico completo de una, sin correr la suite entera.
#
# Uso: bash bin/check-cache-name.sh     (ignora argumentos: ya no compara bases)
set -uo pipefail
cd "$(dirname "$0")/.."

fallo=0

if grep -q "const CACHE_NAME = 'gradehub-dev';" sw.js; then
  echo "OK  sw.js tiene el marcador que el deploy va a sellar."
else
  echo "FALLA  sw.js perdió el marcador 'gradehub-dev'."
  echo "       Dice: $(grep -o "CACHE_NAME = 'gradehub-[a-z0-9]*'" sw.js | head -1)"
  echo "       Si volviste a poner un contador a mano, sácalo: el número lo pone"
  echo "       el deploy desde el SHA del commit."
  fallo=1
fi

if grep -q 'sed -i .*gradehub-dev.*GITHUB_SHA' .github/workflows/deploy.yml; then
  echo "OK  deploy.yml sella el CACHE_NAME con el commit."
else
  echo "FALLA  deploy.yml ya no sella el CACHE_NAME."
  echo "       Cada deploy publicaría 'gradehub-dev' y el service worker se"
  echo "       quedaría con el mismo cache para siempre."
  fallo=1
fi

if [ "$fallo" = 0 ]; then
  echo
  echo "El CACHE_NAME ya no se toca a mano. Si tu PR cambia sw.js solo para"
  echo "subir un número, bórralo del diff."
fi

exit "$fallo"
