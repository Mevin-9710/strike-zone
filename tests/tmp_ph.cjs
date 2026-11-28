const { chromium } = require('playwright-core');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const out=process.argv[2]||'/tmp/claude-0/ph';
for (const [name,vp] of [['L',{width:844,height:390}],['P',{width:390,height:844}]]){
const ctx=await b.newContext({viewport:vp,hasTouch:true,isMobile:true,deviceScaleFactor:1});
await ctx.addInitScript(()=>{localStorage.setItem('sz_onboard_done','1');localStorage.setItem('sz_settings',JSON.stringify({quality:'auto',qMigrated:1}));localStorage.setItem('sz_mode','dm');});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:8765/index.html?test=1&touch=1');await p.waitForFunction(()=>window.__game?.ready,null,{timeout:90000});
await p.waitForTimeout(800);await p.screenshot({path:`${out}_${name}_lobby.png`});
await p.evaluate(()=>{const g=__game;g.start(0,{mode:'dm',dmMap:4});g.peace?.();for(let k=0;k<20;k++)g.step(0.1);});
await p.waitForTimeout(500);await p.screenshot({path:`${out}_${name}_match.png`});
console.log(name,errs.slice(0,3));await ctx.close();}
await b.close();})();
