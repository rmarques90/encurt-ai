import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000'
const shortCodeProxy = '^/(?!$|login$|register$|dashboard$|admin$|403$|404$|500$)[A-Za-z0-9_-]{6,12}$'

export default defineConfig({
  plugins: [vue()],
  server: { proxy: { '/api': { target: apiTarget }, [shortCodeProxy]: { target: apiTarget } } },
  test: { environment: 'jsdom' },
})
