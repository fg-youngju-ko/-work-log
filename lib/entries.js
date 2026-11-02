function clean(v, max = 20000) {
  return typeof v === 'string' ? v.slice(0, max) : v == null ? null : String(v).slice(0, max);
}

export function sanitizeEntry(body, idFallback) {
  return {
    id: clean(body.id || idFallback, 100),
    content: clean(body.content, 20000) || '',
    start: clean(body.start, 40),
    end: body.end ? clean(body.end, 40) : null,
    category: body.category ? clean(body.category, 100) : null,
    source: body.source ? clean(body.source, 40) : null,
    createdAt: clean(body.createdAt, 40) || new Date().toISOString(),
    updatedAt: clean(body.updatedAt, 40) || new Date().toISOString(),
  };
}

export function rowToEntry(row) {
  return {
    id: row.id,
    content: row.content,
    start: row.start,
    end: row.end,
    category: row.category,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
