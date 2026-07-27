import type { BadgeProps } from "@shopify/polaris";

export function getProductBadgeTone(label: string): BadgeProps["tone"] {
  switch (label.trim().toLowerCase()) {
    case "goods":
    case "for sale":
      return "success";
    case "service":
    case "rov":
    case "main equipment":
      return "info";
    case "operations":
    case "component":
      return "warning";
    case "serialized":
      return "attention";
    default:
      return undefined;
  }
}

export function getCategoryBadgeTone(): BadgeProps["tone"] {
  return "info";
}
