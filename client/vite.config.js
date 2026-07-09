import { defineConfig, loadEnv, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";

const jsAsJsx = () => ({
  name: "ppm-js-as-jsx",
  async transform(code, id) {
    if (!/src[/\\].*\.js$/.test(id)) {
      return null;
    }

    return transformWithEsbuild(code, id, {
      loader: "jsx",
      jsx: "automatic",
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      jsAsJsx(),
      react({
        include: /\.(js|jsx|ts|tsx)$/,
      }),
    ],
    esbuild: {
      loader: "jsx",
      include: /src[/\\].*\.jsx?$/,
    },
    build: {
      outDir: "build",
    },
    server: {
      proxy: {
        "/api": {
          target:
            env.VITE_API_PROXY_TARGET ||
            env.REACT_APP_API_PROXY_TARGET ||
            "http://localhost:5000",
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          ".js": "jsx",
        },
      },
    },
    define: {
      "process.env.REACT_APP_API_BASE_URL": JSON.stringify(
        env.REACT_APP_API_BASE_URL || env.VITE_API_BASE_URL || ""
      ),
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.js",
    },
  };
});
