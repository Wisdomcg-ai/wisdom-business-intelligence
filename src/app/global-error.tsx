"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    import("@sentry/nextjs")
      .then((Sentry) => Sentry.captureException(error))
      .catch(() => console.error("GlobalError:", error));
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: "40px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ color: "#172238" }}>Something went wrong</h2>
          <p style={{ color: "#6b7280" }}>An unexpected error occurred. Our team has been notified.</p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: "16px",
              padding: "10px 24px",
              background: "#F5821F",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
