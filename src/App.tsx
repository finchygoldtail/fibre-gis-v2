import AuthGate from "./components/AuthGate";
import { FibreTrayEditor } from "./components/FibreTrayEditor";

export default function App() {
  return (
    <AuthGate>
      <FibreTrayEditor />
    </AuthGate>
  );
}