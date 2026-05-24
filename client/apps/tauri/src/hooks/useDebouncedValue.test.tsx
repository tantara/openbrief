import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

describe("useDebouncedValue", () => {
  it("keeps the previous value until the debounce delay completes", () => {
    vi.useFakeTimers();

    try {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 200),
        { initialProps: { value: "크" } },
      );

      expect(result.current).toBe("크");

      rerender({ value: "크ㅂ" });
      expect(result.current).toBe("크");

      act(() => {
        vi.advanceTimersByTime(199);
      });
      expect(result.current).toBe("크");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current).toBe("크ㅂ");
    } finally {
      vi.useRealTimers();
    }
  });
});
