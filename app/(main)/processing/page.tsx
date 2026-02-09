import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ProcessingContent from "./processing-content";

export default function ProcessingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </main>
      }
    >
      <ProcessingContent />
    </Suspense>
  );
}
