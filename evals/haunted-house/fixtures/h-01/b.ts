// Synthetic task-feed fixture. No network requests are performed by the evaluator.
type Task = { id: string, status: 'open' | 'done' };
type ServerResult = { payload: string, httpOk: boolean };
type FeedState = { kind: 'ready', tasks: Task[] } | { kind: 'unavailable' };

const entries: ServerResult[] = [
  { payload: '[{"id":"t1","status":"open"}]', httpOk: true },
  { payload: '', httpOk: false },
  { payload: '[]', httpOk: true }
];

function decodeTaskFeed(source: ServerResult): FeedState {
  if (!source.httpOk) return { kind: 'unavailable' };
  try {
    const items: unknown = JSON.parse(source.payload);
    if (!Array.isArray(items)) return { kind: 'unavailable' };
    if (!items.every(v => typeof v === 'object' && v !== null &&
         typeof (v as Task).id === 'string')) return { kind: 'unavailable' };
    return { kind: 'ready', tasks: items as Task[] };
  } catch {
    return { kind: 'unavailable' };
  }
}

export function buildDashboard() {
  const states = entries.map(decodeTaskFeed);
  return {
    visibleRows: states.map(x => x.kind === 'ready' ? x.tasks.length : null),
    saysAllClear: states.every(x => x.kind === 'ready'),
    requiresInvestigation: states.some(x => x.kind === 'unavailable')
  };
}

// Contract: malformed or failed loads remain distinguishable
// from an authorized zero-row business result.
