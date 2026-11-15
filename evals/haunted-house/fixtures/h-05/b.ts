// Synthetic client-side request sequencing. NOT mounted in a browser by the evaluator.
type Load = (tab: string) => Promise<string[]>;
type State = { tab: string, items: string[] };

export function makeTabView(load: Load) {
  let state: State = { tab: '', items: [] };
  let generation = 0;
  return {
    async select(tab: string) {
      const mine = ++generation;
      state = { ...state, tab };
      const items = await load(tab);
      // Ignore an obsolete response, an alternative to AbortController.
      if (mine === generation) state = { ...state, items };
    },
    read() { return state; }
  };
}

// Reproducer concept: select A, select B, resolve B first,
// then resolve A. A late A response must not change B.
// A generation token is valid only if all mutations use it.
