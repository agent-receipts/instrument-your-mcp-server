// ToolGuard: the checks your tools/call handler runs, in your own process.
//
// Call guardToolCall() before you dispatch a tool, and guardToolResponse()
// on what the tool returned, before it goes back to the model. Both are
// plain async calls: no proxy, no transport, nothing to deploy.
//
// guardToolCall checks, in order: the deny-list, your policy, approval for
// sensitive tools, then the rate limit. Every decision says which stage
// made it. Anything that throws is a denial (fail closed). Each call and
// each response is written to the audit sink, with parameters redacted.
//
// The pipeline's shape follows Microsoft's Agent Governance Toolkit
// (agent_os/mcp_gateway.py); no code was copied.

export type Stage =
  | "deny_list"
  | "runtime"
  | "approval_pending"
  | "approval_denied"
  | "approval_error"
  | "rate_limit"
  | "allowed"
  | "error";

export interface GuardDecision {
  allowed: boolean;
  reason: string;
  stage: Stage;
}

export interface ThreatMatch {
  category: string;
  description: string;
}

export interface ResponseDecision {
  allowed: boolean;
  reason: string;
  content: string | null;
  threats: ThreatMatch[];
  action: "allowed" | "logged" | "sanitized" | "blocked" | "error";
}

export interface AuditEntry {
  timestamp: number;
  agentId: string;
  toolName: string;
  direction: "request" | "response";
  parameters?: Record<string, unknown>;
  allowed: boolean;
  reason: string;
  stage?: Stage;
  threats?: string[];
  /** Links this entry to a record kept upstream (a proxy, say) for the same
   *  call. A join key only: it comes from outside, so never decide on it. */
  correlationId?: string;
}

export interface AuditSink {
  record(entry: AuditEntry): void;
}

export interface RateLimitStore {
  getCount(agentId: string): number;
  increment(agentId: string): void;
  reset(agentId: string): void;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

export interface PolicyRuntime {
  evaluatePreToolCall(input: {
    agentId: string;
    toolName: string;
    args: Record<string, unknown>;
    callId: string;
  }): PolicyResult | Promise<PolicyResult>;
}

export interface ScanResult {
  safe: boolean;
  threats: ThreatMatch[];
}

export interface ResponseScanner {
  scan(content: string, toolName: string): ScanResult | Promise<ScanResult>;
  /** Only needed when responsePolicy is "sanitize". */
  sanitize?(content: string, toolName: string): { sanitized: string; removed: ThreatMatch[] };
}

export type ApprovalCallback = (
  agentId: string,
  toolName: string,
  params: Record<string, unknown>,
) => "approved" | "denied" | Promise<"approved" | "denied">;

export type ResponsePolicy = "block" | "sanitize" | "log";

/** The default store: a count per caller that never resets. A quota, not a
 *  rate limit (step 1 writes the real one). */
export class InMemoryRateLimitStore implements RateLimitStore {
  private counts = new Map<string, number>();
  getCount(agentId: string): number {
    return this.counts.get(agentId) ?? 0;
  }
  increment(agentId: string): void {
    this.counts.set(agentId, this.getCount(agentId) + 1);
  }
  reset(agentId: string): void {
    this.counts.set(agentId, 0);
  }
}

/** The default sink: keeps entries in memory, so nothing is written down. */
export class InMemoryAuditSink implements AuditSink {
  readonly entries: AuditEntry[] = [];
  record(entry: AuditEntry): void {
    this.entries.push(entry);
  }
}

export interface ToolGuardOptions {
  runtime: PolicyRuntime;
  deniedTools?: string[];
  sensitiveTools?: string[];
  approvalCallback?: ApprovalCallback;
  rateLimit?: number;
  rateLimitStore?: RateLimitStore;
  auditSink?: AuditSink;
  /** null, or left out: responses aren't scanned. */
  responseScanner?: ResponseScanner | null;
  responsePolicy?: ResponsePolicy;
  /** Applied to what's written to the audit sink only. Policy sees the
   *  real parameters. */
  redact?: (params: Record<string, unknown>) => Record<string, unknown>;
  clock?: () => number;
}

export class ToolGuard {
  private readonly runtime: PolicyRuntime;
  private readonly deniedTools: Set<string>;
  private readonly sensitiveTools: Set<string>;
  private readonly approvalCallback?: ApprovalCallback;
  private readonly rateLimit: number;
  private readonly rateLimitStore: RateLimitStore;
  private readonly auditSink: AuditSink;
  private readonly responseScanner: ResponseScanner | null;
  private readonly responsePolicy: ResponsePolicy;
  private readonly redact: (params: Record<string, unknown>) => Record<string, unknown>;
  private readonly clock: () => number;
  private calls = 0;

  constructor(opts: ToolGuardOptions) {
    this.runtime = opts.runtime;
    this.deniedTools = new Set(opts.deniedTools ?? []);
    this.sensitiveTools = new Set(opts.sensitiveTools ?? []);
    this.approvalCallback = opts.approvalCallback;
    this.rateLimit = opts.rateLimit ?? 100;
    this.rateLimitStore = opts.rateLimitStore ?? new InMemoryRateLimitStore();
    this.auditSink = opts.auditSink ?? new InMemoryAuditSink();
    this.responseScanner = opts.responseScanner ?? null;
    this.responsePolicy = opts.responsePolicy ?? "block";
    this.redact = opts.redact ?? ((params) => params);
    this.clock = opts.clock ?? (() => Date.now());
  }

