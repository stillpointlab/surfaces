// Stand-ins for pdf.js and the page's worker in jsdom, which has neither a
// `Worker` nor a canvas that draws. The element's tests mock `../preview/engine`
// with `fakeEngine` and `../worker/start` with `startFakeWorker`, and say from
// here when a document opens or fails, and when a page has been drawn.

/** An error as pdf.js passes one from its worker: by its name. */
export function pdfjsError(name: string, message = name, details?: string): Error {
  const error = new Error(message) as Error & { details?: string };
  error.name = name;
  if (details !== undefined) error.details = details;
  return error;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** One render of a page: drawn when the test says, or cancelled by the element. */
export interface FakeRender {
  readonly page: FakePage;
  readonly canvas: HTMLCanvasElement;
  readonly scale: number;
  cancelled: boolean;
  draw(): void;
  fail(error?: unknown): void;
}

/** A page of a fake document, `width` by `height` PDF units at 100%. */
export class FakePage {
  readonly renders: FakeRender[] = [];
  cleanups = 0;
  /** Draw every render at once, as it is asked for. */
  drawAtOnce = true;

  constructor(
    readonly number: number,
    readonly width = 612,
    readonly height = 792
  ) {}

  getViewport({ scale }: { scale: number }) {
    return { width: this.width * scale, height: this.height * scale, scale };
  }

  render({ canvas, viewport }: { canvas: HTMLCanvasElement; viewport: { scale: number } }) {
    const done = deferred<void>();
    const render: FakeRender = {
      page: this,
      canvas,
      scale: viewport.scale,
      cancelled: false,
      draw: () => done.resolve(),
      fail: (error = new Error('bad page')) => done.reject(error),
    };
    this.renders.push(render);
    if (this.drawAtOnce) queueMicrotask(() => render.draw());
    return {
      promise: done.promise,
      cancel: () => {
        render.cancelled = true;
        done.reject(pdfjsError('RenderingCancelledException', 'Rendering cancelled'));
      },
    };
  }

  cleanup(): boolean {
    this.cleanups += 1;
    return true;
  }
}

/** A fake document of `count` pages; a page number in `unreadable` cannot be read. */
export class FakeDocument {
  readonly pages: FakePage[];

  constructor(
    count: number,
    readonly unreadable: readonly number[] = []
  ) {
    this.pages = Array.from({ length: count }, (_, at) => new FakePage(at + 1));
  }

  get numPages(): number {
    return this.pages.length;
  }

  getPage(number: number): Promise<FakePage> {
    if (this.unreadable.includes(number)) return Promise.reject(new Error('Bad page tree'));
    return Promise.resolve(this.pages[number - 1]);
  }
}

/** One opening of a URL: the document it opens to, or the error it fails with. */
export interface FakeTask {
  readonly url: string;
  readonly worker: Worker;
  readonly files: unknown;
  readonly promise: Promise<FakeDocument>;
  destroyed: boolean;
  destroy(): Promise<void>;
  open(doc: FakeDocument): void;
  fail(error: unknown): void;
}

/** What the fake engine was asked, in order, and what to answer next. */
export const opened: FakeTask[] = [];
// Answers set for a URL before it is opened: the contract suite says "it loaded"
// before the engine has been imported.
const answers = new Map<string, (task: FakeTask) => void>();

/** Open the next task for `url` to `doc` (now, if it is open already). */
export function answer(url: string, outcome: FakeDocument | Error): void {
  const settle = (task: FakeTask) =>
    outcome instanceof FakeDocument ? task.open(outcome) : task.fail(outcome);
  const waiting = [...opened].reverse().find((task) => task.url === url && !task.destroyed);
  if (waiting) settle(waiting);
  else answers.set(url, settle);
}

/** The last task opened for `url`. */
export function taskFor(url: string): FakeTask | undefined {
  return [...opened].reverse().find((task) => task.url === url);
}

export function resetEngine(): void {
  opened.length = 0;
  answers.clear();
}

/** The engine module's stand-in: `openPdf` as the element calls it. */
export const fakeEngine = {
  openPdf(url: string, worker: Worker, files: unknown): FakeTask {
    const done = deferred<FakeDocument>();
    // Raced by the element; a test that never answers leaves it unheard.
    done.promise.catch(() => undefined);
    const task: FakeTask = {
      url,
      worker,
      files,
      promise: done.promise,
      destroyed: false,
      destroy: async () => {
        task.destroyed = true;
        done.reject(pdfjsError('AbortException', 'Loading aborted'));
      },
      open: (doc) => done.resolve(doc),
      fail: (error) => done.reject(error),
    };
    opened.push(task);
    const settle = answers.get(url);
    if (settle) {
      answers.delete(url);
      settle(task);
    }
    return task;
  },
};

/** A stand-in for the page's worker: an event target the test makes fail or start. */
export class FakeWorker extends EventTarget {
  terminated = false;

  terminate(): void {
    this.terminated = true;
  }

  /** It started: pdf.js's worker says "ready". */
  start(): void {
    this.dispatchEvent(new MessageEvent('message', { data: { action: 'ready' } }));
  }

  /** It failed to load (a 404, a script that does not parse). */
  failToLoad(): void {
    this.dispatchEvent(new Event('error'));
  }
}

export const workers: FakeWorker[] = [];

/** `startWorker`'s stand-in. */
export function startFakeWorker(): Worker {
  const worker = new FakeWorker();
  workers.push(worker);
  return worker as unknown as Worker;
}
