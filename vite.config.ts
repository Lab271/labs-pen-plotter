import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The gateway daemon writes runtime files (e.g. the persisted position) into
    // the project ~every 2 s. Don't let that hot-reload the dev UI — it would drop
    // the WebSocket and reconnect in a loop.
    watch: { ignored: ['**/gateway/.plotter-state.json', '**/.plotter-state.json', '**/gateway/.session.json'] },
  },
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Scoped to the pure, framework-free core — the part that is actually
      // unit-testable. src/ui and src/transport need a DOM and a live socket,
      // so folding them in would only produce a floor low enough to be
      // meaningless. Widen this when those grow real tests.
      include: ['src/plot/**', 'src/grbl/**'],
      exclude: ['**/__tests__/**'],
      // Set just under the coverage measured when this gate went in, so it
      // ratchets against regressions rather than blocking today's work.
      // Raise these as coverage improves; never lower them to make CI pass.
      thresholds: {
        statements: 50,
        branches: 48,
        functions: 40,
        lines: 50,
      },
    },
  },
});