  async guardToolCall(
    agentId: string,
    toolName: string,
    params: Record<string, unknown>,
    correlationId?: string,
  ): Promise<GuardDecision> {
    let decision: GuardDecision;
    try {
      decision = await this.evaluate(agentId, toolName, params);
    } catch {
      decision = { allowed: false, reason: "Internal guard error, access denied (fail closed)", stage: "error" };
    }

    this.auditSink.record({
      timestamp: this.clock(),
      agentId,
      toolName,
      direction: "request",
      parameters: this.redact(params),
      allowed: decision.allowed,
      reason: decision.reason,
      stage: decision.stage,
      correlationId,
    });
    return decision;
  }

  private async evaluate(agentId: string, toolName: string, params: Record<string, unknown>): Promise<GuardDecision> {
    if (this.deniedTools.has(toolName)) {
      return { allowed: false, reason: `Tool '${toolName}' is on the deny list`, stage: "deny_list" };
    }

    let result: PolicyResult;
    try {
      result = await this.runtime.evaluatePreToolCall({
        agentId,
        toolName,
        args: params,
        callId: `mcp-${this.calls + 1}`,
      });
    } catch {
      return { allowed: false, reason: "Policy runtime error, access denied (fail closed)", stage: "error" };
    }
    if (!result.allowed) {
      return { allowed: false, reason: result.reason ?? "Runtime denied tool call", stage: "runtime" };
    }

    if (this.sensitiveTools.has(toolName)) {
      if (!this.approvalCallback) {
        return { allowed: false, reason: "Awaiting human approval", stage: "approval_pending" };
      }
      let status: "approved" | "denied";
      try {
        status = await this.approvalCallback(agentId, toolName, params);
      } catch {
        return { allowed: false, reason: "Approval callback error, access denied (fail closed)", stage: "approval_error" };
      }
      if (status !== "approved") {
        return { allowed: false, reason: "Human approval denied", stage: "approval_denied" };
      }
    }

    // Only calls that got this far count towards the limit.
    if (this.rateLimitStore.getCount(agentId) >= this.rateLimit) {
      return { allowed: false, reason: `Agent '${agentId}' exceeded call budget (${this.rateLimit})`, stage: "rate_limit" };
    }
    this.rateLimitStore.increment(agentId);
    this.calls += 1;
    return { allowed: true, reason: "Allowed by runtime", stage: "allowed" };
  }

  async guardToolResponse(
    agentId: string,
    toolName: string,
    responseContent: unknown,
    correlationId?: string,
  ): Promise<ResponseDecision> {
    const text = typeof responseContent === "string" ? responseContent : safeStringify(responseContent);
    const decision = await this.checkResponse(text, toolName);

    // The response itself is never written down, only what was found in it.
    this.auditSink.record({
      timestamp: this.clock(),
      agentId,
      toolName,
      direction: "response",
      allowed: decision.allowed,
      reason: decision.reason,
      threats: decision.threats.map((t) => t.category),
      correlationId,
    });
    return decision;
  }

  private async checkResponse(text: string, toolName: string): Promise<ResponseDecision> {
    const scanner = this.responseScanner;
    if (!scanner) {
      return { allowed: true, reason: "No response scanner configured", content: text, threats: [], action: "allowed" };
    }

    let scan: ScanResult;
    try {
      scan = await scanner.scan(text, toolName);
    } catch {
      return { allowed: false, reason: "Response scanner error, blocked (fail closed)", content: null, threats: [], action: "error" };
    }
    if (scan.safe) {
      return { allowed: true, reason: "Response clean", content: text, threats: [], action: "allowed" };
    }

    const threats = scan.threats;
    if (this.responsePolicy === "log") {
      return { allowed: true, reason: `Response has ${threats.length} threat(s), logged`, content: text, threats, action: "logged" };
    }

    if (this.responsePolicy === "sanitize") {
      if (!scanner.sanitize) {
        return { allowed: false, reason: "Response blocked: no sanitizer available (fail closed)", content: null, threats, action: "blocked" };
      }
      const { sanitized } = scanner.sanitize(text, toolName);
      // Scan the sanitized text again rather than trust the sanitizer.
      let clean = false;
      try {
        clean = (await scanner.scan(sanitized, toolName)).safe;
      } catch {
        clean = false;
      }
      if (!clean) {
        return { allowed: false, reason: "Response blocked: sanitization incomplete (fail closed)", content: null, threats, action: "blocked" };
      }
      return { allowed: true, reason: `Response sanitized: ${threats.length} threat(s) removed`, content: sanitized, threats, action: "sanitized" };
    }

    const categories = [...new Set(threats.map((t) => t.category))].sort();
    return { allowed: false, reason: `Response blocked: ${categories.join(", ")} detected`, content: null, threats, action: "blocked" };
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
