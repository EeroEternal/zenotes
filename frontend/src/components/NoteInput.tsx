import { useState, useEffect } from 'react';
import { Image, Plus, Feather, X, Palette, Tag as TagIcon } from 'lucide-react';
import { NoteColor } from '@/types/note';

interface NoteInputProps {
  onAddNote: (content: string, title?: string, color?: NoteColor, tags?: string[]) => void;
}

export function NoteInput({ onAddNote }: NoteInputProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsText, setTagsText] = useState('');

  const handleSubmit = () => {
    if (content.trim() || title.trim()) {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      onAddNote(content.trim(), title.trim() || undefined, undefined, tags);
      setTitle('');
      setContent('');
      setTagsText('');
      setIsExpanded(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSubmit();
    }
  };

  const handleClose = () => {
    setTitle('');
    setContent('');
    setTagsText('');
    setIsExpanded(false);
  };

  // Escape key to close when expanded
  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isExpanded]);

  if (!isExpanded) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div
          onClick={() => setIsExpanded(true)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`
            w-full bg-card rounded-2xl border border-border/50
            transition-all duration-300 cursor-text
            p-5 flex items-center gap-4
            ${isHovered ? 'shadow-note-hover border-border -translate-y-0.5' : 'shadow-note'}
          `}
        >
          <div className={`
            w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300
            ${isHovered ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}
          `}>
            {isHovered ? (
              <Feather className="w-5 h-5 animate-scale-in" />
            ) : (
              <Plus className="w-5 h-5 animate-scale-in" />
            )}
          </div>
          <span className={`
            text-[15px] transition-colors duration-200
            ${isHovered ? 'text-foreground' : 'text-muted-foreground'}
          `}>
            Take a note...
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full max-w-2xl mx-auto -mt-3" />
      
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
        onClick={() => {
          if (content.trim() || title.trim()) {
            handleSubmit();
          } else {
            handleClose();
          }
        }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-foreground/5 backdrop-blur-sm" />
        
        {/* Editor Modal */}
        <div 
          className="relative w-full max-w-xl rounded-3xl border border-border/50 bg-card p-6 shadow-note-active animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 rounded-xl hover:bg-foreground/8 transition-colors z-10"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Title input */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Title"
            className="w-full bg-transparent text-xl font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none pr-10 mb-4"
          />

          {/* Content textarea */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Take a note..."
            rows={6}
            autoFocus
            className="w-full bg-transparent text-foreground/85 placeholder:text-muted-foreground focus:outline-none resize-none text-[15px] leading-relaxed"
          />

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/30">
            <div className="flex items-center gap-1">
              <button className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors">
                <Palette className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors">
                <Image className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors">
                <TagIcon className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            
            <button
              onClick={handleSubmit}
              className="px-6 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-sm"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
