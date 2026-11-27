"use client";

import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import { PageTitle } from "@/components/admin/kit";
import { useAdmin } from "@/lib/admin-i18n";

export default function NewProductPage() {
  const { t } = useAdmin();
  return (
    <>
      <Link href="/admin/products" className="mb-4 inline-block text-sm text-[var(--muted-foreground)] hover:underline">
        {t("All products")}
      </Link>
      <PageTitle title={t("New product")} />
      <ProductForm />
    </>
  );
}
