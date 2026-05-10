import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 外网访问时使用cloudflare tunnel URL，本地开发使用localhost
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:3001';

// 允许的外部访问域名
const allowedHosts = process.env.VITE_ALLOWED_HOSTS
  ? process.env.VITE_ALLOWED_HOSTS.split(',')
  : [
      'localhost',
      '100.117.153.249',
      '.trycloudflare.com', // 允许所有cloudflare tunnel域名
    ];

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: false, // 保留 enhance.js / dark-patch.css 等手写文件
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
