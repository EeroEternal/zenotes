import { describe, it, expect } from "vitest";
import { useNetworkStatus } from "./network";
import { renderHook, act } from "@testing-library/react";

describe("useNetworkStatus", () => {
  it("returns online by default", () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it("reacts to offline/online events", () => {
    const { result } = renderHook(() => useNetworkStatus());
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.isOnline).toBe(false);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.isOnline).toBe(true);
  });
});
