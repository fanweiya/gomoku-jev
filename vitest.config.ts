import { defineConfig } from 'vitest/config';

// 单元测试只收集 *.test.ts；tests/*.spec.ts 归 Playwright E2E。
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
