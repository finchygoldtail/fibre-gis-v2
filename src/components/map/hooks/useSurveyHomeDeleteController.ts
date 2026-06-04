import { useState } from "react";

export function useSurveyHomeDeleteController() {
  const [selectedSurveyDeleteHomeIds, setSelectedSurveyDeleteHomeIds] = useState<string[]>([]);

  const toggleSurveyDeleteHome = (homeId: string) => {
    setSelectedSurveyDeleteHomeIds((prev) =>
      prev.includes(homeId) ? prev.filter((id) => id !== homeId) : [...prev, homeId],
    );
  };

  const clearSurveyDeleteHomes = () => setSelectedSurveyDeleteHomeIds([]);

  return {
    selectedSurveyDeleteHomeIds,
    setSelectedSurveyDeleteHomeIds,
    toggleSurveyDeleteHome,
    clearSurveyDeleteHomes,
  };
}
