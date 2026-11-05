# Lista de la compra

Lista de la compra minimalista para Android y web, desplegada en Cloudflare Workers.

## Funciones

- Añadir, editar y eliminar artículos.
- Mover artículos entre las listas excluyentes «General» y «Mercadona» sin crear duplicados.
- Marcar artículos como comprados y recuperarlos desde la sección «Comprados».
- API REST pública para integraciones externas.
- PWA instalable y APK Android ligero.
- Datos en la base D1 compartida con AlaMesa, aislados en `listacompra_items`.

## API

URL base: `https://danieta.com/listacompra/api`

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/items?status=all\|pending\|purchased&list=general\|mercadona` | Listar artículos; `list` filtra una lista concreta y, si se omite, devuelve ambas |
| `POST` | `/items` | Crear: `{ "name": "Leche", "quantity": "2", "mercadona": true }` |
| `PATCH` | `/items/:id` | Editar: `{ "name": "Leche entera", "completed": true, "mercadona": true }` |
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

## Despliegue

La rama `main` está conectada a **Cloudflare Workers Builds**. Cada commit ejecuta la comprobación de tipos y despliega el worker mostrando en Cloudflare el repositorio, la rama, el autor y el mensaje del commit. La ruta de producción es `danieta.com/listacompra*`.

## Android

El proyecto de `android/` contiene una aplicación WebView que abre la URL pública. GitHub Actions compila un APK de depuración en cada commit y lo publica como artefacto del workflow.

