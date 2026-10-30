import {
  Button,
  HStack,
  List,
  Section,
  Spacer,
  Text,
  Toggle,
  VStack,
  useState,
} from "scripting";
import type { ProviderId, ProviderMeta } from "../models";
import {
  GlassDivider,
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/GlassList";
import { PageBackground } from "../components/PageBackground";
import { ProviderLogo } from "../components/ProviderLogo";
import type { BackgroundThemeId } from "../services/settings";
import { cachedPlanLabel } from "../services/hub";
import {
  isAccountShownInOverview,
  setAccountShownInOverview,
} from "../services/app-overview-prefs";

export type AccountsSettingsAccount = {
  id: string;
  name: string;
  email: string | null;
  planLabel?: string | null;
};

export type AccountsSettingsRow = {
  meta: ProviderMeta;
  account: AccountsSettingsAccount;
};

export function AccountsSettingsPage(props: {
  accountRows: AccountsSettingsRow[];
  backgroundTheme: BackgroundThemeId;
  onOverviewChange: () => void;
  onOpenAccount: (
    provider: ProviderId,
    account: AccountsSettingsAccount,
  ) => void;
  /** 写入偏好失败时的统一提示，缺省时回退到内置弹窗。 */
  onSaveFailure?: () => void | Promise<void>;
  navigationTitle?: string;
}) {
  const [, setTick] = useState(0);

  function refresh() {
    setTick((value) => value + 1);
  }

  async function saveFailure(): Promise<void> {
    if (props.onSaveFailure) {
      await props.onSaveFailure();
      return;
    }
    await Dialog.alert({
      title: "设置未保存",
      message: "无法写入本地设置，请稍后重试。",
      buttonLabel: "关闭",
    });
  }

  const rows = props.accountRows;

  return (
    <List
      navigationTitle={props.navigationTitle ?? "账号"}
      navigationBarTitleDisplayMode="inline"
      scrollContentBackground="hidden"
      listStyle="plain"
      listRowSeparator="hidden"
      listRowSpacing={12}
      listSectionSpacing={12}
      contentMargins={{
        edges: "horizontal",
        insets: 16,
        placement: "scrollContent",
      }}
      background={<PageBackground theme={props.backgroundTheme} />}
    >
      {rows.length > 0 ? (
        rows.map(({ meta, account }, index) => {
          const title = account.email || account.name;
          const planLabel =
            "planLabel" in account
              ? account.planLabel
              : cachedPlanLabel(meta.id, account.id);
          const shown = isAccountShownInOverview(meta.id, account.id);
          const isLast = index === rows.length - 1;
          return (
            <Section
              key={`${meta.id}:${account.id}`}
              listRowBackground={glassRowBackground}
            >
              <GlassGroup>
                <HStack
                  alignment="center"
                  spacing={12}
                  padding={{ vertical: true }}
                  frame={{ minHeight: 56, maxWidth: "infinity" }}
                >
                  <Button
                    buttonStyle="plain"
                    frame={{ maxWidth: "infinity" }}
                    action={() =>
                      props.onOpenAccount(meta.id, {
                        id: account.id,
                        name: account.name,
                        email: account.email,
                        planLabel,
                      })
                    }
                  >
                    <HStack
                      spacing={10}
                      frame={{ maxWidth: "infinity" }}
                      contentShape="rect"
                    >
                      <ProviderLogo provider={meta.id} size={24} />
                      <VStack alignment="leading" spacing={3}>
                        <Text font="body" lineLimit={1} truncationMode="tail">
                          {title}
                        </Text>
                        <Text
                          font={13}
                          foregroundStyle="secondaryLabel"
                          lineLimit={1}
                          truncationMode="tail"
                        >
                          {planLabel && planLabel !== meta.title
                            ? `${meta.title} · ${planLabel}`
                            : meta.title}
                        </Text>
                      </VStack>
                      <Spacer />
                    </HStack>
                  </Button>
                  <Toggle
                    title={`在用量总览中显示 ${title}`}
                    labelsHidden
                    toggleStyle="switch"
                    value={shown}
                    onChanged={(value: boolean) => {
                      if (
                        !setAccountShownInOverview(meta.id, account.id, value)
                      ) {
                        void saveFailure();
                        refresh();
                        return;
                      }
                      props.onOverviewChange();
                      refresh();
                    }}
                  />
                </HStack>

              </GlassGroup>
            </Section>
          );
        })
      ) : (
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="账号" />}
        >
          <GlassGroup>
            <HStack
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            >
              <Text font={13} foregroundStyle="secondaryLabel">
                尚未连接账号
              </Text>
              <Spacer />
            </HStack>
          </GlassGroup>
        </Section>
      )}
    </List>
  );
}
