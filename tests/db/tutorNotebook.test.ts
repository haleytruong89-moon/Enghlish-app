import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCommit, createTestDb, migrate, seed, type Seeded, type TestDb } from "./helpers";

/** E2a (migration 0041): tutor asks, shared word cards, Sổ tay, who reads what (D-G8), purge, limits. */
describe("tutor + notebook (migration 0041)", () => {
  let db: TestDb;
  let s: Seeded;
  const CARD = (JSON.parse(readFileSync("tests/fixtures/notebook/fake-card.json", "utf8")) as { card: Record<string, unknown> }).card;
  const svc = <T = unknown>(sql: string, params: unknown[] = []) =>
    asCommit(db.client, "service_role", null, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const asUser = <T = unknown>(user: string, sql: string, params: unknown[] = []) =>
    asCommit(db.client, "authenticated", user, async (q) => ((await q(sql, params)).rows[0] as { r: T }).r);
  const fail = async (p: Promise<unknown>, code: string, re?: RegExp) => {
    const err = await p.then(() => null, (e: unknown) => e as { code?: string; message?: string });
    expect(err, "expected an error").not.toBeNull();
    expect(err?.code, err?.message).toBe(code);
    if (re) expect(err?.message).toMatch(re);
  };
  type Ctx = { learner_id: string; language: string; band: string; lookups_today: number; lookup_limit: number; ai_lookups_today: number; ai_lookup_limit: number; consent_version: string | null; ask: { card_id: string } | null; replay?: { id: string; card_id: string } };
  const ctx = (user: string, clientId = randomUUID(), ask: string | null = null) =>
    svc<Ctx>("select english.eng_lookup_context($1, $2, $3) as r", [user, clientId, ask]);
  const save = (content: Record<string, unknown>, supersedes: string | null = null, band = "A2-B1", lang = "vi") =>
    svc<string>("select english.eng_save_vocab_card($1, $2, $3::jsonb, 'vocab-card.v1', 'claude-sonnet-5-5', $4) as r", [band, lang, JSON.stringify(content), supersedes]);
  const record = (user: string, o: { card?: string | null; clientId?: string; usedAi?: boolean; fixed?: string | null; kind?: string; parent?: string | null; text?: string } = {}) =>
    svc<{ id: string; replayed: boolean }>(
      "select english.eng_record_tutor_ask($1, $2, $3, null, $4, null, $5, null, $6, '{}'::text[], '{}'::text[], $7, $8, 'vocab-card.v1', 'claude-sonnet-5-5', '{}'::uuid[], 0.01, $9) as r",
      [user, o.kind ?? "lookup", o.text ?? "make", o.card === undefined ? null : o.card, o.parent ?? null, o.fixed ? "fixed" : "pass", o.fixed ?? null, o.usedAi ?? false, o.clientId ?? randomUUID()]);

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.client);
    s = await seed(db.client);
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("the child's context: track settings, limits, consent; adults are refused", async () => {
    const c = await ctx(s.users.studentAn);
    expect(c).toMatchObject({ language: "vi", band: "A2-B1", lookups_today: 0, lookup_limit: 60, ai_lookups_today: 0, ai_lookup_limit: 30, ask: null });
    expect((await ctx(s.users.studentNguyen)).language).toBe("en_first");
    await fail(ctx(s.users.parent), "42501", /not_child/);
    await fail(ctx(s.users.tutorAn), "42501", /not_child/);
  });

  it("a card is found by its word or a form; a new version replaces it once; a second save of the same word returns the current card", async () => {
    const first = await save(CARD);
    expect((await svc<{ id: string }>("select english.eng_vocab_card_find('made', 'A2-B1', 'vi') as r")).id).toBe(first);
    expect(await svc("select english.eng_vocab_card_find('made', 'B2-C1', 'en_first') as r")).toBeNull();
    expect(await save(CARD)).toBe(first); // two children at once: no second current card
    const second = await save({ ...CARD, core: "make = tạo ra." }, first);
    expect((await svc<{ id: string }>("select english.eng_vocab_card_find('make', 'A2-B1', 'vi') as r")).id).toBe(second);
    await fail(save(CARD, first), "23514", /bad_supersedes/);
    // the child always opens the current version of a card
    expect((await asUser<{ id: string }>(s.users.studentAn, "select english.eng_my_vocab_card($1) as r", [first])).id).toBe(second);
  });

  it("an ask is recorded once per client id; counts are per Vietnamese day; used_ai counts AI lookups", async () => {
    const card = await save({ ...CARD, headword: "volcano", forms: ["volcano", "volcanoes"] });
    const id = randomUUID();
    const a = await record(s.users.studentAn, { card, clientId: id, usedAi: true });
    expect(a.replayed).toBe(false);
    expect((await record(s.users.studentAn, { card, clientId: id, usedAi: true })).replayed).toBe(true);
    await record(s.users.studentAn, { fixed: "daily_limit" }); // a refused ask does not count against the limit
    const c = await ctx(s.users.studentAn);
    expect(c.lookups_today).toBe(1);
    expect(c.ai_lookups_today).toBe(1);
    const replay = await ctx(s.users.studentAn, id);
    expect(replay.replay?.card_id).toBe(card);
    expect((await ctx(s.users.studentAn, randomUUID(), a.id)).ask?.card_id).toBe(card);
    expect((await ctx(s.users.studentNguyen, randomUUID(), a.id)).ask).toBeNull(); // the other child's ask
  });

  it("asks are append-only", async () => {
    const a = await record(s.users.studentAn, { card: await save(CARD) });
    await fail(db.client.query("update english.tutor_asks set child_text = 'x' where id = $1", [a.id]), "42501");
    await fail(db.client.query("delete from english.tutor_asks where id = $1", [a.id]), "42501");
  });

  it("Sổ tay: save, already there, remove, restore, save again after removing", async () => {
    const card = await save({ ...CARD, headword: "erupt", forms: ["erupt", "erupted"] });
    const s1 = await asUser<{ item_id: string; already: boolean }>(s.users.studentAn, "select english.eng_notebook_save($1, $2) as r", [card, randomUUID()]);
    expect(s1.already).toBe(false);
    expect((await asUser<{ already: boolean }>(s.users.studentAn, "select english.eng_notebook_save($1, $2) as r", [card, randomUUID()])).already).toBe(true);
    type Row = { item_id: string; headword: string; state: string; meaning: string };
    const mine = () => asUser<Row[]>(s.users.studentAn, "select english.eng_my_notebook('word') as r");
    expect((await mine()).find((r) => r.headword === "erupt")).toMatchObject({ state: "active" });
    await asUser(s.users.studentAn, "select english.eng_notebook_set($1, 'remove') as r", [s1.item_id]);
    expect((await mine()).find((r) => r.headword === "erupt")?.state).toBe("removed");
    const again = await asUser<{ item_id: string; already: boolean }>(s.users.studentAn, "select english.eng_notebook_save($1, $2) as r", [card, randomUUID()]);
    expect(again).toMatchObject({ item_id: s1.item_id, already: false });
    expect((await mine()).find((r) => r.headword === "erupt")?.state).toBe("active");
    // the other child cannot touch or see it
    await fail(asUser(s.users.studentNguyen, "select english.eng_notebook_set($1, 'remove') as r", [s1.item_id]), "42501");
    expect((await asUser<Row[]>(s.users.studentNguyen, "select english.eng_my_notebook('word') as r")).some((r) => r.headword === "erupt")).toBe(false);
  });

  it("the child never reads the asks table; the parent and the child's tutor read through the function; another tutor cannot (D-G8)", async () => {
    const a = await record(s.users.studentAn, { card: await save(CARD), text: "make" });
    const rows = await asCommit(db.client, "authenticated", s.users.studentAn, async (q) => (await q("select id from english.tutor_asks").then((r) => r.rows, () => [])));
    expect(rows).toEqual([]);
    type Ask = { id: string; headword: string; rating: string | null; saved: boolean };
    expect((await asUser<Ask[]>(s.users.parent, "select english.eng_tutor_asks_for($1) as r", [s.learners.an])).some((r) => r.id === a.id)).toBe(true);
    expect((await asUser<Ask[]>(s.users.tutorAn, "select english.eng_tutor_asks_for($1) as r", [s.learners.an])).some((r) => r.id === a.id)).toBe(true);
    await fail(asUser(s.users.tutorNguyen, "select english.eng_tutor_asks_for($1) as r", [s.learners.an]), "42501");
    await fail(asUser(s.users.studentAn, "select english.eng_tutor_asks_for($1) as r", [s.learners.an]), "42501");
    // 😊😐😕: only on one's own ask; the latest wins
    await asUser(s.users.studentAn, "select english.eng_rate_tutor_ask($1, 'ok') as r", [a.id]);
    await asUser(s.users.studentAn, "select english.eng_rate_tutor_ask($1, 'good') as r", [a.id]);
    await fail(asUser(s.users.studentNguyen, "select english.eng_rate_tutor_ask($1, 'good') as r", [a.id]), "42501");
    expect((await asUser<Ask[]>(s.users.parent, "select english.eng_tutor_asks_for($1) as r", [s.learners.an])).find((r) => r.id === a.id)?.rating).toBe("good");
  });

  it("recent lookups: one row per card, newest first; status for the child only", async () => {
    const recent = await asUser<{ headword: string }[]>(s.users.studentAn, "select english.eng_my_recent_lookups(5) as r");
    expect(recent.length).toBeGreaterThan(0);
    expect(new Set(recent.map((r) => r.headword)).size).toBe(recent.length);
    const st = await asUser<{ lookup_limit: number; ai_enabled: boolean }>(s.users.studentAn, "select english.eng_my_tutor_status() as r");
    expect(st.lookup_limit).toBe(60);
    expect(await asUser(s.users.parent, "select english.eng_my_tutor_status() as r")).toBeNull();
  });

  it("IPA reference table: anyone signed in reads it through the function", async () => {
    await db.client.query("insert into english.ipa_lexicon(word, accent, ipa, source) values ('make', 'uk', '{/ˈmeɪk/}', 'test') on conflict do nothing");
    const r = await asUser<{ word: string; ipa: string[] }[]>(s.users.studentAn, "select english.eng_ipa_for(array['Make', 'zzz']) as r");
    expect(r).toEqual([{ word: "make", accent: "uk", ipa: ["/ˈmeɪk/"] }]);
  });

  it("the cost gate and the ledger take the new purposes", async () => {
    await svc("select english.eng_set_ai_settings(true, 'pilot-2026-10', $1) as r", [s.members.parent]);
    const g = await svc<{ reservation_id: string | null; allowed: boolean }>("select english.eng_ai_gate($1, 0.05, true, null, 'claude-sonnet-5-5', null, 'vocab_card') as r", [s.learners.an]);
    if (g.allowed) {
      await svc("select english.eng_log_ai_run($1, null, 'claude-sonnet-5-5', 'vocab-card.v1', 10, 10, 0.001, 'ok', null, null, $2, 'vocab_card') as r", [s.familyId, g.reservation_id]);
    }
    await fail(svc("select english.eng_ai_gate($1, 0, false, null, null, null, 'vocab_nope') as r", [s.learners.an]), "22023");
  });

  it("purge preview counts the new tables; purge removes the child's rows and keeps the shared cards", async () => {
    const before = await svc<{ counts: Record<string, number> }>("select english.eng_purge_preview($1) as r", [s.learners.an]);
    const counts = (before as unknown as { counts?: Record<string, number> }).counts ?? (before as unknown as Record<string, number>);
    expect(JSON.stringify(counts)).toContain("tutor_asks");
    const cards = Number((await db.client.query("select count(*) from english.vocab_cards")).rows[0].count);
    await svc("select english.eng_purge_learner($1, null) as r", [s.learners.an]);
    for (const t of ["tutor_asks", "tutor_ask_ratings", "notebook_items", "notebook_item_events"]) {
      expect(Number((await db.client.query(`select count(*) from english.${t} where learner_id = $1`, [s.learners.an])).rows[0].count)).toBe(0);
    }
    expect(Number((await db.client.query("select count(*) from english.vocab_cards")).rows[0].count)).toBe(cards);
  });

  it("running the migrations again is a no-op", async () => {
    await migrate(db.client);
  });
});
