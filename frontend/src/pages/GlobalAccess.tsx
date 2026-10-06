import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Key,
  Search,
  Download,
  FolderArchive,
  FileText,
  File,
  Copy,
  Check,
  RefreshCw,
  Folder,
  ArrowLeft,
  Loader2,
  HardDriveDownload,
  Tag,
  Clock,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { toast } from "sonner";

export default function GlobalAccess() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialToken = searchParams.get("token") || api.getSavedGlobalToken() || "";

  const [token, setToken] = useState(initialToken);
  const [tokenDraft, setTokenDraft] = useState(initialToken);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<api.GlobalNotesResponse | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchGlobalData = async (currentToken: string, query: string) => {
    if (!currentToken.trim()) return;
    setLoading(true);
    try {
      const res = await api.searchGlobalNotes(currentToken, query);
      setData(res);
      api.setSavedGlobalToken(currentToken.trim());
    } catch (e: any) {
      toast.error(e?.message || "鉴权失败或未能检索到数据，请检查全局 Token");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchGlobalData(token, searchQuery);
    }
  }, [token]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("请先输入全局访问令牌");
      return;
    }
    fetchGlobalData(token, searchQuery);
  };

  const handleApplyToken = () => {
    const next = tokenDraft.trim();
    if (!next) {
      toast.error("请输入有效的全局令牌");
      return;
    }
    setToken(next);
    setSearchParams((prev) => {
      prev.set("token", next);
      return prev;
    });
  };

  const handleCopy = async (id: string, text: string, msg: string = "已复制") => {
    try {
      await copyText(text);
      setCopiedId(id);
      toast.success(msg);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const totalFiles = useMemo(() => {
    if (!data?.notes) return 0;
    return data.notes.reduce((acc, n) => acc + (n.files?.length || 0), 0);
  }, [data]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 glass-effect border-b border-border/40 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-xl">
            <Link to="/" title="返回主页">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">全库全局检索与下载中心</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">使用 Master Token 跨用户检索、浏览与打包导出</p>
            </div>
          </div>
        </div>

        {token && (
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              className="gap-2 shadow-sm"
              asChild
            >
              <a href={api.getGlobalExportAllUrl(token)} download>
                <HardDriveDownload className="w-4 h-4" />
                <span className="hidden sm:inline">一键打包全库 (ZIP)</span>
                <span className="sm:hidden">打包全库</span>
              </a>
            </Button>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 container mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Token Card */}
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">全局访问令牌 (Global Token)</span>
                {token && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium">
                    已鉴权
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                可通过查询参数 <code className="bg-muted px-1 py-0.5 rounded font-mono">?token=...</code> 或在此处输入全局令牌以访问。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="输入全局主令牌..."
                className="w-full sm:w-64 font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyToken}
                disabled={loading || tokenDraft.trim() === token}
              >
                应用
              </Button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        {token && (
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="全局搜索笔记内容、文件名、文件夹路径、标签..."
                className="pl-10 h-11 text-sm bg-card/80"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-11 px-5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "检索"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fetchGlobalData(token, searchQuery)}
              disabled={loading}
              className="h-11 px-3"
              title="刷新"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </form>
        )}

        {/* Stats Summary */}
        {data && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <div className="flex items-center gap-4">
              <span>检索结果：<strong className="text-foreground">{data.notes.length}</strong> 篇笔记</span>
              <span>关联文件：<strong className="text-foreground">{totalFiles}</strong> 个文件</span>
            </div>
            {data.notes.length > 0 && (
              <a
                href={api.getGlobalExportAllUrl(token)}
                download
                className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
              >
                <FolderArchive className="w-3.5 h-3.5" />
                下载全部笔记与文件 (ZIP)
              </a>
            )}
          </div>
        )}

        {/* Notes List */}
        {loading && !data && (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">正在检索全库笔记与目录文件...</p>
          </div>
        )}

        {!loading && token && data && data.notes.length === 0 && (
          <div className="py-20 text-center rounded-2xl border border-dashed border-border/80 p-8">
            <p className="text-sm text-muted-foreground">未检索到匹配的笔记或文件</p>
          </div>
        )}

        {data && data.notes.length > 0 && (
          <div className="space-y-4">
            {data.notes.map((note) => (
              <div
                key={note.id}
                className="rounded-2xl border border-border/70 bg-card p-5 space-y-4 shadow-sm transition-all hover:shadow-md"
              >
                {/* Note Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                        ID: {note.id.slice(0, 8)}
                      </span>
                      {note.author && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="w-3.5 h-3.5" />
                          {note.author}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(note.updatedAt || note.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {note.tags && note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {note.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                          >
                            <Tag className="w-3 h-3 text-muted-foreground" />
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Note Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      asChild
                    >
                      <a href={api.getGlobalNoteZipUrl(note.id, token)} download>
                        <FolderArchive className="w-3.5 h-3.5 text-primary" />
                        导出笔记 ZIP
                      </a>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      asChild
                    >
                      <a href={api.getGlobalNoteMarkdownUrl(note.id, token)} download>
                        <FileText className="w-3.5 h-3.5" />
                        下载 Markdown
                      </a>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleCopy(`content-${note.id}`, note.content, "笔记内容已复制")}
                    >
                      {copiedId === `content-${note.id}` ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      复制内容
                    </Button>
                  </div>
                </div>

                {/* Content preview */}
                {note.content && (
                  <div className="bg-muted/30 rounded-xl p-3.5 border border-border/40 max-h-48 overflow-y-auto font-mono text-xs whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
                    {note.content}
                  </div>
                )}

                {/* Directories & Files Section */}
                {note.files && note.files.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 text-primary" />
                        <span>附带文件与目录结构 ({note.files.length})</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {note.files.map((file) => {
                        const fileDownloadUrl = api.getGlobalFileDownloadUrl(note.id, file.id, token);
                        return (
                          <div
                            key={file.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border/50 bg-background hover:bg-muted/40 transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <File className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate" title={file.filename}>
                                  {file.filename}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate" title={file.path}>
                                  {file.path ? file.path : "根目录"} • {formatFileSize(file.size)}
                                </p>
                              </div>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                              asChild
                            >
                              <a href={fileDownloadUrl} download={file.filename} title="下载此文件">
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
