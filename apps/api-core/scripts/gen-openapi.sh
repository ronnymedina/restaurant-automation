#!/usr/bin/env bash
#
# Exporta el spec OpenAPI de la API a apps/api-core/openapi.json.
#
# Swagger vive SOLO en dev (`main.ts`: `if (!isProduction)`), así que el spec se saca del
# `/docs-json` del servidor dev. ASUME que el api dev ya está levantado
# (`docker compose up -d res-db res-api-core`) — no verifica ni levanta nada.
#
# Uso:  cd apps/api-core && pnpm gen:openapi
#
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
# Ruta absoluta derivada de la ubicación del script: el archivo SIEMPRE queda dentro de
# apps/api-core, sin importar desde dónde se ejecute.
OUT="$(cd "$(dirname "$0")/.." && pwd)/openapi.json"

if ! curl -sf "${API_URL}/docs-json" -o "${OUT}.tmp"; then
  echo "✗ ${API_URL}/docs-json no responde. Levantá el api dev: docker compose up -d res-db res-api-core" >&2
  rm -f "${OUT}.tmp"
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  python3 -m json.tool "${OUT}.tmp" > "$OUT"   # pretty-print para diffs estables
  rm -f "${OUT}.tmp"
else
  mv "${OUT}.tmp" "$OUT"
fi

paths="$(python3 -c "import json;print(len(json.load(open('$OUT'))['paths']))" 2>/dev/null || echo '?')"
echo "✓ OpenAPI escrito en ${OUT} (${paths} rutas)"
