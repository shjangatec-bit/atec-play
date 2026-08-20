import { redirect } from "next/navigation";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import NewClubRequestForm from "./NewClubRequestForm";

export default async function NewClubRequestPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");
  if (!hasPermission(permissions, "CLUB_CREATE_REQUEST")) redirect("/clubs");

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/clubs" />
      <div className="main" style={{ maxWidth: 480, margin: "40px auto" }}>
        <NewClubRequestForm userId={authUser.id} />
      </div>
    </div>
  );
}
