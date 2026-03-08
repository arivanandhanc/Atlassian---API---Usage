// service-request-priority.js
import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const {JIRA_BASE_URL,JIRA_EMAIL,JIRA_API_TOKEN}=process.env;

const http = axios.create({
 baseURL:JIRA_BASE_URL,
 auth:{username:JIRA_EMAIL,password:JIRA_API_TOKEN}
});
const map={
 "On Demand Development":"Medium",
 "Consultations":"Medium",
 "Reporting Changes":"Low",
 "Others":"Low",
 "Active Support Scheduling":"High",
 "Stakeholder Changes":"High",
 "Monitoring Change":"Highest"
};

app.post("/webhook",async(req,res)=>{

const issue=req.body.issue;
const key=issue.key;

const type=issue.fields.customfield_requesttype?.requestType?.name;

if(map[type]){

 await http.put(`/rest/api/3/issue/${key}`,{
  fields:{priority:{name:map[type]}}
 });

}

});