module.exports = {
  apps: [
    {
      name: "roniya-backend",
      script: "server.cjs",
      interpreter: "C:\\Program Files\\nodejs\\node.exe",

      exec_mode: "fork",
      instances: 1,

      env: {
        NODE_ENV: "production",
        COOKIE_SECURE: "true",
      },

      env_production: {
        NODE_ENV: "production",
        COOKIE_SECURE: "true",
      },

      max_memory_restart: "1G",
      autorestart: true,
      watch: false,
      min_uptime: "30s",
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 45000,
      listen_timeout: 15000,
      treekill: true,
      time: true,
    },
  ],
};