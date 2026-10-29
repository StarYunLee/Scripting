import { fetch } from "scripting";
import {
  assertCurrentAccountWork,
  captureAccountWork,
} from "../../services/account-work-guard";
import { createUsageCache } from "../../services/usage-cache";
import {
  getProfileAccessToken,
  getProfileDomain,
  getProfileEnterpriseId,
  getProfileRegion,
  getProfileUid,
  resolveProfile,
} from "./accounts";
import { refreshOAuthToken } from "./oauth";
import { endpointHost, siteForRegion, type WorkbuddySite } from "./regions";
import { beijingDay } from "./format";
import {
  buildWindows,
  parseCheckin,
  parseEnterprise,
  parsePackages,
  parseSummary,
  summaryCapacity,
} from "./usage-parser";
import type {
  UsageResult,
  UsageSnapshot,
  WorkbuddyCheckinStatus,
  WorkbuddyEnterpriseUsage,
  WorkbuddyPackageDetail,
  WorkbuddySummary,
} from "./types";

const CACHE_KEY = "ai_usage_workbuddy_cache_v2";
const MIN_LIVE_INTERVAL_MS = 3 * 60_000;

const CODE = (number: string, suffix: string) =>
  `TCACA_code_${number}_${suffix}`;
const DAILY_CODE = CODE("001", "PqouKr6QWV");
const PAID_CODES = [
  CODE("002", "AkiJS3ZHF5"),
  CODE("005", "maRGyrHhw1"),
  CODE("003", "FAnt7lcmRT"),
  CODE("023", "4xbGhMrE6q"),
  CODE("026", "BaESVICNoi"),
  CODE("027", "0FCGVA6vSa"),
  CODE("009", "0XmEQc2xOf"),
  CODE("038", "OhvqZtiPKr"),
  CODE("036", "lupO5WgNdG"),
];
const FREE_CODES = [
  DAILY_CODE,
  CODE("008", "cfWoLwvjU4"),
  CODE("035", "ArVxJcGDsm"),
  CODE("006", "DbXS0lrypC"),
  CODE("039", "KRcQj7wUat"),
  CODE("040", "mi9rCYg46x"),
  CODE("007", "nzdH5h4Nl0"),
  CODE("028", "NtpWi0jzXs"),
  CODE("037", "WxOD3MpI2o"),
  CODE("029", "6wCGEWquYy"),
  CODE("030", "BjSt89qTvr"),
];

const usageCache = createUsageCache<UsageSnapshot>({
  keyPrefix: `${CACHE_KEY}_`,
  resolveProfileId: (profileId) => resolveProfile(profileId)?.id || null,
  recentMs: MIN_LIVE_INTERVAL_MS,
});

type MeterReply = {
  ok: boolean;
  status: number;
  code: number;
  msg: string;
  data: Record<string, unknown> | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  return null;
}

function headers(
  site: WorkbuddySite,
  token: string,
  uid: string | null,
  domain: string | null,
  enterpriseId: string | null,
  withAuth = true,
): Record<string, string> {
  const out: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": `WorkBuddy/${site.appVersion}`,
    "X-Product": "SaaS",
    "X-IDE-Type": "WorkBuddy",
  };
  if (withAuth) {
    out.Authorization = `Bearer ${token}`;
    out["X-User-Id"] = uid || "";
    out["X-Domain"] = domain || endpointHost(site.region);
  }
  if (enterpriseId) {
    out["X-Enterprise-Id"] = enterpriseId;
    out["X-Tenant-Id"] = enterpriseId;
  }
  return out;
}

async function meter(
  site: WorkbuddySite,
  path: string,
  token: string,
  uid: string | null,
  domain: string | null,
  enterpriseId: string | null,
  body: Record<string, unknown>,
): Promise<MeterReply> {
  let response;
  try {
    response = await fetch(site.endpoint + path, {
      method: "POST",
      headers: headers(site, token, uid, domain, enterpriseId),
      body: JSON.stringify(body),
      timeout: 20,
      debugLabel: `Workbuddy${site.region === "cn" ? "Cn" : "Intl"}Meter`,
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: 0,
      msg: error instanceof Error ? error.message : "网络请求失败",
      data: null,
    };
  }
  const text = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }
  const code = Number(parsed?.code ?? 0);
  return {
    ok: response.ok,
    status: response.status,
    code: Number.isFinite(code) ? code : 0,
    msg:
      typeof parsed?.msg === "string"
        ? parsed.msg
        : typeof parsed?.message === "string"
          ? parsed.message
          : "",
    data: asObject(parsed?.data),
  };
}

