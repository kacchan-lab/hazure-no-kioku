// Development-only provider. Never persist or treat this as purchased access.
// A future server-backed provider must verify authentication and entitlement.
export function createDemoAccess() {
 let status='free';const listeners=new Set();
 return {
  async getAccess(){return {allowed:status==='plus',source:'development-demo',status};},
  setDemoStatus(next){status=['free','plus','pending','error'].includes(next)?next:'free';for(const listener of listeners)listener();},
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
 };
}

// No purchase API yet: hosted/production configurations must fail closed.
export function createUnverifiedAccess(){
 return {async getAccess(){return {allowed:false,source:'unverified',status:'pending'};},setDemoStatus(){},subscribe(){return ()=>{};}};
}
