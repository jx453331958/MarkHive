#!/bin/sh
set -e

# Ensure data directory exists
mkdir -p /app/data

echo "Starting MarkHive..."
exec node server.mjs
