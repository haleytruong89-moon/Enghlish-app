import type { NextRequest } from "next/server";
import { readJson } from "@/lib/inquiries/route";
import { childRpc } from "@/lib/notebook/childRoute";
import { saveBodySchema } from "@/lib/notebook/handlers";

/** POST /api/student/notebook — "+ Lưu vào Sổ tay" (E2a). Already there → {already: true}; removed before → added back. */
export async function POST(request: NextRequest) {
  const p = saveBodySchema.safeParse(await readJson(request));
  return childRpc("POST /api/student/notebook", "eng_notebook_save", p.success ? { p_card: p.data.card_id, p_client_id: p.data.client_id } : null);
}
