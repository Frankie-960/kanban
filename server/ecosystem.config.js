module.exports = {
  apps: [
    {
      name: 'kanban',
      script: 'dist/index.js',
      cwd: '/opt/kanban/server',

      // 生产环境变量（不在此处写密钥，统一读取 .env 文件）
      env: {
        NODE_ENV: 'production',
      },

      // 日志
      error_file: '/var/log/kanban/error.log',
      out_file:   '/var/log/kanban/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // 稳定性
      max_memory_restart: '512M',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',

      // 单进程（SQLite 不支持多进程并发写入）
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
