import { useState, useEffect } from "react";
import { Bot, Terminal, Copy, Check, ExternalLink, ChevronDown, ChevronUp, Sparkles, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface AgentGuideBannerProps {
  onOpenDetails: () => void;
}

export function AgentGuideBanner({ onOpenDetails }: AgentGuideBannerProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("zenotes_agent_guide_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const local = api.getSavedGlobalToken();
    if (local) setToken(local);
    api.fetchGlobalToken()
      .then((res) => {
        if (res.globalToken) {
          setToken(res.globalToken);
          api.setSavedGlobalToken(res.globalToken);
        }
      })
      .catch(() => {
        if (!local) setToken("zenotes_master_sec_token");
      });
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("zenotes_agent_guide_collapsed", String(next));
    } catch {}
  };

  const activeToken = token || "zenotes_master_sec_token";
  const apiHost = "https://api.zenotes.site";
  const curlExample = `curl -s -H "X-Global-Token: ${activeToken}" "${apiHost}/api/global/notes?q="`;

  const agentPrompt = `Zenotes Note Access API:
Base: ${apiHost}/api/global
Auth Header: X-Global-Token: ${activeToken}
Search: GET ${apiHost}/api/global/notes?q={keyword}&token=${activeToken}
Get Markdown: GET ${apiHost}/api/global/notes/{id}/markdown?token=${activeToken}`;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopied(true);
      toast.success("AI 智能体提示词已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-accent/5 p-4 shadow-sm transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground truncate">
                AI Agent 访问指南
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary font-mono shrink-0">
                Agent Guide
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              智能体可通过 Master Token 直接免密检索和读取全库笔记与文件
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenDetails}
            className="h-8 text-xs gap-1.5 hidden sm:inline-flex border-primary/30 hover:bg-primary/10 hover:text-primary"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>接入指引与文档</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={collapsed ? "展开指南" : "收起指南"}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3.5 pt-3 border-t border-border/50 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {/* Left box: Quick Curl */}
            <div className="rounded-xl bg-background/80 border border-border/60 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="font-medium flex items-center gap-1 text-[11px]">
                  <Terminal className="w-3 h-3 text-primary" />
                  智能体 HTTP 检索命令
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(curlExample);
                    toast.success("cURL 命令已复制");
                  }}
                  className="hover:text-foreground inline-flex items-center gap-1 text-[11px]"
                >
                  <Copy className="w-3 h-3" />
                  复制
                </button>
              </div>
              <pre className="font-mono text-[11px] bg-muted/50 p-2 rounded-lg overflow-x-auto text-foreground/90 select-all">
                {curlExample}
              </pre>
            </div>

            {/* Right box: Quick Prompt */}
            <div className="rounded-xl bg-background/80 border border-border/60 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="font-medium flex items-center gap-1 text-[11px]">
                  <Sparkles className="w-3 h-3 text-primary" />
                  Agent System Prompt
                </span>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="hover:text-foreground inline-flex items-center gap-1 text-[11px]"
                >
                  {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? "已复制" : "复制"}
                </button>
              </div>
              <pre className="font-mono text-[11px] bg-muted/50 p-2 rounded-lg overflow-x-auto text-foreground/90 whitespace-pre-wrap select-all max-h-16">
                {agentPrompt}
              </pre>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>全局 Master Token：<code className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{activeToken}</code></span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenDetails}
                className="h-7 text-xs sm:hidden gap-1 text-primary"
              >
                <BookOpen className="w-3.5 h-3.5" />
                查看完整指南
              </Button>
              <Button variant="link" size="sm" asChild className="h-7 p-0 text-xs text-primary gap-1">
                <Link to={`/global?token=${encodeURIComponent(activeToken)}`}>
                  <span>前往免密检索面板 (/global)</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
