"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fa } from "@/lib/format";
import { useIsElectron } from "@/lib/platform";
import { useI18n } from "./i18n/LocaleProvider";

export default function Footer() {
  const pathname = usePathname();
  const electron = useIsElectron();
  const { t } = useI18n();
  if (pathname?.startsWith("/watch/")) return null;

  // Desktop app: no marketing / legal footer – just a slim status strip.
  if (electron) {
    return (
      <footer className="mt-16 border-t border-white/5 pb-24 lg:pb-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 text-[11px] text-zinc-500 sm:px-8 lg:px-12">
          <p>{t("app.name")} · {t("app.desktop")} · © {fa(new Date().getFullYear())}</p>
          <nav className="flex items-center gap-4">
            <Link className="hover:text-white" href="/settings">{t("footer.settings")}</Link>
            <Link className="hover:text-white" href="/faq">{t("footer.help")}</Link>
            <Link className="hover:text-white" href="/settings#about">{t("footer.aboutApp")}</Link>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-20 border-t border-white/5 bg-ink-800 pb-24 lg:pb-10">
      <div className="mx-auto max-w-[1600px] px-4 py-12 sm:px-8 lg:px-12">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-5">
          <div className="md:col-span-2">
            <p className="text-2xl font-black">
              {t("app.name")}<span className="text-brand">.</span>
            </p>
            <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
              {t("footer.about")}
            </p>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold text-white">{t("footer.categories")}</p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link className="hover:text-white" href="/movies">{t("nav.movies")}</Link></li>
              <li><Link className="hover:text-white" href="/series">{t("nav.series")}</Link></li>
              <li><Link className="hover:text-white" href="/genres">{t("nav.genres")}</Link></li>
              <li><Link className="hover:text-white" href="/collections">{t("nav.collections")}</Link></li>
              <li><Link className="hover:text-white" href="/people">{t("nav.people")}</Link></li>
              <li><Link className="hover:text-white" href="/random">{t("nav.random")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold text-white">{t("footer.support")}</p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link className="hover:text-white" href="/about">{t("footer.aboutUs")}</Link></li>
              <li><Link className="hover:text-white" href="/faq">{t("footer.faq")}</Link></li>
              <li><Link className="hover:text-white" href="/contact">{t("footer.contact")}</Link></li>
              <li><Link className="hover:text-white" href="/terms">{t("footer.terms")}</Link></li>
              <li><Link className="hover:text-white" href="/privacy">{t("footer.privacy")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold text-white">{t("footer.library")}</p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link className="hover:text-white" href="/my-list">{t("nav.myList")}</Link></li>
              <li><Link className="hover:text-white" href="/favorites">{t("footer.favorites")}</Link></li>
              <li><Link className="hover:text-white" href="/history">{t("footer.history")}</Link></li>
              <li><Link className="hover:text-white" href="/profile">{t("footer.profileSettings")}</Link></li>
              <li><Link className="flex items-center gap-1.5 font-bold text-white hover:text-brand" href="/download">{t("footer.downloadApp")} <span className="rounded bg-brand px-1.5 py-0.5 text-[9px] text-white">{t("common.new")}</span></Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-white/5 pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center">
          <p>© {fa(new Date().getFullYear())} {t("app.name")}. {t("common.rights")}</p>
          <p className="flex items-center gap-3">
            <span className="rounded border border-white/10 px-2 py-0.5">4K</span>
            <span className="rounded border border-white/10 px-2 py-0.5">HDR</span>
            <span className="rounded border border-white/10 px-2 py-0.5">Dolby</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
