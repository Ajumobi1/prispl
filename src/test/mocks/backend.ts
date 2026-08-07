import { vi } from "vitest";

/**
 * Chainable fake for the backend query builder.
 *
 * Every call is recorded so tests can assert the *shape* of the query
 * (e.g. that the task board filters `deleted_at is null`, or that a
 * "delete" is really an update and never a row removal).
 */
export interface QueryResult {
  data?: unknown;
  error?: { message: string } | null;
}

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export class FakeQuery implements PromiseLike<QueryResult> {
  readonly calls: RecordedCall[] = [];

  constructor(
    readonly table: string,
    private readonly result: QueryResult,
  ) {}

  private rec(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  /** true when the given method was called (optionally with the given args). */
  called(method: string, ...args: unknown[]): boolean {
    return this.calls.some(
      (c) =>
        c.method === method &&
        (args.length === 0 || JSON.stringify(c.args.slice(0, args.length)) === JSON.stringify(args)),
    );
  }

  argsFor(method: string): unknown[] | undefined {
    return this.calls.find((c) => c.method === method)?.args;
  }

  select(...a: unknown[]) { return this.rec("select", a); }
  insert(...a: unknown[]) { return this.rec("insert", a); }
  update(...a: unknown[]) { return this.rec("update", a); }
  delete(...a: unknown[]) { return this.rec("delete", a); }
  upsert(...a: unknown[]) { return this.rec("upsert", a); }
  eq(...a: unknown[]) { return this.rec("eq", a); }
  neq(...a: unknown[]) { return this.rec("neq", a); }
  is(...a: unknown[]) { return this.rec("is", a); }
  not(...a: unknown[]) { return this.rec("not", a); }
  in(...a: unknown[]) { return this.rec("in", a); }
  gte(...a: unknown[]) { return this.rec("gte", a); }
  lte(...a: unknown[]) { return this.rec("lte", a); }
  order(...a: unknown[]) { return this.rec("order", a); }
  limit(...a: unknown[]) { return this.rec("limit", a); }

  single(): Promise<QueryResult> {
    this.rec("single", []);
    return Promise.resolve(this.settled());
  }

  maybeSingle(): Promise<QueryResult> {
    this.rec("maybeSingle", []);
    return Promise.resolve(this.settled());
  }

  private settled(): QueryResult {
    return { data: this.result.data ?? null, error: this.result.error ?? null };
  }

  then<A = QueryResult, B = never>(
    onfulfilled?: ((value: QueryResult) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.settled()).then(onfulfilled, onrejected);
  }
}

function createBackend() {
  const queues = new Map<string, QueryResult[]>();
  const queries: FakeQuery[] = [];

  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null as unknown }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: null as unknown }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user: null as unknown }, error: null })),
    signUp: vi.fn(async () => ({ data: { user: null as unknown }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  };

  const storageBuckets = new Map<string, ReturnType<typeof makeBucket>>();
  function makeBucket() {
    return {
      upload: vi.fn(async () => ({ data: { path: "p" }, error: null })),
      download: vi.fn(async () => ({ data: new Blob(["x"]), error: null })),
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
  }

  const functions = {
    invoke: vi.fn(async () => ({ data: null as unknown, error: null as unknown })),
  };

  const client = {
    auth,
    functions,
    storage: {
      from: (bucket: string) => {
        if (!storageBuckets.has(bucket)) storageBuckets.set(bucket, makeBucket());
        return storageBuckets.get(bucket)!;
      },
    },
    from: (table: string) => {
      const next = queues.get(table)?.shift() ?? { data: null, error: null };
      const q = new FakeQuery(table, next);
      queries.push(q);
      return q as unknown as never;
    },
  };

  return {
    client,
    auth,
    functions,
    queries,
    /** Queue the result the next `from(table)` chain resolves to. */
    queue(table: string, result: QueryResult) {
      const list = queues.get(table) ?? [];
      list.push(result);
      queues.set(table, list);
      return this;
    },
    bucket(name: string) {
      if (!storageBuckets.has(name)) storageBuckets.set(name, makeBucket());
      return storageBuckets.get(name)!;
    },
    /** All recorded query chains for a table, in call order. */
    for(table: string): FakeQuery[] {
      return queries.filter((q) => q.table === table);
    },
    signedInAs(userId: string, email = "user@prsunitplatform.local") {
      auth.getSession.mockResolvedValue({
        data: { session: { user: { id: userId, email }, access_token: "token" } },
        error: null,
      } as never);
      auth.getUser.mockResolvedValue({ data: { user: { id: userId, email } }, error: null } as never);
      return this;
    },
    signedOut() {
      auth.getSession.mockResolvedValue({ data: { session: null }, error: null } as never);
      auth.getUser.mockResolvedValue({ data: { user: null }, error: null } as never);
      return this;
    },
    reset() {
      queues.clear();
      queries.length = 0;
      storageBuckets.clear();
      vi.clearAllMocks();
      auth.getSession.mockResolvedValue({ data: { session: null }, error: null } as never);
      auth.getUser.mockResolvedValue({ data: { user: null }, error: null } as never);
      auth.signOut.mockResolvedValue({ error: null } as never);
      auth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      } as never);
      functions.invoke.mockResolvedValue({ data: null, error: null } as never);
      return this;
    },
  };
}

/** Singleton so `vi.mock` factories and test bodies share one instance. */
export const backend = createBackend();
export const supabase = backend.client as never;
