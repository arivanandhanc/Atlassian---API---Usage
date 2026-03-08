require("dotenv").config();
const axios = require("axios");
const ExcelJS = require("exceljs");

const baseUrl = process.env.JIRA_BASE_URL;
const email = process.env.JIRA_EMAIL;
const token = process.env.JIRA_API_TOKEN;
const jql = process.env.JQL;

const auth = Buffer.from(email + ":" + token).toString("base64");

async function run() {

  const res = await axios.get(baseUrl + "/rest/api/3/search/jql", {
    headers: {
      Authorization: "Basic " + auth,
      Accept: "application/json"
    },
    params: {
      jql: jql,
      maxResults: 100,
      fields: "*all"
    }
  });

  const issues = res.data.issues || [];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Jira Tickets");

  sheet.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "Key", key: "key", width: 15 },
    { header: "Summary", key: "summary", width: 40 },
    { header: "Description", key: "description", width: 40 },
    { header: "Issue Type", key: "issuetype", width: 20 },
    { header: "Status", key: "status", width: 20 },
    { header: "Priority", key: "priority", width: 15 },
    { header: "Assignee", key: "assignee", width: 25 },
    { header: "Reporter", key: "reporter", width: 25 },
    { header: "Creator", key: "creator", width: 25 },
    { header: "Organization", key: "org", width: 20 },
    { header: "Labels", key: "labels", width: 20 },
    { header: "Components", key: "components", width: 20 },
    { header: "Fix Versions", key: "versions", width: 20 },
    { header: "Votes", key: "votes", width: 10 },
    { header: "Watchers", key: "watchers", width: 10 },
    { header: "Time Estimate", key: "timeestimate", width: 15 },
    { header: "Time Spent", key: "timespent", width: 15 },
    { header: "Created", key: "created", width: 25 },
    { header: "Updated", key: "updated", width: 25 },
    { header: "Resolution", key: "resolution", width: 20 },
    { header: "Resolution Date", key: "resolutiondate", width: 25 }
  ];

  issues.forEach(issue => {

    const f = issue.fields;

    sheet.addRow({
      id: issue.id,
      key: issue.key,
      summary: f.summary,
      description: f.description || "",
      issuetype: f.issuetype?.name,
      status: f.status?.name,
      priority: f.priority?.name,
      assignee: f.assignee?.displayName || "Unassigned",
      reporter: f.reporter?.displayName,
      creator: f.creator?.displayName,
      org: f.customfield_10002?.map(o => o.name).join(", ") || "",
      created: f.created,
      updated: f.updated,
      resolution: f.resolution?.name,
      resolutiondate: f.resolutiondate,
      labels: f.labels?.join(", "),
      components: f.components?.map(c => c.name).join(", "),
      versions: f.fixVersions?.map(v => v.name).join(", "),
      votes: f.votes?.votes,
      watchers: f.watches?.watchCount,
      timeestimate: f.timeestimate,
      timespent: f.timespent,
      
    });

  });

  await workbook.xlsx.writeFile("jira_tickets.xlsx");

  console.log("Excel exported → jira_tickets.xlsx");

}

run();