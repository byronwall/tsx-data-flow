import * as TypeScript from "typescript";
import {
  calleeName,
  externalServiceCallKind,
  isExit,
  isFileOperation,
  isHttpResponse,
  isNetworkOperation,
  outputKind,
  proof,
  staticMethod,
  staticTarget,
} from "./program-evidence-support";
import type {
  EvidenceConfidence,
  ProgramElementKind,
  ProgramEvidenceLocation,
  ProgramOperationKind,
  ProgramProof,
  ProgramProofKind,
  ProgramRelationKind,
} from "./program-evidence";
import type { HttpBridgeFetch, HttpBridgeResponse } from "./http-bridge-evidence";

type Attributes = Record<string, string | number | boolean | null>;

export type ProgramEvidenceBoundaryContext = {
  ts: typeof TypeScript;
  checker: TypeScript.TypeChecker;
  node: TypeScript.CallExpression;
  callId: string;
  ownerId: string | null;
  location: (node: TypeScript.Node) => ProgramEvidenceLocation;
  moduleFor: (node: TypeScript.Node) => string | null;
  isExternalCall: (node: TypeScript.CallExpression) => boolean;
  specialInput: (
    node: TypeScript.Node,
    kind: ProgramElementKind,
    ownerId: string | null,
    attributes: Attributes,
    proofKind: ProgramProofKind,
    detail: string,
    operationKind?: ProgramOperationKind | null,
  ) => string;
  effect: (
    node: TypeScript.CallExpression,
    callId: string,
    ownerId: string | null,
    effectKind: string,
    detail: string,
  ) => void;
  addRelation: (
    from: string,
    to: string,
    kind: ProgramRelationKind,
    locations: ProgramEvidenceLocation[],
    proof: ProgramProof,
    confidence: EvidenceConfidence,
  ) => void;
  expression: (node: TypeScript.Expression, ownerId: string | null) => string;
  gap: (
    from: string,
    direction: "forward" | "backward",
    reason: "external-code",
    detail: string,
    node: TypeScript.Node,
  ) => void;
  addHttpFetch: (fetch: HttpBridgeFetch) => void;
  addHttpResponse: (response: HttpBridgeResponse) => void;
};

