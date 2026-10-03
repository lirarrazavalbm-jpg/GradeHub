#!/usr/bin/env bash
# El estado del repo en un solo tool call.
#
# --rapido omite la suite inicial; --local omite red. Ambos son combinables.
# Sin opciones conserva la revisión completa, incluyendo npm test.
#
# Para nosotros: `bash bin/estado.sh` al volver después de unos días.
set -uo pipefail
cd "$(dirname "$0")/.."

RAPIDO=0
LOCAL=0
for opcion in "$@"; do
  case "$opcion" in
    --rapido) RAPIDO=1 ;;
    --local) LOCAL=1 ;;
    --help|-h) echo "Uso: bash bin/estado.sh [--rapido] [--local]"; exit 0 ;;
    *) echo "Opción desconocida: $opcion" >&2; exit 2 ;;
  esac
done

if [ "$LOCAL" -eq 1 ]; then
  echo "(modo local: referencias y PR no se actualizaron)"
else
  git fetch -q origin 2>/dev/null || echo "(sin red: lo de abajo puede estar desactualizado)"
fi

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
  git log --oneline -8 origin/main..HEAD || true
  echo "(hasta 8 commits; git log origin/main..HEAD muestra todos)"
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
if [ "$LOCAL" -eq 1 ]; then
  echo "SKIP — modo local; consulta gh pr list al volver la red"
elif [ -n "$GH" ]; then
  "$GH" pr list --state open --limit 8 2>/dev/null || echo "(no se pudo consultar GitHub: verifica red, permisos o sesión)"
  echo "(hasta 8 PR; gh pr list --limit 100 muestra más)"
else
  echo "(gh no instalado: 'brew install gh' para ver los PRs acá)"
fi

echo
echo "=== TUS ISSUES ABIERTAS ==="
# La cola de docs/contexto.md se desactualiza —ya pasó dos veces que alguien empezó a
# implementar algo que estaba hecho—, y hay pegas que no son de nadie más:
# las de panel de Supabase y Cloudflare no las puede hacer ningún agente. Eso
# vive en las issues asignadas, no en el archivo, así que salen acá.
# Reusa el $GH de más arriba.
if [ "$LOCAL" -eq 1 ]; then
  echo "SKIP — modo local"
elif [ -n "$GH" ]; then
  "$GH" issue list --state open --assignee @me --limit 8 2>/dev/null || echo "(no se pudo consultar GitHub: verifica red, permisos o sesión)"
else
  echo "(gh no instalado: 'brew install gh' para verlas acá)"
fi

echo
echo "=== TAMAÑOS ==="
wc -c index.html data.js engine.js app.js app-session.js marketplace.js render-main.js render-agenda.js styles.css sw.js | sed '$d'

echo
echo "=== TESTS ==="
if [ "$RAPIDO" -eq 1 ]; then
  echo "SKIP — arranque rápido; npm test antes de entregar"
elif ! command -v npm >/dev/null 2>&1; then
  echo "SKIP — npm no está instalado en este entorno"
elif npm test >/dev/null 2>&1; then
  echo "PASS"
else
  echo "FAIL — corre 'npm test' para ver el detalle"
fi

echo
echo "Mapa de dónde está cada cosa: sección 'Dónde está cada cosa' de AGENTS.md."
echo "node bin/mapa.js <tema> encuentra definiciones y tests; consulta solo fragmentos."
