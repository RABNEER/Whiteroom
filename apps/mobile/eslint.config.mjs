import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".expo/**", "dist/**", "babel.config.js", "metro.config.js"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
