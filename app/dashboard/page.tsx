import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/supabase/server";
import { signOut } from "@/lib/supabase/actions";

// Placeholder — the full dashboard (analytics + AI panel) is built in U7.
// This stub exists so U2's auth gate has a protected route to redirect to.
export default async function DashboardPage() {
  const user = await getVerifiedUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="p-8">
      <p>Signed in as {user.email}.</p>
      <form action={signOut}>
        <button type="submit" className="mt-4 underline">
          Log out
        </button>
      </form>
    </div>
  );
}
