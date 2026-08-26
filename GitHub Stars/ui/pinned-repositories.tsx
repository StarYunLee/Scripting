import {
  Button,
  HStack,
  Image,
  RoundedRectangle,
  Text,
  VStack,
} from "scripting";
import { languageColor } from "../data/language-colors";
import type { GitHubRepository } from "../types";

function PinnedRepositoryCard(props: { repository: GitHubRepository }) {
  const repo = props.repository;
  const color = languageColor(repo.language) ?? "secondaryLabel";
  return (
    <Button
      buttonStyle="plain"
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      action={() => {
        void Safari.present(repo.htmlUrl, false);
      }}
    >
      <VStack
        spacing={8}
        alignment="leading"
        padding={10}
        frame={{ maxWidth: "infinity", minHeight: 72, alignment: "leading" }}
        background={
          <RoundedRectangle
            cornerRadius={12}
            style="continuous"
            fill="secondarySystemGroupedBackground"
            stroke={{ color: "separator", lineWidth: 1 }}
          />
        }
        contentShape="rect"
      >
        <Text font="footnote" lineLimit={1}>
          {repo.name}
        </Text>
        <HStack spacing={6}>
          <HStack spacing={3}>
            <Image
              systemName="star.fill"
              font={11}
              foregroundStyle="systemYellow"
            />
            <Text font="caption2" foregroundStyle="secondaryLabel">
              {repo.stargazersCount}
            </Text>
          </HStack>
          {repo.language ? (
            <HStack spacing={3}>
              <RoundedRectangle
                cornerRadius={3}
                fill={color}
                frame={{ width: 7, height: 7 }}
              />
              <Text
                font="caption2"
                foregroundStyle="secondaryLabel"
                lineLimit={1}
              >
                {repo.language}
              </Text>
            </HStack>
          ) : null}
        </HStack>
      </VStack>
    </Button>
  );
}

function chunkPairs(
  repositories: readonly GitHubRepository[],
): GitHubRepository[][] {
  const rows: GitHubRepository[][] = [];
  for (let index = 0; index < repositories.length; index += 2) {
    rows.push(repositories.slice(index, index + 2));
  }
  return rows;
}

export function PinnedRepositories(props: {
  repositories: readonly GitHubRepository[];
}) {
  if (props.repositories.length === 0) return null;
  return (
    <VStack
      spacing={8}
      alignment="leading"
      frame={{ maxWidth: "infinity", alignment: "leading" }}
    >
      <Text font="footnote">Pinned</Text>
      {chunkPairs(props.repositories).map((row) => (
        <HStack
          key={row.map((item) => item.nodeId).join("-")}
          spacing={8}
          alignment="top"
          frame={{ maxWidth: "infinity" }}
        >
          {row.map((repository) => (
            <PinnedRepositoryCard
              key={repository.nodeId}
              repository={repository}
            />
          ))}
          {row.length === 1 ? (
            <VStack frame={{ maxWidth: "infinity" }} />
          ) : null}
        </HStack>
      ))}
    </VStack>
  );
}
