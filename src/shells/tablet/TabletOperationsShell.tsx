import { FibreTrayEditor } from "../../components/FibreTrayEditor";

export default function TabletOperationsShell() {
  return (
    <section className="alistra-device-shell alistra-tablet-shell" data-device-shell="tablet">
      <div className="alistra-field-mode-bar" aria-label="Tablet operations mode">
        <div>
          <strong>Tablet Operations</strong>
          <span>Condensed workspace using the same assets, permissions and save pipeline.</span>
        </div>
      </div>

      <FibreTrayEditor />
    </section>
  );
}
