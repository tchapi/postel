import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DEV_')

  return {
    plugins: [react()],
    server: {
      // mail.localtest.me resolves to 127.0.0.1, for a nicer address in screenshots
      allowedHosts: ['.localtest.me'],
      // The Symfony app, started with `symfony serve` or `php -S` from backend/.
      // There is no Authelia in front of it here, so the proxy plays its part
      // and asserts the identity itself.
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          headers: {
            'Remote-User': env.DEV_USER ?? 'alice',
            'Remote-Email': env.DEV_EMAIL ?? 'alice@example.test',
            'Remote-Name': env.DEV_NAME ?? 'Alice',
          },
        },
      },
    },
  }
})
