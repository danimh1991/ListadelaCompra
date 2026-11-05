# Lista de la compra

Lista de la compra minimalista para Android y web, desplegada en Cloudflare Workers.

## Funciones

- Añadir, editar y eliminar artículos.
- Marcar artículos como comprados y recuperarlos desde la sección «Comprados».
- API REST pública para integraciones externas.
- PWA instalable y APK Android ligero.
- Datos en la base D1 compartida con AlaMesa, aislados en `listacompra_items`.

## API

URL base: `https://danieta.com/listacompra/api`

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/items?status=all\|pending\|purchased` | Listar artículos |
| `POST` | `/items` | Crear: `{ "name": "Leche", "quantity": "2" }` |
| `PATCH` | `/items/:id` | Editar: `{ "name": "Leche entera", "completed": true }` |
| `DELETE` | `/items/:id` | Eliminar |
| `GET` | `/health` | Estado del servicio |

Ejemplo:

```bash
curl -X POST https://danieta.com/listacompra/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Pan"}'
```

## Desarrollo

```bash
npm install
npm run check
npm run dev
```

El worker crea de forma idempotente su tabla e índice la primera vez que accede a la API.

## Android

El proyecto de `android/` contiene una aplicación WebView que abre la URL pública. GitHub Actions compila un APK de depuración en cada commit y lo publica como artefacto del workflow.

