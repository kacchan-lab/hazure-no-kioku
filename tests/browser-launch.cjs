const {chromium}=require('playwright');
const {existsSync}=require('node:fs');
module.exports.launchChromium=()=>{
 const explicit=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
 const system=process.platform==='linux'&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined;
 return chromium.launch({headless:true,...((explicit||system)?{executablePath:explicit||system}:{}),...(process.platform==='linux'?{args:['--no-sandbox']}: {})});
};

module.exports.screenshotPath=name=>{const path=require('node:path'),fs=require('node:fs'),os=require('node:os');const dir=path.join(os.tmpdir(),'hazure-no-kioku-test-results');fs.mkdirSync(dir,{recursive:true});return path.join(dir,name);};
