import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Terminal,
  Code,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Shield,
  FileText,
  FolderArchive,
  Download,
  BookOpen,
  LogIn,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { copyText } from "@/lib/clipboard";
import { toast } from "sonner";

interface AgentPublicHomeProps {
  onSignInClick?: () => void;
}

export function AgentPublicHome({ onSignInClick }: AgentPublicHomeProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const apiHost = "https://api.zenotes.site";
  const tokenPlaceholder = "<YOUR_GLOBAL_TOKEN>";

  const handleCopy = async (key: string, text: string, msg: string = "已复制到剪贴板") => {
    try {
      await copyText(text);
      setCopiedKey(key);
      toast.success(msg);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const agentPromptSnippet = `### Zenotes Agent Note Access Integration
You have programmatic access to search, retrieve, and download user notes and files from Zenotes via HTTP REST API.

Base URL: ${apiHost}/api/global
Authentication: Provide your Global Token in one of the following ways:
- HTTP Header: X-Global-Token: ${tokenPlaceholder}
- HTTP Header: Authorization: Bearer ${tokenPlaceholder}
- URL Query Parameter: ?token=${tokenPlaceholder}

Available Endpoints:
1. Search notes & files:
   GET ${apiHost}/api/global/notes?q={query}&token=${tokenPlaceholder}
   Returns a JSON array of matching notes, including Markdown content, files, and directory paths.

2. Get raw Markdown text of a note:
   GET ${apiHost}/api/global/notes/{noteId}/markdown?token=${tokenPlaceholder}

3. Download a specific file attachment:
   GET ${apiHost}/api/global/notes/{noteId}/files/{fileId}?token=${tokenPlaceholder}

4. Export a note with its directory structure as a ZIP:
   GET ${apiHost}/api/global/notes/{noteId}/export.zip?token=${tokenPlaceholder}

5. Export the entire knowledge base as a ZIP:
   GET ${apiHost}/api/global/export-all.zip?token=${tokenPlaceholder}

Instructions:
When the user asks for their notes, memos, project documentation, or uploaded attachments, query the API using the provided token.`;

  const curlSnippet = `# 1. 全局检索笔记内容、文件名或目录
curl -s -H "X-Global-Token: ${tokenPlaceholder}" \\
  "${apiHost}/api/global/notes?q=keyword"

# 2. 读取单篇笔记纯 Markdown 正文
curl -s -H "X-Global-Token: ${tokenPlaceholder}" \\
  "${apiHost}/api/global/notes/<NOTE_ID>/markdown"

# 3. 下载单个附件文件
curl -OJ "${apiHost}/api/global/notes/<NOTE_ID>/files/<FILE_ID>?token=${tokenPlaceholder}"

# 4. 单篇笔记打包 ZIP 下载（含笔记 Markdown 及所有子目录附件）
curl -OJ "${apiHost}/api/global/notes/<NOTE_ID>/export.zip?token=${tokenPlaceholder}"

# 5. 全库所有笔记与目录结构一键打包下载为 ZIP
curl -OJ "${apiHost}/api/global/export-all.zip?token=${tokenPlaceholder}"`;

  const pythonSnippet = `import requests

API_HOST = "${apiHost}"
TOKEN = "${tokenPlaceholder}"  # 替换为您的全局访问令牌
HEADERS = {"X-Global-Token": TOKEN}

def search_notes(query=""):
    """搜索笔记正文、标签及文件"""
    url = f"{API_HOST}/api/global/notes"
    params = {"q": query, "token": TOKEN} if query else {"token": TOKEN}
    res = requests.get(url, headers=HEADERS, params=params)
    res.raise_for_status()
    data = res.json()
    print(f"找到 {data['total']} 篇笔记:")
    for note in data.get("notes", []):
        print(f"- ID: {note['id'][:8]} | 内容摘要: {note['content'][:50]}... | 包含文件: {len(note['files'])}")
    return data.get("notes", [])

def get_note_markdown(note_id):
    """获取单篇笔记干净的 Markdown 正文"""
    url = f"{API_HOST}/api/global/notes/{note_id}/markdown"
    res = requests.get(url, headers=HEADERS, params={"token": TOKEN})
    res.raise_for_status()
    return res.text

# 使用示例
if __name__ == "__main__":
    notes = search_notes()
`;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-8 animate-fade-in">
      {/* Hero Header */}
      <div className="text-center space-y-3.5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-medium">
          <Bot className="w-3.5 h-3.5" />
          <span>Zenotes AI Agent Guide</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight text-foreground">
          面向 AI 智能体的笔记与内容访问指南
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          外部 AI Agent（如 Claude、GPT、Antigravity、Cursor、Cline 等）及自动化程序无需登录 Cookie 会话，通过携带全局令牌即可快速检索与下载全库笔记正文、文件及多级目录结构。
        </p>

        {/* Quick entry buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button variant="default" asChild className="gap-2 shadow-sm">
            <Link to="/global">
              <ExternalLink className="w-4 h-4" />
              <span>进入免密检索控制台 (/global)</span>
            </Link>
          </Button>

          {onSignInClick && (
            <Button variant="outline" onClick={onSignInClick} className="gap-2">
              <LogIn className="w-4 h-4" />
              <span>人类用户登录 / 注册</span>
            </Button>
          )}

          <Button variant="ghost" asChild className="gap-2 text-muted-foreground">
            <a href="/llms.txt" target="_blank" rel="noreferrer">
              <FileText className="w-4 h-4" />
              <span>查看标准 llms.txt</span>
            </a>
          </Button>
        </div>
      </div>

      {/* Auth Protocol Card */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">全局令牌鉴权协议 (Authentication)</h2>
            <p className="text-xs text-muted-foreground">智能体发出的每次请求，请携带有效的全局访问令牌</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="rounded-xl bg-muted/40 border border-border/50 p-3 space-y-1">
            <span className="text-xs font-medium text-foreground">方式一：请求头 (Header)</span>
            <pre className="text-[11px] font-mono bg-background/80 p-2 rounded border border-border/40 text-muted-foreground select-all">
              X-Global-Token: {tokenPlaceholder}
            </pre>
          </div>

          <div className="rounded-xl bg-muted/40 border border-border/50 p-3 space-y-1">
            <span className="text-xs font-medium text-foreground">方式二：Bearer 认证</span>
            <pre className="text-[11px] font-mono bg-background/80 p-2 rounded border border-border/40 text-muted-foreground select-all">
              Authorization: Bearer {tokenPlaceholder}
            </pre>
          </div>

          <div className="rounded-xl bg-muted/40 border border-border/50 p-3 space-y-1">
            <span className="text-xs font-medium text-foreground">方式三：URL 参数</span>
            <pre className="text-[11px] font-mono bg-background/80 p-2 rounded border border-border/40 text-muted-foreground select-all">
              ?token={tokenPlaceholder}
            </pre>
          </div>
        </div>
      </div>

      {/* Core API Endpoints Table */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">智能体核心接口与操作 (How to Get & Download)</h2>
            <p className="text-xs text-muted-foreground">支持检索、读取纯 Markdown 正文、下载代码/附件以及流式打包 ZIP</p>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          {/* Endpoint 1 */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-green-500/15 text-green-600">GET</span>
                <code className="text-xs font-mono font-medium text-foreground">/api/global/notes?q=keyword&token={tokenPlaceholder}</code>
              </div>
              <span className="text-xs text-muted-foreground font-medium">全库 / 关键词检索</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              根据关键词匹配检索笔记正文、标签、用户名及文件路径，返回包含 Markdown 正文、关联文件及目录层级的 JSON 数组。
            </p>
          </div>

          {/* Endpoint 2 */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-green-500/15 text-green-600">GET</span>
                <code className="text-xs font-mono font-medium text-foreground">/api/global/notes/{`{noteId}`}/markdown?token={tokenPlaceholder}</code>
              </div>
              <span className="text-xs text-muted-foreground font-medium">单篇纯 Markdown 正文</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              直接返回指定笔记干净的 Markdown 纯文本，适合大模型阅读与总结。
            </p>
          </div>

          {/* Endpoint 3 */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-green-500/15 text-green-600">GET</span>
                <code className="text-xs font-mono font-medium text-foreground">/api/global/notes/{`{noteId}`}/files/{`{fileId}`}?token={tokenPlaceholder}</code>
              </div>
              <span className="text-xs text-muted-foreground font-medium">下载指定附件文件</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              下载笔记所包含的代码、文档或图片附件，支持断点续传与流式传输。
            </p>
          </div>

          {/* Endpoint 4 */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-green-500/15 text-green-600">GET</span>
                <code className="text-xs font-mono font-medium text-foreground">/api/global/notes/{`{noteId}`}/export.zip?token={tokenPlaceholder}</code>
              </div>
              <span className="text-xs text-muted-foreground font-medium">单笔记打包 ZIP</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              将单篇笔记正文（`note.md`）及该笔记下的全部子目录文件打包为 ZIP 下载。
            </p>
          </div>

          {/* Endpoint 5 */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-green-500/15 text-green-600">GET</span>
                <code className="text-xs font-mono font-medium text-foreground">/api/global/export-all.zip?token={tokenPlaceholder}</code>
              </div>
              <span className="text-xs text-muted-foreground font-medium">全库打包 ZIP</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              服务端流式打包全站所有笔记、所有附件及完整目录结构为一个 ZIP 文件。
            </p>
          </div>
        </div>
      </div>

      {/* Code Snippets & Prompt Tabs */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm space-y-4">
        <Tabs defaultValue="prompt" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="prompt" className="gap-1.5 text-xs sm:text-sm">
              <Sparkles className="w-4 h-4 text-primary" />
              <span>智能体提示词 (Prompt)</span>
            </TabsTrigger>
            <TabsTrigger value="curl" className="gap-1.5 text-xs sm:text-sm">
              <Terminal className="w-4 h-4 text-primary" />
              <span>cURL 指令</span>
            </TabsTrigger>
            <TabsTrigger value="python" className="gap-1.5 text-xs sm:text-sm">
              <Code className="w-4 h-4 text-primary" />
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
                className="h-7 text-xs gap-1 text-primary hover:text-primary"
                onClick={() => handleCopy("prompt", agentPromptSnippet, "Prompt 模板已复制")}
              >
                {copiedKey === "prompt" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === "prompt" ? "已复制" : "复制 Prompt 模板"}
              </Button>
            </div>
            <pre className="text-xs font-mono bg-muted/60 p-4 rounded-xl border border-border/60 overflow-x-auto whitespace-pre-wrap leading-relaxed text-foreground select-all max-h-72 overflow-y-auto">
              {agentPromptSnippet}
            </pre>
          </TabsContent>

          {/* Tab 2: cURL */}
          <TabsContent value="curl" className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>命令行调用接口示例：</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-primary hover:text-primary"
                onClick={() => handleCopy("curl", curlSnippet, "cURL 命令已复制")}
              >
                {copiedKey === "curl" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === "curl" ? "已复制" : "复制代码"}
              </Button>
            </div>
            <pre className="text-xs font-mono bg-muted/60 p-4 rounded-xl border border-border/60 overflow-x-auto whitespace-pre-wrap leading-relaxed text-foreground select-all max-h-72 overflow-y-auto">
              {curlSnippet}
            </pre>
          </TabsContent>

          {/* Tab 3: Python */}
          <TabsContent value="python" className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Python 请求示例：</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-primary hover:text-primary"
                onClick={() => handleCopy("python", pythonSnippet, "Python 代码已复制")}
              >
                {copiedKey === "python" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === "python" ? "已复制" : "复制代码"}
              </Button>
            </div>
            <pre className="text-xs font-mono bg-muted/60 p-4 rounded-xl border border-border/60 overflow-x-auto whitespace-pre-wrap leading-relaxed text-foreground select-all max-h-72 overflow-y-auto">
              {pythonSnippet}
            </pre>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
