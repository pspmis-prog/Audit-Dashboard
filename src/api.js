const BASE_URL =
  "https://script.google.com/macros/s/AKfycbzQ5aXsR3dEcWitzn-vn8GUjoZydmw0H0mUsMBV9k3C2cMKK0RPY0KvMmyRM8awPQhF/exec";

async function parseResponse(res) {
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON response: ${text}`);
  }
}

async function getJson(url) {
  const res = await fetch(url, { method: "GET" });
  return parseResponse(res);
}

async function postJson(body) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(body)
  });

  return parseResponse(res);
}

export async function apiGetAudits() {
  return getJson(`${BASE_URL}?action=getAudits`);
}

export async function apiSaveAudit(payload) {
  return postJson({
    action: "saveAudit",
    payload
  });
}

export async function apiGetFindings() {
  return getJson(`${BASE_URL}?action=getFindings`);
}

export async function apiSaveFinding(payload) {
  return postJson({
    action: "saveFinding",
    payload
  });
}

export async function apiGetActions() {
  return getJson(`${BASE_URL}?action=getActions`);
}

export async function apiSaveAction(payload) {
  return postJson({
    action: "saveAction",
    payload
  });
}

export async function apiGetActionPlans() {
  return getJson(`${BASE_URL}?action=getActionPlans`);
}

export async function apiSaveActionPlan(payload) {
  return postJson({
    action: "saveActionPlan",
    payload
  });
}

export async function apiCloseAction(payload) {
  return postJson({
    action: "closeAction",
    payload
  });
}

export async function apiUploadFile(payload) {
  return postJson({
    action: "uploadFile",
    payload
  });
}