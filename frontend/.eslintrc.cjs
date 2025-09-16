/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["react", "@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  settings: {
    react: { version: "detect" },
  },
  env: {
    browser: true,
    es2021: true,
  },
  rules: {
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "no-debugger": "warn",
    "react/react-in-jsx-scope": "off",
  },
  ignorePatterns: ["dist/", "node_modules/"],
};
