import { afterEach, describe, expect, it, vi } from "vitest";
import { runSmokeCommand } from "./smoke";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runSmokeCommand", () => {
  it("reports SMOKE_OK when the scripted faux turn ends cleanly", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    const exit = await runSmokeCommand();

    expect(exit).toBe(0);
    const messageEnds = lines.filter((line) =>
      line.startsWith("message_end role=")
    );
    expect(messageEnds.length).toBeGreaterThanOrEqual(2);
    expect(
      messageEnds.some(
        (line) => line.includes("role=assistant") && /textLength=\d+/.test(line)
      )
    ).toBe(true);
    expect(lines.filter((line) => line.startsWith("turn_start"))).toHaveLength(
      1
    );
    expect(
      lines.filter((line) => line.startsWith("SMOKE_OK messageEnds="))
    ).toHaveLength(1);
    expect(lines.some((line) => line.startsWith("SMOKE_FAIL"))).toBe(false);
  });
});
