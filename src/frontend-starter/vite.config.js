import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // 监听所有网卡，方便同一局域网内的同学/手机访问你的开发页面
    host: true,
  },
})
