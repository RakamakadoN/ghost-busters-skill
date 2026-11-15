// Synthetic asynchronous completion example; code not executed by the evaluator.
type Writer = { persist(id: string): Promise<void> };
type BatchResult = { state: 'done' | 'failed', completed: number };

export async function runBatch(writer: Writer, ids: string[]): Promise<BatchResult> {
  let completed = 0;
  for (const id of ids) {
    await writer.persist(id);
    completed += 1;
  }
  return { state: 'done', completed };
}

export function explanation() {
  return {
    contract: 'Done means every required write completed',
    exceptionPath: 'An awaited rejected write rejects the parent',
    negativeControl: 'Empty input remains done with zero items'
  };
}

// An independent test must inject a delayed rejection.
// A source-only analyzer cannot know whether the caller
// is actually using a custom fire-and-forget contract.
