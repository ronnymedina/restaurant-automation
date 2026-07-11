#!/bin/sh
set -e

if [ -z "$PUBLIC_API_URL" ]; then
  echo "ERROR: PUBLIC_API_URL is not set" >&2
  exit 1
fi

find /usr/share/nginx/html -name "*.js" \
  -exec sed -i "s#__PLACEHOLDER_API_URL__#${PUBLIC_API_URL}#g" {} +

exec nginx -g 'daemon off;'
