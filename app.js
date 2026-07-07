const MASTER = window.INVOICE_MASTER;
const STORAGE_KEY_PREFIX = "invoiceSignatureTracker";
const SESSION_KEY = "invoiceSignatureSession:v1";
const STAGES = ["Radiographer Sign", "Hospital Incharge Sign", "DPM Sign", "Joint Director Sign"];

function getCurrentInvoiceMonth() {
  return "2026-06";
}

function getMonthlyStorageKey() {
  return `${STORAGE_KEY_PREFIX}:${state.invoiceMonth}:v1`;
}

const state = {
  user: null,
  records: null,
  selectedCenterId: null,
  centerQuery: "",
  centerMenuOpen: false,
  invoiceMonth: getCurrentInvoiceMonth(),
  kpiModal: null,
  filters: {
    lab: "all",
    district: "all",
    status: "all",
    center: "all"
  }
};

const el = {
  loginView: document.querySelector("#loginView"),
  workspaceView: document.querySelector("#workspaceView"),
  loginForm: document.querySelector("#loginForm"),
  emailInput: document.querySelector("#emailInput"),
  passwordInput: document.querySelector("#passwordInput"),
  loginMessage: document.querySelector("#loginMessage"),
  logoutButton: document.querySelector("#logoutButton"),
  userName: document.querySelector("#userName"),
  userRole: document.querySelector("#userRole"),
  scopeLabel: document.querySelector("#scopeLabel"),
  dashboardTitle: document.querySelector("#dashboardTitle"),
  kpiGrid: document.querySelector("#kpiGrid"),
  labFilter: document.querySelector("#labFilter"),
  districtFilter: document.querySelector("#districtFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  centerCombobox: document.querySelector("#centerCombobox"),
  centerSearchInput: document.querySelector("#centerSearchInput"),
  centerMenu: document.querySelector("#centerMenu"),
  centerCount: document.querySelector("#centerCount"),
  centerList: document.querySelector("#centerList"),
  emptyState: document.querySelector("#emptyState"),
  trackerDetail: document.querySelector("#trackerDetail"),
  detailMeta: document.querySelector("#detailMeta"),
  detailTitle: document.querySelector("#detailTitle"),
  detailBadge: document.querySelector("#detailBadge"),
  stageFlow: document.querySelector("#stageFlow"),
  remarksInput: document.querySelector("#remarksInput"),
  resetCenterButton: document.querySelector("#resetCenterButton"),
  saveButton: document.querySelector("#saveButton"),
  pipelineChart: document.querySelector("#pipelineChart"),
  activityList: document.querySelector("#activityList"),
  invoiceMonthInput: document.querySelector("#invoiceMonthInput"),
  kpiModalOverlay: document.querySelector("#kpiModalOverlay"),
  kpiModalContent: document.querySelector("#kpiModalContent"),
  successNotification: document.querySelector("#successNotification"),
  exportButton: document.querySelector("#exportButton")
};

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function centerId(center) {
  return `${center["Lab Name"]}::${center.District}::${center["Center Name"]}`;
}

function nowStamp() {
  return new Date().toISOString();
}

function formatDate(value) {
  if (!value) return "Not updated";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

async function hashPassword(password) {
  if (!window.crypto?.subtle) {
    throw new Error("Secure password hashing is unavailable in this browser.");
  }
  const bytes = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(getMonthlyStorageKey())) || {};
  } catch {
    return {};
  }
}

function saveRecords() {
  localStorage.setItem(getMonthlyStorageKey(), JSON.stringify(state.records));
}

function getRecord(id) {
  if (!state.records[id]) {
    state.records[id] = {
      operational: null,
      stages: {},
      remarks: "",
      updatedAt: null,
      updatedBy: null
    };
  }
  return state.records[id];
}

function isAssamAdmin(user = state.user) {
  return user && normalize(user.Lab) === "all";
}

