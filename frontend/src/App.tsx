import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
// 路由级代码分割：编辑器（TipTap）/分享/全局页只在进入对应路由时才下载
const NoteEditor = lazy(() => import("@/components/NoteEditor").then((m) => ({ default: m.NoteEditor })));
const PublicShare = lazy(() => import("./pages/PublicShare"));
const GlobalAccess = lazy(() => import("./pages/GlobalAccess"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
          <Suspense fallback={null}>
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
          </Suspense>
        </BrowserRouter>
      </NotesProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
