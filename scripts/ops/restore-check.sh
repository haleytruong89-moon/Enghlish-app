#!/usr/bin/env bash
# Backup restore check (S5c). Restores the plain dumps into a THROWAWAY Postgres and compares row counts with the live database.
# Runs inside the backup job only, before anything is encrypted. Prints and writes COUNTS ONLY: no row data, no error text.
#
# Inputs (environment):
#   PLAIN_DIR   directory with main.dump (required), auth.dump (optional), counts.before / counts.after (english tables)
#               and auth.counts.before / auth.counts.after (only when auth.dump exists)
#   PG_BIN      directory with psql and pg_restore
#   RC_HOST RC_PORT RC_USER RC_PASSWORD   the throwaway server (defaults: 127.0.0.1, 5432, postgres; password required)
#   SUMMARY_FILE   where to write the markdown summary (default $PLAIN_DIR/restore-summary.md); also appended to $GITHUB_STEP_SUMMARY if set
# Exit code: 0 = the restored copy matches; 1 = any english/auth restore error, any table-count mismatch, or main.dump missing.
set -euo pipefail
umask 077
: "${PLAIN_DIR:?PLAIN_DIR is required}" "${PG_BIN:?PG_BIN is required}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PGSSLMODE=disable PGPASSWORD="${RC_PASSWORD:?RC_PASSWORD is required}"
host="${RC_HOST:-127.0.0.1}"; port="${RC_PORT:-5432}"; user="${RC_USER:-postgres}"
summary="${SUMMARY_FILE:-$PLAIN_DIR/restore-summary.md}"
work="$PLAIN_DIR"

[ -f "$work/main.dump" ] || { echo "::error::main.dump is missing: nothing to check"; exit 1; }
have_auth=0; [ -f "$work/auth.dump" ] && have_auth=1

"$PG_BIN/psql" -h "$host" -p "$port" -U "$user" -qAt -v ON_ERROR_STOP=1 -d postgres -c "create database restore_check" > /dev/null
rc=(-h "$host" -p "$port" -U "$user" -d restore_check)

# What the dump expects to find on Supabase: the API roles and the auth schema with auth.uid() (policies call it). Nothing else.
"$PG_BIN/psql" "${rc[@]}" -q -v ON_ERROR_STOP=1 > /dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role authenticator nologin;
create role supabase_auth_admin nologin;
drop schema public cascade; -- the dump creates public itself
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.role() returns text language sql stable as $$ select null::text $$;
create function auth.jwt() returns jsonb language sql stable as $$ select null::jsonb $$;
SQL

# Each dump is restored on its own and its errors are counted on their own. Error TEXT is never printed (it can quote data).
# An error block is "critical" when it names an object of schema english or auth; all errors of the login dump are critical.
classify() { # file -> "<total> <critical>"
  awk -v re='(english|auth)[.]|"(english|auth)"' '
    function flush() { if (n) { total++; if (blk ~ re) crit++ } }
    /^pg_restore: error:/ { flush(); n = 1; blk = $0; next }
    /^pg_restore:/ { flush(); n = 0; blk = ""; next }
    n { blk = blk "\n" $0 }
    END { flush(); print total + 0, crit + 0 }' "$1"
}

: > "$work/auth.err"; : > "$work/main.err"
set +e
if [ "$have_auth" -eq 1 ]; then
  # Restore order: login tables first (english.members points at auth.users). Their triggers call Launcher functions that are not restored.
  "$PG_BIN/pg_restore" -l "$work/auth.dump" | { grep -v ' TRIGGER ' || true; } > "$work/auth.list"
  "$PG_BIN/pg_restore" --no-owner --no-acl -L "$work/auth.list" "${rc[@]}" "$work/auth.dump" 2> "$work/auth.err"
fi
"$PG_BIN/pg_restore" --no-owner --no-acl "${rc[@]}" "$work/main.dump" 2> "$work/main.err"
set -e
read -r auth_total auth_crit < <(classify "$work/auth.err")
read -r main_total main_crit < <(classify "$work/main.err")
[ "$have_auth" -eq 1 ] && auth_crit="$auth_total"
public_only=$((main_total - main_crit))

# Row counts of the restored copy, then the comparison.
"$PG_BIN/psql" "${rc[@]}" -qtA -v ON_ERROR_STOP=1 -f "$here/counts-english.sql" > "$work/counts.restored"
cp "$work/counts.before" "$work/cmp.before"; cp "$work/counts.after" "$work/cmp.after"
if [ "$have_auth" -eq 1 ]; then
  "$PG_BIN/psql" "${rc[@]}" -qtA -v ON_ERROR_STOP=1 -f "$here/counts-auth.sql" >> "$work/counts.restored"
  cat "$work/auth.counts.before" >> "$work/cmp.before"; cat "$work/auth.counts.after" >> "$work/cmp.after"
fi
cmp_ok=0
bash "$here/compare-counts.sh" "$work/cmp.before" "$work/cmp.after" "$work/counts.restored" "$work/cmp.md" || cmp_ok=1

failed=0
[ "$cmp_ok" -ne 0 ] && failed=1
[ "$main_crit" -ne 0 ] && failed=1
[ "$auth_crit" -ne 0 ] && failed=1
{
  echo "## Restore check (throwaway Postgres 17 inside this job)"
  echo
  cat "$work/cmp.md"
  echo
  if [ "$have_auth" -eq 1 ]; then
    echo "Restore errors in the login tables (auth): $auth_crit"
  else
    echo "**The login-table dump (auth.users, auth.identities) was missing: auth was NOT checked.**"
    echo "(english.members points at auth.users, so one restore error about that link is expected without it.)"
  fi
  echo "Restore errors that name schema english or auth (public + english dump): $main_crit"
  echo "Other restore errors, public schema of the Launcher (number only, not failing): $public_only"
  echo "Error text and row data are never shown."
  echo
  if [ "$failed" -eq 0 ]; then
    if [ "$have_auth" -eq 1 ]; then echo "Restore check PASSED. The encrypted files below can be restored."
    else echo "Restore check PASSED for public + english only (auth not checked)."; fi
  else
    echo "**Restore check FAILED.** The encrypted files were still saved, but do not rely on this backup until the cause is found."
  fi
} > "$summary"
cat "$summary"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then cat "$summary" >> "$GITHUB_STEP_SUMMARY"; fi
if [ "$failed" -ne 0 ]; then echo "::error::restore check failed: row counts differ or schema english/auth restore errors"; exit 1; fi
