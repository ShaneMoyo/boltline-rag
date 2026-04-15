import "express-session";
import type { AuthUser } from "../shared/authUser.js";

declare module "express-session" {
  interface SessionData {
    user: AuthUser;
  }
}

export {};
