import { Button, Navigation, Toolbar, ToolbarItem } from "scripting";

export function useRootToolbar() {
  const dismiss = Navigation.useDismiss();

  return (
    <Toolbar>
      <ToolbarItem placement="cancellationAction">
        <Button
          title="返回"
          systemImage="chevron.left"
          labelStyle="iconOnly"
          action={dismiss}
        />
      </ToolbarItem>
    </Toolbar>
  );
}
