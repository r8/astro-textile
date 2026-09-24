import { defineConfig } from "tsdown";

export default defineConfig({
  dts: {
    generator: "tsc",
  },
  exports: true,
  // ...config options
});
