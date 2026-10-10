import http from "http";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
const port=Number(process.env.PORT||5000);
http.get(`http://127.0.0.1:${port}/health`,res=>{let b="";res.on("data",c=>b+=c);res.on("end",()=>{console.log(`Health status: ${res.statusCode}`);console.log(b);process.exit(res.statusCode===200?0:1)})}).on("error",e=>{console.error(e.message);process.exit(1)});
