module.exports = {
  parser: '@typescript-eslint/parser',
  extends: ['plugin:prettier/recommended', 'eslint:recommended'],
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  env: {
    es6: true,
    node: true
  },
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    'no-unused-vars': 'off'
  }
}
