import { Button, HStack, Menu, Toolbar, ToolbarItem } from "scripting";
import { PROVIDERS, type AppHost, type ProviderId } from "../models";

export function buildPageToolbar(options?: {
  host?: AppHost;
  showLeading?: boolean;
  onDismiss?: () => void;
  showAdd?: boolean;
  onAdd?: (provider: ProviderId) => void;
  showFilter?: boolean;
  filterProvider?: ProviderId | null;
  onFilter?: (provider: ProviderId | null) => void;
  onOpenSettings?: () => void;
}) {
  const filterIcon = options?.filterProvider
    ? "line.3.horizontal.decrease.circle.fill"
    : "line.3.horizontal.decrease.circle";

  const hasTrailing =
    (options?.showAdd && options.onAdd) ||
    (options?.showFilter && options.onFilter);

  return (
    <Toolbar>
      {options?.showLeading === false ? null : options?.host ===
        "home_screen" ? (
        options.onOpenSettings ? (
          <ToolbarItem placement="topBarLeading">
            <Button
              title="设置"
              systemImage="gearshape"
              labelStyle="iconOnly"
              action={options.onOpenSettings}
            />
          </ToolbarItem>
        ) : null
      ) : options?.onDismiss ? (
        <ToolbarItem placement="topBarLeading">
          <Button
            title="返回"
            systemImage="chevron.left"
            labelStyle="iconOnly"
            action={options.onDismiss}
          />
        </ToolbarItem>
      ) : null}
      {hasTrailing ? (
        <ToolbarItem placement="topBarTrailing">
          <HStack spacing={14} alignment="center">
            {options?.showAdd && options.onAdd ? (
              <Menu title="添加账号" systemImage="plus" labelStyle="iconOnly">
                {PROVIDERS.map((item) => (
                  <Button
                    key={item.id}
                    title={item.title}
                    action={() => options.onAdd?.(item.id)}
                  />
                ))}
              </Menu>
            ) : null}
            {options?.showFilter && options.onFilter ? (
              <Menu
                title="筛选平台"
                systemImage={filterIcon}
                labelStyle="iconOnly"
              >
                <Button
                  title={
                    options.filterProvider === null ? "✓ 全部平台" : "全部平台"
                  }
                  action={() => options.onFilter?.(null)}
                />
                {PROVIDERS.map((item) => {
                  const isSelected = options.filterProvider === item.id;
                  return (
                    <Button
                      key={item.id}
                      title={isSelected ? `✓ ${item.title}` : item.title}
                      action={() => options.onFilter?.(item.id)}
                    />
                  );
                })}
              </Menu>
            ) : null}
          </HStack>
        </ToolbarItem>
      ) : null}
    </Toolbar>
  );
}
