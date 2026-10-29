import type { WorkbuddyRegion } from "./types";

export type WorkbuddySite = {
  id: "workbuddy" | "workbuddy-ai";
  region: WorkbuddyRegion;
  label: string;
  endpoint: string;
  platform: string;
  appVersion: string;
  loginHost: string;
};

export const WORKBUDDY_LOGIN_VERSION = "2.0.0";

const SITES: Record<WorkbuddyRegion, WorkbuddySite> = {
  cn: {
    id: "workbuddy",
    region: "cn",
    label: "国内版",
    endpoint: "https://copilot.tencent.com",
    platform: "workbuddy",
    appVersion: "5.9.3",
    loginHost: "www.workbuddy.cn",
  },
  intl: {
    id: "workbuddy-ai",
    region: "intl",
    label: "国际版",
    endpoint: "https://www.workbuddy.ai",
    platform: "workbuddy-ai",
    appVersion: "5.8.4",
    loginHost: "www.workbuddy.ai",
  },
};

export function siteForRegion(region: WorkbuddyRegion): WorkbuddySite {
  return SITES[region];
}

export function normalizeRegion(value: unknown): WorkbuddyRegion | null {
  return value === "cn" || value === "intl" ? value : null;
}

export function regionFromInput(input?: string): WorkbuddyRegion {
  return input === "cn" ? "cn" : "intl";
}

export function endpointHost(region: WorkbuddyRegion): string {
  return new URL(SITES[region].endpoint).host;
}
