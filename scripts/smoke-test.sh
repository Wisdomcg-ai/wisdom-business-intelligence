#!/bin/bash
# Smoke Test Script
# Runs after build to verify key routes load without runtime errors
# Usage: npm run smoke-test

set -e

PORT=${PORT:-3000}
BASE_URL="http://localhost:$PORT"
TIMEOUT=60
STARTUP_WAIT=10

echo "=== Smoke Test ==="
echo "Starting production server on port $PORT..."

# Kill any existing process on the port
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true

# Start production server in background
npm run start &
SERVER_PID=$!

# Cleanup function
cleanup() {
  echo "Cleaning up..."
  kill $SERVER_PID 2>/dev/null || true
  lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT

# Wait for server to start
echo "Waiting for server to start..."
for i in $(seq 1 $STARTUP_WAIT); do
  if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL" 2>/dev/null | grep -q "200\|302\|307"; then
    echo "Server is ready!"
    break
  fi
  if [ $i -eq $STARTUP_WAIT ]; then
    echo "ERROR: Server failed to start within ${STARTUP_WAIT}s"
    exit 1
  fi
  sleep 1
done

# Define routes to test
# Format: "route|expected_status|description"
ROUTES=(
  "/auth/login|200|Login page"
  "/|200|Home page"
  "/privacy|200|Privacy page"
  "/terms|200|Terms page"
)

FAILED=0
PASSED=0

echo ""
echo "Testing routes..."
echo "---"

for route_config in "${ROUTES[@]}"; do
  IFS='|' read -r route expected_status description <<< "$route_config"

  # Make request and get status code
  status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$route" 2>/dev/null)

  if [ "$status" = "$expected_status" ]; then
    echo "✓ $description ($route) - $status"
    ((PASSED++))
  else
    echo "✗ $description ($route) - Expected $expected_status, got $status"
    ((FAILED++))
  fi
done

echo "---"
echo "Passed: $PASSED, Failed: $FAILED"

if [ $FAILED -gt 0 ]; then
  echo ""
  echo "ERROR: $FAILED route(s) failed smoke test"
  exit 1
fi

echo ""
echo "All smoke tests passed!"
exit 0
