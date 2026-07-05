const DEFAULT_OWNER = "thebrain2026";
const DEFAULT_REPO = "the-brain-erp-website";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10000) request.destroy();
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function clean(value) {
  return String(value || "").trim().slice(0, 500);
}

function leadBody(data) {
  return [
    "New demo request from The Brain ERP website",
    "",
    `Name: ${data.name}`,
    `Location: ${data.location}`,
    `Phone: ${data.phone}`,
    `Farm size: ${data.size}`,
    `Submitted: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
  ].join("\n");
}

async function createGithubIssue(data) {
  const token = process.env.GITHUB_LEADS_TOKEN || process.env.GITHUB_TOKEN;
  const owner = process.env.LEAD_REPO_OWNER || DEFAULT_OWNER;
  const repo = process.env.LEAD_REPO_NAME || DEFAULT_REPO;
  if (!token) {
    throw new Error("Lead storage is not configured.");
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "the-brain-erp-leads"
    },
    body: JSON.stringify({
      title: `Demo request - ${data.name || data.phone}`,
      body: leadBody(data),
      labels: ["demo-lead", "website"]
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub lead storage failed: ${response.status}`);
  }
  return response.json();
}

async function listGithubIssues() {
  const token = process.env.GITHUB_LEADS_TOKEN || process.env.GITHUB_TOKEN;
  const owner = process.env.LEAD_REPO_OWNER || DEFAULT_OWNER;
  const repo = process.env.LEAD_REPO_NAME || DEFAULT_REPO;
  if (!token) {
    throw new Error("Lead storage is not configured.");
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?labels=demo-lead&state=open&per_page=100`, {
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "User-Agent": "the-brain-erp-leads"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub lead list failed: ${response.status}`);
  }
  return response.json();
}

module.exports = async function handler(request, response) {
  if (request.method === "POST") {
    try {
      const body = await readBody(request);
      const parsed = JSON.parse(body || "{}");
      const data = {
        name: clean(parsed.name),
        location: clean(parsed.location),
        phone: clean(parsed.phone),
        size: clean(parsed.size)
      };

      if (!data.name || !data.location || !data.phone || !data.size) {
        return sendJson(response, 400, { ok: false, message: "Please complete every field." });
      }

      await createGithubIssue(data);
      return sendJson(response, 200, { ok: true, message: "Your request has been saved. Our sales and service team will contact you soon. Please feel free to speak with them." });
    } catch (error) {
      return sendJson(response, 500, { ok: false, message: error.message || "Request could not be saved." });
    }
  }

  if (request.method === "GET") {
    try {
      const url = new URL(request.url, `https://${request.headers.host}`);
      const password = url.searchParams.get("password") || "";
      if (!process.env.LEAD_ADMIN_PASSWORD || password !== process.env.LEAD_ADMIN_PASSWORD) {
        return sendJson(response, 401, { ok: false, message: "Wrong password." });
      }

      const issues = await listGithubIssues();
      const leads = issues.map((issue) => ({
        id: issue.number,
        title: issue.title,
        createdAt: issue.created_at,
        body: issue.body,
        url: issue.html_url
      }));
      return sendJson(response, 200, { ok: true, leads });
    } catch (error) {
      return sendJson(response, 500, { ok: false, message: error.message || "Leads could not be loaded." });
    }
  }

  return sendJson(response, 405, { ok: false, message: "Method not allowed." });
};
