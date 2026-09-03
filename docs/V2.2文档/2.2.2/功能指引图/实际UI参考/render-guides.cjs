const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  const html=path.join(__dirname,'guide-render.html');
  for(let i=1;i<=4;i++){
    await page.goto(pathToFileURL(html).href+'?id='+i,{waitUntil:'networkidle'});
    await page.screenshot({path:path.join(__dirname,'..',`0${i}-功能指引-V2.png`),fullPage:false});
  }
  await browser.close();
})();
