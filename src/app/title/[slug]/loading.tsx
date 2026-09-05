export default function Loading() {
  return (
    <div className="min-h-screen">
      <div className="relative h-[88vh] w-full overflow-hidden">
        <div className="skeleton absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-16 mx-auto flex max-w-[1600px] gap-10 px-4 sm:px-8 lg:px-12">
          <div className="skeleton hidden aspect-[2/3] w-[260px] shrink-0 rounded-2xl lg:block" />
          <div className="flex-1">
            <div className="skeleton mb-4 h-5 w-40 rounded-md" />
            <div className="skeleton mb-3 h-14 w-2/3 max-w-xl rounded-lg" />
            <div className="skeleton mb-6 h-4 w-40 rounded-md" />
            <div className="skeleton mb-6 h-16 w-full max-w-md rounded-2xl" />
            <div className="skeleton mb-2 h-4 w-full max-w-2xl rounded-md" />
            <div className="skeleton mb-2 h-4 w-5/6 max-w-2xl rounded-md" />
            <div className="skeleton mb-8 h-4 w-2/3 max-w-2xl rounded-md" />
            <div className="flex gap-3">
              <div className="skeleton h-12 w-40 rounded-full" />
              <div className="skeleton h-12 w-28 rounded-full" />
              <div className="skeleton h-12 w-12 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
