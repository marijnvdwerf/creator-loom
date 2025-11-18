import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  plugins: [
    devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    nitro({
      serverDir: '.',
      scheduledTasks: {
        // Sync creators every hour in November
        '0 * * 11 *': ['sync:creators'],
        // Sync VODs during event hours (1 PM to 1 AM CET)
        '0 13-23,0-1 * 11 *': ['sync:vods'],
        // Sync clips every 5 minutes during event hours
        '3,8,13,18,23,28,33,38,43,48,53,58 13-23,0-1 * 11-12 *': ['sync:clips']
      },
      experimental: {
        tasks: true,
        vite: {
          serverReload: true
        }
      }
    }),
  ],
})

export default config
