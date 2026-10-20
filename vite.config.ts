import { defineConfig } from 'vite'

// base './'：产出相对路径，IGA Pages 静态托管可直接使用
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist'
  }
})
