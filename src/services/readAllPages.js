export const READ_PAGE_SIZE = 500

export function requireActiveRead(signal, isCurrent = () => true) {
  if (signal?.aborted || !isCurrent()) {
    throw Object.assign(new Error('This data request is no longer active.'), { name: 'AbortError' })
  }
}

// Keyset traversal over immutable, unique IDs avoids offset shifts when earlier
// records are deleted. Request an exact count on the first page only. If that
// metadata is unavailable, continue until EMPTY (a server cap can be smaller
// than our page size). No partial result is returned after a failure.
export async function readAllPages(queryForPage, { signal, isCurrent, pageSize = READ_PAGE_SIZE } = {}) {
  const rows = []
  let cursor = null
  let expected = null
  while (true) {
    requireActiveRead(signal, isCurrent)
    let query = queryForPage({ count: cursor === null ? 'exact' : undefined }).order('id', { ascending: true }).limit(pageSize)
    if (cursor !== null) query = query.gt('id', cursor)
    if (signal) query = query.abortSignal(signal)
    const { data, error, count } = await query
    requireActiveRead(signal, isCurrent)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('The server returned an incomplete dataset.')
    if (cursor === null && Number.isSafeInteger(count) && count >= 0) expected = count
    if (!data.length) {
      if (expected !== null && rows.length !== expected) throw new Error('The dataset changed during loading. Please retry.')
      return rows
    }
    for (const row of data) {
      if (typeof row.id !== 'string' || !row.id || (cursor !== null && row.id <= cursor)) {
        throw new Error('Unable to verify pagination order. No partial data was accepted.')
      }
      cursor = row.id
      rows.push(row)
    }
    if (expected !== null) {
      if (rows.length > expected) throw new Error('The dataset changed during loading. Please retry.')
      if (rows.length === expected) return rows
    }
  }
}
