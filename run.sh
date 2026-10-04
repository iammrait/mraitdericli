#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "========================================================"
echo "  Launching Directory Submitter (mrait.ca)"
echo "========================================================"

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[Setup] Installing packages..."
    npm install
fi

echo "[Starting] Opening Directory Submitter on port 3000..."
npm start
