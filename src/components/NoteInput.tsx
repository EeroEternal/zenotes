import { useState } from 'react';
import { Check, Pen, Image, Plus } from 'lucide-react';
import { NoteColor } from '@/types/note';

interface NoteInputProps {
  onAddNote: (content: string, title?: string, color?: NoteColor, tags?: string[]) => void;
}

export function NoteInput({ onAddNote }: NoteInputProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (content.trim() || title.trim()) {
      onAddNote(content.trim(), title.trim() || undefined, undefined, []);
      setTitle('');
      setContent('');
      setIsExpanded(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSubmit();
    }
  };

  if (!isExpanded) {
    return (
      <div className="max-w-xl mx-auto mb-8">
        <button
          onClick={() => setIsExpanded(true)}
          className="
            w-full flex items-center gap-4 px-5 py-4
            bg-card rounded-lg shadow-card
            hover:shadow-card-hover transition-shadow
            text-left group
          "
        >
          <span className="text-muted-foreground group-hover:text-foreground transition-colors">
            添加笔记...
          </span>
          <div className="ml-auto flex items-center gap-2 text-muted-foreground">
            <Check className="w-5 h-5" />
            <Pen className="w-5 h-5" />
            <Image className="w-5 h-5" />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mb-8 animate-scale-in">
      <div className="bg-card rounded-lg shadow-card-hover overflow-hidden">
        <input
          type="text"
          placeholder="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="
            w-full px-5 py-3 bg-transparent
            text-foreground font-medium
            placeholder:text-muted-foreground
            outline-none border-b border-border/50
          "
          autoFocus
        />
        <textarea
          placeholder="添加笔记..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          className="
            w-full px-5 py-3 bg-transparent
            text-foreground text-sm leading-relaxed
            placeholder:text-muted-foreground
            outline-none resize-none
          "
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
          <div className="flex items-center gap-1">
            <button className="p-2 rounded-full hover:bg-muted transition-colors">
              <Check className="w-4 h-4 text-muted-foreground" />
            </button>
            <button className="p-2 rounded-full hover:bg-muted transition-colors">
              <Pen className="w-4 h-4 text-muted-foreground" />
            </button>
            <button className="p-2 rounded-full hover:bg-muted transition-colors">
              <Image className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsExpanded(false);
                setTitle('');
                setContent('');
              }}
              className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!content.trim() && !title.trim()}
              className="
                px-4 py-1.5 rounded-md text-sm font-medium
                bg-primary text-primary-foreground
                hover:bg-primary/90 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
