-- 0028_seed_point_policy_pp_0_1.sql
-- GENERATED FILE — do not edit by hand. Source: content/*.json, locked in content/config.lock.json.
-- Verify: npm run gen:config -- --check (CI fails when this file differs from the generator output
-- or when a version already published here has changed — then create a NEW version instead).
-- Contains: point policy PP-0.1
-- sha256 point_policy PP-0.1=b439543cbb11cc90d2a6502fbc601b224794cee78b3c3d3e9d902d6046cfede8
-- Idempotent: every insert is skipped when the row exists; catalogue rows are skipped once the version is published.

-- Knowledge-point level policy PP-0.1 (published immediately; needs 0027)
insert into english.point_policies(version, config, source_hash, published_at)
values ('PP-0.1', $j${"developing":{"minCorrect":1},"independent":{"minCounted":4,"minAccuracyPct":75,"minDistinctDays":2},"transferable":{"minCountedCorrect":2,"minDaysFromLastOccasion":14,"requiresDifferentSource":true},"flag":{"window":3,"minWrong":2},"supportCapLevel":2}$j$::jsonb, 'b439543cbb11cc90d2a6502fbc601b224794cee78b3c3d3e9d902d6046cfede8', now())
on conflict (version) do nothing;

insert into english.schema_migrations(version) values ('0028') on conflict do nothing;
