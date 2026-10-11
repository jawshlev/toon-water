import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // basicSsl: self-signed HTTPS, because WebGPU (and the clipboard) only work on secure pages.
  // host: true: also listen on the LAN address so a phone on the same Wi-Fi can open it.
  plugins: [react(), basicSsl()],
  server: { host: true },
})
