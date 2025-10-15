module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Disable source maps entirely
      webpackConfig.devtool = false;
      
      return webpackConfig;
    },
  },
};
