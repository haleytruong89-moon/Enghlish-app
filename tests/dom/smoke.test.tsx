import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(cleanup);

function Toggle() {
  const [on, setOn] = useState(false);
  return (
    <button type="button" aria-pressed={on} onClick={() => setOn(!on)}>
      toggle
    </button>
  );
}

describe("dom project", () => {
  it("renders and handles a click", () => {
    render(<Toggle />);
    const b = screen.getByRole("button");
    expect(b.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(b);
    expect(b.getAttribute("aria-pressed")).toBe("true");
  });
});
