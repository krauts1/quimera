import { defineConfig } from 'vite';

export default defineConfig({
  // Paths relativos: requisito de deploy del jam (HTTPS + hosting propio).
  base: './',
  build: {
    // sourcemaps solo en builds locales; al deploy no van (~9 MB menos)
    sourcemap: process.env.QUIMERA_DEPLOY !== '1',
    // En deploy NO se copia public/ completo (588 MB de assets del mixer);
    // `npm run build:deploy` copia el subconjunto podado después.
    copyPublicDir: process.env.QUIMERA_DEPLOY !== '1',
  },
});
