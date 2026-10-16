import { env } from "cloudflare:workers";

type Row = Record<string, unknown>;

/**
 * A SQL statement with its bound values. Awaiting it runs the statement and
 * resolves to the result rows; pass it un-awaited to `batch()` to run several
 * statements atomically.
 *
 * D1 binds numbers, strings, booleans and null. `undefined` and `Date` are
 * rejected, so pass `null` and epoch milliseconds instead.
 */
export class Query<T = Row> implements PromiseLike<T[]> {
  constructor(
    readonly text: string,
    readonly values: unknown[],
  ) {}

  statement(): D1PreparedStatement {
    return env.DB.prepare(this.text).bind(...this.values);
  }

  async all(): Promise<T[]> {
    return (await this.statement().all<T>()).results;
  }

  /** For writes where only the affected-row count matters. */
  async run(): Promise<{ changes: number }> {
    return { changes: (await this.statement().run()).meta.changes };
  }

  then<A = T[], B = never>(
    onfulfilled?: ((rows: T[]) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.all().then(onfulfilled, onrejected);
  }
}

export function sql<T = Row>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Query<T> {
  return new Query<T>(strings.join("?"), values);
}

/**
 * Runs the statements in one D1 batch: a single transaction that rolls back
 * entirely if any statement fails. D1 has no interactive transactions, so
 * every statement must be known up front.
 */
export function batch(queries: Query<unknown>[]): Promise<D1Result[]> {
  return env.DB.batch(queries.map((q) => q.statement()));
}

/**
 * True when `err` is a unique violation on the given index. D1 reports
 * expression indexes by name:
 * "D1_ERROR: UNIQUE constraint failed: index '<name>': SQLITE_CONSTRAINT".
 */
export function isUniqueViolation(err: unknown, indexName: string): boolean {
  return (
    err instanceof Error &&
    err.message.includes("UNIQUE constraint failed") &&
    err.message.includes(indexName)
  );
}
