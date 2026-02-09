import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import PdfContent from "./pdf-content";

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </main>
      }
    >
      <PdfContent />
    </Suspense>
  );
}
