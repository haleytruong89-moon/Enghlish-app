import { redirect } from "next/navigation";

/** The old "Bài luyện" page moved into Hôm nay (W4b): link / PDF work is listed there with the same cards. */
export default function PracticePage(): never {
  redirect("/");
}
