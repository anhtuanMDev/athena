import "dotenv/config";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "spa-fallback",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url && req.url.startsWith("/.well-known/")) {
            _res.statusCode = 404;
            _res.end();
            return;
          }
          next();
        });
      },
    },
    tailwindcss(),
    reactRouter(),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:8788",
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
