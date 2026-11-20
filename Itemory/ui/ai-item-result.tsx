import {
  Button,
  Divider,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
  useEffect,
  useRef,
  useState,
} from "scripting";
import {
  buildAiItemDiagnostic,
  type AiItemWorkflowResult,
} from "../services/ai-item-workflow";
import { aiCutoutTrackLabel } from "../services/ai-cutout";
import { safeAiVisionError } from "../services/ai-vision-diagnostics";
import { makeAiItemEditorDraft } from "../services/ai-item-draft";
import { AiCutoutTestContent } from "./ai-cutout-test-section";

function AttributeRow(props: { label: string; value: string }) {
  return (
    <HStack spacing={12} frame={{ maxWidth: "infinity" }} alignment="top">
      <Text
        font="subheadline"
        foregroundStyle="secondaryLabel"
        frame={{ width: 68, alignment: "leading" }}
      >
        {props.label}
      </Text>
      <Text
        font="subheadline"
        foregroundStyle="label"
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        {props.value}
      </Text>
    </HStack>
  );
}

/** Reusable session-only result: no inventory, editor, cover or file persistence. */
/** Single-entry AI result presentation. 200 后格式或 Alpha 检查失败不回退；诊断脱敏后可复制。 */
export function AiItemResultView(props: {
  result: AiItemWorkflowResult | null;
  busy: boolean;
  notice?: string | null;
  testPreview?: boolean;
  resultTab?: "information" | "cutout";
  onContinue?: () => void;
  previewBackground?: string;
  onPreviewBackground?: (value: string) => void;
}) {
  const result = props.result;
  const notice = props.notice;
  const information = result?.information;
  const extraction = information?.extraction;
  const cutout = result?.cutout;
  const sourceNotice =
    result?.mode === "combined"
      ? result.cutout?.cutout
        ? makeAiItemEditorDraft(result).sourceNotice
        : null
      : information?.editorDraft?.sourceNotice;
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  const copyRevision = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copying = useRef(false);
  function invalidateCopy() {
    ++copyRevision.current;
    copying.current = false;
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    copyTimer.current = null;
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      invalidateCopy();
    };
  }, []);
  useEffect(() => {
    invalidateCopy();
    setCopied(false);
  }, [result, props.busy]);

  async function copyDiagnostic() {
    if (!result || props.busy || copying.current || !alive.current) return;
    copying.current = true;
    const revision = ++copyRevision.current;
    try {
      const diagnostic = buildAiItemDiagnostic({
        ...result,
        stopped: result.stopped || (!props.busy && !result.complete),
      });
      await Pasteboard.setString(diagnostic);
      if (!alive.current || revision !== copyRevision.current) return;
      setCopied(true);
      copyTimer.current = setTimeout(() => {
        if (alive.current && revision === copyRevision.current)
          setCopied(false);
        copyTimer.current = null;
      }, 2000);
    } catch (error) {
      if (alive.current && revision === copyRevision.current)
        await Dialog.alert({
          title: "诊断未能复制",
          message: safeAiVisionError(error),
        });
    } finally {
      if (revision === copyRevision.current) copying.current = false;
    }
  }
  const informationOk = !!information?.contractOk && !!extraction;
  const imageOk = !!cutout?.cutout;
  const finished = !!result?.complete;
  const neededImage = result?.mode !== "information";
  return (
    <VStack
      alignment="leading"
      spacing={12}
      padding={result ? { vertical: 12 } : { top: 10, bottom: 4 }}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      onAppear={() => {
        alive.current = true;
      }}
      onDisappear={() => {
        alive.current = false;
        invalidateCopy();
      }}
    >
      {!result && !props.busy ? (
        notice ? (
          <HStack spacing={6} padding={{ vertical: 4 }}>
            <Image
              systemName="exclamationmark.triangle"
              font={13}
              foregroundStyle="systemOrange"
            />
            <Text font="footnote" foregroundStyle="systemOrange">
              {notice}
            </Text>
          </HStack>
        ) : (
          <HStack spacing={6} padding={{ vertical: 4 }}>
            <Image
              systemName="info.circle"
              font={13}
              foregroundStyle="tertiaryLabel"
            />
            <Text font="footnote" foregroundStyle="secondaryLabel">
              尚未选择订单截图
            </Text>
          </HStack>
        )
      ) : null}

      {/* 1. 上信息：结构化表单字段优先回显 */}
      {props.resultTab !== "cutout" && informationOk && extraction ? (
        <VStack
          alignment="leading"
          spacing={10}
          padding={props.testPreview ? 0 : 14}
          background={props.testPreview ? "clear" : "secondarySystemGroupedBackground"}
          clipShape={props.testPreview ? undefined : { type: "rect", cornerRadius: 14 }}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          {props.testPreview ? (
            <VStack alignment="leading" spacing={16} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              <Text font="title3" fontWeight="semibold" fixedSize={{ horizontal: false, vertical: true }}>{extraction.name}</Text>
              <VStack alignment="leading" spacing={3}>
                <Text font="caption" foregroundStyle="secondaryLabel">预估价格</Text>
                <Text font="title2" fontWeight="semibold">{extraction.price === null ? "未识别" : `¥${extraction.price}`}</Text>
              </VStack>
              <Divider />
              <VStack alignment="leading" spacing={8}>
                <AttributeRow label="购入日期" value={extraction.acquiredOn || "未识别"} />
                <AttributeRow label="购买渠道" value={extraction.channel || "未识别"} />
                <AttributeRow label="分类" value={information?.matchedCategoryName ?? extraction.categoryHint ?? "未识别"} />
                {information?.editorDraft?.warrantyUntil ? <AttributeRow label="保修到期" value={information.editorDraft.warrantyUntil} /> : null}
              </VStack>
              {information?.editorDraft?.notes ? <VStack alignment="leading" spacing={4}>
                <Text font="caption" foregroundStyle="secondaryLabel">备注</Text>
                <Text font="subheadline" fixedSize={{ horizontal: false, vertical: true }}>{information.editorDraft.notes}</Text>
              </VStack> : null}
            </VStack>
          ) : <>
<HStack spacing={6}>
            <Image
              systemName="checkmark.circle.fill"
              font={14}
              foregroundStyle="#34C759"
            />
            <Text font="footnote" foregroundStyle="#34C759">
              提取成功 · 请核对字段
            </Text>
          </HStack>
          <AttributeRow label="物品名称" value={extraction.name} />
          <AttributeRow
            label="预估价格"
            value={
              extraction.price !== null
                ? `¥${extraction.price}`
                : "未提取（需人工确认）"
            }
          />
          <AttributeRow
            label="购入日期"
            value={
              (props.testPreview ? extraction.acquiredOn : information?.editorDraft?.purchasedOn) ??
              extraction.acquiredOn ??
              (props.testPreview ? "未识别" : "未识别，暂填今天并待核对")
            }
          />
          <AttributeRow
            label="购买渠道"
            value={extraction.channel || "未识别，待确认"}
          />
          <AttributeRow
            label="预选分类"
            value={
              information?.matchedCategoryName ??
              extraction.categoryHint ??
              "未识别，待确认"
            }
          />
          {information?.editorDraft?.warrantyUntil ? (
            <AttributeRow
              label="保修到期"
              value={information.editorDraft.warrantyUntil}
            />
          ) : null}
          {information?.editorDraft?.notes ? (
            <AttributeRow
              label="备注信息"
              value={information.editorDraft.notes}
            />
          ) : null}
          </>}
          {sourceNotice && !props.testPreview ? (
            <Text font="caption" foregroundStyle="secondaryLabel">
              {sourceNotice}
            </Text>
          ) : null}
          {!props.testPreview ? <Text font="caption2" foregroundStyle="systemOrange">请核对提取结果。</Text> : null}
          {extraction.warnings.map((warning, index) => (
            <Text
              key={`${index}-${warning}`}
              font="caption2"
              foregroundStyle="systemOrange"
            >
              • {warning}
            </Text>
          ))}
        </VStack>
      ) : null}
      {props.resultTab !== "cutout" && (result?.informationError || (information && !information.contractOk)) ? (
        <Text
          font="footnote"
          foregroundStyle="systemRed"
          textSelection={true}
          fixedSize={{ horizontal: false, vertical: true }}
        >
          {result?.informationError ?? information?.error ?? "信息解析未完成"}
        </Text>
      ) : null}

      {/* 2. 下图：透明物品图居中呈现 */}
      {props.resultTab !== "information" && neededImage && result ? (
        <VStack spacing={6} frame={{ maxWidth: "infinity" }}>
          <AiCutoutTestContent
            result={cutout ?? null}
            previewBackground={props.previewBackground ?? "light"}
            onPreviewBackground={props.onPreviewBackground}
          />
        </VStack>
      ) : null}
      {!props.testPreview && result &&
      !finished &&
      props.busy &&
      informationOk &&
      neededImage &&
      !cutout ? (
        <Text font="caption" foregroundStyle="secondaryLabel">
          信息已返回，正在等待物品图；可先核对字段。
        </Text>
      ) : null}

      {props.testPreview && result && notice ? <Text font="footnote" foregroundStyle="secondaryLabel">{notice}</Text> : null}
      {props.testPreview && result && !props.busy ? (
        <Button buttonStyle="plain" action={() => setDiagnosticsOpen(!diagnosticsOpen)}>
          <HStack spacing={8} frame={{ minHeight: 44, maxWidth: "infinity" }}>
            <Text font="subheadline">测试详情</Text>
            <Spacer />
            <Text font="footnote" foregroundStyle="secondaryLabel">{(result.totalMs / 1000).toFixed(1)} 秒</Text>
            <Image systemName={diagnosticsOpen ? "chevron.up" : "chevron.down"} font={12} foregroundStyle="secondaryLabel" />
          </HStack>
        </Button>
      ) : null}
      {result && (!props.testPreview || (diagnosticsOpen && !props.busy)) ? (
        <VStack
          alignment="leading"
          spacing={10}
          padding={14}
          background="secondarySystemGroupedBackground"
          clipShape={{ type: "rect", cornerRadius: 14 }}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          <HStack
            spacing={10}
            frame={{ maxWidth: "infinity" }}
            alignment="center"
          >
            <HStack spacing={6}>
              <Image
                systemName="gauge.with.needle"
                font={13}
                foregroundStyle="secondaryLabel"
              />
              <Text font="footnote" foregroundStyle="secondaryLabel">
                接口响应与耗时
              </Text>
            </HStack>
            <Spacer />
            <Button
              buttonStyle="plain"
              disabled={props.busy}
              action={() => void copyDiagnostic()}
            >
              <HStack spacing={4}>
                <Image
                  systemName={copied ? "checkmark" : "doc.on.doc"}
                  font={12}
                  foregroundStyle={copied ? "#34C759" : "accentColor"}
                />
                <Text
                  font="footnote"
                  foregroundStyle={copied ? "#34C759" : "accentColor"}
                >
                  {copied ? "已复制" : "复制脱敏诊断"}
                </Text>
              </HStack>
            </Button>
          </HStack>

          <VStack
            alignment="leading"
            spacing={6}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
          >
            {information ? (
              <Text font="caption2" foregroundStyle="secondaryLabel">
                信息接口：HTTP {information.httpStatus} · 耗时{" "}
                {(information.latencyMs / 1000).toFixed(1)}s · 请求{" "}
                {information.attempts.length} 次 (
                {information.effectiveReasoningEffort ?? "服务端默认未知"})
              </Text>
            ) : null}
            {cutout ? (
              <Text font="caption2" foregroundStyle="secondaryLabel">
                生图接口：HTTP {cutout.httpStatus ?? "无响应"} · 耗时{" "}
                {(cutout.totalMs / 1000).toFixed(1)}s · 请求 {cutout.attempts}{" "}
                次 · {cutout.metrics.format ?? "PNG"} (
                {cutout.track ? aiCutoutTrackLabel(cutout.track) : "未发起"})
              </Text>
            ) : null}
            <Text font="caption2" foregroundStyle="secondaryLabel">
              总计耗时：{(result.totalMs / 1000).toFixed(1)}s
            </Text>
          </VStack>
        </VStack>
      ) : null}
      {props.onContinue && (informationOk || imageOk) && !props.busy ? (
        <Button buttonStyle="plain" action={props.onContinue}>
          <Text foregroundStyle="accentColor" frame={{ minHeight: 44 }}>
            继续核对
          </Text>
        </Button>
      ) : null}
    </VStack>
  );
}
