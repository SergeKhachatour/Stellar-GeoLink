module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Disable source maps entirely
      webpackConfig.devtool = false;
      
      // Remove source-map-loader entirely
      webpackConfig.module.rules = webpackConfig.module.rules.filter(rule => {
        if (rule.enforce === 'pre' && rule.use) {
          if (Array.isArray(rule.use)) {
            return !rule.use.some(use => use.loader && use.loader.includes('source-map-loader'));
          } else if (rule.use.loader && rule.use.loader.includes('source-map-loader')) {
            return false;
          }
        }
        return true;
      });
      
      // Add fallback for Node.js modules
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "fs": false,
        "path": false,
        "os": false
      };
      
      // Add specific rule to handle problematic packages with null-loader
      webpackConfig.module.rules.push({
        test: /\.(js|mjs)$/,
        include: [
          /node_modules\/use-sync-external-store/,
          /node_modules\/reselect/
        ],
        use: 'null-loader'
      });
      
      // Modify babel-loader to exclude problematic packages
      webpackConfig.module.rules.forEach(rule => {
        if (rule.test && rule.test.toString().includes('js')) {
          if (rule.exclude) {
            rule.exclude = [
              rule.exclude,
              /node_modules\/use-sync-external-store/,
              /node_modules\/reselect/
            ];
          } else {
            rule.exclude = [
              /node_modules\/use-sync-external-store/,
              /node_modules\/reselect/
            ];
          }
        }
      });
      
      return webpackConfig;
    },
  },
};
