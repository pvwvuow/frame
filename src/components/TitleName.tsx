"use client";

import { titleNames } from "@/lib/title-name";
import { useI18n } from "./i18n/LocaleProvider";

type Named = { title: string; titleEn: string; country?: string | null };

/**
 * Bilingual title: main name in its natural script + a small companion name
 * in the other language (e.g. "Endless Night" with «شب بی‌پایان» beside it).
 */
export default function TitleName({
  t,
  as: Tag = "p",
  className = "",
  primaryClass = "",
  secondaryClass = "",
  layout = "stack",
  hideSecondary = false,
}: {
  t: Named;
  as?: "p" | "h1" | "h2" | "h3" | "span" | "div";
  className?: string;
  primaryClass?: string;
  secondaryClass?: string;
  /** stack = secondary under primary · inline = secondary beside primary */
  layout?: "stack" | "inline";
  hideSecondary?: boolean;
}) {
  const { locale } = useI18n();
  const n = titleNames(t, locale);
  const inline = layout === "inline";
  return (
    <Tag className={`${inline ? "flex flex-wrap items-baseline gap-x-2" : ""} ${className}`} title={n.label}>
      <span dir={n.primaryDir} className={`${inline ? "" : "block"} min-w-0 truncate ${primaryClass}`}>
        {n.primary}
      </span>
      {!hideSecondary && n.secondary && (
        <span
          dir={n.secondaryDir}
          className={`${inline ? "" : "block"} min-w-0 truncate font-normal opacity-60 ${secondaryClass}`}
          aria-hidden="true"
        >
          {n.secondary}
        </span>
      )}
    </Tag>
  );
}
