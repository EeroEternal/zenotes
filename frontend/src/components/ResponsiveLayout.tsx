import { Outlet, useLocation } from "react-router-dom";
import { useRef, useState } from "react";
import { Header } from "./Header";
import { NoteList } from "./NoteList";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNotes } from "@/hooks/useNotes";
import { toast } from "sonner";

function SelectNotePlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="text-center">
        <p className="text-lg font-medium">Select a note</p>
        <p className="text-sm">Choose a note from the list to view or edit</p>
      </div>
    </div>
  );
}

export function ResponsiveLayout() {
  const isTablet = useMediaQuery("(min-width: 768px)");
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
        {/* Sidebar: shown on mobile when no note selected, always on desktop */}
        {(!isNoteRoute || isTablet) && (
          <div
            className={`${
              isTablet && !isNoteRoute
                ? "w-full"
                : isTablet
                  ? "w-80 lg:w-96 border-r border-border/50"
                  : "w-full"
            } h-full overflow-auto`}
          >
            <NoteList />
          </div>
        )}
        {/* Right panel: only shown when a note is selected (all screen sizes) */}
        {isNoteRoute && (
          <div className="flex-1 h-full overflow-auto bg-muted/30">
            <Outlet />
          </div>
        )}
      </main>
    </div>
  );
}
