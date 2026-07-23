import { httpsCallable } from "firebase/functions";
import type { PermitDetails } from "../components/map/types";
import { functions } from "../firebase";

type ExtendStreetManagerPermitRequest = {
  businessId: string;
  assetId: string;
  permitDetails: PermitDetails;
  newEndDate: string;
  reason: string;
};

type ExtendStreetManagerPermitResponse = {
  success: boolean;
  skipped?: boolean;
  message?: string;
  streetManagerReference?: string;
};

export async function extendStreetManagerPermit(
  request: ExtendStreetManagerPermitRequest,
): Promise<ExtendStreetManagerPermitResponse> {
  const callable = httpsCallable<
    ExtendStreetManagerPermitRequest,
    ExtendStreetManagerPermitResponse
  >(functions, "extendStreetManagerPermit");

  const result = await callable(request);
  return result.data;
}
