import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import JSZip from "jszip";
import {
  Download,
  Share2,
  FileText,
  File,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  Folder,
  Check,
  Copy,
  ExternalLink,
  NotebookPen,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import { NoteFile, NoteColor } from "@/types/note";
import { toast } from "sonner";

const colorClasses: Record<NoteColor, string> = {
  white: "bg-note-default",
  yellow: "bg-note-cream",
  green: "bg-note-mint",
  blue: "bg-note-sky",
  pink: "bg-note-rose",
  purple: "bg-note-lavender",
};

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
    return <ImageIcon className="w-4 h-4 text-blue-500" />;
  }
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) {
    return <FileArchive className="w-4 h-4 text-amber-500" />;
  }
  if (["js", "ts", "jsx", "tsx", "json", "py", "rs", "go", "html", "css", "c", "cpp"].includes(ext)) {
    return <FileCode className="w-4 h-4 text-emerald-500" />;
  }
  if (["md", "txt", "pdf", "doc", "docx"].includes(ext)) {
    return <FileText className="w-4 h-4 text-rose-500" />;
  }
  return <File className="w-4 h-4 text-muted-foreground" />;
}

export default function PublicShare() {
  const { shareId } = useParams<{ shareId: string }>();
  const [data, setData] = useState<api.PublicShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shareId) return;
    setLoading(true);
    api.fetchPublicShare(shareId)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Note not found or sharing has been disabled");
      })
      .finally(() => setLoading(false));
  }, [shareId]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleDownloadNoteMarkdown = () => {
    if (!data?.note) return;
    const filename = `${(data.note.title || "note").replace(/[^\w\s-]/gi, "_")}.md`;
    const blob = new Blob([data.note.content || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Markdown downloaded");
  };

  const handleDownloadAllZip = async () => {
    if (!data || downloadingZip) return;
    setDownloadingZip(true);
    try {
      const zip = new JSZip();
      const safeTitle = (data.note.title || "shared-note").replace(/[^\w\s-]/gi, "_");

      // Add note markdown
      zip.file(`${safeTitle}.md`, data.note.content || "");

      // Add attached files
      if (data.files && data.files.length > 0) {
        toast.info(`Preparing ${data.files.length} file(s) for download...`);
        for (const file of data.files) {
          const downloadUrl = api.getPublicFileDownloadUrl(shareId!, file.id);
          const res = await fetch(downloadUrl);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            const filePath = file.path ? file.path : file.filename;
            zip.file(filePath, buf);
          }
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeTitle}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("All files downloaded as ZIP");
    } catch (err) {
      toast.error("Failed to generate ZIP archive");
    } finally {
      setDownloadingZip(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-sm">Loading shared note...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border/80 rounded-3xl p-8 text-center shadow-lg space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Note Not Available</h2>
          <p className="text-sm text-muted-foreground">
            {error || "This note does not exist or public sharing has been turned off by the author."}
          </p>
          <Button asChild className="mt-2 rounded-xl">
            <Link to="/">Go to ZeNotes</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { note, files, author } = data;
  const formattedDate = note.updatedAt
    ? new Date(note.updatedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 glass-effect border-b border-border/40 px-6 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-sm group-hover:scale-105 transition-transform">
              <NotebookPen className="w-4 h-4" />
            </div>
            <span className="font-semibold text-lg tracking-tight">ZeNotes</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium ml-1">
              Public Share
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="gap-1.5 rounded-xl text-xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Link Copied" : "Copy Link"}
            </Button>
            <Button asChild size="sm" className="rounded-xl text-xs">
              <Link to="/">Open ZeNotes</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Note Card */}
        <div
          className={`
            ${colorClasses[note.color] || "bg-card"}
            rounded-3xl border border-border/60 p-6 sm:p-8 shadow-xl space-y-6 transition-all
          `}
        >
          {/* Header Info */}
          <div className="border-b border-border/20 pb-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Shared by <strong className="text-foreground">{author}</strong></span>
              {formattedDate && <span>{formattedDate}</span>}
            </div>

            {note.title && (
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight pt-1">
                {note.title}
              </h1>
            )}

            {note.tags && note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {note.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Note Markdown Content */}
          <div className="prose prose-sm sm:prose dark:prose-invert max-w-none text-foreground/90 leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {children}
                  </a>
                ),
                img: ({ src, alt }) => {
                  if (typeof src === "string") {
                    const m = /^(?:mynotes|zenotes):media:([0-9a-f-]{36})$/i.exec(src);
                    if (m && shareId) {
                      return (
                        <img
                          src={api.getPublicMediaUrl(shareId, m[1]!)}
                          alt={typeof alt === "string" ? alt : "image"}
                          className="max-w-full rounded-2xl shadow-sm my-3"
                          loading="lazy"
                        />
                      );
                    }
                  }
                  if (src) {
                    return <img src={src} alt={alt} className="max-w-full rounded-2xl my-3" loading="lazy" />;
                  }
                  return null;
                },
              }}
            >
              {note.content || ""}
            </ReactMarkdown>
          </div>

          {/* Files & Attachments Section */}
          {files && files.length > 0 && (
            <div className="border-t border-border/30 pt-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Folder className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-foreground text-base">
                    Attached Files ({files.length})
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadNoteMarkdown}
                    className="gap-1.5 rounded-xl text-xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Download Note (.md)
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleDownloadAllZip}
                    disabled={downloadingZip}
                    className="gap-1.5 rounded-xl text-xs shadow-sm"
                  >
                    {downloadingZip ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {downloadingZip ? "Packaging ZIP..." : "Download All (ZIP)"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-border/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-background border border-border/50 shrink-0">
                        {getFileIcon(file.filename)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate" title={file.filename}>
                          {file.filename}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {file.path ? `${file.path} • ` : ""}{formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      asChild
                      className="shrink-0 h-8 w-8 p-0 rounded-xl hover:bg-foreground/10"
                      title="Download file"
                    >
                      <a
                        href={api.getPublicFileDownloadUrl(shareId!, file.id)}
                        download={file.filename}
                      >
                        <Download className="w-4 h-4 text-foreground" />
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
