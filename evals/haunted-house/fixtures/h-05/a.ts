// Synthetic client-side request sequencing. NOT mounted in a browser by the evaluator.
type Load = (tab: string) => Promise<string[]>;
type State = { tab: string, items: string[] };

export function makeTabView(load: Load) {
  let state: State = { tab: '', items: [] };
  return {
    async select(tab: string) {
      state = { ...state, tab };
      const items = await load(tab);
      // A slower response for a previously selected tab
      // can overwrite the newer selection's items.
      state = { ...state, items };
    },
    read() { return state; }
  };
}

// Reproducer concept: select A, select B, resolve B first,
// then resolve A. The final state should still show B.
// No actual UI, server or browser test was executed.
