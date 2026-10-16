import { describe, expect, test } from "bun:test";
import {
  convertDump,
  parseCopyBlocks,
  textLiteral,
  timestampToMs,
  unescapeCopyField,
} from "./pg-dump";

describe("unescapeCopyField", () => {
  test("NULL marker", () => {
    expect(unescapeCopyField("\\N")).toBeNull();
  });

  test("plain text is returned as is", () => {
    expect(unescapeCopyField("Air Bank")).toBe("Air Bank");
  });

  test("backslash escapes", () => {
    expect(unescapeCopyField("a\\tb\\nc\\\\d")).toBe("a\tb\nc\\d");
    expect(unescapeCopyField("\\x41\\101")).toBe("AA");
  });

  test("an escaped N is not NULL when part of a longer value", () => {
    expect(unescapeCopyField("\\\\N")).toBe("\\N");
  });
});

describe("timestampToMs", () => {
  test("UTC with microseconds truncates to milliseconds", () => {
    expect(timestampToMs("2026-07-12 17:36:15.123456+00")).toBe(
      Date.UTC(2026, 6, 12, 17, 36, 15, 123),
    );
  });

  test("no fractional part", () => {
    expect(timestampToMs("2026-01-01 00:00:00+00")).toBe(Date.UTC(2026, 0, 1));
  });

  test("short fractional part is padded, not misread", () => {
    expect(timestampToMs("2026-01-01 00:00:00.5+00")).toBe(
      Date.UTC(2026, 0, 1, 0, 0, 0, 500),
    );
  });

  test("non-UTC offsets", () => {
    expect(timestampToMs("2026-07-12 19:36:15+02")).toBe(
      Date.UTC(2026, 6, 12, 17, 36, 15),
    );
    expect(timestampToMs("2026-07-12 12:06:15-05:30")).toBe(
      Date.UTC(2026, 6, 12, 17, 36, 15),
    );
  });

  test("rejects other formats", () => {
    expect(() => timestampToMs("2026-07-12T17:36:15Z")).toThrow();
  });
});

describe("textLiteral", () => {
  test("quotes are doubled", () => {
    expect(textLiteral("it's")).toBe("'it''s'");
  });

  test("semicolons stay inside the literal", () => {
    expect(textLiteral("Mozilla/5.0 (X11; Linux)")).toBe(
      "'Mozilla/5.0 (X11; Linux)'",
    );
  });

  test("control characters are hex-encoded", () => {
    expect(textLiteral("a\nb")).toBe("CAST(X'610a62' AS TEXT)");
  });
});

const DUMP = [
  "COPY public.workspace (id, name, created_at, created_by_user_id, updated_at, updated_by_user_id) FROM stdin;",
  "w1\tHome\t2026-03-01 10:00:00.000001+00\tu1\t2026-03-01 10:00:00.000001+00\tu1",
  "\\.",
  "",
  'COPY public."user" (id, name, email, email_verified, image, created_at, updated_at, google_sub) FROM stdin;',
  "u1\tO'Neil\to@example.com\tt\t\\N\t2026-03-01 09:00:00+00\t2026-03-01 09:00:00+00\t\\N",
  "\\.",
  "",
  "COPY public.verification (id, identifier, value, expires_at, created_at, updated_at) FROM stdin;",
  "v1\tstate\tx\t2026-03-01 09:00:00+00\t2026-03-01 09:00:00+00\t2026-03-01 09:00:00+00",
  "\\.",
].join("\n");

describe("convertDump", () => {
  test("parses blocks, including the quoted user table", () => {
    const blocks = parseCopyBlocks(DUMP);
    expect([...blocks.keys()]).toEqual(["workspace", "user", "verification"]);
    expect(blocks.get("user")!.rows[0]![4]).toBeNull();
  });

  test("emits inserts in dependency order with converted values", () => {
    const { statements, counts, skipped } = convertDump(DUMP);
    expect(statements[0]).toBe("PRAGMA defer_foreign_keys = true;");
    expect(statements[1]).toBe(
      `INSERT INTO "user" ("id", "name", "email", "email_verified", "image", "created_at", "updated_at", "google_sub") VALUES ('u1', 'O''Neil', 'o@example.com', 1, NULL, ${Date.UTC(2026, 2, 1, 9)}, ${Date.UTC(2026, 2, 1, 9)}, NULL);`,
    );
    expect(statements[2]).toStartWith('INSERT INTO "workspace"');
    expect(statements).toHaveLength(3);
    expect(counts.user).toBe(1);
    expect(counts.workspace).toBe(1);
    expect(counts.balance_snapshot).toBe(0);
    expect(skipped).toEqual({ verification: 1 });
  });

  test("rejects unknown tables and columns", () => {
    expect(() =>
      convertDump("COPY public.mystery (id) FROM stdin;\nx\n\\.\n"),
    ).toThrow(/unknown table/);
    expect(() =>
      convertDump("COPY public.workspace (id, surprise) FROM stdin;\nw\tx\n\\.\n"),
    ).toThrow(/column mismatch/);
  });

  test("rejects snapshots that collide after truncating to milliseconds", () => {
    const header =
      "COPY public.balance_snapshot (id, workspace_id, financial_account_id, effective_date, amount_minor_raw, created_at, created_by_user_id, updated_at, updated_by_user_id) FROM stdin;";
    const row = (id: string, micros: string) =>
      `${id}\tw1\ta1\t2026-03-01\t100\t2026-03-01 10:00:00.${micros}+00\tu1\t2026-03-01 10:00:00+00\tu1`;
    expect(() =>
      convertDump([header, row("s1", "123111"), row("s2", "123999"), "\\."].join("\n")),
    ).toThrow(/same millisecond|share account/);
    expect(() =>
      convertDump([header, row("s1", "123111"), row("s2", "124000"), "\\."].join("\n")),
    ).not.toThrow();
  });
});
