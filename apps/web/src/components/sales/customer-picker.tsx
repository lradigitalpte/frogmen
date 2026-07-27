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
import { useCallback, useEffect, useState } from "react";
import { listCustomers } from "@/lib/customers-api";
import type { Customer } from "@/types/customer";
import { CustomerAvatar } from "@/components/customers/customer-avatar";

interface CustomerPickerProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  disabled?: boolean;
  error?: string;
  label?: string;
  allowClear?: boolean;
}

export function CustomerPicker({
  value,
  onChange,
  disabled,
  error,
  label = "Customer",
  allowClear = false,
}: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);

    try {
      const result = await listCustomers({
        search: debouncedQuery || undefined,
        perPage: 25,
        sortBy: "name",
        sortDir: "asc",
      });
      setCustomers(result.data);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    if (!open) return;
    void loadCustomers();
  }, [open, loadCustomers]);

  const pickerBody = (
    <Box padding="300" minWidth="360px">
      <BlockStack gap="300">
        {loading ? (
          <Text as="p" tone="subdued">
            Loading customers…
          </Text>
        ) : customers.length === 0 ? (
          <div className="quotation-picker-empty">
            <Text as="p" tone="subdued">
              No customers match your search.
            </Text>
          </div>
        ) : (
          <Listbox
            onSelect={(customerId) => {
              const customer = customers.find((item) => item.id === customerId);
              if (!customer) return;
              onChange(customer);
              setOpen(false);
              setQuery("");
            }}
          >
            {customers.map((customer) => (
              <Listbox.Option
                key={customer.id}
                selected={customer.id === value?.id}
                value={customer.id}
              >
                <InlineStack gap="300" blockAlign="center">
                  <CustomerAvatar
                    avatarPath={customer.avatarPath}
                    name={customer.name}
                    size="md"
                  />
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {customer.name}
                      </Text>
                      <Badge
                        tone={customer.accountType === "company" ? "info" : "success"}
                      >
                        {customer.accountType === "company" ? "Company" : "Individual"}
                      </Badge>
                    </InlineStack>
                    {customer.email ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        {customer.email}
                      </Text>
                    ) : null}
                  </BlockStack>
                </InlineStack>
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
        <TextField
          autoComplete="off"
          disabled
          label={label}
          value={value.name}
        />

        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
            <InlineStack gap="400" blockAlign="center" wrap={false}>
              <CustomerAvatar
                avatarPath={value.avatarPath}
                name={value.name}
                size="lg"
              />
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p" variant="headingMd">
                    {value.name}
                  </Text>
                  <Badge tone={value.accountType === "company" ? "info" : "success"}>
                    {value.accountType === "company" ? "Company" : "Individual"}
                  </Badge>
                </InlineStack>
                {value.email ? (
                  <Text as="p" tone="subdued">
                    {value.email}
                  </Text>
                ) : null}
              </BlockStack>
            </InlineStack>

            {!disabled ? (
              <InlineStack gap="200">
                {allowClear ? (
                  <Button
                    onClick={() => onChange(null)}
                    variant="plain"
                    tone="critical"
                  >
                    Remove
                  </Button>
                ) : null}
                <Popover
                activator={
                  <Button onClick={() => setOpen(true)} variant="plain">
                    Change
                  </Button>
                }
                autofocusTarget="first-node"
                fullWidth
                onClose={() => {
                  setOpen(false);
                  setQuery("");
                }}
                preferredAlignment="right"
                active={open}
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
              </InlineStack>
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
          label={label}
          onChange={(next) => {
            setQuery(next);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search customers by name or email…"
          prefix={<Icon source={SearchIcon} />}
          value={open ? query : ""}
        />
      }
      autofocusTarget="none"
      fullWidth
      onClose={() => {
        setOpen(false);
        setQuery("");
      }}
      preferredAlignment="left"
      active={open && !disabled}
    >
      {pickerBody}
    </Popover>
  );
}
