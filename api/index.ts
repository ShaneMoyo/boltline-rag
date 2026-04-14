import { createApp } from "../server/app.js";

const app = await createApp();
export default app;

export const config = {
  maxDuration: 60,
};
