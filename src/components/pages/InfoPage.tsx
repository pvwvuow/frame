import Link from "next/link";
import type { ReactNode } from "react";
import type { SVGProps } from "react";

const NAV = [
  { href: "/about", label: "درباره نما" },
  { href: "/faq", label: "سوالات متداول" },
  { href: "/contact", label: "تماس با ما" },
  { href: "/terms", label: "قوانین استفاده" },
  { href: "/privacy", label: "حریم خصوصی" },
];

export default function InfoPage({
  eyebrow,
  title,
  lead,
  icon: Icon,
  current,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  icon: (p: SVGProps<SVGSVGElement>) => ReactNode;
  current: string;
  children: ReactNode;
}) {
  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(229,9,20,0.16),transparent_55%)]" />
        <div className="relative mx-auto max-w-[1200px] px-4 pb-10 pt-28 sm:px-8 lg:pt-36">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
            <Icon width={16} height={16} /> {eyebrow}
          </p>
          <h1 className="text-4xl font-black text-white sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-zinc-300 sm:text-base">{lead}</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 sm:px-8 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <nav className="no-scrollbar flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${current === n.href ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="prose-nama min-w-0">{children}</article>
      </div>
    </main>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-3xl border border-white/5 bg-ink-800/60 p-6 sm:p-8 [&+&]:mt-6">
      <h2 className="text-xl font-extrabold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-8 text-zinc-300">{children}</div>
    </section>
  );
}
