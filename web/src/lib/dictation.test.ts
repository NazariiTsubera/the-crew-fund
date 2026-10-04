import { describe, expect, it } from "vitest";

import { appendDictation, transcriptOf } from "@/lib/dictation";

describe("appendDictation", () => {
  it("returns the spoken text when the box is empty", () => {
    expect(appendDictation("", "how are you doing")).toBe("how are you doing");
  });

  it("joins typed and spoken text with one space", () => {
    expect(appendDictation("Hi there", "how are you")).toBe("Hi there how are you");
    expect(appendDictation("Hi there  ", "  how are you")).toBe("Hi there how are you");
  });

  it("keeps a typed newline instead of adding a space after it", () => {
    expect(appendDictation("First line\n", "second")).toBe("First line\nsecond");
  });

  it("leaves the box alone when nothing was heard", () => {
    expect(appendDictation("Hi", "   ")).toBe("Hi");
  });
});

describe("transcriptOf", () => {
  it("joins the best alternative of every result", () => {
    expect(transcriptOf([[{ transcript: "what happened" }], [{ transcript: " in 2022" }]])).toBe(
      "what happened in 2022",
    );
  });

  it("skips results without alternatives", () => {
    expect(transcriptOf([[], [{ transcript: "hello" }]])).toBe("hello");
  });
});
