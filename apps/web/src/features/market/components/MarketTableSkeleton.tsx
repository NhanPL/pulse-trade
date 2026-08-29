import { Skeleton } from "@/components/ui/Skeleton";

const SKELETON_ROWS = 6;

export function MarketTableSkeleton() {
  return (
    <div aria-label="Loading markets" aria-live="polite" role="status">
      <span className="sr-only">Loading markets</span>
      <div
        aria-hidden="true"
        className="grid gap-3 bg-canvas/20 p-3 sm:p-4 md:block md:min-w-[920px] md:bg-transparent md:p-0"
      >
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <div
            className="relative grid grid-cols-2 overflow-hidden rounded-lg border border-border-subtle bg-surface md:grid-cols-[minmax(13rem,1.4fr)_repeat(5,minmax(7rem,1fr))_5rem] md:items-center md:gap-4 md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:px-5 md:py-4 md:last:border-b-0"
            key={index}
          >
            <div className="col-span-2 flex items-center gap-3 p-4 pr-16 md:col-span-1 md:p-0 md:pr-0">
              <Skeleton className="size-9 shrink-0" variant="circular" />
              <div className="w-full space-y-2">
                <Skeleton className="max-w-24" variant="text" />
                <Skeleton className="h-3 max-w-16" variant="text" />
              </div>
            </div>
            <div className="border-t border-border-subtle p-4 md:border-0 md:p-0">
              <Skeleton className="max-w-24 md:ml-auto" variant="text" />
            </div>
            <div className="border-t border-border-subtle p-4 md:border-0 md:p-0">
              <Skeleton className="ml-auto max-w-16" variant="text" />
            </div>
            <div className="border-t border-border-subtle bg-surface-elevated/45 p-4 md:border-0 md:bg-transparent md:p-0">
              <Skeleton className="max-w-20 md:ml-auto" variant="text" />
            </div>
            <div className="border-t border-border-subtle bg-surface-elevated/45 p-4 md:border-0 md:bg-transparent md:p-0">
              <Skeleton className="ml-auto max-w-20" variant="text" />
            </div>
            <div className="col-span-2 border-t border-border-subtle bg-surface-elevated/45 p-4 md:col-span-1 md:border-0 md:bg-transparent md:p-0">
              <Skeleton className="max-w-20 md:ml-auto" variant="text" />
            </div>
            <Skeleton
              className="absolute right-4 top-4 size-9 md:static md:mx-auto"
              variant="circular"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
