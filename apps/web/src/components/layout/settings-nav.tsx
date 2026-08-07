"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import { getCompanySettings } from "@/lib/settings-api";
import { settingsNavGroups } from "@/lib/settings-navigation";
import { getMe } from "@/lib/security-api";

export function SettingsNav() {
  const pathname = usePathname();
  const [companyName, setCompanyName] = useState("Organization");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    getCompanySettings()
      .then((company) => {
        if (company.name?.trim()) {
          setCompanyName(company.name.trim());
        }
      })
      .catch(() => {
        // Keep defaults
      });
  }, []);

  useEffect(() => {
    getMe()
      .then((result) => {
        setPermissions(result.security?.permissions ?? []);
        setIsPlatformAdmin(Boolean(result.isPlatformAdmin));
      })
      .catch(() => {
        setPermissions([]);
        setIsPlatformAdmin(false);
      });
  }, []);

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
            <p className="settings-nav__title">Settings</p>
            <p className="settings-nav__sub">{companyName}</p>
          </div>

          {settingsNavGroups.map((group) => (
            <div key={group.title} className="settings-nav__group">
              <p className="settings-nav__group-title">{group.title}</p>
              <div className="settings-nav__items">
                {group.items.map((item) => {
                  if (item.platformAdmin && !isPlatformAdmin) {
                    return null;
                  }
                  if (
                    item.permission &&
                    !permissions.includes(item.permission)
                  ) {
                    return null;
                  }
                  const active = item.href
                    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
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
