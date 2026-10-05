import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Explicit cleanup is needed because Vitest globals are intentionally disabled.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
