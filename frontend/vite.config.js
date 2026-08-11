import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main:     resolve(__dirname, 'index.html'),
        admin:    resolve(__dirname, 'admin.html'),
        merchant: resolve(__dirname, 'merchant.html'),
        apidocs:  resolve(__dirname, 'api-docs.html'),
      },
    },
    outDir: 'dist',
  },
})
