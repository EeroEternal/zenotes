import { Search, Menu, RefreshCw, Settings } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Header({ searchQuery, onSearchChange }: HeaderProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border">
      <div className="flex items-center h-16 px-4 gap-4">
        {/* Logo */}
        <button className="p-2 rounded-full hover:bg-muted transition-colors">
          <Menu className="w-5 h-5 text-muted-foreground" />
        </button>
        
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-semibold text-sm">N</span>
          </div>
          <span className="text-lg font-medium text-foreground hidden sm:block">笔记</span>
        </div>

        {/* Search Bar */}
        <div className={`
          flex-1 max-w-2xl mx-4
          flex items-center gap-3 px-4 py-2.5
          rounded-lg transition-all duration-200
          ${isFocused 
            ? 'bg-card shadow-card-hover ring-1 ring-border' 
            : 'bg-muted hover:bg-muted/80'
          }
        `}>
          <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Right Icons */}
        <div className="flex items-center gap-1">
          <button className="p-2.5 rounded-full hover:bg-muted transition-colors">
            <RefreshCw className="w-5 h-5 text-muted-foreground" />
          </button>
          <button className="p-2.5 rounded-full hover:bg-muted transition-colors">
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="w-8 h-8 rounded-full bg-primary/20 ml-2 flex items-center justify-center">
            <span className="text-sm font-medium text-primary-foreground">U</span>
          </div>
        </div>
      </div>
    </header>
  );
}