function allowedCenters() {
  if (!state.user) return [];
  if (isAssamAdmin()) return MASTER.centers;
  return MASTER.centers.filter((center) => normalize(center["Lab Name"]) === normalize(state.user.Lab));
}

function allowedLabs() {
  const labs = [...new Set(allowedCenters().map((center) => center["Lab Name"]))].sort();
  return labs;
}

function allowedDistricts() {
  const centers = allowedCenters().filter((center) => state.filters.lab === "all" || center["Lab Name"] === state.filters.lab);
  return [...new Set(centers.map((center) => center.District))].sort();
}

function selectableCenters() {
  return allowedCenters()
    .filter((center) => state.filters.lab === "all" || center["Lab Name"] === state.filters.lab)
    .filter((center) => state.filters.district === "all" || center.District === state.filters.district)
    .filter((center) => {
      const status = centerStatus(center);
      if (state.filters.status === "all") return true;
      if (state.filters.status === "active") return getRecord(centerId(center)).operational === "active";
      if (state.filters.status === "pending") return status === "pending";
      return status === state.filters.status;
    })
    .sort((a, b) => a["Center Name"].localeCompare(b["Center Name"]));
}

function completedStageCount(record) {
  return STAGES.filter((stage) => record.stages?.[stage]?.done).length;
}

function centerStatus(center) {
  const record = getRecord(centerId(center));
  if (!record.operational) return "not-started";
  if (record.operational === "inactive") return "inactive";
  if (completedStageCount(record) === STAGES.length) return "complete";
  return "pending";
}

function statusLabel(status) {
  const labels = {
    "not-started": "Not started",
    inactive: "Inactive",
    active: "Active",
    pending: "Pending",
    complete: "Completed"
  };
  return labels[status] || "Not started";
}

function badgeClass(status) {
  if (status === "complete") return "complete";
  if (status === "inactive") return "inactive";
  if (status === "pending") return "pending";
  if (status === "active") return "active";
  return "";
}

function visibleCenters() {
  return selectableCenters().filter((center) => state.filters.center === "all" || centerId(center) === state.filters.center);
}

function scopedSummary() {
  const centers = allowedCenters();
  const labCount = new Set(centers.map((center) => center["Lab Name"])).size;
  const districtCount = new Set(centers.map((center) => center.District)).size;
  const active = centers.filter((center) => getRecord(centerId(center)).operational === "active").length;
  const inactive = centers.filter((center) => getRecord(centerId(center)).operational === "inactive").length;
  const complete = centers.filter((center) => centerStatus(center) === "complete").length;
  const notStarted = centers.filter((center) => centerStatus(center) === "not-started").length;
  return { centers, labCount, districtCount, active, inactive, complete, notStarted };
}

function stageCounts() {
  const centers = allowedCenters();
  return STAGES.map((stage) => ({
    stage,
    done: centers.filter((center) => getRecord(centerId(center)).stages?.[stage]?.done).length,
    total: centers.length
  }));
}

