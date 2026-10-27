import { afterEach, describe, expect, it } from "vitest";
import { createPostgresFixture } from "./helpers/postgres-fixture";

const original = {
  url: process.env.TEST_DATABASE_URL,
  confirmed: process.env.MAXPASE_CI_DATABASE_CONFIRMED
};

afterEach(() => {
  if (original.url === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = original.url;
  if (original.confirmed === undefined) delete process.env.MAXPASE_CI_DATABASE_CONFIRMED;
  else process.env.MAXPASE_CI_DATABASE_CONFIRMED = original.confirmed;
});

describe("isolated PostgreSQL fixture gate", () => {
  it("refuses a missing target", () => {
    delete process.env.TEST_DATABASE_URL;
    process.env.MAXPASE_CI_DATABASE_CONFIRMED = "true";
    expect(() => createPostgresFixture()).toThrow("dedicated PostgreSQL test database");
  });

  it.each([
    "postgresql://user:password@production.invalid:5432/maxpase_ci?schema=public",
    "postgresql://user:password@127.0.0.1:5432/maxpase?schema=public",
    "postgresql://user:password@127.0.0.1:5432/maxpase_ci?schema=private",
    "postgresql://user:password@127.0.0.1:5432/maxpase_ci?schema=public&host=production.invalid",
    "postgresql://user:password@127.0.0.1:5432/maxpase_ci?schema=public&schema=private",
    "file:/tmp/maxpase_ci.db"
  ])("refuses an unsafe target", url => {
    process.env.TEST_DATABASE_URL = url;
    process.env.MAXPASE_CI_DATABASE_CONFIRMED = "true";
    expect(() => createPostgresFixture()).toThrow("Refusing an unconfirmed or non-local PostgreSQL test target");
  });

  it("requires explicit confirmation even for the local test name", () => {
    process.env.TEST_DATABASE_URL = "postgresql://user:password@127.0.0.1:5432/maxpase_ci?schema=public";
    delete process.env.MAXPASE_CI_DATABASE_CONFIRMED;
    expect(() => createPostgresFixture()).toThrow("Refusing an unconfirmed or non-local PostgreSQL test target");
  });
});
