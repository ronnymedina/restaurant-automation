#!/usr/bin/env bash
# Resend activation emails to all inactive users.
# Generates a new token for each user and sends the activation email.
#
# Usage:
#   ./commands/resend-activation.sh            # send emails
#   ./commands/resend-activation.sh --dry-run  # preview without sending

if [ -f "node_modules/.bin/ts-node" ]; then
  node_modules/.bin/ts-node -r tsconfig-paths/register src/cli.ts resend-activation "$@"
else
  node dist/src/cli.js resend-activation "$@"
fi
