import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const featuresDir = path.join(__dirname, 'src', 'features');

const featureNames = fs.existsSync(featuresDir)
  ? fs
      .readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];

/**
 * Lightweight built-in JSX variable tracker for React 19 automatic runtime,
 * avoiding heavy legacy eslint-plugin-react dependencies.
 */
const jsxUsesVarsPlugin = {
  rules: {
    'jsx-uses-vars': {
      create(context) {
        return {
          JSXOpeningElement(node) {
            let target = node.name;
            if (target.type === 'JSXNamespacedName') return;
            while (target.type === 'JSXMemberExpression') {
              target = target.object;
            }
            if (target.type === 'JSXIdentifier') {
              context.sourceCode.markVariableAsUsed(target.name, node);
            }
          },
        };
      },
    },
  },
};

/**
 * Generate per-feature boundary rules so `src/features/<A>` can never import `src/features/<B>`.
 */
const featureIsolationConfigs = featureNames.map((featureName) => {
  const otherFeatures = featureNames.filter((name) => name !== featureName);
  const crossFeaturePatterns = otherFeatures.flatMap((other) => [
    `@features/${other}`,
    `@features/${other}/**`,
    `@/features/${other}`,
    `@/features/${other}/**`,
    `../${other}`,
    `../${other}/**`,
    `../../${other}`,
    `../../${other}/**`,
    `../../../${other}`,
    `../../../${other}/**`,
  ]);

  return {
    files: [`src/features/${featureName}/**/*.{js,jsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/*', '@/app/*', '**/app/**'],
              message: 'Feature modules cannot import from the app composition layer (`src/app/*`).',
            },
            ...(crossFeaturePatterns.length > 0
              ? [
                  {
                    group: crossFeaturePatterns,
                    message: `Cross-feature imports are forbidden (\`features/${featureName}\` cannot import another feature directly; share contracts via \`src/core/*\` or compose in \`src/app/*\`).`,
                  },
                ]
              : []),
          ],
        },
      ],
    },
  };
});

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'release/**',
      'data/**',
    ],
  },

  js.configs.recommended,

  // Shared language & code quality baseline
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^(_|React$)',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-control-regex': 'off',
    },
  },

  // Frontend (React 19 + Browser + Isomorphic Core)
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'local-jsx': jsxUsesVarsPlugin,
    },
    rules: {
      'local-jsx/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Isomorphic modules in src/core shared between browser and Node server
  {
    files: ['src/core/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/*', '@/app/*', '**/app/**'],
              message: '`src/core/*` cannot import from `src/app/*`.',
            },
            {
              group: ['@features/*', '@/features/*', '**/features/**'],
              message: '`src/core/*` cannot import from `src/features/*`.',
            },
            {
              group: ['@ui/*', '@/ui/*', '**/ui/**'],
              message: '`src/core/*` cannot import UI components from `src/ui/*`.',
            },
          ],
        },
      ],
    },
  },

  // Strict UI-Kit layer boundary: src/ui/* cannot depend on features/* or app/*
  {
    files: ['src/ui/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@features/*', '@/features/*', '**/features/**'],
              message: 'UI-Kit (`src/ui/*`) must remain presentation-pure and cannot import from `src/features/*`.',
            },
            {
              group: ['@app/*', '@/app/*', '**/app/**'],
              message: 'UI-Kit (`src/ui/*`) cannot import from `src/app/*`.',
            },
          ],
        },
      ],
    },
  },

  // Strict per-feature isolation rules
  ...featureIsolationConfigs,

  // Backend Server (Node.js ESM)
  {
    files: ['server/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/*', '@features/*', '@ui/*', '**/src/app/**', '**/src/features/**', '**/src/ui/**'],
              message: 'Server modules cannot import client UI, feature, or app layers.',
            },
          ],
        },
      ],
    },
  },

  // Tests & Root Tooling (Node.js ESM)
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
