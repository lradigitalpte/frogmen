"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Modal, SkeletonBodyText, Text } from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";
import {
  ProductForm,
  formValuesToInput,
  productToFormValues,
  type ProductFormValues,
} from "@/components/products/product-form";
import { productUrl } from "@/lib/product-areas";
import { getProduct, getProductStock, listProductUnits, listProducts, updateProduct } from "@/lib/products-api";

interface EditProductPageProps {
  productId: string;
}

export function EditProductPage({ productId }: EditProductPageProps) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues | null>(null);
  const [initialValues, setInitialValues] = useState<ProductFormValues | null>(null);
  const [productName, setProductName] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [parentOptions, setParentOptions] = useState<Array<{ label: string; value: string; description?: string }>>([]);
  const [lockTrackingReason, setLockTrackingReason] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const backUrl = productUrl({ id: productId, usageType: values?.usageType });

  useEffect(() => {
    Promise.all([getProduct(productId), listProducts({ type: "goods", rootOnly: true, perPage: 100 })])
      .then(async ([product, parents]) => {
        const formValues = productToFormValues(product);
        setValues(formValues);
        setInitialValues(formValues);
        setProductName(product.name);
        setImages(product.images ?? []);
        setParentOptions(
          parents.data
            // Parents come from the same area, plus whichever one is already linked.
            .filter(
              (item) =>
                item.id !== productId && (item.usageType === product.usageType || item.id === product.parentId),
            )
            .map((item) => ({
              label: item.name,
              value: item.id,
              description: item.sku ? `SKU ${item.sku}` : undefined,
            })),
        );

        // Switching tracking mode on a product that already has stock would orphan it.
        if (product.type === "goods" && product.isStorable) {
          try {
            if (product.trackSerial) {
              const units = await listProductUnits(productId, { perPage: 1 });
              if (units.meta.total > 0) {
                setLockTrackingReason(
                  `Tracking is locked because ${product.name} already has ${units.meta.total} serial${units.meta.total === 1 ? "" : "s"}.`,
                );
              }
            } else {
              const stock = await getProductStock(productId);
              const onHand = stock.levels.reduce((sum, level) => sum + (Number(level.quantity) || 0), 0);
              if (stock.levels.length > 0 && onHand !== 0) {
                setLockTrackingReason(
                  `Tracking is locked because ${product.name} has ${onHand} unit${onHand === 1 ? "" : "s"} in stock. Set stock to zero first to change it.`,
                );
              }
            }
          } catch {
            // If we can't tell, leave tracking editable as before.
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Product not found"))
      .finally(() => setLoading(false));
  }, [productId]);

  const dirty = useMemo(() => {
    if (!values || !initialValues) return false;
    const { categoryName: _a, ...current } = values;
    const { categoryName: _b, ...initial } = initialValues;
    return JSON.stringify(current) !== JSON.stringify(initial);
  }, [initialValues, values]);

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function validate(v: ProductFormValues) {
    if (!v.name.trim()) return "Give the product a name.";
    if (Number(v.costPrice) < 0 || !Number.isFinite(Number(v.costPrice || 0))) return "Cost can't be negative.";
    if (v.usageType === "for_sale" && (Number(v.sellingPrice) < 0 || !Number.isFinite(Number(v.sellingPrice || 0)))) {
      return "Selling price can't be negative.";
    }
    return null;
  }

  function requestSave() {
    if (!values) return;
    const problem = validate(values);
    if (problem) {
      setError(problem);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    void save();
  }

  async function save() {
    if (!values) return;
    setSaving(true);
    setError(null);
    try {
      await updateProduct(productId, formValuesToInput(values));
      setInitialValues(values);
      router.push(backUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product");
      setSaving(false);
    }
  }

  function leave() {
    if (dirty) {
      setConfirmLeave(true);
      return;
    }
    router.push(backUrl);
  }

  return (
    <AppPage
      backAction={{ content: productName || "Product", onAction: leave }}
      primaryAction={{ content: "Save changes", disabled: !dirty || loading, loading: saving, onAction: requestSave }}
      secondaryActions={[{ content: "Cancel", onAction: leave }]}
      subtitle={dirty ? "You have unsaved changes." : "Changes are saved when you click Save changes."}
      title={productName ? `Edit ${productName}` : "Edit product"}
    >
      <div className="pf-page">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {loading || !values ? (
          error ? null : (
            <div className="pf-loading">
              <SkeletonBodyText lines={10} />
            </div>
          )
        ) : (
          <>
            <ProductForm
              images={images}
              lockTrackingReason={lockTrackingReason}
              parentOptions={parentOptions}
              productId={productId}
              values={values}
              onChange={(next) => setValues(next)}
              onImagesChange={setImages}
            />

            {dirty ? (
            <div className="pf-savebar">
              <span>You have unsaved changes</span>
              <div>
                <Button onClick={leave}>Cancel</Button>
                <Button loading={saving} variant="primary" onClick={requestSave}>
                  Save changes
                </Button>
              </div>
            </div>
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={confirmLeave}
        primaryAction={{ content: "Discard changes", destructive: true, onAction: () => router.push(backUrl) }}
        secondaryActions={[{ content: "Keep editing", onAction: () => setConfirmLeave(false) }]}
        title="Discard unsaved changes?"
        onClose={() => setConfirmLeave(false)}
      >
        <Modal.Section>
          <Text as="p">Your edits to {productName || "this product"} haven&apos;t been saved.</Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
