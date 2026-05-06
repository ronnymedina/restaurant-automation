#!/bin/sh

find /usr/share/nginx/html -name "*.js" \
  -exec sed -i "s|__PLACEHOLDER_API_URL__|${PUBLIC_API_URL}|g" {} +

exec nginx -g 'daemon off;'
