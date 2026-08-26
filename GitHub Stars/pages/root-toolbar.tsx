import {
  Button,
  Navigation,
  Toolbar,
  ToolbarItem,
  type VirtualNode,
} from "scripting";

export function useRootToolbar(
  topBarTrailing?: VirtualNode | readonly VirtualNode[],
) {
  const dismiss = Navigation.useDismiss();
  const trailingItems = topBarTrailing
    ? Array.isArray(topBarTrailing)
      ? topBarTrailing
      : [topBarTrailing]
    : [];

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
      {trailingItems.map((item, index) => (
        <ToolbarItem key={index} placement="topBarTrailing">
          {item}
        </ToolbarItem>
      ))}
    </Toolbar>
  );
}
