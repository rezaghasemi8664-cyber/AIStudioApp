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

      max_memory_restart: "400M",
      time: true,
    },
  ],
};