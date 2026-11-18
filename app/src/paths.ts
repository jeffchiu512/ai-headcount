/** Resolve public assets for localhost and GitHub Pages project subpaths. */
export const assetUrl=(path:string)=>`${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
export const authRedirectUrl=()=>new URL(import.meta.env.BASE_URL,window.location.origin).href;
