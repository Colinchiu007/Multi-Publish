/** A11y tests: node scripts/run-a11y-tests.js [--list] [--route /path] */
const{VisualTestRunner}=require("../index.js");
const tests=[
  {name:"home-a11y",route:"/"},
  {name:"login-a11y",route:"/login"},
  {name:"accounts-a11y",route:"/accounts"},
  {name:"publish-a11y",route:"/publish"},
  {name:"settings-a11y",route:"/settings"}
];
const args=process.argv.slice(2);
if(args.includes("--list")){console.log("A11y tests:");tests.forEach(t=>console.log(" - "+t.name+" ("+t.route+")"));process.exit(0)}
if(args.includes("--help")){console.log("Usage: node scripts/run-a11y-tests.js [--list] [--route /path]");process.exit(0)}
async function run(){console.log("\n[ a11y tests ]");const r=new VisualTestRunner();await r.launch();let p=0,f=0;
for(const t of tests){console.log(" "+t.name+"...");try{await r.a11yTest(t.name,t.route);p++}catch(e){console.log("   FAIL: "+e.message);f++}}
const rp=await r.close();console.log("\nResults: "+p+" passed / "+f+" failed");console.log("Report: "+rp);process.exit(f>0?1:0)}
run().catch(e=>{console.error("Failed:",e.message);process.exit(1)})