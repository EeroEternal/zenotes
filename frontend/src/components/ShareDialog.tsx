import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Share2, Copy, Check, ExternalLink, Download, FileText, Loader2 } from "lucide-react";
import { Note, NoteShare } from "@/types/note";
import * as api from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { toast } from "sonner";

interface ShareDialogProps {
  note: Note | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShareChange?: (share: NoteShare | null) => void;
}

export function ShareDialog({ note, open, onOpenChange, onShareChange }: ShareDialogProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [share, setShare] = useState<NoteShare | null>(note?.share ?? null);

  useEffect(() => {
    if (!open || !note) return;
    setLoading(true);
    api.fetchNoteShare(note.id)
      .then((s) => {
        setShare(s);
        onShareChange?.(s);
      })
      .catch(() => {
        setShare(note.share ?? null);
      })
      .finally(() => setLoading(false));
  }, [open, note?.id]);

  if (!note) return null;

  const publicUrl = share?.shareId
    ? `${window.location.origin}/share/${share.shareId}`
    : "";

  const handleToggle = async (enabled: boolean) => {
    setLoading(true);
    try {
      const nextShare = await api.toggleShareNote(note.id, enabled);
      setShare(nextShare);
      onShareChange?.(nextShare);
      toast.success(enabled ? "Public link enabled" : "Public link disabled");
    } catch {
      toast.error("Failed to update share settings");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!publicUrl) return;
    try {
      await copyText(publicUrl);
      setCopied(true);
      toast.success("Share link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const filesCount = note.files?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Share2 className="w-5 h-5 text-primary" />
            Share Note & Files
          </DialogTitle>
          <DialogDescription>
            Generate a public link so anyone can view this note and download attached files without logging in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-3">
          <div className="flex items-center justify-between rounded-xl border border-border/50 p-4 bg-muted/40">
            <div className="space-y-0.5">
              <Label htmlFor="public-toggle" className="text-sm font-semibold cursor-pointer">
                Public Sharing
              </Label>
              <p className="text-xs text-muted-foreground">
                {share?.isPublic
                  ? "Anyone with the link can view and download"
                  : "Private: only you can view this note"}
              </p>
            </div>
            <Switch
              id="public-toggle"
              checked={Boolean(share?.isPublic)}
              onCheckedChange={handleToggle}
              disabled={loading}
            />
          </div>

          {share?.isPublic && publicUrl ? (
            <div className="space-y-3 animate-in fade-in duration-200">
              <Label className="text-xs font-medium text-muted-foreground">
                Public Link
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-background border border-border/80 text-foreground font-mono focus:outline-none select-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="gap-1.5 shrink-0"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  asChild
                  className="shrink-0"
                >
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>

              <div className="rounded-xl border border-border/40 p-3 bg-muted/20 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Download className="w-3.5 h-3.5 text-primary" />
                  Downloadable contents:
                </div>
                <div>• Note text & markdown formatting</div>
                <div>• {filesCount > 0 ? `${filesCount} attached file(s) (supports single & batch ZIP download)` : "Embedded images"}</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Turn on public sharing above to generate a shareable link.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
