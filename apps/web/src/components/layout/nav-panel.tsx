"use client";

import { Icon } from "@shopify/polaris";
import Link from "next/link";
import type { ReactNode } from "react";
import { pageIconFor } from "@/lib/nav-icons";
import { cn } from "@/lib/utils";

export interface NavPanelItem {
  label: string;
  href?: string;
  badge?: string;
  disabled?: boolean;
  active?: boolean;
}

export interface NavPanelGroup {
  title?: string;
  items: NavPanelItem[];
}

interface NavPanelProps {
  title: string;
  subtitle?: string;
  groups: NavPanelGroup[];
  footer?: ReactNode;
}

/** Secondary sidebar column: section title + its pages, each with an icon. */
export function NavPanel({ title, subtitle, groups, footer }: NavPanelProps) {
  return (
    <div className="nav-panel">
      <div className="nav-panel__head">
        <p className="nav-panel__title">{title}</p>
        {subtitle ? <p className="nav-panel__sub">{subtitle}</p> : null}
      </div>

      <nav className="nav-panel__scroll" aria-label={`${title} navigation`}>
        {groups.map((group, index) =>
          group.items.length ? (
            <div className="nav-panel__group" key={group.title ?? index}>
              {group.title ? <p className="nav-panel__group-title">{group.title}</p> : null}
              {group.items.map((item) => {
                const content = (
                  <>
                    <span className="nav-panel__icon">
                      <Icon source={pageIconFor(item.href)} />
                    </span>
                    <span className="nav-panel__label">{item.label}</span>
                    {item.badge ? <span className="nav-panel__badge">{item.badge}</span> : null}
                  </>
                );

                if (item.disabled || !item.href) {
                  return (
                    <span
                      key={item.label}
                      className="nav-panel__link is-disabled"
                      aria-disabled="true"
                    >
                      {content}
                    </span>
                  );
                }

                return (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    className={cn("nav-panel__link", item.active && "is-active")}
                    aria-current={item.active ? "page" : undefined}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          ) : null,
        )}
      </nav>

      {footer ? <div className="nav-panel__footer">{footer}</div> : null}
    </div>
  );
}
