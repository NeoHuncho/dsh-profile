/**
 * Parent-owned lifecycle safety net.
 *
 * AgentLoop normally owns the top-level disposal transaction, while ACP and
 * other host-owned drivers may have their own close path. This listener gives
 * every agent one final, parent-scoped cleanup boundary: before the parent is
 * removed from the live registry, stop all resident continuable descendants
 * and await their child-first release.
 *
 * The cleanup is attached to `agent/turn-stopping`, because that is the awaited
 * lifecycle boundary. `agent/disposed` is deliberately only an observation
 * event: its async listeners are fire-and-forget and cannot protect shutdown.
 */

export const name = 'dsh-agent-lifecycle-cleanup'
export const inject = ['subagents']

export function apply(ctx) {
  const inFlight = new WeakMap()

  /**
   * Stop both kinds of model children:
   *
   * - continuable children are owned by the subagent activation registry;
   * - one-shot background children are owned by the jobs registry.
   *
   * The jobs API is optional in deployments that do not load background jobs.
   */
  async function cleanupChildren(agent) {
    const jobs = ctx.get('jobs')
    let backgroundJobs = []
    if (jobs !== undefined) {
      backgroundJobs = jobs
        .list(agent)
        .filter((job) => job.kind === 'subagent' && (job.status === 'running' || job.status === 'stopping'))
    }

    let durableDescendants = []
    try {
      durableDescendants = await ctx.subagents.listDescendants(agent.id)
    } catch (error) {
      ctx.logger.warn(
        `agent lifecycle cleanup: could not inspect descendants of "${agent.id}": ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    if (durableDescendants.length > 0 || backgroundJobs.length > 0) {
      ctx.logger.info(
        `agent lifecycle cleanup: ${agent.id} is finishing with ${durableDescendants.length} descendant(s) and ${backgroundJobs.length} background job(s)`,
      )
    }

    // This closes continuable admission below the exact live parent before
    // releasing the resident forest child-first.
    await ctx.subagents.drainContinuableDescendants([agent])

    if (jobs === undefined) return
    for (const job of backgroundJobs) {
      try {
        jobs.kill(job.id, agent, `parent agent "${agent.id}" finished`)
      } catch (error) {
        ctx.logger.warn(
          `agent lifecycle cleanup: could not stop background job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    // Cancellation is immediate, but waiting briefly makes the invariant
    // observable: the parent does not finish while a cooperative child job is
    // still reported as live. The bound prevents a stuck producer from holding
    // the parent forever.
    await Promise.all(backgroundJobs.map(async (job) => {
      try {
        await jobs.wait(job.id, 3000, agent)
      } catch (error) {
        ctx.logger.warn(
          `agent lifecycle cleanup: background job ${job.id} did not settle before parent shutdown: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }))
  }

  ctx.on('agent/turn-stopping', async ({ agent }) => {
    if (!agent || inFlight.has(agent)) return
    const previous = inFlight.get(agent)
    if (previous !== undefined) return previous

    // Do not let a cancelled turn skip the final inventory. The cleanup itself
    // is the shutdown action, and the event's signal only belongs to the turn
    // that is closing.
    const cleanup = cleanupChildren(agent).catch((error) => {
      // Never turn cleanup diagnostics into a failed parent turn. The parent
      // still finishes, while the exact failure remains visible in host logs.
      ctx.logger.warn(
        `agent lifecycle cleanup: children of "${agent.id}" did not fully stop: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
    inFlight.set(agent, cleanup)
    try {
      await cleanup
    } finally {
      inFlight.delete(agent)
    }
  })
}
