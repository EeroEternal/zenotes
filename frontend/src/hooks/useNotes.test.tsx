import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useNotes } from "./useNotes";
import { db } from "@/offline/db";

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
    syncStatus: "synced" as const,
    isDeleted: false,
  };
}

describe("useNotes local-first pagination", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await db.notes.clear();
  });

  it("paginates local notes and updates page on request", async () => {
    // Seed 120 local notes
    await db.notes.bulkAdd(Array.from({ length: 120 }, (_, i) => makeNote(i + 1)));

    render(<TestComponent />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("50"));
    expect(screen.getByTestId("total").textContent).toBe("120");
    expect(screen.getByTestId("page").textContent).toBe("1");

    act(() => {
      screen.getByTestId("next").click();
    });

    await waitFor(() => expect(screen.getByTestId("page").textContent).toBe("2"));
    expect(screen.getByTestId("count").textContent).toBe("50");
  });
});
