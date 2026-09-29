import { bindings, defineConfig, triggers } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'cc-monitor-worker',
    compatibilityDate: '2026-05-17',
    compatibilityFlags: ['nodejs_compat'],
    entrypoint: 'src/index.ts',
    workersDev: true,
    previewUrls: true,
    observability: {
      enabled: true,
    },
    triggers: [
      triggers.scheduled({
        schedule: '0 0 * * *',
      }),
    ],
    env: {
      // migrations_dir は設定で持てないため、package.json の db:migrate:* で --dir を渡す
      claude_code_analytics_db: bindings.d1({
        name: 'claude-code-analytics-db',
        id: 'a2eb0bf3-c1ed-4582-b700-a7a758336f1e',
      }),
      OTEL_BEARER_TOKEN: bindings.secret(),
    },
  },
});
