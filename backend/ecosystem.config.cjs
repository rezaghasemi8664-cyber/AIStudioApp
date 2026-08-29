module.exports = {
  apps: [
    {
      name: "roniya-backend",
      script: "server.cjs",

      exec_mode: "fork",
      instances: 1,

      env: {
        NODE_ENV: "development",
        BRS_API_KEY: "BBd8wTnmLTQpSHcz5kqxFegudgym5Tnd",
        COOKIE_SECURE: "false",
      },

      env_production: {
        NODE_ENV: "production",
        BRS_API_KEY: "BBd8wTnmLTQpSHcz5kqxFegudgym5Tnd",
        COOKIE_SECURE: "true",
      },

      max_memory_restart: "400M",
      time: true,
    },
  ],
};