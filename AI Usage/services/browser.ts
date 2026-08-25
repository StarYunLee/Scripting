export async function openAuthorizationPage(
  url: string,
): Promise<"present" | "openURL"> {
  try {
    await Safari.present(url, true);
    return "present";
  } catch {
    const opened = await Safari.openURL(url);
    if (!opened) throw new Error("无法打开授权页");
    return "openURL";
  }
}
