import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import { NoteEditor } from "@/components/NoteEditor";
import PublicShare from "./pages/PublicShare";
import GlobalAccess from "./pages/GlobalAccess";
import NotFound from "./pages/NotFound";

import { NotesProvider } from "@/hooks/useNotes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <NotesProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ResponsiveLayout />}>
              <Route path="note/:id" element={<NoteEditor />} />
            </Route>
            <Route path="/share/:shareId" element={<PublicShare />} />
            <Route path="/s/:shareId" element={<PublicShare />} />
            <Route path="/global" element={<GlobalAccess />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </NotesProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
