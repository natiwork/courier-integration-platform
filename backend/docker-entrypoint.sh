#!/bin/sh
# Starts the backend container: migrate, then run the server. (Without WEBHOOK_SECRET_* the server picks random
# ones per start for the built-in simulator; see src/server.ts.)
set -e

# Brings the schema up to date. Safe on every start: applied files are skipped, and an advisory lock stops two
# containers from migrating at the same time.
node dist/cli/migrate.js

# exec: Node replaces this shell, so `docker stop` (SIGTERM) reaches the server and it shuts down cleanly.
exec node dist/server.js
