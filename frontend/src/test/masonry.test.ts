import { describe, it, expect } from "vitest";
import { placeItems } from "@/lib/masonry";

describe("masonry placement", () => {
  it("fills the shortest column first (row-major order)", () => {
    const placed = placeItems([100, 300, 100, 100], 2);
    expect(placed[0]).toEqual({ column: 0, top: 0 });
    expect(placed[1]).toEqual({ column: 1, top: 0 });
    expect(placed[2]).toEqual({ column: 0, top: 116 }); // 100 + 16 间距
    expect(placed[3]).toEqual({ column: 0, top: 232 });
  });

  it("keeps a single column when narrow", () => {
    const placed = placeItems([50, 80], 1);
    expect(placed.map((p) => p.column)).toEqual([0, 0]);
    expect(placed[1].top).toBe(66);
  });
});
