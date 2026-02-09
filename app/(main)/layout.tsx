import { Header } from "@/src/components/header";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen flex-col bg-white">
      <Header />
      {children}
    </div>
  );
}
