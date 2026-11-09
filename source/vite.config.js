import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { loadEnv } from 'vite'

function runtimeConfigPlugin(env) {
  return {
    name: 'cfsm-runtime-config',
    transformIndexHtml(html) {
      const apiBase = (env.API_BASE || '').trim()
      const title = (env.TITLE || '').trim()
      const backgroundImage = (env.BACKGROUND_IMAGE || '').trim()

      if (title) {
        html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
      }
      if (apiBase) {
        const origins = apiBase.split(',').map((item) => item.trim()).filter(Boolean).join(',')
        html = html.replace(
          '</head>',
          `  <meta name="apiBase" content="${escapeHtml(origins)}" />\n  </head>`
        )
      }
      if (backgroundImage) {
        html = html.replace(
          '</head>',
          `  <style>:root{--user-background-image:url("${escapeHtml(backgroundImage)}")}</style>\n  </head>`
        )
      }
      return html
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue(), runtimeConfigPlugin(env)],
    base: './',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8787',
          changeOrigin: true,
          ws: true
        },
        '/flags': {
          target: env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8787',
          changeOrigin: true
        },
        '/os-icons': {
          target: env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8787',
          changeOrigin: true
        }
      }
    }
  }
})
