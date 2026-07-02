/**
 * @agentic/shared-types
 *
 * Shared types between the mobile app and the sidecar. The event protocol
 * mirrors @cline/sdk's AgentRuntimeEvent union, simplified for our transport.
 *
 * See: docs/architecture.md § "The event protocol"
 */

export * from './events';
export * from './tools';
export * from './byok';
export * from './session';
