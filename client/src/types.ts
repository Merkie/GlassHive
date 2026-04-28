// Wire shapes shared with the server. The single source of truth lives in
// /shared/contracts.ts; this module just re-exports so existing client
// imports keep working.
export type {
  Post,
  CommentNode,
  Snapshot,
  Participant,
  AgentResult,
  Totals,
  SimulationResult,
  RunRecord,
  RunSettings,
  SimulationMode,
  VoteResult,
  ActivityEvent as Activity,
  ActivityEvent,
  RunStreamEvent,
  RunStreamEventMap,
  RunStreamEventName,
} from "../../shared/contracts";
