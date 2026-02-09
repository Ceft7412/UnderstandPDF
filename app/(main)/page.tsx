import { BookOpen, Compass } from "lucide-react";
import { PdfUploadZone } from "@/src/features/home/components";

const sampleInsights = [
  {
    title: "Transformer attention scales quadratically",
    description:
      "The paper demonstrates that self-attention complexity grows as O(n\u00B2) with sequence length, making long-document processing prohibitively expensive without approximation techniques.",
    page: 4,
    section: "Complexity Analysis",
  },
  {
    title: "Sparse attention achieves 94% of full accuracy",
    description:
      "Experiments on the PG-19 benchmark show that local-global sparse patterns retain near-full performance while reducing memory from 16 GB to 2.1 GB at 8k tokens.",
    page: 12,
    section: "Results",
    direction: "How do sparse patterns interact with retrieval-augmented generation?",
  },
  {
    title: "Sub-quadratic methods plateau beyond 32k context",
    description:
      "Linear-attention variants exhibit diminishing returns past 32k tokens, suggesting a fundamental information-density bottleneck unrelated to compute.",
    page: 19,
    section: "Discussion",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col overflow-auto">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-2 lg:items-start">
          {/* Left — Upload */}
          <div className="flex flex-col justify-center lg:sticky lg:top-12">
            <p className="mb-3 text-sm font-medium tracking-wide text-gray-400 uppercase">
              Research assistant for PDFs
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Read less.
              <br />
              Understand more.
            </h1>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-gray-500">
              Drop a PDF and get the key insights, source citations, and
              research directions — in seconds, not hours.
            </p>

            <div className="mt-8 max-w-sm">
              <PdfUploadZone />
            </div>

            <p className="mt-4 text-xs text-gray-400">
              50 MB limit &middot; Documents stay private
            </p>
          </div>

          {/* Right — Sample output preview */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-medium text-gray-400">
                Example output
              </p>
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                3 insights
              </span>
            </div>

            <div className="space-y-3">
              {sampleInsights.map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-gray-200 bg-white p-4"
                >
                  <h3 className="text-sm font-semibold text-gray-900">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-600">
                    {item.description}
                  </p>

                  {/* Source reference */}
                  <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5">
                    <p className="flex items-center gap-1 text-[11px] text-gray-400">
                      <BookOpen className="h-3 w-3" />
                      Page {item.page} &mdash; {item.section}
                    </p>
                  </div>

                  {/* Research direction */}
                  {item.direction && (
                    <div className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-1.5">
                      <p className="flex items-center gap-1 text-[11px] text-amber-700">
                        <Compass className="h-3 w-3" />
                        {item.direction}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
