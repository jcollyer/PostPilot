/** How far ahead the scheduler materializes PublishTasks, in days. */
export const HORIZON_DAYS = Number(process.env.QUEUE_HORIZON_DAYS ?? 21);

/** Hard cap on slots materialized per recompute (safety valve). */
export const MAX_SLOTS = Number(process.env.QUEUE_MAX_SLOTS ?? 120);

/** Step between appended float positions, leaving room to insert between. */
export const POSITION_STEP = 1000;
