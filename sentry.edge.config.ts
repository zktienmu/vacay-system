import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Performance monitoring: sample 10% of transactions in production
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    environment: process.env.NODE_ENV,
  });
}
