"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import { rovNavGroups } from "@/lib/rov-navigation";

export function RovNav() {
  const pathname = usePathname();

  return (
    <aside className="dashboard-nav">
      <Link className="dashboard-nav-brand" href="/dashboard">
        <img
          alt="Frogmen Technologies"
          className="dashboard-nav-brand__logo"
          src={BRAND_LOGO_SRC}
        />
      </Link>

      <div className="dashboard-nav-scroll">
        <div className="settings-nav">
          <div className="settings-nav__intro">
            <p className="settings-nav__title">ROV Inspection</p>
            <p className="settings-nav__sub">Underwater & visual inspections</p>
          </div>

          {rovNavGroups.map((group) => (
            <div key={group.title} className="settings-nav__group">
              <p className="settings-nav__group-title">{group.title}</p>
              <div className="settings-nav__items">
                {group.items.map((item) => {
                  const active = item.href
                    ? item.href === "/dashboard/rov"
                      ? pathname === item.href
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)
                    : false;

                  if (item.disabled || !item.href) {
                    return (
                      <div
                        key={item.label}
                        className="settings-nav__link settings-nav__link--disabled"
                      >
                        <span>{item.label}</span>
                        {item.badge ? (
                          <span className="settings-nav__badge">{item.badge}</span>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      className={`settings-nav__link${active ? " active" : ""}`}
                      href={item.href}
                    >
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-nav-footer">
        <Link className="dashboard-nav-footer__link" href="/dashboard">
          <span>← Back to app</span>
        </Link>
      </div>
    </aside>
  );
}
