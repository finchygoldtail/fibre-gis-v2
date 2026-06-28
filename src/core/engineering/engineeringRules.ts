import {
  EngineeringChangeType,
  EngineeringDocumentType,
  EngineeringImpactLevel,
  EngineeringPriority,
} from './engineeringTypes';
import type {
  EngineeringRule,
} from './engineeringTypes';

export const ENGINEERING_RULES: EngineeringRule[] = [
  {
    id: 'notes-no-action',
    label: 'Notes only - no engineering document action',
    changeTypes: [EngineeringChangeType.NoteChange, EngineeringChangeType.NoAction],
    impact: EngineeringImpactLevel.None,
    affectedDocuments: [],
    requiresRevision: false,
    requiresApproval: false,
    priority: EngineeringPriority.Low,
  },
  {
    id: 'photos-qa-pack',
    label: 'Photo changes update the QA pack',
    changeTypes: [EngineeringChangeType.PhotoChange],
    impact: EngineeringImpactLevel.Low,
    affectedDocuments: [EngineeringDocumentType.QAPack],
    requiresRevision: false,
    requiresApproval: false,
    priority: EngineeringPriority.Low,
  },
  {
    id: 'fibre-allocation-regenerate',
    label: 'Fibre allocation changes regenerate FAS and Build Pack',
    changeTypes: [EngineeringChangeType.FibreAllocationChange],
    impact: EngineeringImpactLevel.Medium,
    affectedDocuments: [EngineeringDocumentType.FAS, EngineeringDocumentType.BuildPack],
    requiresRevision: false,
    requiresApproval: true,
    priority: EngineeringPriority.Normal,
  },
  {
    id: 'home-move-regenerate',
    label: 'Home moves regenerate FAS and Build Pack',
    changeTypes: [EngineeringChangeType.HomeMove],
    impact: EngineeringImpactLevel.Medium,
    affectedDocuments: [EngineeringDocumentType.FAS, EngineeringDocumentType.BuildPack],
    requiresRevision: false,
    requiresApproval: true,
    priority: EngineeringPriority.Normal,
  },
  {
    id: 'major-asset-move-revision',
    label: 'DP, pole and cable route changes require engineering revision',
    changeTypes: [
      EngineeringChangeType.DistributionPointMove,
      EngineeringChangeType.PoleMove,
      EngineeringChangeType.CableRouteChange,
      EngineeringChangeType.AssetDeleted,
    ],
    impact: EngineeringImpactLevel.Major,
    affectedDocuments: [
      EngineeringDocumentType.BuildPack,
      EngineeringDocumentType.FAS,
      EngineeringDocumentType.AsBuilt,
      EngineeringDocumentType.WalkOffPack,
    ],
    requiresRevision: true,
    requiresApproval: true,
    priority: EngineeringPriority.High,
  },
  {
    id: 'commercial-pack-only',
    label: 'Commercial document changes affect commercial pack only',
    changeTypes: [EngineeringChangeType.CommercialDocumentChange],
    impact: EngineeringImpactLevel.CommercialOnly,
    affectedDocuments: [EngineeringDocumentType.CommercialPack],
    requiresRevision: false,
    requiresApproval: false,
    priority: EngineeringPriority.Normal,
  },
  {
    id: 'asset-created-review',
    label: 'New engineering assets require review and generated packs',
    changeTypes: [EngineeringChangeType.AssetCreated],
    impact: EngineeringImpactLevel.Medium,
    affectedDocuments: [EngineeringDocumentType.BuildPack, EngineeringDocumentType.FAS],
    requiresRevision: false,
    requiresApproval: true,
    priority: EngineeringPriority.Normal,
  },
  {
    id: 'default-attribute-review',
    label: 'General engineering attribute changes require engineering review',
    changeTypes: [EngineeringChangeType.AttributeChange, EngineeringChangeType.MixedChange],
    impact: EngineeringImpactLevel.Low,
    affectedDocuments: [EngineeringDocumentType.BuildPack],
    requiresRevision: false,
    requiresApproval: false,
    priority: EngineeringPriority.Low,
  },
];

export function getEngineeringRule(changeType: EngineeringChangeType): EngineeringRule {
  return (
    ENGINEERING_RULES.find((rule) => rule.changeTypes.includes(changeType)) ??
    ENGINEERING_RULES[ENGINEERING_RULES.length - 1]
  );
}

export function mergeEngineeringRules(changeTypes: EngineeringChangeType[]): EngineeringRule {
  const rules = changeTypes.map(getEngineeringRule);
  const affectedDocuments = Array.from(new Set(rules.flatMap((rule) => rule.affectedDocuments)));
  const requiresRevision = rules.some((rule) => rule.requiresRevision);
  const requiresApproval = rules.some((rule) => rule.requiresApproval);
  const priorityOrder = [EngineeringPriority.Low, EngineeringPriority.Normal, EngineeringPriority.High, EngineeringPriority.Critical];
  const impactOrder = [
    EngineeringImpactLevel.None,
    EngineeringImpactLevel.Low,
    EngineeringImpactLevel.CommercialOnly,
    EngineeringImpactLevel.Medium,
    EngineeringImpactLevel.Major,
  ];

  return {
    id: 'merged-engineering-rule',
    label: 'Merged engineering rule',
    changeTypes,
    impact: rules.reduce((highest, rule) =>
      impactOrder.indexOf(rule.impact) > impactOrder.indexOf(highest) ? rule.impact : highest,
    EngineeringImpactLevel.None),
    affectedDocuments,
    requiresRevision,
    requiresApproval,
    priority: rules.reduce((highest, rule) =>
      priorityOrder.indexOf(rule.priority) > priorityOrder.indexOf(highest) ? rule.priority : highest,
    EngineeringPriority.Low),
  };
}
