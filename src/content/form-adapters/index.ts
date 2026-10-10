import type { ServiceId } from "../../types/form";
import { createServiceAdapter } from "./base";
import { SED_ADAPTER_CONFIG } from "./sed.adapter";
import { ANGAPRADAKSHINA_ADAPTER_CONFIG } from "./angapradakshina.adapter";
import type { AdapterConfig, ServiceAdapter } from "./types";

export const ADAPTER_CONFIGS: Record<ServiceId, AdapterConfig> = {
  sed: SED_ADAPTER_CONFIG,
  angapradakshina: ANGAPRADAKSHINA_ADAPTER_CONFIG,
};

const signatures = () => Object.values(ADAPTER_CONFIGS);

export const ADAPTERS: Record<ServiceId, ServiceAdapter> = {
  sed: createServiceAdapter(SED_ADAPTER_CONFIG, signatures),
  angapradakshina: createServiceAdapter(ANGAPRADAKSHINA_ADAPTER_CONFIG, signatures),
};
