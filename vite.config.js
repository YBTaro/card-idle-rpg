import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    // 前後端分離：/api 代理到本機遊戲伺服器（npm run server 啟動，port 8787）
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    setupFiles: ['src/test/setup.js'],
  },
});
