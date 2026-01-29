import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    test: {
        include: ['tests/**/*.spec.ts'],
        environment: 'node',
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['app/utils/media/api/**/*.ts', 'app/types/metadata.ts'],
            exclude: ['**/*.spec.ts', '**/index.ts', '**/EXAMPLES.md', '**/README.md']
        }
    },
    resolve: {
        alias: {
            '~': path.resolve(__dirname, './app')
        }
    }
});
