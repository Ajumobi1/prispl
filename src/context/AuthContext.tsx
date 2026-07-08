import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSession, SessionUser } from "@/lib/authApi";

interface AuthContextValue {
  session: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const next = await getCurrentSession();
      setSession(next);
    } catch {
      setSession(null);
    }
  };

  useEffect(() => {
    let active = true;

    // Initial load
    refresh().finally(() => {
      if (active) setLoading(false);
    });

    // Subscribe to auth state changes — don't call async APIs from inside the callback
    // (Supabase docs: defer with setTimeout to avoid deadlocks).
    const { data: subscription } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!sess) {
        setSession(null);
        // Redirect on expired/invalid tokens so user isn't stuck on a broken protected page.
        if (event === "TOKEN_REFRESHED" || event === "SIGNED_OUT") {
          const path = window.location.pathname;
          const isPublic = ["/login", "/register", "/forgot-password"].some((p) => path.startsWith(p));
          if (event === "SIGNED_OUT" && !isPublic) {
            const next = encodeURIComponent(path + window.location.search);
            window.location.assign(`/login?next=${next}`);
          }
        }
        return;
      }
      setTimeout(() => {
        refresh();
      }, 0);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
