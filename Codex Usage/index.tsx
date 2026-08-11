import { Button, List, Navigation, NavigationStack, Picker, Script, Section, Text, TextField, Widget, useState } from "scripting"
import { clearUsageCache, fetchUsage, getCachedUsage, pickFocusWindow } from "./services/api"
import { clearProfileSettings, getEffectiveSettings, hasProfileSettings, setProfileSettings, setReloadMinutes } from "./services/credentials"
import {
  createAccount, deleteAccount, ensureAccountMigration, getDefaultProfileId,
  getProfileAccessToken, listAccounts, resolveProfile, setDefaultAccount,
} from "./services/accounts"
import {
  clearPendingOAuth, completeOpenAILogin, getPendingOAuthProfileId,
  hasPendingOAuth, startOpenAILogin,
} from "./services/oauth"
import { formatCountdown, formatFetchedAt, formatPercent, formatResetDate } from "./services/format"
import type { CodexAccountProfile, UsageSnapshot } from "./services/types"

declare const Pasteboard: { setString(value: string | null): Promise<void> }
ensureAccountMigration()

function summary(snapshot: UsageSnapshot | null): string {
  if (!snapshot) return "暂无数据，请刷新此账号"
  const window = pickFocusWindow(snapshot, "weekly")
  return [
    `套餐：${snapshot.planLabel || snapshot.planType || "未提供"}`,
    `${window?.label || "限额"}：已用 ${formatPercent(window?.usedPercent)} · 剩余 ${formatPercent(window?.remainingPercent)}`,
    `重置时间：${formatResetDate(window?.resetAt)}（${formatCountdown(window?.resetAt)}）`,
    `重置次数：${snapshot.resetCreditsAvailable == null ? "未提供" : snapshot.resetCreditsAvailable + " 次"}`,
    `更新时间：${formatFetchedAt(snapshot.fetchedAt)}`,
  ].join("\n")
}
function App() {
  const initial = listAccounts()
  const pendingInitial = getPendingOAuthProfileId()
  const [accounts, setAccounts] = useState<CodexAccountProfile[]>(initial)
  const [selectedId, setSelectedId] = useState(pendingInitial || getDefaultProfileId() || initial[0]?.id || "")
  const [authTargetId, setAuthTargetId] = useState(pendingInitial || "")
  const [callbackUrl, setCallbackUrl] = useState("")
  const [status, setStatus] = useState(hasPendingOAuth() ? "存在待完成的 OpenAI 授权" : "")
  const [usageText, setUsageText] = useState(() => summary(getCachedUsage(selectedId)))
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState("")
  const [widgetSettings, setWidgetSettingsState] = useState(() => getEffectiveSettings(pendingInitial || getDefaultProfileId() || initial[0]?.id || ""))
  const selected = resolveProfile(selectedId)
  const authTarget = resolveProfile(authTargetId)

  function refreshRegistry(preferId?: string) {
    const next = listAccounts(); setAccounts([...next])
    const wanted = preferId || selectedId || getDefaultProfileId() || next[0]?.id || ""
    const id = next.some(a => a.id === wanted) ? wanted : (getDefaultProfileId() || next[0]?.id || "")
    setSelectedId(id); setUsageText(summary(getCachedUsage(id))); setWidgetSettingsState(getEffectiveSettings(id)); setDeleteArmed(false)
  }
  function selectAccount(id: string) {
    setSelectedId(id); setUsageText(summary(getCachedUsage(id))); setWidgetSettingsState(getEffectiveSettings(id)); setStatus(""); setDeleteArmed(false)
  }
  function reloadWidgets() { try { Widget.reloadUserWidgets() } catch { try { Widget.reloadAll() } catch {} } }
  function updateProfileWidgetSettings(patch: Parameters<typeof setProfileSettings>[1]) {
    if (!selectedId) return
    const next = setProfileSettings(selectedId, patch); setWidgetSettingsState({ ...next }); reloadWidgets()
  }
  function updateReloadMinutes(reloadMinutes: number) {
    setReloadMinutes(reloadMinutes)
    const next = getEffectiveSettings(selectedId); setWidgetSettingsState({ ...next }); reloadWidgets()
  }
  function restoreProfileDefaults() {
    if (!selectedId) return
    const next = clearProfileSettings(selectedId); setWidgetSettingsState({ ...next }); setStatus("当前账号已恢复默认显示设置"); reloadWidgets()
  }
  async function refreshSelected() {
    if (!selectedId) return
    setUsageText("正在刷新…")
    const result = await fetchUsage({ force: true, profileId: selectedId })
    if (result.ok) { setUsageText(summary(result.snapshot)); setStatus("数据已更新"); reloadWidgets() }
    else setUsageText(`刷新失败：${result.error.message}${result.cache ? "\n\n缓存：\n" + summary(result.cache) : ""}`)
  }
  async function beginAuth(profileId: string) {
    setAuthTargetId(profileId); setCallbackUrl("")
    const profile = resolveProfile(profileId); setStatus(`正在授权 ${profile?.email || profile?.name || "账号"}…`)
    try { await startOpenAILogin(profileId) } catch (e) { setStatus("启动授权失败：" + (e instanceof Error ? e.message : String(e))) }
  }
  async function addAndAuthorize() {
    const account = createAccount(); refreshRegistry(account.id); await beginAuth(account.id)
  }
  function cancelAuth() {
    const target = resolveProfile(authTargetId)
    clearPendingOAuth(); setCallbackUrl(""); setAuthTargetId(""); setStatus("已取消授权")
    // 未完成授权的临时账号直接清理，避免留下“账号 N”。
    if (target && !getProfileAccessToken(target.id)) { clearUsageCache(target.id); clearProfileSettings(target.id); deleteAccount(target.id); refreshRegistry() }
  }

  return <NavigationStack><List navigationTitle="Codex Usage">
    <Section header={<Text>账号切换</Text>} footer={<Text>点击账号后，下方“当前用量”和“账号管理”会同步切换。</Text>}>
      {accounts.map(account => <Button key={account.id} title={`${account.id === selectedId ? "✓ " : ""}${account.email || account.name}${account.id === getDefaultProfileId() ? " · 默认" : ""}`} action={() => selectAccount(account.id)}/>) }
      <Button title="添加 Codex 账号" action={addAndAuthorize}/>
    </Section>

    {selected ? <Section header={<Text>账号操作 · {selected.email || selected.name}</Text>} footer={<Text>{authTarget ? `此回调将保存到当前账号，授权成功后输入区自动收起。` : `默认账号用于参数为空的小组件。`}</Text>}>
      {status ? <Text>{status}</Text> : null}

      {authTarget ? <>
        <TextField title="回调 URL" value={callbackUrl} onChanged={setCallbackUrl} prompt="localhost:1455/auth/callback?code=…&state=…"/>
        <Button title="验证回调并完成授权" action={async () => {
          try {
            setStatus("正在验证回调…"); await completeOpenAILogin(callbackUrl); const completedId = authTarget.id
            setCallbackUrl(""); setAuthTargetId(""); refreshRegistry(completedId); setStatus("授权成功")
            const result = await fetchUsage({ force: true, profileId: completedId })
            if (result.ok) { setUsageText(summary(result.snapshot)); reloadWidgets() }
          } catch (e) { setCallbackUrl(""); setStatus("授权失败：" + (e instanceof Error ? e.message : String(e))) }
        }}/>
        <Button title="取消授权" action={cancelAuth}/>
      </> : <>
        {selected.id !== getDefaultProfileId() ? <Button title="设为默认账号" action={() => { setDefaultAccount(selected.id); refreshRegistry(selected.id); setStatus("已设为默认账号") }}/> : <Text font={12} foregroundStyle="secondary">当前是默认账号</Text>}
        <Button title={getProfileAccessToken(selected.id) ? "重新授权" : "授权此账号"} action={() => beginAuth(selected.id)}/>
      </>}
    </Section> : null}

    {selected ? <Section header={<Text>账号管理 · {selected.email || selected.name}</Text>} footer={<Text>删除后会清除该账号的 OAuth 凭证、本机用量缓存和独立显示设置，此操作不可撤销。</Text>}>
      {!deleteArmed ? <Button title="删除当前账号…" action={() => setDeleteArmed(true)}/> : <>
        <Text foregroundStyle="systemRed">确认删除当前账号 {selected.email || selected.name}？</Text>
        <Button title="确认删除当前账号" action={() => { const id = selected.id; clearUsageCache(id); clearProfileSettings(id); deleteAccount(id); refreshRegistry(); setStatus("当前账号已删除"); reloadWidgets() }}/>
        <Button title="取消" action={() => setDeleteArmed(false)}/>
      </>}
    </Section> : null}

    {selected ? <Section header={<Text>当前用量 · {selected.email || selected.name}</Text>} footer={<Text>点击顶部其他邮箱，可直接切换此处内容。</Text>}>
      <Text>{usageText}</Text>
      <Button title="刷新当前账号" action={refreshSelected}/>
    </Section> : null}

    <Section header={<Text>主屏幕多账号小组件</Text>} footer={<Text>给每个小组件的“参数”填写一个账号邮箱；参数为空时显示默认账号。</Text>}>
      {accounts.filter(a => a.email).map(account => <Button key={account.id} title={`${copiedEmail === account.email ? "✓ 已复制 " : "复制 "}${account.email}`} action={async () => { await Pasteboard.setString(account.email); setCopiedEmail(account.email || "") }}/>) }
      <Text font={12} foregroundStyle="secondary">长按主屏幕小组件 → 编辑小组件 → 参数 → 粘贴邮箱。</Text>
    </Section>

    {selected ? <Section header={<Text>小组件设置 · {selected.email || selected.name}</Text>} footer={<Text>布局和显示选项仅应用于当前账号；刷新频率对所有账号生效。</Text>}>
      <Picker
        title="组件布局"
        value={widgetSettings.widgetLayout}
        onChanged={(value) => updateProfileWidgetSettings({ widgetLayout: value as "detail" | "overview" })}
        pickerStyle="navigationLink"
      >
        <Text tag="detail">单额度详情</Text>
        <Text tag="overview">双额度概览</Text>
      </Picker>
      <Picker
        title="用量显示"
        value={widgetSettings.displayMode}
        onChanged={(value) => updateProfileWidgetSettings({ displayMode: value as "used" | "remaining" })}
        pickerStyle="navigationLink"
      >
        <Text tag="used">已用</Text>
        <Text tag="remaining">剩余</Text>
      </Picker>
      {widgetSettings.widgetLayout === "detail" ? <Picker
        title="显示额度"
        value={widgetSettings.focusWindow}
        onChanged={(value) => updateProfileWidgetSettings({ focusWindow: value as "five_hour" | "weekly" | "monthly" })}
        pickerStyle="navigationLink"
      >
        <Text tag="five_hour">5 小时额度</Text>
        <Text tag="weekly">每周额度</Text>
        <Text tag="monthly">每月额度</Text>
      </Picker> : null}
      <Picker
        title="刷新频率"
        value={String(widgetSettings.reloadMinutes)}
        onChanged={(value) => updateReloadMinutes(Number(value))}
        pickerStyle="navigationLink"
      >
        <Text tag="5">5 分钟</Text>
        <Text tag="10">10 分钟</Text>
        <Text tag="15">15 分钟</Text>
        <Text tag="30">30 分钟</Text>
        <Text tag="60">60 分钟</Text>
      </Picker>
      {hasProfileSettings(selectedId) ? <Button title="恢复当前账号默认显示设置" action={restoreProfileDefaults}/> : <Text font={12} foregroundStyle="secondary">当前账号使用全局默认显示设置</Text>}
    </Section> : null}
  </List></NavigationStack>
}
Navigation.present({ element: <App /> }).then(() => Script.exit())
