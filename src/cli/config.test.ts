import { test, expect } from "bun:test";
import { resolveConfig, DEFAULT_API_URL } from "./config";

test("flags win over env and file", () => {
  const r = resolveConfig(
    { apiUrl: "http://flag", token: "flag-tok" },
    { CASHY_API_URL: "http://env", CASHY_TOKEN: "env-tok" },
    { apiUrl: "http://file", token: "file-tok" },
  );
  expect(r).toEqual({ apiUrl: "http://flag", token: "flag-tok" });
});

test("env wins over file", () => {
  const r = resolveConfig(
    {},
    { CASHY_API_URL: "http://env", CASHY_TOKEN: "env-tok" },
    { apiUrl: "http://file", token: "file-tok" },
  );
  expect(r).toEqual({ apiUrl: "http://env", token: "env-tok" });
});

test("file config used when no flags/env", () => {
  const r = resolveConfig({}, {}, { apiUrl: "http://file", token: "file-tok" });
  expect(r).toEqual({ apiUrl: "http://file", token: "file-tok" });
});

test("defaults: localhost api url, undefined token", () => {
  const r = resolveConfig({}, {}, {});
  expect(r).toEqual({ apiUrl: DEFAULT_API_URL, token: undefined });
});

test("sources mix per-field", () => {
  const r = resolveConfig({ apiUrl: "http://flag" }, {}, { token: "file-tok" });
  expect(r).toEqual({ apiUrl: "http://flag", token: "file-tok" });
});
