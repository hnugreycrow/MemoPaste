import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import vueTs from "@vue/eslint-config-typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "release/**",
      "node_modules/**",
      "database/**",
      "auto-imports.d.ts",
      "components.d.ts",
    ],
  },
  js.configs.recommended,
  ...pluginVue.configs["flat/essential"],
  ...vueTs(),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-unused-vars": "off",
      "vue/multi-word-component-names": "off",
    },
  },
  eslintConfigPrettier,
);
