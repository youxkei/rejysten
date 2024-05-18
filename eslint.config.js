// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importlint from "eslint-plugin-import";
import noRelativeImportPaths from "eslint-plugin-no-relative-import-paths";
import unusedImports from "eslint-plugin-unused-imports";

export default tseslint.config({
  ignores: ["**/poc/**/*.{ts,tsx}"],
  plugins: {
    "@typescript-eslint": tseslint.plugin,
    import: importlint,
    "no-relative-import-paths": noRelativeImportPaths,
    "unused-imports": unusedImports,
  },
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      project: true,
    },
  },
  extends: [eslint.configs.recommended, ...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylistic],
  rules: {
    "@typescript-eslint/restrict-template-expressions": "off",
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/consistent-type-exports": "error",
    "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        checksVoidReturn: false,
      },
    ],
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "prefer-const": [
      "error",
      {
        ignoreReadBeforeAssign: true,
      },
    ],
    "import/order": [
      "error",
      {
        groups: ["type", "external", "internal"],
        "newlines-between": "always",
        alphabetize: {
          order: "asc",
        },
      },
    ],
    "import/no-duplicates": "error",
    "no-relative-import-paths/no-relative-import-paths": [
      "error",
      {
        allowSameFolder: false,
        rootDir: "src",
        prefix: "@",
      },
    ],
    "unused-imports/no-unused-imports": "error",
  },
});
