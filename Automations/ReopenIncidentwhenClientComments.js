// reopen-incident.js
import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const {JIRA_BASE_URL,JIRA_EMAIL,JIRA_API_TOKEN}=process.env;

const http = axios.create({
 baseURL:JIRA_BASE_URL,
 auth:{username:JIRA_EMAIL,password:JIRA_API_TOKEN}
});
app.post("/webhook",async(req,res)=>{

const issue=req.body.issue;
const key=issue.key;

const status=issue.fields.status.name;
const type=issue.fields.issuetype.name;

const comment=req.body.comment;

if(comment && !comment.internal){

 if ((type === "Incident" || type === "Problem") && status === "Resolved") {

  await http.post(`/rest/api/3/issue/${key}/transitions`,{
   transition:{id:"Reopened"}
  });

 }

}

});