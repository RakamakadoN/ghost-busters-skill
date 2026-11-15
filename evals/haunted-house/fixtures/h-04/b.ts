// Synthetic asynchronous completion example; code not executed by the evaluator.
type Writer = { persist(id: string): Promise<void> };
type BatchResult = { state: 'done' | 'failed', completed: number };

export async function runBatch(writer: Writer, ids: string[]): Promise<BatchResult> {
  let completed = 0;
  ids.forEach(async (id) => {
    await writer.persist(id);
    completed += 1;
  });
  // forEach returns before awaited callbacks finish, so "done"
  // may precede all required writes and may miss their rejections.
  return { state: 'done', completed };
}

export function explanation() {
  return {
    contract: 'Done means every required write completed',
    exceptionPath: 'A late rejected write has no observed parent await',
    negativeControl: 'Empty input remains done with zero items'
  };
}

// Observable in a real isolated test: delayed writer and failure injection.
// No proof exists solely because this comment names a bug.
