import { describe, expect, it } from "vitest";
import { clientIdBook } from "@/lib/roadmap/clientId";

const counter = () => { let n = 0; return () => `id-${(n += 1)}-xxxxxxxx`; };

describe("clientIdBook", () => {
  it("the same content keeps the same id until the call ends for good", () => {
    const b = clientIdBook(counter());
    const a = b.idFor({ x: 1 });
    expect(b.idFor({ x: 1 })).toBe(a);
    b.settle({ ok: false, status: 0 }); // network
    expect(b.idFor({ x: 1 })).toBe(a);
    b.settle({ ok: false, status: 503 });
    expect(b.idFor({ x: 1 })).toBe(a);
  });
  it("success and a definite 4xx rotate", () => {
    const b = clientIdBook(counter());
    const a = b.idFor({ x: 1 });
    b.settle({ ok: true, status: 201 });
    const c = b.idFor({ x: 1 });
    expect(c).not.toBe(a);
    b.settle({ ok: false, status: 409 });
    expect(b.idFor({ x: 1 })).not.toBe(c);
  });
  it("other content gets another id (the SQL refuses one id for two payloads)", () => {
    const b = clientIdBook(counter());
    expect(b.idFor({ x: 1 })).not.toBe(b.idFor({ x: 2 }));
  });
});
