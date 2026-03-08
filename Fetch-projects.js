require("dotenv").config();
const axios = require("axios");
const ExcelJS = require("exceljs");

const baseUrl = process.env.JIRA_BASE_URL;
const email = process.env.JIRA_EMAIL;
const token = process.env.JIRA_API_TOKEN;

const auth = Buffer.from(email + ":" + token).toString("base64");

async function run() {

  const res = await axios.get(baseUrl + "/rest/api/3/project/search", {
    headers: {
      Authorization: "Basic " + auth,
      Accept: "application/json"
    }
  });

  const projects = res.data.values || [];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Projects");

  sheet.columns = [
    { header: "ID", key: "id", width: 15 },
    { header: "Key", key: "key", width: 15 },
    { header: "Name", key: "name", width: 30 },
    { header: "Type", key: "type", width: 20 },
    { header: "Lead", key: "lead", width: 25 },
    { header: "Private", key: "private", width: 10 }
  ];

  projects.forEach(p => {

    sheet.addRow({
      id: p.id,
      key: p.key,
      name: p.name,
      type: p.projectTypeKey,
      lead: p.lead?.displayName || "",
      private: p.isPrivate
    });

  });

  await workbook.xlsx.writeFile("jira_projects.xlsx");

  console.log("Excel exported → jira_projects.xlsx");

}

run();