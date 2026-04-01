#!/bin/bash

set -e

echo "=== Proc Monitor Docker Deployment ==="

ENV_FILE="data/runtime-secrets.env"

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N 32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

ensure_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    touch "$ENV_FILE"
    chmod 600 "$ENV_FILE"
  fi

  if ! grep -q '^DATABASE_URL=' "$ENV_FILE"; then
    echo 'DATABASE_URL=file:/app/data/proc.db' >> "$ENV_FILE"
  fi

  if ! grep -q '^ADMIN_SECRET=' "$ENV_FILE"; then
    ADMIN_SECRET_VALUE="$(generate_secret)"
    echo "ADMIN_SECRET=$ADMIN_SECRET_VALUE" >> "$ENV_FILE"
    echo "Generated ADMIN_SECRET and saved it to $ENV_FILE"
  fi
}

# Create data directory
mkdir -p data

# Create persistent runtime env
ensure_env_file

# Build and start containers
echo "Building Docker image..."
docker compose build

echo "Starting containers..."
docker compose up -d

# Wait for container to be ready
echo "Waiting for app to be ready..."
sleep 8

# Push DB schema only (skip generate - already built)
echo "Setting up database..."
docker compose exec -T app npx --yes prisma@5.22.0 db push --skip-generate

# Run seed to ensure default settings exist
echo "Creating default settings..."
docker compose exec -T app npx --yes tsx prisma/seed.ts

echo ""
echo "=== Deployment Complete ==="
echo "App running at: http://localhost:3000"
echo "First visit: open /login and initialize the first admin account"
echo "Runtime secrets file: $ENV_FILE"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f     # View logs"
echo "  docker compose down        # Stop containers"
echo "  docker compose exec app sh # Shell into container"
