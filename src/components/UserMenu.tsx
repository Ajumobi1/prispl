import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LayoutDashboard, ListChecks, LogOut, ShieldCheck, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { logoutSession } from "@/lib/authApi";

interface UserMenuProps {
  /** Render in dark/colored header (uses translucent button) */
  variant?: "default" | "header";
}

function getInitials(name: string, fallback: string) {
  const source = (name || fallback || "U").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function UserMenu({ variant = "default" }: UserMenuProps) {
  const { session, refresh } = useAuth();
  const navigate = useNavigate();

  if (!session) return null;

  const initials = getInitials(session.full_name, session.username);
  const isAdmin = session.role === "admin";

  const handleLogout = async () => {
    await logoutSession();
    await refresh();
    navigate("/login");
  };

  const triggerClass =
    variant === "header"
      ? "h-9 gap-2 border border-primary-foreground/40 bg-primary-foreground/10 px-2 text-primary-foreground hover:bg-primary-foreground/20"
      : "h-9 gap-2 px-2";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={triggerClass}>
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/20 text-xs font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[120px] truncate text-sm font-medium sm:inline">
            {session.full_name || session.username}
          </span>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-popover z-50">
        <DropdownMenuLabel className="flex flex-col gap-1 py-3">
          <span className="text-sm font-semibold leading-none">{session.full_name || session.username}</span>
          <span className="text-xs font-normal text-muted-foreground">@{session.username}</span>
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {isAdmin && <ShieldCheck className="h-3 w-3" />}
            {session.role} · {session.department}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile"><UserIcon className="mr-2 h-4 w-4" />My profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/task-tracker"><ListChecks className="mr-2 h-4 w-4" />Task Tracker</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/dashboard"><LayoutDashboard className="mr-2 h-4 w-4" />Dashboard</Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/account-admin"><ShieldCheck className="mr-2 h-4 w-4" />Manage Accounts</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
