import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * 构建产物默认落在 dist/，由 Makefile 拷进 Go 的静态资源目录后一起编进二进制。
 * 开发态把 /api 与静态资源代理到本地 Go 服务（默认 127.0.0.1:80），
 * 端口可以用 PMAIL_API 覆盖，例如 PMAIL_API=http://127.0.0.1:8080 pnpm dev
 */
const apiTarget = process.env.PMAIL_API || 'http://127.0.0.1:80'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    watch: {
      // 编辑器/工具做原子写入时会在 src/ 下建临时目录，watcher 抢锁会直接 EBUSY 崩掉
      ignored: ['**/.*.tmpdir/**', '**/.*.tmp', '**/node_modules/**'],
    },
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, secure: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
})
