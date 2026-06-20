import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useNotes } from "./useNotes";

function TestComponent() {
  const { notes, pagination, page, setPage } = useNotes();
  return (
    <div>
      <div data-testid="count">{notes.length}</div>
      <div data-testid="page">{page}</div>
      <div data-testid="total">{pagination?.total ?? 0}</div>
      <button data-testid="next" onClick={() => setPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeNote(id: number) {
  return {
    id: String(id),
    content: `Note ${id}`,
    title: null,
    color: "white",
    tags: [],
    pinned: false,
    position: id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("useNotes pagination", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("keeps the previous page data while loading a new page", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const page1Body = {
        notes: Array.from({ length: 50 }, (_, i) => makeNote(i + 1)),
        pagination: { page: 1, pageSize: 50, total: 120, totalPages: 3 },
      };
      const page2Body = {
        notes: Array.from({ length: 50 }, (_, i) => makeNote(i + 51)),
        pagination: { page: 2, pageSize: 50, total: 120, totalPages: 3 },
      };

      const body = url.includes("page=1") ? page1Body : page2Body;
      const jsonString = JSON.stringify(body);

      if (!url.includes("page=1")) {
        // Delay page 2 to simulate network
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => jsonString,
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TestComponent />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("50"));
    expect(screen.getByTestId("total").textContent).toBe("120");

    act(() => {
      screen.getByTestId("next").click();
    });

    // Immediately after switching pages we should still see the previous notes
    // (placeholderData) instead of an empty list.
    expect(screen.getByTestId("page").textContent).toBe("2");
    expect(screen.getByTestId("count").textContent).toBe("50");

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("50"));
  });
});
