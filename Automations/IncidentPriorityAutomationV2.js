// incident-priority-v2.js
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

const reqType=issue.fields.customfield_requesttype?.requestType?.name;
const emergency=issue.fields.customfield_emergency;
const env=issue.fields.customfield_environment;

if(["Report Slow Functionality","Request System Change"].includes(reqType)){

 if(emergency==="Yes"){
  await http.put(`/rest/api/3/issue/${key}`,{
   fields:{priority:{name:"High"}}
  });
 }

}

});