#!/usr/bin/env bash
#
# Genera el spec OpenAPI de la API y lo escribe a un archivo.
#
# Swagger vive SOLO en dev (`main.ts`: `if (!isProduction)`), así que el spec se saca
# del `/docs-json` del servidor dev — usa la app real, sin duplicar la config de main.ts.
# Si el api dev no está arriba, el script levanta el stack dev.
#
# Uso:
#   cd apps/api-core && pnpm gen:openapi                       # -> apps/api-core/openapi.json
#   cd apps/api-core && pnpm gen:openapi ../ruta/spec.json     # a otra ruta
#   OUT=/ruta/abs/spec.json  API_URL=http://localhost:3000  bash scripts/gen-openapi.sh
#
# Para refrescar el spec del blog (repo daikulab, hermano de este):
#   cd apps/api-core && pnpm gen:openapi ../../../daikulab/public/openapi/restaurants-api-v1.json
#
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
OUT="${1:-${OUT:-openapi.json}}"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Levantar el api dev si /docs-json no responde todavía.
if ! curl -sf "${API_URL}/docs-json" -o /dev/null 2>/dev/null; then
  echo "· /docs-json no responde; levantando stack dev (res-db, res-api-core)…"
  ( cd "$REPO_ROOT" && docker compose up -d res-db res-api-core >/dev/null )
fi

echo "· Esperando ${API_URL}/docs-json …"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

for _ in $(seq 1 40); do
  if curl -sf "${API_URL}/docs-json" -o "$tmp" 2>/dev/null; then
    if command -v python3 >/dev/null 2>&1; then
      python3 -m json.tool "$tmp" > "$OUT"   # pretty-print para diffs estables
    else
      cp "$tmp" "$OUT"
    fi
    paths="$(python3 -c "import json;print(len(json.load(open('$OUT'))['paths']))" 2>/dev/null || echo '?')"
    echo "✓ OpenAPI escrito en ${OUT} (${paths} rutas)"
    exit 0
  fi
  sleep 3
done

echo "✗ No se pudo obtener el spec de ${API_URL}/docs-json (¿arrancó el api dev?)" >&2
exit 1
