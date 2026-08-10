import type { AccountRegistry, CodexAccountProfile } from "./types"

const REGISTRY_KEY = "codex_account_registry_v1"
const LEGACY = {
  access: "codex_access_token", refresh: "codex_refresh_token", id: "codex_id_token",
  expires: "codex_token_expires_at", account: "codex_account_id",
}

declare const Keychain: {
  set(key: string, value: string, options?: object): boolean
  get(key: string, options?: object): string | null
  remove(key: string, options?: object): boolean
}
declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null
  set<T = any>(key: string, value: T, options?: { shared?: boolean }): boolean
}

const emptyRegistry = (): AccountRegistry => ({ version: 1, defaultAccountId: null, accounts: [] })
function secretKey(profileId: string, field: string): string { return `codex_profile_${profileId}_${field}` }
function getSecretRaw(key: string): string | null {
  try { const value = Keychain.get(key); return typeof value === "string" && value.trim() ? value.trim() : null } catch { return null }
}
function setSecretRaw(key: string, value: string | null): boolean {
  try { if (!value) { Keychain.remove(key); return true }; return Keychain.set(key, value.trim()) } catch { return false }
}
function jwtEmail(token: string | null): string | null {
  if (!token) return null
  try {
    let raw = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    while (raw.length % 4) raw += "="
    const payload = JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""))) as Record<string, unknown>
    const profile = payload["https://api.openai.com/profile"] as Record<string, unknown> | undefined
    const value = payload.email ?? profile?.email
    return typeof value === "string" && value.includes("@") ? value : null
  } catch { return null }
}
function makeId(): string {
  return `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
function readRegistryRaw(): AccountRegistry {
  try {
    const value = Storage.get<AccountRegistry>(REGISTRY_KEY)
    if (value?.version === 1 && Array.isArray(value.accounts)) return value
  } catch { /* ignore */ }
  return emptyRegistry()
}
function writeRegistry(value: AccountRegistry): AccountRegistry {
  try { Storage.set(REGISTRY_KEY, value) } catch { /* ignore */ }
  return value
}

/** 把旧单账号 Keychain 原地复制为“账号 1”，旧键保留作回滚。 */
export function ensureAccountMigration(): AccountRegistry {
  let registry = readRegistryRaw()
  if (registry.accounts.length) {
    let changed = false
    const accounts = registry.accounts.map(account => {
      if (account.email) return account
      const email = jwtEmail(getSecretRaw(secretKey(account.id, "id_token")))
      if (!email) return account
      changed = true
      return { ...account, email, name: email, updatedAt: new Date().toISOString() }
    })
    if (changed) registry = writeRegistry({ ...registry, accounts })
    return registry
  }
  const access = getSecretRaw(LEGACY.access)
  if (!access) return registry
  const now = new Date().toISOString()
  const email = jwtEmail(getSecretRaw(LEGACY.id))
  const profile: CodexAccountProfile = { id: makeId(), name: email || "账号 1", email, accountId: getSecretRaw(LEGACY.account), createdAt: now, updatedAt: now }
  setSecretRaw(secretKey(profile.id, "access_token"), access)
  setSecretRaw(secretKey(profile.id, "refresh_token"), getSecretRaw(LEGACY.refresh))
  setSecretRaw(secretKey(profile.id, "id_token"), getSecretRaw(LEGACY.id))
  setSecretRaw(secretKey(profile.id, "expires_at"), getSecretRaw(LEGACY.expires))
  setSecretRaw(secretKey(profile.id, "account_id"), profile.accountId)
  registry = { version: 1, defaultAccountId: profile.id, accounts: [profile] }
  return writeRegistry(registry)
}
export function getAccountRegistry(): AccountRegistry { return ensureAccountMigration() }
export function listAccounts(): CodexAccountProfile[] { return getAccountRegistry().accounts }
export function getDefaultProfileId(): string | null {
  const r = getAccountRegistry()
  return r.defaultAccountId || r.accounts[0]?.id || null
}
export function resolveProfile(profileId?: string | null): CodexAccountProfile | null {
  const r = getAccountRegistry()
  if (profileId) {
    const query = profileId.trim().toLowerCase()
    return r.accounts.find(a =>
      a.id.toLowerCase() === query ||
      a.email?.toLowerCase() === query ||
      a.name.toLowerCase() === query
    ) || null
  }
  return r.accounts.find(a => a.id === r.defaultAccountId) || r.accounts[0] || null
}
export function createAccount(name = ""): CodexAccountProfile {
  const r = getAccountRegistry(); const now = new Date().toISOString()
  const profile: CodexAccountProfile = { id: makeId(), name: name.trim() || `账号 ${r.accounts.length + 1}`, email: null, accountId: null, createdAt: now, updatedAt: now }
  writeRegistry({ ...r, defaultAccountId: r.defaultAccountId || profile.id, accounts: [...r.accounts, profile] })
  return profile
}
export function setDefaultAccount(profileId: string): void {
  const r = getAccountRegistry(); if (!r.accounts.some(a => a.id === profileId)) return
  writeRegistry({ ...r, defaultAccountId: profileId })
}
export function updateProfileIdentity(profileId: string, identity: { accountId?: string | null; email?: string | null }): void {
  const r = getAccountRegistry()
  writeRegistry({ ...r, accounts: r.accounts.map(a => {
    if (a.id !== profileId) return a
    const email = identity.email || a.email || null
    return { ...a, accountId: identity.accountId || a.accountId, email, name: email || a.name, updatedAt: new Date().toISOString() }
  }) })
}
export function deleteAccount(profileId: string): void {
  const r = getAccountRegistry(); const accounts = r.accounts.filter(a => a.id !== profileId)
  for (const field of ["access_token", "refresh_token", "id_token", "expires_at", "account_id"]) setSecretRaw(secretKey(profileId, field), null)
  writeRegistry({ ...r, accounts, defaultAccountId: r.defaultAccountId === profileId ? accounts[0]?.id || null : r.defaultAccountId })
}
export function getProfileAccessToken(profileId?: string | null): string | null { const p = resolveProfile(profileId); return p ? getSecretRaw(secretKey(p.id, "access_token")) : null }
export function getProfileRefreshToken(profileId?: string | null): string | null { const p = resolveProfile(profileId); return p ? getSecretRaw(secretKey(p.id, "refresh_token")) : null }
export function getProfileAccountId(profileId?: string | null): string | null { const p = resolveProfile(profileId); return p ? getSecretRaw(secretKey(p.id, "account_id")) || p.accountId : null }
export function getProfileTokenExpiresAt(profileId?: string | null): number | null { const p = resolveProfile(profileId); const raw = p ? getSecretRaw(secretKey(p.id, "expires_at")) : null; const n = raw ? Number(raw) : NaN; return Number.isFinite(n) ? n : null }
export function saveProfileCredentials(profileId: string, value: { accessToken: string; refreshToken?: string | null; idToken?: string | null; expiresAt?: number | null; accountId?: string | null; email?: string | null }): boolean {
  const p = resolveProfile(profileId); if (!p) return false
  const ok = setSecretRaw(secretKey(p.id, "access_token"), value.accessToken)
  if (value.refreshToken) setSecretRaw(secretKey(p.id, "refresh_token"), value.refreshToken)
  if (value.idToken) setSecretRaw(secretKey(p.id, "id_token"), value.idToken)
  if (value.expiresAt) setSecretRaw(secretKey(p.id, "expires_at"), String(value.expiresAt))
  if (value.accountId) setSecretRaw(secretKey(p.id, "account_id"), value.accountId)
  if (value.accountId || value.email) updateProfileIdentity(p.id, { accountId: value.accountId, email: value.email })
  return ok
}
