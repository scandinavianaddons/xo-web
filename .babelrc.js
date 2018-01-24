const devDependencies = require('./package').devDependencies || {}

const NODE_ENV = process.env.NODE_ENV || 'development'
const __PROD__ = NODE_ENV === 'production'
const __TEST__ = NODE_ENV === 'test'

module.exports = {
  comments: !__PROD__,
  ignore: __TEST__ ? undefined : [/\.spec\.js$/],
  plugins: [
    '@babel/proposal-class-properties',
    '@babel/proposal-decorators',
    '@babel/proposal-export-default-from',
    '@babel/proposal-function-bind',
    '@babel/proposal-optional-chaining',
    '@babel/proposal-pipeline-operator',
    'dev',
    'lodash',
  ],
  presets: [
    [
      '@babel/env',
      {
        debug: !__TEST__,
        loose: true,
        shippedProposals: true,
        targets: __PROD__
          ? {
            browsers: '>2%',
            node: '4',
          }
          : { node: 'current' },
        useBuiltIns: '@babel/polyfill' in devDependencies && 'usage',
      },
    ],
    '@babel/flow',
    [
      '@babel/react',
      {
        development: !__PROD__,
      },
    ],
  ],
}
