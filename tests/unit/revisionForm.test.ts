import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { revisionCopy, tutorHonorificCap } from "@/lib/copy/vi";
import type { MyRevisionView } from "@/lib/revision/types";

// Hooks are replaced by plain stubs so the component function can be called directly and its element tree inspected.
const setters: { name: string; calls: unknown[][] }[] = [];
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  let n = 0;
  return {
    ...actual,
    useState: (init: unknown) => {
      const rec = { name: `state${(n += 1)}`, calls: [] as unknown[][] };
      setters.push(rec);
      return [typeof init === "function" ? (init as () => unknown)() : init, (...a: unknown[]) => rec.calls.push(a)];
    },
    useRef: (v: unknown) => ({ current: v }),
    useEffect: () => undefined,
  };
});
vi.mock("next/link", () => ({ default: () => null }));

import { RevisionForm } from "@/components/revision/RevisionForm";

const rev: MyRevisionView = {
  activityId: "r1", feedbackId: "f1", instanceId: "i1", titleVi: "Núi lửa", bigQuestionEn: null, round: 1, praise: "Con viết rõ.",
  items: [{ n: 1, text: "Thêm câu kết.", excerpt: null }, { n: 2, text: "Dùng từ nối.", excerpt: null }],
  oldText: "Some volcanoes explode.", reasonRequired: false, state: "todo", submittedAt: null, closingNote: null, draft: null,
};

type El = ReactElement<{ children?: ReactNode; [k: string]: unknown }>;
function find(node: ReactNode, pred: (e: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((c) => find(c, pred, out));
  else if (node && typeof node === "object" && "props" in node) {
    const e = node as El;
    if (pred(e)) out.push(e);
    find(e.props.children, pred, out);
  }
  return out;
}

describe("RevisionForm", () => {
  it("N4: paste is detected on the main textarea only, not on the whole form", () => {
    setters.length = 0;
    const tree = RevisionForm({ revision: rev }) as El;
    expect(tree.type).toBe("form");
    expect(tree.props.onPaste).toBeUndefined();
    expect(tree.props.onPasteCapture).toBeUndefined();
    const areas = find(tree, (e) => e.type === "textarea");
    expect(areas).toHaveLength(1);
    const onPaste = areas[0]!.props.onPaste as () => void;
    expect(typeof onPaste).toBe("function");
    // no other field listens to paste (the reason boxes, for one)
    expect(find(tree, (e) => e.type !== "textarea" && (e.props.onPaste !== undefined || e.props.onPasteCapture !== undefined))).toEqual([]);
    onPaste();
    const pastedSetter = setters.find((s) => s.calls.some((c) => c[0] === true));
    expect(pastedSetter, "pasting into the editor marks the work as pasted").toBeDefined();
  });

  it("N5: every item's legend and reason label name the item, so a screen reader can tell them apart", () => {
    const html = renderToStaticMarkup(createElement(RevisionForm, { revision: rev }));
    for (const n of [1, 2]) {
      expect(html).toContain(`<legend class="sr-only">${revisionCopy.itemLabel(n)}: ${revisionCopy.marksTitle}</legend>`);
      expect(html).toContain(`<span class="sr-only">${revisionCopy.itemLabel(n)}. </span>`);
    }
  });

  it("S2: the stale-feedback message names the tutor through the single honorific and asks for a reload", () => {
    expect(revisionCopy.feedbackChanged).toBe(`${tutorHonorificCap} vừa sửa góp ý — tải lại trang để xem bản mới.`);
    expect(revisionCopy.reload.length).toBeGreaterThan(0);
  });
});
