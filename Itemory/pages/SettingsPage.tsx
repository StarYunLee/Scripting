import {
  Button,
  List,
  Navigation,
  NavigationStack,
  Text,
  Toolbar,
  ToolbarItem,
  useState,
} from "scripting";
import { CategorySettingsPage } from "./CategorySettingsPage";
import { ChangelogPage } from "./ChangelogPage";
import { TagSettingsPage } from "./TagSettingsPage";
import { BackupSettingsPage } from "./BackupSettingsPage";
import { AiVisionSettingsPage } from "./AiVisionSettingsPage";
import { CURRENT_VERSION } from "../changelog";
import {
  NativeNavigationRow,
  NativeSectionHeader,
} from "../ui/native-list";
import { appListProps, AppSection } from "../ui/theme-props";

type SettingsDest =
  | "category"
  | "tag"
  | "backup"
  | "vision"
  | "changelog";

export function SettingsPage() {
  const dismiss = Navigation.useDismiss();
  const [structureDest, setStructureDest] = useState<SettingsDest | null>(null);

  return (
    <NavigationStack>
      <List
        navigationTitle="设置"
        {...appListProps("native", "inline")}
        navigationDestination={{
          isPresented: structureDest != null,
          onChanged: (value) => {
            if (!value) setStructureDest(null);
          },
          content:
            structureDest === "category" ? (
              <CategorySettingsPage />
            ) : structureDest === "tag" ? (
              <TagSettingsPage />
            ) : structureDest === "backup" ? (
              <BackupSettingsPage />
            ) : structureDest === "vision" ? (
              <AiVisionSettingsPage />
            ) : structureDest === "changelog" ? (
              <ChangelogPage />
            ) : (
              <Text>设置</Text>
            ),
        }}
        toolbar={
          <Toolbar>
            <ToolbarItem placement="topBarLeading">
              <Button
                title="返回"
                systemImage="chevron.left"
                labelStyle="iconOnly"
                action={dismiss}
              />
            </ToolbarItem>
          </Toolbar>
        }
      >
        <AppSection
          theme="native"
          header={<NativeSectionHeader title="物品整理" />}
        >
          <NativeNavigationRow
            title="分类管理"
            systemImage="folder.fill"
            action={() => setStructureDest("category")}
          />
          <NativeNavigationRow
            title="标签管理"
            systemImage="tag.fill"
            action={() => setStructureDest("tag")}
          />
        </AppSection>

        <AppSection
          theme="native"
          header={<NativeSectionHeader title="数据管理" />}
        >
          <NativeNavigationRow
            title="数据与备份"
            systemImage="internaldrive.fill"
            action={() => setStructureDest("backup")}
          />
        </AppSection>

        <AppSection
          theme="native"
          header={<NativeSectionHeader title="AI 服务" />}
        >
          <NativeNavigationRow
            title="AI 识图录入（试验性）"
            systemImage="sparkles"
            action={() => setStructureDest("vision")}
          />
        </AppSection>

        <AppSection
          theme="native"
          header={<NativeSectionHeader title="关于" />}
        >
          <NativeNavigationRow
            title="版本信息"
            systemImage="info.circle"
            detail={`v${CURRENT_VERSION}`}
            action={() => setStructureDest("changelog")}
          />
        </AppSection>
      </List>
    </NavigationStack>
  );
}
