"use client";

import { Text } from "@shopify/polaris";

interface QuotationStepIndicatorProps {
  currentStep: 1 | 2;
}

const steps = [
  { number: 1, label: "Details" },
  { number: 2, label: "Products" },
] as const;

export function QuotationStepIndicator({
  currentStep,
}: QuotationStepIndicatorProps) {
  return (
    <nav aria-label="Quotation progress" className="quotation-steps">
      {steps.map((step, index) => {
        const isComplete = step.number < currentStep;
        const isCurrent = step.number === currentStep;

        return (
          <div className="quotation-steps__item" key={step.number}>
            <div
              className={[
                "quotation-steps__marker",
                isComplete ? "quotation-steps__marker--complete" : "",
                isCurrent ? "quotation-steps__marker--current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isComplete ? "✓" : step.number}
            </div>
            <Text
              as="span"
              fontWeight={isCurrent ? "semibold" : "regular"}
              tone={isCurrent ? undefined : "subdued"}
              variant="bodySm"
            >
              {step.label}
            </Text>
            {index < steps.length - 1 ? (
              <div
                className={[
                  "quotation-steps__connector",
                  isComplete ? "quotation-steps__connector--complete" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
