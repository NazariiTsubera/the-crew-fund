import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { describeLoadError } from "@/lib/load-error";

describe("describeLoadError", () => {
  it("reads a 404 as an unseeded fund", () => {
    expect(describeLoadError(new ApiError(404, "404 fund not seeded"))).toMatchObject({
      kind: "unseeded",
      title: "The fund has not been seeded yet",
    });
  });

  it("reads a failed fetch as the API being offline", () => {
    expect(describeLoadError(new TypeError("Failed to fetch"))).toMatchObject({
      kind: "offline",
      title: "API offline",
    });
  });

  it("reports other HTTP errors with their message", () => {
    expect(describeLoadError(new ApiError(500, "500 Internal Server Error"))).toMatchObject({
      kind: "error",
      detail: "500 Internal Server Error",
    });
  });

  it("calls out a response that does not match the contract", () => {
    const result = z.object({ a: z.string() }).safeParse({ a: 1 });
    expect(describeLoadError(result.error)).toMatchObject({ kind: "invalid" });
  });
});
