export default function Loading() {
  return (
    <div className="min-h-screen">
      <div className="relative h-[70vh] w-full overflow-hidden">
        <div className="skeleton absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-16 px-4 sm:px-8 lg:px-12">
          <div className="skeleton mb-3 h-5 w-24 rounded-md" />
          <div className="skeleton mb-3 h-12 w-2/3 max-w-lg rounded-lg" />
          <div className="skeleton mb-6 h-4 w-1/2 max-w-md rounded-md" />
          <div className="flex gap-3">
            <div className="skeleton h-12 w-36 rounded-full" />
            <div className="skeleton h-12 w-12 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-6 space-y-10 px-4 sm:px-8 lg:px-12">
        {[0, 1, 2].map((r) => (
          <div key={r}>
            <div className="skeleton mb-4 h-6 w-48 rounded-md" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[2/3] w-[150px] shrink-0 rounded-xl sm:w-[190px]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
