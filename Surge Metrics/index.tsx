import {
  Button,
  List,
  Navigation,
  NavigationStack,
  Picker,
  Script,
  Section,
  Text,
  TextField,
  Toggle,
  Widget,
  useState,
} from "scripting"
import { LargeWidgetView } from "./components/LargeWidgetView"
import { MediumWidgetView } from "./components/MediumWidgetView"
import { formatFetchedAtWithSeconds, maskKey } from "./services/format"
import { fetchMetrics, getCachedMetrics, testConnection } from "./services/metrics"
import {
  clearCache,
  getConnection,
  getSettings,
  setConnection,
  setSettings,
} from "./services/settings"
import type { ConnectionConfig, MetricsResult, WidgetSettings } from "./services/types"

function reloadWidgets() {
  try {
    Widget.reloadAll()
  } catch {
    /* ignore */
  }
}

function App() {
  const initialConnection = getConnection()
  const initialSettings = getSettings()
  const [host, setHost] = useState(initialConnection.host)
  const [port, setPort] = useState(String(initialConnection.port))
  const [apiKey, setApiKey] = useState(initialConnection.apiKey)
  const [useTls, setUseTls] = useState(initialConnection.useTls)
  const [reloadMinutes, setReloadMinutes] = useState(String(initialSettings.reloadMinutes))
  const [status, setStatus] = useState(initialConnection.apiKey.trim() ? "已加载本地配置" : "请填写本机 Surge HTTP API")
  const [preview, setPreview] = useState<MetricsResult | null>(() => {
    const cache = getCachedMetrics()
    return cache ? { ok: true, snapshot: cache } : null
  })
  const [busy, setBusy] = useState(false)
  const [saveTitle, setSaveTitle] = useState("保存")

  function markEdited() {
    setSaveTitle("保存")
  }

  function saveConnection(): ConnectionConfig {
    const parsedPort = Number(port)
    return setConnection({
      host: host.trim() || "127.0.0.1",
      port: Number.isFinite(parsedPort) ? parsedPort : 6171,
      apiKey: apiKey.trim(),
      useTls,
    })
  }

  function saveSettings(): WidgetSettings {
    const minutes = Number(reloadMinutes)
    return setSettings({
      reloadMinutes: Number.isFinite(minutes) ? minutes : 5,
    })
  }

  function onSave() {
    const conn = saveConnection()
    const settings = saveSettings()
    setStatus(`已保存 · ${conn.host}:${conn.port} · 刷新 ${settings.reloadMinutes} 分钟 · Key ${maskKey(conn.apiKey)}`)
    setSaveTitle("已保存")
    reloadWidgets()
  }

  async function onTest() {
    setBusy(true)
    saveConnection()
    saveSettings()
    setStatus("正在测试连通…")
    try {
      const result = await testConnection()
      setStatus(result.ok ? result.message : `失败：${result.message}${result.detail ? " · " + result.detail : ""}`)
    } catch (error) {
      setStatus("测试异常：" + (error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }

  async function onRefresh() {
    setBusy(true)
    saveConnection()
    saveSettings()
    setStatus("正在拉取 metrics…")
    try {
      const result = await fetchMetrics()
      setPreview(result)
      if (result.ok) {
        setStatus(`已更新 · ${formatFetchedAtWithSeconds(result.snapshot.fetchedAt)} · 接口 ${result.snapshot.interfaces.length}`)
        reloadWidgets()
      } else {
        setStatus(`拉取失败：${result.error.message}${result.error.detail ? " · " + result.error.detail : ""}`)
      }
    } catch (error) {
      setStatus("刷新异常：" + (error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }

  function onClearCache() {
    clearCache()
    setPreview(null)
    setStatus("已清除本地数据缓存")
    reloadWidgets()
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="Surge 监控"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          topBarTrailing: <Button title={saveTitle} action={onSave} />,
        }}
      >
        <Section
          header={<Text>连接</Text>}
          footer={
            <Text>
              本机 Surge iOS 在配置中开启 HTTP API，例如 http-api = your-key@127.0.0.1:6171。小组件通过 /v1/metrics?x-key=… 拉取。
            </Text>
          }
        >
          <TextField title="Host" value={host} onChanged={(value) => { setHost(value); markEdited() }} prompt="127.0.0.1" />
          <TextField title="Port" value={port} onChanged={(value) => { setPort(value); markEdited() }} prompt="6171" />
          <TextField title="API Key" value={apiKey} onChanged={(value) => { setApiKey(value); markEdited() }} prompt="与 http-api 中的 key 一致" />
          <Toggle title="使用 HTTPS (http-api-tls)" value={useTls} onChanged={(value) => { setUseTls(value); markEdited() }} />
        </Section>

        <Section header={<Text>小组件</Text>} footer={<Text>流量直接读取 Surge 原生累计 counter，引擎重启后归零。Medium 显示引擎核心总览；Large 额外展示累计流量最高的 3 个网络接口。</Text>}>
          <Picker
            title="请求刷新间隔"
            value={reloadMinutes}
            onChanged={(value) => { setReloadMinutes(String(value)); markEdited() }}
            pickerStyle="navigationLink"
          >
            <Text tag="5">5 分钟</Text>
            <Text tag="10">10 分钟</Text>
            <Text tag="15">15 分钟</Text>
            <Text tag="30">30 分钟</Text>
            <Text tag="60">60 分钟</Text>
          </Picker>
        </Section>

        <Section header={<Text>刷新状态</Text>} footer={<Text>这里设置的是 WidgetKit 最早请求刷新时间，不是严格定时器；iOS 可能根据电量、使用频率和系统预算延后执行。</Text>}>
          <Text>上次数据刷新：{preview ? formatFetchedAtWithSeconds(preview.ok ? preview.snapshot.fetchedAt : preview.cache?.fetchedAt) : "尚未刷新"}</Text>
          <Text>最早请求刷新：每 {reloadMinutes} 分钟</Text>
        </Section>

        <Section header={<Text>操作</Text>} footer={<Text>{status}</Text>}>
          <Button
            title={busy ? "请稍候…" : "测试连通"}
            action={() => {
              if (!busy) onTest()
            }}
          />
          <Button
            title={busy ? "请稍候…" : "立即刷新并预览"}
            action={() => {
              if (!busy) onRefresh()
            }}
          />
          <Button title="清除缓存" role="destructive" action={onClearCache} />
        </Section>

        <Section header={<Text>Medium 预览</Text>}>
          <MediumWidgetView
            result={
              preview || {
                ok: false,
                error: { code: "missing_config", message: "点击上方刷新以加载预览" },
              }
            }
          />
        </Section>

        <Section header={<Text>Large 预览</Text>}>
          <LargeWidgetView
            result={
              preview || {
                ok: false,
                error: { code: "missing_config", message: "点击上方刷新以加载预览" },
              }
            }
          />
        </Section>

        <Section header={<Text>本机 Surge 配置示例</Text>}>
          <Text font="footnote" foregroundStyle="secondaryLabel">
            {[
              "[General]",
              "http-api = YOUR_SECRET_KEY@127.0.0.1:6171",
              "",
              "# 可选：HTTPS",
              "# http-api-tls = true",
              "",
              "# 版本要求：iOS 5.22.0+",
              "# 保存配置后确保 Surge 已启动（VPN 开关打开）",
            ].join("\n")}
          </Text>
        </Section>
      </List>
    </NavigationStack>
  )
}

async function main() {
  await Navigation.present(<App />)
  Script.exit()
}

main()
