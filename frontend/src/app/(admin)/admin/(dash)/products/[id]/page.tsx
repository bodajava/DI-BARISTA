"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { ErrorLine, PageTitle, SkeletonRows } from "@/components/admin/kit";
import { useAdmin } from "@/lib/admin-i18n";
import { get } from "@/lib/admin/api";
import type { Product } from "@/lib/admin/types";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useAdmin();
  const product = useQuery({ queryKey: ["admin", "products", "detail", id], queryFn: () => get<Product>(`products/admin/${id}`) });
  return (
    <>
      <Link href="/admin/products" className="mb-4 inline-block text-sm text-[var(--muted-foreground)] hover:underline">
        {t("All products")}
      </Link>
      {product.isPending ? (
        <SkeletonRows rows={8} />
      ) : product.error || !product.data ? (
        <ErrorLine error={product.error ?? "This product no longer exists"} />
      ) : (
        <>
          <PageTitle title={product.data.name} />
          <ProductForm key={product.data.id} product={product.data} />
        </>
      )}
    </>
  );
}