function packageBody(
  codes: string[],
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    PackageCodes: codes,
    PageNumber: 1,
    PageSize: 200,
    Status: [0, 3],
    ...extra,
  };
}

/** 子请求只有 HTTP 成功、业务 code 0 且带 data 才算有效响应。 */
function accepted(reply: MeterReply): boolean {
  return reply.ok && reply.code === 0 && reply.data != null;
}

async function fetchPackageList(
  site: WorkbuddySite,
  path: string,
  body: Record<string, unknown>,
  token: string,
  uid: string | null,
  domain: string | null,
  enterpriseId: string | null,
): Promise<WorkbuddyPackageDetail[]> {
  try {
    const reply = await meter(
      site,
      path,
      token,
      uid,
      domain,
      enterpriseId,
      body,
    );
    // 包明细只是补充信息：失败时保留 summary 的主额度，不拖垮整次读取。
    if (!accepted(reply) || !reply.data) return [];
    return parsePackages(reply.data);
  } catch {
    return [];
  }
}

async function fetchCheckin(
  site: WorkbuddySite,
  token: string,
  uid: string | null,
  domain: string | null,
  enterpriseId: string | null,
): Promise<WorkbuddyCheckinStatus | null> {
  // 国际站没有签到活动，null 在这里是“明确不开放”。
  if (site.region !== "cn") return null;
  try {
    const reply = await meter(
      site,
      "/v2/billing/meter/checkin-activity-status",
      token,
      uid,
      domain,
      enterpriseId,
      {},
    );
    // 国内站的 null 表示读取失败（请求失败/空响应/非法 shape），
    // 与 active:false 的“明确未开放”由 buildWindows 区分。
    if (!accepted(reply) || !reply.data) return null;
    return parseCheckin(reply.data);
  } catch {
    return null;
  }
}


export function getCachedUsage(profileId?: string | null): UsageSnapshot | null {
  return usageCache.read(profileId);
}

export function clearUsageCache(profileId?: string | null): void {
  usageCache.clear(profileId);
}

