# PizzPlass

Web de PizzPlass, catering de pizza napolitana elaborada al momento para bodas, comuniones, cumpleaños, deporte, ferias y eventos de empresa.

## Tecnología

- React 19 + Vite.
- Una sola aplicación para portada, servicios, nosotros, blog, artículos y contacto.
- Se conservan las URLs históricas terminadas en `.html` para no romper SEO ni enlaces existentes.
- Formulario conectado con FormSubmit.
- Feed de Instagram y reseñas de Google preparados mediante GitHub Actions y secretos privados.

## Desarrollo local

En Windows, haz doble clic en `abrir-web.cmd`. La web se abrirá en `http://127.0.0.1:4173/` mediante el servidor local incluido.

Para desarrollar con recarga automática:

```bash
pnpm install
pnpm dev
```

Para verificar la versión de producción:

```bash
pnpm build
```

## Estructura

```text
src/
  main.jsx       Entrada de React
  site.jsx       Páginas y componentes
  articles.js    Contenido del blog
  styles.css     Sistema visual responsive
  BudgetForm.jsx Formulario de presupuesto por pasos
  data/          Provincias y municipios peninsulares
public/
  data/          Instagram y reseñas de Google
  CNAME          Dominio pizzplass.es
assets/
  logo.png       Logo principal
```

## Publicación

`.github/workflows/deploy-pages.yml` compila y publica la carpeta `dist` automáticamente al enviar cambios a `master`. En GitHub Pages debe estar seleccionada la fuente **GitHub Actions**.

Los flujos de Instagram y Google están preparados para ejecutarse manualmente cuando se configuren las claves. Todavía no tienen programación periódica. Las claves se configuran únicamente como secretos del repositorio:

- `IG_USER_ID`
- `IG_ACCESS_TOKEN`
- `GOOGLE_PLACES_API_KEY`
