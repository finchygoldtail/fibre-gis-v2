import { useDeviceMode } from "../core/device/useDeviceMode";
import DesktopOperationsShell from "./desktop/DesktopOperationsShell";
import MobileOperationsShell from "./mobile/MobileOperationsShell";
import TabletOperationsShell from "./tablet/TabletOperationsShell";

export default function AlistraApplication() {
  const device = useDeviceMode();

  if (device.mode === "mobile") {
    return <MobileOperationsShell />;
  }

  if (device.mode === "tablet") {
    return <TabletOperationsShell />;
  }

  return <DesktopOperationsShell />;
}
