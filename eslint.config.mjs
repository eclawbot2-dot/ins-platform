import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat ESLint config (ESLint 9). `npm run lint` was a silent no-op before
 * this file existed — ESLint 9 refuses to run without eslint.config.*.
 */
export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Hydration-time localStorage → setState sync (view-toggle, nav
      // customization, toast, sortable) is an accepted client pattern in this
      // codebase; the react-hooks v6 rule flags it as an error. Keep it
      // visible as a warning rather than rewriting six stable components.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);
