import { samples } from "@/lib/samples";
import SimulateForm from "./SimulateForm";

export default function Simulate() {
  return (
    <>
      <h1>Test a call</h1>
      <p className="sub">
        Runs a transcript through the same steps as a live call: structuring, the five criteria, the route, the call log and
        Telegram. Test calls are labelled and never reach HubSpot.
      </p>
      <SimulateForm samples={samples} />
    </>
  );
}
