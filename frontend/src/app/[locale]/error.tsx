"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";

/** Friendly page when something breaks while showing a store page; the error is logged */
export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useParams<{ locale: string }>();
  const ar = locale === "ar";
  useEffect(() => {
    console.error("[store-error]", error.digest ?? "", error.message);
  }, [error]);
  return (
    <main className="grid min-h-[70vh] place-items-center px-6 text-center" dir={ar ? "rtl" : "ltr"}>
      <div className="grid max-w-md gap-4">
        <h1 className="text-3xl font-bold">{ar ? "حصلت مشكلة صغيرة" : "Something went wrong"}</h1>
        <p className="opacity-75">
          {ar ? "جرّب تاني بعد لحظة. لو المشكلة فضلت، كلّمنا." : "Please try again in a moment. If it keeps happening, contact us."}
          {error.digest ? <span className="mt-2 block text-xs opacity-60">Ref: {error.digest}</span> : null}
        </p>
        <div className="flex justify-center gap-3">
          <button type="button" onClick={reset} className="rounded-full border px-5 py-2 font-semibold">
            {ar ? "حاول تاني" : "Try again"}
          </button>
          <Link href={`/${ar ? "ar" : "en"}`} className="rounded-full border px-5 py-2 font-semibold">
            {ar ? "الرئيسية" : "Home"}
          </Link>
        </div>
      </div>
    </main>
  );
}
