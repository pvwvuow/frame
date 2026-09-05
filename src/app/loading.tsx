export default function Loading() {
  return (
    <div className="min-h-screen pt-20">
      <div className="skeleton h-[60vh] w-full" />
      <div className="mt-8 space-y-8 px-4 sm:px-8 lg:px-12">
        {[0, 1].map((r) => (
          <div key={r}>
            <div className="skeleton mb-4 h-6 w-48 rounded-md" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[2/3] w-[160px] shrink-0 rounded-xl sm:w-[190px]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
