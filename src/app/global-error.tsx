"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          fontFamily: "system-ui, sans-serif",
        }}>
          <div style={{
            maxWidth: "28rem",
            textAlign: "center",
          }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#666", marginBottom: "1rem", fontSize: "0.875rem" }}>
              An unexpected error occurred. The error has been reported.
            </p>
            <button
              onClick={() => reset()}
              style={{
                padding: "0.5rem 1.5rem",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
