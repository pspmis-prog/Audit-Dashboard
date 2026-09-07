import { useState, useEffect } from "react";
import {
  apiGetAudits,
  apiSaveAudit,
  apiGetFindings,
  apiSaveFinding,
  apiGetActions,
  apiSaveAction,
  apiGetActionPlans,
  apiSaveActionPlan,
  apiUploadFile
} from "./api";

function App() {
  // Sidebar sections: "createAudit" | "schedule" | "followup" | "actions" | "actionPlan"
  const [activeSection, setActiveSection] = useState("schedule");

  // "all" | "today" | "upcoming" | "missed" | "custom"
  const [auditDateFilter, setAuditDateFilter] = useState("all");
  const [customFilterDate, setCustomFilterDate] = useState("");
  const [statsMonth, setStatsMonth] = useState(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${mm}`;
  });

  const [auditForm, setAuditForm] = useState({
    auditDateTime: "",
    startTime: "",
    endTime: "",
    auditorName: "",
    auditeeName: "",
    departmentName: ""
  });
  const [audits, setAudits] = useState([]);
  const [remarkDrafts, setRemarkDrafts] = useState({});

  // ---- reschedule state ----
  const [rescheduleAuditId, setRescheduleAuditId] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({ newDateTime: "", reason: "" });

  // ---- Followup form (new finding + followup, single cycle) ----
  const [findingForm, setFindingForm] = useState({
    auditId: "",
    findingId: "",
    finding: "",
    mode: "new" // "new" | "followup"
  });
  const [findingPhotoFiles, setFindingPhotoFiles] = useState([]);
  const [followUpPhotoFiles, setFollowUpPhotoFiles] = useState([]);
  const [findings, setFindings] = useState([]);
  const [findingFilter, setFindingFilter] = useState("all"); // all | pending | submitted

  const [actionForm, setActionForm] = useState({
    auditId: "",
    action: "",
    actualDate: ""
  });
  const [actionPhotoFile, setActionPhotoFile] = useState(null);
  const [actions, setActions] = useState([]);

  const [actionPlanForm, setActionPlanForm] = useState({
    auditId: "",
    findingId: "",
    actionPlan: "",
    actualDate: ""
  });
  const [actionPlanPhotoFile, setActionPlanPhotoFile] = useState(null);
  const [actionPlans, setActionPlans] = useState([]);

  const loadAuditsFromSheet = async () => {
    try {
      const data = await apiGetAudits();
      if (Array.isArray(data)) setAudits(data);
    } catch (err) {
      console.error("Error loading audits", err);
    }
  };

  const loadFindingsFromSheet = async () => {
    try {
      const data = await apiGetFindings();
      if (Array.isArray(data)) setFindings(data);
    } catch (err) {
      console.error("Error loading findings", err);
    }
  };

  const loadActionsFromSheet = async () => {
    try {
      const data = await apiGetActions();
      if (Array.isArray(data)) setActions(data);
    } catch (err) {
      console.error("Error loading actions", err);
    }
  };

  const loadActionPlansFromSheet = async () => {
    try {
      const data = await apiGetActionPlans();
      if (Array.isArray(data)) setActionPlans(data);
    } catch (err) {
      console.error("Error loading action plans", err);
    }
  };

  useEffect(() => {
    loadAuditsFromSheet();
    loadFindingsFromSheet();
    loadActionsFromSheet();
    loadActionPlansFromSheet();
  }, []);

  // Adds 15 days to whatever timestamp is passed in (time-of-day ignored).
  // Used to compute the follow-up due date from the moment the doer
  // actually submits the follow-up evidence — NOT from the audit date.
  const calculateFollowUpDate = (timestamp) => {
    if (!timestamp) return "";

    const date = new Date(timestamp);

    if (isNaN(date.getTime())) return "";

    // Ignore time
    date.setHours(0, 0, 0, 0);

    // Add 15 days
    date.setDate(date.getDate() + 15);

    return date.toISOString().split("T")[0];
  };

  const formatDateOnly = (value) => {
    if (!value) return "";
    const str = String(value).trim();
    if (str.includes(" ")) return str.split(" ")[0];
    if (str.includes("T")) return str.split("T")[0];
    return str;
  };

  const formatTimeOnly = (value) => {
    if (!value) return "";
    if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)) return value;

    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    }
    return String(value);
  };

  const normalizePhotoArray = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);

    if (!value) return [];

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];

      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (e) {
          return trimmed ? [trimmed] : [];
        }
      }

      return [trimmed];
    }

    return [];
  };

  // Evidence photos taken at the time the finding was raised.
  const getFindingPhotoUrls = (finding) => {
    if (!finding) return [];
    return normalizePhotoArray(finding.photoUrls?.length ? finding.photoUrls : finding.photoUrl);
  };

  // Follow-up evidence.
  const getFollowUpPhotoUrls = (finding) => {
    if (!finding) return [];
    return normalizePhotoArray(
      finding.followUpPhotoUrls?.length ? finding.followUpPhotoUrls : finding.followUpPhotoUrl
    );
  };

  // ---- schedule / closure status helpers ----

  const isUpcomingAudit = (auditDateTime) => {
    if (!auditDateTime) return false;
    const date = new Date(auditDateTime);
    if (isNaN(date.getTime())) return false;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return date.getTime() >= startOfToday.getTime();
  };

  const getFindingsForAudit = (auditId) =>
    findings.filter((f) => f.auditId === auditId);

  const hasFollowUp = (finding) => getFollowUpPhotoUrls(finding).length > 0;

  // A single finding is "Closed" only once BOTH the finding photo(s)
  // AND the follow-up photo(s) have been posted. Otherwise it's "Open".
  const getFindingClosureStatus = (finding) => {
    const hasFindingPhotos = getFindingPhotoUrls(finding).length > 0;
    return hasFindingPhotos && hasFollowUp(finding) ? "Closed" : "Open";
  };

  // Status shown in the Followup tab list.
  const getFollowUpState = (finding) => (hasFollowUp(finding) ? "Submitted" : "Pending");

  // Schedule status for a finding, once the follow-up has been saved:
  // - "Closed": finding is fully closed out (finding + follow-up photos both present)
  // - "Open": follow-up hasn't been submitted yet, so no followUpDate exists
  // - "Upcoming": follow-up date hasn't arrived yet
  // - "Overdue": follow-up date has passed and it's still not closed
  const getFindingScheduleStatus = (finding) => {
    if (getFindingClosureStatus(finding) === "Closed") return "Closed";

    if (!finding.followUpDate) return "Open";

    const dueDate = new Date(finding.followUpDate);
    if (isNaN(dueDate.getTime())) return "Open";
    dueDate.setHours(0, 0, 0, 0);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return dueDate.getTime() >= startOfToday.getTime() ? "Upcoming" : "Overdue";
  };

  // An audit is "Closed" once every finding under it is Closed.
  // If it has no findings yet, it's "Pending".
  const getAuditClosureStatus = (auditId) => {
    const relatedFindings = getFindingsForAudit(auditId);
    if (!relatedFindings.length) return "Pending";
    const allClosed = relatedFindings.every(
      (f) => getFindingClosureStatus(f) === "Closed"
    );
    return allClosed ? "Closed" : "Open";
  };

  // Gives the doer an actionable label for what needs to happen next
  // on a given audit, distinguishing "no finding logged yet" from
  // "finding logged but follow-up evidence still pending".
  const getAuditActionInfo = (auditId) => {
    const relatedFindings = getFindingsForAudit(auditId);

    if (!relatedFindings.length) {
      return {
        status: "Pending",
        label: "Finding Pending"
      };
    }

    const openFindings = relatedFindings.filter(
      (f) => getFindingClosureStatus(f) !== "Closed"
    );

    if (!openFindings.length) {
      return {
        status: "Closed",
        label: "Closed"
      };
    }

    return {
      status: "Open",
      label: `Follow-up Pending (${openFindings.length}/${relatedFindings.length})`
    };
  };

  const statusBadgeStyle = (status) => {
    const map = {
      Closed: { bg: "#d1e7dd", color: "#0f5132" },
      Open: { bg: "#fff3cd", color: "#664d03" },
      Pending: { bg: "#e2e3e5", color: "#41464b" },
      Submitted: { bg: "#d1e7dd", color: "#0f5132" },
      Upcoming: { bg: "#cfe2ff", color: "#084298" },
      Today: { bg: "#fff3cd", color: "#997404" },
      Missed: { bg: "#f8d7da", color: "#842029" },
      Overdue: { bg: "#f8d7da", color: "#842029" },
      Past: { bg: "#f8f9fa", color: "#6c757d" },
      Rescheduled: { bg: "#e0cffc", color: "#4b2e83" }
    };
    const c = map[status] || map.Pending;
    return {
      display: "inline-block",
      padding: "4px 12px",
      borderRadius: "999px",
      fontSize: "13.5px",
      fontWeight: "600",
      background: c.bg,
      color: c.color,
      whiteSpace: "nowrap"
    };
  };

  const isSameDay = (value, targetDate) => {
    if (!value || !targetDate) return false;
    const d = new Date(value);
    if (isNaN(d.getTime())) return false;
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const b = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate()
    );
    return a.getTime() === b.getTime();
  };

  const isTodayAudit = (auditDateTime) => isSameDay(auditDateTime, new Date());

  // Checks whether a date falls within the given "YYYY-MM" month string.
  // No month selected = show all months.
  const isInStatsMonth = (auditDateTime, monthStr) => {
    if (!monthStr) return true;
    if (!auditDateTime) return false;
    const d = new Date(auditDateTime);
    if (isNaN(d.getTime())) return false;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const auditMonth = `${d.getFullYear()}-${mm}`;
    return auditMonth === monthStr;
  };

  // Schedule status for the Audit List's "Schedule" column.
  // Once a finding has an open follow-up with a known due date, base
  // Missed/Upcoming on THAT due date rather than the audit's own
  // (already-past) scheduled date. Only fall back to the audit's own
  // date when there's no finding yet, or a finding exists but no
  // follow-up date has been set yet (follow-up not submitted).
  const getAuditScheduleStatus = (audit) => {
    const closureStatus = getAuditClosureStatus(audit.auditId);

    if (closureStatus === "Closed") {
      if (isTodayAudit(audit.auditDateTime)) return "Today";
      if (isUpcomingAudit(audit.auditDateTime)) return "Upcoming";
      return "Past";
    }

    const relatedFindings = getFindingsForAudit(audit.auditId);
    const openFindingsWithDueDate = relatedFindings.filter(
      (f) => getFindingClosureStatus(f) !== "Closed" && f.followUpDate
    );

    if (openFindingsWithDueDate.length) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const anyOverdue = openFindingsWithDueDate.some((f) => {
        const due = new Date(f.followUpDate);
        if (isNaN(due.getTime())) return false;
        due.setHours(0, 0, 0, 0);
        return due.getTime() < startOfToday.getTime();
      });

      return anyOverdue ? "Missed" : "Upcoming";
    }

    if (isTodayAudit(audit.auditDateTime)) return "Today";
    if (isUpcomingAudit(audit.auditDateTime)) return "Upcoming";
    return "Missed";
  };

  // Missed = scheduled date already passed AND not yet closed out
  const isMissedAudit = (audit) => getAuditScheduleStatus(audit) === "Missed";

  // Newest audits first
  const sortedAudits = [...audits].reverse();

  // Audits that fall within the currently selected stats month
  const statsMonthAudits = audits.filter((a) => isInStatsMonth(a.auditDateTime, statsMonth));

  const todaysAuditsCount = statsMonthAudits.filter((a) =>
    isTodayAudit(a.auditDateTime)
  ).length;

  const upcomingAuditsCount = statsMonthAudits.filter((a) =>
    isUpcomingAudit(a.auditDateTime)
  ).length;

  const completedAuditsCount = statsMonthAudits.filter(
    (a) => getAuditClosureStatus(a.auditId) === "Closed"
  ).length;

  const pendingAuditsCount = statsMonthAudits.filter(
    (a) => getAuditClosureStatus(a.auditId) !== "Closed"
  ).length;

  // Counts for the two flavours of pending, used in the summary strip
  const findingPendingCount = statsMonthAudits.filter(
    (a) => getAuditActionInfo(a.auditId).status === "Pending"
  ).length;

  const followUpPendingCount = statsMonthAudits.filter(
    (a) => getAuditActionInfo(a.auditId).status === "Open"
  ).length;

  const filteredAudits = sortedAudits.filter((audit) => {
    if (!isInStatsMonth(audit.auditDateTime, statsMonth)) return false;
    if (auditDateFilter === "today") return isTodayAudit(audit.auditDateTime);
    if (auditDateFilter === "upcoming") return isUpcomingAudit(audit.auditDateTime);
    if (auditDateFilter === "missed") return isMissedAudit(audit);
    if (auditDateFilter === "findingPending")
      return getAuditActionInfo(audit.auditId).status === "Pending";
    if (auditDateFilter === "followUpPending")
      return getAuditActionInfo(audit.auditId).status === "Open";
    if (auditDateFilter === "custom") {
      if (!customFilterDate) return true;
      const target = new Date(customFilterDate + "T00:00:00");
      return isSameDay(audit.auditDateTime, target);
    }
    return true; // "all"
  });

  const filterChipStyle = (active, activeColor = "#0d6efd") => ({
    padding: "10px 18px",
    borderRadius: "999px",
    border: active ? `1px solid ${activeColor}` : "1px solid #ced4da",
    background: active ? activeColor : "#fff",
    color: active ? "#fff" : "#495057",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600"
  });

  // ---- end helpers ----

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const base64 = String(result).split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const uploadSelectedFile = async (file, folderName = "Audit_Photos") => {
    if (!file) return "";

    const base64Data = await fileToBase64(file);

    const res = await apiUploadFile({
      fileName: file.name,
      mimeType: file.type,
      base64Data,
      folderName
    });

    if (!res || res.success !== true) {
      throw new Error(res?.error || "File upload failed");
    }

    return res.photoUrl || res.openUrl || "";
  };

  const uploadMultipleFiles = async (files, folderName = "Audit_Photos") => {
    const fileList = Array.isArray(files) ? files : [];
    const uploadedUrls = [];

    for (const file of fileList) {
      const url = await uploadSelectedFile(file, folderName);
      if (url) uploadedUrls.push(url);
    }

    return uploadedUrls;
  };

  const resetFindingForm = () => {
    setFindingForm({
      auditId: "",
      findingId: "",
      finding: "",
      mode: "new"
    });
    setFindingPhotoFiles([]);
    setFollowUpPhotoFiles([]);
  };

  const resetActionForm = () => {
    setActionForm({
      auditId: "",
      action: "",
      actualDate: ""
    });
    setActionPhotoFile(null);
  };

  const resetActionPlanForm = () => {
    setActionPlanForm({
      auditId: "",
      findingId: "",
      actionPlan: "",
      actualDate: ""
    });
    setActionPlanPhotoFile(null);
  };

  const handleFindingPhotoChange = (e) => {
    const files = Array.from(e.target.files || []);
    setFindingPhotoFiles(files);
  };

  const handleFollowUpPhotoChange = (e) => {
    const files = Array.from(e.target.files || []);
    setFollowUpPhotoFiles(files);
  };

  const filteredFindingsForSelectedAuditInFinding = findings.filter(
    (f) => f.auditId === findingForm.auditId
  );

  const selectedFindingInFindingTab = findings.find(
    (f) => f.findingId === findingForm.findingId
  );

  const filteredFindingsForSelectedAudit = findings.filter(
    (f) => f.auditId === actionPlanForm.auditId
  );

  const selectedFindingInActionPlan = findings.find(
    (f) => f.findingId === actionPlanForm.findingId
  );

  const handleAuditInputChange = (e) => {
    const { name, value } = e.target;
    setAuditForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveAudit = async () => {
    if (
      !auditForm.auditDateTime ||
      !auditForm.startTime ||
      !auditForm.endTime ||
      !auditForm.auditorName ||
      !auditForm.auditeeName ||
      !auditForm.departmentName
    ) {
      alert("Please fill all fields");
      return;
    }

    try {
      const res = await apiSaveAudit({
        auditDateTime: auditForm.auditDateTime,
        startTime: auditForm.startTime,
        endTime: auditForm.endTime,
        auditorName: auditForm.auditorName,
        auditeeName: auditForm.auditeeName,
        departmentName: auditForm.departmentName
      });

      if (!res || res.success !== true) {
        alert("Audit save may have failed.\n" + (res?.error || ""));
        return;
      }

      alert("Audit Created: " + res.auditId);

      setAuditForm({
        auditDateTime: "",
        startTime: "",
        endTime: "",
        auditorName: "",
        auditeeName: "",
        departmentName: ""
      });

      await loadAuditsFromSheet();
    } catch (err) {
      console.error(err);
      alert("Error saving audit: " + err.message);
    }
  };

  const handleObserverChange = async (auditId, observer) => {
    try {
      const audit = audits.find((a) => a.auditId === auditId);
      if (!audit) {
        alert("Audit not found");
        return;
      }

      const res = await apiSaveAudit({
        auditId: audit.auditId,
        auditDateTime: audit.auditDateTime,
        startTime: audit.startTime,
        endTime: audit.endTime,
        auditorName: audit.auditorName,
        auditeeName: audit.auditeeName,
        departmentName: audit.departmentName,
        observer,
        remark: audit.remark || ""
      });

      if (!res || res.success !== true) {
        alert("Failed to update observer: " + (res?.error || "Unknown error"));
        return;
      }

      await loadAuditsFromSheet();
    } catch (err) {
      console.error(err);
      alert("Error updating observer: " + err.message);
    }
  };

  const handleRemarkChange = async (auditId, remark) => {
    try {
      const audit = audits.find((a) => a.auditId === auditId);
      if (!audit) {
        alert("Audit not found");
        return;
      }

      // No-op if the remark hasn't actually changed from what's saved
      if ((audit.remark || "") === remark) {
        setRemarkDrafts((prev) => {
          const updated = { ...prev };
          delete updated[auditId];
          return updated;
        });
        return;
      }

      const res = await apiSaveAudit({
        auditId: audit.auditId,
        auditDateTime: audit.auditDateTime,
        startTime: audit.startTime,
        endTime: audit.endTime,
        auditorName: audit.auditorName,
        auditeeName: audit.auditeeName,
        departmentName: audit.departmentName,
        observer: audit.observer || "",
        remark
      });

      if (!res || res.success !== true) {
        alert("Failed to update remark: " + (res?.error || "Unknown error"));
        return;
      }

      setRemarkDrafts((prev) => {
        const updated = { ...prev };
        delete updated[auditId];
        return updated;
      });

      await loadAuditsFromSheet();
    } catch (err) {
      console.error(err);
      alert("Error updating remark: " + err.message);
    }
  };

  // ---- Reschedule flow ----
  const openRescheduleForm = (auditId) => {
    setRescheduleAuditId(auditId);
    setRescheduleForm({ newDateTime: "", reason: "" });
  };

  const closeRescheduleForm = () => {
    setRescheduleAuditId(null);
    setRescheduleForm({ newDateTime: "", reason: "" });
  };

  const handleRescheduleFormChange = (e) => {
    const { name, value } = e.target;
    setRescheduleForm((prev) => ({ ...prev, [name]: value }));
  };

  // NOTE ON BACKEND: this writes `previousAuditDateTime`, `rescheduleReason`
  // and `rescheduleCount` onto the audit row so a history is kept. The
  // Audit_Master sheet + apiSaveAudit handler need matching columns:
  // "Previous Audit Date Time", "Reschedule Reason", "Reschedule Count".
  const handleSaveReschedule = async () => {
    if (!rescheduleForm.newDateTime) {
      alert("Pick the new audit date & time");
      return;
    }
    if (!rescheduleForm.reason.trim()) {
      alert("Enter a reason for rescheduling");
      return;
    }

    const audit = audits.find((a) => a.auditId === rescheduleAuditId);
    if (!audit) {
      alert("Audit not found");
      return;
    }

    try {
      const res = await apiSaveAudit({
        auditId: audit.auditId,
        auditDateTime: rescheduleForm.newDateTime,
        startTime: audit.startTime,
        endTime: audit.endTime,
        auditorName: audit.auditorName,
        auditeeName: audit.auditeeName,
        departmentName: audit.departmentName,
        observer: audit.observer || "",
        remark: audit.remark || "",
        previousAuditDateTime: audit.auditDateTime,
        rescheduleReason: rescheduleForm.reason.trim(),
        rescheduleCount: (audit.rescheduleCount || 0) + 1
      });

      if (!res || res.success !== true) {
        alert("Failed to reschedule audit: " + (res?.error || "Unknown error"));
        return;
      }

      alert("Audit rescheduled to " + formatDateOnly(rescheduleForm.newDateTime));
      closeRescheduleForm();
      await loadAuditsFromSheet();
    } catch (err) {
      console.error(err);
      alert("Error rescheduling audit: " + err.message);
    }
  };

  const handleFindingInputChange = (e) => {
    const { name, value } = e.target;

    setFindingForm((prev) => {
      const updated = {
        ...prev,
        [name]: value
      };

      if (name === "mode") {
        updated.auditId = "";
        updated.findingId = "";
        updated.finding = "";
        setFindingPhotoFiles([]);
        setFollowUpPhotoFiles([]);
      }

      if (name === "auditId") {
        updated.findingId = "";
      }

      return updated;
    });
  };

  const handleSaveFinding = async () => {
    if (!findingForm.auditId) {
      alert("Select Audit ID");
      return;
    }

    const audit = audits.find((a) => a.auditId === findingForm.auditId);
    if (!audit) {
      alert("Audit not found for this ID");
      return;
    }

    try {
      if (findingForm.mode === "new") {
        if (!findingForm.finding) {
          alert("Enter finding");
          return;
        }

        if (!findingPhotoFiles.length) {
          alert("Select at least one Evidence Photo");
          return;
        }

        const uploadedPhotoUrls = await uploadMultipleFiles(
          findingPhotoFiles,
          "Audit_Photos"
        );

        // No follow-up has happened yet on a brand-new finding, so the
        // follow-up due date isn't known until the doer actually submits
        // the follow-up evidence (see the "followup" branch below).
        const res = await apiSaveFinding({
          auditId: findingForm.auditId,
          auditDate: formatDateOnly(audit.auditDateTime),
          finding: findingForm.finding,
          photoUrls: uploadedPhotoUrls,
          followUpPhotoUrls: [],
          followUpDate: ""
        });

        if (!res || res.success !== true) {
          alert("Finding save failed: " + (res?.error || "Unknown error"));
          return;
        }

        alert("Finding Saved: " + res.findingId);
      } else {
        // mode === "followup"
        if (!findingForm.findingId) {
          alert("Select Finding ID");
          return;
        }

        if (!selectedFindingInFindingTab) {
          alert("Selected finding not found");
          return;
        }

        if (!followUpPhotoFiles.length) {
          alert("Select at least one Follow-up Evidence Photo");
          return;
        }

        const existingPhotoUrls = getFindingPhotoUrls(selectedFindingInFindingTab);
        const uploadedFollowUpPhotoUrls = await uploadMultipleFiles(
          followUpPhotoFiles,
          "Audit_Photos"
        );

        // The moment the doer actually submits the follow-up — kept as its
        // own field so the list can show exactly when this step happened.
        const followUpSubmittedAt = new Date();

        // Follow-up due date = 15 days from that same submission.
        const followUpDate = calculateFollowUpDate(followUpSubmittedAt);

        const res = await apiSaveFinding({
          findingId: findingForm.findingId,
          auditId: findingForm.auditId,
          auditDate: formatDateOnly(audit.auditDateTime),
          finding: selectedFindingInFindingTab.finding || "",
          photoUrls: existingPhotoUrls,
          followUpPhotoUrls: uploadedFollowUpPhotoUrls,
          followUpSubmittedDate: followUpSubmittedAt.toISOString(),
          followUpDate,
          mode: "followup"
        });

        if (!res || res.success !== true) {
          alert("Finding follow-up save failed: " + (res?.error || "Unknown error"));
          return;
        }

        alert("Finding Follow-up Updated: " + findingForm.findingId);
      }

      resetFindingForm();
      await loadFindingsFromSheet();
    } catch (err) {
      console.error(err);
      alert("Error saving finding: " + err.message);
    }
  };

  const handleActionInputChange = (e) => {
    const { name, value } = e.target;
    setActionForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleActionPhotoChange = (e) => {
    const file = e.target.files && e.target.files[0];
    setActionPhotoFile(file || null);
  };

  const handleSaveAction = async () => {
    if (!actionForm.auditId) {
      alert("Select Audit ID");
      return;
    }

    if (!actionForm.action) {
      alert("Enter action");
      return;
    }

    if (!actionPhotoFile) {
      alert("Select photo");
      return;
    }

    try {
      const uploadedPhotoUrl = await uploadSelectedFile(
        actionPhotoFile,
        "Audit_Photos"
      );

      const res = await apiSaveAction({
        auditId: actionForm.auditId,
        action: actionForm.action,
        photoUrl: uploadedPhotoUrl,
        actualDate: actionForm.actualDate || ""
      });

      if (!res || res.success !== true) {
        alert("Action save failed: " + (res?.error || "Unknown error"));
        return;
      }

      alert(
        "Action Saved: " +
          res.actionId +
          "\nPlanned Date: " +
          (res.plannedDate || "Not found")
      );

      resetActionForm();
      await loadActionsFromSheet();
    } catch (err) {
      console.error(err);
      alert("Error saving action: " + err.message);
    }
  };

  const handleActionPlanInputChange = (e) => {
    const { name, value } = e.target;

    setActionPlanForm((prev) => {
      const updated = {
        ...prev,
        [name]: value
      };

      if (name === "auditId") {
        updated.findingId = "";
      }

      return updated;
    });
  };

  const handleActionPlanPhotoChange = (e) => {
    const file = e.target.files && e.target.files[0];
    setActionPlanPhotoFile(file || null);
  };

  const handleSaveActionPlan = async () => {
    if (!actionPlanForm.auditId) {
      alert("Select Audit ID");
      return;
    }

    if (!actionPlanForm.findingId) {
      alert("Select Finding ID");
      return;
    }

    if (!actionPlanForm.actionPlan) {
      alert("Enter Action Plan");
      return;
    }

    if (!actionPlanPhotoFile) {
      alert("Select photo");
      return;
    }

    if (!selectedFindingInActionPlan) {
      alert("Selected finding not found");
      return;
    }

    try {
      const uploadedPhotoUrl = await uploadSelectedFile(
        actionPlanPhotoFile,
        "Audit_Photos"
      );

      const res = await apiSaveActionPlan({
        auditId: actionPlanForm.auditId,
        findingId: actionPlanForm.findingId,
        actionPlan: actionPlanForm.actionPlan,
        photoUrl: uploadedPhotoUrl,
        findingPhotoUrls: getFindingPhotoUrls(selectedFindingInActionPlan),
        followUpPhotoUrls: getFollowUpPhotoUrls(selectedFindingInActionPlan),
        actualDate: actionPlanForm.actualDate || ""
      });

      if (!res || res.success !== true) {
        alert("Action Plan save failed: " + (res?.error || "Unknown error"));
        return;
      }

      alert("Action Plan Saved: " + res.actionPlanId);

      resetActionPlanForm();
      await loadActionPlansFromSheet();
    } catch (err) {
      console.error(err);
      alert("Error saving action plan: " + err.message);
    }
  };

  const renderPhotoLinks = (photos, labelPrefix) => {
    const urls = normalizePhotoArray(photos);

    if (!urls.length) {
      return <span style={{ color: "#6c757d" }}>No photos</span>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {urls.map((url, index) => (
          <a key={`${labelPrefix}-${index}`} href={url} target="_blank" rel="noreferrer">
            {labelPrefix} {index + 1}
          </a>
        ))}
      </div>
    );
  };

  // Findings for the Followup tab list, filtered by pending/submitted.
  const followUpListFindings = findings.filter((f) => {
    if (findingFilter === "pending") return !hasFollowUp(f);
    if (findingFilter === "submitted") return hasFollowUp(f);
    return true;
  });

  const sidebarItems = [
    { id: "createAudit", label: "Schedule Audit" },
    { id: "schedule", label: "All Schedule" },
    { id: "followup", label: "Followup" },
    { id: "actions", label: "CAPA" },
    { id: "actionPlan", label: "Action Plan" }
  ];

  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh", display: "flex" }}>
      {/* ---- Left Sidebar ---- */}
      <div
        style={{
          width: "230px",
          flexShrink: 0,
          background: "#fff",
          borderRight: "1px solid #dee2e6",
          minHeight: "100vh",
          padding: "20px 0",
          boxSizing: "border-box"
        }}
      >
        <h3
          style={{
            fontSize: "18px",
            fontWeight: "700",
            color: "#000",
            padding: "0 20px",
            marginBottom: "18px"
          }}
        >
          Audit Manager
        </h3>
        {sidebarItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "13px 20px",
              border: "none",
              borderLeft:
                activeSection === item.id ? "4px solid #0d6efd" : "4px solid transparent",
              background: activeSection === item.id ? "#eef5ff" : "transparent",
              color: activeSection === item.id ? "#0d6efd" : "#212529",
              fontWeight: activeSection === item.id ? "700" : "500",
              fontSize: "15.5px",
              cursor: "pointer"
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ---- Main Content ---- */}
      <div style={{ flex: 1, padding: "clamp(10px,2vw,22px)", boxSizing: "border-box", minWidth: 0 }}>
        <h2 style={{ fontWeight: "700", marginBottom: "20px", fontSize: "28px", color: "#000" }}>
          Audit Management System
        </h2>

        {activeSection === "createAudit" && (
          <div>
            <div
              style={{
                background: "#fff",
                borderRadius: "15px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                padding: "20px",
                marginBottom: "20px"
              }}
            >
              <h3 style={{ marginBottom: "15px", fontSize: "22px", color: "#000" }}>Audit Planning</h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))",
                  gap: "20px",
                  marginBottom: "15px"
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "16px", color: "#000" }}>Audit Date Time</label>
                  <input
                    type="datetime-local"
                    name="auditDateTime"
                    value={auditForm.auditDateTime}
                    onChange={handleAuditInputChange}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "16px", color: "#000" }}>Start Time</label>
                  <input
                    type="time"
                    name="startTime"
                    value={auditForm.startTime}
                    onChange={handleAuditInputChange}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "16px", color: "#000" }}>End Time</label>
                  <input
                    type="time"
                    name="endTime"
                    value={auditForm.endTime}
                    onChange={handleAuditInputChange}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "16px", color: "#000" }}>Auditor Name</label>
                  <input
                    type="text"
                    name="auditorName"
                    value={auditForm.auditorName}
                    onChange={handleAuditInputChange}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "16px", color: "#000" }}>Auditee Name</label>
                  <input
                    type="text"
                    name="auditeeName"
                    value={auditForm.auditeeName}
                    onChange={handleAuditInputChange}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "16px", color: "#000" }}>Department Name</label>
                  <select
                    name="departmentName"
                    value={auditForm.departmentName}
                    onChange={handleAuditInputChange}
                    style={inputStyle}
                  >
                    <option value="">Select</option>
                    <option value="Production">Production</option>
                    <option value="Quality">Quality</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="HR">HR</option>
                    <option value="Blasting">Blasting</option>
                    <option value="Masking">Masking</option>
                    <option value="Admin">Admin</option>
                    <option value="Spraying">Spraying</option>
                    <option value="Packing">Packing</option>
                    <option value="Purchase">Purchase</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleSaveAudit}
                style={{
                  backgroundColor: "#0d6efd",
                  color: "#fff",
                  border: "none",
                  padding: "12px 22px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "15px"
                }}
              >
                Save Audit
              </button>
            </div>
          </div>
        )}

        {activeSection === "schedule" && (
          <div>
            {/* Month-scoped summary strip - click a tile to apply that filter below */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px"
              }}
            >
              <label style={{ fontSize: "15px", color: "#000", fontWeight: "600" }}>
                Stats for Month:
              </label>
              <input
                type="month"
                value={statsMonth}
                onChange={(e) => setStatsMonth(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ced4da",
                  fontSize: "15px",
                  color: "#000"
                }}
              />
              {statsMonth && (
                <button
                  onClick={() => setStatsMonth("")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #ced4da",
                    background: "#fff",
                    color: "#6c757d",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  All Months
                </button>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: "15px",
                marginBottom: "20px"
              }}
            >
              <div
                onClick={() => setAuditDateFilter("today")}
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                  padding: "16px 20px",
                  cursor: "pointer",
                  border:
                    auditDateFilter === "today"
                      ? "2px solid #0d6efd"
                      : "2px solid transparent"
                }}
              >
                <div style={{ fontSize: "15px", color: "#495057" }}>Today's Audits</div>
                <div style={{ fontSize: "28px", fontWeight: "700", color: "#0d6efd" }}>
                  {todaysAuditsCount}
                </div>
              </div>

              <div
                onClick={() => setAuditDateFilter("upcoming")}
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                  padding: "16px 20px",
                  cursor: "pointer",
                  border:
                    auditDateFilter === "upcoming"
                      ? "2px solid #084298"
                      : "2px solid transparent"
                }}
              >
                <div style={{ fontSize: "15px", color: "#495057" }}>Upcoming Audits</div>
                <div style={{ fontSize: "28px", fontWeight: "700", color: "#084298" }}>
                  {upcomingAuditsCount}
                </div>
              </div>

              <div
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                  padding: "16px 20px"
                }}
              >
                <div style={{ fontSize: "15px", color: "#495057" }}>Completed Audits</div>
                <div style={{ fontSize: "28px", fontWeight: "700", color: "#0f5132" }}>
                  {completedAuditsCount}
                </div>
              </div>

              <div
                onClick={() => setAuditDateFilter("findingPending")}
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                  padding: "16px 20px",
                  cursor: "pointer",
                  border:
                    auditDateFilter === "findingPending"
                      ? "2px solid #41464b"
                      : "2px solid transparent"
                }}
              >
                <div style={{ fontSize: "15px", color: "#495057" }}>Finding Pending</div>
                <div style={{ fontSize: "28px", fontWeight: "700", color: "#41464b" }}>
                  {findingPendingCount}
                </div>
              </div>

              <div
                onClick={() => setAuditDateFilter("followUpPending")}
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                  padding: "16px 20px",
                  cursor: "pointer",
                  border:
                    auditDateFilter === "followUpPending"
                      ? "2px solid #664d03"
                      : "2px solid transparent"
                }}
              >
                <div style={{ fontSize: "15px", color: "#495057" }}>Follow-up Pending</div>
                <div style={{ fontSize: "28px", fontWeight: "700", color: "#664d03" }}>
                  {followUpPendingCount}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                borderRadius: "15px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                padding: "20px"
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "15px"
                }}
              >
                <h4 style={{ margin: 0, marginRight: "10px", fontSize: "19px", color: "#000" }}>Audit List</h4>

                <button
                  style={filterChipStyle(auditDateFilter === "all")}
                  onClick={() => setAuditDateFilter("all")}
                >
                  All
                </button>
                <button
                  style={filterChipStyle(auditDateFilter === "today")}
                  onClick={() => setAuditDateFilter("today")}
                >
                  Today
                </button>
                <button
                  style={filterChipStyle(auditDateFilter === "upcoming", "#084298")}
                  onClick={() => setAuditDateFilter("upcoming")}
                >
                  Upcoming
                </button>
                <button
                  style={filterChipStyle(auditDateFilter === "missed", "#b02a37")}
                  onClick={() => setAuditDateFilter("missed")}
                >
                  Missed
                </button>
                <button
                  style={filterChipStyle(auditDateFilter === "findingPending", "#41464b")}
                  onClick={() => setAuditDateFilter("findingPending")}
                >
                  Finding Pending
                </button>
                <button
                  style={filterChipStyle(auditDateFilter === "followUpPending", "#997404")}
                  onClick={() => setAuditDateFilter("followUpPending")}
                >
                  Follow-up Pending
                </button>

                <input
                  type="date"
                  value={customFilterDate}
                  onChange={(e) => {
                    setCustomFilterDate(e.target.value);
                    setAuditDateFilter("custom");
                  }}
                  style={{
                    padding: "9px 14px",
                    borderRadius: "999px",
                    border:
                      auditDateFilter === "custom"
                        ? "1px solid #0d6efd"
                        : "1px solid #ced4da",
                    fontSize: "14px"
                  }}
                />

                {auditDateFilter !== "all" && (
                  <button
                    onClick={() => {
                      setAuditDateFilter("all");
                      setCustomFilterDate("");
                    }}
                    style={{
                      padding: "9px 16px",
                      borderRadius: "999px",
                      border: "1px solid #ced4da",
                      background: "#fff",
                      color: "#6c757d",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    Clear filter
                  </button>
                )}
              </div>

              {/* Inline reschedule panel */}
              {rescheduleAuditId && (
                <div
                  style={{
                    background: "#fff8e1",
                    border: "1px solid #ffe08a",
                    borderRadius: "10px",
                    padding: "16px",
                    marginBottom: "15px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))",
                    gap: "14px",
                    alignItems: "end"
                  }}
                >
                  <div style={{ gridColumn: "1 / -1", fontWeight: "700", color: "#664d03" }}>
                    Reschedule {rescheduleAuditId}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "15px", color: "#000" }}>New Audit Date Time</label>
                    <input
                      type="datetime-local"
                      name="newDateTime"
                      value={rescheduleForm.newDateTime}
                      onChange={handleRescheduleFormChange}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: "span 2" }}>
                    <label style={{ fontSize: "15px", color: "#000" }}>Reason for Reschedule</label>
                    <input
                      type="text"
                      name="reason"
                      placeholder="e.g. Auditee on leave"
                      value={rescheduleForm.reason}
                      onChange={handleRescheduleFormChange}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={handleSaveReschedule}
                      style={{
                        backgroundColor: "#0d6efd",
                        color: "#fff",
                        border: "none",
                        padding: "12px 18px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "15px"
                      }}
                    >
                      Confirm Reschedule
                    </button>
                    <button
                      onClick={closeRescheduleForm}
                      style={{
                        backgroundColor: "#fff",
                        color: "#495057",
                        border: "1px solid #ced4da",
                        padding: "12px 18px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "15px"
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div>
                <table style={{ width: "100%", tableLayout: "auto", borderCollapse: "collapse" }}>
                  <colgroup>
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "10%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: "#212529", color: "#fff" }}>
                      <th style={tableCellEllipsisStyle}>Audit ID</th>
                      <th style={tableCellEllipsisStyle}>Audit Date</th>
                      <th style={tableCellEllipsisStyle}>Time</th>
                      <th style={tableCellEllipsisStyle}>Auditor</th>
                      <th style={tableCellEllipsisStyle}>Auditee</th>
                      <th style={tableCellEllipsisStyle}>Department</th>
                      <th style={tableCellEllipsisStyle}>Observer</th>
                      <th style={tableCellEllipsisStyle}>Remark</th>
                      <th style={tableCellEllipsisStyle}>Schedule</th>
                      <th style={tableCellEllipsisStyle}>Action Needed</th>
                      <th style={tableCellEllipsisStyle}>Reschedule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudits.length === 0 ? (
                      <tr>
                        <td
                          colSpan="11"
                          style={{
                            ...tableCellStyle,
                            textAlign: "center",
                            color: "#6c757d"
                          }}
                        >
                          {audits.length === 0
                            ? "No audits found"
                            : "No audits match this filter"}
                        </td>
                      </tr>
                    ) : (
                      filteredAudits.map((audit) => {
                        const scheduleLabel = getAuditScheduleStatus(audit);
                        const missed = scheduleLabel === "Missed";
                        const today = scheduleLabel === "Today";
                        const upcoming = scheduleLabel === "Upcoming";
                        const actionInfo = getAuditActionInfo(audit.auditId);
                        return (
                          <tr
                            key={audit.auditId}
                            style={{
                              background: missed
                                ? "#fdeeee"
                                : today
                                ? "#fff8e1"
                                : upcoming
                                ? "#eef5ff"
                                : "transparent"
                            }}
                          >
                            <td style={tableCellEllipsisStyle} title={audit.auditId}>
                              {audit.auditId}
                            </td>
                            <td style={tableCellEllipsisStyle}>
                              {formatDateOnly(audit.auditDateTime)}
                              {audit.rescheduleCount > 0 && (
                                <div style={{ marginTop: "4px" }}>
                                  <span style={statusBadgeStyle("Rescheduled")}>
                                    Rescheduled ({audit.rescheduleCount}x)
                                  </span>
                                </div>
                              )}
                            </td>
                            <td style={tableCellEllipsisStyle}>
                              {formatTimeOnly(audit.startTime)}-{formatTimeOnly(audit.endTime)}
                            </td>
                            <td style={tableCellEllipsisStyle} title={audit.auditorName}>
                              {audit.auditorName}
                            </td>
                            <td style={tableCellEllipsisStyle} title={audit.auditeeName}>
                              {audit.auditeeName}
                            </td>
                            <td style={tableCellEllipsisStyle} title={audit.departmentName}>
                              {audit.departmentName}
                            </td>
                            <td style={{ ...tableCellStyle, overflow: "visible" }}>
                              <select
                                value={audit.observer || ""}
                                onChange={(e) =>
                                  handleObserverChange(audit.auditId, e.target.value)
                                }
                                style={{
                                  width: "100%",
                                  padding: "6px",
                                  borderRadius: "6px",
                                  border: "1px solid #ced4da",
                                  background: "#fff",
                                  fontSize: "16px",
                                  color: "#000"
                                }}
                              >
                                <option value="">Select</option>
                                <option value="DDD">DDD</option>
                                <option value="HDD">HDD</option>
                                <option value="PSW">PSW</option>
                                <option value="AW">AW</option>
                                <option value="Other">Other</option>
                              </select>
                            </td>
                            <td style={{ ...tableCellStyle, overflow: "visible" }}>
                              <input
                                type="text"
                                placeholder="Add remark"
                                title={
                                  remarkDrafts[audit.auditId] !== undefined
                                    ? remarkDrafts[audit.auditId]
                                    : audit.remark || ""
                                }
                                value={
                                  remarkDrafts[audit.auditId] !== undefined
                                    ? remarkDrafts[audit.auditId]
                                    : audit.remark || ""
                                }
                                onChange={(e) =>
                                  setRemarkDrafts((prev) => ({
                                    ...prev,
                                    [audit.auditId]: e.target.value
                                  }))
                                }
                                onBlur={(e) =>
                                  handleRemarkChange(audit.auditId, e.target.value)
                                }
                                style={{
                                  width: "100%",
                                  padding: "6px",
                                  borderRadius: "6px",
                                  border: "1px solid #ced4da",
                                  background: "#fff",
                                  fontSize: "16px",
                                  color: "#000"
                                }}
                              />
                            </td>
                            <td style={tableCellStyle}>
                              <span style={statusBadgeStyle(scheduleLabel)}>
                                {scheduleLabel}
                              </span>
                            </td>
                            <td style={tableCellStyle}>
                              <span style={statusBadgeStyle(actionInfo.status)}>
                                {actionInfo.label}
                              </span>
                            </td>
                            <td style={tableCellStyle}>
                              {missed ? (
                                <button
                                  onClick={() => openRescheduleForm(audit.auditId)}
                                  style={{
                                    backgroundColor: "#dc3545",
                                    color: "#fff",
                                    border: "none",
                                    padding: "7px 12px",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "13.5px",
                                    fontWeight: "600"
                                  }}
                                >
                                  Reschedule
                                </button>
                              ) : (
                                <span style={{ color: "#adb5bd" }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSection === "followup" && (
          <div>
            <div
              style={{
                background: "#fff",
                borderRadius: "15px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                padding: "20px",
                marginBottom: "20px"
              }}
            >
              <h3 style={{ marginBottom: "15px", fontSize: "22px", color: "#000" }}>
                New Finding &amp; Followup
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "15px",
                  marginBottom: "15px"
                }}
              >
                <div>
                  <label style={{ fontSize: "16px", color: "#000" }}>Mode</label>
                  <select
                    name="mode"
                    value={findingForm.mode}
                    onChange={handleFindingInputChange}
                    style={{ ...inputStyle, marginTop: "5px" }}
                  >
                    <option value="new">New Finding</option>
                    <option value="followup">Follow-up</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "16px", color: "#000" }}>Audit ID</label>
                  <select
                    name="auditId"
                    value={findingForm.auditId}
                    onChange={handleFindingInputChange}
                    style={{ ...inputStyle, marginTop: "5px" }}
                  >
                    <option value="">Select Audit</option>
                    {audits.map((audit) => (
                      <option key={audit.auditId} value={audit.auditId}>
                        {audit.auditId}
                      </option>
                    ))}
                  </select>
                </div>

                {findingForm.mode === "followup" && (
                  <div>
                    <label style={{ fontSize: "16px", color: "#000" }}>Finding ID</label>
                    <select
                      name="findingId"
                      value={findingForm.findingId}
                      onChange={handleFindingInputChange}
                      style={{ ...inputStyle, marginTop: "5px" }}
                    >
                      <option value="">Select Finding ID</option>
                      {filteredFindingsForSelectedAuditInFinding
                        .filter((f) => !hasFollowUp(f))
                        .map((f) => (
                          <option key={f.findingId} value={f.findingId}>
                            {f.findingId}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {findingForm.mode === "new" && (
                  <>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontSize: "16px", color: "#000" }}>Finding</label>
                      <textarea
                        name="finding"
                        rows={3}
                        value={findingForm.finding}
                        onChange={handleFindingInputChange}
                        style={textareaStyle}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "16px", color: "#000" }}>Evidence Photos</label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFindingPhotoChange}
                        style={{ ...inputStyle, marginTop: "5px" }}
                      />
                      {!!findingPhotoFiles.length && (
                        <div style={{ marginTop: "8px", color: "#6c757d", fontSize: "14px" }}>
                          {findingPhotoFiles.length} file(s) selected
                        </div>
                      )}
                    </div>
                  </>
                )}

                {findingForm.mode === "followup" && selectedFindingInFindingTab && (
                  <>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontSize: "16px", color: "#000" }}>Existing Finding</label>
                      <textarea
                        value={selectedFindingInFindingTab.finding || ""}
                        readOnly
                        rows={3}
                        style={{ ...textareaStyle, background: "#f8f9fa" }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "16px", color: "#000" }}>Finding Evidence Photos</label>
                      <div style={{ marginTop: "8px" }}>
                        {renderPhotoLinks(
                          getFindingPhotoUrls(selectedFindingInFindingTab),
                          "View Finding Photo"
                        )}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "16px", color: "#000" }}>Follow-up Evidence Photos</label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFollowUpPhotoChange}
                        style={{ ...inputStyle, marginTop: "5px" }}
                      />
                      {!!followUpPhotoFiles.length && (
                        <div style={{ marginTop: "8px", color: "#6c757d", fontSize: "14px" }}>
                          {followUpPhotoFiles.length} file(s) selected
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={handleSaveFinding}
                style={{
                  backgroundColor: "#198754",
                  color: "#fff",
                  border: "none",
                  padding: "12px 22px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "15px"
                }}
              >
                {findingForm.mode === "new" ? "Save Finding" : "Save Follow-up"}
              </button>
            </div>

            <div
              style={{
                background: "#fff",
                borderRadius: "15px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                padding: "20px"
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "15px" }}>
                <h4 style={{ margin: 0, marginRight: "10px", fontSize: "19px", color: "#000" }}>Findings — Followup</h4>
                <button style={filterChipStyle(findingFilter === "all")} onClick={() => setFindingFilter("all")}>All</button>
                <button style={filterChipStyle(findingFilter === "pending", "#997404")} onClick={() => setFindingFilter("pending")}>Pending</button>
                <button style={filterChipStyle(findingFilter === "submitted", "#0f5132")} onClick={() => setFindingFilter("submitted")}>Submitted</button>
              </div>
              <div>
                <table style={{ width: "100%", tableLayout: "auto", borderCollapse: "collapse" }}>
                  <colgroup>
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: "#212529" }}>
                      <th style={{ ...tableCellEllipsisStyle, color: "#fff" }}>Finding ID</th>
                      <th style={{ ...tableCellEllipsisStyle, color: "#fff" }}>Audit ID</th>
                      <th style={{ ...tableCellEllipsisStyle, color: "#fff" }}>Audit Date</th>
                      <th style={{ ...tableCellEllipsisStyle, color: "#fff" }}>Finding</th>
                      <th style={{ ...tableCellEllipsisStyle, color: "#fff" }}>Finding Photos</th>
                      <th style={{ ...tableCellEllipsisStyle, color: "#fff" }}>Follow-up Photos</th>
                      <th style={{ ...tableCellEllipsisStyle, color: "#fff" }}>Follow-up Date</th>
                      <th style={{ ...tableCellEllipsisStyle, color: "#fff" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followUpListFindings.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ ...tableCellStyle, textAlign: "center", color: "#6c757d" }}>
                          No findings match this filter
                        </td>
                      </tr>
                    ) : (
                      followUpListFindings.map((f) => {
                        const state = getFollowUpState(f);
                        return (
                          <tr key={f.findingId}>
                            <td style={tableCellEllipsisStyle} title={f.findingId}>{f.findingId}</td>
                            <td style={tableCellEllipsisStyle} title={f.auditId}>{f.auditId}</td>
                            <td style={tableCellEllipsisStyle}>{formatDateOnly(f.auditDate)}</td>
                            <td style={tableCellWrapStyle}>{f.finding}</td>
                            <td style={tableCellWrapStyle}>
                              {renderPhotoLinks(getFindingPhotoUrls(f), "View Finding Photo")}
                            </td>
                            <td style={tableCellWrapStyle}>
                              {renderPhotoLinks(getFollowUpPhotoUrls(f), "View Follow-up Photo")}
                            </td>
                            <td style={tableCellStyle}>
                              {formatDateOnly(f.followUpSubmittedDate) || <span style={{ color: "#6c757d" }}>—</span>}
                            </td>
                            <td style={tableCellStyle}>
                              <span style={statusBadgeStyle(state)}>{state}</span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSection === "actions" && (
          <div>
            <div
              style={{
                background: "#fff",
                borderRadius: "15px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                padding: "20px",
                marginBottom: "20px"
              }}
            >
              <h3 style={{ marginBottom: "15px", fontSize: "22px", color: "#000" }}>Create Action</h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "15px",
                  marginBottom: "15px"
                }}
              >
                <div>
                  <label style={{ fontSize: "16px", color: "#000" }}>Audit ID</label>
                  <select
                    name="auditId"
                    value={actionForm.auditId}
                    onChange={handleActionInputChange}
                    style={{ ...inputStyle, marginTop: "5px" }}
                  >
                    <option value="">Select Audit</option>
                    {audits.map((audit) => (
                      <option key={audit.auditId} value={audit.auditId}>
                        {audit.auditId}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: "16px", color: "#000" }}>CAPA</label>
                  <textarea
                    name="action"
                    value={actionForm.action}
                    onChange={handleActionInputChange}
                    style={textareaStyle}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "16px", color: "#000" }}>Actual Date</label>
                  <input
                    type="date"
                    name="actualDate"
                    value={actionForm.actualDate}
                    onChange={handleActionInputChange}
                    style={{ ...inputStyle, marginTop: "5px" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "16px", color: "#000" }}>Evidence Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleActionPhotoChange}
                    style={{ ...inputStyle, marginTop: "5px" }}
                  />
                </div>
              </div>

              <button
                onClick={handleSaveAction}
                style={{
                  backgroundColor: "#ffc107",
                  color: "#000",
                  border: "none",
                  padding: "12px 22px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "15px"
                }}
              >
                Save Action
              </button>
            </div>

            <div
              style={{
                background: "#fff",
                borderRadius: "15px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                padding: "20px"
              }}
            >
              <h4 style={{ marginBottom: "15px", fontSize: "19px", color: "#000" }}>Action List</h4>
              <div>
                <table style={{ width: "100%", tableLayout: "auto", borderCollapse: "collapse" }}>
                  <colgroup>
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "38%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: "#212529", color: "#fff" }}>
                      <th style={tableCellEllipsisStyle}>Action ID</th>
                      <th style={tableCellEllipsisStyle}>Audit ID</th>
                      <th style={tableCellEllipsisStyle}>Action</th>
                      <th style={tableCellEllipsisStyle}>Photo</th>
                      <th style={tableCellEllipsisStyle}>Planned Date</th>
                      <th style={tableCellEllipsisStyle}>Actual Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.length === 0 ? (
                      <tr>
                        <td
                          colSpan="6"
                          style={{
                            ...tableCellStyle,
                            textAlign: "center",
                            color: "#6c757d"
                          }}
                        >
                          No actions found
                        </td>
                      </tr>
                    ) : (
                      actions.map((a) => (
                        <tr key={a.actionId}>
                          <td style={tableCellEllipsisStyle} title={a.actionId}>{a.actionId}</td>
                          <td style={tableCellEllipsisStyle} title={a.auditId}>{a.auditId}</td>
                          <td style={tableCellWrapStyle}>{a.action}</td>
                          <td style={tableCellStyle}>
                            {a.photoUrl ? (
                              <a href={a.photoUrl} target="_blank" rel="noreferrer">
                                View Photo
                              </a>
                            ) : (
                              ""
                            )}
                          </td>
                          <td style={tableCellStyle}>
                            {formatDateOnly(a.plannedDate)}
                          </td>
                          <td style={tableCellStyle}>
                            {formatDateOnly(a.actualDate)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSection === "actionPlan" && (
          <div>
            <div
              style={{
                background: "#fff",
                borderRadius: "15px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                padding: "20px",
                marginBottom: "20px"
              }}
            >
              <h3 style={{ marginBottom: "15px", fontSize: "22px", color: "#000" }}>Create Action Plan</h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "15px",
                  marginBottom: "15px"
                }}
              >
                <div>
                  <label style={{ fontSize: "16px", color: "#000" }}>Audit ID</label>
                  <select
                    name="auditId"
                    value={actionPlanForm.auditId}
                    onChange={handleActionPlanInputChange}
                    style={{ ...inputStyle, marginTop: "5px" }}
                  >
                    <option value="">Select Audit</option>
                    {audits.map((audit) => (
                      <option key={audit.auditId} value={audit.auditId}>
                        {audit.auditId}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "16px", color: "#000" }}>Finding ID</label>
                  <select
                    name="findingId"
                    value={actionPlanForm.findingId}
                    onChange={handleActionPlanInputChange}
                    style={{ ...inputStyle, marginTop: "5px" }}
                  >
                    <option value="">Select Finding ID</option>
                    {filteredFindingsForSelectedAudit.map((f) => (
                      <option key={f.findingId} value={f.findingId}>
                        {f.findingId}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedFindingInActionPlan && (
                  <>
                    <div>
                      <label style={{ fontSize: "16px", color: "#000" }}>Finding Evidence</label>
                      <div style={{ marginTop: "8px" }}>
                        {renderPhotoLinks(
                          getFindingPhotoUrls(selectedFindingInActionPlan),
                          "View Finding Photo"
                        )}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "16px", color: "#000" }}>Follow-up Evidence</label>
                      <div style={{ marginTop: "8px" }}>
                        {renderPhotoLinks(
                          getFollowUpPhotoUrls(selectedFindingInActionPlan),
                          "View Follow-up Photo"
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: "16px", color: "#000" }}>Action Plan</label>
                  <textarea
                    name="actionPlan"
                    value={actionPlanForm.actionPlan}
                    onChange={handleActionPlanInputChange}
                    style={textareaStyle}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "16px", color: "#000" }}>Actual Date</label>
                  <input
                    type="date"
                    name="actualDate"
                    value={actionPlanForm.actualDate}
                    onChange={handleActionPlanInputChange}
                    style={{ ...inputStyle, marginTop: "5px" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "16px", color: "#000" }}>Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleActionPlanPhotoChange}
                    style={{ ...inputStyle, marginTop: "5px" }}
                  />
                </div>
              </div>

              <button
                onClick={handleSaveActionPlan}
                style={{
                  backgroundColor: "#6f42c1",
                  color: "#fff",
                  border: "none",
                  padding: "12px 22px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "15px"
                }}
              >
                Save Action Plan
              </button>
            </div>

            <div
              style={{
                background: "#fff",
                borderRadius: "15px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                padding: "20px"
              }}
            >
              <h4 style={{ marginBottom: "15px", fontSize: "19px", color: "#000" }}>Action Plan List</h4>
              <div>
                <table style={{ width: "100%", tableLayout: "auto", borderCollapse: "collapse" }}>
                  <colgroup>
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "7%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: "#212529", color: "#fff" }}>
                      <th style={tableCellEllipsisStyle}>Action Plan ID</th>
                      <th style={tableCellEllipsisStyle}>Audit ID</th>
                      <th style={tableCellEllipsisStyle}>Finding ID</th>
                      <th style={tableCellEllipsisStyle}>Action Plan</th>
                      <th style={tableCellEllipsisStyle}>Finding Photo</th>
                      <th style={tableCellEllipsisStyle}>Follow-up Photo</th>
                      <th style={tableCellEllipsisStyle}>Action Plan Photo</th>
                      <th style={tableCellEllipsisStyle}>Actual Date</th>
                      <th style={tableCellEllipsisStyle}>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionPlans.length === 0 ? (
                      <tr>
                        <td
                          colSpan="9"
                          style={{
                            ...tableCellStyle,
                            textAlign: "center",
                            color: "#6c757d"
                          }}
                        >
                          No action plans found
                        </td>
                      </tr>
                    ) : (
                      actionPlans.map((ap) => (
                        <tr key={ap.actionPlanId}>
                          <td style={tableCellEllipsisStyle} title={ap.actionPlanId}>{ap.actionPlanId}</td>
                          <td style={tableCellEllipsisStyle} title={ap.auditId}>{ap.auditId}</td>
                          <td style={tableCellEllipsisStyle} title={ap.findingId}>{ap.findingId}</td>
                          <td style={tableCellWrapStyle}>{ap.actionPlan}</td>
                          <td style={tableCellWrapStyle}>
                            {renderPhotoLinks(
                              normalizePhotoArray(
                                ap.findingPhotoUrls?.length
                                  ? ap.findingPhotoUrls
                                  : ap.findingPhotoUrl
                              ),
                              "View Finding Photo"
                            )}
                          </td>
                          <td style={tableCellWrapStyle}>
                            {renderPhotoLinks(
                              normalizePhotoArray(
                                ap.followUpPhotoUrls?.length
                                  ? ap.followUpPhotoUrls
                                  : ap.followUpPhotoUrl
                              ),
                              "View Follow-up Photo"
                            )}
                          </td>
                          <td style={tableCellStyle}>
                            {ap.photoUrl ? (
                              <a href={ap.photoUrl} target="_blank" rel="noreferrer">
                                View Photo
                              </a>
                            ) : (
                              ""
                            )}
                          </td>
                          <td style={tableCellStyle}>
                            {formatDateOnly(ap.actualDate)}
                          </td>
                          <td style={tableCellEllipsisStyle} title={ap.timestamp}>{ap.timestamp}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: "6px",
  border: "1px solid #ced4da",
  fontSize: "16px",
  color: "#000"
};

const textareaStyle = {
  width: "100%",
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #ced4da",
  marginTop: "5px",
  resize: "vertical",
  fontSize: "16px",
  color: "#000"
};

const tableCellStyle = {
  border: "1px solid #dee2e6",
  padding: "12px 14px",
  verticalAlign: "top",
  whiteSpace: "nowrap",
  fontSize: "16px",
  color: "#000",
  overflow: "hidden"
};

// For short-ish values (names, dept) that must never force horizontal
// scroll: truncate with "..." instead, full value available on hover.
const tableCellEllipsisStyle = {
  ...tableCellStyle,
  textOverflow: "ellipsis"
};

// For columns holding longer free text (Finding / Action / Action Plan)
// where wrapping within the fixed column width is wanted.
const tableCellWrapStyle = {
  ...tableCellStyle,
  whiteSpace: "normal"
};

export default App;