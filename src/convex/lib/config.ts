// Shared configuration for business-profile selectors and document metadata.
// Kept in src/convex so the backend and the frontend both use the same source
// of truth. STILL: only Maharashtra + Food Processing has verified rules.
export const STATES = ["Maharashtra", "Telangana", "Karnataka"] as const;

export const DISTRICTS: Record<string, string[]> = {
  Maharashtra: ["Pune", "Mumbai", "Nashik", "Nagpur", "Aurangabad"],
  Telangana: ["Hyderabad", "Ranga Reddy", "Medchal"],
  Karnataka: ["Bengaluru Urban", "Mysuru", "Belagavi"],
};

export const SECTORS = [
  "Food Processing",
  "Manufacturing",
  "Pharmaceuticals",
  "Textiles",
  "Electronics",
  "Chemicals",
] as const;

export const BUSINESS_TYPES = ["Private Limited Company", "LLP", "Partnership Firm", "Proprietorship"];

export const PROJECT_TYPES = [
  "New Manufacturing Unit",
  "Expansion",
  "Modernisation",
  "Diversification",
  "Ancillary Unit",
] as const;

export const PROJECT_STAGES = [
  "Concept / Planning",
  "Land Acquisition",
  "Construction",
  "Commissioning",
  "Operational",
] as const;

export const OPERATIONAL_CONDITIONS = [
  "Packaged Goods Sales",
  "Steam Boiler Installed",
  "Groundwater Extraction",
  "Hazardous Waste Generated",
  "Exports (>50%)",
  "Cold Chain Operations",
] as const;

/** Label map for rule document requirement keys. */
export const DOCUMENT_TYPES: Record<string, string> = {
  udyam: "Udyam / MSME Registration",
  pan: "PAN Card",
  address_proof: "Address Proof",
  factory_plan: "Factory Layout Plan",
  fire_noc: "Fire NOC",
  electrical_cert: "Electrical Safety Certificate",
  site_plan: "Site Plan",
  water_consent_form: "Water Consent Application",
  cte_cert: "Consent to Establish Certificate",
  effluent_plan: "Effluent Treatment Plan",
  air_control_plan: "Air Pollution Control Plan",
  fssai_form: "FSSAI Application / Licence",
  water_test_report: "Water Test Report",
  premises_photo: "Premises Photograph",
  building_plan: "Building Plan",
  land_document: "Land / Lease Document",
  structural_cert: "Structural Stability Certificate",
  electrical_layout: "Electrical Layout",
  load_details: "Connected Load Details",
  packaging_details: "Packaging Details",
  boiler_cert: "Boiler Certificate",
  boiler_layout: "Boiler Room Layout",
  hazardous_waste_form: "Hazardous Waste Application",
  waste_storage_plan: "Waste Storage Plan",
  borewell_details: "Borewell Details",
  other: "Other",
};

export const DOC_FIELD_LABELS: Record<string, string> = {
  businessName: "Business Name",
  documentNumber: "Document / Certificate Number",
  registrationNumber: "Registration Number",
  issueDate: "Issue Date",
  expiryDate: "Expiry Date",
  authority: "Issuing Authority",
  certificateType: "Certificate Type",
  address: "Registered Address",
};

/** Normalize a string for deterministic comparisons. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}