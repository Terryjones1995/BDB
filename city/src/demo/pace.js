/**
 * Pacing for the builders that fabricate a city while the loading screen is up.
 *
 * A long fast-forward done in one call freezes the tab for its whole length: no progress, no
 * repaint, and after a few seconds a browser that offers to kill the page. `sliced` does the same
 * work in pieces and gives the page a turn between them.
 */

/**
 * Run `fn(units)` over `total` units in pieces of `chunk`. Whenever the pieces since the last
 * pause add up to more than `budgetMs`, report progress (0..1) and yield to the event loop.
 */
export async function sliced(total, chunk, fn, onProgress, budgetMs = 80) {
  let done = 0, last = performance.now();
  while (done < total) {
    const n = Math.min(chunk, total - done);
    fn(n);
    done += n;
    if (performance.now() - last > budgetMs || done >= total) {
      try { if (onProgress) onProgress(done / total); } catch (_) { /* progress is cosmetic */ }
      await new Promise((resolve) => setTimeout(resolve, 0));
      last = performance.now();
    }
  }
}
