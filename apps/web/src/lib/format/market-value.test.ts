import { describe, expect, it } from "vitest";

import { formatMarketPrice, formatPercentChange } from "@/lib/format/market-value";

describe("market display formatting", () => {
  it("formats USD prices without dropping small-market precision", () => {
    expect(formatMarketPrice("67542.31")).toBe("$67,542.31");
    expect(formatMarketPrice("0.5212")).toBe("$0.5212");
  });

  it.each([
    ["2.41", "+2.41%"],
    ["-1.85", "-1.85%"],
    ["0", "+0.00%"],
  ])("includes a textual sign for %s percent change", (value, expected) => {
    expect(formatPercentChange(value)).toBe(expected);
  });
});
