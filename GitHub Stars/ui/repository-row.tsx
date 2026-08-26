import {
  Button,
  Group,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
  type Color,
  type VirtualNode,
} from "scripting";
import { languageColor } from "../data/language-colors";
import type { GitHubRepository, RepositoryMembership } from "../types";

type MetricColor = Color;

function MetricLabel(props: {
  icon: string;
  value: string | number;
  color: MetricColor;
}) {
  return (
    <HStack spacing={4}>
      <Image
        systemName={props.icon}
        foregroundStyle={props.color}
        font={14}
        fontWeight="semibold"
      />
      <Text font={14} foregroundStyle="label" lineLimit={1}>
        {props.value}
      </Text>
    </HStack>
  );
}

function LanguageLabel(props: { language: string; color: MetricColor }) {
  return (
    <HStack spacing={4}>
      <Image
        systemName="chevron.left.forwardslash.chevron.right"
        foregroundStyle={props.color}
        font={14}
        fontWeight="semibold"
      />
      <Text font={14} foregroundStyle="label" lineLimit={1}>
        {props.language}
      </Text>
    </HStack>
  );
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "最近推送：未知";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "最近推送：未知";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "最近推送：刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `最近推送：${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `最近推送：${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `最近推送：${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `最近推送：${months} 个月前`;
  return `最近推送：${Math.floor(months / 12)} 年前`;
}

function formatStarredDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `Star：${date.toLocaleDateString([], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  })}`;
}

function formatMemberships(
  memberships: readonly RepositoryMembership[],
): string | null {
  if (memberships.length === 0) return null;
  if (memberships.length === 1) return memberships[0].listName;
  return `${memberships[0].listName} 等 ${memberships.length} 个分组`;
}

function RepositoryCardChrome(props: {
  children: VirtualNode;
  onUnstar?: () => void;
}) {
  const chrome = {
    spacing: 0,
    padding: { top: 16, bottom: 16, leading: 16, trailing: 8 },
    frame: { maxWidth: "infinity" as const },
    glassEffect: {
      glass: UIGlass.regular().interactive(true),
      shape: { type: "rect" as const, cornerRadius: 20, style: "continuous" as const },
    },
    shadow: {
      color: "rgba(72,88,120,0.16)" as Color,
      radius: 12,
      y: 5,
    },
    listRowBackground: <></>,
    listRowSeparator: "hidden" as const,
    listRowInsets: { top: 8, bottom: 8, leading: 0, trailing: 0 },
  };
  if (props.onUnstar) {
    return (
      <VStack
        {...chrome}
        contextMenu={{
          menuItems: (
            <Group>
              <Button
                title="取消 Star"
                role="destructive"
                action={props.onUnstar}
              />
            </Group>
          ),
        }}
      >
        {props.children}
      </VStack>
    );
  }
  return <VStack {...chrome}>{props.children}</VStack>;
}

export function RepositoryCard(props: {
  repository: GitHubRepository;
  showStarredDate?: boolean;
  memberships?: readonly RepositoryMembership[];
  onManageLists?: () => void;
  onUnstar?: () => void;
}) {
  return (
    <RepositoryCardChrome onUnstar={props.onUnstar}>
      <VStack spacing={8} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
          <Button
            buttonStyle="plain"
            frame={{ maxWidth: "infinity" }}
            action={() => {
              void Safari.present(props.repository.htmlUrl, false);
            }}
          >
            <HStack
              spacing={8}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
              contentShape="rect"
            >
              {props.repository.owner.avatarUrl ? (
                <Image
                  imageUrl={props.repository.owner.avatarUrl}
                  resizable
                  aspectRatio={{ value: 1, contentMode: "fill" }}
                  frame={{ width: 34, height: 34 }}
                  clipShape="circle"
                />
              ) : (
                <Image
                  systemName="shippingbox"
                  frame={{ width: 34, height: 34 }}
                />
              )}
              <Text font={14} foregroundStyle="secondaryLabel" lineLimit={1}>
                {props.repository.owner.login}
              </Text>
            </HStack>
          </Button>
          {props.onManageLists ? (
            <Button
              title=""
              systemImage="ellipsis"
              buttonStyle="plain"
              foregroundStyle="secondaryLabel"
              frame={{ width: 44, height: 44 }}
              contentShape="rect"
              action={props.onManageLists}
            />
          ) : null}
        </HStack>
        <Button
          buttonStyle="plain"
          frame={{ maxWidth: "infinity" }}
          action={() => {
            void Safari.present(props.repository.htmlUrl, false);
          }}
        >
          <VStack frame={{ maxWidth: "infinity" }} contentShape="rect">
            <RepositoryCardContent
              repository={props.repository}
              showStarredDate={props.showStarredDate}
              memberships={props.memberships}
            />
          </VStack>
        </Button>
      </VStack>
    </RepositoryCardChrome>
  );
}

function RepositoryContent(props: {
  repository: GitHubRepository;
  showStarredDate?: boolean;
  memberships?: readonly RepositoryMembership[];
}) {
  const repo = props.repository;
  const starredDate = props.showStarredDate
    ? formatStarredDate(repo.starredAt)
    : null;
  const repositoryLanguageColor =
    languageColor(repo.language) ?? "secondaryLabel";
  const membershipLabel = formatMemberships(props.memberships ?? []);
  return (
    <VStack
      spacing={8}
      alignment="leading"
      frame={{ minHeight: 44, maxWidth: "infinity" }}
      contentShape="rect"
    >
      <Text
        font="headline"
        lineLimit={2}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        {repo.name}
      </Text>
      {repo.description ? (
        <Text foregroundStyle="secondaryLabel">{repo.description}</Text>
      ) : null}
      <HStack spacing={8}>
        <MetricLabel
          icon="star.fill"
          value={repo.stargazersCount}
          color="systemYellow"
        />
        <MetricLabel
          icon="arrow.triangle.branch"
          value={repo.forksCount}
          color="systemBlue"
        />
        {repo.language ? (
          <LanguageLabel
            language={repo.language}
            color={repositoryLanguageColor}
          />
        ) : null}
      </HStack>
      <HStack spacing={8}>
        <Text font={14} foregroundStyle="secondaryLabel">
          {formatRelativeTime(repo.pushedAt)}
        </Text>
        {starredDate ? (
          <>
            <Spacer />
            <Text font={14} foregroundStyle="secondaryLabel">
              {starredDate}
            </Text>
          </>
        ) : null}
      </HStack>
      {membershipLabel ? (
        <HStack spacing={5} foregroundStyle="secondaryLabel">
          <Image systemName="list.bullet" font={14} fontWeight="semibold" />
          <Text font={14} lineLimit={1}>
            {membershipLabel}
          </Text>
        </HStack>
      ) : null}
    </VStack>
  );
}

function RepositoryCardContent(props: {
  repository: GitHubRepository;
  showStarredDate?: boolean;
  memberships?: readonly RepositoryMembership[];
}) {
  return (
    <RepositoryContent
      repository={props.repository}
      showStarredDate={props.showStarredDate}
      memberships={props.memberships}
    />
  );
}
