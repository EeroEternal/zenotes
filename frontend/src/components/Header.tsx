import { Download, NotebookPen, Settings, LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  onImportKeep: () => void;
  isImportingKeep: boolean;
  // Kept for prop compatibility but not used in UI since Search is moved to Index
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function Header({ onImportKeep, isImportingKeep }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 glass-effect border-b border-border/30">
      <div className="container mx-auto px-6 h-20 flex items-center justify-between">
        
        {/* Logo and Title */}
        <div className="flex items-center gap-4 cursor-pointer">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl" />
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
              <NotebookPen className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-display text-foreground tracking-tight">
              MyNotes
            </h1>
            <p className="text-xs text-muted-foreground">Capture your thoughts</p>
          </div>
        </div>
        
        {/* User Menu / Actions */}
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center cursor-pointer border border-primary/10 hover:border-primary/30 hover:shadow-sm transition-all outline-none">
                <span className="text-sm font-medium text-primary-foreground text-gradient">U</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">User</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    user@example.com
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>个人中心</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>设置</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="cursor-pointer"
                disabled={isImportingKeep}
                onClick={(e) => {
                  e.preventDefault();
                  onImportKeep();
                }}
              >
                {isImportingKeep ? (
                  <>
                    <span className="mr-2 h-4 w-4 rounded-full border-2 border-foreground/30 border-t-foreground animate-spin" />
                    <span>导入中...</span>
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    <span>导入 Keep 笔记</span>
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
      </div>
    </header>
  );
}
