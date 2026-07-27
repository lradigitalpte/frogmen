"use client";

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Icon,
  InlineStack,
  Listbox,
  Popover,
  Text,
  TextField,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { listVendors } from "@/lib/vendors-api";
import type { Vendor } from "@/types/vendor";

interface VendorPickerProps {
  value: Vendor | null;
  onChange: (vendor: Vendor | null) => void;
  disabled?: boolean;
  error?: string;
}

export function VendorPicker({
  value,
  onChange,
  disabled,
  error,
}: VendorPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listVendors({
        search: debouncedQuery || undefined,
        perPage: 25,
        sortBy: "name",
      });
      setVendors(result.data);
    } catch {
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    if (!open) return;
    void loadVendors();
  }, [open, loadVendors]);

  const pickerBody = (
    <Box padding="300" minWidth="360px">
      <BlockStack gap="300">
        {loading ? (
          <Text as="p" tone="subdued">
            Loading vendors…
          </Text>
        ) : vendors.length === 0 ? (
          <div className="quotation-picker-empty">
            <BlockStack gap="200">
              <Text as="p" tone="subdued">
                No vendors match your search.
              </Text>
              <Link href="/dashboard/purchasing/vendors/new">
                <Button variant="plain">+ Add new vendor</Button>
              </Link>
            </BlockStack>
          </div>
        ) : (
          <Listbox
            onSelect={(vendorId) => {
              const vendor = vendors.find((item) => item.id === vendorId);
              if (!vendor) return;
              onChange(vendor);
              setOpen(false);
              setQuery("");
            }}
          >
            {vendors.map((vendor) => (
              <Listbox.Option
                key={vendor.id}
                selected={vendor.id === value?.id}
                value={vendor.id}
              >
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" fontWeight="semibold">
                      {vendor.name}
                    </Text>
                    <Badge
                      tone={vendor.accountType === "company" ? "info" : "success"}
                    >
                      {vendor.accountType === "company" ? "Company" : "Individual"}
                    </Badge>
                  </InlineStack>
                  {vendor.email || vendor.contactName ? (
                    <Text as="span" tone="subdued" variant="bodySm">
                      {vendor.contactName
                        ? `${vendor.contactName}${vendor.email ? ` · ${vendor.email}` : ""}`
                        : vendor.email}
                    </Text>
                  ) : null}
                </BlockStack>
              </Listbox.Option>
            ))}
          </Listbox>
        )}
      </BlockStack>
    </Box>
  );

  if (value) {
    return (
      <BlockStack gap="300">
        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="headingMd">
                  {value.name}
                </Text>
                <Badge tone={value.accountType === "company" ? "info" : "success"}>
                  {value.accountType === "company" ? "Company" : "Individual"}
                </Badge>
              </InlineStack>
              {value.contactName ? (
                <Text as="p" tone="subdued">
                  {value.contactName}
                </Text>
              ) : null}
              {value.email ? (
                <Text as="p" tone="subdued">
                  {value.email}
                </Text>
              ) : null}
            </BlockStack>

            {!disabled ? (
              <Popover
                activator={
                  <Button onClick={() => setOpen(true)} variant="plain">
                    Change
                  </Button>
                }
                active={open}
                autofocusTarget="first-node"
                fullWidth
                preferredAlignment="right"
                onClose={() => {
                  setOpen(false);
                  setQuery("");
                }}
              >
                <Box padding="300">
                  <BlockStack gap="300">
                    <TextField
                      autoComplete="off"
                      autoFocus
                      label="Search"
                      labelHidden
                      onChange={setQuery}
                      placeholder="Search by name or email…"
                      prefix={<Icon source={SearchIcon} />}
                      value={query}
                    />
                    {pickerBody}
                  </BlockStack>
                </Box>
              </Popover>
            ) : null}
          </InlineStack>
        </Card>

        {error ? (
          <Text as="p" tone="critical" variant="bodySm">
            {error}
          </Text>
        ) : null}
      </BlockStack>
    );
  }

  return (
    <Popover
      activator={
        <TextField
          autoComplete="off"
          disabled={disabled}
          error={error}
          label="Vendor"
          onChange={(next) => {
            setQuery(next);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search vendors by name or email…"
          prefix={<Icon source={SearchIcon} />}
          value={open ? query : ""}
        />
      }
      active={open && !disabled}
      autofocusTarget="none"
      fullWidth
      preferredAlignment="left"
      onClose={() => {
        setOpen(false);
        setQuery("");
      }}
    >
      {pickerBody}
    </Popover>
  );
}
