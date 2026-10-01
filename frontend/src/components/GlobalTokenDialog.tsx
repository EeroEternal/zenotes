import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Key, Copy, Check, ExternalLink, Download, Terminal } from "lucide-react";
import * as api from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface GlobalTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalTokenDialog({ open, onOpenChange }: GlobalTokenDialogProps) {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [editedToken, setEditedToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.fetchGlobalToken()
      .then((res) => {
        if (res.globalToken) {
          setToken(res.globalToken);
          setEditedToken(res.globalToken);
          api.setSavedGlobalToken(res.globalToken);
        }
      })
      .catch(() => {
        const local = api.getSavedGlobalToken();
        if (local) {
          setToken(local);
          setEditedToken(local);
        }
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleCopyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success("全局令牌已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const handleSaveToken = async () => {
    const next = editedToken.trim();
    if (!next || next.length < 4) {
      toast.error("令牌长度至少需 4 个字符");
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateGlobalToken(next);
      setToken(res.globalToken);
      api.setSavedGlobalToken(res.globalToken);
      toast.success("全局令牌已更新");
    } catch (e: any) {
      toast.error(e?.message || "更新全局令牌失败");
    } finally {
      setSaving(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const curlExample = `curl -OJ "${origin}/api/global/export-all.zip?token=${token || "YOUR_TOKEN"}"`;

  const handleCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlExample);
      setCopiedCurl(true);
      toast.success("打包下载命令已复制");
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const handleOpenGlobalPanel = () => {
    if (token) {
      api.setSavedGlobalToken(token);
    }
    onOpenChange(false);
    navigate("/global");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">全局主令牌 (Master Global Token)</DialogTitle>
              <DialogDescription className="text-sm mt-0.5">
                持有此令牌可全局检索并下载全库所有笔记、文件及文件夹目录。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-3">
          {/* Token input & actions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>全局授权令牌</span>
              <button
                type="button"
                onClick={handleCopyToken}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "已复制" : "复制令牌"}
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                value={editedToken}
                onChange={(e) => setEditedToken(e.target.value)}
                placeholder="设置全局访问令牌..."
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                disabled={saving || loading || editedToken === token}
                onClick={handleSaveToken}
              >
                {saving ? "保存中..." : "保存修改"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              支持在 HTTP 请求头中传入 <code className="font-mono bg-muted px-1 py-0.5 rounded">X-Global-Token</code> 或 URL 查询参数 <code className="font-mono bg-muted px-1 py-0.5 rounded">?token=</code>。
            </p>
          </div>

          {/* Quick shortcuts */}
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="default"
              className="w-full flex items-center justify-center gap-2"
              onClick={handleOpenGlobalPanel}
            >
              <ExternalLink className="w-4 h-4" />
              <span>进入全局检索面板</span>
            </Button>

            <Button
              variant="secondary"
              className="w-full flex items-center justify-center gap-2"
              asChild
            >
              <a
                href={token ? api.getGlobalExportAllUrl(token) : "#"}
                download
                onClick={(e) => {
                  if (!token) {
                    e.preventDefault();
                    toast.error("请先设置有效的全局令牌");
                  }
                }}
              >
                <Download className="w-4 h-4" />
                <span>全库打包 ZIP</span>
              </a>
            </Button>
          </div>

          {/* Curl snippet */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Terminal className="w-3.5 h-3.5 text-primary" />
                <span>一键全站打包下载 (cURL)</span>
              </div>
              <button
                type="button"
                onClick={handleCopyCurl}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
              >
                {copiedCurl ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCurl ? "已复制" : "复制命令"}
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-background/80 p-2 rounded-lg border border-border/40 overflow-x-auto text-muted-foreground select-all">
              {curlExample}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
