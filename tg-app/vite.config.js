import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev proxy → local backend. In production the FastAPI app serves /tg static
// and the API on the same origin, so BASE = '' and no proxy is needed.
const proxy = {}
for (const p of [
  '/auth', '/cards', '/rewards', '/transactions', '/notifications',
  '/announcements', '/discover', '/gamification', '/contests', '/games', '/push',
]) {
  proxy[p] = { target: 'http://localhost:8181', changeOrigin: true }
}

export default defineConfig({
  plugins: [react()],
  base: '/tg/',
  build: { outDir: 'dist' },
  server: { port: 5174, proxy },
})
