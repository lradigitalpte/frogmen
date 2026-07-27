"use client";

import {
  Banner,
  BlockStack,
  FormLayout,
  Layout,
  Select,
  TextField,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { QuotationFormSection } from "@/components/sales/quotation-form-section";
import { RovProjectImageUpload } from "@/components/rov/rov-project-image-upload";
import { getCustomer } from "@/lib/customers-api";
import {
  createRovProject,
  updateRovProject,
  uploadProjectPlanView,
} from "@/lib/rov-api";
import { getCompanySettings } from "@/lib/settings-api";
import type { Customer } from "@/types/customer";
import type { RovProject } from "@/types/rov";

interface RovProjectFormProps {
  project?: RovProject;
}

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Archived", value: "archived" },
];

export function RovProjectForm({ project }: RovProjectFormProps) {
  const router = useRouter();
  const isEdit = Boolean(project);

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [location, setLocation] = useState(project?.location ?? "");
  const [latitude, setLatitude] = useState(project?.latitude ?? "");
  const [longitude, setLongitude] = useState(project?.longitude ?? "");
  const [status, setStatus] = useState(project?.status ?? "draft");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [endDate, setEndDate] = useState(project?.endDate ?? "");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [planViewPath, setPlanViewPath] = useState(project?.planViewPath ?? null);
  const [pendingPlanView, setPendingPlanView] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getCompanySettings()
      .then((settings) => setCompanyName(settings.name))
      .catch(() => setCompanyName(""));
  }, []);

  useEffect(() => {
    if (!project?.customerId) return;

    void getCustomer(project.customerId)
      .then(setCustomer)
      .catch(() => {
        if (project.customerName) {
          setCustomer({
            id: project.customerId!,
            name: project.customerName,
          } as Customer);
        }
      });
  }, [project?.customerId, project?.customerName]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        description: description || undefined,
        location: location || undefined,
        latitude: latitude || undefined,
        longitude: longitude || undefined,
        status: status as RovProject["status"],
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        customerId: customer?.id ?? null,
      };

      if (isEdit && project) {
        await updateRovProject(project.id, payload);
        router.push(`/dashboard/rov/projects/${project.id}`);
      } else {
        const created = await createRovProject(payload);

        if (pendingPlanView) {
          await uploadProjectPlanView(created.id, pendingPlanView);
        }

        router.push(`/dashboard/rov/projects/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  }, [
    name,
    description,
    location,
    latitude,
    longitude,
    status,
    startDate,
    endDate,
    customer,
    isEdit,
    project,
    pendingPlanView,
    router,
  ]);

  const cancelPath =
    isEdit && project
      ? `/dashboard/rov/projects/${project.id}`
      : "/dashboard/rov/projects";

  return (
    <AppPage
      title={isEdit ? `Edit ${project?.name ?? "project"}` : "New inspection project"}
      subtitle="Project information, site details, and assignment."
      backAction={{
        content: "Projects",
        onAction: () => router.push(cancelPath),
      }}
      primaryAction={{
        content: isEdit ? "Save changes" : "Create project",
        onAction: () => void handleSubmit(),
        loading: saving,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: () => router.push(cancelPath),
        },
      ]}
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <QuotationFormSection title="Project Information">
                <FormLayout>
                  <TextField
                    label="Project name"
                    value={name}
                    onChange={setName}
                    autoComplete="off"
                    requiredIndicator
                    placeholder="e.g. Pipeline ROV Survey – Block 14"
                  />
                  <TextField
                    label="Description"
                    value={description}
                    onChange={setDescription}
                    multiline={3}
                    autoComplete="off"
                  />
                </FormLayout>
              </QuotationFormSection>

              <QuotationFormSection title="Details">
                <FormLayout>
                  <TextField
                    label="Site location"
                    value={location}
                    onChange={setLocation}
                    autoComplete="off"
                    placeholder="e.g. Abu Dhabi"
                  />
                  <CustomerPicker
                    label="Client / Customer"
                    value={customer}
                    onChange={setCustomer}
                    allowClear
                  />
                  <FormLayout.Group>
                    <TextField
                      label="Start date"
                      type="date"
                      value={startDate}
                      onChange={setStartDate}
                      autoComplete="off"
                    />
                    <TextField
                      label="End date"
                      type="date"
                      value={endDate}
                      onChange={setEndDate}
                      autoComplete="off"
                    />
                  </FormLayout.Group>
                </FormLayout>
              </QuotationFormSection>

              <QuotationFormSection
                title="GPS Location"
                description="Used to pin the project on a satellite map in the client report."
              >
                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      label="Latitude"
                      value={latitude}
                      onChange={setLatitude}
                      autoComplete="off"
                      placeholder="e.g. 25.1972"
                    />
                    <TextField
                      label="Longitude"
                      value={longitude}
                      onChange={setLongitude}
                      autoComplete="off"
                      placeholder="e.g. 55.2744"
                    />
                  </FormLayout.Group>
                </FormLayout>
              </QuotationFormSection>

              <QuotationFormSection
                title="Plan View"
                description="Top-down CAD, engineering drawing, or site map shown in client reports."
              >
                <RovProjectImageUpload
                  projectId={project?.id}
                  kind="plan-view"
                  ariaLabel="Upload plan view"
                  imagePath={planViewPath}
                  pendingFile={pendingPlanView}
                  onImagePathChange={setPlanViewPath}
                  onPendingFileChange={setPendingPlanView}
                  disabled={saving}
                />
              </QuotationFormSection>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <QuotationFormSection title="Status & Assignment">
              <FormLayout>
                <Select
                  label="Status"
                  options={STATUS_OPTIONS}
                  value={status}
                  onChange={(value) => setStatus(value as RovProject["status"])}
                />
                <TextField
                  label="Company"
                  value={companyName}
                  onChange={() => undefined}
                  autoComplete="off"
                  readOnly
                />
              </FormLayout>
            </QuotationFormSection>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </AppPage>
  );
}
