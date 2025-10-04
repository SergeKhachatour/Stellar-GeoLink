module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Find the source-map-loader rule and modify it to ignore node_modules
      const sourceMapRule = webpackConfig.module.rules.find(
        rule => rule.enforce === 'pre' && rule.use && rule.use.loader && rule.use.loader.includes('source-map-loader')
      );
      
      if (sourceMapRule) {
        sourceMapRule.exclude = /node_modules/;
      }
      
      return webpackConfig;
    },
  },
};
