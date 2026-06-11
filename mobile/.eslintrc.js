module.exports = {
  extends: ['expo'],
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        // Allows `const { omitted: _x, ...rest } = obj` omit-via-rest patterns.
        ignoreRestSiblings: true,
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: ['node_modules/', 'dist/', '.expo/', 'src/__mocks__/'],
};
