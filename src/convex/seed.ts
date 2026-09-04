// ---------------------------------------------------------------------------
// Demo bootstrap — seeds the prototype environment for the SIH 2026 demo.
//
// - Clearly-labelled DEMO accounts (credentials are demo-only, not real
//   government identities).
// - Curated, reviewed Maharashtra + Food Processing rule dataset.
// - A realistic application landscape for GreenHarvest Foods: draft, at-risk
//   (with query + inspection), approved (with compliance), blocked.
// - Prototype issuer registry, working calendars, schemes.
//
// Re-running is safe: guarded by a `demo_seeded` setting flag.
// ---------------------------------------------------------------------------
import { createAccount } from "@convex-dev/auth/server";
import { action, ActionCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { WriterCtx, recordAudit } from "./lib/authz";
import { DEMO_RULES } from "./seed/rules";
import { DEMO_SCHEMES } from "./seed/schemes";
import { generateComplianceForApprovedApp } from "./compliance";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number) {
  return Date.now() - n * DAY;
}
function workingDaysAgo(n: number) {
  // Simplified: 5-day work weeks, so calendar days ≈ n * 7 / 5
  return Date.now() - Math.round(n * 1.4) * DAY;
}
function futureWorking(days: number) {
  return Date.now() + Math.round(days * 1.4) * DAY;
}

const seededCheck = async (ctx: ActionCtx) => {
  const s = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "demo_seeded"))
    .first();
  return !!s;
};

async function createUser(
  ctx: ActionCtx,
  opts: {
    email: string;
    password: string;
    name: string;
    role: "applicant" | "dept_officer" | "dept_supervisor" | "admin";
    department?: string;
    employeeId?: string;
  },
) {
  const { user } = await createAccount(ctx, {
    provider: "password",
    account: { id: opts.email, secret: opts.password },
    profile: {
      email: opts.email,
      emailVerificationTime: Date.now(),
      name: opts.name,
    },
  });
  await ctx.db.patch(user._id, {
    role: opts.role,
    department: opts.department,
    employeeId: opts.employeeId,
  } as never);
  return user;
}

