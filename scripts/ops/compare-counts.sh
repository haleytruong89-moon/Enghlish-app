#!/usr/bin/env bash
# Compare row counts of the live database (measured before AND after the dump) with the restored copy.
#   usage: compare-counts.sh BEFORE AFTER RESTORED OUT.md
# Each input file has lines "<table> <count>". A restored count passes when it lies between the "before" and "after" counts
# (rows written while the dump ran are not a failure). A table that is missing in the restored copy is a MISMATCH.
# Writes a markdown table (table name + numbers + OK/MISMATCH only) to OUT.md. Exit code: 0 all OK, 1 any MISMATCH or nothing compared.
set -euo pipefail
before="$1"; after="$2"; restored="$3"; out="$4"
tmp="$(mktemp)"
{ sed 's/^/B /' "$before"; sed 's/^/A /' "$after"; sed 's/^/R /' "$restored"; } | awk '
  NF >= 3 { names[$2] = 1; if ($1 == "B") b[$2] = $3; else if ($1 == "A") a[$2] = $3; else r[$2] = $3 }
  END {
    for (n in names) {
      bb = (n in b) ? b[n] : 0; aa = (n in a) ? a[n] : 0
      lo = bb + 0; hi = aa + 0
      if (lo > hi) { t = lo; lo = hi; hi = t }
      if (!(n in r)) { rr = "missing"; res = "MISMATCH" }
      else { rr = r[n]; res = ((rr + 0) >= lo && (rr + 0) <= hi) ? "OK" : "MISMATCH" }
      printf "%s|%s / %s|%s|%s\n", n, bb, aa, rr, res
    }
  }' | sort > "$tmp"
{
  echo "| Table | Live (before / after dump) | Restored | Result |"
  echo "|---|---|---|---|"
  awk -F'|' '{ printf "| %s | %s | %s | %s |\n", $1, $2, $3, $4 }' "$tmp"
} > "$out"
total="$(wc -l < "$tmp" | tr -d ' ')"
bad="$(grep -c '|MISMATCH$' "$tmp" || true)"
rm -f "$tmp"
if [ "$total" -eq 0 ]; then echo "nothing to compare" >> "$out"; exit 1; fi
[ "$bad" -eq 0 ]
