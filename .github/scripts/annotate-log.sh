#!/usr/bin/env bash
# Usage: annotate-log.sh <file> <title> [lines]
# Prints the tail of a log file as a GitHub error annotation, so it can be read through the
# check-runs REST API even when the raw job logs cannot be downloaded.
set -euo pipefail
file="$1"
title="$2"
lines="${3:-60}"
[ -s "$file" ] || exit 0
body="$(tail -n "$lines" "$file" | sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g' | tail -c 6000)"
body="${body//'%'/'%25'}"
body="${body//$'\r'/'%0D'}"
body="${body//$'\n'/'%0A'}"
echo "::error title=${title}::${body}"
