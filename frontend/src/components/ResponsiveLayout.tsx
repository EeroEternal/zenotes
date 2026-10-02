import { Outlet, useLocation } from "react-router-dom";
import { useRef } from "react";
import { Header } from "./Header";
import { NoteList } from "./NoteList";
import { AgentPublicHome } from "./AgentPublicHome";
import { useNotes } from "@/hooks/useNotes";
import { toast } from "sonner";

export function ResponsiveLayout() {
  const { pathname } = useLocation();
  const isNoteRoute = pathname.startsWith("/note/");
  const { searchQuery, setSearchQuery, exportAllToDirectory, isExporting, isAuthenticated } = useNotes();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        onExportDirectory={exportAllToDirectory}
        isExportingDirectory={isExporting}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <main className="flex-1 flex overflow-hidden">
        {/* Unauthenticated: show AI Agent Guide on zenotes.site */}
        {!isNoteRoute && !isAuthenticated && (
          <div className="w-full h-full overflow-auto">
            <AgentPublicHome onSignInClick={() => window.dispatchEvent(new CustomEvent("open-auth-modal"))} />
          </div>
        )}
        {/* Authenticated note workspace: clean note list without agent guide */}
        {!isNoteRoute && isAuthenticated && (
          <div className="w-full h-full overflow-auto">
            <NoteList />
          </div>
        )}
        {/* Note editor dialog: full-screen when a note is selected */}
        {isNoteRoute && (
          <div className="w-full h-full overflow-auto bg-muted/30">
            <Outlet />
          </div>
        )}
      </main>
    </div>
  );
}
