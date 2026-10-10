import type { DetectionResult, DiscoveredField, Issue, SemanticKey, ServiceId } from "../../types/form";
import type { FormControl } from "../dom-utils";
import type { FieldRules } from "../field-matcher";
import type { RawSection, SectionDiscovery } from "../form-discovery";
import type { LocationLike, ServiceSignature } from "../service-detector";

export interface AdapterConfig extends ServiceSignature {
  id: string;
  /** Bump whenever patterns change; approvals are tied to the version. */
  version: number;
  /**
   * True only after the field vocabulary has been checked against the live
   * official form (see README "Live verification checklist").
   */
  liveVerified: boolean;
  fieldRules: FieldRules;
  /** Keys every pilgrim section must expose for the form to be considered a pilgrim-details form. */
  requiredKeys: readonly SemanticKey[];
  /** Keys that must have a valid, confirmed profile value whenever the form shows them. */
  criticalKeys: readonly SemanticKey[];
  /** Labels recognised as combined fields that are deliberately not filled. */
  combinedFieldPatterns: readonly RegExp[];
  /** Saved value -> additional option texts treated as the same choice. */
  optionAliases: Partial<Record<SemanticKey, Record<string, readonly string[]>>>;
}

export interface FieldMappingResult {
  section: RawSection;
  fields: DiscoveredField[];
  elements: Map<string, FormControl>;
  excludedControls: FormControl[];
}

export interface ValidationResult {
  ok: boolean;
  issues: Issue[];
}

export interface ServiceAdapter {
  readonly service: ServiceId;
  readonly config: AdapterConfig;
  detectPage(doc: Document, loc: LocationLike): DetectionResult;
  discoverPilgrimSections(doc: Document): SectionDiscovery;
  mapFields(section: RawSection): FieldMappingResult;
  validateMapping(mapping: FieldMappingResult): ValidationResult;
}
