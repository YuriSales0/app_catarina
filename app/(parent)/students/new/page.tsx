import { redirect } from "next/navigation";

/** Adding a child always goes through first steps: profile, level, AI choice. */
export default function NewStudentPage() {
  redirect("/boas-vindas");
}
