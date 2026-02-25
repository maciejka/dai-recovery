import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

function resolveBasePath() {
  const value = process.env.VITE_BASE_PATH;
  if (!value) {
    return '/';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
