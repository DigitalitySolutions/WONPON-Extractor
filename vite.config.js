import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Replace YOUR_REPO_NAME with your actual GitHub repository name, e.g. "wonpon-extractor"
export default defineConfig({
  plugins: [react()],
  base: "/wonpon-extractor/",
});
