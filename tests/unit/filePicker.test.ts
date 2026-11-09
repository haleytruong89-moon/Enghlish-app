import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilePicker } from "@/components/ui/FilePicker";
import { filePickerCopy } from "@/lib/copy/vi";

const render = (name: string | null) =>
  renderToStaticMarkup(createElement(FilePicker, { testId: "x-file", accept: "application/pdf", name, onPick: () => {}, ariaLabel: "File đề" }));

describe("FilePicker", () => {
  it("shows one button-styled control with the native input kept inside the label, visually hidden", () => {
    const html = render(null);
    expect(html).toContain("📎");
    expect(html).toContain(filePickerCopy.choose);
    expect(html).toContain(filePickerCopy.none);
    expect(html).toMatch(/<label[^>]*min-h-11[^>]*border-accent[\s\S]*<input[^>]*type="file"[^>]*sr-only[^>]*data-testid="x-file"/);
    expect(html).toContain('aria-label="File đề"');
  });
  it("shows the chosen file name and offers to change it", () => {
    const html = render("de-thu.pdf");
    expect(html).toContain("de-thu.pdf");
    expect(html).toContain(filePickerCopy.change);
    expect(html).not.toContain(filePickerCopy.none);
    expect(html).toContain('data-testid="x-file-name"');
  });
});
