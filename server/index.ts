import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3001;
if (!process.env.VERCEL) {
  const app = await createApp();
  app.listen(port, () => {
    console.error(`API server listening on http://localhost:${port}`);
    const gid = process.env.GOOGLE_CLIENT_ID;
    if (gid) {
      const tail = gid.slice(-24);
      console.error(`Google OAuth: GOOGLE_CLIENT_ID loaded (ends with …${tail})`);
    } else {
      console.error("Google OAuth: GOOGLE_CLIENT_ID is missing — set it in .env");
    }
  });
}
