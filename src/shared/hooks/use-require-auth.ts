"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Returns a function that checks if the user is authenticated.
 * If not, redirects to /login with a `next` param to return after auth.
 *
 * Usage:
 *   const requireAuth = useRequireAuth();
 *   const handleUpload = async (file: File) => {
 *     if (!(await requireAuth())) return;
 *     // ... proceed with upload
 *   };
 */
export function useRequireAuth(redirectTo = "/login") {
  const router = useRouter();

  return useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      const returnPath = window.location.pathname + window.location.search;
      router.push(`${redirectTo}?next=${encodeURIComponent(returnPath)}`);
      return false;
    }

    return true;
  }, [router, redirectTo]);
}
