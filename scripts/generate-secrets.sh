#!/bin/sh
# Prints the secret lines for .env, generated properly.
#
#   ./scripts/generate-secrets.sh >> .env
#
# Two of these are Base64 of exactly 32 raw bytes, which is what the backend
# checks for -- a 32-character password pasted in its place is rejected.
set -e
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "STMC_AI_EVENT_TOKEN=$(openssl rand -hex 32)"
echo "BIOMETRIC_ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo "CAMERA_CREDENTIALS_KEY=$(openssl rand -base64 32)"
echo "CAMERA_STREAM_SIGNING_KEY=$(openssl rand -hex 32)"
echo "REALTIME_SIGNING_KEY=$(openssl rand -hex 32)"
echo "DB_PASSWORD=$(openssl rand -hex 16)"
echo "ADMIN_PASSWORD=$(openssl rand -hex 12)"
