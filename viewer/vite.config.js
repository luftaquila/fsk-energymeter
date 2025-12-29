import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => {
  const single = mode === "single";

  return {
    base: '/energymeter/',
    plugins: [
      vue(),
      single && viteSingleFile(),
    ],
    server: {
      port: 5174
    },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  };
})

