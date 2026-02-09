"use client";

import Link from "next/link";
import { LogOut, FolderOpen } from "lucide-react";
import { useAuth } from "@/src/shared/hooks";
import { signout } from "@/src/services";

function UserAvatar({ name, email }: { name?: string; email?: string }) {
  const display = name || email || "?";
  const initials = display
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-semibold text-white">
      {initials}
    </div>
  );
}

export function HeaderNav() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden h-8 w-16 animate-pulse rounded-md bg-gray-100 sm:block" />
        <div className="hidden h-8 w-14 animate-pulse rounded-md bg-gray-100 sm:block" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-1">
        <Link
          href="/documents"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          <FolderOpen className="h-4 w-4" />
          <span className="hidden sm:inline">My Documents</span>
        </Link>

        <div className="mx-1.5 hidden h-4 w-px bg-gray-200 sm:block" />

        <div className="hidden items-center gap-2 sm:flex">
          <UserAvatar
            name={user.user_metadata?.full_name}
            email={user.email}
          />
          <span className="max-w-[140px] truncate text-sm text-gray-600">
            {user.user_metadata?.full_name || user.email}
          </span>
        </div>

        <form action={signout}>
          <button
            type="submit"
            className="ml-1 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="hidden rounded-md px-3.5 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 sm:block"
      >
        Log in
      </Link>
      <Link
        href="/signup"
        className="hidden rounded-md bg-gray-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 sm:block"
      >
        Sign up
      </Link>
    </div>
  );
}
