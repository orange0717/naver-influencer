import { defineConfig } from 'vitest/config';
import path from 'path';

/** 실제 Chrome 을 띄우는 브라우저 검증 전용 설정 — 기본 `npm test` 와 분리한다. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.browser.test.ts'],
    // 한 건의 확인이 §3.7 표본 수만큼 실제 브라우저 왕복을 반복하므로 1회 시절보다 오래 걸린다.
    testTimeout: 300_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
