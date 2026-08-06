// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'drizzle/**', 'data/**', '.claude/worktrees/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['src/client/**', 'tests/component/**'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/server/**', 'tests/unit/**', 'tests/integration/**', '*.config.ts', '*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
);
