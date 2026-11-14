import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuardedLink } from "@/components/ui/GuardedLink";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { useSaveStatus } from "@/components/ui/useSaveStatus";
import { saveStatusCopy } from "@/lib/copy/vi";

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...p }: { href: string; children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void }) => (
    <a href={href} onClick={onClick} {...p}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Form({ save }: { save: () => Promise<{ ok: true } | { ok: false }> }) {
  const [text, setText] = useState("a");
  const { state, run } = useSaveStatus({ text });
  return (
    <div>
      <input data-testid="f" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" data-testid="save" onClick={() => void run(save)}>save</button>
      <SaveStatus state={state} />
      <GuardedLink href="/elsewhere">go</GuardedLink>
    </div>
  );
}
const status = () => screen.getByTestId("save-status").textContent;
const type = (v: string) => fireEvent.change(screen.getByTestId("f"), { target: { value: v } });
const beforeUnload = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("useSaveStatus", () => {
  it("typing shows 'Có thay đổi chưa lưu' and blocks leaving; saving shows 'Đang lưu…' then 'Đã lưu lúc hh:mm' and unblocks", async () => {
    let release!: () => void;
    const save = () => new Promise<{ ok: true }>((r) => { release = () => r({ ok: true }); });
    render(<Form save={save} />);
    expect(status()).toBe("");
    expect(beforeUnload()).toBe(false);
    type("ab");
    expect(status()).toBe(saveStatusCopy.dirty);
    expect(beforeUnload()).toBe(true);
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(status()).toBe(saveStatusCopy.saving));
    await act(async () => release());
    await waitFor(() => expect(status()).toMatch(/^✓ Đã lưu lúc \d{2}:\d{2}$/));
    expect(beforeUnload()).toBe(false);
    type("abc");
    expect(status()).toBe(saveStatusCopy.dirty);
  });

  it("a failed save shows the error and stays dirty", async () => {
    render(<Form save={async () => ({ ok: false })} />);
    type("x");
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(status()).toBe(saveStatusCopy.error));
    expect(beforeUnload()).toBe(true);
  });

  it("GuardedLink asks first when there are unsaved changes: 'no' stops the navigation, 'yes' lets it through", () => {
    render(<Form save={async () => ({ ok: true })} />);
    const link = screen.getByText("go");
    const confirm = vi.spyOn(window, "confirm");
    expect(fireEvent.click(link)).toBe(true); // clean: no question
    expect(confirm).not.toHaveBeenCalled();
    type("dirty");
    confirm.mockReturnValue(false);
    expect(fireEvent.click(link)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(saveStatusCopy.leaveConfirm);
    confirm.mockReturnValue(true);
    expect(fireEvent.click(link)).toBe(true);
  });
});
