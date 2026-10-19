import { describe, it, expect } from "vitest";
import { cardBodyMaxHeightClass } from "@/components/NoteCardContent";

describe("card body max height", () => {
  it("keeps short notes tall and clamps long notes", () => {
    expect(cardBodyMaxHeightClass("短笔记")).toBe("max-h-[22rem]");
    expect(cardBodyMaxHeightClass("中".repeat(300))).toBe("max-h-[16rem]");
    expect(cardBodyMaxHeightClass("长".repeat(2000))).toBe("max-h-[12rem]");
  });
});
