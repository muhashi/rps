import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/rps/', // https://vitejs.dev/guide/static-deploy.html#github-pages
  plugins: [react()],
});
