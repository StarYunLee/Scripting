import {
  Button,
  Canvas,
  Image,
  ImageRenderer,
  MagnifyGesture,
  Navigation,
  NavigationStack,
  Slider,
  Text,
  VStack,
  ZStack,
  useState,
} from "scripting";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  applyCoverCrop,
  clampCropOffset,
  clampZoom,
  coverBaseScale,
  cropSourceRect,
} from "../services/cover-crop";

function cropViewport(): number {
  const shortest = Math.min(Device.screen.width, Device.screen.height);
  return Math.max(240, Math.min(shortest - 48, 360));
}

export function CoverCropPage(props: { image: UIImage }) {
  const { image } = props;
  const dismiss = Navigation.useDismiss();
  const viewport = cropViewport();
  const baseScale = coverBaseScale(image.width, image.height, viewport);

  const [zoom, setZoom] = useState(1);
  const [pinch, setPinch] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  const effectiveZoom = clampZoom(zoom * pinch);
  const clamped = clampCropOffset(
    offset.x + drag.x,
    offset.y + drag.y,
    image.width,
    image.height,
    viewport,
    effectiveZoom,
  );
  const displayW = image.width * baseScale * effectiveZoom;
  const displayH = image.height * baseScale * effectiveZoom;

  function commitOffset(nextX: number, nextY: number, nextZoom: number) {
    const next = clampCropOffset(
      nextX,
      nextY,
      image.width,
      image.height,
      viewport,
      nextZoom,
    );
    setOffset(next);
    setDrag({ x: 0, y: 0 });
  }

  async function handleConfirm() {
    setError(null);
    const source = cropSourceRect(
      image.width,
      image.height,
      viewport,
      effectiveZoom,
      clamped.x,
      clamped.y,
    );
    const edge = Math.min(
      1024,
      Math.max(64, Math.round(Math.min(source.width, source.height))),
    );
    try {
      const pngData = await ImageRenderer.toPNGData(
        <Canvas
          opaque={false}
          frame={{ width: edge, height: edge }}
          draw={(ctx, size) => {
            ctx.drawImage(
              { image },
              source.x,
              source.y,
              source.width,
              source.height,
              0,
              0,
              size.width,
              size.height,
            );
          }}
        />,
        { opaque: false, scale: 1 },
      );
      const fromPng = UIImage.fromData(pngData);
      if (fromPng) {
        dismiss(fromPng);
        return;
      }
    } catch {
      // 回退到 UIImage.renderedIn
    }
    const cropped = applyCoverCrop(
      image,
      viewport,
      effectiveZoom,
      clamped.x,
      clamped.y,
    );
    if (!cropped) {
      setError("裁切失败，请重试");
      return;
    }
    dismiss(cropped);
  }

  return (
    <NavigationStack>
      <VStack
        spacing={16}
        padding={20}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background="systemGroupedBackground"
        navigationTitle="调整封面"
        navigationBarTitleDisplayMode="inline"
        interactiveDismissDisabled
        toolbar={{
          confirmationAction: (
            <Button title="完成" action={() => void handleConfirm()} />
          ),
        }}
      >
        <Text font="subheadline" foregroundStyle="secondaryLabel">
          拖动选择区域，双指或滑杆缩放。封面按正方形裁切。
        </Text>

        <ZStack
          alignment="center"
          frame={{ width: viewport, height: viewport }}
          clipShape={{ type: "rect", cornerRadius: 24 }}
          contentShape="rect"
          border={{ style: "separator", width: 1 }}
          onDragGesture={{
            minDistance: 0,
            onChanged: (event) => {
              setDrag({
                x: event.translation.width,
                y: event.translation.height,
              });
            },
            onEnded: (event) => {
              commitOffset(
                offset.x + event.translation.width,
                offset.y + event.translation.height,
                effectiveZoom,
              );
            },
          }}
          simultaneousGesture={MagnifyGesture(0.01)
            .onChanged((event) => {
              setPinch(event.magnification);
            })
            .onEnded((event) => {
              const nextZoom = clampZoom(zoom * event.magnification);
              setZoom(nextZoom);
              setPinch(1);
              commitOffset(clamped.x, clamped.y, nextZoom);
            })}
        >
          <Image
            image={image}
            resizable
            renderingMode="original"
            interpolation="high"
            frame={{ width: displayW, height: displayH }}
            offset={{ x: clamped.x, y: clamped.y }}
            allowsHitTesting={false}
          />
        </ZStack>

        <Slider
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={effectiveZoom}
          onChanged={(value) => {
            const nextZoom = clampZoom(value);
            setZoom(nextZoom);
            setPinch(1);
            commitOffset(clamped.x, clamped.y, nextZoom);
          }}
        />

        {error ? (
          <Text font="footnote" foregroundStyle="systemRed">
            {error}
          </Text>
        ) : null}
      </VStack>
    </NavigationStack>
  );
}
