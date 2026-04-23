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
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!sess) {
        setSession(null);
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
