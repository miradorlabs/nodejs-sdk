#!/bin/bash
set -e

echo "=== Running Lint ==="
npm run lint

echo "=== Running Tests ==="
npm test

echo "=== Running Build ==="
npm run build

echo "=== All checks passed ==="
