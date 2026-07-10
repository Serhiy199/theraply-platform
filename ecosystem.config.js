module.exports = {
  apps: [
    {
      name: "theraply",
      cwd: "/var/www/theraply",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