function renderLoginSession() {
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return;
  const user = MASTER.users.find((item) => normalize(item.Email) === normalize(email) && item.Active);
  if (user) {
    state.user = user;
    state.records = loadRecords();
    showWorkspace();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = normalize(el.emailInput.value);
  const password = el.passwordInput.value.trim();
  let passwordHash = "";

  try {
    passwordHash = await hashPassword(password);
  } catch (error) {
    el.loginMessage.textContent = error.message;
    return;
  }

  const user = MASTER.users.find((item) => normalize(item.Email) === email && item.PasswordHash === passwordHash);

  if (!user || !user.Active) {
    el.loginMessage.textContent = "Invalid email or password.";
    return;
  }

  state.user = user;
  state.records = loadRecords();
  localStorage.setItem(SESSION_KEY, user.Email);
  el.loginForm.reset();
  el.loginMessage.textContent = "";
  showWorkspace();
}

function showWorkspace() {
  el.loginView.classList.add("hidden");
  el.workspaceView.classList.remove("hidden");
  state.filters.lab = isAssamAdmin() ? "all" : state.user.Lab;
  state.filters.district = "all";
  state.filters.center = "all";
  state.selectedCenterId = null;
  el.userName.textContent = state.user.Name;
  el.userRole.textContent = isAssamAdmin() ? "Assam admin" : state.user.Lab;
  el.scopeLabel.textContent = isAssamAdmin() ? "Assam dashboard" : "Lab dashboard";
  el.dashboardTitle.textContent = isAssamAdmin() ? "Statewide Invoice Signature Status" : `${state.user.Lab} Invoice Signature Status`;
  el.invoiceMonthInput.value = state.invoiceMonth;
  renderAll();
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  state.user = null;
  state.selectedCenterId = null;
  el.workspaceView.classList.add("hidden");
  el.loginView.classList.remove("hidden");
}

function renderFilters() {
  const labs = allowedLabs();
  el.labFilter.innerHTML = [
    isAssamAdmin() ? `<option value="all">All labs</option>` : "",
    ...labs.map((lab) => `<option value="${lab}">${lab}</option>`)
  ].join("");
  el.labFilter.value = state.filters.lab;
  el.labFilter.disabled = !isAssamAdmin();

  const districts = allowedDistricts();
  if (state.filters.district !== "all" && !districts.includes(state.filters.district)) {
    state.filters.district = "all";
  }
  el.districtFilter.innerHTML = [
    `<option value="all">All districts</option>`,
    ...districts.map((district) => `<option value="${district}">${district}</option>`)
  ].join("");
  el.districtFilter.value = state.filters.district;
  el.statusFilter.value = state.filters.status;

  const centers = selectableCenters();
  if (state.filters.center !== "all" && !centers.some((center) => centerId(center) === state.filters.center)) {
    state.filters.center = "all";
    state.selectedCenterId = null;
  }
  renderCenterCombobox(centers);
}

function renderCenterCombobox(centers = selectableCenters()) {
  const selectedCenter = centers.find((center) => centerId(center) === state.filters.center);
  const query = state.centerMenuOpen ? state.centerQuery : "";
  const selectedText = selectedCenter ? selectedCenter["Center Name"] : "";
  const displayValue = state.centerMenuOpen ? state.centerQuery : selectedText;
  const filteredCenters = query
    ? centers.filter((center) => normalize(center["Center Name"]).includes(normalize(query)))
    : centers;

  el.centerSearchInput.value = displayValue;
  el.centerSearchInput.placeholder = "Search center...";
  el.centerCombobox.classList.toggle("open", state.centerMenuOpen);
  el.centerMenu.classList.toggle("hidden", !state.centerMenuOpen || !query);

  if (!state.centerMenuOpen || !query) {
    el.centerMenu.innerHTML = "";
    return;
  }

  const optionRows = filteredCenters.slice(0, 80).map((center) => {
    const id = centerId(center);
    const active = id === state.filters.center ? "active" : "";
    return `
      <button class="combo-option ${active}" type="button" data-center-option="${escapeHtml(id)}" role="option">
        <strong>${escapeHtml(center["Center Name"])}</strong>
        <span>${escapeHtml(center.District)} | ${escapeHtml(center["Lab Name"])}</span>
      </button>
    `;
  });

  el.centerMenu.innerHTML = optionRows.length
    ? optionRows.join("")
    : `<div class="combo-empty">No center found</div>`;
}

function renderKpis() {
  const summary = scopedSummary();
  const completion = summary.centers.length ? Math.round((summary.complete / summary.centers.length) * 100) : 0;
  const kpis = [
    { label: "Labs", value: summary.labCount, note: isAssamAdmin() ? "Available to Assam admin" : "Assigned lab access", key: "labs" },
    { label: "Districts", value: summary.districtCount, note: "Mapped to current access", key: "districts" },
    { label: "Centers", value: summary.centers.length, note: `${summary.active} active, ${summary.inactive} inactive`, key: "centers" },
    { label: "Completed", value: summary.complete, note: `${completion}% of accessible centers`, key: "completed" },
    { label: "Not started", value: summary.notStarted, note: "Centers awaiting first update", key: "notStarted" }
  ];

  el.kpiGrid.innerHTML = kpis
    .map((kpi) => `
      <article class="kpi-card" role="button" data-kpi="${kpi.key}" style="cursor: pointer;">
        <p class="eyebrow">${kpi.label}</p>
        <strong>${kpi.value}</strong>
        <span>${kpi.note}</span>
      </article>
    `)
    .join("");
}

function renderCenterList() {
  const centers = visibleCenters();
  el.centerCount.textContent = `${centers.length} visible`;
  el.centerList.innerHTML = centers.length
    ? centers.map((center) => {
        const id = centerId(center);
        const record = getRecord(id);
        const status = centerStatus(center);
        return `
          <button class="center-item ${state.selectedCenterId === id ? "active" : ""}" type="button" data-center-id="${id}">
            <span class="center-name">${center["Center Name"]}</span>
            <span class="center-meta">${center.District} | ${center["Lab Name"]}</span>
            <span class="center-footer">
              <span class="status-badge ${badgeClass(status)}">${statusLabel(status)}</span>
              <span class="center-meta">${completedStageCount(record)}/${STAGES.length} signatures</span>
            </span>
          </button>
        `;
      }).join("")
    : `<div class="empty-state"><h2>No centers found</h2><p>Adjust filters or search terms.</p></div>`;
}

function renderPipeline() {
  const counts = stageCounts();
  el.pipelineChart.innerHTML = counts.map((item) => {
    const pct = item.total ? Math.round((item.done / item.total) * 100) : 0;
    return `
      <div class="pipeline-row">
        <div class="pipeline-meta">
          <span>${item.stage}</span>
          <span>${item.done}/${item.total}</span>
        </div>
        <div class="pipeline-track"><span class="pipeline-fill" style="width:${pct}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderActivity() {
  const rows = allowedCenters()
    .map((center) => ({ center, id: centerId(center), record: getRecord(centerId(center)) }))
    .filter((item) => item.record.updatedAt)
    .sort((a, b) => new Date(b.record.updatedAt) - new Date(a.record.updatedAt))
    .slice(0, 6);

  el.activityList.innerHTML = rows.length
    ? rows.map((item) => `
      <div class="activity-item">
        <strong>${item.center["Center Name"]}</strong>
        <span>${statusLabel(centerStatus(item.center))} | ${formatDate(item.record.updatedAt)}</span>
        <span>${item.center.District}</span>
      </div>
    `).join("")
    : `<div class="activity-item"><span>No updates yet.</span></div>`;
}

function showKpiModal(kpiKey) {
  const summary = scopedSummary();
  const kpiData = {
    labs: { title: "Labs", value: summary.labCount, details: `Available labs: ${summary.labCount}` },
    districts: { title: "Districts", value: summary.districtCount, details: `Mapped districts: ${summary.districtCount}` },
    centers: { title: "Centers", value: summary.centers.length, details: `Active: ${summary.active} | Inactive: ${summary.inactive}` },
    completed: { title: "Completed", value: summary.complete, details: `Completion rate: ${summary.centers.length ? Math.round((summary.complete / summary.centers.length) * 100) : 0}%` },
    notStarted: { title: "Not Started", value: summary.notStarted, details: `Centers awaiting first update: ${summary.notStarted}` }
  };

  const data = kpiData[kpiKey] || {};
  el.kpiModalContent.innerHTML = `
    <div class="modal-header">
      <h2>${data.title}</h2>
      <button class="modal-close" type="button" aria-label="Close modal">&times;</button>
    </div>
    <div class="modal-body">
      <div class="modal-value">${data.value}</div>
      <p>${data.details}</p>
    </div>
  `;
  el.kpiModalOverlay.classList.remove("hidden");
}

function closeKpiModal() {
  el.kpiModalOverlay.classList.add("hidden");
}

function showSuccessNotification(message) {
  if (!el.successNotification) return;
  el.successNotification.textContent = message;
  el.successNotification.classList.remove("hidden");
  setTimeout(() => {
    el.successNotification.classList.add("hidden");
  }, 3000);
}

function selectedCenter() {
  return allowedCenters().find((center) => centerId(center) === state.selectedCenterId);
}

function renderDetail() {
  const center = selectedCenter();
  if (!center) {
    el.emptyState.classList.remove("hidden");
    el.trackerDetail.classList.add("hidden");
    return;
  }

  const id = centerId(center);
  const record = getRecord(id);
  const status = centerStatus(center);

  el.emptyState.classList.add("hidden");
  el.trackerDetail.classList.remove("hidden");
  el.detailMeta.textContent = `${center["Lab Name"]} | ${center.District}`;
  el.detailTitle.textContent = center["Center Name"];
  el.detailBadge.textContent = statusLabel(status);
  el.detailBadge.className = `status-badge ${badgeClass(status)}`;
  el.remarksInput.value = record.remarks || "";

  document.querySelectorAll("[data-operational]").forEach((button) => {
    button.classList.toggle("selected", record.operational === button.dataset.operational);
  });

  const active = record.operational === "active";
  el.stageFlow.innerHTML = STAGES.map((stage, index) => {
    const done = Boolean(record.stages?.[stage]?.done);
    const previousDone = index === 0 || Boolean(record.stages?.[STAGES[index - 1]]?.done);
    const locked = !active || (!done && !previousDone);
    const subtext = done
      ? `Completed by ${record.stages[stage].by || "admin"} on ${formatDate(record.stages[stage].at)}`
      : locked
        ? active ? "Complete the previous stage first" : "Mark center active to begin"
        : "Ready for update";
    return `
      <div class="stage-step ${done ? "done" : ""} ${locked ? "locked" : ""}">
        <span class="stage-index">${done ? "OK" : index + 1}</span>
        <div>
          <h3>${stage}</h3>
          <p>${subtext}</p>
        </div>
        <button type="button" data-stage="${stage}" class="${done ? "done" : ""}" ${locked ? "disabled" : ""}>
          ${done ? "Done" : `Mark ${stage}`}
        </button>
      </div>
    `;
  }).join("");
}

function renderAll() {
  renderFilters();
  renderKpis();
  renderCenterList();
  renderPipeline();
  renderActivity();
  renderDetail();
}

function setOperational(value) {
  if (!state.selectedCenterId) return;
  const record = getRecord(state.selectedCenterId);
  record.operational = value;
  if (value === "inactive") {
    record.stages = {};
  }
  record.updatedAt = nowStamp();
  record.updatedBy = state.user.Email;
  saveRecords();
  renderAll();
}

function markStage(stage) {
  if (!state.selectedCenterId) return;
  const record = getRecord(state.selectedCenterId);
  if (record.operational !== "active") return;
  const index = STAGES.indexOf(stage);
  const previousDone = index === 0 || record.stages?.[STAGES[index - 1]]?.done;
  if (!previousDone) return;
  
  // Toggle: if already done, remove it; if not done, mark it as done
  const currentlyDone = record.stages?.[stage]?.done;
  if (currentlyDone) {
    delete record.stages[stage];
  } else {
    record.stages[stage] = {
      done: true,
      at: nowStamp(),
      by: state.user.Email
    };
  }
  
  record.updatedAt = nowStamp();
  record.updatedBy = state.user.Email;
  saveRecords();
  renderAll();
}

function saveCurrentCenter() {
  if (!state.selectedCenterId) return;
  const record = getRecord(state.selectedCenterId);
  record.remarks = el.remarksInput.value.trim();
  record.updatedAt = nowStamp();
  record.updatedBy = state.user.Email;
  saveRecords();
  state.selectedCenterId = null;
  state.centerQuery = "";
  state.centerMenuOpen = false;
  state.filters.center = "all";
  renderAll();
  showSuccessNotification("✓ Update submitted successfully!");
}

function resetCurrentCenter() {
  if (!state.selectedCenterId) return;
  delete state.records[state.selectedCenterId];
  saveRecords();
  state.selectedCenterId = null;
  state.centerQuery = "";
  state.centerMenuOpen = false;
  state.filters.center = "all";
  renderAll();
  showSuccessNotification("✓ Center reset successfully!");
}

function exportToExcel() {
  const summary = scopedSummary();
  const centerList = summary.centers;
  const month = state.invoiceMonth;
  const today = new Date().toLocaleDateString("en-IN");
  
  // Prepare comprehensive centers data with all details
  const centersData = centerList.map(center => {
    const id = centerId(center);
    const record = getRecord(id);
    const status = centerStatus(center);
    
    return {
      "Lab Name": center["Lab Name"],
      "District": center.District,
      "Center Name": center["Center Name"],
      "Operational Status": record.operational === "active" ? "Active" : "Inactive",
      "Overall Status": statusLabel(status),
      "Radiographer Sign": record.stages?.["Radiographer Sign"]?.done ? "✓ Signed" : "✗ Pending",
      "Hospital Incharge Sign": record.stages?.["Hospital Incharge Sign"]?.done ? "✓ Signed" : "✗ Pending",
      "DPM Sign": record.stages?.["DPM Sign"]?.done ? "✓ Signed" : "✗ Pending",
      "Joint Director Sign": record.stages?.["Joint Director Sign"]?.done ? "✓ Signed" : "✗ Pending",
      "Signatures Completed": Object.values(record.stages || {}).filter(s => s.done).length + "/4",
      "Remarks": record.remarks || "",
      "Last Updated": record.updatedAt ? formatDate(record.updatedAt) : "Not updated",
      "Updated By": record.updatedBy || "N/A"
    };
  });
  
  // Create comprehensive summary sheet data
  const summarySheet = [
    ["INVOICE SIGNATURE TRACKER - DASHBOARD EXPORT"],
    [""],
    ["Invoice Month:", month],
    ["Export Date:", today],
    ["Exported By:", state.user?.Name || "Admin"],
    [""],
    ["=== DASHBOARD SUMMARY ==="],
    [""],
    ["Metric", "Value"],
    ["Total Centers", summary.centers.length],
    ["Total Labs", summary.labCount],
    ["Total Districts", summary.districtCount],
    ["Active Centers", summary.active],
    ["Inactive Centers", summary.inactive],
    ["Completed Centers", summary.complete],
    ["Pending Centers", summary.notStarted],
    [""],
    ["=== SIGNATURE PROGRESS BY STAGE ==="],
    [""]
  ];
  
  // Add stage progress
  const stageData = stageCounts();
  summarySheet.push(["Stage", "Completed", "Total", "Completion %"]);
  stageData.forEach(stage => {
    const percentage = stage.total > 0 ? Math.round((stage.done / stage.total) * 100) : 0;
    summarySheet.push([stage.stage, stage.done, stage.total, percentage + "%"]);
  });
  
  // Create workbook
  const workbook = XLSX.utils.book_new();
  
  // Add summary sheet
  const summaryWs = XLSX.utils.aoa_to_sheet(summarySheet);
  summaryWs["!cols"] = [{ wch: 30 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, summaryWs, "Dashboard Summary");
  
  // Add comprehensive centers detail sheet
  const centersWs = XLSX.utils.json_to_sheet(centersData);
  centersWs["!cols"] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 20 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 25 },
    { wch: 20 },
    { wch: 15 }
  ];
  XLSX.utils.book_append_sheet(workbook, centersWs, "All Centers Data");
  
  // Generate filename
  const fileName = `Invoice-Tracker-${month}-${new Date().toISOString().split('T')[0]}.xlsx`;
  
  // Download
  XLSX.writeFile(workbook, fileName);
  showSuccessNotification("✓ All dashboard data exported to Excel successfully!");
}

el.loginForm.addEventListener("submit", handleLogin);
el.logoutButton.addEventListener("click", logout);
el.labFilter.addEventListener("change", (event) => {
  state.filters.lab = event.target.value;
  state.filters.district = "all";
  state.filters.center = "all";
  state.centerQuery = "";
  state.centerMenuOpen = false;
  state.selectedCenterId = null;
  renderAll();
});
el.districtFilter.addEventListener("change", (event) => {
  state.filters.district = event.target.value;
  state.filters.center = "all";
  state.centerQuery = "";
  state.centerMenuOpen = false;
  state.selectedCenterId = null;
  renderAll();
});
el.statusFilter.addEventListener("change", (event) => {
  state.filters.status = event.target.value;
  state.filters.center = "all";
  state.centerQuery = "";
  state.centerMenuOpen = false;
  state.selectedCenterId = null;
  renderAll();
});
el.centerSearchInput.addEventListener("focus", () => {
  state.centerMenuOpen = true;
  renderCenterCombobox();
});
el.centerSearchInput.addEventListener("input", (event) => {
  state.centerMenuOpen = true;
  state.centerQuery = event.target.value;
  state.filters.center = "all";
  state.selectedCenterId = null;
  renderCenterCombobox();
});
el.centerSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    state.centerMenuOpen = false;
    state.centerQuery = "";
    renderCenterCombobox();
  }
});

el.centerMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-center-option]");
  if (!option) return;
  state.filters.center = option.dataset.centerOption;
  state.selectedCenterId = state.filters.center === "all" ? null : state.filters.center;
  state.centerQuery = "";
  state.centerMenuOpen = false;
  renderAll();
});

el.centerList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-center-id]");
  if (!button) return;
  state.selectedCenterId = button.dataset.centerId;
  state.filters.center = button.dataset.centerId;
  state.centerQuery = "";
  renderCenterList();
  renderCenterCombobox();
  renderDetail();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest("#centerCombobox")) {
    state.centerMenuOpen = false;
    state.centerQuery = "";
    renderCenterCombobox();
  }

  const operational = event.target.closest("[data-operational]");
  if (operational) {
    setOperational(operational.dataset.operational);
    return;
  }

  const stageButton = event.target.closest("[data-stage]");
  if (stageButton) {
    markStage(stageButton.dataset.stage);
  }
});
el.saveButton.addEventListener("click", saveCurrentCenter);
el.resetCenterButton.addEventListener("click", resetCurrentCenter);
el.exportButton.addEventListener("click", exportToExcel);

el.kpiGrid.addEventListener("click", (event) => {
  const kpiCard = event.target.closest("[data-kpi]");
  if (kpiCard) {
    showKpiModal(kpiCard.dataset.kpi);
  }
});

if (el.kpiModalOverlay) {
  el.kpiModalOverlay.addEventListener("click", (event) => {
    if (event.target === el.kpiModalOverlay) {
      closeKpiModal();
    }
  });

  el.kpiModalContent.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-close")) {
      closeKpiModal();
    }
  });
}

if (el.invoiceMonthInput) {
  el.invoiceMonthInput.addEventListener("change", (event) => {
    state.invoiceMonth = event.target.value;
    state.records = loadRecords();
    state.selectedCenterId = null;
    state.filters.center = "all";
    state.centerQuery = "";
    renderAll();
  });
}

renderLoginSession();
