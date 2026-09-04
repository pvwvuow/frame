import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4 pt-20 text-center">
      <div>
        <p className="text-8xl font-black text-white/10">۴۰۴</p>
        <h1 className="mt-2 text-2xl font-black text-white">این صحنه در فیلم‌نامه نبود!</h1>
        <p className="mt-2 text-sm text-zinc-400">صفحه‌ای که دنبالش هستید وجود ندارد.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
          بازگشت به خانه
        </Link>
      </div>
    </main>
  );
}