export async function fetchUsage(options?: {
  force?: boolean;
  profileId?: string | null;
}): Promise<UsageResult> {
  const profile = resolveProfile(options?.profileId);
  if (!profile) {
    return {
      ok: false,
      error: { code: "missing_token", message: "未找到指定账号" },
      cache: null,
    };
  }
  const cache = usageCache.read(profile.id);
  if (!options?.force && usageCache.recent(cache)) {
    return { ok: true, snapshot: cache! };
  }

  let token = await refreshOAuthToken(profile.id);
  if (!token) token = getProfileAccessToken(profile.id);
  if (!token) {
    return {
      ok: false,
      error: {
        code: "missing_token",
        message: `账号“${profile.name}”尚未完成 WorkBuddy 授权`,
      },
      cache,
    };
  }

  const region = getProfileRegion(profile.id) || "intl";
  const site = siteForRegion(region);
  const uid = getProfileUid(profile.id);
  const domain = getProfileDomain(profile.id);
  const enterpriseId = getProfileEnterpriseId(profile.id);
  const currentWork = captureAccountWork("workbuddy", profile.id);

  try {
    let summaryReply = await meter(
      site,
      "/billing/meter/get-user-resource-summary",
      token,
      uid,
      domain,
      enterpriseId,
      {},
    );
    if (summaryReply.status === 401) {
      const renewed = await refreshOAuthToken(profile.id, true);
      if (renewed && renewed !== token) {
        token = renewed;
        summaryReply = await meter(
          site,
          "/billing/meter/get-user-resource-summary",
          token,
          uid,
          domain,
          enterpriseId,
          {},
        );
      }
    }
    if (!summaryReply.ok || summaryReply.code !== 0 || !summaryReply.data) {
      const unauthorized =
        summaryReply.status === 401 || summaryReply.code === 401;
      const restricted = summaryReply.code === 11140;
      const message = unauthorized
        ? "WorkBuddy 登录已失效，请重新授权"
        : restricted
          ? "WorkBuddy 账号被限制，请在 WorkBuddy 内提交反馈"
          : summaryReply.msg ||
            `WorkBuddy 用量请求失败（HTTP ${summaryReply.status || "?"}）`;
      const recovered = usageCache.recoverRecent(
        profile.id,
        Boolean(options?.force),
      );
      if (recovered) return recovered;
      return {
        ok: false,
        error: {
          code: unauthorized
            ? "unauthorized"
            : restricted
              ? "restricted"
              : "http_error",
          message,
          status: summaryReply.status || undefined,
          detail: summaryReply.msg || undefined,
        },
        cache: usageCache.read(profile.id) || cache,
      };
    }

    const summary: WorkbuddySummary = parseSummary(summaryReply.data);
    const day = beijingDay();
    const [paid, free] = await Promise.all([
      fetchPackageList(
        site,
        "/billing/meter/get-user-resource-paid-packages",
        packageBody(PAID_CODES, { NeedRenewInfo: true }),
        token,
        uid,
        domain,
        enterpriseId,
      ),
      fetchPackageList(
        site,
        "/billing/meter/get-user-resource-free-packages",
        packageBody(FREE_CODES, {
          SlicePeriodStartTime: `${day} 00:00:00`,
          SlicePeriodEndTime: `${day} 23:59:59`,
        }),
        token,
        uid,
        domain,
        enterpriseId,
      ),
    ]);

    // 与 buildWindows 用同一份划分：有总额（含 0 总额）或真实预付费余额时，
    // summary 已经能给出主窗口，不必再查企业计量（上游同样只在无窗口时查）。
    const capacitySummary = summaryCapacity(summary, [...paid, ...free]);
    const needsEnterprise =
      capacitySummary.total <= 0 && capacitySummary.prepaidCodes.length === 0;
    let enterprise: WorkbuddyEnterpriseUsage | null = null;
    if (needsEnterprise) {
      let reply: MeterReply = {
        ok: false,
        status: 0,
        code: 0,
        msg: "",
        data: null,
      };
      try {
        reply = await meter(
          site,
          "/billing/meter/get-enterprise-user-usage",
          token,
          uid,
          domain,
          enterpriseId,
          {},
        );
      } catch (error) {
        reply = {
          ok: false,
          status: 0,
          code: 0,
          msg: error instanceof Error ? error.message : "",
          data: null,
        };
      }
      enterprise = accepted(reply) ? parseEnterprise(reply.data) : null;
      if (!enterprise) {
        // 没有主额度、企业计量又失败/无效：返回可解释的错误并保留旧快照，
        // 不写一个只有签到窗口的 live 成功覆盖旧数据。
        return {
          ok: false,
          error: {
            code:
              reply.status === 0
                ? "network_error"
                : reply.ok
                  ? "unknown"
                  : "http_error",
            message: reply.msg
              ? `WorkBuddy 用量响应字段不完整或当前账号无可用额度：${reply.msg}`
              : "WorkBuddy 用量响应字段不完整或当前账号无可用额度",
            status: reply.ok ? undefined : reply.status || undefined,
            detail: reply.msg || undefined,
          },
          cache: usageCache.read(profile.id) || cache,
        };
      }
    }
    // 签到是独立的附加信息：读取失败只影响签到窗口，不影响主额度。
    const checkin = await fetchCheckin(site, token, uid, domain, enterpriseId);
    const built = buildWindows({
      summary,
      paid,
      free,
      enterprise,
      checkin,
      region,
    });
    const hasPrimary = built.windows.some(
      (window) =>
        window.id === "workbuddy:credits" || window.id === "workbuddy:prepaid",
    );
    if (!hasPrimary) {
      return {
        ok: false,
        error: {
          code: "unknown",
          message: "WorkBuddy 用量响应字段不完整或当前账号无可用额度",
        },
        cache: usageCache.read(profile.id) || cache,
      };
    }
    const snapshot: UsageSnapshot = {
      windows: built.windows,
      planLabel: built.planLabel,
      region,
      fetchedAt: new Date().toISOString(),
      source: "live",
    };
    assertCurrentAccountWork(
      currentWork,
      getProfileAccessToken(profile.id) === token,
    );
    const storageAccepted = usageCache.write(profile.id, snapshot);
    return { ok: true, snapshot, storageAccepted };
  } catch (error) {
    const recovered = usageCache.recoverRecent(
      profile.id,
      Boolean(options?.force),
    );
    if (recovered) return recovered;
    return {
      ok: false,
      error: {
        code: "network_error",
        message: error instanceof Error ? error.message : "WorkBuddy 请求失败",
        detail: error instanceof Error ? error.message : String(error),
      },
      cache: usageCache.read(profile.id) || cache,
    };
  }
}
