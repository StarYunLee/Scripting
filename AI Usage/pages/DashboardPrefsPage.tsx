import {
  Button,
  Divider,
  HStack,
  List,
  NavigationStack,
  Section,
  Spacer,
  Text,
  Toggle,
  VStack,
  useState,
} from "scripting";
import { providerMeta, type UsageCard } from "../models";
import { listAllAuthorizedCards } from "../services/hub";
import {
  getDashboardPrefs,
  resetDashboardPrefs,
  setAccountVisibleOnDashboard,
  setWindowVisibleOnDashboard,
  setWidgetPrivacyPrefs,
  type DashboardPrefsScope,
} from "../services/dashboard-prefs";
import { PageBackground } from "../components/PageBackground";
import type { BackgroundThemeId } from "../services/settings";

function RowBackground() {
  return (
    <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      glassEffect={{
        glass: UIGlass.regular(),
        shape: { type: "rect", cornerRadius: 20, style: "continuous" },
      }}
    />
  );
}

const rowBackground = <RowBackground />;

export function DashboardPrefsPage(props: {
  backgroundTheme: BackgroundThemeId;
  demoMode: boolean;
  scope?: DashboardPrefsScope;
  onChanged?: () => void;
}) {
  const scope = props.scope || "app";
  const isWidget = scope === "widget";
  const [tick, setTick] = useState(0);
  const prefs = getDashboardPrefs(scope);
  // 必须用未过滤列表，否则已隐藏账号无法再打开。
  const cards = listAllAuthorizedCards();

  function refresh() {
    setTick((value) => value + 1);
    props.onChanged?.();
  }

  // 触达 tick，确保开关后重读偏好。
  void tick;

  return (
    <NavigationStack>
      <List
        navigationTitle={isWidget ? "小组件总览" : "用量总览"}
        navigationBarTitleDisplayMode="inline"
        scrollContentBackground="hidden"
        listStyle="plain"
        listRowSpacing={12}
        listSectionSpacing={12}
        contentMargins={{
          edges: "horizontal",
          insets: 16,
          placement: "scrollContent",
        }}
        background={<PageBackground theme={props.backgroundTheme} />}
      >
        <Section
          listRowBackground={rowBackground}
          footer={
            <Text font="caption" foregroundStyle="secondaryLabel">
              {isWidget
                ? "控制总用量小组件展示哪些账号与额度条目。默认全部显示；仅影响参数为 dashboard 的总览小组件，与应用内用量页互不影响。"
                : "控制用量页展示哪些账号与额度条目。默认全部显示；关闭后仅影响应用内总览，不影响主屏幕小组件。"}
            </Text>
          }
        >
          <VStack
            spacing={0}
            frame={{ maxWidth: "infinity" }}
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <Button
              title="恢复全部显示"
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={() => {
                resetDashboardPrefs(scope);
                refresh();
              }}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text foregroundStyle="accentColor">恢复全部显示</Text>
                <Spacer />
              </HStack>
            </Button>
          </VStack>
        </Section>

        {isWidget ? (
          <Section
            listRowBackground={rowBackground}
            header={<Text foregroundStyle="secondaryLabel">隐私与显示</Text>}
            footer={
              <Text font="caption" foregroundStyle="secondaryLabel">
                默认隐藏邮箱与账号 ID，避免主屏幕泄露隐私。Small 为文本列表，Medium
                为圆环，Large 为进度条，Extra Large 按账号分组展示详情。
              </Text>
            }
          >
            <VStack
              spacing={0}
              frame={{ maxWidth: "infinity" }}
              listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
            >
              <Toggle
                title="显示账号邮箱"
                value={prefs.privacy.showAccountEmail}
                onChanged={(visible) => {
                  setWidgetPrivacyPrefs({ showAccountEmail: visible });
                  refresh();
                }}
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
              />
              <Divider />
              <Toggle
                title="显示账号 ID"
                value={prefs.privacy.showAccountId}
                onChanged={(visible) => {
                  setWidgetPrivacyPrefs({ showAccountId: visible });
                  refresh();
                }}
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
              />
              <Divider />
              <Toggle
                title="显示套餐档位徽章"
                value={prefs.privacy.showPlanBadge}
                onChanged={(visible) => {
                  setWidgetPrivacyPrefs({ showPlanBadge: visible });
                  refresh();
                }}
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
              />
            </VStack>
          </Section>
        ) : null}

        {cards.length === 0 ? (
          <Section listRowBackground={rowBackground}>
            <VStack
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
              listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
            >
              <Text foregroundStyle="secondaryLabel">
                {props.demoMode
                  ? "演示模式暂无账号卡片"
                  : "请先连接至少一个平台账号"}
              </Text>
            </VStack>
          </Section>
        ) : (
          cards.map((card) => (
            <AccountPrefSection
              key={card.key}
              card={card}
              accountVisible={!prefs.hiddenAccountKeys.includes(card.key)}
              hiddenWindowIds={
                prefs.hiddenWindowIdsByAccount[card.key] || []
              }
              onAccountChanged={(visible) => {
                setAccountVisibleOnDashboard(card.key, visible, scope);
                refresh();
              }}
              onWindowChanged={(windowId, visible) => {
                setWindowVisibleOnDashboard(card.key, windowId, visible, scope);
                refresh();
              }}
            />
          ))
        )}
      </List>
    </NavigationStack>
  );
}

function AccountPrefSection(props: {
  card: UsageCard;
  accountVisible: boolean;
  hiddenWindowIds: string[];
  onAccountChanged: (visible: boolean) => void;
  onWindowChanged: (windowId: string, visible: boolean) => void;
}) {
  const meta = providerMeta(props.card.provider);
  const plan = props.card.planLabel || meta.title;
  return (
    <Section
      listRowBackground={rowBackground}
      header={
        <Text foregroundStyle="secondaryLabel">
          {meta.title} · {plan}
        </Text>
      }
    >
      <VStack
        spacing={0}
        frame={{ maxWidth: "infinity" }}
        listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
      >
        <Toggle
          title={props.card.title}
          value={props.accountVisible}
          onChanged={props.onAccountChanged}
          padding={{ vertical: true }}
          frame={{ minHeight: 44, maxWidth: "infinity" }}
        />
        {props.accountVisible && props.card.windows.length > 0 ? (
          <>
            <Divider />
            <Text
              font={13}
              foregroundStyle="secondaryLabel"
              padding={{ vertical: true }}
            >
              额度条目
            </Text>
            {props.card.windows.map((window, index) => (
              <VStack key={window.id} spacing={0}>
                {index > 0 ? <Divider /> : null}
                <Toggle
                  title={window.label}
                  value={!props.hiddenWindowIds.includes(window.id)}
                  onChanged={(visible) =>
                    props.onWindowChanged(window.id, visible)
                  }
                  padding={{ vertical: true }}
                  frame={{ minHeight: 44, maxWidth: "infinity" }}
                />
              </VStack>
            ))}
          </>
        ) : null}
        {props.accountVisible && props.card.windows.length === 0 ? (
          <>
            <Divider />
            <Text
              font={13}
              foregroundStyle="secondaryLabel"
              padding={{ vertical: true }}
            >
              暂无额度条目（刷新用量后可选择）
            </Text>
          </>
        ) : null}
      </VStack>
    </Section>
  );
}
