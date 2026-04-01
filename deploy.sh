#!/bin/bash

set -e

echo "=== Proc Monitor Docker Deployment ==="

# Create data directory
mkdir -p data

# Build and start containers
echo "Building Docker image..."
docker compose build

echo "Starting containers..."
docker compose up -d

# Wait for container to be ready
echo "Waiting for app to be ready..."
sleep 5

# Run seed to create default admin
echo "Creating admin user..."
docker compose exec -T app npx prisma db push
docker compose exec -T app npx tsx prisma/seed.ts || echo "Admin may already exist"

echo ""
echo "=== Deployment Complete ==="
echo "App running at: http://localhost:3000"
echo "Default admin: admin / admin123"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f     # View logs"
echo "  docker compose down        # Stop containers"
echo "  docker compose exec app sh # Shell into container"