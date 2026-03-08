// incident-priority-v1.js
import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const {JIRA_BASE_URL,JIRA_EMAIL,JIRA_API_TOKEN}=process.env;

const http = axios.create({
 baseURL:JIRA_BASE_URL,
 auth:{username:JIRA_EMAIL,password:JIRA_API_TOKEN}
});
app.post("/webhook", async(req,res)=>{

const issue=req.body.issue;
const key=issue.key;

const requestType=issue.fields.customfield_requesttype?.requestType?.name;
const emergency=issue.fields.customfield_emergency;
const environment=issue.fields.customfield_environment;

if(["Report Outage","Report Broken Functionality"].includes(requestType)){

 if(emergency==="Yes" && environment.includes("PROD")){

  await http.put(`/rest/api/3/issue/${key}`,{
   fields:{priority:{name:"Highest"}}
  });

 }

}

});