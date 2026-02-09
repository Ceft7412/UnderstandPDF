"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * Reactively provides the current authenticated user.
 * Listens to `onAuthStateChange` so the UI updates automatically
 * on login, logout, and token refresh — no manual polling needed.
 *
 * Usage:
 *   const { user, isLoading } = useAuth();
 *   if (isLoading) return <Skeleton />;
 *   if (user) return <UserMenu />;
 *   return <SignInButton />;
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Get the initial session
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setIsLoading(false);
    });

    // Listen for auth changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}
