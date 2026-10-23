-- 0022_seed_ap_0_3.sql
-- GENERATED FILE — do not edit by hand. Source: content/*.json, locked in content/config.lock.json.
-- Verify: npm run gen:config -- --check (CI fails when this file differs from the generator output
-- or when a version already published here has changed — then create a NEW version instead).
-- Contains: policy AP-0.3
-- sha256 policy AP-0.3=a308f258c3b9276c7c98758a095e71d11f07381cc02bfe20bc612efe81adf28e
-- Idempotent: every insert is skipped when the row exists; catalogue rows are skipped once the version is published.

-- Assessment policy AP-0.3 (published immediately)
insert into english.assessment_policies(version, config, source_hash, published_at)
values ('AP-0.3', $j${"independent":{"minFirstAttemptEpisodes":3,"distinctDays":true,"minContexts":2,"minSpanDays":7,"minScoreEach":3,"requireValidated":true,"minDirectCheckpoint":1,"allowedModes":["INDEPENDENT_CHECK"],"maxAssistanceAffectingTarget":0},"transferable":{"requires":"INDEPENDENT","minDistinctEpisodes":2,"needs":["delayed_check","transfer_check"],"delayedMinDaysFromLastExposure":14,"transferNeedsTutorDescribedDifference":true},"supported":{"minScore":1,"assistanceAllowed":true},"developing":{"minScore":3},"conflictWindowDays":21,"revisionNeverFirstAttempt":true,"receptiveAuto":{"domains":["reading","listening","grammar","vocab"],"minItems":8,"minActivities":2,"minAccuracyPct":75,"developingMinItems":4,"developingMinAccuracyPct":75,"reviewMinDays":14,"reviewMinAccuracyPct":70,"firstAttemptOnly":true,"allowedModes":["PRACTICE","INDEPENDENT_CHECK"],"maxAssistanceAffectingTarget":0},"levelGate":null}$j$::jsonb, 'a308f258c3b9276c7c98758a095e71d11f07381cc02bfe20bc612efe81adf28e', now())
on conflict (version) do nothing;

insert into english.schema_migrations(version) values ('0022') on conflict do nothing;
