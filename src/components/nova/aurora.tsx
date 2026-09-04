"use client";

export function AuroraBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* base vignette */}
      <div className="absolute inset-0 bg-[#06060a]" />

      {/* aurora color blobs — give the glass something to refract */}
      <div className="aurora-1 absolute -top-40 -right-32 w-[46rem] h-[46rem] rounded-full opacity-40 blur-[130px]"
        style={{ background: "radial-gradient(circle, rgba(245,158,11,0.55), rgba(234,88,12,0.18) 55%, transparent 75%)" }} />
      <div className="aurora-2 absolute top-1/3 -left-40 w-[42rem] h-[42rem] rounded-full opacity-35 blur-[140px]"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.5), rgba(76,29,149,0.15) 55%, transparent 75%)" }} />
      <div className="aurora-3 absolute -bottom-56 right-1/4 w-[40rem] h-[40rem] rounded-full opacity-30 blur-[150px]"
        style={{ background: "radial-gradient(circle, rgba(20,184,166,0.45), rgba(13,148,136,0.12) 55%, transparent 75%)" }} />
      <div className="aurora-1 absolute top-16 right-1/2 w-[28rem] h-[28rem] rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, rgba(236,72,153,0.4), transparent 70%)" }} />

      {/* top spotlight */}
      <div className="absolute inset-x-0 top-0 h-64"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.045), transparent)" }} />

      {/* film grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: "180px 180px",
        }}
      />
    </div>
  );
}
