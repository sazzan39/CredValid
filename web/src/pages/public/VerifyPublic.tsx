import { useParams } from "react-router-dom";
import { useMode } from "@/app/AppProvider";
import { VerifyHeader, VerifyPanel } from "@/components/app/verification";

export function VerifyPublic() {
  const { id } = useParams();
  const mode = useMode();
  return (
    <div className="bg-bg">
      <div className="mx-auto max-w-[760px] px-4 pb-20 pt-14 sm:px-6">
        <VerifyHeader />
        <VerifyPanel key={`${mode}-${id ?? ""}`} initialId={id} verifierLabel="Public verifier" linkBase="/verify" />
        <p className="mt-6 text-center text-[13px] text-muted">No account needed. Credential files are checked in your browser and never uploaded.</p>
      </div>
    </div>
  );
}
