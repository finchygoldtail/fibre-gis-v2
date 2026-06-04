import { useState } from "react";

export function useHomeMoveController() {
  const [selectedMoveHomeIds, setSelectedMoveHomeIds] = useState<string[]>([]);

  const toggleMoveHome = (homeId: string) => {
    setSelectedMoveHomeIds((prev) =>
      prev.includes(homeId) ? prev.filter((id) => id !== homeId) : [...prev, homeId],
    );
  };

  const clearMoveHomes = () => setSelectedMoveHomeIds([]);

  return {
    selectedMoveHomeIds,
    setSelectedMoveHomeIds,
    toggleMoveHome,
    clearMoveHomes,
  };
}
