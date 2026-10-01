import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Terminal, Copy, Check, Key, ExternalLink, FileText, Code, Sparkles, Download } from "lucide-react";
import * as api from "@/lib/api";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface AgentGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentGuideDialog({ open, onOpenChange }: AgentGuideDialogProps) {
  const [token, setToken] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const activeToken = token || "zenotes_master_sec_token";
  const apiHost = "https://api.zenotes.site";

  const handleCopy = async (key: string, text: string, msg: string = "已复制到剪贴板") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(msg);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const agentPromptSnippet = `### Zenotes Agent Note Access Tool / Integration
You have programmatic access to the user's Zenotes notes and files via REST API.
API Base: ${apiHost}/api/global
Auth Header: X-Global-Token: ${activeToken}
(or URL param: ?token=${activeToken})

Available Operations:
1. Search notes: GET ${apiHost}/api/global/notes?q={query}&token=${activeToken}
   Returns JSON list with note content, id, tags, timestamp, and files.
2. Get raw Markdown of a note: GET ${apiHost}/api/global/notes/{noteId}/markdown?token=${activeToken}
3. Download a note file: GET ${apiHost}/api/global/notes/{noteId}/files/{fileId}?token=${activeToken}
4. Export all notes & files as ZIP: GET ${apiHost}/api/global/export-all.zip?token=${activeToken}

Always search notes first when user asks about previous memos, project ideas, or knowledge base.`;

  const pythonSnippet = `import requests

API_HOST = "${apiHost}"
TOKEN = "${activeToken}"
HEADERS = {"X-Global-Token": TOKEN}

def search_notes(query=""):
    """搜索笔记正文与文件"""
    url = f"{API_HOST}/api/global/notes"
    params = {"q": query} if query else {}
    res = requests.get(url, headers=HEADERS, params=params)
    res.raise_for_status()
    data = res.json()
    print(f"找到 {data['total']} 篇笔记:")
    for note in data["notes"]:
        print(f"- [{note['id'][:8]}] {note['content'][:60]}... (文件数: {len(note['files'])})")
    return data["notes"]

def get_note_markdown(note_id):
    """获取单篇笔记干净 Markdown"""
    url = f"{API_HOST}/api/global/notes/{note_id}/markdown"
    res = requests.get(url, headers=HEADERS)
    return res.text

# 检索测试
notes = search_notes()
`;

  const curlSnippet = `# 1. 全局检索包含关键词的笔记与文件
curl -s -H "X-Global-Token: ${activeToken}" \\
  "${apiHost}/api/global/notes?q=keyword"

# 2. 读取单篇笔记纯 Markdown
curl -s -H "X-Global-Token: ${activeToken}" \\
  "${apiHost}/api/global/notes/<NOTE_ID>/markdown"

# 3. 下载单个文件
curl -OJ "${apiHost}/api/global/notes/<NOTE_ID>/files/<FILE_ID>?token=${activeToken}"

# 4. 一键打包全库所有笔记与目录为 ZIP
curl -OJ "${apiHost}/api/global/export-all.zip?token=${activeToken}"`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                <span>AI Agent 接入与笔记读取指引</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary font-normal">
                  Agent Guide
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm mt-0.5">
                指导 AI Agent（如 Claude、GPT、Antigravity、Cursor 等）免登检索与读取笔记正文及文件。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Current token banner */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/60 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Key className="w-4 h-4 text-primary shrink-0" />
            <span className="text-muted-foreground">当前 Master Token:</span>
            <code className="font-mono bg-background px-2 py-0.5 rounded border border-border/40 font-medium truncate">
              {activeToken}
            </code>
          </div>
          <button
            type="button"
            onClick={() => handleCopy("token", activeToken, "Master Token 已复制")}
            className="text-primary hover:underline font-medium inline-flex items-center gap-1 shrink-0 ml-2"
          >
            {copiedKey === "token" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedKey === "token" ? "已复制" : "复制"}
          </button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="prompt" className="space-y-4 pt-1">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="prompt" className="gap-1.5 text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>智能体提示词 (Prompt)</span>
            </TabsTrigger>
            <TabsTrigger value="curl" className="gap-1.5 text-xs">
              <Terminal className="w-3.5 h-3.5" />
              <span>cURL 指令</span>
            </TabsTrigger>
            <TabsTrigger value="python" className="gap-1.5 text-xs">
              <Code className="w-3.5 h-3.5" />
              <span>Python 脚本</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Agent Prompt */}
          <TabsContent value="prompt" className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>可直接粘贴至 AI Agent 的系统提示词 (System Prompt)：</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleCopy("prompt", agentPromptSnippet, "Agent Prompt 已复制")}
              >
                {copiedKey === "prompt" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === "prompt" ? "已复制" : "一键复制 Prompt"}
              </Button>
            </div>
            <pre className="text-xs font-mono bg-muted/60 p-3.5 rounded-xl border border-border/60 overflow-x-auto whitespace-pre-wrap leading-relaxed text-foreground/90 select-all max-h-64 overflow-y-auto">
              {agentPromptSnippet}
            </pre>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              💡 <strong>提示</strong>：智能体收到此指令后，即可在用户询问个人笔记、灵感记录或检索相关资料时，通过上述 HTTP 接口自主检索并回答。
            </p>
          </TabsContent>

          {/* Tab 2: cURL */}
          <TabsContent value="curl" className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>命令行调用接口与测试：</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleCopy("curl", curlSnippet, "cURL 命令已复制")}
              >
                {copiedKey === "curl" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === "curl" ? "已复制" : "复制命令"}
              </Button>
            </div>
            <pre className="text-xs font-mono bg-muted/60 p-3.5 rounded-xl border border-border/60 overflow-x-auto whitespace-pre-wrap leading-relaxed text-foreground/90 select-all max-h-64 overflow-y-auto">
              {curlSnippet}
            </pre>
          </TabsContent>

          {/* Tab 3: Python */}
          <TabsContent value="python" className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Python 快速集成示例：</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleCopy("python", pythonSnippet, "Python 代码已复制")}
              >
                {copiedKey === "python" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === "python" ? "已复制" : "复制代码"}
              </Button>
            </div>
            <pre className="text-xs font-mono bg-muted/60 p-3.5 rounded-xl border border-border/60 overflow-x-auto whitespace-pre-wrap leading-relaxed text-foreground/90 select-all max-h-64 overflow-y-auto">
              {pythonSnippet}
            </pre>
          </TabsContent>
        </Tabs>

        {/* Footer shortcuts */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs">
          <span className="text-muted-foreground">
            还可在全局控制台免登浏览：
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs">
              <Link to={`/global?token=${encodeURIComponent(activeToken)}`} onClick={() => onOpenChange(false)}>
                <ExternalLink className="w-3.5 h-3.5" />
                打开全库控制台 (/global)
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild className="h-8 gap-1.5 text-xs">
              <a href={`${apiHost}/api/global/export-all.zip?token=${encodeURIComponent(activeToken)}`} download>
                <Download className="w-3.5 h-3.5" />
                全库打包下载
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