export const bootstrapDemo = action({
  args: {},
  handler: async (ctx: ActionCtx) => {
    if (await seededCheck(ctx)) {
      return { alreadySeeded: true };
    }

    const writer = ctx as unknown as WriterCtx;
    const now = Date.now();

    // ---------------------------------------------------------- demo users
    const applicant = await createUser(ctx, {
      email: "demo.applicant@approvalarc.in",
      password: "DemoPass@2026",
      name: "Demo Applicant",
      role: "applicant",
    });
    const officer = await createUser(ctx, {
      email: "demo.officer@mpcb.in",
      password: "DemoPass@2026",
      name: "Demo Officer",
      role: "dept_officer",
      department: "Maharashtra Pollution Control Board",
      employeeId: "EMP-MPCB-1042",
    });
    const supervisor = await createUser(ctx, {
      email: "demo.supervisor@mpcb.in",
      password: "DemoPass@2026",
      name: "Demo Supervisor",
      role: "dept_supervisor",
      department: "Maharashtra Pollution Control Board",
      employeeId: "EMP-MPCB-0007",
    });
    const admin = await createUser(ctx, {
      email: "demo.admin@approvalarc.in",
      password: "DemoPass@2026",
      name: "Demo Administrator",
      role: "admin",
    });

    // ------------------------------------------------- demo organization
    const orgId = await ctx.db.insert("organizations", {
      name: "GreenHarvest Foods Pvt. Ltd.",
      ownerId: applicant._id,
      contactName: "Demo Applicant",
      contactEmail: "demo.applicant@approvalarc.in",
      contactPhone: "+91 98xxxxxx00",
      address: "Plot 21, MIDC Bhosari, Pune, Maharashtra 411026",
    } as never);
    await ctx.db.patch(applicant._id, { organizationId: orgId } as never);

    const profileId = await ctx.db.insert("businessProfiles", {
      organizationId: orgId,
      businessType: "Private Limited Company",
      sector: "Food Processing",
      state: "Maharashtra",
      district: "Pune",
      projectType: "New Manufacturing Unit",
      projectStage: "Commissioning",
      investment: 500, // ₹5 crore = 500 lakh
      employeeCount: 80,
      premisesOwnership: "Leased (MIDC industrial plot)",
      landArea: "4,000 sqm",
      operationalConditions: ["Packaged Goods Sales", "Steam Boiler Installed", "Groundwater Extraction", "Hazardous Waste Generated"],
    } as never);
    const businessProfile = (await ctx.db.get(profileId)) as Doc<"businessProfiles">;

    // ---------------------------------------------------------------- rules
    for (const r of DEMO_RULES) {
      await ctx.db.insert("regulatoryRules", r as never);
    }
    await ctx.db.insert("regulatorySources", {
      title: "Prototype curated source — Maharashtra Food Processing approvals",
      authority: "Multiple (see each rule)",
      url: "https://example.in/prototype-source",
      publicationDate: now - 120 * DAY,
      retrievedAt: now - 15 * DAY,
      rawExcerpt: "Curated demo dataset for SIH 2026; not an official legal record.",
    } as never);

    // ------------------------------------------------------------- schemes
    for (const s of DEMO_SCHEMES) {
      await ctx.db.insert("schemes", s as never);
    }

    // ------------------------------------------------- working calendars
    await ctx.db.insert("workingCalendars", {
      jurisdiction: "INDIA",
      name: "National working calendar (Mon–Fri)",
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      holidays: [],
    } as never);
    await ctx.db.insert("workingCalendars", {
      jurisdiction: "STATE:Maharashtra",
      state: "Maharashtra",
      name: "Maharashtra working calendar (Mon–Fri)",
      workDays: ["MON", "TUE", "WED", "THU", "FRI"],
      holidays: [],
    } as never);

    // ------------------------------------------------------ issuer registry
    await ctx.db.insert("issuerRegistry", {
      registryName: "Udyam Registration Prototype Lookup",
      authority: "Directorate of Industries, Maharashtra (prototype)",
      lookupType: "REGISTRATION_NUMBER",
      registerKey: "UDYAM-MH-08-0123456",
      businessName: "GreenHarvest Foods Pvt. Ltd.",
      issueDate: now - 200 * DAY,
      expiryDate: null as never,
      status: "ACTIVE",
      sourceNote: "Prototype issuer registry — simulation, not a live government connection.",
    } as never);
    await ctx.db.insert("issuerRegistry", {
      registryName: "FSSAI Licence Prototype Lookup",
      authority: "FSSAI (prototype)",
      lookupType: "CERTIFICATE_NUMBER",
      registerKey: "FSSAI-21524121000000",
      businessName: "GreenHarvest Foods Pvt. Ltd.",
      issueDate: now - 240 * DAY,
      expiryDate: futureWorking(1500),
      status: "ACTIVE",
      sourceNote: "Prototype issuer registry — simulation, not a live government connection.",
    } as never);

    // ------------------------------------------------------------ helpers
    let seq = 1000;
    const doc = async (d: {
      ruleId: string;
      applicationId?: Id<"applications">;
      documentType: string;
      fileName: string;
      businessName: string;
      documentNumber: string;
      issueDate?: number;
      expiryDate?: number;
      verified: boolean;
      confirmed: boolean;
      requiresReview?: boolean;
    }) => {
      const id = `doc-${seq++}`;
      const fields = [
        { key: "businessName", label: "Business Name", value: d.businessName, source: "confirmed" as const },
        { key: "documentNumber", label: "Document / Certificate Number", value: d.documentNumber, source: "confirmed" as const },
        { key: "issueDate", label: "Issue Date", value: d.issueDate ? new Date(d.issueDate).toISOString().slice(0, 10) : undefined, source: "confirmed" as const },
        ...(d.expiryDate ? [{ key: "expiryDate", label: "Expiry Date", value: new Date(d.expiryDate).toISOString().slice(0, 10), source: "confirmed" as const }] : []),
      ];
      const nowI = daysAgo(2);
      const documentId = await ctx.db.insert("documents", {
        organizationId: orgId,
        applicationId: d.applicationId,
        uploadedBy: applicant._id,
        fileName: d.fileName,
        mimeType: "application/pdf",
        size: 240_000,
        sha256: sha(id),
        extractionStatus: d.requiresReview ? ("EXTRACTED" as const) : ("EXTRACTED" as const),
        extractedText: `${d.businessName}\n${d.documentNumber}`,
        extractedFields: d.requiresReview
          ? [{ key: "businessName", label: "Business Name", value: d.businessName, source: "extract" as const }]
          : (fields as never),
        fieldsConfirmed: d.confirmed,
        documentType: d.documentType,
        validationStatus: d.requiresReview ? "PENDING" : d.verified ? "PASSED" : "PARTIAL",
        validationChecks: [],
        verificationStatus: d.requiresReview
          ? "NEEDS_REVIEW"
          : d.verified
            ? "VERIFIED"
            : "AUTHENTICITY_UNAVAILABLE",
        verificationDetail: d.requiresReview
          ? "Prototype issuer registry returned NOT_FOUND for the reference number."
          : d.verified
            ? "Verified against prototype issuer registry."
            : "Demo record; issuer verification unavailable.",
        status: "ACTIVE",
        version: 1,
      } as never);
      await ctx.db.insert("documentVersions", {
        documentId,
        version: 1,
        fileName: d.fileName,
        sha256: sha(id),
        size: 240_000,
        changedBy: applicant._id,
        changedAt: nowI,
        note: "Initial upload (demo record)",
      } as never);
      return documentId;
    };

    const appEvent = (applicationId: Id<"applications">, e: { eventType: string; actorName: string; from?: string; to?: string; detail?: string; at: number; visibility?: "APPLICANT_VISIBLE" | "INTERNAL_ONLY" }) =>
      ctx.db.insert("applicationEvents", {
        applicationId,
        eventType: e.eventType,
        actorId: applicant._id,
        actorName: e.actorName,
        from: e.from,
        to: e.to,
        detail: e.detail,
        occurredAt: e.at,
        visibility: e.visibility ?? "APPLICANT_VISIBLE",
      } as never);

    const seedSla = (applicationId: Id<"applications">, days: number, status: string, at: number) =>
      ctx.db.insert("slaRecords", {
        applicationId,
        appliedRuleDays: days,
        grossElapsedMs: at,
        officialElapsedMs: at,
        applicantWaitMs: 0,
        remainingMs: 0,
        status,
        computedAt: at,
      } as never);

    // ============================================ APP 1: Udyam (APPROVED)
    const udyamId = await ctx.db.insert("applications", {
      organizationId: orgId,
      businessProfileId: profileId,
      ruleId: "MH-FP-001",
      approvalTitle: "Udyam / MSME Business Registration",
      authority: "Directorate of Industries, Govt. of Maharashtra",
      department: "Industries & Commerce",
      status: "APPROVED",
      slaWorkingDays: 7,
      submittedAt: workingDaysAgo(30),
      governmentRefId: "MH-GATE-UDYAM-0001",
      pauseIntervals: [],
      applicantWaitMs: 0,
      decisionAt: workingDaysAgo(28),
      decisionBy: supervisor._id,
      lastSlaStatus: "ON_TRACK",
    } as never);
    await appEvent(udyamId, { eventType: "APPLICATION_CREATED", actorName: "Demo Applicant", to: "DRAFT", detail: "Created draft", at: workingDaysAgo(32) });
    await appEvent(udyamId, { eventType: "APPLICATION_SUBMITTED", actorName: "Demo Applicant", from: "READY_FOR_SUBMISSION", to: "SUBMITTED", detail: "Reference MH-GATE-UDYAM-0001", at: workingDaysAgo(30) });
    await appEvent(udyamId, { eventType: "APPLICATION_APPROVED", actorName: "Demo Supervisor", from: "DECISION_PENDING", to: "APPROVED", detail: "Approved by department", at: workingDaysAgo(28) });
    await seedSla(udyamId, 7, "ON_TRACK", workingDaysAgo(28));
    await ctx.db.insert("governmentSubmissions", {
      applicationId: udyamId,
      governmentRefId: "MH-GATE-UDYAM-0001",
      gatewayMode: "MOCK",
      status: "APPROVED",
      submittedAt: workingDaysAgo(30),
      lastSyncAt: workingDaysAgo(28),
      rawResponse: "MOCK_GATEWAY: approved",
      isSimulation: true,
    } as never);
    await doc({
      ruleId: "MH-FP-001", applicationId: udyamId, documentType: "udyam",
      fileName: "udyam-certificate.pdf", businessName: "GreenHarvest Foods Pvt. Ltd.",
      documentNumber: "UDYAM-MH-08-0123456", issueDate: now - 200 * DAY,
      verified: true, confirmed: true,
    });
    await doc({
      ruleId: "MH-FP-001", applicationId: udyamId, documentType: "pan",
      fileName: "pan-card.pdf", businessName: "GreenHarvest Foods Pvt. Ltd.",
      documentNumber: "PAN-AAHCG1234Q", issueDate: now - 400 * DAY,
      verified: false, confirmed: true,
    });
    const udyamRule = (await ctx.db
      .query("regulatoryRules")
      .filter((q) => q.eq(q.field("ruleId"), "MH-FP-001"))
      .first()) as Doc<"regulatoryRules">;
    if (udyamRule) {
      await generateComplianceForApprovedApp(writer, udyamId as never, udyamRule, workingDaysAgo(28));
    }

    // ============================================ APP 2: CTE (AT RISK + QUERY + INSPECTION)
    const cteId = await ctx.db.insert("applications", {
      organizationId: orgId,
      businessProfileId: profileId,
      ruleId: "MH-FP-003",
      approvalTitle: "Consent to Establish (CTE)",
      authority: "Maharashtra Pollution Control Board (MPCB)",
      department: "Maharashtra Pollution Control Board",
      status: "INSPECTION_REQUIRED",
      slaWorkingDays: 30,
      submittedAt: workingDaysAgo(20),
      governmentRefId: "MH-GATE-CTE-2214",
      assignedOfficerId: officer._id,
      pauseIntervals: [{ start: workingDaysAgo(15), end: workingDaysAgo(13) }],
      applicantWaitMs: 2 * DAY,
      lastSlaStatus: "AT_RISK",
    } as never);
    await appEvent(cteId, { eventType: "APPLICATION_CREATED", actorName: "Demo Applicant", to: "DRAFT", detail: "Created draft", at: workingDaysAgo(22) });
    await appEvent(cteId, { eventType: "APPLICATION_SUBMITTED", actorName: "Demo Applicant", from: "READY_FOR_SUBMISSION", to: "SUBMITTED", detail: "Reference MH-GATE-CTE-2214", at: workingDaysAgo(20) });
    await appEvent(cteId, { eventType: "REVIEW_STARTED", actorName: "Demo Officer", from: "SUBMITTED", to: "UNDER_REVIEW", detail: "Review started", at: workingDaysAgo(18) });
    await appEvent(cteId, { eventType: "QUERY_RAISED", actorName: "Demo Officer", to: "QUERY_RAISED", detail: "Clarify effluent treatment details", at: workingDaysAgo(15) });
    await appEvent(cteId, { eventType: "APPLICANT_RESPONSE", actorName: "Demo Applicant", from: "QUERY_RAISED", to: "RESUBMITTED", detail: "Provided ETP plan", at: workingDaysAgo(13) });
    await appEvent(cteId, { eventType: "INSPECTION_REQUIRED", actorName: "Demo Officer", to: "INSPECTION_REQUIRED", detail: "Site inspection required", at: workingDaysAgo(5) });
    // resolved query record
    const q1 = await ctx.db.insert("queries", {
      applicationId: cteId,
      title: "Effluent treatment details",
      reason: "Information incomplete in submitted documents",
      requestedInformation: "ETP design capacity and vendor details",
      responseDeadline: workingDaysAgo(11),
      internalNote: "Internal: verify ETP vendor against approved list.",
      message: "Please provide the design capacity and vendor details of your proposed effluent treatment plant.",
      status: "RESOLVED",
      raisedBy: officer._id,
      raisedAt: workingDaysAgo(15),
    } as never);
    await ctx.db.insert("queryResponses", {
      queryId: q1,
      applicationId: cteId,
      response: "Our ETP has a design capacity of 30 KLD and is supplied by AquaClean Systems Pvt. Ltd.",
      respondedBy: applicant._id,
      respondedAt: workingDaysAgo(13),
    } as never);
    // inspection (REQUIRED — scheduling is the current bottleneck)
    await ctx.db.insert("inspections", {
      applicationId: cteId,
      type: "Site / ETP inspection",
      purpose: "Verify effluent treatment infrastructure at plot",
      location: "Plot 21, MIDC Bhosari, Pune",
      status: "REQUIRED",
      internalNotes: "Internal: verify groundwater recharge plan; confirm plot boundary.",
      applicantNotes: "The department has marked a site inspection as required for this application.",
      requestedBy: officer._id,
      requestedAt: workingDaysAgo(5),
    } as never);
    await seedSla(cteId, 30, "AT_RISK", workingDaysAgo(1));
    await ctx.db.insert("governmentSubmissions", {
      applicationId: cteId,
      governmentRefId: "MH-GATE-CTE-2214",
      gatewayMode: "MOCK",
      status: "INSPECTION_REQUIRED",
      submittedAt: workingDaysAgo(20),
      lastSyncAt: workingDaysAgo(1),
      rawResponse: "MOCK_GATEWAY: inspection required",
      isSimulation: true,
    } as never);
    await doc({
      ruleId: "MH-FP-003", applicationId: cteId, documentType: "udyam",
      fileName: "udyam-certificate.pdf", businessName: "GreenHarvest Foods Pvt. Ltd.",
      documentNumber: "UDYAM-MH-08-0123456", issueDate: now - 200 * DAY,
      verified: true, confirmed: true,
    });
    await doc({
      ruleId: "MH-FP-003", applicationId: cteId, documentType: "factory_plan",
      fileName: "factory-layout.pdf", businessName: "GreenHarvest Foods Pvt. Ltd.",
      documentNumber: "LAYOUT-PMC-2026-1187", issueDate: workingDaysAgo(60),
      verified: false, confirmed: true,
    });
    await doc({
      ruleId: "MH-FP-003", applicationId: cteId, documentType: "site_plan",
      fileName: "site-plan.pdf", businessName: "GreenHarvest Foods Pvt. Ltd.",
      documentNumber: "SITE-MIDC-2210", issueDate: workingDaysAgo(90),
      verified: false, confirmed: true,
    });
    // one document requiring review (the demo "needs attention" item)
    await doc({
      ruleId: "MH-FP-003", applicationId: cteId, documentType: "water_consent_form",
      fileName: "water-consent.pdf", businessName: "GreenHarvest Foods Pvt. Ltd.",
      documentNumber: "WCF-PUNE-7712", issueDate: workingDaysAgo(10),
      verified: false, confirmed: false, requiresReview: true,
    });

    // ============================================ APP 3: Factory Licence (DRAFT)
    const factoryId = await ctx.db.insert("applications", {
      organizationId: orgId,
      businessProfileId: profileId,
      ruleId: "MH-FP-002",
      approvalTitle: "Factory Licence (Factories Act, 1948)",
      authority: "Directorate of Industrial Safety and Health (DISH), Maharashtra",
      department: "Industries & Commerce",
      status: "DRAFT",
      slaWorkingDays: 15,
      pauseIntervals: [],
      applicantWaitMs: 0,
    } as never);
    await appEvent(factoryId, { eventType: "APPLICATION_CREATED", actorName: "Demo Applicant", to: "DRAFT", detail: "Created draft", at: workingDaysAgo(3) });

    // ============================================ APP 4: CTO (DRAFT, blocked by CTE)
    const ctoId = await ctx.db.insert("applications", {
      organizationId: orgId,
      businessProfileId: profileId,
      ruleId: "MH-FP-004",
      approvalTitle: "Consent to Operate (CTO)",
      authority: "Maharashtra Pollution Control Board (MPCB)",
      department: "Maharashtra Pollution Control Board",
      status: "DRAFT",
      slaWorkingDays: 20,
      pauseIntervals: [],
      applicantWaitMs: 0,
    } as never);
    await appEvent(ctoId, { eventType: "APPLICATION_CREATED", actorName: "Demo Applicant", to: "DRAFT", detail: "Created draft — blocked by CTE prerequisite", at: workingDaysAgo(2) });

    // ============================================ APP 5: FSSAI (APPROVED, compliance)
    const fssaiId = await ctx.db.insert("applications", {
      organizationId: orgId,
      businessProfileId: profileId,
      ruleId: "MH-FP-005",
      approvalTitle: "FSSAI Food Business Licence",
      authority: "FSSAI",
      department: "FSSAI",
      status: "APPROVED",
      slaWorkingDays: 20,
      submittedAt: workingDaysAgo(60),
      governmentRefId: "MH-GATE-FSSAI-9034",
      pauseIntervals: [],
      applicantWaitMs: 0,
      decisionAt: workingDaysAgo(50),
      decisionBy: supervisor._id,
      lastSlaStatus: "ON_TRACK",
    } as never);
    await appEvent(fssaiId, { eventType: "APPLICATION_CREATED", actorName: "Demo Applicant", to: "DRAFT", detail: "Created draft", at: workingDaysAgo(62) });
    await appEvent(fssaiId, { eventType: "APPLICATION_SUBMITTED", actorName: "Demo Applicant", from: "READY_FOR_SUBMISSION", to: "SUBMITTED", detail: "Reference MH-GATE-FSSAI-9034", at: workingDaysAgo(60) });
    await appEvent(fssaiId, { eventType: "APPLICATION_APPROVED", actorName: "Demo Supervisor", from: "DECISION_PENDING", to: "APPROVED", detail: "Approved by department", at: workingDaysAgo(50) });
    await doc({
      ruleId: "MH-FP-005", applicationId: fssaiId, documentType: "fssai_form",
      fileName: "fssai-licence.pdf", businessName: "GreenHarvest Foods Pvt. Ltd.",
      documentNumber: "FSSAI-21524121000000", issueDate: now - 240 * DAY, expiryDate: futureWorking(1500),
      verified: true, confirmed: true,
    });
    await doc({
      ruleId: "MH-FP-005", applicationId: fssaiId, documentType: "water_test_report",
      fileName: "water-test-report.pdf", businessName: "GreenHarvest Foods Pvt. Ltd.",
      documentNumber: "WTR-PUNE-4501", issueDate: workingDaysAgo(30),
      verified: false, confirmed: true,
    });
    const fssaiRule = (await ctx.db
      .query("regulatoryRules")
      .filter((q) => q.eq(q.field("ruleId"), "MH-FP-005"))
      .first()) as Doc<"regulatoryRules">;
    if (fssaiRule) {
      await generateComplianceForApprovedApp(writer, fssaiId as never, fssaiRule, workingDaysAgo(50));
    }
    await ctx.db.insert("governmentSubmissions", {
      applicationId: fssaiId,
      governmentRefId: "MH-GATE-FSSAI-9034",
      gatewayMode: "MOCK",
      status: "APPROVED",
      submittedAt: workingDaysAgo(60),
      lastSyncAt: workingDaysAgo(50),
      rawResponse: "MOCK_GATEWAY: approved",
      isSimulation: true,
    } as never);

    // ======================================================== notifications
    await ctx.db.insert("notifications", {
      userId: applicant._id,
      title: "SLA at risk",
      message: "Consent to Establish is at risk of breaching its configured 30-working-day processing period.",
      type: "SLA",
      read: false,
      link: "/applicant/applications/" + cteId,
    } as never);
    await ctx.db.insert("notifications", {
      userId: applicant._id,
      title: "Inspection required",
      message: "The department has marked a site inspection as required for Consent to Establish.",
      type: "INSPECTION",
      read: false,
      link: "/applicant/applications/" + cteId,
    } as never);
    await ctx.db.insert("notifications", {
      userId: applicant._id,
      title: "Document requires review",
      message: "Water consent application: extracted fields need your confirmation.",
      type: "DOCUMENT",
      read: false,
      link: "/applicant/documents",
    } as never);
    await ctx.db.insert("notifications", {
      userId: officer._id,
      title: "SLA at risk",
      message: "Consent to Establish (MH-GATE-CTE-2214) is at risk of breaching its SLA.",
      type: "SLA",
      read: false,
      link: "/department/applications/" + cteId,
    } as never);

    // ============================================================= audit
    await recordAudit(writer, {
      actorId: applicant._id,
      actorName: "Demo Applicant",
      actorRole: "applicant",
      action: "LOGIN",
      entityType: "users",
      entityId: applicant._id,
      detail: "Demo login (password)",
    });
    await recordAudit(writer, {
      actorId: officer._id,
      actorName: "Demo Officer",
      actorRole: "dept_officer",
      action: "DEPARTMENT_ACCESS",
      entityType: "applications",
      entityId: cteId,
      detail: "Accessed application MH-GATE-CTE-2214 (department compartment: MP CB)",
    });
    await recordAudit(writer, {
      actorId: applicant._id,
      actorName: "Demo Applicant",
      actorRole: "applicant",
      action: "DEMO_SEEDED",
      entityType: "system",
      detail: "Demo environment initialised.",
    });

    // =============================================================== flag
    await ctx.db.insert("settings", { key: "demo_seeded", value: now } as never);

    await recordAudit(writer, {
      actorId: admin._id,
      actorName: "Demo Administrator",
      actorRole: "admin",
      action: "DEMO_SEEDED",
      entityType: "system",
      detail: "Verification pipeline: curated sources → candidate rules → human review → ACTIVE.",
      occurredAt: now,
    });

    return {
      alreadySeeded: false,
      accounts: {
        applicant: { email: "demo.applicant@approvalarc.in", password: "DemoPass@2026" },
        officer: { email: "demo.officer@mpcb.in", password: "DemoPass@2026" },
        supervisor: { email: "demo.supervisor@mpcb.in", password: "DemoPass@2026" },
        admin: { email: "demo.admin@approvalarc.in", password: "DemoPass@2026" },
      },
      organizationId: orgId,
      businessProfileId: profileId,
      applications: { udyamId, cteId, factoryId, ctoId, fssaiId },
    };
  },
});

function sha(seed: string): string {
  // Deterministic fake SHA-256 hex for demo records (no real file content).
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const pad = (n: number) => n.toString(16).padStart(16, "0");
  return `${pad(h)}${pad(h ^ 0x9e3779b9)}${pad(h ^ 0x85ebca6b)}${pad(h ^ 0xc2b2ae35)}`;
}