import { z } from "zod";

import { API_URL, ApiError } from "@/lib/api";

export type LoadError = {
  kind: "unseeded" | "offline" | "invalid" | "error";
  title: string;
  detail: string;
};

/** What a page says when its data does not arrive, instead of crashing or spinning. */
export function describeLoadError(error: unknown): LoadError {
  if (error instanceof ApiError) {
    // GET /vault answers 404 until the seed workflow has written the fund to the store.
    if (error.status === 404) {
      return {
        kind: "unseeded",
        title: "The fund has not been seeded yet",
        detail: "The API is up but the store holds no fund. Seed the crew, then reload this page.",
      };
    }
    return { kind: "error", title: "The API returned an error", detail: error.message };
  }
  if (error instanceof z.ZodError) {
    return {
      kind: "invalid",
      title: "Unexpected response",
      detail: "The API answered with data that does not match the War Room's contract.",
    };
  }
  // fetch rejects with a TypeError when nothing answers (server down, DNS, CORS).
  return { kind: "offline", title: "API offline", detail: `Could not reach ${API_URL}.` };
}
