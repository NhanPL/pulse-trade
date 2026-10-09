import { initializeFrontendErrorReporting } from "./lib/observability/browser-error-reporting";

// Next runs this before hydration, including when the root layout fails to render.
initializeFrontendErrorReporting();
