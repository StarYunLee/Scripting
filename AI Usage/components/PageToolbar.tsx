import {
  Button,
  HStack,
  Menu,
  Navigation,
  Toolbar,
  ToolbarItem,
} from "scripting";
import { PROVIDERS, type ProviderId } from "../models";

export function usePageToolbar(options?: {
  showAdd?: boolean;
  onAdd?: (provider: ProviderId) => void;
  showFilter?: boolean;
  filterProvider?: ProviderId | null;
  onFilter?: (provider: ProviderId | null) => void;
}) {
  const dismiss = Navigation.useDismiss();

  const filterIcon = options?.filterProvider
    ? "line.3.horizontal.decrease.circle.fill"
    : "line.3.horizontal.decrease.circle";

  return (
    <Toolbar>
      <ToolbarItem placement="topBarLeading">
        <Button
          title="返回"
          systemImage="chevron.left"
          labelStyle="iconOnly"
          action={dismiss}
        />
      </ToolbarItem>
      {options?.showAdd && options.onAdd ? (
        <ToolbarItem placement="topBarTrailing">
          <HStack spacing={14} alignment="center">
            <Menu title="添加账号" systemImage="plus" labelStyle="iconOnly">
              {PROVIDERS.map((item) => (
                <Button
                  key={item.id}
                  title={item.title}
                  action={() => options.onAdd?.(item.id)}
                />
              ))}
            </Menu>
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
