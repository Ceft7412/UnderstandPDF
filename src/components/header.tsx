import Link from "next/link";
import Image from "next/image";
import logo from "@/src/assets/images/logo.png";
import { HeaderNav } from "./header-nav";

export function Header() {
  return (
    <header className="border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
              <Image
                src={logo}
                alt="UnderstandPDF logo"
                className="object-contain"
                width={32}
                height={32}
                priority
              />
            </span>
            <span className="text-lg font-semibold tracking-tight text-gray-900">
              UnderstandPDF
            </span>
          </Link>

          {/* Right Nav — client component for auth-aware rendering */}
          <HeaderNav />
        </div>
      </div>
    </header>
  );
}
