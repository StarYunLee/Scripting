import { Navigation, Script } from "scripting";
import { AppRoot } from "./components/AppRoot";

function IndexApp() {
  const dismiss = Navigation.useDismiss();
  return <AppRoot host="index" onDismiss={dismiss} />;
}

async function run() {
  await Navigation.present({
    element: <IndexApp />,
    modalPresentationStyle: "overFullScreen",
  });
  Script.exit();
}

run();
