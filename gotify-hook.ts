import type { Plugin, Event } from "@opencode-ai/plugin"

const ATTENTION_EVENTS: Event["type"][] = [
	"question.asked",
	"question.rejected",
	"permission.asked",
	"session.error",
	"session.deleted",
	"session.diff",
	"worktree.failed",
	"mcp.browser.open.failed",
	"pty.exited",
	"vcs.branch.updated",
	"session.created",
	"session.idle",
]

function getNotificationTitle(eventType: Event["type"]): string {
	const titles: Record<string, string> = {
		"question.asked": "Question Asked",
		"question.rejected": "Question Rejected",
		"permission.asked": "Permission Request",
		"session.error": "Session Error",
		"session.deleted": "Session Deleted",
		"session.diff": "Session Diff",
		"worktree.failed": "Worktree Failed",
		"mcp.browser.open.failed": "Browser Failed",
		"pty.exited": "Terminal Exited",
		"vcs.branch.updated": "Branch Updated",
		"session.created": "Session Created",
		"session.idle": "Agent Idle",
	}
	return titles[eventType] || eventType
}

function getMessage(event: Event): string {
	switch (event.type) {
		case "question.asked":
			return event.properties.questions[0]?.question || "A question needs your attention"
		case "question.rejected":
			return `Question ${event.properties.requestID} was rejected`
		case "permission.asked":
			return `Permission requested: ${event.properties.action} ${event.properties.permission}`
		case "session.error":
			return event.properties.error?.message || "An error occurred in the session"
		case "session.deleted":
			return "A session was deleted"
		case "session.diff":
			return `${event.properties.diff.length} file(s) changed`
		case "worktree.failed":
			return event.properties.message
		case "mcp.browser.open.failed":
			return "Failed to open browser"
		case "pty.exited":
			return `Terminal exited with code ${event.properties.exitCode}`
		case "vcs.branch.updated":
			return `Branch changed to: ${event.properties.branch}`
		case "session.created":
			return `New session created: ${event.properties.info.name}`
		case "session.idle":
			return "Agent is idle and waiting"
		default:
			return `Event: ${event.type}`
	}
}

function getPriority(eventType: Event["type"]): number {
	const highPriority = ["session.error", "worktree.failed", "mcp.browser.open.failed", "pty.exited"]
	const mediumPriority = ["question.asked", "permission.asked", "session.deleted", "session.idle"]

	if (highPriority.includes(eventType)) return 7
	if (mediumPriority.includes(eventType)) return 5
	return 3
}

export const GotifyHookPlugin: Plugin = async ({ client }) => {
	const GOTIFY_URL = process.env.GOTIFY_URL
	const GOTIFY_TOKEN = process.env.GOTIFY_TOKEN
	const parsedMinPriority = parseInt(process.env.GOTIFY_MIN_PRIORITY || "5", 10)
	const GOTIFY_MIN_PRIORITY = isNaN(parsedMinPriority) ? 5 : parsedMinPriority

	return {
		event: async ({ event }) => {
			if (!GOTIFY_URL || !GOTIFY_TOKEN) {
				await client.app.log({
					body: {
						service: "gotify-plugin",
						level: "error",
						message: "GOTIFY_URL or GOTIFY_TOKEN not set in environment variables"
					}
				})
				return
			}
			if (!ATTENTION_EVENTS.includes(event.type)) return

			const priority = getPriority(event.type)
			if (priority < GOTIFY_MIN_PRIORITY) {
				await client.app.log({
					body: {
						service: "gotify-plugin",
						level: "info",
						message: `Skipping notification for ${event.type} (priority ${priority} < min ${GOTIFY_MIN_PRIORITY})`
					}
				})
				return
			}

			try {
				await fetch(GOTIFY_URL, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Gotify-Key": GOTIFY_TOKEN
					},
					body: JSON.stringify({
						title: getNotificationTitle(event.type),
						message: getMessage(event),
						priority
					})
				})

				await client.app.log({
					body: {
						service: "gotify-plugin",
						level: "info",
						message: `Notification sent to Gotify for ${event.type}`
					}
				})
			} catch (error) {
				await client.app.log({
					body: {
						service: "gotify-plugin",
						level: "error",
						message: `Failed to send Gotify notification: ${error}`
					}
				})
			}
		}
	}
}
