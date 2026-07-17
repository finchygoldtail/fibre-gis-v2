import { FibreTrayEditor } from "../../components/FibreTrayEditor";

export default function MobileOperationsShell() {
  return (
    <section className="alistra-device-shell alistra-mobile-shell" data-device-shell="mobile">
      <div className="alistra-field-mode-bar" aria-label="Mobile field operations mode">
        <div>
          <strong>Field Operations</strong>
          <span>Map, assets, work and photos use the shared Alistra GIS core.</span>
        </div>
      </div>

      <FibreTrayEditor />
    </section>
  );
}
