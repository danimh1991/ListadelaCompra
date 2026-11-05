interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

type ItemRow = {
  id: number;
  name: string;
  quantity: string | null;
  completed: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

async function ensureSchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS listacompra_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      quantity TEXT,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_listacompra_items_completed
      ON listacompra_items (completed, created_at DESC)`).run();
}

function publicItem(row: ItemRow) {
  return { ...row, completed: Boolean(row.completed) };
}

async function api(request: Request, env: Env, path: string): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders });
  if (path === "/api/health" && request.method === "GET") return json({ ok: true });

  await ensureSchema(env.DB);
  const url = new URL(request.url);

  if (path === "/api/items" && request.method === "GET") {
    const status = url.searchParams.get("status") ?? "all";
    const where = status === "pending" ? "WHERE completed = 0" : status === "purchased" ? "WHERE completed = 1" : "";
    const result = await env.DB.prepare(
      `SELECT id, name, quantity, completed, created_at, updated_at, completed_at
       FROM listacompra_items ${where}
       ORDER BY completed ASC, CASE WHEN completed = 0 THEN created_at END DESC,
                CASE WHEN completed = 1 THEN completed_at END DESC`
    ).all<ItemRow>();
    return json({ items: result.results.map(publicItem) });
  }

  if (path === "/api/items" && request.method === "POST") {
    const body = await request.json<{ name?: string; quantity?: string | null }>();
    const name = body.name?.trim();
    if (!name) return json({ error: "El nombre es obligatorio" }, 400);
    const result = await env.DB.prepare(
      `INSERT INTO listacompra_items (name, quantity) VALUES (?, ?)
       RETURNING id, name, quantity, completed, created_at, updated_at, completed_at`
    ).bind(name, body.quantity?.trim() || null).first<ItemRow>();
    return json({ item: publicItem(result!) }, 201);
  }

  const match = path.match(/^\/api\/items\/(\d+)$/);
  if (match) {
    const id = Number(match[1]);
    if (request.method === "PATCH") {
      const current = await env.DB.prepare(
        "SELECT id, name, quantity, completed, created_at, updated_at, completed_at FROM listacompra_items WHERE id = ?"
      ).bind(id).first<ItemRow>();
      if (!current) return json({ error: "Artículo no encontrado" }, 404);

      const body = await request.json<{ name?: string; quantity?: string | null; completed?: boolean }>();
      const name = body.name === undefined ? current.name : body.name.trim();
      if (!name) return json({ error: "El nombre es obligatorio" }, 400);
      const quantity = body.quantity === undefined ? current.quantity : body.quantity?.trim() || null;
      const completed = body.completed === undefined ? current.completed : Number(body.completed);
      const completedAt = completed ? (current.completed_at ?? new Date().toISOString()) : null;

      const result = await env.DB.prepare(
        `UPDATE listacompra_items
         SET name = ?, quantity = ?, completed = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
         RETURNING id, name, quantity, completed, created_at, updated_at, completed_at`
      ).bind(name, quantity, completed, completedAt, id).first<ItemRow>();
      return json({ item: publicItem(result!) });
    }

    if (request.method === "DELETE") {
      const result = await env.DB.prepare("DELETE FROM listacompra_items WHERE id = ?").bind(id).run();
      if (!result.meta.changes) return json({ error: "Artículo no encontrado" }, 404);
      return new Response(null, { status: 204, headers: jsonHeaders });
    }
  }

  return json({ error: "Ruta no encontrada" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/listacompra(?=\/api(?:\/|$))/, "");
    if (path.startsWith("/api/")) return api(request, env, path);

    if (url.pathname.startsWith("/listacompra")) {
      const assetPath = url.pathname.replace(/^\/listacompra\/?/, "/") || "/";
      const assetUrl = new URL(assetPath, url.origin);
      let response = await env.ASSETS.fetch(new Request(assetUrl, request));
      if (response.status === 404) {
        response = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), request));
      }
      return response;
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

