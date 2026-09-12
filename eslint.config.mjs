import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const configs = nextVitals.map(cfg => {
  if (cfg.plugins && cfg.plugins['react-hooks']) {
    return {
      ...cfg,
      rules: {
        ...cfg.rules,
        'react-hooks/set-state-in-effect': 'warn',
        'react-hooks/immutability': 'warn',
        'react-hooks/purity': 'warn',
      }
    };
  }
  return cfg;
});

const eslintConfig = defineConfig([
  ...configs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
