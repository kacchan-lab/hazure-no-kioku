// Public configuration only. Never put a server/secret/service_role key here.
// Leave auth.enabled=false until the project and email settings are confirmed.
export const PUBLIC_CONFIG = Object.freeze({
 mode:'development',
 developmentDemo:true,
 auth:Object.freeze({enabled:false,projectUrl:'',publishableKey:'',method:'magic-link',redirectUrl:''})
});
