"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-shell__panel">
        <div className="auth-shell__story">
          <div className="auth-shell__company-logo-wrap">
            <img className="auth-shell__company-logo" alt="Frogmen Technologies" src="/brand/frogmen-logo.png" />
          </div>
          <span className="auth-shell__eyebrow"><Sparkles size={14} /> Business operations, connected</span>
          <h1>Run every branch from one secure workspace.</h1>
          <p>Sales, finance, inventory, purchasing, warranties, and field operations with branch-level control.</p>
        </div>
        <div className="auth-shell__form">
          <div className="auth-shell__mobile-brand"><img alt="Frogmen Technologies" src="/brand/frogmen-logo.png" /></div>
          {children}
          <p className="auth-shell__legal">Secure access to Frogmen Technologies · Protected authentication</p>
        </div>
      </div>
    </div>
  );
}
