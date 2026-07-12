const{chromium}=require("playwright");
const{ChromiumDiffProvider}=require("./providers/pixel-diff");
const{OCRProvider}=require("./providers/ocr");
const{A11yProvider}=require("./providers/a11y");
const fs=require("fs"),path=require("path");
class VisualTestRunner{
 constructor(o={}){
  this.url=o.url||process.env.TEST_URL||"http://localhost:5173";
  this.headless=o.headless??(process.env.TEST_HEADLESS!=="false");
  this.viewport=o.viewport||{width:1920,height:1080};
  this.screenshotDir=o.screenshotDir||process.env.TEST_SCREENSHOT_DIR||"screenshots";
  this.baselineDir=o.baselineDir||process.env.TEST_BASELINE_DIR||"base-screenshots";
  this.reportDir=o.reportDir||process.env.TEST_REPORT_DIR||"reports";
  this.browser=null;this.context=null;this.page=null;this.results=[];
  this.pixelDiff=new PixelDiffProvider({outputDir:path.join(this.reportDir,"pixel-diff")});
  this.ocr=new OCRProvider();this.a11y=new A11yProvider()
 }
 async launch(){this.browser=await chromium.launch({headless:this.headless,args:["--no-sandbox"]});this.context=await this.browser.newContext({viewport:this.viewport});this.page=await this.context.newPage();[this.screenshotDir,this.reportDir,this.baselineDir].forEach(d=>fs.mkdirSync(d,{recursive:true}))}
 async close(){if(this.browser)await this.browser.close();return this.generateReport()}
 async pixelRegressionTest(name,route,o={}){
  await this.page.goto(this.url+route);
  if(o.waitFor)await this.page.waitForSelector(o.waitFor);
  if(o.waitMs)await this.page.waitForTimeout(o.waitMs);
  const cur=path.join(this.screenshotDir,name+"-current.png");
  const base=path.join(this.baselineDir,name+".png");
  await this.page.screenshot({path:cur});
  if(!fs.existsSync(base)){fs.mkdirSync(path.dirname(base),{recursive:true});fs.copyFileSync(cur,base);this.results.push({test:name,status:"BASELINE_CREATED",route,type:"pixel"});return{status:"BASELINE_CREATED"}}
  const r=await this.pixelDiff.compare(base,cur,name);
  this.results.push({test:name,status:r.passed?"PASSED":"FAILED",misMatchPercentage:r.misMatchPercentage,diffPath:r.diffImagePath,route,type:"pixel"});
  if(!r.passed)throw new Error("Pixel diff failed ("+name+"): "+r.misMatchPercentage.toFixed(2)+"% (threshold="+(this.pixelDiff.threshold*100)+"%)");return r
 }
 async a11yTest(name,route,o={}){
  await this.page.goto(this.url+route);
  if(o.waitFor)await this.page.waitForSelector(o.waitFor);
  if(o.waitMs)await this.page.waitForTimeout(o.waitMs);
  await this.a11y.inject(this.page);
  const r=await this.a11y.run(this.page);
  this.results.push({test:name,status:r.violations.length===0?"PASSED":"FAILED",route,type:"a11y",violations:r.violations.length,summary:r.summary});
  if(r.violations.length>0){const report=this.a11y.formatViolations(r.violations);const rp=path.join(this.reportDir,"a11y-"+name+".md");fs.writeFileSync(rp,"# A11y Report: "+name+"\n\nRoute: "+route+"\n\n"+report);throw new Error("A11y violations "+r.violations.length+" ("+name+"): "+r.summary.critical+" critical, "+r.summary.serious+" serious")}
  return r
 }
 generateReport(){const rp=path.join(this.reportDir,"visual-test-report.json");fs.mkdirSync(path.dirname(rp),{recursive:true});fs.writeFileSync(rp,JSON.stringify({timestamp:new Date().toISOString(),url:this.url,results:this.results},null,2));return rp}
}
module.exports={VisualTestRunner}