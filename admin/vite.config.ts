import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'antd-data-entry',
              test: /node_modules[\\/]antd[\\/]es[\\/](?:cascader|date-picker|form|image|input|input-number|mentions|pagination|select|table|tabs|transfer|tree|upload)[\\/]/,
              includeDependenciesRecursively: false,
              priority: 40,
            },
            {
              name: 'antd-vendor',
              test: /node_modules[\\/]antd[\\/]/,
              includeDependenciesRecursively: false,
              priority: 30,
            },
            {
              name: 'ant-design-vendor',
              test: /node_modules[\\/]@ant-design[\\/]/,
              includeDependenciesRecursively: false,
              priority: 20,
            },
            {
              name: 'rc-vendor',
              test: /node_modules[\\/](?:rc-|@rc-component[\\/])/,
              includeDependenciesRecursively: false,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
