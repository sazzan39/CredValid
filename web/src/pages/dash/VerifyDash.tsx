import { useParams } from "react-router-dom";
import { useMode } from "@/app/AppProvider";
import { VerifyHeader, VerifyPanel } from "@/components/app/verification";

export function VerifyDash() {
  const { id } = useParams();
  const mode = useMode();
  return (
    <div className="mx-auto max-w-[760px] pt-2">
      <VerifyHeader />
      <VerifyPanel key={`${mode}-${id ?? ""}`} initialId={id} verifierLabel="Dashboard user" linkBase="/app/verify" />
    </div>
  );
}
