import { Suspense } from "react";
import DocumentsContent from "./documents-content";

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </main>
      }
    >
      <DocumentsContent />
    </Suspense>
  );
}
