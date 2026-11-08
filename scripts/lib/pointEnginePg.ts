/** PointEngineStore over a pg connection (DB tests, CI): each call runs as service_role in its own committed transaction, like the app's admin client. */
import type { ClientBase } from "pg";
import type { PointEngineStore } from "../../lib/engine/points/runner";

export function pgPointStore(client: ClientBase): PointEngineStore {
  const call = async (sql: string, params: unknown[]): Promise<unknown> => {
    await client.query("begin");
    try {
      await client.query("set local role service_role");
      const r = await client.query<{ r: unknown }>(sql, params);
      await client.query("commit");
      return r.rows[0]?.r;
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  };
  return {
    loadInputs: (learnerId, tags) => call("select english.eng_point_inputs($1, $2::text[]) as r", [learnerId, tags]),
    applyResults: (learnerId, rows, engineVersion) => call("select english.eng_apply_point_results($1, $2::jsonb, $3) as r", [learnerId, JSON.stringify(rows), engineVersion]),
    resetStates: (learnerId, byMemberId) => call("select english.eng_reset_point_states($1, $2) as r", [learnerId, byMemberId]),
  };
}