/** Collect host, external, resource, and HTTP boundary facts for one call. */
export function processProgramCallBoundary(
  context: ProgramEvidenceBoundaryContext,
): void {
  const { ts, node, callId, ownerId } = context;
  const name = calleeName(ts, node.expression);
  const module = context.moduleFor(node.expression);
  const fileRead = isFileOperation(module, name, "read");
  const fileWrite = isFileOperation(module, name, "write");
  const stream = outputKind(name, node);
  if (name === "fetch" || isNetworkOperation(module, name)) {
    const inputId = context.specialInput(
      node,
      "fetch-input",
      ownerId,
      { method: staticMethod(node), target: staticTarget(node) },
      "host-api",
      "The call is a source-backed network input occurrence.",
    );
    context.addRelation(
      callId,
      inputId,
      "input-call",
      [context.location(node)],
      proof(
        "host-api",
        "The fetch or HTTP client call is the exact input boundary.",
        [context.location(node)],
      ),
      "proven",
    );
    context.addRelation(
      inputId,
      callId,
      "carrier",
      [context.location(node)],
      proof(
        "carrier-boundary",
        "The compiler-resolved network call has one exact forward carrier endpoint.",
        [context.location(node)],
      ),
      "proven",
    );
    if (name === "fetch") context.addHttpFetch({ node, elementId: inputId, ownerId });
    context.gap(
      inputId,
      "forward",
      "external-code",
      "Static proof stops at the external response body; any response-to-resource handoff is runtime-only and remains unproven.",
      node,
    );
    context.effect(node, callId, ownerId, "network-request", "The network request leaves the analyzed source tree.");
  } else if (fileRead) {
    const inputId = context.specialInput(
      node,
      "file-input",
      ownerId,
      { operation: name, module },
      "host-api",
      "The compiler-resolved filesystem call is a file input.",
    );
    context.addRelation(
      callId,
      inputId,
      "input-call",
      [context.location(node)],
      proof(
        "host-api",
        "The filesystem call is the exact file input boundary.",
        [context.location(node)],
      ),
      "proven",
    );
    context.addRelation(
      inputId,
      callId,
      "carrier",
      [context.location(node)],
      proof(
        "carrier-boundary",
        "The compiler-resolved filesystem call has one exact forward carrier endpoint.",
        [context.location(node)],
      ),
      "proven",
    );
  } else if (fileWrite) {
    const writeId = context.specialInput(
      node,
      "file-write",
      ownerId,
      { operation: name, module },
      "host-api",
      "The compiler-resolved filesystem call is a file write terminal.",
    );
    context.effect(node, callId, ownerId, "filesystem-write", "The filesystem write is an external side effect.");
    context.addRelation(
      callId,
      writeId,
      "effect-input",
      [context.location(node)],
      proof(
        "host-api",
        "The filesystem call identifies the write terminal.",
        [context.location(node)],
      ),
      "proven",
    );
  } else if (stream) {
    const terminalId = context.specialInput(
      node,
      stream,
      ownerId,
      { operation: name },
      "host-api",
      "The host console or process stream is an output terminal.",
    );
    context.effect(node, callId, ownerId, stream, "The host output call is an external side effect.");
    context.addRelation(
      callId,
      terminalId,
      "effect-input",
      [context.location(node)],
      proof("host-api", "The output API identifies the terminal.", [context.location(node)]),
      "proven",
    );
  } else if (isExit(name, node)) {
    const terminalId = context.specialInput(
      node,
      "exit-status",
      ownerId,
      { operation: name },
      "host-api",
      "The process exit API is an exit-status terminal.",
    );
    context.effect(node, callId, ownerId, "exit-status", "The process exit call is an external side effect.");
    context.addRelation(
      callId,
      terminalId,
      "effect-input",
      [context.location(node)],
      proof(
        "host-api",
        "The process exit API identifies the terminal.",
        [context.location(node)],
      ),
      "proven",
    );
  } else if (isHttpResponse(ts, node, context.checker)) {
    const terminalId = context.specialInput(
      node,
      "http-response",
      ownerId,
      { operation: name },
      "host-api",
      "The response API identifies an HTTP response terminal.",
    );
    context.addHttpResponse({ node, elementId: terminalId, ownerId });
    const body = node.arguments[0];
    if (body) {
      context.addRelation(
        context.expression(body, ownerId),
        terminalId,
        "carrier",
        [context.location(body), context.location(node)],
        proof(
          "carrier-boundary",
          "The exact Response.json body is connected to its HTTP response endpoint.",
          [context.location(body), context.location(node)],
        ),
        "proven",
      );
    }
    context.addRelation(
      callId,
      terminalId,
      "effect-input",
      [context.location(node)],
      proof(
        "host-api",
        "The response parameter and method provide HTTP response evidence.",
        [context.location(node)],
      ),
      "proven",
    );
  } else {
    const serviceCallKind = externalServiceCallKind(ts, context.checker, node);
    if (serviceCallKind === "external-read") {
      const readId = context.specialInput(
        node,
        "external-read",
        ownerId,
        { operation: name },
        "compiler-symbol",
        "The compiler-resolved service method has a source-backed contract without an in-project implementation.",
      );
      context.addRelation(
        callId,
        readId,
        "input-call",
        [context.location(node)],
        proof(
          "compiler-symbol",
          "The service contract identifies this call as an external read boundary.",
          [context.location(node)],
        ),
        "proven",
      );
    } else if (serviceCallKind === "message") {
      const messageId = context.specialInput(
        node,
        "message",
        ownerId,
        { operation: name },
        "compiler-symbol",
        "The compiler-resolved service method has a source-backed message contract without an in-project implementation.",
      );
      context.addRelation(
        callId,
        messageId,
        "effect-input",
        [context.location(node)],
        proof(
          "compiler-symbol",
          "The service contract identifies this call as a message terminal.",
          [context.location(node)],
        ),
        "proven",
      );
    } else if (context.isExternalCall(node)) {
      context.effect(node, callId, ownerId, "external-effect", "The call resolves outside the analyzed source tree.");
    }
  }
}
