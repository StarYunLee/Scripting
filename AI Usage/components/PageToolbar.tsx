import { Button, Menu, Navigation, Toolbar, ToolbarItem } from "scripting";
import { PROVIDERS, type ProviderId } from "../models";

export function usePageToolbar(options?: {
  showAdd?: boolean;
  onAdd?: (provider: ProviderId) => void;
}) {
  const dismiss = Navigation.useDismiss();

  return (
    <Toolbar>
      <ToolbarItem placement="cancellationAction">
        <Button
          title="关闭"
          systemImage="xmark"
          labelStyle="iconOnly"
          action={dismiss}
        />
      </ToolbarItem>
      {options?.showAdd && options.onAdd ? (
        <ToolbarItem placement="topBarTrailing">
          <Menu title="添加账号" systemImage="plus" labelStyle="iconOnly">
            {PROVIDERS.map((item) => (
              <Button
                key={item.id}
                title={item.title}
                action={() => options.onAdd?.(item.id)}
              />
            ))}
          </Menu>
        </ToolbarItem>
      ) : null}
    </Toolbar>
  );
}
