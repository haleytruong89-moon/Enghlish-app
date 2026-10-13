import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // DESIGN §0 rule 2: no track branching in business logic.
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator=/^(===|==|!==|!=)$/] > Literal[value=/^(A|B)$/]",
          message: "Track = configuration. Do not branch on track id (DESIGN §0 rule 2).",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**"]),
]);
