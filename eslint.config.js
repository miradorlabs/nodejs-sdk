import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: ["dist/**", "node_modules/**", "*.config.{js,mjs}", "rollup.config.mjs"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    ...js.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
    rules: {
      ...(config.rules || {}),
      "react-refresh/only-export-components": "off",
    },
  })),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
  },
];
