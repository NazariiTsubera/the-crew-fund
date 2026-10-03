import { afterEach, describe, expect, it, vi } from "vitest";

import { readStoredTheme, storeTheme, THEME_KEY } from "@/lib/theme";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("theme storage", () => {
  it("reads back a stored choice", () => {
    vi.stubGlobal("localStorage", fakeStorage({ [THEME_KEY]: "light" }));
    expect(readStoredTheme()).toBe("light");
  });

  it("ignores values that are not a theme", () => {
    vi.stubGlobal("localStorage", fakeStorage({ [THEME_KEY]: "sepia" }));
    expect(readStoredTheme()).toBeNull();
  });

  it("survives storage that throws, as in a private window", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(readStoredTheme()).toBeNull();
    expect(() => storeTheme("dark")).not.toThrow();
  });

  it("stores under the design's key", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    storeTheme("light");
    expect(storage.data.get(THEME_KEY)).toBe("light");
  });
});
