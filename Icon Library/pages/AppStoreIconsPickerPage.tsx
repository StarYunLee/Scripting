import {
  HStack,
  Image,
  Navigation,
  Picker,
  Section,
  Text,
  VStack,
  useObservable,
  useState,
  List,
} from "scripting";
import {
  GlassActionRow,
  GlassDivider,
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/Glass";
import { glassListPageProps } from "../components/GlassListPage";
import {
  APP_STORE_COUNTRIES,
  APP_STORE_ENTITIES,
  appStoreArtworkUrl,
  appStoreListPreviewUrl,
  downloadAppStoreIconAsDraft,
  searchAppStore,
  type AppStoreApp,
  type AppStoreCornerStyle,
  type AppStoreCountry,
  type AppStoreEntity,
  type AppStoreResolution,
} from "../services/appStoreIcons";
import { confirmAddedDraft } from "../services/addDraftFlow";
import { formatError } from "../services/errors";
import { exportPngFile } from "../services/exportPng";
import type { UploadDraft } from "../services/models";

export type AppStorePickMode = "stay" | "back";

function AppStoreDetailPage(props: {
  app: AppStoreApp;
  onPicked: (draft: UploadDraft, mode: AppStorePickMode) => void;
}) {
  const dismiss = Navigation.useDismiss();
  const [resolution, setResolution] = useState<AppStoreResolution>(512);
  const [style, setStyle] = useState<AppStoreCornerStyle>("official");
  const [busy, setBusy] = useState<"upload" | "export" | null>(null);
  const previewUrl = appStoreArtworkUrl({
    app: props.app,
    resolution,
    style,
  });

  async function loadCurrentDraft() {
    return downloadAppStoreIconAsDraft({
      app: props.app,
      resolution,
      style,
    });
  }

  async function addToUpload() {
    if (busy) return;
    setBusy("upload");
    try {
      const draft = await loadCurrentDraft();
      const mode = await confirmAddedDraft(draft);
      props.onPicked(draft, mode);
      dismiss();
    } catch (error) {
      await Dialog.alert({
        title: "加入失败",
        message: formatError(error),
      });
    } finally {
      setBusy(null);
    }
  }

  async function exportPng() {
    if (busy) return;
    setBusy("export");
    try {
      const draft = await loadCurrentDraft();
      await exportPngFile({
        filename: draft.filename,
        data: draft.data,
      });
    } catch (error) {
      await Dialog.alert({
        title: "导出失败",
        message: formatError(error),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <List
      navigationTitle={props.app.trackName}
      {...glassListPageProps()}
    >
      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="预览" />}
      >
        <GlassGroup>
          <VStack
            alignment="center"
            spacing={10}
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity" }}
          >
            <Image
              imageUrl={previewUrl}
              resizable={true}
              scaleToFit={true}
              frame={{ width: 96, height: 96 }}
              placeholder={<Text>…</Text>}
            />
            <Text
              font={16}
              fontWeight="semibold"
              multilineTextAlignment="center"
            >
              {props.app.trackName}
            </Text>
            <Text font={13} foregroundStyle="secondaryLabel">
              {props.app.artistName}
            </Text>
            <Text font={12} foregroundStyle="tertiaryLabel">
              {`${props.app.platform} · ${props.app.primaryGenreName}`}
            </Text>
          </VStack>
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="规格" />}
      >
        <GlassGroup>
          <Picker
            title="尺寸"
            value={String(resolution)}
            onChanged={(value: string) =>
              setResolution(Number(value) as AppStoreResolution)
            }
            pickerStyle="menu"
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          >
            <Text tag="256">256</Text>
            <Text tag="512">512</Text>
            <Text tag="1024">1024</Text>
          </Picker>
          <GlassDivider />
          <Picker
            title="圆角"
            value={style}
            onChanged={(value: string) =>
              setStyle(value as AppStoreCornerStyle)
            }
            pickerStyle="menu"
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          >
            <Text tag="official">官方圆角</Text>
            <Text tag="original">原图</Text>
          </Picker>
        </GlassGroup>
      </Section>

      <Section listRowBackground={glassRowBackground}>
        <GlassGroup>
          <GlassActionRow
            title={busy === "upload" ? "加入中…" : "加入上传列表"}
            disabled={busy != null}
            action={() => {
              void addToUpload();
            }}
          />
          <GlassDivider />
          <GlassActionRow
            title={busy === "export" ? "导出中…" : "导出 PNG"}
            disabled={busy != null}
            action={() => {
              void exportPng();
            }}
          />
        </GlassGroup>
      </Section>
    </List>
  );
}

export function AppStoreIconsPickerPage(props: {
  onPicked: (draft: UploadDraft, mode: AppStorePickMode) => void;
}) {
  // searchable + onSubmit 需 Observable：提交时读 .value，避免闭包拿到旧 term。
  const term = useObservable("");
  // filters 用 Observable：键盘提交时读最新值；setValue 也会驱动界面刷新。
  const filters = useObservable({
    country: "cn" as AppStoreCountry,
    entity: "software" as AppStoreEntity,
  });
  const country = filters.value.country;
  const entity = filters.value.entity;
  const [results, setResults] = useState<AppStoreApp[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = results.find((item) => item.trackId === selectedId) ?? null;

  function updateCountry(value: AppStoreCountry) {
    filters.setValue({ ...filters.value, country: value });
  }

  function updateEntity(value: AppStoreEntity) {
    filters.setValue({ ...filters.value, entity: value });
  }

  async function runSearch() {
    const keyword = term.value.trim();
    if (!keyword) {
      await Dialog.alert({
        title: "请输入关键词",
        message: "输入应用名称后再搜索。",
      });
      return;
    }

    setSearching(true);
    setSearched(true);
    try {
      const next = await searchAppStore({
        term: keyword,
        country: filters.value.country,
        entity: filters.value.entity,
        limit: 18,
      });
      setResults(next);
      if (next.length === 0) {
        await Dialog.alert({
          title: "无结果",
          message: "换个关键词、平台或地区再试。",
        });
      }
    } catch (error) {
      setResults([]);
      await Dialog.alert({
        title: "搜索失败",
        message: formatError(error),
      });
    } finally {
      setSearching(false);
    }
  }

  return (
    <List
      navigationTitle="App Store"
      {...glassListPageProps()}
      submitLabel="search"
      searchable={{
        value: term,
        prompt: "搜索 App Store 应用",
        placement: "navigationBarDrawerAlwaysDisplay" as const,
      }}
      onSubmit={{
        triggers: "search" as const,
        action: () => {
          void runSearch();
        },
      }}
      navigationDestination={{
        isPresented: selected != null,
        onChanged: (value: boolean) => {
          if (!value) setSelectedId(null);
        },
        content: selected ? (
          <AppStoreDetailPage
            key={selected.trackId}
            app={selected}
            onPicked={props.onPicked}
          />
        ) : (
          <Text>选择应用</Text>
        ),
      }}
    >
<Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="筛选" />}
      >
        <GlassGroup>
          <Picker
            title="平台"
            value={entity}
            onChanged={(value: string) => updateEntity(value as AppStoreEntity)}
            pickerStyle="menu"
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          >
            {APP_STORE_ENTITIES.map((item) => (
              <Text key={item.id} tag={item.id}>
                {item.title}
              </Text>
            ))}
          </Picker>
          <GlassDivider />
          <Picker
            title="地区"
            value={country}
            onChanged={(value: string) => updateCountry(value as AppStoreCountry)}
            pickerStyle="menu"
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          >
            {APP_STORE_COUNTRIES.map((item) => (
              <Text key={item.id} tag={item.id}>
                {item.title}
              </Text>
            ))}
          </Picker>
          <GlassDivider />
          <GlassActionRow
            title={searching ? "搜索中…" : "搜索"}
            disabled={searching}
            action={() => {
              void runSearch();
            }}
          />
        </GlassGroup>
      </Section>

      {searching || searched ? (
        <Section
          listRowBackground={glassRowBackground}
          header={
            <GlassSectionHeader
              title={searching ? "结果" : `结果 ${results.length}`}
            />
          }
        >
          <GlassGroup>
            {searching ? (
              <Text
                foregroundStyle="secondaryLabel"
                padding={{ vertical: true }}
                frame={{ maxWidth: "infinity" }}
              >
                搜索中…
              </Text>
            ) : results.length === 0 ? (
              <Text
                foregroundStyle="secondaryLabel"
                padding={{ vertical: true }}
                frame={{ maxWidth: "infinity" }}
              >
                没有匹配的应用
              </Text>
            ) : (
              results.map((app, index) => (
                <VStack
                  key={app.trackId}
                  spacing={0}
                  frame={{ maxWidth: "infinity" }}
                >
                  {index > 0 ? <GlassDivider /> : null}
                  <HStack
                    spacing={12}
                    padding={{ vertical: true }}
                    frame={{ minHeight: 64, maxWidth: "infinity" }}
                    contentShape="rect"
                    onTapGesture={() => setSelectedId(app.trackId)}
                  >
                    <Image
                      imageUrl={appStoreListPreviewUrl(app)}
                      resizable={true}
                      scaleToFit={true}
                      frame={{ width: 48, height: 48 }}
                      clipShape={{
                        type: "rect",
                        cornerRadius: 12,
                        style: "continuous",
                      }}
                      placeholder={<Text>…</Text>}
                    />
                    <VStack
                      alignment="leading"
                      spacing={2}
                      frame={{ maxWidth: "infinity", alignment: "leading" }}
                    >
                      <Text font={15} fontWeight="medium" lineLimit={1}>
                        {app.trackName}
                      </Text>
                      <Text
                        font={12}
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                      >
                        {app.artistName}
                      </Text>
                      <Text
                        font={11}
                        foregroundStyle="tertiaryLabel"
                        lineLimit={1}
                      >
                        {`${app.platform} · ${app.primaryGenreName}`}
                      </Text>
                    </VStack>
                    <Image
                      systemName="chevron.right"
                      foregroundStyle="tertiaryLabel"
                    />
                  </HStack>
                </VStack>
              ))
            )}
          </GlassGroup>
        </Section>
      ) : null}

    </List>
  );
}
