import CampusCopilotDashboard, {
  type CampusCopilotPayload,
} from "../components/campus-copilot-dashboard";

const initialPayload: CampusCopilotPayload = {
  taskName: "No tasks on list",
  execution_results: {},
};

export default function HomePage() {
  return <CampusCopilotDashboard initialPayload={initialPayload} />;
}
