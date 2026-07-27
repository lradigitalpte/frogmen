"use client";

import Link from "next/link";
import type { LinkLikeComponent } from "@shopify/polaris/build/ts/src/utilities/link/types";

export const PolarisNextLink: LinkLikeComponent = ({
  children,
  url,
  external,
  target,
  ...rest
}) => {
  if (external) {
    return (
      <a href={url} target={target ?? "_blank"} rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }

  return (
    <Link href={url || "#"} {...rest}>
      {children}
    </Link>
  );
};
