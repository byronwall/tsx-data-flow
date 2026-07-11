import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import solid from "eslint-plugin-solid";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "examples/bad-ish-solid/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...solid.configs["flat/typescript"],
    files: ["src/frontend/src/**/*.{ts,tsx}"],
  },
  {
    files: ["**/*.{js,mjs,ts,tsx,mts}"],
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImports,
    },
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        document: "readonly",
        window: "readonly",
        HTMLElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLInputElement: "readonly",
        MouseEvent: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      // Static-analysis classifiers are intentionally branch-heavy. Keep a
      // ceiling that catches accidental runaway growth without rejecting the
      // domain decision tables already covered by focused tests.
      complexity: ["error", 80],
      "import/first": "error",
      "max-lines": ["error", { max: 600, skipBlankLines: true, skipComments: true }],
      "unused-imports/no-unused-imports": "error",
      "no-unassigned-vars": "off",
      "no-useless-assignment": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSImportType",
          message: "Use a type-only import declaration at the top of the file instead of an inline import type.",
        },
        {
          selector: "ImportExpression",
          message: "Use an import declaration at the top of the file instead of a dynamic import.",
        },
        {
          selector: "ImportDeclaration[source.value=/^\\..*\\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/]",
          message: "Use extensionless local import specifiers; the server bundler resolves source files.",
        },
        {
          selector: "ExportNamedDeclaration[source]",
          message: "Import directly from the defining module instead of re-exporting through an intermediary.",
        },
        {
          selector: "ExportAllDeclaration",
          message: "Import directly from the defining module instead of creating a barrel export.",
        },
        {
          selector: "ExportNamedDeclaration[declaration=null]",
          message: "Export declarations where symbols are defined; do not forward imported symbols through another module.",
        },
      ],
    },
  },
  {
    files: ["**/*.d.mts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["src/frontend/src/**/*.{ts,tsx}"],
    rules: {
      "solid/no-innerhtml": "error",
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["../../types", "../../types/*", "../../analysis/*", "../../server/*", "../../html/*"], message: "Frontend code may consume validated transport DTOs, not analyzer, server, or HTML modules." },
        ],
      }],
    },
  },
);
