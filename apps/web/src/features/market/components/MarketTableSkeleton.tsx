import { Skeleton } from "@/components/ui/Skeleton";

const SKELETON_ROWS = 6;

export function MarketTableSkeleton() {
  return (
    <div aria-label="Loading markets" aria-live="polite" className="overflow-x-auto" role="status">
      <span className="sr-only">Loading markets</span>
      <div aria-hidden="true" className="min-w-[920px] overflow-hidden">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <div
            className="grid grid-cols-[minmax(13rem,1.4fr)_repeat(5,minmax(7rem,1fr))_5rem] items-center gap-4 border-b border-border-subtle px-5 py-4 last:border-b-0"
            key={index}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0" variant="circular" />
              <div className="w-full space-y-2">
                <Skeleton className="max-w-24" variant="text" />
                <Skeleton className="h-3 max-w-16" variant="text" />
              </div>
            </div>
            <Skeleton className="ml-auto max-w-24" variant="text" />
            <Skeleton className="ml-auto max-w-16" variant="text" />
            <Skeleton className="ml-auto max-w-20" variant="text" />
            <Skeleton className="ml-auto max-w-20" variant="text" />
            <Skeleton className="ml-auto max-w-20" variant="text" />
            <Skeleton className="mx-auto size-9" variant="circular" />
          </div>
        ))}
      </div>
    </div>
  );
}
