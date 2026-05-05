import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Terminal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

export function AgentChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'agent',
      content: 'Hello! I am the ZeNotes self-evolving Agent. Tell me how you would like to modify this app, and I will rewrite the code in Cloudflare Artifacts immediately.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const apiBase = import.meta.env.VITE_API_BASE || '';
      const response = await fetch(`${apiBase}/api/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg }),
      });

      const data = await response.json();

      if (data.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'agent',
            content: `Task completed! I have successfully updated the code and pushed it to Artifacts. Note: ${data.message}`,
            timestamp: new Date(),
          },
        ]);
        toast.success('Agent has completed the code evolution');
      } else {
        throw new Error(data.error || 'Agent execution failed');
      }
    } catch (err: any) {
      toast.error(err.message);
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: `Sorry, I encountered an error while executing the task: ${err.message}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-50 transition-all hover:scale-110 active:scale-95 bg-primary text-primary-foreground"
      >
        {isOpen ? <X size={24} /> : <Sparkles size={24} />}
      </Button>

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-background border-l shadow-2xl z-40 transition-transform duration-300 ease-in-out transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b flex items-center justify-between bg-secondary/30">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Terminal size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">ZeNotes Agent</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  Always-on Evolution
                </p>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-2xl shadow-sm text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-none'
                        : 'bg-card border rounded-tl-none'
                    }`}
                  >
                    {msg.content}
                    <div
                      className={`text-[10px] mt-1 opacity-50 ${
                        msg.role === 'user' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-card border p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce" />
                      <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                    <span className="text-xs text-muted-foreground">Agent is rewriting code...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t bg-background">
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Add a dark mode toggle"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={isLoading}
                className="rounded-xl border-secondary"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="rounded-xl shrink-0"
              >
                <Send size={18} />
              </Button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-2">
              Note: The Agent has direct write access to the main branch. Changes take effect immediately.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
