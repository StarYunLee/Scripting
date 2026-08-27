import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAccountStore,
  type AccountProfileBase,
} from "../../AI Usage/services/account-store";

type Profile = AccountProfileBase & { accountId: string | null };
type Registry = {
  version: 1;
  defaultAccountId: string | null;
  accounts: Profile[];
};

function profile(id: string, name = id): Profile {
  return {
    id,
    name,
    email: null,
    accountId: null,
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
  };
}

function installRuntime(input: {
  registry?: unknown;
  failWrites?: boolean;
  secrets?: Record<string, string>;
}) {
  const storage = new Map<string, unknown>();
  if (input.registry !== undefined) storage.set("registry", input.registry);
  const secrets = new Map(Object.entries(input.secrets || {}));
  let reads = 0;
  let writes = 0;

  Object.assign(globalThis, {
    Storage: {
      get(key: string) {
        reads += 1;
        return storage.get(key);
      },
      set(key: string, value: unknown) {
        writes += 1;
        if (input.failWrites) return false;
        storage.set(key, value);
        return true;
      },
    },
    Keychain: {
      get(key: string) {
        return secrets.get(key) || null;
      },
      set(key: string, value: string) {
        secrets.set(key, value);
        return true;
      },
      remove(key: string) {
        secrets.delete(key);
      },
    },
  });

  return {
    storage,
    secrets,
    reads: () => reads,
    writes: () => writes,
  };
}

function makeStore(migrate?: (registry: Registry) => Registry) {
  return createAccountStore<Profile>({
    registryKey: "registry",
    secretPrefix: "secret",
    createProfile: ({ id, name, now }) => ({
      id,
      name,
      email: null,
      accountId: null,
      createdAt: now,
      updatedAt: now,
    }),
    migrate: migrate
      ? (registry) => migrate(registry as Registry)
      : undefined,
  });
}

test("accepts an existing versioned registry and reads it once per run", () => {
  const existing: Registry = {
    version: 1,
    defaultAccountId: "a",
    accounts: [profile("a", "Alice")],
  };
  const runtime = installRuntime({ registry: existing });
  const store = makeStore();

  assert.equal(store.resolve()?.name, "Alice");
  assert.equal(store.list()[0].id, "a");
  assert.equal(runtime.reads(), 1);
  assert.equal(runtime.writes(), 0);
});

test("preserves an unversioned legacy registry instead of discarding accounts", () => {
  const runtime = installRuntime({
    registry: {
      defaultAccountId: "legacy",
      accounts: [profile("legacy", "Legacy")],
    },
  });
  const store = makeStore();

  assert.equal(store.resolve()?.name, "Legacy");
  assert.deepEqual(runtime.storage.get("registry"), {
    version: 1,
    defaultAccountId: "legacy",
    accounts: [profile("legacy", "Legacy")],
  });
});

test("fails closed on a future registry version without overwriting it", () => {
  const future = {
    version: 2,
    defaultAccountId: "future",
    accounts: [profile("future", "Future")],
    newField: "must survive",
  };
  const runtime = installRuntime({ registry: future });
  const store = makeStore();

  assert.throws(() => store.list(), /账号数据版本较新/);
  assert.throws(() => store.create("Downgrade"), /账号数据版本较新/);
  assert.deepEqual(runtime.storage.get("registry"), future);
  assert.equal(runtime.writes(), 0);
});

test("does not expose a newly created account when Storage rejects the write", () => {
  const runtime = installRuntime({
    registry: { version: 1, defaultAccountId: null, accounts: [] },
    failWrites: true,
  });
  const store = makeStore();

  assert.throws(() => store.create("Ghost"), /账号保存失败/);
  assert.deepEqual(store.list(), []);
  assert.equal(runtime.writes(), 1);
});

test("deletes secrets only after the account removal is persisted", () => {
  const existing: Registry = {
    version: 1,
    defaultAccountId: "a",
    accounts: [profile("a", "Alice")],
  };
  const failedRuntime = installRuntime({
    registry: existing,
    failWrites: true,
    secrets: { secret_a_access_token: "token" },
  });
  const failedStore = makeStore();
  failedStore.remove("a", ["access_token"]);
  assert.equal(failedRuntime.secrets.get("secret_a_access_token"), "token");

  const savedRuntime = installRuntime({
    registry: existing,
    secrets: { secret_a_access_token: "token" },
  });
  const savedStore = makeStore();
  savedStore.remove("a", ["access_token"]);
  assert.equal(savedRuntime.secrets.has("secret_a_access_token"), false);
});

test("runs a provider migration once and persists only a changed registry", () => {
  const existing: Registry = {
    version: 1,
    defaultAccountId: "a",
    accounts: [profile("a", "Alice")],
  };
  const runtime = installRuntime({ registry: existing });
  let calls = 0;
  const store = makeStore((registry) => {
    calls += 1;
    return {
      ...registry,
      accounts: registry.accounts.map((account) => ({
        ...account,
        email: "alice@example.com",
      })),
    };
  });

  assert.equal(store.ensure().accounts[0].email, "alice@example.com");
  assert.equal(store.ensure().accounts[0].email, "alice@example.com");
  assert.equal(calls, 1);
  assert.equal(runtime.writes(), 1);
});
