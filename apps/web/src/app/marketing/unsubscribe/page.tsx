"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { submitUnsubscribe } from "@/lib/email-marketing-api";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const isPreview = searchParams.get("preview") === "true";

  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnsubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Invalid or missing unsubscribe token.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await submitUnsubscribe(token, reason || undefined);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Failed to process unsubscribe request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f4f7f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          padding: "36px 32px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
          border: "1px solid #e2e8f0",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "56px",
            height: "56px",
            borderRadius: "12px",
            background: submitted ? "#ecfdf5" : "#f1f5f9",
            color: submitted ? "#047857" : "#475569",
            fontSize: "24px",
            marginBottom: "16px",
          }}
        >
          {submitted ? "✓" : "✉"}
        </div>

        <h1
          style={{
            fontSize: "22px",
            fontWeight: "700",
            color: "#0f172a",
            margin: "0 0 10px",
          }}
        >
          {submitted ? "Unsubscribed Successfully" : "Email Preferences"}
        </h1>

        {submitted ? (
          <div>
            <p style={{ color: "#64748b", fontSize: "15px", lineHeight: "1.6" }}>
              You have been unsubscribed from our marketing mailing list. You will no longer receive broadcast emails from us.
            </p>
          </div>
        ) : isPreview ? (
          <div>
            <p style={{ color: "#64748b", fontSize: "15px", lineHeight: "1.6" }}>
              This is a preview of the unsubscribe page that recipients see when opting out.
            </p>
          </div>
        ) : !token ? (
          <div>
            <p style={{ color: "#dc2626", fontSize: "15px" }}>
              Invalid or missing token link.
            </p>
          </div>
        ) : (
          <form onSubmit={handleUnsubscribe} style={{ textAlign: "left", marginTop: "20px" }}>
            <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.6", marginBottom: "16px" }}>
              We're sorry to see you go. Would you mind telling us why you wish to opt out?
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "#334155",
                  marginBottom: "6px",
                }}
              >
                Reason (optional):
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                  backgroundColor: "#ffffff",
                  outline: "none",
                }}
              >
                <option value="">Select a reason...</option>
                <option value="Too many emails">Too many emails</option>
                <option value="No longer relevant">Content is no longer relevant</option>
                <option value="Never signed up">I didn't sign up for this</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  backgroundColor: "#fef2f2",
                  color: "#991b1b",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                backgroundColor: "#dc2626",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: "600",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Processing..." : "Unsubscribe from Marketing"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>}>
      <UnsubscribeContent />
    </Suspense>
  );
}
