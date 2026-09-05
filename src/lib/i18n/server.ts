import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, makeT, setActiveLocale, type Locale } from "./index";

/**
 * Resolve the UI locale for the current request.
 * Priority: explicit cookie → Accept-Language → Persian (default).
 * Also primes the active locale so number/duration formatting on the server
 * matches the language of the rendered page.
 */
export async function getLocale(): Promise<Locale> {
  let locale: Locale = DEFAULT_LOCALE;
  try {
    const c = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(c)) locale = c;
    else {
      const al = (await headers()).get("accept-language") ?? "";
      if (!/fa|per/i.test(al) && /^en\b/i.test(al.trim())) locale = "en";
    }
  } catch {
    /* outside request scope */
  }
  setActiveLocale(locale);
  return locale;
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: makeT(locale) };
}
