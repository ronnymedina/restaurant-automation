#!/usr/bin/env bash
# Resend activation emails to all inactive users.
# Generates a new token for each user and sends the activation email.
#
# Usage:
#   ./commands/resend-activation.sh            # send emails
#   ./commands/resend-activation.sh --dry-run  # preview without sending

node_modules/.bin/ts-node -r tsconfig-paths/register src/cli/main.ts resend-activation "$@"
