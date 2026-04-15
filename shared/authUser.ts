/** Session / API user shape shared by the Express API and the web client. */
export type AuthUser = {
  email: string;
  name: string;
  picture: string;
};
