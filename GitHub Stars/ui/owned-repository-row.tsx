import {
  Button,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
  type Color,
} from "scripting";
import { languageColor } from "../data/language-colors";
import type { OwnedRepository } from "../types";

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

function MetricLabel(props: {
  icon: string;
  value: string | number;
  color: Color;
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

function LanguageLabel(props: { language: string; color: Color }) {
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

function RepositoryStatus(props: { repository: OwnedRepository }) {
  const repo = props.repository;
  const title = repo.isArchived
    ? "已归档"
    : repo.visibility === "internal"
      ? "Internal"
      : repo.isPrivate
        ? "私有"
        : repo.isFork
          ? "Fork"
          : "公开";
  const icon = repo.isArchived
    ? "archivebox.fill"
    : repo.visibility === "internal"
      ? "building.2.fill"
      : repo.isPrivate
        ? "lock.fill"
        : repo.isFork
          ? "arrow.triangle.branch"
          : "lock.open.fill";
  const color: Color = repo.isArchived
    ? "systemOrange"
    : repo.visibility === "internal"
      ? "systemIndigo"
      : repo.isPrivate
        ? "systemRed"
        : repo.isFork
          ? "systemPurple"
          : "systemGreen";
  return (
    <HStack spacing={5}>
      <Image systemName={icon} foregroundStyle={color} font={14} />
      <Text font={14} foregroundStyle="secondaryLabel" lineLimit={1}>
        {title}
      </Text>
    </HStack>
  );
}

export function OwnedRepositoryCard(props: {
  repository: OwnedRepository;
  isPinned?: boolean;
  onManage: () => void;
}) {
  const repo = props.repository;
  const repositoryLanguageColor: Color =
    languageColor(repo.language) ?? "secondaryLabel";
  return (
    <VStack
      spacing={0}
      padding={{ top: 16, bottom: 16, leading: 16, trailing: 8 }}
      frame={{ maxWidth: "infinity" }}
      glassEffect={{
        glass: UIGlass.regular().interactive(true),
        shape: { type: "rect", cornerRadius: 20, style: "continuous" },
      }}
      shadow={{
        color: "rgba(72,88,120,0.16)" as Color,
        radius: 12,
        y: 5,
      }}
      listRowBackground={<></>}
      listRowSeparator="hidden"
      listRowInsets={{ top: 8, bottom: 8, leading: 0, trailing: 0 }}
    >
      <VStack spacing={8} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
          <Button
            buttonStyle="plain"
            frame={{ maxWidth: "infinity" }}
            action={() => {
              void Safari.present(repo.htmlUrl, false);
            }}
          >
            <HStack
              spacing={8}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
              contentShape="rect"
            >
              {repo.owner.avatarUrl ? (
                <Image
                  imageUrl={repo.owner.avatarUrl}
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
                {repo.owner.login}
              </Text>
            </HStack>
          </Button>
          {props.isPinned ? (
            <Image
              systemName="pin.fill"
              foregroundStyle="systemOrange"
              font={14}
              frame={{ width: 24, height: 44 }}
            />
          ) : null}
          <Button
            title="管理"
            systemImage="ellipsis"
            labelStyle="iconOnly"
            buttonStyle="plain"
            foregroundStyle="secondaryLabel"
            frame={{ width: 44, height: 44 }}
            contentShape="rect"
            action={props.onManage}
          />
        </HStack>
        <Button
          buttonStyle="plain"
          frame={{ maxWidth: "infinity" }}
          action={() => {
            void Safari.present(repo.htmlUrl, false);
          }}
        >
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
              <Text foregroundStyle="secondaryLabel">
                {repo.description}
              </Text>
            ) : (
              <Text foregroundStyle="tertiaryLabel">暂无描述</Text>
            )}
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
            <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
              <Text font={14} foregroundStyle="secondaryLabel">
                {formatRelativeTime(repo.pushedAt)}
              </Text>
              <Spacer />
              <RepositoryStatus repository={repo} />
            </HStack>
            {repo.topics.length > 0 ? (
              <HStack spacing={5} foregroundStyle="secondaryLabel">
                <Image systemName="number" font={14} fontWeight="semibold" />
                <Text font={14} lineLimit={1}>
                  {repo.topics.slice(0, 4).join(" · ")}
                </Text>
              </HStack>
            ) : null}
          </VStack>
        </Button>
      </VStack>
    </VStack>
  );
}
