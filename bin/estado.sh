#!/usr/bin/env bash
# El estado del repo en un solo tool call.
#
# Para el agente: corre esto ANTES de leer ningún archivo. Responde en qué rama
# estás, qué dejó el otro a medias y si el repo está sano — sin gastar los ~80k
# tokens que cuesta leer el proyecto entero para averiguar lo mismo.
#
# Para nosotros: `bash bin/estado.sh` al volver después de unos días.
set -uo pipefail
cd "$(dirname "$0")/.."

git fetch -q origin 2>/dev/null || echo "(sin red: lo de abajo puede estar desactualizado)"

echo "=== RAMA ACTUAL ==="
git branch --show-current

echo
echo "=== SIN COMMITEAR ==="
git status --short || true

echo
echo "=== ÚLTIMO EN main ==="
git log --oneline -8 origin/main

echo
echo "=== ESTA RAMA vs main ==="
if git rev-parse --verify -q origin/main >/dev/null; then
  git log --oneline origin/main..HEAD || true
  git diff --stat origin/main...HEAD || true
fi

echo
echo "=== RAMAS ACTIVAS EN EL REMOTO ==="
git for-each-ref --sort=-committerdate refs/remotes/origin \
  --format='%(committerdate:short)  %(refname:short)  — %(authorname)' | head -8

echo
echo "=== PRs ABIERTOS ==="
# Los agentes corren con un PATH más pobre que la shell interactiva: si gh está
# instalado por brew y no aparece, lo buscamos donde brew lo deja.
GH=""
if command -v gh >/dev/null 2>&1; then GH=gh
elif [ -x /opt/homebrew/bin/gh ]; then GH=/opt/homebrew/bin/gh
elif [ -x /usr/local/bin/gh ]; then GH=/usr/local/bin/gh
fi
if [ -n "$GH" ]; then
  "$GH" pr list --state open 2>/dev/null || echo "(gh sin auth: corre 'gh auth login')"
else
  echo "(gh no instalado: 'brew install gh' para ver los PRs acá)"
fi

echo
echo "=== TAMAÑOS ==="
wc -c index.html data.js app.js styles.css | sed '$d'

echo
echo "=== TESTS ==="
if npm test >/dev/null 2>&1; then echo "PASS"; else echo "FAIL — corre 'npm test' para ver el detalle"; fi

echo
echo "Mapa de dónde está cada cosa: sección 'Dónde está cada cosa' de AGENTS.md."
echo "No leas app.js entero (~40k tokens): greféalo."
