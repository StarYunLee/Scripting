import { List, Section, Toggle, useState } from "scripting";
import type { TokenValidationResult } from "../services/github-rest";
import {
  GlassActionRow,
  GlassCredentialRow,
  GlassDivider,
  GlassGroup,
  GlassLabeledRow,
  GlassSectionHeader,
  glassRowBackground,
} from "../ui/glass";
import { glassListPageProps } from "../ui/glass-list-page";
import { TokenPermissionItem } from "../ui/token-permission-info";
import { TokenEditor } from "./token-editor";

export function GitHubConnectionPage(props: {
  connected: boolean;
  permissionSummary: string;
  credentialTitle: string;
  credentialDetail?: string;
  credentialActionTitle: string;
  credentialIconActive: boolean;
  privateRepositoriesEnabled: boolean;
  busy: boolean;
  onTogglePrivateRepositories: (enabled: boolean) => void;
  onTokenVerified: (
    token: string,
    result: TokenValidationResult,
  ) => void | Promise<void>;
  onDisconnect: () => void | Promise<void>;
}) {
  const [editingToken, setEditingToken] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const interactionBusy = props.busy || editorBusy;

  return (
    <List
      navigationTitle="账户与权限"
      {...glassListPageProps()}
      safeAreaPadding={{ bottom: 24 }}
    >
      <Section
        header={<GlassSectionHeader title="账户状态" />}
        listRowBackground={glassRowBackground}
      >
        <GlassGroup>
          <GlassLabeledRow
            title="状态"
            value={props.connected ? "已连接" : "未配置访问令牌"}
          />
          {props.connected ? (
            <>
              <GlassDivider />
              <GlassLabeledRow
                title="访问权限"
                value={props.permissionSummary}
              />
            </>
          ) : null}
        </GlassGroup>
      </Section>
      <Section
        header={<GlassSectionHeader title="访问范围" />}
        listRowBackground={glassRowBackground}
      >
        <GlassGroup>
          <Toggle
            value={props.privateRepositoriesEnabled}
            title="显示私有仓库"
            systemImage="lock.fill"
            disabled={interactionBusy}
            onChanged={props.onTogglePrivateRepositories}
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          />
        </GlassGroup>
      </Section>
      <Section
        header={<GlassSectionHeader title="Token 权限说明（Classic PAT）" />}
        listRowBackground={glassRowBackground}
      >
        <GlassGroup>
          <TokenPermissionItem
            title="个人资料、Stars 与列表"
            scope="user"
            description="读取账户信息、Stars 和 List，并支持列表管理。"
          />
          <GlassDivider />
          <TokenPermissionItem
            title="公开仓库与 Star 操作"
            scope="public_repo"
            description="管理公开仓库元数据，并添加或取消公开仓库 Star。"
          />
          <GlassDivider />
          <TokenPermissionItem
            title="私有仓库（可选）"
            scope="repo"
            description="开启“显示私有仓库”后，读取你拥有的私有仓库元数据，并支持私有仓库的 Star 操作。"
          />
        </GlassGroup>
      </Section>
      <Section
        header={<GlassSectionHeader title="访问凭据" />}
        listRowBackground={glassRowBackground}
      >
        <GlassGroup>
          <GlassCredentialRow
            title={props.credentialTitle}
            detail={props.credentialDetail}
            actionTitle={editingToken ? "取消" : props.credentialActionTitle}
            iconActive={props.credentialIconActive}
            disabled={interactionBusy}
            action={() => setEditingToken(!editingToken)}
          />
          {editingToken ? (
            <>
              <GlassDivider />
              <TokenEditor
                mode={props.connected ? "replace" : "connect"}
                includePrivateRepositories={props.privateRepositoriesEnabled}
                onVerified={async (token, result) => {
                  await props.onTokenVerified(token, result);
                  setEditingToken(false);
                }}
                onBusyChanged={setEditorBusy}
              />
            </>
          ) : null}
          {props.connected ? (
            <>
              <GlassDivider />
              <GlassActionRow
                title="断开 GitHub"
                centered
                natural
                destructive
                disabled={interactionBusy}
                action={props.onDisconnect}
              />
            </>
          ) : null}
        </GlassGroup>
      </Section>
    </List>
  );
}
