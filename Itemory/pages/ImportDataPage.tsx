import {
  Button,
  HStack,
  Image,
  List,
  Spacer,
  Text,
  VStack,
  useRef,
  useState,
} from "scripting";


import {
  exportExchangeTemplate,
  importExchangeData,
} from "../services/exchange";
import { NativeNoteRow, NativeSectionHeader } from "../ui/native-list";
import { appListProps, AppSection } from "../ui/theme-props";
import { useSettingsTheme } from "../ui/theme";

function Step(props: { number: string; title: string; detail: string }) {
  return (
    <HStack alignment="top" spacing={12}>
      <Text font="headline" foregroundStyle="accentColor" frame={{ width: 24 }}>
        {props.number}
      </Text>
      <VStack
        alignment="leading"
        spacing={5}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        <Text font="body">{props.title}</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel">
          {props.detail}
        </Text>
      </VStack>
    </HStack>
  );
}
export function ImportDataPage(props: {
  runOperation: (kind: string, work: () => Promise<void>) => Promise<void>;
}) {
  const uiTheme = useSettingsTheme();
  const lock = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  async function run(kind: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind);
    try {
      await props.runOperation(kind, work);
    } catch (e) {
      await Dialog.alert({
        title: "操作未完成",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  function action(
    title: string,
    icon: string,
    color: "green" | "purple",
    kind: string,
    work: () => Promise<void>,
  ) {
    return (
      <Button
        buttonStyle="plain"
        disabled={busy !== null}
        action={() => void run(kind, work)}
      >
        <HStack
          spacing={12}
          frame={{ maxWidth: "infinity" }}
          contentShape="rect"
        >
          <Image
            systemName={icon}
            foregroundStyle={color === "green" ? "#34C759" : "#AF52DE"}
            font={17}
            frame={{ width: 24 }}
          />
          <Text>{title}</Text>
          <Spacer />
          {busy === kind ? (
            <Text font="caption" foregroundStyle="secondaryLabel">
              处理中…
            </Text>
          ) : null}
        </HStack>
      </Button>
    );
  }
  return (
    <List {...appListProps(uiTheme, "inline")}>
      <AppSection theme={uiTheme}

        header={<NativeSectionHeader title="已有转换好的数据包" />}
        footer={
          <NativeNoteRow text="选择 AI 生成的 ZIP，无需解压。检查后确认，仅新增物品，不覆盖现有记录。" />
        }
      >
          {action(
            "选择数据包",
            "square.and.arrow.down",
            "green",
            "import",
            importExchangeData,
          )}
      </AppSection>
      <AppSection theme={uiTheme}

        header={<NativeSectionHeader title="第一次导入？按这三步准备" />}
      >
          <Step
            number="1"
            title="准备原始资料"
            detail="从其他应用导出记录与图片，也可以准备自己的表格、照片和文字。一件物品也能导入。"
          />
          <Step
            number="2"
            title="交给 AI 整理"
            detail="将下方的 AI 转换指令文件和原始资料一起发给支持文件处理的 AI，无需另复制提示词。缺少的信息由你确认。"
          />
          <Step
            number="3"
            title="回来检查并导入"
            detail="将 AI 生成的 ZIP 保存到「文件」，点击上方「选择数据包」。如校验失败，把错误报告交回 AI 修正。"
          />
      </AppSection>
      <AppSection theme={uiTheme}

        header={<NativeSectionHeader title="交给 AI 的材料" />}
        footer={
          <VStack
            spacing={4}
            alignment="leading"
            frame={{ maxWidth: "infinity", alignment: "leading" }}
          >
            <Text
              font="footnote"
              foregroundStyle="secondaryLabel"
              frame={{ maxWidth: "infinity", alignment: "leading" }}
            >
              将这一份指令文件与原始资料一起发送给 AI。若 AI 询问用途，告诉它“按附件指令转换即可”。
            </Text>
            <Text
              font="footnote"
              foregroundStyle="secondaryLabel"
              frame={{ maxWidth: "infinity", alignment: "leading" }}
            >
              Itemory 不会上传资料；发送给外部 AI 前，请自行确认隐私信息。
            </Text>
          </VStack>
        }
      >
          {action(
            "获取 AI 转换指令",
            "doc.text",
            "purple",
            "guide",
            exportExchangeTemplate,
          )}
      </AppSection>
    </List>
  );
}
