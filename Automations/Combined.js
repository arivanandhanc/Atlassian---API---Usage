// jira-automation-server.js

import express from "express";
import axios from "axios";
import crypto from "crypto";

const app = express();

app.use(express.json({
  verify: (req,res,buf)=>{ req.rawBody = buf }
}));

/* ============================
ENV
============================ */

const {
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  WEBHOOK_SECRET,
  PORT
} = process.env;

if(!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN){
  console.warn("Missing Jira env variables");
}

/* ============================
JIRA CLIENT
============================ */

const jira = axios.create({
  baseURL:JIRA_BASE_URL,
  auth:{
    username:JIRA_EMAIL,
    password:JIRA_API_TOKEN
  },
  timeout:15000
});

/* ============================
SECURITY
============================ */

function computeSig(secret,raw){
  return "sha256=" +
  crypto.createHmac("sha256",secret)
  .update(raw)
  .digest("hex");
}

function verifySignature(req){

  if(!WEBHOOK_SECRET) return true;

  const sig =
    req.get("x-hub-signature-256") ||
    req.get("x-atlassian-webhook-signature");

  if(!sig) return false;

  const expected = computeSig(
    WEBHOOK_SECRET,
    req.rawBody || ""
  );

  return sig === expected;
}

/* ============================
DEDUPLICATION
============================ */

const seen = new Map();

function once(key,ttl=60000){

  const now = Date.now();

  const exp = seen.get(key) || 0;

  if(exp > now) return false;

  seen.set(key,now+ttl);

  if(seen.size > 5000){
    for(const [k,v] of seen){
      if(v < now) seen.delete(k);
    }
  }

  return true;
}

/* ============================
HELPERS
============================ */

async function transitionIssue(key,statusName){

  const {data} =
  await jira.get(`/rest/api/3/issue/${key}/transitions`);

  const transition =
  data.transitions.find(
    t=>t.to.name === statusName
  );

  if(!transition){
    console.log("Transition not found",statusName);
    return;
  }

  await jira.post(
    `/rest/api/3/issue/${key}/transitions`,
    {transition:{id:transition.id}}
  );

}

async function setPriority(key,priority){

  await jira.put(
    `/rest/api/3/issue/${key}`,
    {
      fields:{
        priority:{name:priority}
      }
    }
  );

}

async function addComment(key,body){

  await jira.post(
    `/rest/api/3/issue/${key}/comment`,
    {body}
  );

}

/* ============================
RULES
============================ */

async function ruleP1Comment(issue){

  const key = issue.key;

  const type = issue.fields?.issuetype?.name;
  const priority = issue.fields?.priority?.name;
  const status = issue.fields?.status?.name;

  if(
    type==="Incident" &&
    priority==="P1" &&
    status==="Assigned"
  ){

    if(!once(key+"p1")) return;

    await addComment(
      key,
`Hi Team,

As this is a **P1 ticket**, please open a Teams bridge call immediately.

Thanks.`
    );

    console.log("P1 comment added",key);
  }

}

async function ruleIncidentPriority(issue){

  const key = issue.key;

  const requestType =
  issue.fields?.customfield_requesttype?.requestType?.name;

  const emergency =
  issue.fields?.customfield_emergency;

  const env =
  issue.fields?.customfield_environment || [];

  if([
    "Report Outage",
    "Report Broken Functionality"
  ].includes(requestType)){

    if(emergency==="Yes" && env.includes("PROD")){

      await setPriority(key,"Highest");

      console.log("Priority updated",key);
    }
  }

}

async function ruleIncidentPriorityV2(issue){

  const key = issue.key;

  const reqType =
  issue.fields?.customfield_requesttype?.requestType?.name;

  const emergency =
  issue.fields?.customfield_emergency;

  if([
    "Report Slow Functionality",
    "Request System Change"
  ].includes(reqType)){

    if(emergency==="Yes"){

      await setPriority(key,"High");

      console.log("Priority V2 updated",key);
    }
  }

}

async function ruleReopenIncident(issue,comment){

  if(!comment) return;

  const key = issue.key;

  const type = issue.fields.issuetype.name;
  const status = issue.fields.status.name;

  if(
    !comment.internal &&
    type==="Incident" &&
    status==="Resolved"
  ){

    await transitionIssue(key,"Reopened");

    console.log("Incident reopened",key);
  }

}

async function ruleReopenProblem(issue,comment){

  if(!comment) return;

  const key = issue.key;

  const type = issue.fields.issuetype.name;
  const status = issue.fields.status.name;

  if(
    !comment.internal &&
    type==="Problem" &&
    status==="Resolved"
  ){

    await transitionIssue(key,"Re Opened");

    console.log("Problem reopened",key);
  }

}

async function ruleDuplicate(issue){

  const key = issue.key;

  const links =
  issue.fields?.issuelinks || [];

  const dup =
  links.find(
    l=>l.type?.name==="Duplicate"
  );

  if(!dup) return;

  await transitionIssue(key,"Cancelled");

  await addComment(
    key,
`This ticket is duplicate of ${dup.outwardIssue?.key}`
  );

  console.log("Duplicate closed",key);
}

async function ruleServiceRequest(issue){

  const key = issue.key;

  const req =
  issue.fields?.customfield_requesttype?.requestType?.name;

  const map = {

    "On Demand Development":"Medium",
    "Consultations":"Medium",

    "Reporting Changes":"Low",
    "Others":"Low",

    "Active Support Scheduling":"High",
    "Stakeholder Changes":"High",

    "Monitoring Change":"Highest"

  };

  if(map[req]){

    await setPriority(key,map[req]);

    console.log("Service priority set",key);
  }

}

/* ============================
WEBHOOK
============================ */

app.post("/api/webhook", async(req,res)=>{

  try{

    if(!verifySignature(req)){
      return res.status(401).send("Invalid signature");
    }

    const issue = req.body?.issue;
    const comment = req.body?.comment;

    if(!issue){
      return res.send("no issue");
    }

    console.log("Webhook received",issue.key);

    await Promise.allSettled([

      ruleP1Comment(issue),

      ruleIncidentPriority(issue),

      ruleIncidentPriorityV2(issue),

      ruleReopenIncident(issue,comment),

      ruleReopenProblem(issue,comment),

      ruleDuplicate(issue),

      ruleServiceRequest(issue)

    ]);

    res.send("processed");

  }
  catch(e){

    console.error(
      e?.response?.data || e.message
    );

    res.status(500).send("error");

  }

});

/* ============================
HEALTH PAGE
============================ */

app.get("/",(req,res)=>{

  res.send(`
  <h2>Jira Automation Service</h2>
  <p>Status: Running</p>
  <p>Webhook endpoint: /api/webhook</p>
  `);

});

/* ============================
SERVER START
============================ */

const port = PORT || 3000;

app.listen(port,()=>{
  console.log("Server running on",port);
});