import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../../../design/tokens.json";
import { color, px, radius, space, type } from "../src/theme/tokens";

describe("theme from design/tokens.json", () => {
  it("has every colour, resolving references", () => {
    expect(Object.keys(color)).toEqual(raw.color.tokens.map((t) => t.name));
    expect(color.canvas).toBe("#f6f5f0");
    expect(color.focus).toBe(color.primary);
  });

  it("turns px into numbers", () => {
    expect(px("16px")).toBe(16);
    expect(() => px("1rem")).toThrow();
    expect(space["space-4"]).toBe(16);
    expect(radius["radius-pill"]).toBe(9999);
  });

  it("gives every type style a font file for its family and weight", () => {
    expect(type.display).toEqual({ fontFamily: "Inter_700Bold", fontSize: 28, lineHeight: 34, letterSpacing: -0.56 });
    expect(type["num-lg"].fontFamily).toBe("IBMPlexSans_600SemiBold");
    expect(type.body.fontFamily).toBe("Inter_400Regular");
    expect(Object.keys(type)).toHaveLength(10);
  });
});

describe("no raw values outside src/theme (DESIGN.md: tokens, never raw values)", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
    });
  const src = new URL("../src", import.meta.url).pathname;
  const sources = files(src).filter((f) => !f.includes("/theme/"));

  it("finds the sources", () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it("uses no hex colours", () => {
    const hits = sources.filter((f) => /#[0-9a-f]{3,8}\b/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("uses no literal sizes for spacing, type, radius or dimensions in components", () => {
    const re = /\b(fontSize|lineHeight|letterSpacing|margin\w*|padding\w*|gap|rowGap|columnGap|border\w*Radius|width|height|min\w*|max\w*|top|left|right|bottom)\s*:\s*-?[1-9]/;
    const hits = sources.filter((f) => f.endsWith(".tsx")).flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => re.test(l)).map((l) => `${f}: ${l.trim()}`));
    expect(hits).toEqual([]);
  });
});
