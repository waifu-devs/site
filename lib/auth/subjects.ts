import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

/** What an OpenAuth access token says about who is signed in. */
export const subjects = createSubjects({
  user: object({ id: string() }),
});
