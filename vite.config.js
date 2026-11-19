import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Keep stable libraries cacheable, and merge tiny shared chunks rather
        // than issuing a separate request for every shared icon/helper.
        codeSplitting: {
          minSize: 20000,
          groups: [
            { name: 'framework', test: /node_modules[\\/](?:react|react-dom|scheduler|react-router|react-router-dom)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/ },
            { name: 'shared-pages', minSize: 0, includeDependenciesRecursively: false, test: /src[\\/](?:layout[\\/]|components[\\/](?:Modal|Navbar|Sidebar)[\\/]|hooks[\\/]useEvents|utils[\\/]dashboardData|assets[\\/])/ },
          ],
        },
      },
    },
  },
})
