// One codebase, two deployments:
//   APP_MODE=internal (default): your own app. One workspace, only ALLOWED_EMAILS can sign in.
//   APP_MODE=saas: the product you sell. Public landing page, open sign-up, one workspace per account.
export const isSaas = () => process.env.APP_MODE === "saas";
export const PRODUCT = { name: process.env.NEXT_PUBLIC_PRODUCT_NAME || "Feldbuch" };
