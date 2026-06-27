import { Outlet, useLocation } from "react-router-dom";
import { useRef } from "react";
import { Header } from "./Header";
import { NoteList } from "./NoteList";
import { useNotes } from "@/hooks/useNotes";
import { toast } from "sonner";

export function ResponsiveLayout() {
  const { pathname } = useLocation();
  const isNoteRoute = pathname.startsWith("/note/");
  const keepInputRef = useRef<HTMLInputElement>(null);
  const { searchQuery, setSearchQuery, importGoogleKeep, isImportingKeep } = useNotes();

  const handleImportKeepClick = () => keepInputRef.current?.click();

  const handleKeepFilesChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const list = e.target.files;
    e.target.value = "";
    if (!list?.length) return;
    try {
      const files = await Promise.all(Array.from(list).map(async (f) => ({ raw: await f.text() })));
      const result = await importGoogleKeep(files);
      toast.success(
        `Import complete: added ${result.importedCount}, skipped ${result.skippedCount}`,
      );
    } catch {
      toast.error("Google Keep import failed");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <input
        ref={keepInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        aria-hidden
        onChange={handleKeepFilesChange}
      />
      <Header
        onImportKeep={handleImportKeepClick}
        isImportingKeep={isImportingKeep}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <main className="flex-1 flex overflow-hidden">
        {/* Note list: hidden when a note is selected (dialog takes full screen) */}
        {!isNoteRoute && (
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
