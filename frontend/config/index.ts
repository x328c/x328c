import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import { resolve } from 'path'
import legalManifest from '../../backend/src/auth/legal-documents.manifest.json'

import devConfig from './dev'
import prodConfig from './prod'

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'vite'>(async (merge) => {
  const tabVariant = process.env.TARO_APP_TAB_VARIANT === '5' ? '5' : '4'
  const baseConfig: UserConfigExport<'vite'> = {
    projectName: 'modazi-miniapp',
    date: '2026-7-12',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    alias: {
      '@': resolve(__dirname, '..', 'src'),
    },
    plugins: [
      "@tarojs/plugin-generator"
    ],
    defineConstants: {
      __MESSAGE_TAB_INDEX__: JSON.stringify(tabVariant === '5' ? 3 : 2),
      __TAB_VARIANT__: JSON.stringify(tabVariant),
      // 前后端从同一清单读取，避免文档更新后登录请求摘要不一致。
      __LEGAL_BUNDLE_VERSION__: JSON.stringify(legalManifest.bundleVersion),
      __USER_AGREEMENT_HASH__: JSON.stringify(legalManifest.userAgreementHash),
      __PRIVACY_POLICY_HASH__: JSON.stringify(legalManifest.privacyPolicyHash),
      __SAFETY_NOTICE_HASH__: JSON.stringify(legalManifest.safetyNoticeHash),
      __RIDE_REMINDER_TEMPLATE_ID__: JSON.stringify(
        process.env.TARO_APP_RIDE_REMINDER_TEMPLATE_ID ?? '',
      ),
    },
    copy: {
      patterns: [
      ],
      options: {
      }
    },
    framework: 'react',
    compiler: 'vite',
    mini: {
      // Taro 4.2 的开发模式 React 别名会误匹配 Zustand 5 的
      // `zustand/react`，导致产物调用不存在的 React.create。启用调试版
      // React 可跳过该别名；production mode 仍会使用生产版 React。
      debugReact: true,
      // Taro 4.2 的 Vite 4 runner 仍调用 Dart Sass legacy JS API，且当前
      // runner 没有 modern API 切换项。仅静默该上游弃用提示，其他 Sass
      // 弃用（例如业务代码中的 @import）继续正常报告。
      sassLoaderOption: {
        silenceDeprecations: ['legacy-js-api'],
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {

          }
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',

      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        }
      }
    }
  }


  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig)
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig)
})
