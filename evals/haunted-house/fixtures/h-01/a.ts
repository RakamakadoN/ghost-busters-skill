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
  // This implementation deliberately loses the distinction
  // between a failed upstream read and an empty business result.
  try {
    if (!source.httpOk) throw new Error('upstream unavailable');
    const items = JSON.parse(source.payload);
    if (!Array.isArray(items)) throw new Error('not an array');
    return { kind: 'ready', tasks: items as Task[] };
  } catch (_error) {
    return { kind: 'ready', tasks: [] };
  }
}

export function buildDashboard() {
  const states = entries.map(decodeTaskFeed);
  const counts = states.map(x => x.kind === 'ready' ? x.tasks.length : 0);
  return {
    visibleRows: counts,
    saysAllClear: states.every(x => x.kind === 'ready'),
    requiresInvestigation: states.some(x => x.kind === 'unavailable')
  };
}

// Contract: an upstream failure cannot be reported as an empty,
// successfully loaded list. Runtime checks have not been performed.
