#!/bin/sh
# Starts the backend container: migrate, then run the server.
set -e

# Brings the schema up to date. Safe on every start: applied files are skipped, and an advisory lock stops two
# containers from migrating at the same time.
node dist/cli/migrate.js

# The webhook simulator signs its updates with the same secret the webhook endpoint checks, both inside this
# backend. Without configured secrets, a random one per start is enough for that. It is never printed.
# Set WEBHOOK_SECRET_SWIFTPARCEL / WEBHOOK_SECRET_NORDCARGO to fixed values to accept webhooks from elsewhere.
random_secret() {
  node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
}
if [ -z "$WEBHOOK_SECRET_SWIFTPARCEL" ]; then
  WEBHOOK_SECRET_SWIFTPARCEL=$(random_secret)
  export WEBHOOK_SECRET_SWIFTPARCEL
fi
if [ -z "$WEBHOOK_SECRET_NORDCARGO" ]; then
  WEBHOOK_SECRET_NORDCARGO=$(random_secret)
  export WEBHOOK_SECRET_NORDCARGO
fi

# exec: Node replaces this shell, so `docker stop` (SIGTERM) reaches the server and it shuts down cleanly.
exec node dist/server.js
