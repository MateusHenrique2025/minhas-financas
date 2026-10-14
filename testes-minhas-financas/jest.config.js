const timestamp = new Date().toISOString().slice(0, 16).replace(':', '-');

module.exports = {
  testEnvironment: 'node',
  testTimeout: 90000,
  testMatch: ['<rootDir>/**/*.test.js'],
  verbose: true,
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './reports',
        filename: `${timestamp}-report.html`,
        expand: true,
        includeFailureMsg: true,
        includeConsoleLog: true,
      },
    ],
  ],
};
