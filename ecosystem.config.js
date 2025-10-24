module.exports = {
  apps: [{
    name: 'stellar-geolink',
    script: 'backend/app.js',
    cwd: '/home/site/wwwroot',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 8080
    }
  }]
};
