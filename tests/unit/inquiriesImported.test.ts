import { describe, expect, it } from "vitest";
import { isImportedTemplateId, withoutImported, type ActivityRow, type EventRow, type InstanceRow } from "@/lib/inquiries/view";

const inst = (id: string, template_id: string) => ({ id, template_id, template_version: 1 }) as InstanceRow;
const act = (id: string, inquiry_instance_id: string) => ({ id, inquiry_instance_id }) as ActivityRow;
const ev = (id: number, activity_instance_id: string) => ({ id, activity_instance_id }) as EventRow;

describe("imported work is not assigned work", () => {
  it("recognises the imported template ids only", () => {
    expect(isImportedTemplateId("B-IM-000012")).toBe(true);
    expect(isImportedTemplateId("A-IM-000001")).toBe(true);
    expect(isImportedTemplateId("B-ST-000001")).toBe(false);
    expect(isImportedTemplateId("A-W1-VOLCANOES")).toBe(false);
  });
  it("drops the imported instance with its activities and events; keeps the rest", () => {
    const out = withoutImported({
      instances: [inst("i1", "A-W1-VOLCANOES"), inst("i2", "B-IM-000001")],
      activities: [act("a1", "i1"), act("a2", "i2")],
      events: [ev(1, "a1"), ev(2, "a2")],
    });
    expect(out.instances.map((i) => i.id)).toEqual(["i1"]);
    expect(out.activities.map((a) => a.id)).toEqual(["a1"]);
    expect(out.events.map((e) => e.id)).toEqual([1]);
  });
});
