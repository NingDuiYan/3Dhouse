import tseslint from 'typescript-eslint'

export default tseslint.config(
  // 截图与构建临时产物不属于源码（浏览器 profile 里混着扩展 JS，会把 lint 淹掉）
  { ignores: ['dist/', 'node_modules/', '.screenshots/', '.tmp/', '.npm-cache/'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
)
