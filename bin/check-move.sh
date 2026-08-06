#!/usr/bin/env bash
# Certifica que un refactor es un MOVIMIENTO PURO: el mismo código en otros
# archivos, sin una línea agregada ni perdida.
#
# Compara el multiconjunto de líneas de código (ignorando espacios, líneas
# vacías y comentarios) entre la base y la rama. Si algo entró o salió, lo
# muestra y falla. Un refactor que pasa esto se puede mergear sin leerlo.
#
# Uso: bash bin/check-move.sh "a.js b.js" "a.js b.js c.js" [base]
#        $1 = archivos en la BASE     $2 = archivos en la RAMA
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${3:-origin/main}"
norm() { grep -vE '^\s*$' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -vE '^//' | sort; }

antes=$(for f in $1; do git show "$BASE:$f" 2>/dev/null; done | norm)
despues=$(for f in $2; do cat "$f" 2>/dev/null; done | norm)

perdido=$(comm -23 <(echo "$antes") <(echo "$despues"))
nuevo=$(comm -13 <(echo "$antes") <(echo "$despues"))

if [ -z "$perdido" ] && [ -z "$nuevo" ]; then
  echo "MOVIMIENTO PURO OK — $(echo "$antes" | wc -l | tr -d ' ') líneas, ninguna cambió de contenido"
  exit 0
fi
[ -n "$perdido" ] && { echo "DESAPARECIÓ ($(echo "$perdido" | wc -l | tr -d ' ') líneas):"; echo "$perdido" | head -15 | sed 's/^/  - /'; }
[ -n "$nuevo" ]   && { echo "APARECIÓ ($(echo "$nuevo" | wc -l | tr -d ' ') líneas):";    echo "$nuevo"   | head -15 | sed 's/^/  + /'; }
echo
echo "No es un movimiento puro. Sepáralo: el refactor por un lado, el cambio de comportamiento por otro."
exit 1
