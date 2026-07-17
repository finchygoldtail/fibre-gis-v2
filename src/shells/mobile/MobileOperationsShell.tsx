import { FibreTrayEditor } from "../../components/FibreTrayEditor";

type MobileShellAction = "map" | "work";

function dispatchMobileShellAction(action: MobileShellAction) {
  window.dispatchEvent(
    new CustomEvent("alistra:mobile-shell-action", {
      detail: { action },
    }),
  );
}

export default function MobileOperationsShell() {
  return (
    <section className="alistra-device-shell alistra-mobile-shell" data-device-shell="mobile">
      <FibreTrayEditor />

      <nav className="alistra-mobile-bottomnav" aria-label="Mobile field navigation">
        <button type="button" onClick={() => dispatchMobileShellAction("map")}>
          <strong>Map</strong>
        </button>
        <button type="button" onClick={() => dispatchMobileShellAction("work")}>
          <strong>Work</strong>
        </button>
      </nav>
    </section>
  );
}
