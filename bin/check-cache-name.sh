#!/usr/bin/env bash
# Falla si cambió la app pero no subió el CACHE_NAME del service worker.
#
# Sin ese bump, quien tenga la PWA instalada se queda con la versión vieja
# cacheada y no se entera de que salió una nueva. Es un bug invisible desde el
# navegador —donde todo se ve bien— y por eso se olvida siempre.
#
# Uso: bash bin/check-cache-name.sh [base]     (base por defecto: origin/main)
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-origin/main}"

if ! git rev-parse --verify -q "$BASE" >/dev/null; then
  echo "No encuentro la base '$BASE' — corre 'git fetch origin' primero."
  exit 1
fi

# Lo commiteado contra la base, MÁS lo que todavía está sin commitear. Sin esto
# la guarda da un falso OK justo cuando más se usa: a mano, antes de commitear.
# La lista de archivos sale del SHELL de sw.js, no de una lista aparte: cuando
# el refactor agregó engine.js y render-agenda.js, una lista fija se quedó
# atrás en silencio y dejó pasar un cambio sin bump.
VIGILADOS=$(grep -oE "'/[a-zA-Z0-9._-]+\.(js|css|html)'" sw.js | tr -d "'/" | grep -v '^sw\.js$' | sort -u | tr '\n' ' ')

cambios=$( { git diff --name-only "$BASE"...HEAD -- $VIGILADOS
             git diff --name-only HEAD          -- $VIGILADOS
           } | sort -u )
if [ -z "$cambios" ]; then
  echo "Sin cambios en la app: no hace falta subir el CACHE_NAME."
  exit 0
fi

antes=$(git show "$BASE":sw.js 2>/dev/null | grep -o 'gradehub-v[0-9]*' | head -1)
ahora=$(grep -o 'gradehub-v[0-9]*' sw.js | head -1)

if [ -z "$ahora" ]; then
  echo "No encuentro el CACHE_NAME en sw.js — ¿cambió el formato 'gradehub-vN'?"
  exit 1
fi

if [ "$antes" = "$ahora" ]; then
  echo "Cambió la app pero el CACHE_NAME sigue en $ahora."
  echo "Súbelo en sw.js (gradehub-vN) o los usuarios con la PWA no reciben la actualización."
  echo "Archivos que cambiaron:"
  echo "$cambios" | sed 's/^/  /'
  exit 1
fi

echo "CACHE_NAME $antes → $ahora  OK"
