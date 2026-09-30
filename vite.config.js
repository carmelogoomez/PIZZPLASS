import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const routes = [
  'contacto.html', 'eventos.html', 'nosotros.html', 'blog.html',
  'blog/pizza-napolitana-autentica.html', 'blog/pizza-en-tu-boda.html',
  'blog/historia-pizzplass.html', 'blog/secretos-masa-48-horas.html',
  'blog/como-elegir-catering-evento.html', 'blog/horno-lena-espectaculo.html'
];

function reactPages() {
  return {
    name: 'react-pages',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\//, '');
        if (!routes.includes(path)) return next();
        const template = readFileSync('index.html', 'utf8');
        const html = await server.transformIndexHtml(`/${path}`, template);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
    closeBundle() {
      const html = readFileSync('dist/index.html', 'utf8');
      routes.forEach((route) => {
        const target = `dist/${route}`;
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, html, 'utf8');
      });
      mkdirSync('dist/assets', { recursive: true });
      copyFileSync('assets/logo.png', 'dist/assets/logo.png');
    }
  };
}

export default defineConfig({ plugins: [react(), reactPages()], build: { outDir: 'dist', emptyOutDir: true } });
