import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [...nextVitals, ...nextTypescript];

config.push({
  files: ["**/*.ts", "**/*.tsx"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
  },
});

export default config;
