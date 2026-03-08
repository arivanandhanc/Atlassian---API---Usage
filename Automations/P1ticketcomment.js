// p1-comment.js
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
 const key=issue?.key;
 const priority=issue?.fields?.priority?.name;
 const type=issue?.fields?.issuetype?.name;
 const status=issue?.fields?.status?.name;

 if(type==="Incident" && priority==="P1" && status==="Assigned"){
 
  await http.post(`/rest/api/3/issue/${key}/comment`,{
   body:`Hi Team,
As this is a P1 ticket please open a Teams bridge call first.
Thanks.`
  });

 }

 res.send("ok");

});

app.listen(3001);