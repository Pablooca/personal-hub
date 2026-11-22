import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Public base path. '/' for local dev, Vercel and Cloudflare Pages;
 * '/<repo>/' for a GitHub Pages project site (set VITE_BASE_PATH in the workflow).
 */
function basePath(): string {
  const raw = (process.env.VITE_BASE_PATH ?? '/').trim() || '/'
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
}

export default defineConfig({
  base: basePath(),
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\\/]@supabase/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
