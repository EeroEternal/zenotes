import { Download, NotebookPen, Settings, LogOut, User } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { toast } from "sonner";

const ARGON2_TOAST =
  "This account uses a legacy Argon2 password. In the worker folder run: node scripts/d1-set-password-sha256.mjs USERNAME NEW_PASSWORD, then run the printed wrangler d1 execute command, and sign in with the new password.";

function toastAuthError(err: unknown, fallback: string) {
  if (err instanceof ApiError) {
    const m = err.message.trim();
    toast.error(m === "argon2_unavailable" ? ARGON2_TOAST : err.message);
    return;
  }
  toast.error(fallback);
}

interface HeaderProps {
  onImportKeep: () => void;
  isImportingKeep: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function Header({ onImportKeep, isImportingKeep }: HeaderProps) {
  const queryClient = useQueryClient();
  const [loginOpen, setLoginOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [regEmail, setRegEmail] = useState("");

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.fetchAuthMe,
    staleTime: 60_000,
    retry: false,
  });

  const loginMut = useMutation({
    mutationFn: () => api.login(loginUser.trim(), loginPass),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setLoginOpen(false);
      setLoginPass("");
      toast.success("Signed in");
    },
    onError: (err) => toastAuthError(err, "Sign-in failed"),
  });

  const registerMut = useMutation({
    mutationFn: () =>
      api.register({
        username: loginUser.trim(),
        email: regEmail.trim(),
        password: loginPass,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setLoginOpen(false);
      setLoginPass("");
      setRegEmail("");
      toast.success("Registered and signed in");
    },
    onError: (err) => toastAuthError(err, "Registration failed"),
  });

  const logoutMut = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.success("Signed out");
    },
  });

  const me = meQuery.data;
  const displayName = me?.username ?? "Not signed in";
  const displayEmail = me?.email ?? "Account details appear after sign-in";
  const initial = me?.username?.trim().charAt(0).toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-40 glass-effect border-b border-border/30">
      <div className="container mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-4 cursor-pointer">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl" />
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
              <NotebookPen className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-display text-foreground tracking-tight">Zenotes</h1>
            <p className="text-xs text-muted-foreground">Capture your thoughts</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center cursor-pointer border border-primary/10 hover:border-primary/30 hover:shadow-sm transition-all outline-none">
                <span className="text-sm font-medium text-primary-foreground text-gradient">{initial}</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{displayName}</p>
                  <p className="text-xs leading-none text-muted-foreground break-all">{displayEmail}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {!me && (
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    setAuthTab("login");
                    setLoginOpen(true);
                  }}
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>Sign in</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="cursor-pointer" disabled>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" disabled>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                disabled={isImportingKeep || !me}
                onClick={(e) => {
                  e.preventDefault();
                  if (me) onImportKeep();
                }}
              >
                {isImportingKeep ? (
                  <>
                    <span className="mr-2 h-4 w-4 rounded-full border-2 border-foreground/30 border-t-foreground animate-spin" />
                    <span>Importing…</span>
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    <span>Import Google Keep</span>
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.preventDefault();
                  logoutMut.mutate();
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog
        open={loginOpen}
        onOpenChange={(open) => {
          setLoginOpen(open);
          if (!open) {
            setAuthTab("login");
            setLoginPass("");
            setRegEmail("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{authTab === "login" ? "Sign in" : "Register"}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 border-b border-border pb-2">
            <Button
              type="button"
              variant={authTab === "login" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setAuthTab("login")}
            >
              Sign in
            </Button>
            <Button
              type="button"
              variant={authTab === "register" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setAuthTab("register")}
            >
              Register
            </Button>
          </div>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                autoComplete="username"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
              />
            </div>
            {authTab === "register" && (
              <div className="grid gap-2">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete={authTab === "login" ? "current-password" : "new-password"}
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLoginOpen(false)}>
              Cancel
            </Button>
            {authTab === "login" ? (
              <Button
                type="button"
                disabled={loginMut.isPending || !loginUser.trim() || !loginPass}
                onClick={() => loginMut.mutate()}
              >
                {loginMut.isPending ? "Signing in…" : "Sign in"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={
                  registerMut.isPending ||
                  !loginUser.trim() ||
                  !loginPass ||
                  !regEmail.includes("@")
                }
                onClick={() => registerMut.mutate()}
              >
                {registerMut.isPending ? "Submitting…" : "Register"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
