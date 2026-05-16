import eslint from '@eslint/js';

export default [
  {
    ignores: ['**/.next/**', '**/dist/**', '**/node_modules/**']
  },
  eslint.configs.recommended,
  {
    rules: {
      'no-unused-vars': 'off'
    }
  }
];
