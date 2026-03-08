// team-change.js
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

const team=issue.fields.customfield_team;

const map={
 "Infrastructure Support":"arivu@gmail.com",
 "NA AST Support":"arivu@gmail.com",
 "EMEA AST Support":"arivu@gmail.com"
};

const email=map[team];

if(email){

 await axios.post("EMAIL_API",{
  to:email,
  subject:`Team updated for ${key}`,
  body:`Issue ${key} assigned to ${team}`
 });

}

});